/**
 * 简历 AI 分析 Callable（Vertex Gemini）
 */
import * as functions from "firebase-functions/v1";
import { COLLECTIONS } from "../schema";
import { analyzeResumeWithGemini } from "../ai/gemini";
import { getDb, requireAuth, toApi } from "./helpers";

export const resumeAnalyze = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const resumeId = data?.resumeId;
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "缺少 resumeId");
  const db = getDb();
  const resumeRef = db.collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES).doc(resumeId);
  const resumeDoc = await resumeRef.get();
  if (!resumeDoc.exists) throw new functions.https.HttpsError("not-found", "简历不存在");
  const resumeData = resumeDoc.data() as { parsed?: { rawFullText?: string; sections?: unknown[] }; fileName?: string };
  const analysisRef = db.collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUME_ANALYSES).doc(resumeId);
  const now = new Date().toISOString();
  await analysisRef.set({
    resumeId,
    userId: uid,
    status: "analyzing",
    insights: { strengths: [], areasForImprovement: [], suggestedSkills: [] },
    createdAt: now,
  }, { merge: true });

  const rawFullText = resumeData.parsed?.rawFullText ?? "";
  const parsedSummary = resumeData.parsed?.sections
    ? (resumeData.parsed.sections as Array<{ type?: string; rawText?: string }>).map((s) => `${s.type}: ${(s.rawText ?? "").slice(0, 200)}`).join("\n")
    : undefined;
  if (!rawFullText || rawFullText.length < 20) {
    await analysisRef.update({
      status: "failed",
      error: "请先完成简历解析（上传 PDF 后等待解析完成或点击重新解析）",
      updatedAt: now,
    });
    const doc = await analysisRef.get();
    return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
  }

  try {
    const insights = await analyzeResumeWithGemini(rawFullText, parsedSummary);
    await analysisRef.update({
      status: "completed",
      completedAt: now,
      insights,
      updatedAt: now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await analysisRef.update({
      status: "failed",
      error: message.slice(0, 500),
      updatedAt: now,
    });
  }
  const doc = await analysisRef.get();
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});

export const resumeAnalysisGet = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const resumeId = data?.resumeId;
  if (!resumeId) throw new functions.https.HttpsError("invalid-argument", "缺少 resumeId");
  const doc = await getDb().collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUME_ANALYSES).doc(resumeId).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "分析记录不存在");
  return toApi({ id: doc.id, ...doc.data() } as Record<string, unknown>);
});
