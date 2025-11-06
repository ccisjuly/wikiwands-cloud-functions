import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {resetGiftCredit} from "./credits.js";
import {COLLECTIONS} from "./types.js";

const db = admin.firestore();

/**
 * 定时任务：每月重置有激活权益的用户的 gift_credit
 * 运行时间：每月 1 号 00:00 UTC
 *
 * 从 users/{uid} 文档中读取 entitlements 数据
 */
export const refreshMonthlyCredits = functions.pubsub
  .schedule("0 0 1 * *")
  .timeZone("UTC")
  .onRun(async () => {
    functions.logger.info("🔄 开始执行每月点数重置任务...");

    try {
      // 获取所有用户文档
      const usersSnapshot = await db
        .collection(COLLECTIONS.USERS)
        .get();

      let processedCount = 0;
      let errorCount = 0;

      // 辅助函数：判断权益是否激活（基于 expires_date）
      const isEntitlementActive = (
        expiresDate: string | null | undefined
      ): boolean => {
        if (!expiresDate) return false;
        try {
          const expiry = new Date(expiresDate);
          return expiry > new Date();
        } catch {
          return false;
        }
      };

      for (const doc of usersSnapshot.docs) {
        const uid = doc.id;
        const userData = doc.data();

        // 检查是否有激活的权益（从 entitlements 字段读取）
        const entitlements = userData.entitlements || {};
        const hasActiveEntitlement = Object.values(entitlements).some(
          (entitlement: unknown) => {
            // 基于 expires_date 判断权益是否激活
            const entitlementData =
              entitlement as Record<string, unknown>;
            return isEntitlementActive(
              entitlementData.expires_date as string | null | undefined
            );
          }
        );

        if (hasActiveEntitlement) {
          try {
            await resetGiftCredit(uid);
            processedCount++;
            functions.logger.info(`✅ 已重置用户 ${uid} 的 gift_credit`);
          } catch (error: unknown) {
            functions.logger.error(
              `❌ 重置用户 ${uid} 的点数失败:`,
              error
            );
            errorCount++;
          }
        }
      }

      functions.logger.info(
        `✅ 每月点数重置任务完成: 处理 ${processedCount} 个用户, 错误 ${errorCount} 个`
      );

      return null;
    } catch (error: unknown) {
      functions.logger.error("❌ 每月点数重置任务失败:", error);
      throw error;
    }
  });
