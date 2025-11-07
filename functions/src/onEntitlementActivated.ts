import * as functions from "firebase-functions/v1";
import {resetGiftCredit, clearGiftCredit} from "./credits.js";
import {COLLECTIONS} from "./types.js";

/**
 * 监听 users/{uid} 文档的更新事件
 * RevenueCat Firebase Extension 会将用户数据（包括 entitlements）写入到此文档
 * 当检测到权益激活时，重置用户的 gift_credit 为 10 点
 * 当检测到权益消失时，清空用户的 gift_credit 为 0 点
 *
 * 注意：
 * - 这个函数监听的是 RevenueCat Extension 写入到 users/{uid} 的权益数据
 * - 会在权益状态变化时触发，包括激活和过期
 * - 权益激活时：重置 gift_credit 为 10 点
 * - 权益消失时：清空 gift_credit 为 0 点
 * - 权益激活判断：检查 expires_date 是否在未来
 */
export const onEntitlementActivated = functions.firestore
  .document(`${COLLECTIONS.USERS}/{uid}`)
  .onUpdate(async (change, context) => {
    const uid = context.params.uid;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    functions.logger.info(`🔄 检测到用户数据更新: ${uid}`);

    try {
      const beforeEntitlements = beforeData.entitlements || {};
      const afterEntitlements = afterData.entitlements || {};

      // 详细日志：打印权益数据
      const beforeKeys = Object.keys(beforeEntitlements);
      const afterKeys = Object.keys(afterEntitlements);
      functions.logger.info(
        `📊 更新前权益数量: ${beforeKeys.length}`
      );
      functions.logger.info(
        `📊 更新后权益数量: ${afterKeys.length}`
      );
      functions.logger.info(
        `📊 更新前权益: ${JSON.stringify(beforeKeys)}`
      );
      functions.logger.info(
        `📊 更新后权益: ${JSON.stringify(afterKeys)}`
      );

      // 打印每个权益的详细信息
      for (const [key, value] of Object.entries(afterEntitlements)) {
        const entitlement = value as Record<string, unknown>;
        functions.logger.info(
          `📋 权益 ${key}:`,
          {
            expires_date: entitlement.expires_date,
            product_identifier: entitlement.product_identifier,
            purchase_date: entitlement.purchase_date,
            is_active: entitlement.is_active,
            allFields: Object.keys(entitlement),
          }
        );
      }

      // 检查是否有权益从非激活变为激活
      let hasNewlyActivated = false;
      const activatedEntitlements: string[] = [];

      // 检查是否有权益从激活变为非激活（消失）
      let hasExpired = false;
      const expiredEntitlements: string[] = [];

      // 辅助函数：判断权益是否激活
      // 优先检查 is_active 字段，如果没有则检查 expires_date
      const isEntitlementActive = (
        entitlement: Record<string, unknown>
      ): boolean => {
        // 优先使用 is_active 字段（如果存在）
        if (typeof entitlement.is_active === "boolean") {
          return entitlement.is_active;
        }

        // 如果没有 is_active，则检查 expires_date
        const expiresDate = entitlement.expires_date as
          string | null | undefined;
        if (!expiresDate) return false;
        try {
          const expiry = new Date(expiresDate);
          const now = new Date();
          const isActive = expiry > now;
          functions.logger.info(
            `🔍 检查 expires_date: ${expiresDate}, ` +
            `解析后: ${expiry.toISOString()}, ` +
            `当前: ${now.toISOString()}, ` +
            `激活: ${isActive}`
          );
          return isActive;
        } catch (error) {
          functions.logger.warn(
            `⚠️ 解析 expires_date 失败: ${expiresDate}`,
            error
          );
          return false;
        }
      };

      // 检查所有权益
      for (const [entitlementKey, afterEntitlement] of Object.entries(
        afterEntitlements
      )) {
        const beforeEntitlement =
          beforeEntitlements[entitlementKey] as
            Record<string, unknown> | undefined;
        const afterEntitlementData =
          afterEntitlement as Record<string, unknown>;

        // 判断权益现在是否激活
        const isNowActive = isEntitlementActive(afterEntitlementData);

        // 判断权益之前是否激活
        const wasActive = beforeEntitlement ?
          isEntitlementActive(beforeEntitlement) :
          false;

        functions.logger.info(
          `🔍 权益 ${entitlementKey}: ` +
          `之前激活=${wasActive}, ` +
          `现在激活=${isNowActive}, ` +
          `之前存在=${!!beforeEntitlement}`
        );

        if (isNowActive) {
          // 检查之前是否未激活（包括首次创建的情况）
          if (!wasActive) {
            hasNewlyActivated = true;
            activatedEntitlements.push(entitlementKey);
            functions.logger.info(
              `✅ 检测到权益激活: ${entitlementKey} (用户: ${uid})`,
              {
                expiresDate: afterEntitlementData.expires_date,
                isActive: afterEntitlementData.is_active,
                productIdentifier: afterEntitlementData.product_identifier,
                isNewEntitlement: !beforeEntitlement,
              }
            );
          }
        } else if (wasActive) {
          // 权益从激活变为非激活（消失）
          hasExpired = true;
          expiredEntitlements.push(entitlementKey);
          functions.logger.info(
            `⚠️ 检测到权益消失: ${entitlementKey} (用户: ${uid})`,
            {
              beforeExpiresDate: beforeEntitlement?.expires_date,
              afterExpiresDate: afterEntitlementData.expires_date,
            }
          );
        }
      }

      // 检查是否有权益被删除（在 before 中存在，但在 after 中不存在）
      for (const [entitlementKey, beforeEntitlement] of Object.entries(
        beforeEntitlements
      )) {
        if (!afterEntitlements[entitlementKey]) {
          // 权益被删除
          const wasActive = isEntitlementActive(
            beforeEntitlement as Record<string, unknown>
          );
          if (wasActive) {
            hasExpired = true;
            expiredEntitlements.push(entitlementKey);
            functions.logger.info(
              `⚠️ 检测到权益被删除: ${entitlementKey} (用户: ${uid})`
            );
          }
        }
      }

      // 如果有新激活的权益，重置 gift_credit
      if (hasNewlyActivated) {
        functions.logger.info(
          `🎁 检测到 ${activatedEntitlements.length} 个权益激活，` +
          `重置用户 ${uid} 的 gift_credit 为 10 点`,
          {entitlements: activatedEntitlements}
        );
        await resetGiftCredit(uid);
        functions.logger.info(`✅ 已重置用户 ${uid} 的 gift_credit`);
      }

      // 如果有权益消失，清空 gift_credit
      if (hasExpired) {
        functions.logger.info(
          `🗑️ 检测到 ${expiredEntitlements.length} 个权益消失，` +
          `清空用户 ${uid} 的 gift_credit`,
          {entitlements: expiredEntitlements}
        );
        await clearGiftCredit(uid);
        functions.logger.info(`✅ 已清空用户 ${uid} 的 gift_credit`);
      }

      // 如果既没有激活也没有消失，记录日志
      if (!hasNewlyActivated && !hasExpired) {
        functions.logger.info(
          `ℹ️ 用户 ${uid} 的数据更新，但权益状态无变化，跳过处理`
        );
      }

      return null;
    } catch (error: unknown) {
      functions.logger.error(
        `❌ 处理权益激活事件失败 (用户: ${uid}):`,
        error
      );
      // 不抛出错误，避免重试
      return null;
    }
  });

