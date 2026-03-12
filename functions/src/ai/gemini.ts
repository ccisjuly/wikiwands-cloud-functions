/**
 * Vertex AI Gemini：简历解析、分析、改进建议
 * 使用 ADC，无需 API Key；需在 GCP 启用 Vertex AI API。
 */
import { VertexAI } from "@google-cloud/vertexai";
import type { ParsedResume, ResumeFileType } from "../types/resume";
import type { ResumeAnalysisInsights } from "../types/candidate";
import type { ResumeSuggestion } from "../types/resume";

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "";
const LOCATION = process.env.VERTEX_LOCATION ?? "us-central1";
const PARSER_VERSION = "1.0.0-gemini";

let vertexModel: ReturnType<VertexAI["getGenerativeModel"]> | null = null;

function getModel() {
  if (!vertexModel) {
    if (!PROJECT_ID) throw new Error("GCLOUD_PROJECT not set");
    const vertex = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    vertexModel = vertex.getGenerativeModel({
      model: "gemini-2.0-flash-001",
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });
  }
  return vertexModel;
}

function getTextFromResponse(result: { response: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } }): string {
  const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

function parseJson<T>(text: string): T {
  const trimmed = text.trim();
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(stripped) as T;
}

const PDF_PROMPT = `You are a resume parser. Extract structured information from the attached resume (PDF).
Return strictly the following JSON (JSON only, no other text):
{
  "sections": [
    {
      "type": "summary" | "experience" | "education" | "skills" | "certifications" | "projects" | "languages" | "other",
      "rawText": "raw text of this section",
      "structured": optional; for experience: array of { title, company, location?, startDate?, endDate?, current?, description?, highlights? }; for education: array of { degree, institution, location?, startDate?, endDate?, field?, gpa? }; for skills: string array
    }
  ],
  "rawFullText": "full resume plain text (for search)",
  "contact": {
    "email": "",
    "phone": "",
    "location": "",
    "linkedIn": "",
    "website": ""
  }
}
Output valid JSON only, no markdown code blocks.`;

/** 从 PDF Buffer（base64）解析简历，不依赖 Vertex 读 GCS，避免 service agent 未就绪 */
export async function parseResumeFromPdfBuffer(
  pdfBuffer: Buffer,
  fileName: string,
  fileType: ResumeFileType
): Promise<ParsedResume> {
  const model = getModel();
  const now = new Date().toISOString();
  const base64 = pdfBuffer.toString("base64");
  const parts = [
    { inlineData: { mimeType: "application/pdf" as const, data: base64 } },
    { text: PDF_PROMPT },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await model.generateContent({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json" } } as any);
  const text = getTextFromResponse(result);
  const raw = parseJson<Record<string, unknown>>(text);
  return {
    sections: (raw.sections as ParsedResume["sections"]) ?? [],
    rawFullText: (raw.rawFullText as string) ?? "",
    contact: raw.contact as ParsedResume["contact"],
    metadata: { fileName, fileType, parsedAt: now, parserVersion: PARSER_VERSION },
  };
}

/** 从 GCS fileUri 解析（需 Vertex service agent 能读 GCS；若报 400 请改用 parseResumeFromPdfBuffer） */
export async function parseResumeFromPdf(
  fileUri: string,
  fileName: string,
  fileType: ResumeFileType
): Promise<ParsedResume> {
  const model = getModel();
  const now = new Date().toISOString();
  const parts: Array<{ fileData?: { fileUri: string; mimeType: string }; text?: string }> = [];
  if (fileUri.startsWith("gs://")) {
    parts.push({ fileData: { fileUri, mimeType: "application/pdf" } });
  }
  parts.push({ text: PDF_PROMPT });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await model.generateContent({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json" } } as any);
  const text = getTextFromResponse(result);
  const raw = parseJson<Record<string, unknown>>(text);
  return {
    sections: (raw.sections as ParsedResume["sections"]) ?? [],
    rawFullText: (raw.rawFullText as string) ?? "",
    contact: raw.contact as ParsedResume["contact"],
    metadata: { fileName, fileType, parsedAt: now, parserVersion: PARSER_VERSION },
  };
}

/** 从纯文本解析简历（无 PDF 时用，如 Word 转文本后） */
export async function parseResumeFromText(
  rawText: string,
  fileName: string,
  fileType: ResumeFileType
): Promise<ParsedResume> {
  const model = getModel();
  const now = new Date().toISOString();
  const prompt = `你是一个简历解析器。根据以下简历纯文本，提取结构化信息。
只返回合法 JSON，不要 markdown 或其它文字。结构同 parseResumeFromPdf 的说明：
{
  "sections": [ { "type": "summary"|"experience"|"education"|"skills"|... , "rawText": "...", "structured": ... } ],
  "rawFullText": "原文",
  "contact": { "email","phone","location","linkedIn","website" }
}

简历文本：
\`\`\`
${rawText.slice(0, 28000)}
\`\`\``;

  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
  const text = getTextFromResponse(result);
  const raw = parseJson<Record<string, unknown>>(text);
  return {
    sections: (raw.sections as ParsedResume["sections"]) ?? [],
    rawFullText: (raw.rawFullText as string) ?? rawText.slice(0, 50000),
    contact: raw.contact as ParsedResume["contact"],
    metadata: { fileName, fileType, parsedAt: now, parserVersion: PARSER_VERSION },
  };
}

/** AI 分析简历，返回 insights */
export async function analyzeResumeWithGemini(
  rawFullText: string,
  parsedSectionsSummary?: string
): Promise<ResumeAnalysisInsights> {
  const model = getModel();
  const prompt = `你是一位职业顾问。根据以下简历内容，给出简洁、可操作的分析。
${parsedSectionsSummary ? `结构化摘要：\n${parsedSectionsSummary}\n\n` : ""}
简历全文（节选）：\n${rawFullText.slice(0, 20000)}

请只返回以下 JSON（不要其它文字）：
{
  "strengths": ["优势1", "优势2", ...],
  "areasForImprovement": ["可改进点1", ...],
  "suggestedSkills": ["建议补充的技能或关键词1", ...],
  "experienceSummary": "一句话经历概括（可选）",
  "educationSummary": "一句话学历概括（可选）",
  "atsScore": 0-100 的 ATS 友好度（可选），
  "readabilityScore": 0-100 可读性（可选），
  "keywordGaps": ["可补充的关键词1", ...]（可选）
}`;

  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
  const text = getTextFromResponse(result);
  const raw = parseJson<Record<string, unknown>>(text);
  return {
    strengths: Array.isArray(raw.strengths) ? raw.strengths as string[] : [],
    areasForImprovement: Array.isArray(raw.areasForImprovement) ? raw.areasForImprovement as string[] : [],
    suggestedSkills: Array.isArray(raw.suggestedSkills) ? raw.suggestedSkills as string[] : [],
    experienceSummary: typeof raw.experienceSummary === "string" ? raw.experienceSummary : undefined,
    educationSummary: typeof raw.educationSummary === "string" ? raw.educationSummary : undefined,
    atsScore: typeof raw.atsScore === "number" ? raw.atsScore : undefined,
    readabilityScore: typeof raw.readabilityScore === "number" ? raw.readabilityScore : undefined,
    keywordGaps: Array.isArray(raw.keywordGaps) ? raw.keywordGaps as string[] : undefined,
  };
}

const SUGGESTION_CATEGORIES = ["grammar", "clarity", "ats", "formatting", "content", "tailoring"] as const;
const SEVERITIES = ["info", "suggestion", "important"] as const;

/** 生成简历改进建议列表 */
export async function suggestResumeWithGemini(
  rawFullText: string,
  parsedSectionsSummary?: string
): Promise<Omit<ResumeSuggestion, "id" | "resumeId" | "createdAt">[]> {
  const model = getModel();
  const prompt = `你是一位简历优化专家。根据以下简历内容，给出 3～8 条具体改进建议。
${parsedSectionsSummary ? `摘要：\n${parsedSectionsSummary}\n\n` : ""}
简历全文（节选）：\n${rawFullText.slice(0, 20000)}

请只返回一个 JSON 数组，每项格式：
{
  "category": "grammar" | "clarity" | "ats" | "formatting" | "content" | "tailoring",
  "severity": "info" | "suggestion" | "important",
  "title": "简短标题",
  "description": "具体说明与建议",
  "currentSnippet": "原文片段（可选）",
  "suggestedSnippet": "建议改写（可选）",
  "sectionRef": "如 experience.0 或 skills（可选）"
}
不要 markdown，只输出 [ {...}, {...} ]`;

  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
  const text = getTextFromResponse(result);
  let arr: unknown[];
  try {
    const parsed = parseJson<unknown>(text);
    arr = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "suggestions" in parsed && Array.isArray((parsed as { suggestions: unknown[] }).suggestions) ? (parsed as { suggestions: unknown[] }).suggestions : []);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
    .map((x) => ({
      category: SUGGESTION_CATEGORIES.includes(x.category as typeof SUGGESTION_CATEGORIES[number]) ? x.category as ResumeSuggestion["category"] : "content",
      severity: SEVERITIES.includes(x.severity as typeof SEVERITIES[number]) ? x.severity as ResumeSuggestion["severity"] : "suggestion",
      title: String(x.title ?? "建议"),
      description: String(x.description ?? ""),
      currentSnippet: x.currentSnippet != null ? String(x.currentSnippet) : undefined,
      suggestedSnippet: x.suggestedSnippet != null ? String(x.suggestedSnippet) : undefined,
      sectionRef: x.sectionRef != null ? String(x.sectionRef) : undefined,
      status: "pending" as const,
    }));
}

/** 在线简历评分与 AI 改写建议：根据当前 profile 返回评分、优化项、改写后的字段；expectedScore 必须 > score */
export interface OnlineResumeImproveResult {
  score: number;
  expectedScore: number;
  items: Array<{ section: string; message: string }>;
  suggested: {
    summary?: string;
    headline?: string;
    experience?: Array<{ company: string; title: string; description?: string; highlights?: string[]; startDate?: string; endDate?: string; current?: boolean; location?: string }>;
    skills?: string[];
  };
}

export async function improveOnlineResumeWithGemini(profile: Record<string, unknown>): Promise<OnlineResumeImproveResult> {
  const model = getModel();
  const summary = (profile.summary as string) ?? "";
  const headline = (profile.headline as string) ?? "";
  const experience = (profile.experience as Array<Record<string, unknown>>) ?? [];
  const education = (profile.education as Array<Record<string, unknown>>) ?? [];
  const skills = (profile.skills as string[]) ?? [];
  const text = `当前在线简历内容：
【期望职位】${headline}
【个人简介】${summary}
【工作经历】${JSON.stringify(experience)}
【教育经历】${JSON.stringify(education)}
【技能】${skills.join("、")}

请作为简历优化专家：
1. 对当前简历做专业评分 score（0-100），考虑完整性、表述、与求职的匹配度。
2. 列出 1～5 条待优化项，每项包含 section（如 "个人信息" "个人简介" "工作经历"）和 message（简短说明）。
3. 对可改写的部分给出改写建议（summary、headline、experience、skills），改写后的版本必须优于当前，使 expectedScore 严格大于 score（expectedScore 为采用建议后的预估评分，0-100）。
4. 若当前已很完善，可只微调或补充，但 expectedScore 仍须至少比 score 高 1 分（上限 100）。

请只返回以下 JSON（不要其它文字）：
{
  "score": 0-100,
  "expectedScore": 0-100,
  "items": [ { "section": "section名", "message": "说明" }, ... ],
  "suggested": {
    "summary": "改写后的个人简介（若无需改则省略）",
    "headline": "改写后的期望职位（若无需改则省略）",
    "experience": [ { "company", "title", "description", "highlights", "startDate", "endDate", "current", "location" } ]（仅当有改写时返回完整数组，否则省略），
    "skills": [ "技能1", ... ]（合并原技能与建议补充，去重，否则省略）
  }
}`;

  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text }] }] });
  const out = getTextFromResponse(result);
  const raw = parseJson<Record<string, unknown>>(out);
  const score = typeof raw.score === "number" && raw.score >= 0 && raw.score <= 100 ? raw.score : 70;
  let expectedScore = typeof raw.expectedScore === "number" && raw.expectedScore >= 0 && raw.expectedScore <= 100 ? raw.expectedScore : Math.min(100, score + 5);
  if (expectedScore <= score) expectedScore = Math.min(100, score + 5);
  const items = Array.isArray(raw.items)
    ? (raw.items as Array<{ section?: string; message?: string }>).map((x) => ({
        section: String(x.section ?? ""),
        message: String(x.message ?? ""),
      }))
    : [];
  const sug = (raw.suggested as Record<string, unknown>) ?? {};
  const suggested: OnlineResumeImproveResult["suggested"] = {};
  if (typeof sug.summary === "string") suggested.summary = sug.summary.slice(0, 4000);
  if (typeof sug.headline === "string") suggested.headline = sug.headline.slice(0, 200);
  if (Array.isArray(sug.experience)) suggested.experience = sug.experience as OnlineResumeImproveResult["suggested"]["experience"];
  if (Array.isArray(sug.skills)) suggested.skills = (sug.skills as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 100);
  return { score, expectedScore, items, suggested };
}

