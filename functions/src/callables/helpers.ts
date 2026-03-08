/**
 * Callable 通用：鉴权、序列化、延迟获取 Firestore/Storage（避免模块加载时未 initializeApp）
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

export function getDb(): admin.firestore.Firestore {
  return admin.firestore();
}

export function getBucket(bucketName?: string): ReturnType<admin.storage.Storage["bucket"]> {
  return bucketName ? admin.storage().bucket(bucketName) : admin.storage().bucket();
}

/** 默认 bucket 名称，用于拼 gs:// URI */
export function getBucketName(): string {
  return getBucket().name;
}

export function requireAuth(
  context: functions.https.CallableContext
): string {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "需要登录"
    );
  }
  return context.auth.uid;
}

/** 将 Firestore 文档中的 Timestamp 转为 ISO 字符串，便于 API 返回 */
export function toApi<T extends Record<string, unknown>>(doc: T): T {
  const out = { ...doc } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString();
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = toApi(v as Record<string, unknown>);
    }
  }
  return out as T;
}
