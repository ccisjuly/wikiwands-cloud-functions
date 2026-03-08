# 之前设计的 API 接口与数据结构汇总

基于 AI-first 求职应用的合约设计，所有需登录的接口均以当前用户（Firebase Auth UID）为范围。

---

## 一、接口列表

### 1. 简历上传与解析

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/resumes/upload` | 上传简历，返回 `resumeId`、可选 `uploadUrl`（签名上传） |
| GET | `/users/me/resumes` | 分页列出当前用户简历 |
| GET | `/users/me/resumes/:resumeId` | 获取单份简历（含解析状态） |
| GET | `/users/me/resumes/:resumeId/parsed` | 仅获取解析后的简历内容 |
| POST | `/users/me/resumes/:resumeId/parse` | 重新触发解析 |
| PATCH | `/users/me/resumes/:resumeId` | 更新（如设置 `isPrimary`） |
| DELETE | `/users/me/resumes/:resumeId` | 删除简历 |

### 2. AI 简历分析

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/users/me/resumes/:resumeId/analyze` | 执行 AI 分析 |
| GET | `/users/me/resumes/:resumeId/analysis` | 获取分析结果 |

### 3. 候选人档案

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/users/me/profile` | 获取当前用户档案 |
| PUT | `/users/me/profile` | 更新档案 |
| POST | `/users/me/profile/apply-suggestions` | 应用 AI 建议的档案字段 |

### 4. 职位推荐

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/users/me/jobs/recommendations` | 获取个性化职位推荐（分页） |
| GET | `/jobs` | 搜索/列表职位（可选筛选） |
| GET | `/jobs/:jobId` | 获取职位详情 |

### 5. 申请素材生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/users/me/applications/:applicationId/assets` | 生成求职信/定制简历/跟进邮件 |
| GET | `/users/me/applications/:applicationId/assets` | 列出该申请下的素材 |
| GET | `/users/me/assets/:assetId` | 获取单个素材 |

### 6. 申请追踪

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/users/me/applications` | 分页列出申请（可按状态、排序） |
| POST | `/users/me/applications` | 新建一条申请 |
| GET | `/users/me/applications/:applicationId` | 获取单条申请 |
| PATCH | `/users/me/applications/:applicationId` | 更新状态/备注等 |
| DELETE | `/users/me/applications/:applicationId` | 删除申请 |

### 7. 简历改进建议

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/users/me/resumes/:resumeId/suggestions` | 列出该简历的改进建议 |
| POST | `/users/me/resumes/:resumeId/suggestions` | 触发生成 AI 建议 |
| PATCH | `/users/me/resumes/:resumeId/suggestions/:suggestionId` | 更新建议状态（如已采纳/忽略） |

---

## 二、通用约定

- **成功响应**：`{ "data": T }`
- **错误响应**：`{ "error": { "code": string, "message": string, "details"?: object } }`
- **分页响应**：`{ "data": { "items": T[], "nextCursor": string | null, "hasMore": boolean } }`
- **列表查询参数**：`limit`（默认 20，最大 100）、`cursor`（上一页返回的不透明游标）

---

## 三、核心数据结构

### 公共类型（common）

| 类型 | 说明 |
|------|------|
| `UserId` | 用户 ID（Firebase Auth UID） |
| `TimestampString` | ISO 8601 时间字符串 |
| `PaginationParams` | `limit?`, `cursor?` |
| `PaginatedResponse<T>` | `items`, `nextCursor`, `hasMore` |
| `ApiSuccess<T>` | `{ data: T }` |
| `ApiError` | `code`, `message`, `details?` |

### 简历（resume）

