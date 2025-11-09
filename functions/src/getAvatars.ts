import * as functions from "firebase-functions/v1";
import {getConfig} from "./config.js";

/**
 * Avatar 信息
 */
interface AvatarInfo {
  avatar_id: string;
  name?: string;
  preview_url?: string; // 图片 URL（用于列表显示）
  preview_video_url?: string; // 视频 URL（用于详情页播放）
  gender?: string;
  age?: string;
  style?: string;
  default_voice_id?: string; // Avatar 的默认声音 ID
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
        const errorText = await response.text().catch(
          () => "Failed to read error response"
        );
        let errorData: {message?: string; error?: string; detail?: string} = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = {message: errorText || response.statusText};
        }

        const errorMessage = errorData.message ||
          errorData.error ||
          errorData.detail ||
          errorText ||
          response.statusText;

        functions.logger.error(
          `❌ HeyGen API 调用失败: ${response.status} ${response.statusText}`,
          {
            url: heygenApiUrl,
            status: response.status,
            statusText: response.statusText,
            errorData,
            errorText,
            headers: Object.fromEntries(response.headers.entries()),
          }
        );

        throw new functions.https.HttpsError(
          "internal",
          `HeyGen API error (${response.status}): ${errorMessage}. ` +
          `URL: ${heygenApiUrl}`
        );
      }

      // 尝试解析 JSON 响应
      let result: unknown;
      try {
        result = await response.json();
      } catch (jsonError) {
        const responseText = await response.text().catch(
          () => "Failed to read response"
        );
        const jsonErrorMessage = jsonError instanceof Error ?
          jsonError.message :
          String(jsonError);
        functions.logger.error(
          "❌ 无法解析 HeyGen API 响应为 JSON:",
          {
            jsonError: jsonErrorMessage,
            responseText: responseText.substring(0, 1000),
            contentType: response.headers.get("content-type"),
          }
        );
        throw new functions.https.HttpsError(
          "internal",
          `Failed to parse HeyGen API response as JSON: ${
            jsonError instanceof Error ? jsonError.message : String(jsonError)
          }`
        );
      }

      functions.logger.info(
        "📦 HeyGen API 原始响应:",
        JSON.stringify(result).substring(0, 500)
      );

      // HeyGen V2 API 响应格式：{ error: null, data: { avatars: [...] } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rawAvatars: any[] = [];

      if (result && typeof result === "object") {
        const resultObj = result as Record<string, unknown>;

        // 检查是否有错误
        if ("error" in resultObj && resultObj.error !== null) {
          const error = resultObj.error as {message?: string; code?: string};
          functions.logger.error(
            "❌ HeyGen API 返回错误:",
            error
          );
          const errorMsg = error.message || error.code || "Unknown error";
          throw new functions.https.HttpsError(
            "internal",
            `HeyGen API error: ${errorMsg}`
          );
        }

        // 解析 data.avatars 格式（标准格式）
        if ("data" in resultObj && resultObj.data) {
          const data = resultObj.data as Record<string, unknown>;
          if (
            "avatars" in data &&
            Array.isArray(data.avatars)
          ) {
            // 标准格式：{ error: null, data: { avatars: [...] } }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawAvatars = data.avatars as any[];
          } else if (Array.isArray(data)) {
            // 备用格式：{ data: [...] }
            rawAvatars = data;
          }
        } else if ("avatars" in resultObj && Array.isArray(resultObj.avatars)) {
          // 备用格式：{ avatars: [...] }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawAvatars = resultObj.avatars as any[];
        } else if (Array.isArray(result)) {
          // 备用格式：直接是数组 [...]
          rawAvatars = result;
        } else {
          // 未知格式，记录日志并抛出错误
          functions.logger.error(
            "❌ 未知的响应格式，无法解析 Avatar 列表:",
            JSON.stringify(result).substring(0, 1000)
          );
          throw new functions.https.HttpsError(
            "internal",
            "Unknown response format from HeyGen API"
          );
        }
      } else if (Array.isArray(result)) {
        // 如果直接返回数组
        rawAvatars = result;
      }

      // 如果解析后没有找到任何 avatar，抛出错误
      if (rawAvatars.length === 0) {
        functions.logger.error(
          "❌ 未能从 HeyGen API 响应中解析出任何 Avatar 数据",
          "响应内容:",
          JSON.stringify(result).substring(0, 1000)
          );
        throw new functions.https.HttpsError(
          "internal",
          "No avatars found in HeyGen API response"
        );
      }

      // 规范化 avatar 数据，确保字段名一致
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const avatars: AvatarInfo[] = rawAvatars.map(
        // eslint-disable-next-line max-len
        (avatar: any, index: number) => {
        // 处理不同的字段名变体
        const avatarId =
          avatar.avatar_id ||
          avatar.avatarId ||
          avatar.id ||
          avatar._id ||
          `avatar_${Date.now()}_${Math.random()}`;

          // 记录完整的 avatar 对象以便调试（只记录前几个，避免日志过长）
          if (index < 3) {
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

          // 根据实际 API 响应，使用 preview_image_url 和 preview_video_url
          // 优先使用图片 URL（用于列表显示），视频 URL 用于详情页播放
          const previewImageUrl =
          avatar.preview_image_url ||
          avatar.previewImageUrl ||
          avatar.preview_url ||
          avatar.previewUrl ||
          avatar.image_url ||
          avatar.imageUrl ||
          avatar.image ||
          null;

          const previewVideoUrl =
          avatar.preview_video_url ||
          avatar.previewVideoUrl ||
          avatar.video_url ||
          avatar.videoUrl ||
          null;

          // 使用图片 URL 作为主要预览 URL（列表显示）
          const previewUrl = previewImageUrl || previewVideoUrl || null;

        if (!previewUrl) {
          functions.logger.warn(
              `⚠️ Avatar ${avatarId} 没有找到预览 URL，所有字段: ${allKeys.join(", ")}`
            );
            // 记录前几个 avatar 的完整数据以便调试
            if (index < 3) {
              functions.logger.warn(
                `完整 Avatar 数据: ${JSON.stringify(avatar)}`
              );
            }
          } else {
            const previewUrlPreview = previewUrl.length > 100 ?
              `${previewUrl.substring(0, 100)}...` :
              previewUrl;
            functions.logger.info(
              `✅ Avatar ${avatarId} 找到预览 URL: ${previewUrlPreview}`
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
            preview_url: previewImageUrl, // 图片 URL（用于列表显示）
            preview_video_url: previewVideoUrl, // 视频 URL（用于详情页播放）
          gender: avatar.gender || null,
          age: avatar.age || null,
          style: avatar.style || avatar.category || null,
            default_voice_id: avatar.default_voice_id || // Avatar 的默认声音 ID
              ((avatar as Record<string, unknown>).defaultVoiceId as
                string | undefined) ||
              null,
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
      // 记录完整的错误信息以便调试
      let errorDetails = "Unknown error";
      if (error instanceof Error) {
        errorDetails = `${error.name}: ${error.message}`;
        if (error.stack) {
          functions.logger.error("错误堆栈:", error.stack);
        }
      } else {
        errorDetails = String(error);
      }

      functions.logger.error(
        "❌ 获取 Avatar 列表失败:",
        {
          error: errorDetails,
          errorType: error instanceof Error ?
            error.constructor.name :
            typeof error,
          errorString: String(error),
        }
      );

      // 如果是已知的 HttpsError，直接抛出（但添加更多上下文）
      if (error instanceof functions.https.HttpsError) {
        // 如果错误消息太简单，添加更多上下文
        const originalMessage = error.message;
        if (originalMessage === "INTERNAL" || originalMessage.length < 20) {
          throw new functions.https.HttpsError(
            error.code,
            // eslint-disable-next-line max-len
            `Failed to get avatars: ${errorDetails}. Original: ${originalMessage}`
          );
        }
        throw error;
      }

      // 其他错误转换为 internal 错误，包含详细信息
      const errorMessage = error instanceof Error ?
        `${error.name}: ${error.message}` :
        String(error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to get avatars: ${errorMessage}`
      );
    }
  }
);

