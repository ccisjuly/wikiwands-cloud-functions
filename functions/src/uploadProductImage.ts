import * as functions from "firebase-functions/v1";
import {getStorage} from "firebase-admin/storage";

/**
 * 下载图片并上传到 Firebase Storage
 * 用于商品图片导入流程
 */
export const uploadProductImage = functions.https.onCall(
  async (data, context) => {
    // 验证用户身份
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const uid = context.auth.uid;
    const {imageUrl} = data;

    if (!imageUrl || typeof imageUrl !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "imageUrl is required"
      );
    }

    try {
      const storage = getStorage();
      const bucket = storage.bucket();

      // 下载图片
      functions.logger.info(`📥 Downloading image from: ${imageUrl}`);
      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "image/jpeg";

      // 生成文件名
      const fileName = `product_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}.${getFileExtension(contentType)}`;
      const filePath = `products/${uid}/${fileName}`;
      const file = bucket.file(filePath);

      // 上传到 Firebase Storage
      functions.logger.info(`📤 Uploading image to: ${filePath}`);
      await file.save(imageBuffer, {
        metadata: {
          contentType: contentType,
        },
      });

      // 设置为公开访问
      await file.makePublic();

      // 获取下载 URL
      // eslint-disable-next-line max-len
      const firebaseUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      functions.logger.info(`✅ Image uploaded successfully: ${firebaseUrl}`);

      return {
        success: true,
        imageUrl: firebaseUrl,
        message: "Image uploaded successfully",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line max-len
      functions.logger.error(`❌ Error uploading product image: ${errorMessage}`);
      return {
        success: false,
        imageUrl: null,
        error: errorMessage,
        message: "Failed to upload image",
      };
    }
  }
);

/**
 * 根据 content-type 获取文件扩展名
 * @param {string} contentType - 文件的 content-type
 * @return {string} 文件扩展名
 */
function getFileExtension(contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };

  return extensions[contentType.toLowerCase()] || "jpg";
}

