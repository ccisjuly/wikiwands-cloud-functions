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
    const result = await useCreditsInternal(uid, amount);
    return result;
  } catch (error: unknown) {
    functions.logger.error(`❌ 使用点数失败 (用户: ${uid}, 数量: ${amount}):`, error);
    throw error;
  }
});

