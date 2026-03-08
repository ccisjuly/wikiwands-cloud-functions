import * as functions from "firebase-functions/v1";
import {getConfig} from "./config.js";

/**
 * Locale 信息
 */
interface LocaleInfo {
  value: string;
  label: string;
  language: string;
  tag?: string | null;
  locale: string;
  language_code: string;
}

/**
 * Callable 函数：获取可用的语言列表
 *
 * 功能：
 * 从 HeyGen API 获取所有可用的语言列表，供用户选择
 *
 * 注意：
 * - 需要设置环境变量 HEYGEN_API_KEY
 */
export const getLocales = functions.https.onCall(
  async (data, context) => {
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
      // 3. 调用 HeyGen API 获取 Locale 列表
      // 根据 HeyGen API 文档：使用 V2 API: /v2/voices/locales
      const heygenApiUrl = `${config.heygenApiBaseUrl}/v2/voices/locales`;

      functions.logger.info("📋 获取 Locale 列表");
      functions.logger.info(`API URL: ${heygenApiUrl}`);

      // 调用 HeyGen API
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
        | LocaleInfo[]
        | {
            data?: {locales?: LocaleInfo[]} | LocaleInfo[];
            error?: {message: string};
          }
        | {locales?: LocaleInfo[]; error?: {message: string}}
        | unknown;

      functions.logger.info(
        "📦 HeyGen API 原始响应:",
        JSON.stringify(result).substring(0, 500)
      );

      // V2 API 响应格式适配
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rawLocales: any[] = [];

      if (Array.isArray(result)) {
        rawLocales = result;
      } else if (result && typeof result === "object") {
        const resultObj = result as Record<string, unknown>;
        if ("data" in resultObj) {
          const data = resultObj.data;
          if (Array.isArray(data)) {
            rawLocales = data;
          } else if (
            data &&
            typeof data === "object" &&
            "locales" in data &&
            Array.isArray((data as Record<string, unknown>).locales)
          ) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawLocales = (data as Record<string, unknown>).locales as any[];
          }
        } else if ("locales" in resultObj && Array.isArray(resultObj.locales)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawLocales = resultObj.locales as any[];
        } else if ("error" in resultObj && resultObj.error) {
          const error = resultObj.error as {message?: string};
          functions.logger.error("❌ HeyGen API 返回错误:", error);
          throw new functions.https.HttpsError(
            "internal",
            `HeyGen API error: ${error.message || "Unknown error"}`
          );
        }
      }

      // 规范化 locale 数据
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const locales: LocaleInfo[] = rawLocales.map((locale: any) => ({
        value: locale.value || locale.label || "",
        label: locale.label || locale.value || "",
        language: locale.language || "",
        tag: locale.tag || null,
        locale: locale.locale || locale.language_code || "",
        language_code: locale.language_code || locale.locale || "",
      }));

      functions.logger.info(
        `✅ 成功获取并规范化 ${locales.length} 个 Locale`
      );

      return {
        success: true,
        locales: locales,
        count: locales.length,
      };
    } catch (error: unknown) {
      functions.logger.error("❌ 获取 Locale 列表失败:", error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new functions.https.HttpsError(
        "internal",
        `Failed to get locales: ${errorMessage}`
      );
    }
  }
);


