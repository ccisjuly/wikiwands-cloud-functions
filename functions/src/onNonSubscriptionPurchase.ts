import * as functions from "firebase-functions/v1";
import {addPaidCredit} from "./credits.js";
import {COLLECTIONS} from "./types.js";

/**
 * 监听 users/{uid} 文档的更新事件
 * RevenueCat Firebase Extension 会将用户数据（包括 non_subscriptions）写入到此文档
 * 当检测到新的非订阅购买时，增加用户的 paid_credit
 */
export const onNonSubscriptionPurchase = functions.firestore
  .document(`${COLLECTIONS.USERS}/{uid}`)
  .onUpdate(async (change, context) => {
    const uid = context.params.uid;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    functions.logger.info(`📦 检测到用户数据更新: ${uid}`);

    try {
      const beforeNonSubscriptions = beforeData.non_subscriptions || {};
      const afterNonSubscriptions = afterData.non_subscriptions || {};

      // 检查是否有新的非订阅购买
      const newPurchases: Array<{
        productId: string;
        purchaseId?: string;
      }> = [];

      // 遍历所有产品
      for (const [productId, afterPurchases] of Object.entries(
        afterNonSubscriptions
      )) {
        const beforePurchases =
          beforeNonSubscriptions[productId] || [];
        const afterPurchasesArray =
          afterPurchases as Array<Record<string, unknown>>;

        // 如果购买记录数量增加了，说明有新购买
        const beforePurchasesArray =
          beforePurchases as Array<Record<string, unknown>>;
        if (afterPurchasesArray.length > beforePurchasesArray.length) {
          // 获取最新的购买记录
          const latestPurchase =
            afterPurchasesArray[afterPurchasesArray.length - 1];
          const purchaseId =
            (latestPurchase.id as string) ||
            (latestPurchase.store_transaction_id as string) ||
            undefined;

          newPurchases.push({
            productId,
            purchaseId,
          });

          functions.logger.info(
            `✅ 检测到新的非订阅购买: ${productId} (用户: ${uid})`,
            {
              beforeCount: beforePurchasesArray.length,
              afterCount: afterPurchasesArray.length,
              purchaseId,
            }
          );
        }
      }

      // 如果有新购买，为每个购买增加 paid_credit
      if (newPurchases.length > 0) {
        functions.logger.info(
          `💰 检测到 ${newPurchases.length} 个新的非订阅购买，为用户 ${uid} 增加点数`,
          {purchases: newPurchases}
        );

        // 为每个新购买增加点数（通常每个购买增加 10 点）
        for (const purchase of newPurchases) {
          await addPaidCredit(
            uid,
            undefined, // 使用默认值
            purchase.productId,
            purchase.purchaseId
          );
        }

        functions.logger.info(`✅ 已为用户 ${uid} 增加 paid_credit`);
      } else {
        functions.logger.info(
          `ℹ️ 用户 ${uid} 的数据更新，但没有新的非订阅购买，跳过处理`
        );
      }

      return null;
    } catch (error: unknown) {
      functions.logger.error(
        `❌ 处理非订阅购买事件失败 (用户: ${uid}):`,
        error
      );
      // 不抛出错误，避免重试导致重复处理
      return null;
    }
  });

