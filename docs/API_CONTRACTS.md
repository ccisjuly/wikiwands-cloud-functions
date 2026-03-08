# Job Application Backend — API Contracts

REST API for the AI-first job application app. All authenticated endpoints are scoped to the current user (Firebase Auth UID).

**Base path:** `https://<region>-<project>.cloudfunctions.net/api/v1`  
**Auth:** Bearer token (Firebase ID token) for user-scoped routes.

---

## Route summary

| Method | Path | Description |
|--------|------|-------------|
| **Resume upload & parsing** |
| POST | `/resumes/upload` | Upload resume (returns `resumeId`, optional signed `uploadUrl`) |
| GET | `/users/me/resumes` | List resumes (paginated) |
| GET | `/users/me/resumes/:resumeId` | Get resume + parse status |
| GET | `/users/me/resumes/:resumeId/parsed` | Get parsed resume content only |
| POST | `/users/me/resumes/:resumeId/parse` | Re-trigger parse |
| PATCH | `/users/me/resumes/:resumeId` | Update (e.g. `isPrimary`) |
| DELETE | `/users/me/resumes/:resumeId` | Delete resume |
| **AI resume analysis** |
| POST | `/users/me/resumes/:resumeId/analyze` | Run AI analysis |
| GET | `/users/me/resumes/:resumeId/analysis` | Get analysis result |
| **Candidate profile** |
| GET | `/users/me/profile` | Get profile |
| PUT | `/users/me/profile` | Update profile |
| POST | `/users/me/profile/apply-suggestions` | Apply AI-suggested profile fields |
| **Job recommendations** |
| GET | `/users/me/jobs/recommendations` | Get personalized job recommendations (paginated) |
| GET | `/jobs` | Search/list jobs (optional filters) |
| GET | `/jobs/:jobId` | Get job details |
| **Application assets** |
| POST | `/users/me/applications/:applicationId/assets` | Generate cover letter / tailored resume / follow-up |
| GET | `/users/me/applications/:applicationId/assets` | List assets for application |
| GET | `/users/me/assets/:assetId` | Get single asset |
| **Application tracker** |
| GET | `/users/me/applications` | List applications (filter by status, sort) |
| POST | `/users/me/applications` | Create application |
| GET | `/users/me/applications/:applicationId` | Get application |
| PATCH | `/users/me/applications/:applicationId` | Update status / notes |
| DELETE | `/users/me/applications/:applicationId` | Delete application |
| **Resume suggestions** |
| GET | `/users/me/resumes/:resumeId/suggestions` | List improvement suggestions |
| POST | `/users/me/resumes/:resumeId/suggestions` | Generate AI suggestions |
| PATCH | `/users/me/resumes/:resumeId/suggestions/:suggestionId` | Update suggestion (e.g. dismiss) |

---

## Request/response shapes

- **Success:** `{ "data": T }`
- **Error:** `{ "error": { "code": string, "message": string, "details"?: object } }`
- **Paginated:** `{ "data": { "items": T[], "nextCursor": string | null, "hasMore": boolean } }`

Query params for list endpoints:

- `limit` (default 20, max 100)
- `cursor` (opaque string from previous response)

Concrete request/response examples are in `functions/src/api/examples.ts`.

---

## Firestore layout

- `users/{userId}` — one doc per user (candidate profile).
- `users/{userId}/resumes/{resumeId}` — resume metadata + parse result.
- `users/{userId}/resumeAnalyses/{resumeId}` — AI analysis per resume (doc ID = resumeId).
- `users/{userId}/resumeSuggestions/{suggestionId}` — improvement suggestions.
- `users/{userId}/applications/{applicationId}` — application tracker.
- `users/{userId}/generatedAssets/{assetId}` — generated cover letters, etc.
- `jobs/{jobId}` — job listings (root collection).

See `functions/src/schema/firestore.ts` for path helpers and index requirements.
