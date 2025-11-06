import * as functions from "firebase-functions/v1";
import {refundCredits as refundCreditsInternal} from "./credits.js";

/**
 * Callable 函数：退款处理
 * 只计算 paid_credit（从 paid_credit 中扣除）
 */
export const refundCredits = functions.https.onCall(async (data, context) => {
  // 验证用户是否已登录
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "login required"
    );
  }

  const uid = context.auth.uid;
  const amount = data.amount;

  // 验证参数
  if (typeof amount !== "number" || amount <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "amount must be a positive number"
    );
  }

  try {
    await refundCreditsInternal(uid, amount);
    return {success: true};
  } catch (error: unknown) {
    functions.logger.error(`❌ 退款失败 (用户: ${uid}, 数量: ${amount}):`, error);
    throw error;
  }
});

