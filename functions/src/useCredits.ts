import * as functions from "firebase-functions/v1";
import {useCredits as useCreditsInternal} from "./credits.js";
import {CREDIT_CONSTANTS} from "./types.js";

/**
 * Callable 函数：使用点数
 * 规则：先用 gift_credit，再用 paid_credit
 * 每次固定使用 5 个点（配置在后端）
 */
export const useCredits = functions.https.onCall(async (data, context) => {
  // 验证用户是否已登录
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "login required"
    );
  }

  const uid = context.auth.uid;
  // 固定使用点数（配置在后端）
  const amount = CREDIT_CONSTANTS.USE_CREDITS_AMOUNT;

  try {
    // 传递 usageType 为 "manual_deduction" 表示手动扣除
    const result = await useCreditsInternal(
      uid,
      amount,
      "manual_deduction",
      null
    );
    return result;
  } catch (error: unknown) {
    functions.logger.error(
      `❌ 使用点数失败 (用户: ${uid}, 数量: ${amount}):`,
      error
    );

    // 如果是已知的错误类型，直接抛出
    if (error instanceof Error && "code" in error) {
      const code = (error as Error & {code: string}).code;
      const message = error.message;

      if (code === "not-found") {
        throw new functions.https.HttpsError("not-found", message);
      } else if (code === "failed-precondition") {
        throw new functions.https.HttpsError("failed-precondition", message);
      }
    }

    // 其他错误转换为 internal 错误
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to use credits: ${errorMessage}`
    );
  }
});

