/**
 * 申请追踪 Callable
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { tailorProfileForJob } from "../ai/gemini";
import { COLLECTIONS } from "../schema";
import { getDb, requireAuth, toApi } from "./helpers";

export const applicationsList = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const limit = Math.min(Number(data?.limit) || 20, 100);
  const cursor = data?.cursor ?? null;
  const status = data?.status;
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.APPLICATIONS);
  let q: admin.firestore.Query = status && typeof status === "string"
    ? ref.where("status", "==", status).orderBy("updatedAt", "desc").limit(limit + 1)
    : ref.orderBy("updatedAt", "desc").limit(limit + 1);
  if (cursor) {
    const cursorDoc = await ref.doc(cursor).get();
    if (!cursorDoc.exists) return { items: [], nextCursor: null, hasMore: false };
    q = q.startAfter(cursorDoc);
  }
  const snapshot = await q.get();
  const docs = snapshot.docs.slice(0, limit);
  const items = docs.map((d) => toApi({ id: d.id, ...d.data() } as Record<string, unknown>));
  const nextCursor = snapshot.docs.length > limit ? docs[docs.length - 1].id : null;
  return { items, nextCursor, hasMore: snapshot.docs.length > limit };
});

export const applicationCreate = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const {
    jobId,
    jobTitle,
    company,
    companyLogoUrl,
    resumeId,
    coverLetterId,
    source,
    notes,
    tailoredHeadline,
    tailoredSummary,
    tailoredExperience,
    tailoredSkills,
  } = data ?? {};
  if (!jobId || !jobTitle || !company) {
    throw new functions.https.HttpsError("invalid-argument", "Missing jobId, jobTitle or company");
  }
  const now = new Date().toISOString();
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.APPLICATIONS).doc();
  const payload: Record<string, unknown> = {
    id: ref.id,
    userId: uid,
    jobId,
    jobTitle,
    company,
    companyLogoUrl: companyLogoUrl ?? null,
    status: "draft",
    resumeId: resumeId ?? null,
    coverLetterId: coverLetterId ?? null,
    source: source ?? null,
    notes: notes ?? null,
    statusHistory: [{ status: "draft", at: now }],
    createdAt: now,
    updatedAt: now,
  };
  if (tailoredHeadline != null) payload.tailoredHeadline = tailoredHeadline;
  if (tailoredSummary != null) payload.tailoredSummary = tailoredSummary;
  if (tailoredExperience != null) payload.tailoredExperience = tailoredExperience;
  if (tailoredSkills != null) payload.tailoredSkills = tailoredSkills;
  if (data?.initialMatchRate != null) payload.initialMatchRate = Number(data.initialMatchRate);
  if (data?.predictedSuccessRate != null) payload.predictedSuccessRate = Number(data.predictedSuccessRate);
  await ref.set(payload);
  const doc = await ref.get();
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});

/** 根据职位内容 AI 定制简历并创建申请：拉取用户档案与职位信息，调用 Gemini 定制，写入申请并保存定制版本 */
export const customizeAndApply = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { jobId, jobTitle, company, companyLogoUrl, jobDescription, initialMatchRate, predictedSuccessRate } = data ?? {};
  if (!jobId || !jobTitle || !company) {
    throw new functions.https.HttpsError("invalid-argument", "Missing jobId, jobTitle or company");
  }
  const db = getDb();
  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const userSnap = await userRef.get();
  const profile = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
  let description = typeof jobDescription === "string" ? jobDescription : "";
  if (!description) {
    const jobDoc = await db.collection(COLLECTIONS.JOBS).doc(jobId).get();
    if (jobDoc.exists) {
      const jobData = jobDoc.data() as Record<string, unknown>;
      description = (jobData.description as string) ?? "";
    }
  }
  const tailored = await tailorProfileForJob(profile, {
    title: String(jobTitle),
    company: String(company),
    description: description || undefined,
  });
  const now = new Date().toISOString();
  const appRef = userRef.collection(COLLECTIONS.APPLICATIONS).doc();
  const payload: Record<string, unknown> = {
    id: appRef.id,
    userId: uid,
    jobId,
    jobTitle,
    company,
    companyLogoUrl: companyLogoUrl ?? null,
    status: "draft",
    resumeId: null,
    coverLetterId: null,
    source: "customizeAndApply",
    notes: null,
    statusHistory: [{ status: "draft", at: now }],
    createdAt: now,
    updatedAt: now,
  };
  if (tailored.headline != null) payload.tailoredHeadline = tailored.headline;
  if (tailored.summary != null) payload.tailoredSummary = tailored.summary;
  if (tailored.experience != null) payload.tailoredExperience = tailored.experience;
  if (tailored.skills != null) payload.tailoredSkills = tailored.skills;
  if (initialMatchRate != null && !Number.isNaN(Number(initialMatchRate))) payload.initialMatchRate = Number(initialMatchRate);
  if (predictedSuccessRate != null && !Number.isNaN(Number(predictedSuccessRate))) payload.predictedSuccessRate = Number(predictedSuccessRate);
  if (profile.headline != null) payload.originalHeadline = profile.headline;
  if (profile.summary != null) payload.originalSummary = profile.summary;
  if (profile.skills != null) payload.originalSkills = profile.skills;
  if (profile.experience != null) payload.originalExperience = profile.experience;
  await appRef.set(payload);
  const doc = await appRef.get();
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});

export const applicationGet = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const applicationId = data?.applicationId;
  if (!applicationId) throw new functions.https.HttpsError("invalid-argument", "Missing applicationId");
  const doc = await getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.APPLICATIONS).doc(applicationId).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "Application not found");
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});

export const applicationPatch = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { applicationId, status, notes, resumeId, coverLetterId } = data ?? {};
  if (!applicationId) throw new functions.https.HttpsError("invalid-argument", "Missing applicationId");
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.APPLICATIONS).doc(applicationId);
  const doc = await ref.get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "Application not found");
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (status !== undefined) {
    updates.status = status;
    const history = ((doc.data() as { statusHistory?: { status: string; at: string }[] })?.statusHistory ?? []).slice();
    history.push({ status, at: new Date().toISOString() });
    updates.statusHistory = history;
    if (status === "submitted") updates.appliedAt = new Date().toISOString();
  }
  if (notes !== undefined) updates.notes = notes;
  if (resumeId !== undefined) updates.resumeId = resumeId;
  if (coverLetterId !== undefined) updates.coverLetterId = coverLetterId;
  await ref.update(updates);
  const updated = await ref.get();
  return toApi({ id: updated.id, ...updated.data() } as Record<string, unknown>);
});

export const applicationDelete = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const applicationId = data?.applicationId;
  if (!applicationId) throw new functions.https.HttpsError("invalid-argument", "Missing applicationId");
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.APPLICATIONS).doc(applicationId);
  const doc = await ref.get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "Application not found");
  await ref.delete();
  return { deleted: true };
});
