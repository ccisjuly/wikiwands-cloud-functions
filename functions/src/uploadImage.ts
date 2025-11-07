import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {getStorage} from "firebase-admin/storage";

// 确保 Firebase Admin 已初始化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = getStorage();

/**
 * Callable 函数：上传图片并保存到 Firestore
 *
 * 功能：
 * 1. 接收图片的 base64 数据或 Storage URL
 * 2. 如果提供 base64，上传到 Firebase Storage
 * 3. 保存图片信息到 Firestore 的 user_images 集合
 * 4. 返回图片 URL 和图片 ID
 *
 * 参数：
 * - imageData: base64 编码的图片数据（可选）
 * - imageUrl: 已上传的图片 URL（可选，如果提供则直接使用）
 * - fileName: 文件名（可选）
 */
export const uploadImage = functions.https.onCall(
  async (
    data: {
      imageData?: string; // base64 编码
      imageUrl?: string; // 已上传的 URL
      fileName?: string;
    },
    context
  ) => {
    // 1. 验证用户是否已登录
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "login required"
      );
    }

    const uid = context.auth.uid;

    // 2. 验证参数
    if (!data.imageData && !data.imageUrl) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "imageData or imageUrl is required"
      );
    }

    try {
      let imageUrl: string;
      let imageId: string;

      // 3. 如果提供了 imageUrl，直接使用
      if (data.imageUrl) {
        imageUrl = data.imageUrl;
        imageId =
          `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      } else if (data.imageData) {
        // 4. 如果提供了 base64 数据，上传到 Storage
        const bucket = storage.bucket();
        const fileName = data.fileName || `image_${Date.now()}.jpg`;
        const filePath = `video_generation/${uid}/${fileName}`;
        const file = bucket.file(filePath);

        // 解码 base64 数据
        const base64Data = data.imageData.replace(
          /^data:image\/\w+;base64/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // 上传文件
        await file.save(buffer, {
          metadata: {
            contentType: "image/jpeg",
          },
        });

        // 获取下载 URL
        await file.makePublic();
        imageUrl =
          `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        imageId =
          `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      } else {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Either imageData or imageUrl must be provided"
        );
      }

      // 5. 保存图片信息到 Firestore
      const imageRef = db.collection("user_images").doc(imageId);
      await imageRef.set({
        uid,
        image_id: imageId,
        image_url: imageUrl,
        file_name: data.fileName || null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(
        `✅ 图片上传成功 (用户: ${uid}, 图片ID: ${imageId})`
      );

      return {
        success: true,
        image_id: imageId,
        image_url: imageUrl,
      };
    } catch (error: unknown) {
      functions.logger.error(
        `❌ 图片上传失败 (用户: ${uid}):`,
        error
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to upload image: ${errorMessage}`
      );
    }
  }
);

