/**
 * 职位与推荐 Callable：从 Adzuna API 拉取，按用户期望职位（必填）、地址（可选）查询
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { computeMatchRates } from "../ai/gemini";
import { searchAdzunaJobs, adzunaJobToAppJob } from "../services/adzuna";
import { COLLECTIONS } from "../schema";
import { getDb, requireAuth, toApi } from "./helpers";

export const jobRecommendations = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const limit = Math.min(Number(data?.limit) || 20, 50);
  const cursor = data?.cursor ?? null;
  const page = cursor ? Math.max(1, Number(cursor)) : 1;

  let headline = (data?.headline as string) ?? "";
  let location = (data?.location as string) ?? "";

  if (!String(headline).trim()) {
    const userRef = getDb().collection(COLLECTIONS.USERS).doc(uid);
    const userSnap = await userRef.get();
    const profile = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
    headline = (profile.headline as string) ?? "";
    location = (profile.location as string) ?? location;
  }

  const whatTrim = String(headline || "").trim();
  const salaryMin = data?.salaryMin != null ? Number(data.salaryMin) : undefined;
  const salaryMax = data?.salaryMax != null ? Number(data.salaryMax) : undefined;
  const fullTime = data?.fullTime === true;
  const permanent = data?.permanent === true;
  const whatExclude = typeof data?.whatExclude === "string" ? data.whatExclude.trim() || undefined : undefined;
  const sortBy = ["relevance", "salary", "date"].includes(String(data?.sortBy ?? "")) ? (data.sortBy as "relevance" | "salary" | "date") : undefined;

  functions.logger.info("jobRecommendations", {
    uid,
    what: whatTrim,
    where: location.trim() || "(无)",
    salaryMin,
    salaryMax,
    fullTime,
    permanent,
    sortBy,
  });

  if (!whatTrim) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "请先填写期望职位（在「我的在线简历」- 基本信息中填写）"
    );
  }

  let results: Awaited<ReturnType<typeof searchAdzunaJobs>>["results"];
  try {
    const out = await searchAdzunaJobs({
      what: whatTrim,
      where: location.trim() || undefined,
      whatExclude,
      salaryMin: salaryMin != null && !Number.isNaN(salaryMin) ? salaryMin : undefined,
      salaryMax: salaryMax != null && !Number.isNaN(salaryMax) ? salaryMax : undefined,
      fullTime: fullTime || undefined,
      permanent: permanent || undefined,
      sortBy,
      page,
      resultsPerPage: limit,
    });
    results = out.results;
    functions.logger.info("jobRecommendations Adzuna response", {
      totalCount: out.totalCount,
      resultsCount: results.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    functions.logger.warn("Adzuna API failed", { error: msg });
    const isAuthFail = /401|AUTH_FAIL|Authorisation failed/i.test(msg);
    const hint = isAuthFail
      ? "Adzuna 鉴权失败：请在 Firebase 配置中设置 ADZUNA_APP_ID 与 ADZUNA_APP_KEY，且必须是 Adzuna 后台提供的两个不同值（见 https://developer.adzuna.com/）。"
      : "拉取职位失败，请稍后重试。若持续失败请检查 Adzuna 配置：" + msg.slice(0, 80);
    throw new functions.https.HttpsError("internal", hint);
  }

  const jobsRef = getDb().collection(COLLECTIONS.JOBS);
  const userRef = getDb().collection(COLLECTIONS.USERS).doc(uid);
  const items: Array<{ job: Record<string, unknown>; score: number; currentMatch: number; aiMatch: number; appliedApplicationId?: string }> = [];

  /** Firestore 不接受 undefined，写入前去掉 undefined 字段 */
  const withoutUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = v;
    }
    return out;
  };

  for (const adzunaJob of results) {
    const appJob = adzunaJobToAppJob(adzunaJob);
    const docId = appJob.id as string;
    const docData = withoutUndefined({ ...appJob, updatedAt: new Date().toISOString() });
    await jobsRef.doc(docId).set(docData, { merge: true });
    items.push({
      job: toApi({ ...appJob }),
      score: 75,
      currentMatch: 75,
      aiMatch: 88,
    });
  }

  try {
    const userSnap = await userRef.get();
    const profile = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
    const jobInfos = items.map((it) => ({
      title: (it.job.title as string) ?? "",
      description: (it.job.description as string) ?? "",
    }));
    const rates = await computeMatchRates(profile, jobInfos);
    rates.forEach((r, i) => {
      if (items[i]) {
        items[i].currentMatch = r.currentMatch;
        items[i].aiMatch = r.aiMatch;
        items[i].score = r.currentMatch;
      }
    });
  } catch (err) {
    functions.logger.warn("computeMatchRates failed", { error: err instanceof Error ? err.message : String(err) });
  }

  // 查当前用户在本页职位上的申请，用于列表/详情展示「已申请」并持久化
  const jobIds = items.map((it) => (it.job.id as string) ?? "").filter(Boolean);
  const jobIdToAppId: Record<string, string> = {};
  if (jobIds.length > 0) {
    const appRef = userRef.collection(COLLECTIONS.APPLICATIONS);
    const chunkSize = 10;
    for (let i = 0; i < jobIds.length; i += chunkSize) {
      const chunk = jobIds.slice(i, i + chunkSize);
      const q = await appRef.where("jobId", "in", chunk).get();
      q.docs.forEach((d) => {
        const data = d.data() as { jobId?: string };
        if (data.jobId) jobIdToAppId[data.jobId] = d.id;
      });
    }
    items.forEach((it) => {
      const jid = (it.job.id as string) ?? "";
      if (jobIdToAppId[jid]) it.appliedApplicationId = jobIdToAppId[jid];
    });
  }

  const nextCursor = results.length >= limit ? String(page + 1) : null;
  functions.logger.info("jobRecommendations return", { itemsCount: items.length, hasMore: results.length >= limit });
  return { items, nextCursor, hasMore: results.length >= limit };
});

export const jobsList = functions.https.onCall(async (data, context) => {
  requireAuth(context);
  const limit = Math.min(Number(data?.limit) || 20, 100);
  const cursor = data?.cursor ?? null;
  const ref = getDb().collection(COLLECTIONS.JOBS);
  let q: admin.firestore.Query = ref.orderBy("postedAt", "desc").limit(limit + 1);
  if (cursor) {
    const cursorDoc = await ref.doc(cursor).get();
    if (!cursorDoc.exists) return { items: [], nextCursor: null, hasMore: false };
    q = q.startAfter(cursorDoc);
  }
  const snapshot = await q.get();
  const docs = snapshot.docs.slice(0, limit);
  const items = docs.map((d) => ({ job: toApi({ id: d.id, ...d.data() } as Record<string, unknown>) }));
  const nextCursor = snapshot.docs.length > limit ? docs[docs.length - 1].id : null;
  return { items, nextCursor, hasMore: snapshot.docs.length > limit };
});

export const jobGet = functions.https.onCall(async (data, context) => {
  requireAuth(context);
  const jobId = data?.jobId;
  if (!jobId) throw new functions.https.HttpsError("invalid-argument", "缺少 jobId");
  const doc = await getDb().collection(COLLECTIONS.JOBS).doc(jobId).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "职位不存在");
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});
