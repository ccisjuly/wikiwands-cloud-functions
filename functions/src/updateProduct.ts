import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {COLLECTIONS} from "./types.js";

/**
 * 更新商品信息
 */
export const updateProduct = functions.https.onCall(
  async (data, context) => {
    // 验证用户身份
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const uid = context.auth.uid;
    const {productId, product} = data;

    if (!productId || typeof productId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Product ID is required"
      );
    }

    if (!product || typeof product !== "object") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Product data is required"
      );
    }

    try {
      const db = admin.firestore();
      const productRef = db.collection(COLLECTIONS.PRODUCTS).doc(productId);

      // 检查商品是否存在且属于当前用户
      const productDoc = await productRef.get();
      if (!productDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Product not found"
        );
      }

      const productData = productDoc.data();
      if (productData?.uid !== uid) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You don't have permission to update this product"
        );
      }

      // 构建更新数据
      const updateData: Record<string, unknown> = {
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      // 更新字段（只更新提供的字段）
      if (product.title !== undefined) {
        updateData.title = product.title;
      }
      if (product.description !== undefined) {
        updateData.description = product.description || null;
      }
      // 价格字段：优先使用分开的 currency 和 amount
      if (product.currency !== undefined) {
        updateData.currency = product.currency || null;
      }
      if (product.amount !== undefined) {
        updateData.amount = product.amount || null;
      }
      // 向后兼容：如果只有 price，也更新
      if (product.price !== undefined) {
        updateData.price = product.price || null;
      }
      if (product.imageUrl !== undefined) {
        updateData.image_url = product.imageUrl || null;
      }
      if (product.images !== undefined) {
        updateData.images = product.images || null;
      }
      // URL 不允许修改，所以不更新

      // 更新商品
      await productRef.update(updateData);

      functions.logger.info(
        `✅ Product updated: ${productId} for user ${uid}`
      );

      return {
        success: true,
        message: "Product updated successfully",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      functions.logger.error(`❌ Error updating product: ${errorMessage}`);

      // 如果是 HttpsError，直接抛出
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      return {
        success: false,
        error: errorMessage,
        message: "Failed to update product",
      };
    }
  }
);

