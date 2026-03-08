/**
 * Application asset generation (cover letters, tailored resumes, etc.).
 */

import type { TimestampString, UserId } from "./common";

export type AssetType = "cover_letter" | "tailored_resume" | "follow_up_email";

export type AssetGenerationStatus = "pending" | "generating" | "completed" | "failed";

export interface GeneratedAsset {
  id: string;
  userId: UserId;
  applicationId: string;
  jobId: string;
  type: AssetType;
  status: AssetGenerationStatus;
  resumeId?: string;            // source resume for tailored outputs
  input?: AssetInputs;
  output?: {
    content: string;            // full text
    contentType: "text/plain" | "text/html" | "application/pdf";
    storagePath?: string;       // if saved as file (e.g. PDF)
  };
  error?: string;
  createdAt: TimestampString;
  updatedAt: TimestampString;
  completedAt?: TimestampString;
}

export interface AssetInputs {
  jobDescription?: string;
  companyName?: string;
  jobTitle?: string;
  tone?: "professional" | "conversational" | "formal";
  length?: "short" | "medium" | "long";
  customInstructions?: string;
}
