# Firestore 数据结构到线上的设置

## 1. 规则（已按新数据结构写好）

`functions/firestore.rules` 已按 Job Application 模型配置：

| 路径 | 读 | 写 |
|------|----|----|
| `users/{uid}` | 本人 | 本人 |
| `users/{uid}/resumes/{resumeId}` | 本人 | 本人 |
| `users/{uid}/resumeAnalyses/{analysisId}` | 本人 | 本人 |
| `users/{uid}/resumeSuggestions/{suggestionId}` | 本人 | 本人 |
| `users/{uid}/applications/{applicationId}` | 本人 | 本人 |
| `users/{uid}/generatedAssets/{assetId}` | 本人 | 本人 |
| `jobs/{jobId}` | 已登录 | 仅后端/Admin |

部署规则到线上：

```bash
cd wikiwands-cloud-functions
firebase deploy --only firestore:rules
```

（若也要部署索引：`firebase deploy --only firestore`。）

## 2. 可选：在 Firestore 里“长出”集合（占位文档）

Firestore 无显式建表，集合在**首次写入文档**时出现。若希望控制台里先看到这些集合，可跑一次初始化脚本写入占位文档：

```bash
cd functions
# 凭证设置同 clear-old-data（GOOGLE_APPLICATION_CREDENTIALS 或 gcloud auth application-default login）
npm run build
npm run seed-firestore-structure
```

会写入：

- `users/seed-user-demo`（档案占位）
- `users/seed-user-demo/resumes/seed-resume-1`
- `users/seed-user-demo/resumeAnalyses/seed-resume-1`
- `users/seed-user-demo/resumeSuggestions/seed-suggestion-1`
- `users/seed-user-demo/applications/seed-application-1`
- `users/seed-user-demo/generatedAssets/seed-asset-1`
- `jobs/seed-job-1`

自定义测试用户 ID：`SEED_USER_ID=你的uid npm run seed-firestore-structure`。

## 3. 小结

- **必须做**：部署 Firestore 规则，使新路径可按设计读写。
- **可选**：跑一次 `seed-firestore-structure`，让各集合在控制台可见；正式数据由业务在首次使用时写入即可。
