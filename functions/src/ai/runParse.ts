/**
 * 执行简历解析并写回 Firestore（供 resumeParse Callable 与 Storage onFinalize 共用）
 * @param bucketName 可选，从 Storage 触发器传入可确保与实际上传桶一致；不传则用 getBucketName()
 */
import * as functions from "firebase-functions/v1";
import { COLLECTIONS } from "../schema";
import { getBucket, getDb } from "../callables/helpers";
import { parseResumeFromPdfBuffer } from "./gemini";
import type { ResumeFileType } from "../types/resume";

export async function runResumeParse(uid: string, resumeId: string, bucketNameOverride?: string): Promise<{ status: string; parsed?: boolean }> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.RESUMES).doc(resumeId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new Error("resume not found");
  }
  const data = doc.data() as {
    fileStoragePath?: string;
    fileName?: string;
    fileContentType?: string;
    parseStatus?: string;
  };
  const { fileStoragePath, fileName, fileContentType } = data;
  if (!fileStoragePath || !fileName) {
    await ref.update({ parseStatus: "failed", parseError: "缺少文件路径或文件名", updatedAt: new Date().toISOString() });
    return { status: "failed" };
  }

  const contentType = (fileContentType ?? "application/pdf") as ResumeFileType;
  const isPdf = contentType === "application/pdf";
  const now = new Date().toISOString();

  await ref.update({ parseStatus: "parsing", updatedAt: now });

  if (!isPdf) {
    await ref.update({
      parseStatus: "unsupported",
      parseError: "当前仅支持 PDF 自动解析",
      updatedAt: new Date().toISOString(),
    });
    return { status: "unsupported" };
  }

  try {
    const bucket = getBucket(bucketNameOverride);
    functions.logger.info("runResumeParse start", { uid, resumeId, path: fileStoragePath });
    const [pdfBuffer] = await bucket.file(fileStoragePath).download();
    const parsed = await parseResumeFromPdfBuffer(pdfBuffer, fileName, contentType);
    await ref.update({
      parseStatus: "completed",
      parsed,
      updatedAt: now,
    });
    return { status: "completed", parsed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    functions.logger.warn("runResumeParse failed", { uid, resumeId, message, stack });
    await ref.update({
      parseStatus: "failed",
      parseError: message.slice(0, 500),
      updatedAt: new Date().toISOString(),
    });
    return { status: "failed" };
  }
}
