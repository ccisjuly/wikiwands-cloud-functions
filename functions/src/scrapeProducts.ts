import * as functions from "firebase-functions/v1";

/**
 * 抓取商品信息
 * 支持 Shopify 平台
 */
export const scrapeProducts = functions.https.onCall(
  async (data, context) => {
    // 验证用户身份
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const {url, platform} = data;

    if (!url || typeof url !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "URL is required"
      );
    }

    if (!platform || typeof platform !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Platform is required"
      );
    }

    try {
      let products: Array<Record<string, unknown>> = [];

      if (platform === "shopify") {
        products = await scrapeShopifyProduct(url);
      } else {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Unsupported platform: ${platform}`
        );
      }

      return {
        success: true,
        products: products,
        message: `Successfully scraped ${products.length} product(s)`,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      functions.logger.error(`❌ Error scraping products: ${errorMessage}`);
      return {
        success: false,
        products: null,
        error: errorMessage,
        message: "Failed to scrape products",
      };
    }
  }
);

/**
 * 抓取 Shopify 商品
 * 通过 Shopify Storefront API 或解析页面 JSON-LD 数据
 * @param {string} url - 商品页面 URL
 * @return {Promise<Array<Record<string, unknown>>>} 商品列表
 */
async function scrapeShopifyProduct(
  url: string
): Promise<Array<Record<string, unknown>>> {
  try {
    // 验证并规范化 URL
    let normalizedUrl = url.trim();

    // 如果 URL 不包含协议，添加 https://
    if (!normalizedUrl.includes("://")) {
      if (normalizedUrl.startsWith("//")) {
        normalizedUrl = "https:" + normalizedUrl;
      } else if (normalizedUrl.startsWith("/")) {
        throw new Error(
          "URL 格式不正确：缺少域名。请提供完整的 URL" +
          "（如：https://example.com/products/xxx）"
        );
      } else {
        normalizedUrl = "https://" + normalizedUrl;
      }
    }

    // 方法1: 优先尝试访问 .json 版本的 URL（Shopify 标准 API）
    // Shopify 支持在商品 URL 后添加 .json 来获取 JSON 数据
    let jsonUrl = normalizedUrl;
    if (!jsonUrl.endsWith(".json")) {
      // 如果 URL 包含查询参数，在路径后、查询参数前插入 .json
      if (jsonUrl.includes("?")) {
        jsonUrl = jsonUrl.replace(/\?/, ".json?");
      } else {
        jsonUrl = jsonUrl + ".json";
      }
    }

    functions.logger.info(`🔍 Trying JSON API: ${jsonUrl}`);

    let productData: Record<string, unknown> | null = null;

    // 首先尝试 JSON API
    try {
      const jsonResponse = await fetch(jsonUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });

      if (jsonResponse.ok) {
        const jsonData = await jsonResponse.json() as Record<string, unknown>;
        // Shopify JSON API 返回格式: { product: {...} }
        if (jsonData.product) {
          productData = jsonData.product as Record<string, unknown>;
          functions.logger.info("✅ Found product data via .json API");
        } else if (jsonData.id || jsonData.title) {
          // 如果直接返回商品数据
          productData = jsonData;
          functions.logger.info("✅ Found product data via .json API (direct)");
        }
      }
    } catch (e) {
      functions.logger.warn(
        `⚠️ JSON API failed, falling back to HTML parsing: ${e}`
      );
    }

    // 获取 HTML 用于提取描述（无论是否从 JSON API 获取到数据）
    let html: string | null = null;
    let htmlResponse: Response | null = null;

    // 方法2: 如果 JSON API 失败，回退到 HTML 解析
    if (!productData) {
      functions.logger.info("📄 Falling back to HTML parsing");
      htmlResponse = await fetch(normalizedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!htmlResponse.ok) {
        throw new Error(`HTTP error! status: ${htmlResponse.status}`);
      }

      html = await htmlResponse.text();
      functions.logger.info(
        `📄 Fetched HTML, length: ${html.length} characters`
      );
    } else {
      // 即使从 JSON API 获取到数据，也需要获取 HTML 来提取描述
      try {
        htmlResponse = await fetch(normalizedUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        if (htmlResponse.ok) {
          html = await htmlResponse.text();
          functions.logger.info(
            // eslint-disable-next-line max-len
            `📄 Fetched HTML for description extraction, length: ${html.length} characters`
          );
        }
      } catch (e) {
        functions.logger.warn(`⚠️ Failed to fetch HTML for description: ${e}`);
      }
    }

    if (html) {
      // 方法2.1: 查找 JSON-LD 数据（仅在未从 JSON API 获取到数据时）
      if (!productData) {
        // eslint-disable-next-line max-len
        const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gs;
        const matches = html.matchAll(jsonLdPattern);

        for (const match of matches) {
          try {
            const jsonData = JSON.parse(match[1]) as Record<string, unknown>;
            if (jsonData["@type"] === "Product" ||
                jsonData["@type"] === "http://schema.org/Product") {
              productData = jsonData;
              functions.logger.info("✅ Found product data in JSON-LD");
              break;
            }
          } catch (e) {
            // 忽略解析错误，继续查找
          }
        }
      }

      // 方法2.2: 查找 Shopify 的 product JSON (多种可能的 ID 格式)
      if (!productData) {
        const shopifyProductPatterns = [
          /<script[^>]*id=["']ProductJson-[\w-]*["'][^>]*>(.*?)<\/script>/s,
          /<script[^>]*id=["']product-json["'][^>]*>(.*?)<\/script>/s,
          // eslint-disable-next-line max-len
          /<script[^>]*type=["']application\/json["'][^>]*id=["']ProductJson["'][^>]*>(.*?)<\/script>/s,
          /window\.__INITIAL_STATE__\s*=\s*({.*?});/s,
          /window\.__PRELOADED_STATE__\s*=\s*({.*?});/s,
        ];

        for (const pattern of shopifyProductPatterns) {
          const match = html.match(pattern);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]) as Record<string, unknown>;
              // 检查是否是商品数据
              if (parsed.id || parsed.title || parsed.product) {
                productData = (parsed.product ||
                  parsed) as Record<string, unknown>;
                functions.logger.info("✅ Found product data in Shopify JSON");
                break;
              }
            } catch (e) {
              // 忽略解析错误，继续查找
            }
          }
        }
      }

      // 方法2.3: 查找 window.ShopifyAnalytics.meta.product
      if (!productData) {
        const shopifyAnalyticsPatterns = [
          /window\.ShopifyAnalytics\s*=\s*({.*?});/s,
          /ShopifyAnalytics\.meta\s*=\s*({.*?});/s,
          /window\.analytics\s*=\s*({.*?});/s,
        ];

        for (const pattern of shopifyAnalyticsPatterns) {
          const match = html.match(pattern);
          if (match) {
            try {
              const analytics = JSON.parse(match[1]) as Record<string, unknown>;
              if (analytics.meta &&
                  (analytics.meta as Record<string, unknown>).product) {
                productData = (analytics.meta as Record<string, unknown>)
                  .product as Record<string, unknown>;
                functions.logger.info(
                  "✅ Found product data in ShopifyAnalytics"
                );
                break;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 方法2.4: 查找所有包含 "product" 的 script 标签
      if (!productData) {
        const allScriptPattern =
          /<script[^>]*>(.*?)<\/script>/gs;
        const allScripts = html.matchAll(allScriptPattern);

        for (const scriptMatch of allScripts) {
          const scriptContent = scriptMatch[1];
          // 尝试查找包含 product 信息的 JSON
          if (scriptContent.includes("\"product\"") ||
              scriptContent.includes("'product'")) {
            try {
              // 尝试提取 JSON 对象
              const jsonMatch =
                scriptContent.match(/\{[\s\S]*"product"[\s\S]*\}/);
              if (jsonMatch) {
                const parsed =
                  JSON.parse(jsonMatch[0]) as Record<string, unknown>;
                const product = parsed.product as Record<string, unknown> |
                  undefined;
                if (product && (product.id || product.title)) {
                  productData = product;
                  functions.logger.info("✅ Found product data in script tag");
                  break;
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 方法2.5: 尝试从 URL 路径提取信息并构建基本商品数据
      if (!productData) {
        functions.logger.warn(
          "⚠️ Could not find product data, attempting to extract from URL"
        );
        // 从 URL 路径提取商品名称
        const pathMatch = normalizedUrl.match(/\/products\/([^/?]+)/);
        if (pathMatch) {
          const productHandle = pathMatch[1];
          productData = {
            id: `shopify_${Date.now()}`,
            title: productHandle.replace(/-/g, " ").replace(/\b\w/g, (l) =>
              l.toUpperCase()
            ),
            url: normalizedUrl,
          };
          functions.logger.info(
            `⚠️ Created basic product data from URL: ${productHandle}`
          );
        }
      }

      if (!productData) {
        // 记录一些调试信息
        const hasProductKeyword = html.includes("product") ||
          html.includes("Product");
        const scriptCount = (html.match(/<script/g) || []).length;
        functions.logger.error(
          `❌ Could not find product data. HTML length: ${html.length}, ` +
          `has 'product' keyword: ${hasProductKeyword}, ` +
          `script tags: ${scriptCount}`
        );
        throw new Error(
          "无法在页面中找到商品数据。请确认这是一个有效的 Shopify 商品页面 URL"
        );
      }
    }

    // 确保 productData 存在
    if (!productData) {
      throw new Error(
        "无法在页面中找到商品数据。请确认这是一个有效的 Shopify 商品页面 URL"
      );
    }

    // 从 HTML 中提取描述
    let description: string | null = null;
    if (html) {
      description = extractDescriptionFromHTML(html);
      if (description) {
        functions.logger.info(
          `✅ Extracted description from HTML (length: ${description.length})`
        );
      }
    }

    // 转换为标准格式
    const products = [
      convertShopifyProductToStandard(productData, normalizedUrl, description),
    ];

    return products;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    functions.logger.error(`❌ Error scraping Shopify product: ${errorMessage}`);
    throw error;
  }
}

/**
 * 从 HTML 中提取商品描述
 * @param {string} html - HTML 内容
 * @return {string | null} 提取的描述文本
 */
function extractDescriptionFromHTML(html: string): string | null {
  try {
    // 方法1: 查找常见的商品描述容器
    const descriptionPatterns = [
      // Shopify 常见的描述容器
      // eslint-disable-next-line max-len
      /<div[^>]*class=["'][^"']*product-description[^"']*["'][^>]*>(.*?)<\/div>/is,
      // eslint-disable-next-line max-len
      /<div[^>]*class=["'][^"']*product__description[^"']*["'][^>]*>(.*?)<\/div>/is,
      /<div[^>]*id=["']product-description["'][^>]*>(.*?)<\/div>/is,
      /<div[^>]*id=["']product__description["'][^>]*>(.*?)<\/div>/is,
      // 通用的描述区域
      // eslint-disable-next-line max-len
      /<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>(.*?)<\/div>/is,
      // eslint-disable-next-line max-len
      /<section[^>]*class=["'][^"']*product-description[^"']*["'][^>]*>(.*?)<\/section>/is,
      // meta description
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
    ];

    for (const pattern of descriptionPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let text = match[1];
        // 移除 HTML 标签
        text = text.replace(/<[^>]+>/g, " ");
        // 清理空白字符
        text = text.replace(/\s+/g, " ").trim();
        if (text.length > 20) {
          // 只返回有意义的描述（至少 20 个字符）
          return text.substring(0, 1000); // 限制长度
        }
      }
    }

    // 方法2: 如果没有找到特定容器，尝试从 body 中提取文本
    const bodyMatch = html.match(/<body[^>]*>(.*?)<\/body>/is);
    if (bodyMatch) {
      let bodyText = bodyMatch[1];
      // 移除 script 和 style 标签
      bodyText = bodyText.replace(/<script[^>]*>.*?<\/script>/gis, "");
      bodyText = bodyText.replace(/<style[^>]*>.*?<\/style>/gis, "");
      // 移除 HTML 标签
      bodyText = bodyText.replace(/<[^>]+>/g, " ");
      // 清理空白字符
      bodyText = bodyText.replace(/\s+/g, " ").trim();
      // 提取前 500 个字符作为描述
      if (bodyText.length > 50) {
        return bodyText.substring(0, 1000);
      }
    }
  } catch (e) {
    functions.logger.warn(`⚠️ Error extracting description: ${e}`);
  }

  return null;
}

/**
 * 将相对 URL 转换为绝对 URL
 * @param {string} url - 可能是相对或绝对的 URL
 * @param {string} baseUrl - 基础 URL
 * @return {string} 绝对 URL
 */
function resolveImageUrl(url: string | null, baseUrl: string): string | null {
  if (!url) {
    return null;
  }

  // 如果已经是绝对 URL，直接返回
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // 如果是协议相对 URL (//example.com/image.jpg)
  if (url.startsWith("//")) {
    return "https:" + url;
  }

  // 如果是绝对路径 (/image.jpg)
  if (url.startsWith("/")) {
    try {
      const base = new URL(baseUrl);
      return `${base.protocol}//${base.host}${url}`;
    } catch (e) {
      return null;
    }
  }

  // 如果是相对路径 (image.jpg 或 ../image.jpg)
  try {
    const base = new URL(baseUrl);
    return new URL(url, base).toString();
  } catch (e) {
    return null;
  }
}

