import * as functions from "firebase-functions/v1";

/**
 * 应用配置
 *
 * 配置优先级：
 * 1. 环境变量 (process.env) - 推荐用于所有环境
 * 2. Firebase Functions 配置 (functions.config()) - 备用方案
 *
 * 生产环境配置方式：
 *
 * 方式1: 使用 Firebase Functions 环境变量（推荐）
 * firebase functions:config:set heygen.api_key="your-api-key"
 *
 * 方式2: 使用 Secret Manager（最安全，Firebase Functions v2+）
 * 参考 DEPLOYMENT.md 文档
 *
 * 本地开发配置：
 *
 * 方式1: 使用 .env 文件（推荐）
 * 在 functions/.env 文件中添加：
 * HEYGEN_API_KEY=your-api-key
 *
 * 方式2: 使用环境变量
 * export HEYGEN_API_KEY="your-api-key"
 *
 * 注意：项目设置了 disallowLegacyRuntimeConfig: true，
 * 推荐使用环境变量方式配置。
 */
export interface AppConfig {
  /** HeyGen API Key */
  heygenApiKey: string;
  /** HeyGen API Base URL */
  heygenApiBaseUrl: string;
}

/**
 * 获取应用配置
 *
 * 优先从环境变量读取，如果没有则从 functions.config() 读取
 * @return {AppConfig} 应用配置对象
 */
export function getConfig(): AppConfig {
  // 从环境变量读取（优先级最高）
  const heygenApiKey =
    process.env.HEYGEN_API_KEY ||
    functions.config().heygen?.api_key ||
    "";

  const heygenApiBaseUrl =
    process.env.HEYGEN_API_BASE_URL ||
    functions.config().heygen?.api_base_url ||
    "https://api.heygen.com";

  // 验证必需的配置
  if (!heygenApiKey) {
    throw new Error(
      "HeyGen API key is not configured.\n" +
      "生产环境配置方式：\n" +
      "  1. firebase functions:config:set heygen.api_key=\"your-api-key\"\n" +
      "  2. 然后重新部署: firebase deploy --only functions\n" +
      "本地开发配置方式：\n" +
      "  1. 在 functions/.env 文件中添加: HEYGEN_API_KEY=your-api-key\n" +
      "  2. 或设置环境变量: export HEYGEN_API_KEY=\"your-api-key\"\n" +
      "详细说明请参考 DEPLOYMENT.md 文档"
    );
  }

  return {
    heygenApiKey,
    heygenApiBaseUrl,
  };
}

/**
 * 验证配置是否完整
 * 在函数启动时调用，提前发现配置问题
 */
export function validateConfig(): void {
  try {
    getConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    functions.logger.error(`❌ 配置验证失败: ${message}`);
    throw error;
  }
}

