import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {COLLECTIONS} from "./types.js";

// 确保 Firebase Admin 已初始化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Callable 函数：获取用户的消费记录
 *
 * 功能：
 * 从 Firestore 的 transactions 集合中获取当前用户的所有交易记录
 * 包括：消费记录、购买记录、发放记录
 *
 * 返回：
 * - 交易记录列表（包含 type, amount, used_gift, used_paid,
 *   usage_type, usage_id, added_paid, product_id, purchase_id,
 *   added_gift, reason, created_at 等）
 */
export const getUserTransactions = functions.https.onCall(
  async (data, context) => {
    // 1. 验证用户是否已登录
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "login required"
      );
    }

    const uid = context.auth.uid;

    try {
      // 2. 从 transactions 集合中查询该用户的所有记录
      // 注意：不使用 orderBy 以避免需要复合索引，我们在内存中排序
      let transactionsSnapshot: admin.firestore.QuerySnapshot;
      try {
        transactionsSnapshot = await db
          .collection(COLLECTIONS.TRANSACTIONS)
          .where("uid", "==", uid)
          .get();
      } catch (error) {
        // 如果集合不存在或查询失败，返回空结果
        functions.logger.warn("查询 transactions 集合失败:", error);
        return {
          success: true,
          transactions: [],
          count: 0,
        };
      }

      // 3. 转换为数组并按时间排序
      const transactions = transactionsSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            type: data.type || "unknown",
            amount: data.amount || 0,
            // 消费记录字段
            used_gift: data.used_gift || 0,
            used_paid: data.used_paid || 0,
            usage_type: data.usage_type || null,
            usage_id: data.usage_id || null,
            // 购买记录字段
            added_paid: data.added_paid || 0,
            product_id: data.product_id || null,
            purchase_id: data.purchase_id || null,
            // 发放记录字段
            added_gift: data.added_gift || 0,
            reason: data.reason || null,
            created_at: data.created_at?.toDate?.()?.toISOString() || null,
          };
        })
        .sort((a, b) => {
          if (!a.created_at && !b.created_at) return 0;
          if (!a.created_at) return 1;
          if (!b.created_at) return -1;
          // created_at 已经是 ISO8601 字符串，可以直接比较
          return b.created_at.localeCompare(a.created_at);
        });

      functions.logger.info(
        `✅ 获取用户交易记录 (用户: ${uid}, 数量: ${transactions.length})`
      );

      return {
        success: true,
        transactions: transactions.map((txn) => ({
          id: txn.id,
          type: txn.type,
          amount: txn.amount,
          // 消费记录字段
          used_gift: txn.used_gift,
          used_paid: txn.used_paid,
          usage_type: txn.usage_type,
          usage_id: txn.usage_id,
          // 购买记录字段
          added_paid: txn.added_paid,
          product_id: txn.product_id,
          purchase_id: txn.purchase_id,
          // 发放记录字段
          added_gift: txn.added_gift,
          reason: txn.reason,
          created_at: txn.created_at,
        })),
        count: transactions.length,
      };
    } catch (error: unknown) {
      functions.logger.error(
        `❌ 获取用户消费记录失败 (用户: ${uid}):`,
        error
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to get user transactions: ${errorMessage}`
      );
    }
  }
);

