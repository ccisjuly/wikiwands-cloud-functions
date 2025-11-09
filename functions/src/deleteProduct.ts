import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {COLLECTIONS} from "./types.js";

/**
 * 删除商品
 */
export const deleteProduct = functions.https.onCall(
  async (data, context) => {
    // 验证用户身份
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const uid = context.auth.uid;
    const {productId} = data;

    if (!productId || typeof productId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Product ID is required"
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
          "You don't have permission to delete this product"
        );
      }

      // 删除商品
      await productRef.delete();

      functions.logger.info(
        `✅ Product deleted: ${productId} for user ${uid}`
      );

      return {
        success: true,
        message: "Product deleted successfully",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      functions.logger.error(`❌ Error deleting product: ${errorMessage}`);

      // 如果是 HttpsError，直接抛出
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      return {
        success: false,
        error: errorMessage,
        message: "Failed to delete product",
      };
    }
  }
);

