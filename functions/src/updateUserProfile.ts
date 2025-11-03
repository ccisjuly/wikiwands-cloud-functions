import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {db} from "./entitlements.js";

/**
 * 更新当前登录用户的 profile 信息
 * 客户端通过 Cloud Functions onCall 调用
 */
export const updateUserProfile = functions
  .https.onCall(async (data, context) => {
    // 1. 验证用户是否已登录
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated", "login required"
      );
    }

    const uid = context.auth.uid;
    const {profile} = data;

    // 2. 验证输入数据
    if (!profile || typeof profile !== "object") {
      throw new functions.https.HttpsError(
        "invalid-argument", "profile data is required"
      );
    }

    // 3. 验证 profile 字段（只允许更新特定字段）
    const allowedFields = ["displayName", "email", "photoURL"];
    const profileUpdate: Record<string, string> = {};

    for (const field of allowedFields) {
      if (field in profile && profile[field] !== undefined) {
        // 验证字段类型
        if (typeof profile[field] === "string" || profile[field] === null) {
          profileUpdate[field] = profile[field] || "";
        } else {
          throw new functions.https.HttpsError(
            "invalid-argument",
            `Invalid type for field: ${field}`
          );
        }
      }
    }

    // 如果没有要更新的字段，返回错误
    if (Object.keys(profileUpdate).length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument", "No valid fields to update"
      );
    }

    try {
      // 4. 更新用户 profile
      const userRef = db.doc(`users/${uid}`);
      await userRef.set(
        {
          profile: profileUpdate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );

      // 5. 可选：同步更新 Firebase Auth 中的用户信息
      // 注意：只有 displayName 和 photoURL 可以在 Auth 中更新
      if (profileUpdate.displayName !== undefined ||
          profileUpdate.photoURL !== undefined) {
        try {
          const authUpdate: Record<string, string> = {};
          if (profileUpdate.displayName !== undefined) {
            authUpdate.displayName = profileUpdate.displayName;
          }
          if (profileUpdate.photoURL !== undefined) {
            authUpdate.photoURL = profileUpdate.photoURL;
          }
          if (Object.keys(authUpdate).length > 0) {
            await admin.auth().updateUser(uid, authUpdate);
          }
        } catch (authError) {
          // Auth 更新失败不影响 Firestore 更新
          functions.logger.warn("Failed to update Auth profile:", authError);
        }
      }

      // 6. 获取更新后的完整用户数据
      const updatedDoc = await userRef.get();
      const updatedData = updatedDoc.exists ?
        updatedDoc.data() : null;

      return {
        success: true,
        user: {
          uid,
          profile: updatedData?.profile || null,
          roles: updatedData?.roles || null,
          updatedAt: updatedData?.updatedAt || null,
        },
      };
    } catch (error) {
      functions.logger.error("Error in updateUserProfile:", error);
      throw new functions.https.HttpsError(
        "internal", "Failed to update user profile"
      );
    }
  });

