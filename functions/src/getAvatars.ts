import * as functions from "firebase-functions/v1";
import {getConfig} from "./config.js";

/**
 * Avatar 信息
 */
interface AvatarInfo {
  avatar_id: string;
  name?: string;
  preview_url?: string;
  gender?: string;
  age?: string;
  style?: string;
}

// HeyGenAvatarsResponse 接口已移除，使用动态类型检查

/**
 * Callable 函数：获取可用的 Avatar 列表
 *
 * 功能：
 * 从 HeyGen API 获取所有可用的虚拟形象列表，供用户选择
 *
 * 参数：
 * - limit: 可选，限制返回的 Avatar 数量（默认不限制）
 *
 * 注意：
 * - 需要设置环境变量 HEYGEN_API_KEY
 */
export const getAvatars = functions.https.onCall(
  async (data: {limit?: number} = {}, context) => {
    // 1. 验证用户是否已登录
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "login required"
      );
    }

    // 2. 获取配置
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
      // 3. 调用 HeyGen API 获取 Avatar 列表
      // 根据 HeyGen API 文档：https://docs.heygen.com/reference/authentication
      // 使用 V2 API: /v2/avatars
      const heygenApiUrl = `${config.heygenApiBaseUrl}/v2/avatars`;

      functions.logger.info("📋 获取 Avatar 列表");
      functions.logger.info(`API URL: ${heygenApiUrl}`);

      // 调用 HeyGen API
      // 认证方式：使用 X-Api-Key header
      const response = await fetch(heygenApiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": config.heygenApiKey,
        },
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await response.json() as
        | AvatarInfo[]
        | {
            data?: {avatars?: AvatarInfo[]} | AvatarInfo[];
            error?: {message: string};
          }
        | {avatars?: AvatarInfo[]; error?: {message: string}}
        | unknown; // 允许任何格式以便调试

      functions.logger.info(
        "📦 HeyGen API 原始响应:",
        JSON.stringify(result).substring(0, 500)
      );

      // V2 API 响应格式可能不同，需要适配
      // 可能的格式：
      // 1. { data: { avatars: [...] } }
      // 2. { avatars: [...] }
      // 3. 直接是数组 [...]
      // 4. { data: [...] } (直接是数组)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rawAvatars: any[] = [];

      if (Array.isArray(result)) {
        // 如果直接返回数组
        rawAvatars = result;
      } else if (result && typeof result === "object") {
        const resultObj = result as Record<string, unknown>;
        if ("data" in resultObj) {
          const data = resultObj.data;
          if (Array.isArray(data)) {
            // 如果格式是 { data: [...] }
            rawAvatars = data;
          } else if (
            data &&
            typeof data === "object" &&
            "avatars" in data &&
            Array.isArray((data as Record<string, unknown>).avatars)
          ) {
            // 如果格式是 { data: { avatars: [...] } }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawAvatars = (data as Record<string, unknown>).avatars as any[];
          }
        } else if ("avatars" in resultObj && Array.isArray(resultObj.avatars)) {
          // 如果格式是 { avatars: [...] }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawAvatars = resultObj.avatars as any[];
        } else if ("error" in resultObj && resultObj.error) {
          // 如果有错误
          const error = resultObj.error as {message?: string};
          functions.logger.error(
            "❌ HeyGen API 返回错误:",
            error
          );
          throw new functions.https.HttpsError(
            "internal",
            `HeyGen API error: ${error.message || "Unknown error"}`
          );
        } else {
          // 未知格式，记录日志
          functions.logger.warn(
            "⚠️ 未知的响应格式:",
            JSON.stringify(result).substring(0, 500)
          );
        }
      }

      // 规范化 avatar 数据，确保字段名一致
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const avatars: AvatarInfo[] = rawAvatars.map((avatar: any) => {
        // 处理不同的字段名变体
        const avatarId =
          avatar.avatar_id ||
          avatar.avatarId ||
          avatar.id ||
          avatar._id ||
          `avatar_${Date.now()}_${Math.random()}`;

        // 记录完整的 avatar 对象以便调试（只记录前几个，避免日志过长）
        if (avatars.length <= 3) {
          functions.logger.info(
            `📋 处理 Avatar (ID: ${avatarId}):`,
            JSON.stringify(avatar, null, 2)
          );
        }

        // 记录所有可用的字段名（用于调试）
        const allKeys = Object.keys(avatar);
        if (!allKeys.includes("preview_url") &&
            !allKeys.includes("previewUrl") &&
            !allKeys.includes("preview_video_url") &&
            !allKeys.includes("previewVideoUrl")) {
          functions.logger.warn(
            `⚠️ Avatar ${avatarId} 可能缺少预览 URL，可用字段: ${allKeys.join(", ")}`
          );
        }

        // 尝试所有可能的预览 URL 字段名（优先视频，再图片）
        // 注意：HeyGen API 可能使用不同的字段名，需要根据实际响应调整
        const previewUrl =
          avatar.preview_video_url || // 视频预览 URL（优先）
          avatar.previewVideoUrl ||
          avatar.video_preview_url ||
          avatar.videoPreviewUrl ||
          avatar.video_url ||
          avatar.videoUrl ||
          avatar.video_preview ||
          avatar.videoPreview ||
          avatar.preview_image_url || // 图片预览 URL（备选）
          avatar.previewImageUrl ||
          avatar.preview_url ||
          avatar.previewUrl ||
          avatar.preview ||
          avatar.image_url ||
          avatar.imageUrl ||
          avatar.image ||
          avatar.thumbnail ||
          avatar.thumbnail_url ||
          avatar.thumbnailUrl ||
          avatar.thumb ||
          avatar.thumb_url ||
          avatar.thumbUrl ||
          avatar.portrait_url ||
          avatar.portraitUrl ||
          avatar.portrait ||
          avatar.photo_url ||
          avatar.photoUrl ||
          avatar.photo ||
          avatar.cover_url ||
          avatar.coverUrl ||
          avatar.cover ||
          avatar.avatar_image ||
          avatar.avatarImage ||
          avatar.avatar_url ||
          avatar.avatarUrl ||
          avatar.avatar ||
          avatar.url || // 通用 URL 字段
          avatar.media_url || // 媒体 URL
          avatar.mediaUrl ||
          avatar.media ||
          null;

        if (!previewUrl) {
          functions.logger.warn(
            `⚠️ Avatar ${avatarId} 没有找到预览 URL，所有字段: ${allKeys.join(", ")}`
          );
          // 记录前几个 avatar 的完整数据以便调试
          if (avatars.length <= 3) {
            functions.logger.warn(
              `完整 Avatar 数据: ${JSON.stringify(avatar)}`
            );
          }
        } else {
          functions.logger.info(
            `✅ Avatar ${avatarId} 找到预览 URL: ${previewUrl.substring(0, 100)}`
          );
        }

        return {
          avatar_id: avatarId,
          name: avatar.avatar_name || // HeyGen V2 API 实际使用的字段名
            avatar.avatarName ||
            avatar.name ||
            avatar.title ||
            avatar.display_name ||
            avatar.displayName ||
            null,
          preview_url: previewUrl,
          gender: avatar.gender || null,
          age: avatar.age || null,
          style: avatar.style || avatar.category || null,
        };
      });

      // 如果指定了 limit，只返回前 N 个
      const limit = data.limit;
      const finalAvatars = limit && limit > 0 ?
        avatars.slice(0, limit) :
        avatars;

      functions.logger.info(
        `✅ 成功获取并规范化 ${avatars.length} 个 Avatar` +
        (limit ? `，返回前 ${limit} 个` : "")
      );

      return {
        success: true,
        avatars: finalAvatars,
        count: finalAvatars.length,
        total: avatars.length, // 返回总数，方便前端知道还有更多
      };
    } catch (error: unknown) {
      functions.logger.error(
        "❌ 获取 Avatar 列表失败:",
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
        `Failed to get avatars: ${errorMessage}`
      );
    }
  }
);

