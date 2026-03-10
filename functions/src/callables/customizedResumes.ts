/**
 * 定制简历 Callable：按职位描述基于 base 在线简历生成定制版本，可查看 diff、匹配度、选模版下载
 */
import * as functions from "firebase-functions/v1";
import { tailorProfileForJob, computeMatchRates } from "../ai/gemini";
import { COLLECTIONS } from "../schema";
import { getDb, requireAuth, toApi } from "./helpers";

type ProfileRecord = Record<string, unknown>;

function mergeTailoredIntoProfile(base: ProfileRecord, tailored: { headline?: string; summary?: string; experience?: unknown[]; skills?: string[] }): ProfileRecord {
  const merged = { ...base } as ProfileRecord;
  if (tailored.headline != null) merged.headline = tailored.headline;
  if (tailored.summary != null) merged.summary = tailored.summary;
  if (tailored.experience != null) merged.experience = tailored.experience;
  if (tailored.skills != null) merged.skills = tailored.skills;
  return merged;
}

/** 新增一条定制简历：输入职位描述，基于当前在线简历生成定制版并保存 */
export const customizedResumeCreate = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const jobDescription = typeof data?.jobDescription === "string" ? data.jobDescription.trim() : "";
  if (!jobDescription) throw new functions.https.HttpsError("invalid-argument", "请填写职位描述");

  const db = getDb();
  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const userDoc = await userRef.get();
  const base = (userDoc.exists ? userDoc.data() : {}) as ProfileRecord;

  const jobRef = { title: "定制职位", description: jobDescription };
  const [baseMatchResult] = await computeMatchRates(base, [jobRef]);
  const baseMatchScore = baseMatchResult?.currentMatch ?? 70;

  const tailored = await tailorProfileForJob(base, {
    title: jobRef.title,
    company: "",
    description: jobDescription,
  });
  const merged = mergeTailoredIntoProfile(base, tailored);

  const [matchResult] = await computeMatchRates(merged, [jobRef]);
  const matchScore = matchResult?.currentMatch ?? 75;

  const ref = userRef.collection(COLLECTIONS.CUSTOMIZED_RESUMES).doc();
  const now = new Date();
  await ref.set({
    jobDescription,
    profile: merged,
    matchScore,
    baseMatchScore,
    createdAt: now,
    updatedAt: now,
  });

  const doc = await ref.get();
  const out = doc.exists ? doc.data() : {};
  return toApi({
    id: ref.id,
    jobDescription: (out as { jobDescription?: string }).jobDescription,
    profile: (out as { profile?: ProfileRecord }).profile,
    matchScore: (out as { matchScore?: number }).matchScore,
    baseMatchScore: (out as { baseMatchScore?: number }).baseMatchScore,
    createdAt: (out as { createdAt?: Date }).createdAt,
    updatedAt: (out as { updatedAt?: Date }).updatedAt,
  } as Record<string, unknown>);
});

/** 列表：当前用户的定制简历，按创建时间倒序 */
export const customizedResumesList = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const limit = Math.min(50, Math.max(1, Number(data?.limit) || 20));
  const cursor = typeof data?.cursor === "string" ? data.cursor : undefined;

  const col = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.CUSTOMIZED_RESUMES);
  let query = col.orderBy("createdAt", "desc").limit(limit + 1);
  if (cursor) {
    const cursorDoc = await col.doc(cursor).get();
    if (cursorDoc.exists) query = col.orderBy("createdAt", "desc").startAfter(cursorDoc).limit(limit + 1);
  }
  const snap = await query.get();
  const docs = snap.docs.slice(0, limit);
  const toIso = (v: unknown): string => {
    if (v == null) return "";
    if (typeof (v as { toDate?: () => Date }).toDate === "function") return ((v as { toDate: () => Date }).toDate()).toISOString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
    return "";
  };
  const items = docs.map((d) => {
    const raw = d.data();
    const createdAt = toIso(raw.createdAt) || toIso(raw.updatedAt);
    const updatedAt = toIso(raw.updatedAt) || createdAt;
    return {
      id: d.id,
      jobDescription: raw.jobDescription,
      matchScore: raw.matchScore,
      baseMatchScore: raw.baseMatchScore,
      createdAt,
      updatedAt,
    };
  });
  const nextCursor = snap.docs.length > limit ? docs[docs.length - 1]?.id : null;
  return toApi({ items, nextCursor } as Record<string, unknown>);
});

/** 单条：获取定制简历详情（含完整 profile，用于 diff / 下载） */
export const customizedResumeGet = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) throw new functions.https.HttpsError("invalid-argument", "需要 id");

  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.CUSTOMIZED_RESUMES).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "定制简历不存在");
  const raw = doc.data() as { jobDescription?: string; profile?: ProfileRecord; matchScore?: number; createdAt?: Date; updatedAt?: Date };
  return toApi({
    id: doc.id,
    jobDescription: raw.jobDescription,
    profile: raw.profile,
    matchScore: raw.matchScore,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  } as Record<string, unknown>);
});

/** 更新定制简历的 profile（部分或全部字段，与 profileUpdate 的 allowed 一致） */
const PROFILE_UPDATE_KEYS = new Set([
  "displayName", "email", "phone", "location", "linkedInUrl", "website",
  "headline", "summary", "experience", "education", "yearsOfExperience", "workStartDate", "skills",
  "openToWork",
]);

export const customizedResumeUpdate = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) throw new functions.https.HttpsError("invalid-argument", "需要 id");
  const updates = data?.profile != null && typeof data.profile === "object" ? (data.profile as Record<string, unknown>) : {};

  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.CUSTOMIZED_RESUMES).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "定制简历不存在");
  const raw = doc.data() as { profile?: ProfileRecord };
  const currentProfile = (raw.profile ?? {}) as ProfileRecord;
  const merged: ProfileRecord = { ...currentProfile };
  for (const [k, v] of Object.entries(updates)) {
    if (PROFILE_UPDATE_KEYS.has(k)) merged[k] = v;
  }
  const now = new Date();
  await ref.set({ profile: merged, updatedAt: now }, { merge: true });
  const updated = await ref.get();
  const out = updated.exists ? updated.data() : {};
  return toApi({
    id: ref.id,
    profile: (out as { profile?: ProfileRecord }).profile,
    updatedAt: (out as { updatedAt?: Date }).updatedAt,
  } as Record<string, unknown>);
});
