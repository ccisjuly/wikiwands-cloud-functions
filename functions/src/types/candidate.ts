/**
 * Candidate profile and AI resume analysis types.
 */

import type { TimestampString, UserId } from "./common";

/** 在线简历中的一段经历（与 ParsedExperience 结构一致，便于从解析结果合并） */
export interface OnlineExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
  highlights?: string[];
}

/** 在线简历中的一段教育（与 ParsedEducation 一致） */
export interface OnlineEducation {
  degree: string;
  institution: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  field?: string;
  gpa?: string;
}

/** 候选人档案 = 每人一份的在线简历（表单可编辑）+ 求职偏好。下游推荐/投递均以此为准。 */
export interface CandidateProfile {
  userId: UserId;
  displayName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedInUrl?: string;
  website?: string;
  headline?: string;            // e.g. "Senior Software Engineer"
  summary?: string;             // 个人简介 / 经历摘要
  experience?: OnlineExperience[];
  education?: OnlineEducation[];
  yearsOfExperience?: number;
  skills: string[];             // 技能标签
  industries?: string[];
  jobTypes?: JobType[];
  workAuthorizations?: string[]; // e.g. ["US", "Remote"]
  salaryExpectation?: SalaryExpectation;
  preferredLocations?: string[];
  openToWork: boolean;
  lastResumeAnalyzedAt?: TimestampString;
  profileCompletenessScore?: number; // 0–100
  createdAt: TimestampString;
  updatedAt: TimestampString;
}

export type JobType = "full_time" | "part_time" | "contract" | "internship" | "freelance";

export interface SalaryExpectation {
  min?: number;
  max?: number;
  currency: string;
  period: "hourly" | "monthly" | "yearly";
  isConfidential?: boolean;
}

/** AI analysis result for a resume (stored per resume). */
export type ResumeAnalysisStatus = "pending" | "analyzing" | "completed" | "failed";

export interface ResumeAnalysis {
  resumeId: string;
  userId: UserId;
  status: ResumeAnalysisStatus;
  completedAt?: TimestampString;
  error?: string;
  insights: ResumeAnalysisInsights;
  suggestedProfileUpdates?: Partial<CandidateProfile>; // AI-suggested profile fields
}

export interface ResumeAnalysisInsights {
  strengths: string[];
  areasForImprovement: string[];
  suggestedSkills: string[];    // skills to add based on experience
  experienceSummary?: string;
  educationSummary?: string;
  atsScore?: number;            // 0–100, ATS compatibility
  readabilityScore?: number;    // 0–100
  keywordGaps?: string[];       // keywords that might help for target roles
}
