import * as functions from "firebase-functions/v1";
import {getConfig} from "./config.js";

/**
 * Voice 信息
 */
interface VoiceInfo {
  voice_id: string;
  name?: string;
  language?: string;
  gender?: string;
  preview_audio?: string;
  support_pause?: boolean;
  emotion_support?: boolean;
  support_interactive_avatar?: boolean;
  support_locale?: boolean;
}

/**
 * Callable 函数：获取可用的 Voice 列表
 *
 * 功能：
 * 从 HeyGen API 获取所有可用的声音列表，供用户选择
 *
 * 参数：
 * - locale: 可选，语言代码（如 "en-US"），用于过滤声音
 *
 * 注意：
 * - 需要设置环境变量 HEYGEN_API_KEY
 */
export const getVoices = functions.https.onCall(
  async (data: {locale?: string} = {}, context) => {
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
      // 3. 调用 HeyGen API 获取 Voice 列表
      // 根据 HeyGen API 文档：使用 V2 API: /v2/voices
      // 如果提供了 locale，可以添加查询参数过滤
      let heygenApiUrl = `${config.heygenApiBaseUrl}/v2/voices`;
      if (data.locale) {
        heygenApiUrl += `?locale=${encodeURIComponent(data.locale)}`;
      }

      functions.logger.info("📋 获取 Voice 列表");
      functions.logger.info(`API URL: ${heygenApiUrl}`);

      // 调用 HeyGen API
      // 认证方式：使用 X-Api-Key header
      const response = await fetch(heygenApiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
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
        | VoiceInfo[]
        | {
            data?: {voices?: VoiceInfo[]} | VoiceInfo[];
            error?: {message: string};
          }
        | {voices?: VoiceInfo[]; error?: {message: string}}
        | unknown;

      functions.logger.info(
        "📦 HeyGen API 原始响应:",
        JSON.stringify(result).substring(0, 500)
      );

      // V2 API 响应格式可能不同，需要适配
      // 可能的格式：
      // 1. { data: { voices: [...] } }
      // 2. { voices: [...] }
      // 3. 直接是数组 [...]
      // 4. { data: [...] } (直接是数组)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rawVoices: any[] = [];

      if (Array.isArray(result)) {
        // 如果直接返回数组
        rawVoices = result;
      } else if (result && typeof result === "object") {
        const resultObj = result as Record<string, unknown>;
        if ("data" in resultObj) {
          const data = resultObj.data;
          if (Array.isArray(data)) {
            // 如果格式是 { data: [...] }
            rawVoices = data;
          } else if (
            data &&
            typeof data === "object" &&
            "voices" in data &&
            Array.isArray((data as Record<string, unknown>).voices)
          ) {
            // 如果格式是 { data: { voices: [...] } }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawVoices = (data as Record<string, unknown>).voices as any[];
          }
        } else if ("voices" in resultObj && Array.isArray(resultObj.voices)) {
          // 如果格式是 { voices: [...] }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawVoices = resultObj.voices as any[];
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

      // 规范化 voice 数据，确保字段名一致
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const voices: VoiceInfo[] = rawVoices.map((voice: any) => {
        // 处理不同的字段名变体
        const voiceId =
          voice.voice_id ||
          voice.voiceId ||
          voice.id ||
          voice._id ||
          `voice_${Date.now()}_${Math.random()}`;

        return {
          voice_id: voiceId,
          name: voice.name || voice.voice_name || voice.title || null,
          language: voice.language || null,
          gender: voice.gender || null,
          preview_audio: voice.preview_audio || voice.previewAudio || null,
          support_pause: voice.support_pause || voice.supportPause || false,
          emotion_support:
            voice.emotion_support || voice.emotionSupport || false,
          support_interactive_avatar:
            voice.support_interactive_avatar ||
            voice.supportInteractiveAvatar ||
            false,
          support_locale:
            voice.support_locale || voice.supportLocale || false,
        };
      });

      // 如果提供了 locale，进一步过滤声音列表
      let filteredVoices = voices;
      if (data.locale) {
        filteredVoices = voices.filter((voice) => {
          // 检查 voice 是否支持该 locale
          // 如果 voice 有 locale 字段，进行匹配
          // 或者根据 language 字段进行匹配
          const localeCode = data.locale || "";
          return (
            !voice.language || // 如果没有 language 限制，则包含
            voice.language.toLowerCase().includes(
              localeCode.split("-")[0].toLowerCase()
            )
          );
        });
        functions.logger.info(
          `🔍 根据 locale ${data.locale} 过滤后: ` +
          `${filteredVoices.length} 个 Voice`
        );
      }

      functions.logger.info(
        `✅ 成功获取并规范化 ${filteredVoices.length} 个 Voice`
      );

      return {
        success: true,
        voices: filteredVoices,
        count: filteredVoices.length,
      };
    } catch (error: unknown) {
      functions.logger.error(
        "❌ 获取 Voice 列表失败:",
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
        `Failed to get voices: ${errorMessage}`
      );
    }
  }
);

