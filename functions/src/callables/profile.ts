/**
 * 候选人档案 Callable
 */
import * as functions from "firebase-functions/v1";
import { improveOnlineResumeWithGemini } from "../ai/gemini";
import { COLLECTIONS } from "../schema";
import { getDb, requireAuth, toApi } from "./helpers";

export const profileGet = functions.https.onCall(async (_data, context) => {
  const uid = requireAuth(context);
  const doc = await getDb().collection(COLLECTIONS.USERS).doc(uid).get();
  if (!doc.exists) {
    return toApi({ userId: uid, skills: [], openToWork: false } as Record<string, unknown>);
  }
  return toApi({ userId: uid, ...doc.data() } as Record<string, unknown>);
});

export const profileUpdate = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid);
  const allowed = new Set([
    "displayName", "email", "phone", "location", "linkedInUrl", "website",
    "headline", "summary", "experience", "education", "yearsOfExperience", "workStartDate", "skills",
    "industries", "jobTypes", "workAuthorizations", "salaryExpectation", "preferredLocations", "openToWork",
    "resumeScore",
  ]);
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (allowed.has(k)) updates[k] = v;
    }
  }
  await ref.set(updates, { merge: true });
  const doc = await ref.get();
  return toApi({ userId: uid, ...doc.data() } as Record<string, unknown>);
});

/** 从附件简历的解析结果合并到在线简历（用户选择要更新的部分） */
export const profileApplyFromResume = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { resumeId, mergeSummary, mergeExperience, mergeEducation, mergeSkills, mergeContact } = data ?? {};
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "需要 resumeId");
  const resumeRef = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES).doc(resumeId);
  const resumeDoc = await resumeRef.get();
  if (!resumeDoc.exists) throw new functions.https.HttpsError("not-found", "简历不存在");
  const parsed = (resumeDoc.data() as { parsed?: { rawFullText?: string; sections?: Array<{ type?: string; rawText?: string; structured?: unknown }>; contact?: Record<string, string> } })?.parsed;
  if (!parsed) throw new functions.https.HttpsError("failed-precondition", "请先完成简历解析");
  const sections = parsed.sections ?? [];
  const userRef = getDb().collection(COLLECTIONS.USERS).doc(uid);
  const userDoc = await userRef.get();
  const current = (userDoc.exists ? userDoc.data() : {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (mergeContact && parsed.contact) {
    if (parsed.contact.email) updates.email = parsed.contact.email;
    if (parsed.contact.phone) updates.phone = parsed.contact.phone;
    if (parsed.contact.location) updates.location = parsed.contact.location;
    if (parsed.contact.linkedIn) updates.linkedInUrl = parsed.contact.linkedIn;
    if (parsed.contact.website) updates.website = parsed.contact.website;
  }
  if (mergeSummary) {
    const summarySection = sections.find((s: { type?: string }) => s.type === "summary");
    updates.summary = summarySection?.rawText
      ? String(summarySection.rawText).slice(0, 4000)
      : (parsed.rawFullText ?? "").slice(0, 4000);
  }
  if (mergeExperience) {
    const expSection = sections.find((s: { type?: string }) => s.type === "experience");
    const structured = expSection?.structured;
    updates.experience = Array.isArray(structured) ? structured : (current.experience ?? []);
  }
  if (mergeEducation) {
    const eduSection = sections.find((s: { type?: string }) => s.type === "education");
    const structured = eduSection?.structured;
    updates.education = Array.isArray(structured) ? structured : (current.education ?? []);
  }
  if (mergeSkills) {
    const skillSection = sections.find((s: { type?: string }) => s.type === "skills");
    const structured = skillSection?.structured;
    const newSkills = Array.isArray(structured) ? structured.filter((x): x is string => typeof x === "string") : [];
    const existing = Array.isArray(current.skills) ? (current.skills as string[]) : [];
    const combined = [...new Set([...existing, ...newSkills])];
    updates.skills = combined;
  }
  await userRef.set(updates, { merge: true });
  const updated = await userRef.get();
  return toApi({ userId: uid, ...updated.data() } as Record<string, unknown>);
});

export const profileApplySuggestions = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { resumeId, fields } = data ?? {};
  if (!resumeId || !Array.isArray(fields) || fields.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "需要 resumeId 和 fields 数组");
  }
  const analysisDoc = await getDb().collection(COLLECTIONS.USERS).doc(uid)
    .collection(COLLECTIONS.RESUME_ANALYSES).doc(resumeId).get();
  if (!analysisDoc.exists) throw new functions.https.HttpsError("not-found", "分析记录不存在");
  const suggested = (analysisDoc.data() as { suggestedProfileUpdates?: Record<string, unknown> })?.suggestedProfileUpdates ?? {};
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const f of fields) {
    if (typeof f === "string" && f in suggested) updates[f] = suggested[f];
  }
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid);
  await ref.set(updates, { merge: true });
  const doc = await ref.get();
  return toApi({ userId: uid, ...doc.data() } as Record<string, unknown>);
});

/** 在线简历 AI 分析并返回评分与改写建议；客户端可预览 suggestedProfile 后选择保存 */
export const profileImproveRewrite = functions.https.onCall(async (_data, context) => {
  const uid = requireAuth(context);
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid);
  const doc = await ref.get();
  const current = (doc.exists ? doc.data() : {}) as Record<string, unknown>;
  const { score, expectedScore, items, suggested } = await improveOnlineResumeWithGemini(current);
  const suggestedProfile: Record<string, unknown> = { ...current };
  if (suggested.summary != null) suggestedProfile.summary = suggested.summary;
  if (suggested.headline != null) suggestedProfile.headline = suggested.headline;
  if (suggested.experience != null) suggestedProfile.experience = suggested.experience;
  if (suggested.skills != null) suggestedProfile.skills = suggested.skills;
  // 持久化当前评分，避免每次进入页面评分都变
  if (typeof score === "number" && !Number.isNaN(score)) {
    await ref.set({ resumeScore: score, updatedAt: new Date().toISOString() }, { merge: true });
  }
  return toApi({
    score,
    expectedScore,
    pendingItems: items,
    suggestedProfile,
  } as Record<string, unknown>);
});
