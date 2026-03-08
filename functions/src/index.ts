/**
 * Firebase Cloud Functions（通过 firebase deploy 部署）
 * 全部为 Callable（onCall），客户端通过 Firebase SDK 调用。
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

import { runResumeParse } from "./ai/runParse";
import * as analysis from "./callables/analysis";
import * as applications from "./callables/applications";
import * as assets from "./callables/assets";
import * as jobs from "./callables/jobs";
import * as profile from "./callables/profile";
import * as resumes from "./callables/resumes";
import * as suggestions from "./callables/suggestions";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const ping = functions.https.onRequest((_req, res) => {
  res.status(200).json({ ok: true });
});

// ---------- 简历 ----------
export const resumeUpload = resumes.resumeUpload;
/** 用户上传简历文件到 GCS 后自动触发解析（仅 PDF）；显式指定 Firebase 默认桶 */
const STORAGE_BUCKET = "wikiwands.firebasestorage.app";
export const onResumeFileFinalized = functions.storage.bucket(STORAGE_BUCKET).object().onFinalize(async (object) => {
  const path = object.name ?? "";
  const match = path.match(/^users\/([^/]+)\/resumes\/([^/]+)\/.+$/);
  if (!match || object.contentType !== "application/pdf") return;
  const [, uid, resumeId] = match;
  const bucket = object.bucket ?? STORAGE_BUCKET;
  try {
    await runResumeParse(uid, resumeId, bucket);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    functions.logger.error("onResumeFileFinalized failed", { path, uid, resumeId, bucket, message: msg, stack });
  }
});
export const resumesList = resumes.resumesList;
export const resumeGet = resumes.resumeGet;
export const resumeGetParsed = resumes.resumeGetParsed;
export const resumeParse = resumes.resumeParse;
export const resumePatch = resumes.resumePatch;
export const resumeDelete = resumes.resumeDelete;

// ---------- 简历分析 ----------
export const resumeAnalyze = analysis.resumeAnalyze;
export const resumeAnalysisGet = analysis.resumeAnalysisGet;

// ---------- 档案 ----------
export const profileGet = profile.profileGet;
export const profileUpdate = profile.profileUpdate;
export const profileApplyFromResume = profile.profileApplyFromResume;
export const profileApplySuggestions = profile.profileApplySuggestions;
export const profileImproveRewrite = profile.profileImproveRewrite;

// ---------- 职位与推荐 ----------
export const jobRecommendations = jobs.jobRecommendations;
export const jobsList = jobs.jobsList;
export const jobGet = jobs.jobGet;

// ---------- 申请 ----------
export const applicationsList = applications.applicationsList;
export const applicationCreate = applications.applicationCreate;
export const customizeAndApply = applications.customizeAndApply;
export const applicationGet = applications.applicationGet;
export const applicationPatch = applications.applicationPatch;
export const applicationDelete = applications.applicationDelete;

// ---------- 生成素材 ----------
export const assetGenerate = assets.assetGenerate;
export const assetsListByApplication = assets.assetsListByApplication;
export const assetGet = assets.assetGet;

// ---------- 简历建议 ----------
export const resumeSuggestionsList = suggestions.resumeSuggestionsList;
export const resumeSuggestionsGenerate = suggestions.resumeSuggestionsGenerate;
export const suggestionPatch = suggestions.suggestionPatch;