/** 针对某职位定制在线简历版本：根据职位信息改写 headline、summary、突出经历与技能，用于该职位申请 */
export interface TailoredProfileForJob {
  headline?: string;
  summary?: string;
  experience?: Array<{ company: string; title: string; description?: string; highlights?: string[]; startDate?: string; endDate?: string; current?: boolean; location?: string }>;
  skills?: string[];
}

export async function tailorProfileForJob(
  profile: Record<string, unknown>,
  job: { title: string; company: string; description?: string }
): Promise<TailoredProfileForJob> {
  const model = getModel();
  const headline = (profile.headline as string) ?? "";
  const summary = (profile.summary as string) ?? "";
  const experience = (profile.experience as Array<Record<string, unknown>>) ?? [];
  const skills = (profile.skills as string[]) ?? [];
  const jobDesc = (job.description ?? "").slice(0, 6000);
  const prompt = `你是一位求职顾问。用户要用在线简历申请以下职位，请根据职位信息对简历做针对性定制（只改写与职位相关的部分，保持真实、不捏造）。

【目标职位】
标题：${job.title}
公司：${job.company}
${jobDesc ? `职位描述：\n${jobDesc}\n` : ""}

【用户当前在线简历】
期望职位：${headline}
个人简介：${summary}
工作经历：${JSON.stringify(experience)}
技能：${skills.join("、")}

请只返回以下 JSON（不要其它文字）：
{
  "headline": "针对该职位优化的期望职位表述（一句话，可与原 headline 微调以贴合职位）",
  "summary": "针对该职位优化的个人简介（2～5 句，突出与职位相关的经历与优势，不编造）",
  "experience": 原 experience 数组，可对与职位最相关的 1～2 条略作 description 或 highlights 的润色以贴合职位，其余保持原样；若无需改则返回原数组结构,
  "skills": 技能数组：保留用户原有技能，将职位描述中出现且用户可能具备的关键词排在前面，可补充 1～3 个与职位强相关的通用技能（不编造用户没有的）
}

要求：所有内容必须基于用户已有信息，仅做表述优化与顺序调整，不得虚构经历或技能。`;

  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
  const out = getTextFromResponse(result);
  const raw = parseJson<Record<string, unknown>>(out);
  const tailored: TailoredProfileForJob = {};
  if (typeof raw.headline === "string") tailored.headline = raw.headline.slice(0, 200);
  if (typeof raw.summary === "string") tailored.summary = raw.summary.slice(0, 4000);
  if (Array.isArray(raw.experience)) tailored.experience = raw.experience as TailoredProfileForJob["experience"];
  if (Array.isArray(raw.skills)) tailored.skills = (raw.skills as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 100);
  return tailored;
}

