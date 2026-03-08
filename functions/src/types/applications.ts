/**
 * Application tracker and status.
 */

import type { TimestampString, UserId } from "./common";

export type ApplicationStatus =
  | "draft"       // not submitted
  | "submitted"
  | "viewed"
  | "in_review"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export interface ApplicationRecord {
  id: string;
  userId: UserId;
  jobId: string;
  jobTitle: string;
  company: string;
  companyLogoUrl?: string;
  status: ApplicationStatus;
  appliedAt?: TimestampString;
  resumeId?: string;            // resume used for this application
  coverLetterId?: string;       // optional generated cover letter
  source?: string;              // where they applied: "app", "linkedin", etc.
  notes?: string;               // user notes
  statusHistory: ApplicationStatusEvent[];
  createdAt: TimestampString;
  updatedAt: TimestampString;
}

export interface ApplicationStatusEvent {
  status: ApplicationStatus;
  at: TimestampString;
  note?: string;
}