/**
 * 解析价格字符串，返回 currency 和 amount
 * @param {string | null | undefined} priceStr - 价格字符串，如 "$48.00" 或 "USD 48.00"
 * @return {Object | null} 解析后的货币和金额，包含 currency 和 amount 字段
 */
function parsePrice(
  priceStr: string | null | undefined
): {currency: string; amount: string} | null {
  if (!priceStr) {
    return null;
  }

  const trimmed = priceStr.trim();
  if (!trimmed) {
    return null;
  }

  // 尝试匹配格式：$48.00 或 USD 48.00
  const match = trimmed.match(/^([^\d\s]+)?\s*([\d.]+)$/);
  if (match) {
    const currency = match[1]?.trim() || "$";
    const amount = match[2]?.trim() || "";
    return {currency, amount};
  }

  // 如果无法解析，默认使用 $ 作为货币符号
  return {currency: "$", amount: trimmed};
}

/**
 * 将 Shopify 商品数据转换为标准格式
 * @param {Record<string, unknown>} shopifyData - Shopify 商品数据
 * @param {string} originalUrl - 原始商品 URL
 * @param {string | null} htmlDescription - 从 HTML 提取的描述
 * @return {Record<string, unknown>} 标准格式的商品数据
 */
function convertShopifyProductToStandard(
  shopifyData: Record<string, unknown>,
  originalUrl: string,
  htmlDescription: string | null = null
): Record<string, unknown> {
  // 处理 Shopify JSON-LD 格式
  if (shopifyData["@type"] === "Product" ||
      shopifyData["@type"] === "http://schema.org/Product") {
    const offers = shopifyData.offers as Record<string, unknown> | undefined;
    const price = (offers?.price || offers?.lowPrice) as string | null;
    const priceCurrency = (offers?.priceCurrency as string) || "USD";
    const imageUrl = resolveImageUrl(
      (shopifyData.image as string | null) || null,
      originalUrl
    );

    // 解析价格
    const priceStr = price ? `${priceCurrency} ${price}` : null;
    const parsedPrice = parsePrice(priceStr);

    const result: Record<string, unknown> = {
      id: (shopifyData.sku || shopifyData.productID ||
        `shopify_${Date.now()}`) as string,
      title: (shopifyData.name || "") as string,
      // eslint-disable-next-line max-len
      description: htmlDescription || (shopifyData.description as string | null) || null,
      price: priceStr, // 向后兼容
      imageUrl: imageUrl,
      url: originalUrl,
      platform: "shopify",
    };

    if (parsedPrice) {
      result.currency = parsedPrice.currency;
      result.amount = parsedPrice.amount;
    }

    return result;
  }

  // 处理 Shopify 原生 JSON 格式
  if (shopifyData.id || shopifyData.title) {
    const variants = (shopifyData.variants ||
      []) as Array<Record<string, unknown>>;
    const images = (shopifyData.images ||
      []) as Array<Record<string, unknown>>;
    const firstImageSrc = images.length > 0 ?
      (images[0].src as string | null) :
      null;
    const firstImage = resolveImageUrl(firstImageSrc, originalUrl);

    // 获取所有图片 URL（用于用户选择）
    const allImages = images
      .map((img: Record<string, unknown>) => {
        const src = (img.src || img) as string | null;
        return src ? resolveImageUrl(src, originalUrl) : null;
      })
      .filter((url): url is string => url !== null);

    // 获取价格（优先使用第一个 variant 的价格，如果没有则使用商品本身的价格）
    let price: string | null = null;
    if (variants.length > 0 && variants[0].price) {
      price = `$${variants[0].price}`;
    } else if (shopifyData.price) {
      price = `$${shopifyData.price}`;
    }

    // 解析价格
    const parsedPrice = parsePrice(price);

    const result: Record<string, unknown> = {
      id: (shopifyData.id?.toString() ||
        `shopify_${Date.now()}`) as string,
      title: (shopifyData.title || "") as string,
      // eslint-disable-next-line max-len
      description: htmlDescription || (shopifyData.description as string | null) || null,
      price: price, // 向后兼容
      imageUrl: firstImage,
      // eslint-disable-next-line max-len
      images: allImages.length > 0 ? allImages : (firstImage ? [firstImage] : null),
      url: originalUrl,
      platform: "shopify",
    };

    if (parsedPrice) {
      result.currency = parsedPrice.currency;
      result.amount = parsedPrice.amount;
    }

    return result;
  }

  // 如果都不匹配，返回基本数据
  const imageUrl = resolveImageUrl(
    ((shopifyData.image || shopifyData.imageUrl) as string | null) || null,
    originalUrl
  );

  return {
    id: `shopify_${Date.now()}`,
    title: ((shopifyData.name || shopifyData.title ||
      "Unknown Product") as string),
    // eslint-disable-next-line max-len
    description: htmlDescription || (shopifyData.description as string | null) || null,
    price: null,
    imageUrl: imageUrl,
    url: originalUrl,
    platform: "shopify",
  };
}

