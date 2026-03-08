# 数据结构：实体与关系

---

## 从 User 视角理解关系

**核心一句话：所有业务数据都是「我的」——要么直接挂在我下面，要么通过「我的一次申请」连到我。**

可以这样理解：

1. **我（User）有一份档案**  
   存在 `users/{我}` 这份文档里（CandidateProfile），名字、技能、求职偏好等。

2. **我有多份简历（Resume）**  
   每份简历都在「我」下面：`users/{我}/resumes/...`。  
   每份简历可以有一份 **AI 分析（ResumeAnalysis）**、多条 **改进建议（ResumeSuggestion）**，它们也都挂在「我」下面，只是通过 `resumeId` 知道属于哪份简历。

3. **我有多条申请（Application）**  
   每条申请都在「我」下面：`users/{我}/applications/...`。  
   每条申请是「我投了某个职位」的一条记录，所以会引用一个 **Job**（`jobId`），可选地关联「我用的那份简历」（`resumeId`）。

4. **我有多条生成素材（GeneratedAsset）**  
   每条素材都在「我」下面：`users/{我}/generatedAssets/...`。  
   每条素材是「为我的某次申请」生成的求职信/定制简历等，所以会引用我的某条 **Application**（`applicationId`）和那个 **Job**（`jobId`），可选地基于某份 **Resume**（`resumeId`）。

5. **Job 不属于任何用户**  
   职位在根集合 `jobs/...`，是全局数据。  
   和「我」的关系只有：**我的申请** 里存了 `jobId`，表示「我投了这个职位」。

所以从 User 角度看：

- **直接属于我的**：档案、简历、简历分析、简历建议、申请、生成素材（全部在 `users/{我}/...` 下或通过我的申请连到我）。
- **不属于我、但我会引用到的**：Job（通过「我的申请」里的 `jobId` 关联）。

关系可以简记为：  
**User 拥有 → 多份 Resume → 每份有 1 个 Analysis、多条 Suggestion；User 拥有 → 多条 Application → 每条指向 1 个 Job、可选 1 份 Resume，并可拥有多条 GeneratedAsset。**

---

## 两条线：User 视角 vs Job 视角，交叉在 Application

可以抽象成两条线，在中间有交叉：

| 视角 | 这条线上有什么 | 交叉点 |
|------|----------------|--------|
| **「我」这条线** | 我的档案、我的简历、我的简历分析/建议、我的申请、我的生成素材 | **Application** |
| **Job 这条线** | 职位本身（标题、公司、描述等）、谁投了这个职位 | **Application** |

- **「我」的线**：以 User 为根，底下是 Resume、ResumeAnalysis、ResumeSuggestion、Application、GeneratedAsset，都是「我的」东西。
- **Job 的线**：以 Job 为根，是全局的职位信息；从 Job 往「谁投了」看，会通过 Application 连到多个 User（一个职位可被多人投递）。
- **交叉点就是 Application**：一条申请 = 「我」投了「这个职位」的一次记录，既属于 User（在我的 applications 子集合里），又引用 Job（存 jobId）。  
  衍生出来的 GeneratedAsset（求职信、定制简历）也挂在这条申请上，所以既在「我的线」上，又和「这个职位」强相关。

简单记：**两条线——「我」和「Job」——在 Application 交叉；交叉之后「我」这条线上还会多出 GeneratedAsset（为这次投递生成的素材）。**

---

## 一、实体（Entities）

| 实体 | 说明 | 存储位置 |
|------|------|----------|
| **User（用户/候选人）** | 登录用户，对应一份候选人档案 | `users/{userId}`，文档内容 = CandidateProfile |
| **Resume（简历）** | 用户上传的一份简历文件及其解析结果 | `users/{userId}/resumes/{resumeId}` |
| **ResumeAnalysis（简历分析）** | 对某份简历的 AI 分析结果 | `users/{userId}/resumeAnalyses/{resumeId}`（doc ID = resumeId） |
| **ResumeSuggestion（简历建议）** | 对某份简历的一条改进建议 | `users/{userId}/resumeSuggestions/{suggestionId}` |
| **Job（职位）** | 一条职位信息（来自外部或同步） | `jobs/{jobId}`（根集合） |
| **Application（申请）** | 用户对某职位的投递记录 | `users/{userId}/applications/{applicationId}` |
| **GeneratedAsset（生成素材）** | 为某次申请生成的求职信/定制简历等 | `users/{userId}/generatedAssets/{assetId}` |

**共 7 个实体。**  
另外，**ParsedResume** 是简历解析后的结构化数据，嵌在 Resume 文档内，不单独成集合，可视为 Resume 的「值对象」。

---

## 二、关系（Relationships）

### 1. User → 其他（都以 User 为根）

