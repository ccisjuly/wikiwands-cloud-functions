import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {getConfig} from "./config.js";
import {useCredits as useCreditsInternal} from "./credits.js";

// 确保 Firebase Admin 已初始化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// 视频生成所需点数
const VIDEO_GENERATION_CREDITS = 5;

/**
 * HeyGen API 视频生成请求参数
 */
interface GenerateVideoRequest {
  /** 商品图片 URL（已上传到 Firebase Storage 或其他存储服务） */
  imageUrl: string;
  /** 商品介绍脚本 */
  script: string;
  /** Avatar ID（用户选择的虚拟形象 ID） */
  avatarId: string;
  /** Voice ID（用户选择的声音 ID，可选，如果不提供则使用默认值） */
  voiceId?: string;
}

// HeyGenVideoResponse 接口已移除，使用动态类型检查

/**
 * Callable 函数：生成视频
 *
 * 功能：
 * 1. 接收用户上传的商品图片 URL
 * 2. 接收商品介绍脚本
 * 3. 接收用户选择的 Avatar ID
 * 4. 调用 HeyGen API 生成视频
 * 5. 保存视频生成任务到 Firestore
 *
 * 注意：
 * - 需要设置环境变量 HEYGEN_API_KEY
 * - 图片需要先上传到 Firebase Storage 或其他存储服务
 */
