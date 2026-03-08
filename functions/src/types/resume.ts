/**
 * Resume upload, parsing, and improvement types.
 */

import type { TimestampString, UserId } from "./common";

/** Supported resume file types. */
export type ResumeFileType = "application/pdf" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Upload status for resume processing. */
export type ResumeParseStatus =
  | "pending"      // uploaded, queued for parsing
  | "parsing"      // parser running
  | "completed"    // parsed successfully
  | "failed"       // parse failed
  | "unsupported"; // file type not supported

/** Parsed resume section types. */
export type ResumeSectionType =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "certifications"
  | "projects"
  | "languages"
  | "other";

export interface ParsedExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
  highlights?: string[];
}

export interface ParsedEducation {
  degree: string;
  institution: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  field?: string;
  gpa?: string;
}

export interface ParsedResumeSection {
  type: ResumeSectionType;
  rawText: string;
  structured?: ParsedExperience[] | ParsedEducation[] | string[] | Record<string, unknown>;
}

/** Output of resume parser (stored after parsing). */
export interface ParsedResume {
  sections: ParsedResumeSection[];
  rawFullText: string;
  contact?: {
    email?: string;
    phone?: string;
    location?: string;
    linkedIn?: string;
    website?: string;
  };
  metadata: {
    fileName: string;
    fileType: ResumeFileType;
    parsedAt: TimestampString;
    parserVersion: string;
  };
}

/** Resume document in Firestore (user-scoped). */
export interface ResumeRecord {
  userId: UserId;
  fileStoragePath: string;       // e.g. users/{uid}/resumes/{resumeId}/file.pdf
  fileContentType: ResumeFileType;
  fileName: string;
  parseStatus: ResumeParseStatus;
  parsed?: ParsedResume;
  parseError?: string;           // when status is failed
  createdAt: TimestampString;
  updatedAt: TimestampString;
  isPrimary?: boolean;           // one primary resume per user for quick apply
}

/** Resume improvement suggestion (one of many per resume). */
export interface ResumeSuggestion {
  id: string;
  resumeId: string;
  category: "grammar" | "clarity" | "ats" | "formatting" | "content" | "tailoring";
  severity: "info" | "suggestion" | "important";
  title: string;
  description: string;
  currentSnippet?: string;
  suggestedSnippet?: string;
  sectionRef?: string;           // e.g. "experience.0" or "skills"
  status?: "pending" | "applied" | "dismissed";
  createdAt: TimestampString;
}
