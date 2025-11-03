import * as functions from "firebase-functions/v1";
import {db} from "./entitlements.js";

/**
 * 获取当前登录用户的完整信息
 * 包括用户资料、角色和权限信息
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
      // 2. 并行获取用户信息和权限信息
      const [userSnapshot, entitlementsSnapshot] = await Promise.all([
        db.doc(`users/${uid}`).get(),
        db.doc(`entitlements/${uid}`).get(),
      ]);

      // 3. 构建返回数据
      const userData = userSnapshot.exists ?
        userSnapshot.data() : null;
      const entitlementsData = entitlementsSnapshot.exists ?
        entitlementsSnapshot.data() : null;

      // 4. 返回完整的用户信息
      return {
        success: true,
        user: {
          uid,
          profile: userData?.profile || null,
          roles: userData?.roles || null,
          updatedAt: userData?.updatedAt || null,
        },
        entitlements: {
          products: entitlementsData?.products || {},
          tags: entitlementsData?.tags || [],
          updatedAt: entitlementsData?.updatedAt || null,
        },
      };
    } catch (error) {
      functions.logger.error("Error in getUserProfile:", error);
      throw new functions.https.HttpsError(
        "internal", "Failed to fetch user profile"
      );
    }
  });

