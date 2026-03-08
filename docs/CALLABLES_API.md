# Callable 接口说明

所有接口均通过 **Firebase Cloud Functions (onCall)** 实现，客户端使用 Firebase SDK 调用，无需 Express。

## 调用方式（客户端）

```js
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();
const resumeUpload = httpsCallable(functions, "resumeUpload");

const { data } = await resumeUpload({ fileName: "resume.pdf", contentType: "application/pdf" });
// data.resumeId, data.uploadUrl, data.status, data.expiresAt
```

需已登录（Firebase Auth）；未登录会收到 `unauthenticated` 错误。

---

## 接口列表（函数名 → 参数 → 返回值）

### 简历

| 函数名 | 参数 | 返回 |
|--------|------|------|
| `resumeUpload` | `{ fileName, contentType }` | `{ resumeId, uploadUrl, status, expiresAt }` |
| `resumesList` | `{ limit?, cursor? }` | `{ items, nextCursor, hasMore }` |
| `resumeGet` | `{ resumeId }` | 简历文档 |
| `resumeGetParsed` | `{ resumeId }` | `{ parsed }` |
| `resumeParse` | `{ resumeId }` | `{ status }` |
| `resumePatch` | `{ resumeId, isPrimary? }` | 更新后简历 |
| `resumeDelete` | `{ resumeId }` | `{ deleted: true }` |

### 简历分析

| 函数名 | 参数 | 返回 |
|--------|------|------|
| `resumeAnalyze` | `{ resumeId }` | 分析文档 |
| `resumeAnalysisGet` | `{ resumeId }` | 分析文档 |

### 档案

| 函数名 | 参数 | 返回 |
|--------|------|------|
| `profileGet` | `{}` | 档案文档（无则返回空档案） |
| `profileUpdate` | 部分档案字段 | 更新后档案 |
| `profileApplySuggestions` | `{ resumeId, fields: string[] }` | 更新后档案 |

### 职位与推荐

| 函数名 | 参数 | 返回 |
|--------|------|------|
| `jobRecommendations` | `{ limit?, cursor? }` | `{ items: [{ job, score, matchReasons, keywordMatches }], nextCursor, hasMore }` |
| `jobsList` | `{ limit?, cursor? }` | `{ items: [{ job }], nextCursor, hasMore }` |
| `jobGet` | `{ jobId }` | 职位文档 |

### 申请

| 函数名 | 参数 | 返回 |
|--------|------|------|
| `applicationsList` | `{ limit?, cursor?, status? }` | `{ items, nextCursor, hasMore }` |
| `applicationCreate` | `{ jobId, jobTitle, company, companyLogoUrl?, resumeId?, coverLetterId?, source?, notes? }` | 申请文档 |
| `applicationGet` | `{ applicationId }` | 申请文档 |
| `applicationPatch` | `{ applicationId, status?, notes?, resumeId?, coverLetterId? }` | 更新后申请 |
| `applicationDelete` | `{ applicationId }` | `{ deleted: true }` |

### 生成素材

| 函数名 | 参数 | 返回 |
|--------|------|------|
| `assetGenerate` | `{ applicationId, type, resumeId?, options? }` | 素材文档 |
| `assetsListByApplication` | `{ applicationId }` | 素材数组 |
| `assetGet` | `{ assetId }` | 素材文档 |

### 简历建议

| 函数名 | 参数 | 返回 |
|--------|------|------|
| `resumeSuggestionsList` | `{ resumeId }` | 建议数组 |
| `resumeSuggestionsGenerate` | `{ resumeId }` | `{ count, suggestions }` |
| `suggestionPatch` | `{ resumeId?, suggestionId, status? }` | 更新后建议 |

---

## 错误

- `unauthenticated`：未登录
- `invalid-argument`：参数缺失或非法
- `not-found`：资源不存在
- `failed-precondition`：状态不满足（如简历未解析完却请求 parsed）
- `permission-denied`：无权限

客户端可通过 `error.code` 和 `error.message` 处理。
