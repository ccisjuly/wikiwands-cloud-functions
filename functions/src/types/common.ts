/**
 * Shared types and utilities for the job-application backend.
 * Firebase-friendly: use ISO strings for dates in API; Firestore Timestamp in DB.
 */

/** Use Firebase FieldValue.serverTimestamp() when writing; read as admin.firestore.Timestamp. */
export type ServerTimestamp = import("firebase-admin").firestore.Timestamp;

/** ISO 8601 date-time string for API request/response. */
export type TimestampString = string;

/** Pagination cursor (opaque string; use last document ID or encoded cursor). */
export type Cursor = string | null;

export interface PaginationParams {
  limit?: number;
  cursor?: Cursor;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: Cursor;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Standard API envelope for success. */
export interface ApiSuccess<T> {
  data: T;
}

/** Standard API envelope for error (HTTP 4xx/5xx). */
export interface ApiErrorResponse {
  error: ApiError;
}

/** Resource ownership: all user-scoped resources keyed by Firebase Auth UID. */
export type UserId = string;

/** Generic document with Firestore metadata. */
export interface DocumentMeta {
  id: string;
  createdAt: TimestampString;
  updatedAt: TimestampString;
  createdBy?: UserId;
}