/** 批量计算当前档案与职位的匹配率、以及 AI 定制后的预计匹配率（aiMatch 应 >= currentMatch） */
export interface JobMatchRate {
  currentMatch: number;
  aiMatch: number;
}

export async function computeMatchRates(
  profile: Record<string, unknown>,
  jobs: Array<{ title: string; description?: string }>
): Promise<JobMatchRate[]> {
  if (jobs.length === 0) return [];
  const model = getModel();
  const headline = (profile.headline as string) ?? "";
  const summary = (profile.summary as string) ?? "";
  const skills = (profile.skills as string[]) ?? [];
  const experience = (profile.experience as Array<Record<string, unknown>>) ?? [];
  const jobsText = jobs
    .map((j, i) => `[${i}] 标题: ${j.title}\n描述: ${(j.description ?? "").slice(0, 800)}`)
    .join("\n\n");
  const prompt = `你是一位招聘匹配专家。根据用户当前在线简历与下列职位，对每个职位给出两个 0-100 的分数（只输出 JSON，不要其它文字）：
1. currentMatch：当前简历与该职位的匹配度（基于期望职位、简介、技能、经历与职位要求的一致性）。
2. aiMatch：若用 AI 针对该职位定制简历后的预计匹配度，必须 >= currentMatch，通常高 5～20 分。

用户简历摘要：
- 期望职位：${headline}
- 简介：${summary.slice(0, 500)}
- 技能：${skills.join("、")}
- 经历条数：${experience.length}

职位列表：
${jobsText}

请只返回一个 JSON 数组，长度与职位数一致，每项格式：{ "currentMatch": 0-100, "aiMatch": 0-100 }。例如：[{"currentMatch":72,"aiMatch":88},{"currentMatch":65,"aiMatch":82}]`;

  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
  const out = getTextFromResponse(result);
  const raw = parseJson<unknown>(out);
  const arr = Array.isArray(raw) ? raw : [];
  return jobs.map((_, i) => {
    const item = arr[i];
    if (item && typeof item === "object" && "currentMatch" in item && "aiMatch" in item) {
      let cur = Number((item as { currentMatch: unknown }).currentMatch);
      let ai = Number((item as { aiMatch: unknown }).aiMatch);
      if (Number.isNaN(cur)) cur = 72;
      if (Number.isNaN(ai)) ai = Math.min(100, cur + 12);
      cur = Math.max(0, Math.min(100, Math.round(cur)));
      ai = Math.max(cur, Math.min(100, Math.round(ai)));
      return { currentMatch: cur, aiMatch: ai };
    }
    return { currentMatch: 72, aiMatch: 85 };
  });
}
