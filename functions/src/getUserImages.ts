import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

// 确保 Firebase Admin 已初始化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Callable 函数：获取当前用户上传的图片列表
 *
 * 功能：
 * 从 Firestore 的 user_images 集合中获取当前用户上传的所有图片
 *
 * 返回：
 * - 图片列表（包含 image_url, image_id, created_at 等）
 */
export const getUserImages = functions.https.onCall(
  async (data, context) => {
    // 1. 验证用户是否已登录
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "login required"
      );
    }

    const uid = context.auth.uid;

    try {
      // 2. 从 user_images 集合中查询该用户的所有图片
      // 注意：不使用 orderBy 以避免需要复合索引，我们在内存中排序
      let userImagesSnapshot: admin.firestore.QuerySnapshot;
      try {
        userImagesSnapshot = await db
          .collection("user_images")
          .where("uid", "==", uid)
          .get();
      } catch (error) {
        // 如果集合不存在或查询失败，返回空数组
        functions.logger.warn("查询 user_images 集合失败:", error);
        return {
          success: true,
          images: [],
          count: 0,
        };
      }

      // 3. 转换为数组并按时间排序
      const images = userImagesSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            image_id: data.image_id || doc.id,
            image_url: data.image_url || "",
            created_at: data.created_at || null,
          };
        })
        .filter((img) => img.image_url) // 过滤掉没有 URL 的图片
        .sort((a, b) => {
          if (!a.created_at && !b.created_at) return 0;
          if (!a.created_at) return 1;
          if (!b.created_at) return -1;
          return b.created_at.toMillis() - a.created_at.toMillis();
        });

      functions.logger.info(
        `✅ 获取用户图片列表 (用户: ${uid}, 数量: ${images.length})`
      );

      return {
        success: true,
        images: images.map((img) => ({
          image_id: img.image_id,
          image_url: img.image_url,
          created_at:
            img.created_at?.toDate?.()?.toISOString() || null,
        })),
        count: images.length,
      };
    } catch (error: unknown) {
      functions.logger.error(
        `❌ 获取用户图片列表失败 (用户: ${uid}):`,
        error
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to get user images: ${errorMessage}`
      );
    }
  }
);

