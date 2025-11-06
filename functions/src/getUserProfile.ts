import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {getCredits} from "./credits.js";

// 确保 Firebase Admin 已初始化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 获取当前登录用户的完整信息
 * 包括用户资料、角色、订阅和权益信息
 *
 * 数据结构基于 RevenueCat 的 customer info 格式
 */
export const getUserProfile = functions
  .https.onCall(async (data, context) => {
    // 1. 验证用户是否已登录
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated", "login required"
      );
    }

    const uid = context.auth.uid;

    try {
      // 2. 获取用户文档（包含 profile, roles, aliases, entitlements, subscriptions）
      const userSnapshot = await db.doc(`users/${uid}`).get();

      if (!userSnapshot.exists) {
        // 如果用户文档不存在，返回基本结构
        const credits = await getCredits(uid);
        return {
          success: true,
          aliases: [uid],
          entitlements: {},
          subscriptions: {},
          nonSubscriptions: {},
          otherPurchases: {},
          profile: null,
          roles: null,
          originalAppUserId: uid,
          originalApplicationVersion: null,
          originalPurchaseDate: null,
          updatedAt: null,
          credits: credits ? {
            gift_credit: credits.gift_credit || 0,
            paid_credit: credits.paid_credit || 0,
            last_gift_reset:
              credits.last_gift_reset?.toDate?.()?.toISOString() || null,
          } : {
            gift_credit: 0,
            paid_credit: 0,
            last_gift_reset: null,
          },
        };
      }

      const userData = userSnapshot.data() || {};

      // 3. 获取点数信息
      const credits = await getCredits(uid);

      // 4. 构建返回数据（匹配 RevenueCat customer info 格式）
      return {
        success: true,
        aliases: userData.aliases || [uid],
        entitlements: userData.entitlements || {},
        subscriptions: userData.subscriptions || {},
        nonSubscriptions: userData.non_subscriptions ||
                          userData.nonSubscriptions ||
                          {},
        otherPurchases: userData.other_purchases ||
                       userData.otherPurchases ||
                       {},
        profile: userData.profile || null,
        roles: userData.roles || null,
        originalAppUserId: userData.original_app_user_id ||
                           userData.originalAppUserId ||
                           uid,
        originalApplicationVersion:
          userData.original_application_version ||
          userData.originalApplicationVersion ||
          null,
        originalPurchaseDate: userData.original_purchase_date ||
                              userData.originalPurchaseDate ||
                              null,
        updatedAt: userData.updatedAt || null,
        credits: credits ? {
          gift_credit: credits.gift_credit || 0,
          paid_credit: credits.paid_credit || 0,
          last_gift_reset:
            credits.last_gift_reset?.toDate?.()?.toISOString() || null,
        } : {
          gift_credit: 0,
          paid_credit: 0,
          last_gift_reset: null,
        },
      };
    } catch (error) {
      functions.logger.error("Error in getUserProfile:", error);
      throw new functions.https.HttpsError(
        "internal", "Failed to fetch user profile"
      );
    }
  });