| 关系 | 类型 | 说明 |
|------|------|------|
| **User — Resume** | 1 : N | 一个用户有多份简历；Resume 挂在 `users/{userId}/resumes` 下，归属该用户。 |
| **User — ResumeAnalysis** | 1 : N | 一个用户有多条分析记录；每条分析对应一份简历，挂在 `users/{userId}/resumeAnalyses`。 |
| **User — ResumeSuggestion** | 1 : N | 一个用户有多条简历建议；挂在 `users/{userId}/resumeSuggestions`，通过 `resumeId` 关联到具体简历。 |
| **User — Application** | 1 : N | 一个用户有多条申请；挂在 `users/{userId}/applications`。 |
| **User — GeneratedAsset** | 1 : N | 一个用户有多条生成素材；挂在 `users/{userId}/generatedAssets`。 |

### 2. Resume 相关

| 关系 | 类型 | 说明 |
|------|------|------|
| **Resume — ResumeAnalysis** | 1 : 1 | 一份简历对应一条分析；通过子集合 doc ID = resumeId 实现（一个 resumeId 一条 analysis 文档）。 |
| **Resume — ResumeSuggestion** | 1 : N | 一份简历有多条改进建议；在 ResumeSuggestion 文档里存 `resumeId` 指向简历。 |

### 3. Job 相关

| 关系 | 类型 | 说明 |
|------|------|------|
| **Job — Application** | 1 : N | 一个职位可被多用户、多次投递；在 Application 里存 `jobId` 引用 Job。 |

### 4. Application 相关

| 关系 | 类型 | 说明 |
|------|------|------|
| **Application — Job** | N : 1 | 每条申请指向一个职位（`jobId`）。 |
| **Application — Resume** | N : 1（可选） | 申请时可选用某份简历（`resumeId`），可选。 |
| **Application — GeneratedAsset** | 1 : N | 一次申请可生成多份素材（求职信、定制简历等）；GeneratedAsset 里存 `applicationId` 指向申请。 |

### 5. GeneratedAsset 相关

| 关系 | 类型 | 说明 |
|------|------|------|
| **GeneratedAsset — Application** | N : 1 | 每条素材属于一次申请（`applicationId`）。 |
| **GeneratedAsset — Resume** | N : 1（可选） | 素材可能基于某份简历生成（`resumeId`），可选。 |
| **GeneratedAsset — Job** | N : 1 | 素材针对某职位（`jobId`）。 |

---

## 三、关系示意（简图）

```
                    ┌─────────┐
                    │  Job    │
                    └────┬────┘
                         │ 1
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼ N             ▼ N             │
┌─────────────┐   ┌─────────────┐       │
│ Application │──▶│GeneratedAsset│◀──────┘ (jobId)
└──────┬──────┘   └──────┬──────┘
       │                 │
       │ N:1              │ N:1(可选)
       ▼                  ▼
┌─────────────┐   ┌─────────────┐
│   Resume    │   │  Resume     │
└──────┬──────┘   └──────┬──────┘
       │                 │
       │ 1:1              │ 1:N
       ▼                  ▼
┌─────────────┐   ┌─────────────────┐
│ResumeAnalysis│   │ResumeSuggestion │
└─────────────┘   └─────────────────┘
       │
       │ 全部归属
       ▼
┌─────────────┐
│    User     │  (users/{userId} 及其子集合)
└─────────────┘
```

---

## 四、外键 / 引用字段汇总

| 实体 | 引用字段 | 指向 |
|------|----------|------|
| Resume | （路径归属） | User |
| ResumeAnalysis | （doc ID = resumeId） | Resume |
| ResumeSuggestion | `resumeId` | Resume |
| Application | `jobId` | Job |
| Application | `resumeId?` | Resume（可选） |
| Application | `coverLetterId?` | GeneratedAsset（可选） |
| GeneratedAsset | `applicationId` | Application |
| GeneratedAsset | `jobId` | Job |
| GeneratedAsset | `resumeId?` | Resume（可选） |

**User** 不存“外键”，所有用户相关数据通过 Firestore 路径 `users/{userId}/...` 归属。

---

## 五、小结

- **实体 7 个**：User、Resume、ResumeAnalysis、ResumeSuggestion、Job、Application、GeneratedAsset。  
- **关系**：以 User 为根的一对多（Resume、Analysis、Suggestion、Application、GeneratedAsset）；Resume 与 Analysis 1:1、与 Suggestion 1:N；Job 与 Application 1:N；Application 与 GeneratedAsset 1:N，Application/GeneratedAsset 通过 `jobId`、`resumeId`、`applicationId` 等引用其他实体。

代码中的类型与 Firestore 路径见：`functions/src/types/`、`functions/src/schema/firestore.ts`。
