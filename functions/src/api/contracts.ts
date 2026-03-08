/**
 * REST API contracts: routes, methods, and request/response types.
 * Implement with Firebase Callable Functions or HTTP (onRequest/onCall).
 * Base URL assumed: /api/v1 (or region + project + cloudfunctions.net for HTTP).
 */

import type {
  ApiSuccess,
  PaginatedResponse,
  PaginationParams,
} from "../types";
import type {
  ApplicationRecord,
  ApplicationStatus,
  CandidateProfile,
  GeneratedAsset,
  JobListing,
  JobRecommendation,
  ParsedResume,
  ResumeAnalysis,
  ResumeRecord,
  ResumeSuggestion,
} from "../types";
import type { AssetInputs } from "../types";

// ---------------------------------------------------------------------------
// 1) Resume upload and parsing
// ---------------------------------------------------------------------------

/** POST /resumes/upload (multipart or JSON with signed URL) */
export interface ResumeUploadRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** Optional: client can request a signed upload URL and then confirm. */
  confirmUpload?: boolean;
}

export interface ResumeUploadResponse {
  resumeId: string;
  uploadUrl?: string;           // signed URL for PUT upload (if confirmUpload false)
  status: "pending" | "parsing";
  expiresAt?: string;           // uploadUrl expiry
}

/** GET /users/me/resumes */
export type ResumeListResponse = PaginatedResponse<ResumeRecord>;

/** GET /users/me/resumes/:resumeId */
export type ResumeGetResponse = ApiSuccess<ResumeRecord>;

/** GET /users/me/resumes/:resumeId/parsed */
export type ResumeParsedResponse = ApiSuccess<{ parsed: ParsedResume }>;

/** POST /users/me/resumes/:resumeId/parse (re-trigger parse) */
export type ResumeParseTriggerResponse = ApiSuccess<{ status: string }>;

/** PATCH /users/me/resumes/:resumeId (e.g. set isPrimary) */
export interface ResumePatchRequest {
  isPrimary?: boolean;
}
export type ResumePatchResponse = ApiSuccess<ResumeRecord>;

/** DELETE /users/me/resumes/:resumeId */
export type ResumeDeleteResponse = ApiSuccess<{ deleted: true }>;

// ---------------------------------------------------------------------------
// 2) AI resume analysis
// ---------------------------------------------------------------------------

/** POST /users/me/resumes/:resumeId/analyze */
export interface ResumeAnalyzeRequest {
  /** If true, also refresh profile suggestions from analysis. */
  updateProfileSuggestions?: boolean;
}
export type ResumeAnalyzeResponse = ApiSuccess<ResumeAnalysis>;

/** GET /users/me/resumes/:resumeId/analysis */
export type ResumeAnalysisGetResponse = ApiSuccess<ResumeAnalysis>;

// ---------------------------------------------------------------------------
// 3) Candidate profile
// ---------------------------------------------------------------------------

/** GET /users/me/profile */
export type ProfileGetResponse = ApiSuccess<CandidateProfile>;

/** PUT /users/me/profile */
export type ProfileUpdateRequest = Partial<Omit<CandidateProfile, "userId" | "createdAt" | "updatedAt">>;
export type ProfileUpdateResponse = ApiSuccess<CandidateProfile>;

/** POST /users/me/profile/apply-suggestions (apply AI-suggested profile updates) */
export interface ProfileApplySuggestionsRequest {
  resumeId: string;
  /** Which suggested fields to apply (keys from suggestedProfileUpdates). */
  fields: string[];
}
export type ProfileApplySuggestionsResponse = ApiSuccess<CandidateProfile>;

// ---------------------------------------------------------------------------
// 4) Job recommendations
// ---------------------------------------------------------------------------

/** GET /users/me/jobs/recommendations */
export interface JobRecommendationsQuery extends PaginationParams {
  limit?: number;
  cursor?: string | null;
  /** Optional filters. */
  jobTypes?: string[];
  locations?: string[];
  remoteOnly?: boolean;
}
export type JobRecommendationsResponse = ApiSuccess<PaginatedResponse<JobRecommendation>>;

/** GET /jobs (public or authenticated discovery) */
export interface JobSearchQuery extends PaginationParams {
  q?: string;
  location?: string;
  jobType?: string;
  remoteOnly?: boolean;
}
export type JobSearchResponse = ApiSuccess<PaginatedResponse<{ job: JobListing }>>;

/** GET /jobs/:jobId */
export type JobGetResponse = ApiSuccess<JobListing>;

// ---------------------------------------------------------------------------
// 5) Application asset generation
// ---------------------------------------------------------------------------

/** POST /users/me/applications/:applicationId/assets */
export interface GenerateAssetRequest {
  type: "cover_letter" | "tailored_resume" | "follow_up_email";
  resumeId?: string;
  options?: AssetInputs;
}
export type GenerateAssetResponse = ApiSuccess<GeneratedAsset>;

/** GET /users/me/applications/:applicationId/assets */
export type ListAssetsResponse = ApiSuccess<GeneratedAsset[]>;

/** GET /users/me/assets/:assetId */
export type GetAssetResponse = ApiSuccess<GeneratedAsset>;

// ---------------------------------------------------------------------------
// 6) Application tracker
// ---------------------------------------------------------------------------

/** GET /users/me/applications */
export interface ApplicationListQuery extends PaginationParams {
  status?: ApplicationStatus;
  sort?: "updatedAt" | "appliedAt";
  order?: "asc" | "desc";
}
export type ApplicationListResponse = ApiSuccess<PaginatedResponse<ApplicationRecord>>;

/** POST /users/me/applications */
export interface ApplicationCreateRequest {
  jobId: string;
  jobTitle: string;
  company: string;
  companyLogoUrl?: string;
  resumeId?: string;
  coverLetterId?: string;
  source?: string;
  notes?: string;
}
export type ApplicationCreateResponse = ApiSuccess<ApplicationRecord>;

/** GET /users/me/applications/:applicationId */
export type ApplicationGetResponse = ApiSuccess<ApplicationRecord>;

/** PATCH /users/me/applications/:applicationId */
export interface ApplicationPatchRequest {
  status?: ApplicationStatus;
  notes?: string;
  resumeId?: string;
  coverLetterId?: string;
}
export type ApplicationPatchResponse = ApiSuccess<ApplicationRecord>;

/** DELETE /users/me/applications/:applicationId */
export type ApplicationDeleteResponse = ApiSuccess<{ deleted: true }>;

// ---------------------------------------------------------------------------
// 7) Resume improvement suggestions
// ---------------------------------------------------------------------------

/** GET /users/me/resumes/:resumeId/suggestions */
export type ResumeSuggestionsListResponse = ApiSuccess<ResumeSuggestion[]>;

/** POST /users/me/resumes/:resumeId/suggestions (trigger AI suggestions) */
export type ResumeSuggestionsGenerateResponse = ApiSuccess<{ count: number; suggestions: ResumeSuggestion[] }>;

/** PATCH /users/me/resumes/:resumeId/suggestions/:suggestionId (dismiss or mark applied) */
export interface SuggestionPatchRequest {
  status?: "pending" | "applied" | "dismissed";
}
export type SuggestionPatchResponse = ApiSuccess<ResumeSuggestion>;
