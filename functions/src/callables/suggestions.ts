/**
 * 简历改进建议 Callable（Vertex Gemini）
 */
import * as functions from "firebase-functions/v1";
import { COLLECTIONS } from "../schema";
import { suggestResumeWithGemini } from "../ai/gemini";
import { getDb, requireAuth, toApi } from "./helpers";

export const resumeSuggestionsList = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const resumeId = data?.resumeId;
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "缺少 resumeId");
  const snapshot = await getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUME_SUGGESTIONS)
    .where("resumeId", "==", resumeId)
    .orderBy("createdAt", "desc")
    .get();
  const items = snapshot.docs.map((d) => toApi({ id: d.id, ...d.data() } as Record<string, unknown>));
  return items;
});

export const resumeSuggestionsGenerate = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const resumeId = data?.resumeId;
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "缺少 resumeId");
  const resumeRef = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES).doc(resumeId);
  const resumeDoc = await resumeRef.get();
  if (!resumeDoc.exists) throw new functions.https.HttpsError("not-found", "简历不存在");
  const resumeData = resumeDoc.data() as { parsed?: { rawFullText?: string; sections?: unknown[] } };
  const rawFullText = resumeData.parsed?.rawFullText ?? "";
  const parsedSummary = resumeData.parsed?.sections
    ? (resumeData.parsed.sections as Array<{ type?: string; rawText?: string }>).map((s) => `${s.type}: ${(s.rawText ?? "").slice(0, 200)}`).join("\n")
    : undefined;
  if (!rawFullText || rawFullText.length < 20) {
    throw new functions.https.HttpsError("failed-precondition", "请先完成简历解析后再生成建议");
  }
  const list = await suggestResumeWithGemini(rawFullText, parsedSummary);
  const now = new Date().toISOString();
  const suggestionsRef = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUME_SUGGESTIONS);
  const batch = getDb().batch();
  const suggestionIds: string[] = [];
  for (const sug of list) {
    const sugRef = suggestionsRef.doc();
    batch.set(sugRef, {
      id: sugRef.id,
      resumeId,
      ...sug,
      createdAt: now,
    });
    suggestionIds.push(sugRef.id);
  }
  await batch.commit();
  const suggestions = await Promise.all(suggestionIds.map((id) => suggestionsRef.doc(id).get()));
  const items = suggestions.map((d) => toApi({ id: d.id, ...d.data() } as Record<string, unknown>));
  return { count: items.length, suggestions: items };
});

export const suggestionPatch = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { resumeId, suggestionId, status } = data ?? {};
  if (!suggestionId) throw new functions.https.HttpsError("invalid-argument", "缺少 suggestionId");
  const ref = getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUME_SUGGESTIONS).doc(suggestionId);
  const doc = await ref.get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "建议不存在");
  if (resumeId && (doc.data() as { resumeId?: string })?.resumeId !== resumeId) {
    throw new functions.https.HttpsError("permission-denied", "建议不属于该简历");
  }
  if (status !== undefined) {
    await ref.update({ status, updatedAt: new Date().toISOString() });
  }
  const updated = await ref.get();
  return toApi({ id: updated.id, ...updated.data() } as Record<string, unknown>);
});
