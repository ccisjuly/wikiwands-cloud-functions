import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {COLLECTIONS} from "./types.js";

/**
 * 获取用户商品列表
 */
export const getUserProducts = functions.https.onCall(
  async (data, context) => {
    // 验证用户身份
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const uid = context.auth.uid;

    try {
      const db = admin.firestore();

      // 查询用户的所有商品，按创建时间倒序
      const productsSnapshot = await db
        .collection(COLLECTIONS.PRODUCTS)
        .where("uid", "==", uid)
        .orderBy("created_at", "desc")
        .get();

      // 过滤并映射商品数据，确保只返回属于当前用户的商品（双重安全检查）
      const products = productsSnapshot.docs
        .filter((doc) => {
          const data = doc.data();
          // 额外安全检查：确保商品的 uid 与当前用户匹配
          return data.uid === uid;
        })
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title || "",
            description: data.description || null,
            price: data.price || null, // 向后兼容
            currency: data.currency || null,
            amount: data.amount || null,
            imageUrl: data.image_url || null,
            images: data.images || null,
            url: data.url || "",
            platform: data.platform || "shopify",
            uid: data.uid || null,
            createdAt: data.created_at?.toDate?.()?.toISOString() || null,
            updatedAt: data.updated_at?.toDate?.()?.toISOString() || null,
          };
        });

      return {
        success: true,
        products: products,
        count: products.length,
        message: `Found ${products.length} product(s)`,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      functions.logger.error(`❌ Error getting user products: ${errorMessage}`);
      return {
        success: false,
        products: null,
        count: 0,
        error: errorMessage,
        message: "Failed to get user products",
      };
    }
  }
);

