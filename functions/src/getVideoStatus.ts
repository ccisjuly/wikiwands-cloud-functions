import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {getConfig} from "./config.js";

// 确保 Firebase Admin 已初始化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Callable 函数：获取视频生成状态
 *
 * 功能：
 * 查询指定视频 ID 的生成状态和结果
 *
 * 参数：
 * - videoId: 视频 ID（从 generateVideo 返回）
 */
export const getVideoStatus = functions.https.onCall(
  async (data: {videoId: string}, context) => {
    // 1. 验证用户是否已登录
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "login required"
      );
    }

    const uid = context.auth.uid;

    // 2. 验证参数
    if (!data.videoId || typeof data.videoId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "videoId is required and must be a string"
      );
    }

    try {
      // 3. 从 Firestore 获取视频任务信息
      const videoTaskRef = db.collection("video_tasks").doc(data.videoId);
      const videoTaskDoc = await videoTaskRef.get();

      if (!videoTaskDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Video task not found"
        );
      }

      const videoTaskData = videoTaskDoc.data();

      // 4. 验证视频任务是否属于当前用户
      if (videoTaskData?.uid !== uid) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You don't have permission to access this video"
        );
      }

      // 5. 如果状态是 processing，可以调用 HeyGen API 查询最新状态
      if (videoTaskData?.status === "processing") {
        try {
          const config = getConfig();
          // 根据 HeyGen API 文档，使用 v1 API 查询状态
          // GET /v1/video_status.get?video_id={video_id}
          const heygenApiUrl =
            `${config.heygenApiBaseUrl}/v1/video_status.get?` +
            `video_id=${data.videoId}`;

          functions.logger.info(`查询视频状态: ${heygenApiUrl}`);

          const response = await fetch(heygenApiUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": config.heygenApiKey,
            },
          });

          if (response.ok) {
            // 记录原始响应以便调试
            const responseText = await response.text();
            functions.logger.info(
              "📦 HeyGen API 状态查询响应:",
              responseText.substring(0, 500)
            );

            let result: unknown;
            try {
              result = JSON.parse(responseText);
            } catch (parseError) {
              functions.logger.error(
                "❌ 无法解析状态响应为 JSON:",
                responseText.substring(0, 200)
              );
              throw parseError;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const resultObj = result as any;

            // 处理不同的响应格式
            // 格式1: { code: 100, data: { status: "...", error: {...} } }
            // 格式2: { data: { status: "...", error: {...} } }
            // 格式3: { status: "...", error: {...} }
            let status: string | undefined;
            let videoUrl: string | undefined;
            let progress: number | null = null;
            let errorInfo: {
              code?: string;
              message?: string;
              detail?: string;
            } | null = null;

            // 提取 data 对象（如果存在）
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dataObj: any =
              resultObj.data || (resultObj.code ? null : resultObj);

            if (dataObj) {
              status = dataObj.status;
              videoUrl =
                dataObj.video_url ||
                dataObj.url ||
                dataObj.video_url_caption ||
                null;

              // 提取进度信息（如果有）
              if (dataObj.progress !== undefined) {
                progress = typeof dataObj.progress === "number" ?
                  dataObj.progress : null;
              }

              // 提取错误信息
              if (dataObj.error) {
                errorInfo = {
                  code: dataObj.error.code || dataObj.error.error_code || null,
                  message:
                    dataObj.error.message ||
                    dataObj.error.error_message ||
                    null,
                  detail: dataObj.error.detail || null,
                };

                functions.logger.warn(
                  `⚠️ 视频生成失败 (ID: ${data.videoId}):`,
                  errorInfo
                );
              }
            } else {
              // 直接格式
              status = resultObj.status;
              videoUrl = resultObj.video_url || resultObj.url || null;
              if (resultObj.progress !== undefined) {
                progress = typeof resultObj.progress === "number" ?
                  resultObj.progress : null;
              }
              if (resultObj.error) {
                errorInfo = {
                  code: resultObj.error.code || null,
                  message: resultObj.error.message || null,
                  detail: resultObj.error.detail || null,
                };
              }
            }

            if (status || videoUrl || errorInfo || progress !== null) {
              // 更新 Firestore 中的状态、进度和错误信息
              const updateData: {
                status?: string;
                video_url?: string | null;
                progress?: number | null;
                error_code?: string | null;
                error_message?: string | null;
                error_detail?: string | null;
                updated_at: admin.firestore.FieldValue;
              } = {
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
              };

              if (status) {
                updateData.status = status;
              }
              if (videoUrl !== undefined) {
                updateData.video_url = videoUrl;
              }
              if (progress !== null) {
                updateData.progress = progress;
              }
              if (errorInfo) {
                updateData.error_code = errorInfo.code || null;
                updateData.error_message = errorInfo.message || null;
                updateData.error_detail = errorInfo.detail || null;
              }

              await videoTaskRef.update(updateData);

              // 使用更新后的数据
              const updatedDoc = await videoTaskRef.get();
              const updatedData = updatedDoc.data();

              return {
                success: true,
                video_id: data.videoId,
                status: updatedData?.status || "processing",
                video_url: updatedData?.video_url || null,
                progress: updatedData?.progress ?? null,
                error_code: updatedData?.error_code || null,
                error_message: updatedData?.error_message || null,
                error_detail: updatedData?.error_detail || null,
                created_at:
                  updatedData?.created_at?.toDate?.()?.toISOString() || null,
                updated_at:
                  updatedData?.updated_at?.toDate?.()?.toISOString() || null,
              };
            }
          } else {
            functions.logger.warn(
              `查询视频状态失败: ${response.status} ${response.statusText}`
            );
          }
        } catch (error) {
          // 如果查询失败，继续使用 Firestore 中的数据
          functions.logger.warn(
            "⚠️ 查询 HeyGen API 状态失败，使用 Firestore 数据:",
            error
          );
        }
      }

      // 6. 返回视频任务信息（包括进度和错误信息）
      return {
        success: true,
        video_id: data.videoId,
        status: videoTaskData?.status || "unknown",
        video_url: videoTaskData?.video_url || null,
        progress: videoTaskData?.progress ?? null,
        error_code: videoTaskData?.error_code || null,
        error_message: videoTaskData?.error_message || null,
        error_detail: videoTaskData?.error_detail || null,
        created_at:
          videoTaskData?.created_at?.toDate?.()?.toISOString() || null,
        updated_at:
          videoTaskData?.updated_at?.toDate?.()?.toISOString() || null,
      };
    } catch (error: unknown) {
      functions.logger.error(
        `❌ 获取视频状态失败 (用户: ${uid}, ` +
        `视频ID: ${data.videoId}):`,
        error
      );

      // 如果是已知的 HttpsError，直接抛出
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      // 其他错误转换为 internal 错误
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to get video status: ${errorMessage}`
      );
    }
  }
);

