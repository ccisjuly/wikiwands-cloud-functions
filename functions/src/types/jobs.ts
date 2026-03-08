/**
 * Job listings and recommendations.
 */

import type { TimestampString } from "./common";

export interface JobListing {
  id: string;
  externalId?: string;          // from job board or ATS
  title: string;
  company: string;
  companyLogoUrl?: string;
  location: string;
  locations?: string[];         // multiple or remote
  isRemote?: boolean;
  jobType: string;              // full_time, contract, etc.
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  description: string;
  requirements?: string[];
  benefits?: string[];
  postedAt: TimestampString;
  expiresAt?: TimestampString;
  source: string;               // e.g. "greenhouse", "lever", "linkedin"
  applyUrl?: string;
}

/** Single job recommendation with match metadata. */
export interface JobRecommendation {
  job: JobListing;
  score: number;                // 0–100 match score
  matchReasons: string[];       // e.g. "Skills match", "Experience level"
  keywordMatches?: string[];
}
