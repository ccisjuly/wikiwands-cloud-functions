export type EntitlementProduct = {
  active: boolean;
  end?: FirebaseFirestore.Timestamp | null;
  source: "revenuecat";
  quotaRemaining?: number;
};

export type EntitlementsDoc = {
  products?: Record<string, EntitlementProduct>;
  tags?: string[];
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
};

export type CreditsDoc = {
  gift_credit: number;
  paid_credit: number;
  last_gift_reset?: FirebaseFirestore.Timestamp | null;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
};

export const COLLECTIONS = {
  USERS: "users",
  ENTITLEMENTS: "entitlements",
  PAYMENTS_RC: "payments/rc",
  CREDITS: "credits",
  TRANSACTIONS: "transactions",
  PRODUCTS: "products",
} as const;

// ---------- API / Schema types (for schema/firestore.ts and api/contracts.ts) ----------
export interface ApiSuccess<T> {
  data?: T;
  ok?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string | null;
}

export type ApplicationStatus = "draft" | "submitted" | "viewed" | "rejected" | "withdrawn";

export interface ApplicationRecord {
  id: string;
  userId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  companyLogoUrl?: string | null;
  status: ApplicationStatus;
  resumeId?: string | null;
  coverLetterId?: string | null;
  source?: string | null;
  notes?: string | null;
  statusHistory?: { status: string; at: string }[];
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface CandidateProfile {
  userId: string;
  displayName?: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
  summary?: string;
  experience?: unknown[];
  education?: unknown[];
  skills?: string[];
  resumeScore?: number;
  [key: string]: unknown;
}

export interface GeneratedAsset {
  id: string;
  applicationId: string;
  type: string;
  [key: string]: unknown;
}

export interface JobListing {
  id: string;
  title?: string;
  company?: string;
  description?: string;
  [key: string]: unknown;
}

export interface JobRecommendation {
  job: JobListing;
  score?: number;
  currentMatch?: number;
  aiMatch?: number;
  appliedApplicationId?: string;
}

export interface ParsedResume {
  rawFullText?: string;
  sections?: unknown[];
  [key: string]: unknown;
}

export interface ResumeAnalysis {
  resumeId: string;
  [key: string]: unknown;
}

export interface ResumeRecord {
  id: string;
  userId: string;
  [key: string]: unknown;
}

export interface ResumeSuggestion {
  id: string;
  resumeId: string;
  [key: string]: unknown;
}

export interface AssetInputs {
  [key: string]: unknown;
}

export const RC_EVENT_FIELD = {
  ID: "id",
  EVENT: "event",
  UID: "uid",
  PRODUCT_ID: "productId",
} as const;

export const CREDIT_CONSTANTS = {
  MONTHLY_GIFT_CREDIT: 10,
  NON_SUBSCRIPTION_PURCHASE_CREDIT: 10,
  USE_CREDITS_AMOUNT: 5, // 每次使用点数的固定数量
} as const;
