# ER 图（实体-关系图）

Job Application 数据模型。可在支持 Mermaid 的编辑器中渲染（如 VS Code、GitHub、GitLab）。

---

## 图一：实体与关系（含主要属性）

```mermaid
erDiagram
    User {
        string userId PK
        string displayName
        string email
        string headline
        string skills
        bool openToWork
        string createdAt
        string updatedAt
    }

    Resume {
        string resumeId PK
        string userId FK
        string fileStoragePath
        string fileName
        string parseStatus
        bool isPrimary
        string createdAt
        string updatedAt
    }

    ResumeAnalysis {
        string resumeId PK
        string userId FK
        string status
        string completedAt
    }

    ResumeSuggestion {
        string suggestionId PK
        string resumeId FK
        string category
        string severity
        string title
        string status
        string createdAt
    }

    Job {
        string jobId PK
        string title
        string company
        string location
        string jobType
        string description
        string postedAt
        string source
    }

    Application {
        string applicationId PK
        string userId FK
        string jobId FK
        string jobTitle
        string company
        string status
        string resumeId FK
        string appliedAt
        string createdAt
        string updatedAt
    }

    GeneratedAsset {
        string assetId PK
        string userId FK
        string applicationId FK
        string jobId FK
        string resumeId FK
        string type
        string status
        string createdAt
        string completedAt
    }

    User ||--o{ Resume : "拥有"
    User ||--o{ ResumeAnalysis : "拥有"
    User ||--o{ ResumeSuggestion : "拥有"
    User ||--o{ Application : "拥有"
    User ||--o{ GeneratedAsset : "拥有"

    Resume ||--|| ResumeAnalysis : "对应一份分析"
    Resume ||--o{ ResumeSuggestion : "有多条建议"

    Job ||--o{ Application : "被投递"
    Application }o--|| Job : "投递职位"
    Application o|--|| Resume : "使用简历(可选)"
    Application ||--o{ GeneratedAsset : "生成素材"
    GeneratedAsset }o--|| Application : "属于申请"
    GeneratedAsset }o--|| Job : "针对职位"
    GeneratedAsset o|--|| Resume : "基于简历(可选)"
```

---

## 图二：仅实体与基数（简化版）

```mermaid
erDiagram
    User
    Resume
    ResumeAnalysis
    ResumeSuggestion
    Job
    Application
    GeneratedAsset

    User ||--o{ Resume : "1:N"
    User ||--o{ ResumeAnalysis : "1:N"
    User ||--o{ ResumeSuggestion : "1:N"
    User ||--o{ Application : "1:N"
    User ||--o{ GeneratedAsset : "1:N"

    Resume ||--|| ResumeAnalysis : "1:1"
    Resume ||--o{ ResumeSuggestion : "1:N"

    Job ||--o{ Application : "1:N"
    Application }o--|| Job : "N:1"
    Application o|--|| Resume : "N:1(可选)"
    Application ||--o{ GeneratedAsset : "1:N"
    GeneratedAsset }o--|| Application : "N:1"
    GeneratedAsset }o--|| Job : "N:1"
    GeneratedAsset o|--|| Resume : "N:1(可选)"
```

---

## 图三：两条线 + 交叉点（User 线 vs Job 线）

```mermaid
flowchart LR
    subgraph User线["「我」这条线"]
        U[User]
        R[Resume]
        RA[ResumeAnalysis]
        RS[ResumeSuggestion]
        A[Application]
        G[GeneratedAsset]
        U --> R
        R --> RA
        R --> RS
        U --> A
        A --> G
    end

    subgraph Job线["Job 这条线"]
        J[Job]
    end

    A <-->|"交叉点"| J
```

---

## 说明

- **PK**：主键；**FK**：外键（引用）。
- User 与各实体的 1:N 在存储上通过路径体现：`users/{userId}/resumes|applications|...`。
- Resume 与 ResumeAnalysis 的 1:1：analysis 文档 ID = resumeId。
- 带「可选」的关系：Application.resumeId、GeneratedAsset.resumeId 可为空。
