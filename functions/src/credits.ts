import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {CreditsDoc, COLLECTIONS, CREDIT_CONSTANTS} from "./types.js";

// 确保 Firebase Admin 已初始化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 获取或创建用户的点数文档
 * @param {string} uid 用户 ID
 * @return {Promise<FirebaseFirestore.DocumentSnapshot<CreditsDoc>>}
 */
async function getOrCreateCreditsDoc(
  uid: string
): Promise<FirebaseFirestore.DocumentSnapshot<CreditsDoc>> {
  const creditsRef = db.doc(`${COLLECTIONS.CREDITS}/${uid}`);
  const creditsDoc = await creditsRef.get();

  if (!creditsDoc.exists) {
    // 创建初始点数文档
    const now = admin.firestore.FieldValue.serverTimestamp();
    const initialCredits: CreditsDoc = {
      gift_credit: 0,
      paid_credit: 0,
      updatedAt: now,
    };
    await creditsRef.set(initialCredits);
    return await creditsRef.get() as
      FirebaseFirestore.DocumentSnapshot<CreditsDoc>;
  }

  return creditsDoc as FirebaseFirestore.DocumentSnapshot<CreditsDoc>;
}

/**
 * 重置用户的 gift_credit 为 10 点
 * 使用 transaction 防止并发问题
 * @param {string} uid 用户 ID
 */
export async function resetGiftCredit(uid: string): Promise<void> {
  const creditsRef = db.doc(`${COLLECTIONS.CREDITS}/${uid}`);

  await db.runTransaction(async (transaction) => {
    const creditsDoc = await transaction.get(creditsRef);

    if (!creditsDoc.exists) {
      // 如果文档不存在，创建新文档
      const now = admin.firestore.FieldValue.serverTimestamp();
      const initialCredits: CreditsDoc = {
        gift_credit: CREDIT_CONSTANTS.MONTHLY_GIFT_CREDIT,
        paid_credit: 0,
        last_gift_reset: now as FirebaseFirestore.Timestamp,
        updatedAt: now,
      };
      transaction.set(creditsRef, initialCredits);
    } else {
      // 更新现有文档
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.update(creditsRef, {
        gift_credit: CREDIT_CONSTANTS.MONTHLY_GIFT_CREDIT,
        last_gift_reset: now,
        updatedAt: now,
      });
    }
  });

  functions.logger.info(
    `✅ 已重置用户 ${uid} 的 gift_credit 为 ` +
    `${CREDIT_CONSTANTS.MONTHLY_GIFT_CREDIT} 点`
  );
}

/**
 * 清空用户的 gift_credit（设置为 0）
 * 使用 transaction 防止并发问题
 * @param {string} uid 用户 ID
 */
export async function clearGiftCredit(uid: string): Promise<void> {
  const creditsRef = db.doc(`${COLLECTIONS.CREDITS}/${uid}`);

  await db.runTransaction(async (transaction) => {
    const creditsDoc = await transaction.get(creditsRef);

    if (!creditsDoc.exists) {
      // 如果文档不存在，创建新文档（gift_credit 为 0）
      const now = admin.firestore.FieldValue.serverTimestamp();
      const initialCredits: CreditsDoc = {
        gift_credit: 0,
        paid_credit: 0,
        updatedAt: now,
      };
      transaction.set(creditsRef, initialCredits);
    } else {
      // 更新现有文档，清空 gift_credit
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.update(creditsRef, {
        gift_credit: 0,
        updatedAt: now,
      });
    }
  });

  functions.logger.info(`✅ 已清空用户 ${uid} 的 gift_credit`);
}

/**
 * 增加用户的 paid_credit
 * 使用 transaction 防止并发问题
 * @param {string} uid 用户 ID
 * @param {number} amount 增加的点数，默认 10
 */
