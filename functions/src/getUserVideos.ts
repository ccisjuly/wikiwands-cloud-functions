import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {getConfig} from "./config.js";

// 确保 Firebase Admin 已初始化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Callable 函数：获取当前用户的视频列表
 *
 * 功能：
 * 从 Firestore 的 video_tasks 集合中获取当前用户的所有视频
 * 对于 processing 状态的视频，会查询 HeyGen API 获取最新状态和进度
 *
 * 返回：
 * - 视频列表（包含 video_id, video_url, status, progress 等）
 */
export const getUserVideos = functions.https.onCall(
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
      // 2. 从 video_tasks 集合中查询该用户的所有任务
      // 注意：不使用 orderBy 以避免需要复合索引，我们在内存中排序
      let videoTasksSnapshot;
      try {
        videoTasksSnapshot = await db
          .collection("video_tasks")
          .where("uid", "==", uid)
          .get();
      } catch (error) {
        // 如果集合不存在或查询失败，返回空结果
        functions.logger.error("查询 video_tasks 集合失败:", error);
        throw error;
      }

      const videos: Array<{
        video_id: string;
        video_url: string | null;
        status: string;
        progress: number | null;
        image_url: string | null;
        script: string | null;
        avatar_id: string | null;
        voice_id: string | null;
        error_code: string | null;
        error_message: string | null;
        error_detail: string | null;
        created_at: string | null;
        updated_at: string | null;
      }> = [];

      // 3. 获取配置（用于查询 processing 状态的视频）
      let config;
      try {
        config = getConfig();
      } catch (error) {
        functions.logger.warn("无法获取配置，跳过 API 查询");
      }

      // 4. 处理每个视频任务
      for (const doc of videoTasksSnapshot.docs) {
        const data = doc.data();
        const videoId = doc.id;
        const status = data.status || "unknown";

        let progress: number | null = null;
        let videoUrl = data.video_url || null;
        let errorCode = data.error_code || null;
        let errorMessage = data.error_message || null;
        let errorDetail = data.error_detail || null;

        // 5. 如果状态是 processing 且有配置，查询 HeyGen API 获取最新状态
        if (status === "processing" && config) {
          try {
            const heygenApiUrl =
              `${config.heygenApiBaseUrl}/v1/video_status.get?` +
              `video_id=${videoId}`;

            const response = await fetch(heygenApiUrl, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "X-Api-Key": config.heygenApiKey,
              },
            });

            if (response.ok) {
              const result = await response.json() as {
                code?: number;
                data?: {
                  status?: string;
                  video_url?: string;
                  progress?: number;
                  error?: {
                    code?: string;
                    message?: string;
                    detail?: string;
                  };
                };
              };

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const dataObj: any = result.data || result;

              if (dataObj) {
                // 更新状态
                const latestStatus = dataObj.status || status;
                videoUrl = dataObj.video_url || dataObj.url || videoUrl;

                // 提取进度（如果有）
                if (dataObj.progress !== undefined) {
                  progress = typeof dataObj.progress === "number" ?
                    dataObj.progress : null;
                }

                // 提取错误信息
                if (dataObj.error) {
                  errorCode = dataObj.error.code || null;
                  errorMessage = dataObj.error.message || null;
                  errorDetail = dataObj.error.detail || null;
                }

                // 更新 Firestore（异步，不阻塞返回）
                doc.ref.update({
                  status: latestStatus,
                  video_url: videoUrl,
                  progress: progress,
                  error_code: errorCode,
                  error_message: errorMessage,
                  error_detail: errorDetail,
                  updated_at: admin.firestore.FieldValue.serverTimestamp(),
                }).catch((err) => {
                  functions.logger.warn(
                    `更新视频 ${videoId} 状态失败:`,
                    err
                  );
                });
              }
            }
          } catch (error) {
            // API 查询失败不影响返回结果
            functions.logger.warn(
              `查询视频 ${videoId} 状态失败:`,
              error
            );
          }
        } else if (data.progress !== undefined) {
          // 如果 Firestore 中已有进度信息
          progress = typeof data.progress === "number" ? data.progress : null;
        }

        videos.push({
          video_id: videoId,
          video_url: videoUrl,
          status: status,
          progress: progress,
          image_url: data.image_url || null,
          script: data.script || null,
          avatar_id: data.avatar_id || null,
          voice_id: data.voice_id || null,
          error_code: errorCode,
          error_message: errorMessage,
          error_detail: errorDetail,
          created_at:
            data.created_at?.toDate?.()?.toISOString() || null,
          updated_at:
            data.updated_at?.toDate?.()?.toISOString() || null,
        });
      }

      // 6. 按创建时间排序（降序）并限制数量
      videos.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA; // 降序
      });

      // 限制最多返回 100 条
      const limitedVideos = videos.slice(0, 100);

      functions.logger.info(
        `✅ 获取用户视频列表 (用户: ${uid}, 数量: ${limitedVideos.length})`
      );

      return {
        success: true,
        videos: limitedVideos,
        count: limitedVideos.length,
      };
    } catch (error: unknown) {
      functions.logger.error(
        `❌ 获取用户视频列表失败 (用户: ${uid}):`,
        error
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to get user videos: ${errorMessage}`
      );
    }
  }
);

