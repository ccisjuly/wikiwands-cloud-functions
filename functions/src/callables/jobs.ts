/**
 * 职位与推荐 Callable：从 Adzuna API 拉取，按用户期望职位（必填）、地址（可选）查询
 * 优化：Adzuna 结果短期缓存、并行写入、复用 profile、匹配率与申请查询并行
 */
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as functions from "firebase-functions/v1";
import { computeMatchRates } from "../ai/gemini";
import { searchAdzunaJobs, adzunaJobToAppJob } from "../services/adzuna";
import type { AdzunaJob } from "../services/adzuna";
import { COLLECTIONS } from "../schema";
import { getDb, requireAuth, toApi } from "./helpers";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟

function jobRecommendationCacheKey(params: {
  what: string;
  where?: string;
  page: number;
  limit: number;
  salaryMin?: number;
  salaryMax?: number;
  fullTime: boolean;
  permanent: boolean;
  sortBy?: string;
  whatExclude?: string;
}): string {
  const payload = JSON.stringify(params);
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export const jobRecommendations = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const limit = Math.min(Number(data?.limit) || 20, 50);
  const cursor = data?.cursor ?? null;
  const page = cursor ? Math.max(1, Number(cursor)) : 1;

  const userRef = getDb().collection(COLLECTIONS.USERS).doc(uid);
  let profile: Record<string, unknown> = {};
  let headline = (data?.headline as string) ?? "";
  let location = (data?.location as string) ?? "";

  if (!String(headline).trim()) {
    const userSnap = await userRef.get();
    profile = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
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
    where: location.trim() || "(none)",
    salaryMin,
    salaryMax,
    fullTime,
    permanent,
    sortBy,
  });

  if (!whatTrim) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Please fill in your desired job title in Resumes → Online resume first."
    );
  }

  const cacheKey = jobRecommendationCacheKey({
    what: whatTrim,
    where: location.trim() || undefined,
    page,
    limit,
    salaryMin: salaryMin != null && !Number.isNaN(salaryMin) ? salaryMin : undefined,
    salaryMax: salaryMax != null && !Number.isNaN(salaryMax) ? salaryMax : undefined,
    fullTime,
    permanent,
    sortBy,
    whatExclude,
  });

  const cacheRef = getDb().collection(COLLECTIONS.JOB_RECOMMENDATION_CACHE).doc(cacheKey);
  const cacheSnap = await cacheRef.get();
  const now = Date.now();
  const cachedAt = (cacheSnap.exists ? (cacheSnap.data() as { cachedAt?: string })?.cachedAt : undefined)
    ? new Date((cacheSnap.data() as { cachedAt: string }).cachedAt).getTime()
    : 0;
  const cacheHit = cacheSnap.exists && now - cachedAt < CACHE_TTL_MS;

  let results: AdzunaJob[];
  let totalCount: number;

  if (cacheHit && cacheSnap.exists) {
    const cached = cacheSnap.data() as { results?: string; totalCount?: number };
    try {
      results = (typeof cached.results === "string" ? JSON.parse(cached.results) : cached.results) ?? [];
      totalCount = typeof cached.totalCount === "number" ? cached.totalCount : results.length;
    } catch {
      results = [];
      totalCount = 0;
    }
    functions.logger.info("jobRecommendations cache hit", { cacheKey, resultsCount: results.length });
  } else {
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
      totalCount = out.totalCount;
      await cacheRef.set({
        cachedAt: new Date().toISOString(),
        results: JSON.stringify(results),
        totalCount,
      });
      functions.logger.info("jobRecommendations Adzuna response", {
        totalCount: out.totalCount,
        resultsCount: results.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      functions.logger.warn("Adzuna API failed", { error: msg });
      const isAuthFail = /401|AUTH_FAIL|Authorisation failed/i.test(msg);
      const hint = isAuthFail
        ? "Adzuna auth failed. Set ADZUNA_APP_ID and ADZUNA_APP_KEY in Firebase config (get both from https://developer.adzuna.com/)."
        : "Failed to fetch jobs. Retry later or check Adzuna config: " + msg.slice(0, 80);
      throw new functions.https.HttpsError("internal", hint);
    }
  }

  const jobsRef = getDb().collection(COLLECTIONS.JOBS);
  const withoutUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = v;
    }
    return out;
  };

  const items: Array<{ job: Record<string, unknown>; score: number; currentMatch: number; aiMatch: number; appliedApplicationId?: string }> = results.map((adzunaJob) => {
    const appJob = adzunaJobToAppJob(adzunaJob);
    return {
      job: toApi({ ...appJob }),
      score: 75,
      currentMatch: 75,
      aiMatch: 88,
    };
  });

  // 仅非缓存时写入 JOBS，便于 jobGet 使用；并行写入
  if (!cacheHit) {
    await Promise.all(
      results.map((adzunaJob) => {
        const appJob = adzunaJobToAppJob(adzunaJob);
        const docId = appJob.id as string;
        const docData = withoutUndefined({ ...appJob, updatedAt: new Date().toISOString() });
        return jobsRef.doc(docId).set(docData, { merge: true });
      })
    );
  }

  // 复用 profile：若尚未拉取则拉取一次，用于匹配率
  if (Object.keys(profile).length === 0) {
    const userSnap = await userRef.get();
    profile = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
  }

  const jobInfos = items.map((it) => ({
    title: (it.job.title as string) ?? "",
    description: (it.job.description as string) ?? "",
  }));

  // 匹配率与申请查询并行
  const [rates, jobIdToAppId] = await Promise.all([
    computeMatchRates(profile, jobInfos).catch((err) => {
      functions.logger.warn("computeMatchRates failed", { error: err instanceof Error ? err.message : String(err) });
      return items.map(() => ({ currentMatch: 75, aiMatch: 88 }));
    }),
    (async () => {
      const jobIds = items.map((it) => (it.job.id as string) ?? "").filter(Boolean);
      const out: Record<string, string> = {};
      if (jobIds.length === 0) return out;
      const appRef = userRef.collection(COLLECTIONS.APPLICATIONS);
      const chunkSize = 10;
      for (let i = 0; i < jobIds.length; i += chunkSize) {
        const chunk = jobIds.slice(i, i + chunkSize);
        const q = await appRef.where("jobId", "in", chunk).get();
        q.docs.forEach((d) => {
          const data = d.data() as { jobId?: string };
          if (data.jobId) out[data.jobId] = d.id;
        });
      }
      return out;
    })(),
  ]);

  rates.forEach((r, i) => {
    if (items[i]) {
      items[i].currentMatch = r.currentMatch;
      items[i].aiMatch = r.aiMatch;
      items[i].score = r.currentMatch;
    }
  });
  items.forEach((it) => {
    const jid = (it.job.id as string) ?? "";
    if (jobIdToAppId[jid]) it.appliedApplicationId = jobIdToAppId[jid];
  });

  const nextCursor = results.length >= limit ? String(page + 1) : null;
  functions.logger.info("jobRecommendations return", {
    itemsCount: items.length,
    totalFromSource: totalCount,
    hasMore: results.length >= limit,
    cacheHit,
    what: whatTrim,
  });
  return { items, nextCursor, hasMore: results.length >= limit, totalFromSource: totalCount };
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
  if (!jobId) throw new functions.https.HttpsError("invalid-argument", "Missing jobId");
  const doc = await getDb().collection(COLLECTIONS.JOBS).doc(jobId).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "Job not found");
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});
