/**
 * 申请素材生成 Callable
 */
import * as functions from "firebase-functions/v1";
import { COLLECTIONS } from "../schema";
import { getDb, requireAuth, toApi } from "./helpers";

export const assetGenerate = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { applicationId, type, resumeId, options } = data ?? {};
  if (!applicationId || !type) {
    throw new functions.https.HttpsError("invalid-argument", "缺少 applicationId 或 type");
  }
  const appRef = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.APPLICATIONS).doc(applicationId);
  const appSnap = await appRef.get();
  if (!appSnap.exists) throw new functions.https.HttpsError("not-found", "申请不存在");
  const appData = appSnap.data() as { jobId?: string };
  const jobId = appData?.jobId ?? "";
  const now = new Date().toISOString();
  const assetRef = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.GENERATED_ASSETS).doc();
  await assetRef.set({
    id: assetRef.id,
    userId: uid,
    applicationId,
    jobId,
    resumeId: resumeId ?? null,
    type,
    status: "generating",
    input: options ?? null,
    createdAt: now,
    updatedAt: now,
  });
  // TODO: 接入真实 AI 生成，完成后更新 status/output/completedAt
  const doc = await assetRef.get();
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});

export const assetsListByApplication = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const applicationId = data?.applicationId;
  if (!applicationId) throw new functions.https.HttpsError("invalid-argument", "缺少 applicationId");
  const snapshot = await getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.GENERATED_ASSETS)
    .where("applicationId", "==", applicationId)
    .get();
  const items = snapshot.docs.map((d) => toApi({ id: d.id, ...d.data() } as Record<string, unknown>));
  return items;
});

export const assetGet = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const assetId = data?.assetId;
  if (!assetId) throw new functions.https.HttpsError("invalid-argument", "缺少 assetId");
  const doc = await getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.GENERATED_ASSETS).doc(assetId).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "素材不存在");
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});
