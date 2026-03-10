/**
 * Firestore collection layout and document shapes.
 * All user data is scoped by Firebase Auth UID. Use Firestore security rules to enforce.
 *
 * Storage: use Firebase Storage for resume files; paths are stored in Firestore.
 */

import type {
  ApplicationRecord,
  CandidateProfile,
  GeneratedAsset,
  JobListing,
  ResumeAnalysis,
  ResumeRecord,
  ResumeSuggestion,
} from "../types";

// ---------------------------------------------------------------------------
// Collection names (single source of truth)
// ---------------------------------------------------------------------------

export const COLLECTIONS = {
  /** Root: users/{userId} — one doc per user with profile and preferences. */
  USERS: "users",

  /** Subcollection: users/{userId}/resumes — uploaded resumes and parse results. */
  RESUMES: "resumes",

  /** Subcollection: users/{userId}/resumeAnalyses — one doc per resume analysis. */
  RESUME_ANALYSES: "resumeAnalyses",

  /** Subcollection: users/{userId}/resumeSuggestions — improvement suggestions per resume. */
  RESUME_SUGGESTIONS: "resumeSuggestions",

  /** Subcollection: users/{userId}/applications — application tracker. */
  APPLICATIONS: "applications",

  /** Subcollection: users/{userId}/generatedAssets — cover letters, tailored resumes. */
  GENERATED_ASSETS: "generatedAssets",

  /** Root: jobs — job listings (can be populated by sync or external API). */
  JOBS: "jobs",

  /** Root: 推荐职位 Adzuna 结果短期缓存（按查询参数 key，TTL 约 10 分钟） */
  JOB_RECOMMENDATION_CACHE: "jobRecommendationCache",

  /** Subcollection: users/{userId}/customizedResumes — 按职位描述定制的在线简历版本 */
  CUSTOMIZED_RESUMES: "customizedResumes",
} as const;

// ---------------------------------------------------------------------------
// Document paths (helpers for codegen / SDK)
// ---------------------------------------------------------------------------

export function userPath(userId: string): string {
  return `${COLLECTIONS.USERS}/${userId}`;
}

export function resumePath(userId: string, resumeId: string): string {
  return `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.RESUMES}/${resumeId}`;
}

export function resumeAnalysisPath(userId: string, resumeId: string): string {
  return `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.RESUME_ANALYSES}/${resumeId}`;
}

export function resumeSuggestionPath(userId: string, suggestionId: string): string {
  return `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.RESUME_SUGGESTIONS}/${suggestionId}`;
}

export function applicationPath(userId: string, applicationId: string): string {
  return `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.APPLICATIONS}/${applicationId}`;
}

export function generatedAssetPath(userId: string, assetId: string): string {
  return `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.GENERATED_ASSETS}/${assetId}`;
}

export function jobPath(jobId: string): string {
  return `${COLLECTIONS.JOBS}/${jobId}`;
}

export function customizedResumePath(userId: string, resumeId: string): string {
  return `${COLLECTIONS.USERS}/${userId}/${COLLECTIONS.CUSTOMIZED_RESUMES}/${resumeId}`;
}

// ---------------------------------------------------------------------------
// Document shapes (Firestore field types)
// Use Timestamp for createdAt/updatedAt in DB; convert to ISO string in API.
// ---------------------------------------------------------------------------

export type UserDocument = CandidateProfile;

export type ResumeDocument = ResumeRecord;

export type ResumeAnalysisDocument = ResumeAnalysis;

export type ResumeSuggestionDocument = ResumeSuggestion;

export type ApplicationDocument = ApplicationRecord;

export type GeneratedAssetDocument = GeneratedAsset;

export type JobDocument = JobListing;

// ---------------------------------------------------------------------------
// Indexes (firestore.indexes.json)
// ---------------------------------------------------------------------------

/**
 * Required composite indexes (add to firestore.indexes.json):
 *
 * 1) users/{userId}/applications
 *    - status (Ascending), updatedAt (Descending)
 *    - For: "My applications" list filtered by status, sorted by recent
 *
 * 2) users/{userId}/applications
 *    - appliedAt (Descending)
 *    - For: "My applications" list sorted by applied date
 *
 * 3) users/{userId}/resumes
 *    - createdAt (Descending)
 *    - For: List resumes by upload time
 *
 * 4) users/{userId}/resumeSuggestions
 *    - resumeId (Ascending), createdAt (Descending)
 *    - For: Suggestions for a given resume
 *
 * 5) users/{userId}/generatedAssets
 *    - applicationId (Ascending), type (Ascending)
 *    - For: Assets for an application
 *
 * 6) jobs
 *    - postedAt (Descending), (optional: location, jobType for filters)
 *    - For: Job discovery and recommendations
 */
