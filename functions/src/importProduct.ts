import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {COLLECTIONS} from "./types.js";

/**
 * 导入商品到商品库
 */
export const importProduct = functions.https.onCall(
  async (data, context) => {
    // 验证用户身份
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const uid = context.auth.uid;
    const {product} = data;

    if (!product || typeof product !== "object") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Product data is required"
      );
    }

    if (!product.title || typeof product.title !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Product title is required"
      );
    }

    if (!product.url || typeof product.url !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Product URL is required"
      );
    }

    if (!product.platform || typeof product.platform !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Product platform is required"
      );
    }

    try {
      const db = admin.firestore();
      const now = admin.firestore.FieldValue.serverTimestamp();

      // 生成商品 ID
      const productId = `product_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}`;

      // 构建商品文档数据
      const productData: Record<string, unknown> = {
        uid,
        product_id: productId,
        title: product.title,
        url: product.url,
        platform: product.platform,
        created_at: now,
        updated_at: now,
      };

      // 添加可选字段
      if (product.description) {
        productData.description = product.description;
      }
      // 价格字段：优先使用分开的 currency 和 amount
      if (product.currency) {
        productData.currency = product.currency;
      }
      if (product.amount) {
        productData.amount = product.amount;
      }
      // 向后兼容：如果只有 price，也保存
      if (product.price) {
        productData.price = product.price;
      }
      if (product.imageUrl) {
        productData.image_url = product.imageUrl;
      }
      if (product.images && Array.isArray(product.images)) {
        productData.images = product.images;
      }

      // 保存到 Firestore
      await db.collection(COLLECTIONS.PRODUCTS).doc(productId).set(productData);

      functions.logger.info(
        `✅ Product imported: ${productId} for user ${uid}`
      );

      return {
        success: true,
        productId: productId,
        message: "Product imported successfully",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      functions.logger.error(`❌ Error importing product: ${errorMessage}`);
      return {
        success: false,
        productId: null,
        error: errorMessage,
        message: "Failed to import product",
      };
    }
  }
);