| 类型 | 说明 |
|------|------|
| `ResumeFileType` | 支持：pdf / doc / docx |
| `ResumeParseStatus` | pending \| parsing \| completed \| failed \| unsupported |
| `ParsedExperience` | title, company, location, startDate, endDate, current, description, highlights? |
| `ParsedEducation` | degree, institution, location, startDate, endDate, field?, gpa? |
| `ParsedResumeSection` | type, rawText, structured?（按 section 类型不同） |
| `ParsedResume` | sections, rawFullText, contact?, metadata（fileName, fileType, parsedAt, parserVersion） |
| `ResumeRecord` | userId, fileStoragePath, fileContentType, fileName, parseStatus, parsed?, parseError?, createdAt, updatedAt, isPrimary? |
| `ResumeSuggestion` | id, resumeId, category, severity, title, description, currentSnippet?, suggestedSnippet?, sectionRef?, status?, createdAt |

### 候选人档案与分析（candidate）

| 类型 | 说明 |
|------|------|
| `CandidateProfile` | userId, displayName, email, phone, location, linkedInUrl, website, headline, summary, yearsOfExperience, skills[], industries?, jobTypes?, workAuthorizations?, salaryExpectation?, preferredLocations?, openToWork, lastResumeAnalyzedAt?, profileCompletenessScore?, createdAt, updatedAt |
| `JobType` | full_time \| part_time \| contract \| internship \| freelance |
| `SalaryExpectation` | min?, max?, currency, period（hourly/monthly/yearly）, isConfidential? |
| `ResumeAnalysisStatus` | pending \| analyzing \| completed \| failed |
| `ResumeAnalysis` | resumeId, userId, status, completedAt?, error?, insights, suggestedProfileUpdates? |
| `ResumeAnalysisInsights` | strengths[], areasForImprovement[], suggestedSkills[], experienceSummary?, educationSummary?, atsScore?, readabilityScore?, keywordGaps? |

### 职位（jobs）

| 类型 | 说明 |
|------|------|
| `JobListing` | id, externalId?, title, company, companyLogoUrl?, location, locations?, isRemote?, jobType, salaryMin/Max/Currency/Period?, description, requirements?, benefits?, postedAt, expiresAt?, source, applyUrl? |
| `JobRecommendation` | job（JobListing）, score（0–100）, matchReasons[], keywordMatches? |

### 申请追踪（applications）

| 类型 | 说明 |
|------|------|
| `ApplicationStatus` | draft \| submitted \| viewed \| in_review \| interview \| offer \| rejected \| withdrawn |
| `ApplicationStatusEvent` | status, at, note? |
| `ApplicationRecord` | id, userId, jobId, jobTitle, company, companyLogoUrl?, status, appliedAt?, resumeId?, coverLetterId?, source?, notes?, statusHistory[], createdAt, updatedAt |

### 申请素材（assets）

| 类型 | 说明 |
|------|------|
| `AssetType` | cover_letter \| tailored_resume \| follow_up_email |
| `AssetGenerationStatus` | pending \| generating \| completed \| failed |
| `GeneratedAsset` | id, userId, applicationId, jobId, type, status, resumeId?, input?, output?（content, contentType, storagePath?）, error?, createdAt, updatedAt, completedAt? |
| `AssetInputs` | jobDescription?, companyName?, jobTitle?, tone?, length?, customInstructions? |

---

## 四、Firestore 集合布局

| 路径 | 用途 |
|------|------|
| `users/{userId}` | 用户文档（候选人档案） |
| `users/{userId}/resumes/{resumeId}` | 简历元数据 + 解析结果 |
| `users/{userId}/resumeAnalyses/{resumeId}` | 该简历的 AI 分析（doc ID = resumeId） |
| `users/{userId}/resumeSuggestions/{suggestionId}` | 简历改进建议 |
| `users/{userId}/applications/{applicationId}` | 申请记录 |
| `users/{userId}/generatedAssets/{assetId}` | 生成的求职信/定制简历等 |
| `jobs/{jobId}` | 职位列表（根集合） |

---

## 五、代码位置

- **类型定义**：`functions/src/types/`（common, resume, candidate, jobs, applications, assets）
- **接口合约（请求/响应类型）**：`functions/src/api/contracts.ts`
- **请求/响应示例**：`functions/src/api/examples.ts`
- **Firestore 路径与索引**：`functions/src/schema/firestore.ts`
