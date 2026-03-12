/**
 * 简历相关 Callable：上传、列表、获取、解析、更新、删除
 */
import * as functions from "firebase-functions/v1";
import { COLLECTIONS } from "../schema";
import { runResumeParse } from "../ai/runParse";
import { getBucket, getDb, requireAuth, toApi } from "./helpers";

export const resumeUpload = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { fileName, contentType } = data ?? {};
  if (!fileName || !contentType) {
    throw new functions.https.HttpsError("invalid-argument", "缺少 fileName 或 contentType");
  }
  const db = getDb();
  const bucket = getBucket();
  const resumeRef = db.collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES).doc();
  const resumeId = resumeRef.id;
  let ext = "doc";
  if (contentType === "application/pdf") ext = "pdf";
  else if (contentType === "image/jpeg" || contentType === "image/jpg") ext = "jpg";
  else if (contentType === "image/png") ext = "png";
  const storagePath = `users/${uid}/resumes/${resumeId}/file.${ext}`;
  const now = new Date().toISOString();
  const file = bucket.file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    action: "write",
    expires: Date.now() + 30 * 60 * 1000,
    contentType,
  });
  const isImage = contentType.startsWith("image/");
  await resumeRef.set({
    userId: uid,
    fileStoragePath: storagePath,
    fileContentType: contentType,
    fileName,
    parseStatus: isImage ? "image" : "pending",
    createdAt: now,
    updatedAt: now,
  });
  return {
    resumeId,
    uploadUrl,
    status: "pending",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
});

export const resumesList = functions.https.onCall(async (data, context) => {
  functions.logger.info("resumesList: start", { auth: !!context.auth?.uid });
  const uid = requireAuth(context);
  const db = getDb();
  const limit = Math.min(Number(data?.limit) || 20, 100);
  const cursor = data?.cursor ?? null;
  const ref = db.collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES);
  let q = ref.orderBy("createdAt", "desc").limit(limit + 1);
  if (cursor) {
    const cursorDoc = await ref.doc(cursor).get();
    if (!cursorDoc.exists) {
      functions.logger.info("resumesList: cursor not found, return empty");
      return { items: [], nextCursor: null, hasMore: false };
    }
    q = q.startAfter(cursorDoc);
  }
  const snapshot = await q.get();
  const docs = snapshot.docs.slice(0, limit);
  const items = docs.map((d) => toApi({ id: d.id, ...d.data() } as Record<string, unknown>));
  const nextCursor = snapshot.docs.length > limit ? docs[docs.length - 1].id : null;
  functions.logger.info("resumesList: done", { count: items.length });
  return { items, nextCursor, hasMore: snapshot.docs.length > limit };
});

export const resumeGet = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const resumeId = data?.resumeId;
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "缺少 resumeId");
  const doc = await getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES).doc(resumeId).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "简历不存在");
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});

export const resumeGetParsed = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const resumeId = data?.resumeId;
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "缺少 resumeId");
  const doc = await getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES).doc(resumeId).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "简历不存在");
  const parsed = (doc.data() as { parsed?: unknown })?.parsed;
  if (!parsed) throw new functions.https.HttpsError("failed-precondition", "简历尚未解析完成");
  return { parsed };
});

export const resumeParse = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const resumeId = data?.resumeId;
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "缺少 resumeId");
  const result = await runResumeParse(uid, resumeId);
  return result;
});

export const resumePatch = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { resumeId, isPrimary } = data ?? {};
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "缺少 resumeId");
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES).doc(resumeId);
  const doc = await ref.get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "简历不存在");
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof isPrimary === "boolean") updates.isPrimary = isPrimary;
  await ref.update(updates);
  const updated = await ref.get();
  return toApi({ id: updated.id, ...updated.data() } as Record<string, unknown>);
});

export const resumeDelete = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const resumeId = data?.resumeId;
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "缺少 resumeId");
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES).doc(resumeId);
  const doc = await ref.get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "简历不存在");
  const storagePath = (doc.data() as { fileStoragePath?: string })?.fileStoragePath;
  if (storagePath) {
    try {
      await getBucket().file(storagePath).delete();
    } catch {
      // ignore
    }
  }
  await ref.delete();
  return { deleted: true };
});