export async function addPaidCredit(
  uid: string,
  amount: number = CREDIT_CONSTANTS.NON_SUBSCRIPTION_PURCHASE_CREDIT
): Promise<void> {
  const creditsRef = db.doc(`${COLLECTIONS.CREDITS}/${uid}`);

  await db.runTransaction(async (transaction) => {
    const creditsDoc = await transaction.get(creditsRef);

    if (!creditsDoc.exists) {
      // 如果文档不存在，创建新文档
      const now = admin.firestore.FieldValue.serverTimestamp();
      const initialCredits: CreditsDoc = {
        gift_credit: 0,
        paid_credit: amount,
        updatedAt: now,
      };
      transaction.set(creditsRef, initialCredits);
    } else {
      // 更新现有文档
      const currentData = creditsDoc.data() as CreditsDoc;
      const newPaidCredit = (currentData.paid_credit || 0) + amount;
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.update(creditsRef, {
        paid_credit: newPaidCredit,
        updatedAt: now,
      });
    }
  });

  functions.logger.info(`✅ 已为用户 ${uid} 增加 ${amount} 点 paid_credit`);
}

/**
 * 使用点数
 * 规则：先用 gift_credit，再用 paid_credit
 * 使用 transaction 防止并发问题
 * @param {string} uid 用户 ID
 * @param {number} amount 使用的点数
 * @return {Promise<Object>} 返回使用结果
 */
export async function useCredits(
  uid: string,
  amount: number
): Promise<{
  success: boolean;
  usedGift: number;
  usedPaid: number;
  remaining: number;
}> {
  const creditsRef = db.doc(`${COLLECTIONS.CREDITS}/${uid}`);

  return await db.runTransaction(async (transaction) => {
    const creditsDoc = await transaction.get(creditsRef);

    if (!creditsDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Credits document not found"
      );
    }

    const currentData = creditsDoc.data() as CreditsDoc;
    const currentGift = currentData.gift_credit || 0;
    const currentPaid = currentData.paid_credit || 0;
    const total = currentGift + currentPaid;

    if (total < amount) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Insufficient credits. Required: ${amount}, ` +
        `Available: ${total}`
      );
    }

    // 先用 gift_credit，再用 paid_credit
    let remaining = amount;
    let usedGift = 0;
    let usedPaid = 0;

    if (currentGift > 0) {
      usedGift = Math.min(currentGift, remaining);
      remaining -= usedGift;
    }

    if (remaining > 0 && currentPaid > 0) {
      usedPaid = Math.min(currentPaid, remaining);
      remaining -= usedPaid;
    }

    // 更新点数
    const now = admin.firestore.FieldValue.serverTimestamp();
    const updates: Partial<CreditsDoc> = {
      updatedAt: now,
    };

    if (usedGift > 0) {
      updates.gift_credit = currentGift - usedGift;
    }

    if (usedPaid > 0) {
      updates.paid_credit = currentPaid - usedPaid;
    }

    transaction.update(creditsRef, updates);

    functions.logger.info(
      `✅ 用户 ${uid} 使用了 ${amount} 点: gift=${usedGift}, paid=${usedPaid}`
    );

    return {
      success: true,
      usedGift,
      usedPaid,
      remaining: 0,
    };
  });
}

/**
 * 退款处理
 * 只计算 paid_credit（从 paid_credit 中扣除）
 * 使用 transaction 防止并发问题
 * @param {string} uid 用户 ID
 * @param {number} amount 退款点数
 */
export async function refundCredits(
  uid: string,
  amount: number
): Promise<void> {
  const creditsRef = db.doc(`${COLLECTIONS.CREDITS}/${uid}`);

  await db.runTransaction(async (transaction) => {
    const creditsDoc = await transaction.get(creditsRef);

    if (!creditsDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Credits document not found"
      );
    }

    const currentData = creditsDoc.data() as CreditsDoc;
    const currentPaid = currentData.paid_credit || 0;

    // 只从 paid_credit 中扣除，不能为负数
    const newPaidCredit = Math.max(0, currentPaid - amount);
    const now = admin.firestore.FieldValue.serverTimestamp();

    transaction.update(creditsRef, {
      paid_credit: newPaidCredit,
      updatedAt: now,
    });
  });

  functions.logger.info(`✅ 已为用户 ${uid} 退款 ${amount} 点 paid_credit`);
}

/**
 * 获取用户的点数信息
 * @param {string} uid 用户 ID
 * @return {Promise<CreditsDoc | null>}
 */
export async function getCredits(uid: string): Promise<CreditsDoc | null> {
  const creditsDoc = await getOrCreateCreditsDoc(uid);
  return creditsDoc.data() || null;
}