export const generateVideo = functions.https.onCall(
  async (data: GenerateVideoRequest, context) => {
    // 1. 验证用户是否已登录
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "login required"
      );
    }

    const uid = context.auth.uid;

    // 2. 检查并扣除点数（在生成视频前）
    // 注意：useCreditsInternal 内部已经会记录到 transactions 集合
    // 先生成 videoId，以便在记录 transaction 时关联
    const tempVideoId =
      `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    try {
      await useCreditsInternal(
        uid,
        VIDEO_GENERATION_CREDITS,
        "video_generation",
        tempVideoId
      );
      functions.logger.info(
        `✅ 用户 ${uid} 已扣除 ${VIDEO_GENERATION_CREDITS} 点用于生成视频`
      );
    } catch (error: unknown) {
      // 如果点数不足，返回明确的错误信息
      if (error instanceof Error && "code" in error) {
        const code = (error as Error & {code: string}).code;
        if (code === "failed-precondition") {
          functions.logger.warn(
            `⚠️ 用户 ${uid} 点数不足，无法生成视频`
          );
          throw new functions.https.HttpsError(
            "failed-precondition",
            `点数不足。生成视频需要 ${VIDEO_GENERATION_CREDITS} 点，请先购买点数。`
          );
        } else if (code === "not-found") {
          throw new functions.https.HttpsError(
            "not-found",
            "用户点数记录不存在"
          );
        }
      }
      // 其他错误也抛出
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      functions.logger.error(
        `❌ 扣除点数失败 (用户: ${uid}):`,
        error
      );
      throw new functions.https.HttpsError(
        "internal",
        `扣除点数失败: ${errorMessage}`
      );
    }

    // 3. 验证参数
    if (!data.imageUrl || typeof data.imageUrl !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "imageUrl is required and must be a string"
      );
    }

    if (!data.script || typeof data.script !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "script is required and must be a string"
      );
    }

    if (!data.avatarId || typeof data.avatarId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "avatarId is required and must be a string"
      );
    }

    // 验证脚本长度（HeyGen 通常有长度限制）
    if (data.script.length > 5000) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "script must be less than 5000 characters"
      );
    }

    // 4. 获取配置
    let config;
    try {
      config = getConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      functions.logger.error(`配置错误: ${message}`);
      throw new functions.https.HttpsError(
        "failed-precondition",
        message
      );
    }

    try {
      // 5. 调用 HeyGen API 生成视频
      // 根据 HeyGen API 文档：https://docs.heygen.com/reference/authentication
      // 使用 V2 API: POST /v2/video/generate
      const heygenApiUrl = `${config.heygenApiBaseUrl}/v2/video/generate`;

      functions.logger.info(
        `🎬 开始生成视频 (用户: ${uid}, Avatar: ${data.avatarId})`
      );
      functions.logger.info(`API URL: ${heygenApiUrl}`);

      // 构建请求体
      // 根据 HeyGen V2 API 文档格式
      // 注意：需要 voice_id，如果没有提供则使用默认值
      // 默认使用一个通用的英文女声 voice_id
      const defaultVoiceId = "1bd001e7e50f421d891986aad5158bc8"; // 默认 voice_id
      const voiceId = data.voiceId || defaultVoiceId;

      const requestBody = {
        caption: false, // 是否添加字幕
        dimension: {
          width: 720, // 竖屏：宽度 720
          height: 1280, // 竖屏：高度 1280
        },
        video_inputs: [
          {
            character: {
              type: "avatar",
              avatar_id: data.avatarId,
              scale: 1.0, // Avatar 缩放比例，0-5.0，默认 1.0
              offset: {
                x: 0.0,
                y: 0.0,
              },
            },
            voice: {
              type: "text",
              voice_id: voiceId, // 使用用户选择的 voice_id 或默认值
              input_text: data.script,
              speed: 1.0, // 语音速度，0.5-1.5，默认 1.0
            },
            background: {
              type: "image",
              url: data.imageUrl,
              fit: "cover", // 背景图片适配方式：cover, crop, contain, none
            },
          },
        ],
      };

      // 记录请求体以便调试
      functions.logger.info(
        "📤 发送请求体:",
        JSON.stringify(requestBody, null, 2)
      );

      // 调用 HeyGen API
      const response = await fetch(heygenApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Api-Key": config.heygenApiKey,
        },
        body: JSON.stringify(requestBody),
      });

      functions.logger.info(
        `API 响应状态: ${response.status} ${response.statusText}`
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = {message: errorText || response.statusText};
        }

        functions.logger.error(
          `❌ HeyGen API 调用失败: ${response.status} ${response.statusText}`,
          {
            url: heygenApiUrl,
            errorData,
            errorText,
          }
        );

        throw new functions.https.HttpsError(
          "internal",
          `HeyGen API error (${response.status}): ` +
          `${errorData.message || response.statusText}`
        );
      }

      // 记录原始响应以便调试
      const responseText = await response.text();
      functions.logger.info(
        "📦 HeyGen API 原始响应:",
        responseText.substring(0, 500)
      );

      let result: unknown;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        functions.logger.error(
          "❌ 无法解析 API 响应为 JSON:",
          responseText.substring(0, 200)
        );
        throw new functions.https.HttpsError(
          "internal",
          "Invalid JSON response from HeyGen API"
        );
      }

      // V2 API 响应格式：{ video_id: "..." }
      // 根据文档，成功响应应该包含 video_id 字段
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultObj = result as any;

      let videoId: string;
      let videoUrl: string | null = null;
      let status = "processing";

      if (resultObj.error) {
        // 如果响应包含错误
        functions.logger.error(
          "❌ HeyGen API 返回错误:",
          resultObj.error
        );
        throw new functions.https.HttpsError(
          "internal",
          `HeyGen API error: ${resultObj.error.message || "Unknown error"}`
        );
      } else if (resultObj.video_id) {
        // 标准响应格式：{ video_id: "..." }
        videoId = resultObj.video_id;
        videoUrl = resultObj.video_url || resultObj.url || null;
        status = resultObj.status || "processing";
      } else if (resultObj.data && resultObj.data.video_id) {
        // 包装格式：{ data: { video_id: "..." } }
        videoId = resultObj.data.video_id;
        videoUrl = resultObj.data.video_url || resultObj.data.url || null;
        status = resultObj.data.status || "processing";
      } else {
        // 未知格式，记录警告并使用默认值
        videoId = `video_${Date.now()}`;
        functions.logger.warn(
          "⚠️ 未知的响应格式，使用默认 video_id:",
          JSON.stringify(result).substring(0, 500)
        );
      }

      // 5. 更新 transaction 记录中的 usage_id（如果之前使用了临时 ID）
      if (tempVideoId && tempVideoId.startsWith("temp_")) {
        try {
          const transactionsSnapshot = await db
            .collection("transactions")
            .where("uid", "==", uid)
            .where("usage_id", "==", tempVideoId)
            .orderBy("created_at", "desc")
            .limit(1)
            .get();
          if (!transactionsSnapshot.empty) {
            const transactionDoc = transactionsSnapshot.docs[0];
            await transactionDoc.ref.update({
              usage_id: videoId,
            });
            functions.logger.info(
              `✅ 已更新 transaction 记录，将临时 ID ${tempVideoId} 替换为 ${videoId}`
            );
          }
        } catch (error) {
          // 如果更新失败，不影响视频生成流程
          functions.logger.warn(
            "⚠️ 更新 transaction 记录失败:",
            error
          );
        }
      }

      // 6. 保存视频生成任务到 Firestore
      const videoTaskRef = db.collection("video_tasks").doc(videoId);

      await videoTaskRef.set({
        uid,
        video_id: videoId,
        video_url: videoUrl,
        status: status,
        image_url: data.imageUrl,
        script: data.script,
        avatar_id: data.avatarId,
        voice_id: voiceId,
        progress: null, // 初始进度为 null
        error_code: null,
        error_message: null,
        error_detail: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 7. 确保图片信息也保存在 user_images 集合中（如果还没有）
      // 这样图片库可以显示所有上传的图片，即使没有生成视频
      try {
        const imageUrl = data.imageUrl;
        if (imageUrl) {
          // 检查图片是否已存在于 user_images 集合
          const existingImages = await db
            .collection("user_images")
            .where("uid", "==", uid)
            .where("image_url", "==", imageUrl)
            .limit(1)
            .get();

          if (existingImages.empty) {
            // 如果不存在，创建记录
            const imageId =
              `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            await db.collection("user_images").doc(imageId).set({
              uid,
              image_id: imageId,
              image_url: imageUrl,
              file_name: null,
              created_at: admin.firestore.FieldValue.serverTimestamp(),
              updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            functions.logger.info(
              `✅ 图片信息已保存到 user_images (图片ID: ${imageId})`
            );
          }
        }
      } catch (error) {
        // 如果保存图片信息失败，不影响视频生成流程
        functions.logger.warn(
          "⚠️ 保存图片信息到 user_images 失败:",
          error
        );
      }

      functions.logger.info(
        `✅ 视频生成任务已创建 (用户: ${uid}, 视频ID: ${videoId})`
      );

      // 6. 返回结果
      return {
        success: true,
        video_id: videoId,
        video_url: videoUrl,
        status: status,
        message: "Video generation task created successfully",
      };
    } catch (error: unknown) {
      functions.logger.error(
        `❌ 生成视频失败 (用户: ${uid}):`,
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
        `Failed to generate video: ${errorMessage}`
      );
    }
  }
);

