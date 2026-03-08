/**
 * Adzuna Jobs API
 * @see https://developer.adzuna.com/docs/search
 *
 * 需要两个不同凭证：Application ID 与 Application Key。
 * 在 https://developer.adzuna.com/ 注册应用后，在 Firebase 里配置：
 * ADZUNA_APP_ID、ADZUNA_APP_KEY（不能把同一个值当两个用，否则会 401）。
 */

const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID ?? "";
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY ?? "";
const ADZUNA_COUNTRY = process.env.ADZUNA_COUNTRY ?? "gb";
const BASE = `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search`;

interface AdzunaJob {
  id: string;
  title: string;
  description?: string;
  created: string;
  redirect_url?: string;
  location?: { display_name?: string; area?: string[] };
  company?: { display_name?: string };
  category?: { label?: string; tag?: string };
  salary_min?: number;
  salary_max?: number;
  contract_type?: string;
  contract_time?: string;
}

interface AdzunaResponse {
  results?: AdzunaJob[];
  count?: number;
}

/** 筛选与排序（Adzuna 支持的维度） */
export interface JobSearchFilters {
  /** 关键词（必填） */
  what: string;
  /** 地点 */
  where?: string;
  /** 排除关键词，如 "java" 排除含 java 的职位 */
  whatExclude?: string;
  /** 最低薪资（单位与地区一致，如 GBP/USD 年薪） */
  salaryMin?: number;
  /** 最高薪资 */
  salaryMax?: number;
  /** 仅全职 */
  fullTime?: boolean;
  /** 仅长期/永久合同 */
  permanent?: boolean;
  /** 排序：relevance | salary | date */
  sortBy?: "relevance" | "salary" | "date";
  page?: number;
  resultsPerPage?: number;
}

/** 调用 Adzuna 搜索职位；what 必填，支持多维度筛选 */
export async function searchAdzunaJobs(params: JobSearchFilters): Promise<{ results: AdzunaJob[]; totalCount: number }> {
  const {
    what,
    where,
    whatExclude,
    salaryMin,
    salaryMax,
    fullTime,
    permanent,
    sortBy,
    page = 1,
    resultsPerPage = 20,
  } = params;
  const whatTrim = (what || "").trim();
  if (!whatTrim) {
    return { results: [], totalCount: 0 };
  }
  if (!ADZUNA_APP_ID?.trim() || !ADZUNA_APP_KEY?.trim()) {
    throw new Error(
      "Adzuna 未配置。请在 Firebase 项目配置中设置 ADZUNA_APP_ID 和 ADZUNA_APP_KEY（在 https://developer.adzuna.com/ 注册应用获取，两个值不同）。"
    );
  }

  const url = new URL(BASE + "/" + String(page));
  url.searchParams.set("app_id", ADZUNA_APP_ID);
  url.searchParams.set("app_key", ADZUNA_APP_KEY);
  url.searchParams.set("what", whatTrim);
  url.searchParams.set("results_per_page", String(Math.min(50, resultsPerPage)));
  url.searchParams.set("content-type", "application/json");
  if (where && String(where).trim()) {
    url.searchParams.set("where", String(where).trim());
  }
  if (whatExclude && String(whatExclude).trim()) {
    url.searchParams.set("what_exclude", String(whatExclude).trim());
  }
  if (typeof salaryMin === "number" && salaryMin > 0) {
    url.searchParams.set("salary_min", String(salaryMin));
  }
  if (typeof salaryMax === "number" && salaryMax > 0) {
    url.searchParams.set("salary_max", String(salaryMax));
  }
  if (fullTime === true) {
    url.searchParams.set("full_time", "1");
  }
  if (permanent === true) {
    url.searchParams.set("permanent", "1");
  }
  if (sortBy && ["relevance", "salary", "date"].includes(sortBy)) {
    url.searchParams.set("sort_by", sortBy);
  }

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Adzuna API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as AdzunaResponse;
  const results = Array.isArray(data.results) ? data.results : [];
  const totalCount = typeof data.count === "number" ? data.count : results.length;

  return { results, totalCount };
}

/** 将 Adzuna 单条转为应用内 job 结构 */
export function adzunaJobToAppJob(adzuna: AdzunaJob): Record<string, unknown> {
  const locationDisplay =
    adzuna.location?.display_name ?? (Array.isArray(adzuna.location?.area) ? adzuna.location!.area!.join(", ") : "");
  return {
    id: "adzuna_" + adzuna.id,
    title: adzuna.title ?? "",
    company: adzuna.company?.display_name ?? "",
    location: locationDisplay,
    description: adzuna.description ?? "",
    redirectUrl: adzuna.redirect_url ?? "",
    salaryMin: adzuna.salary_min,
    salaryMax: adzuna.salary_max,
    contractType: adzuna.contract_type,
    contractTime: adzuna.contract_time,
    postedAt: adzuna.created ?? new Date().toISOString(),
    source: "adzuna",
  };
}
