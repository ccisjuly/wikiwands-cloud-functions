# 部署的是 Firebase 的 Cloud Functions

本项目的函数是 **Firebase Cloud Functions**，不是 Google Cloud Console 里单独创建的那种 Cloud Functions。

## 区别简要说明

| 方式 | 是什么 | 如何部署/管理 |
|------|--------|----------------|
| **Firebase Functions（本项目）** | 使用 `firebase-functions` SDK，和 Firebase 项目绑定，可用 Auth/Firestore/Storage 等触发器 | `firebase deploy --only functions`，在 **Firebase Console → 函数** 里查看 |
| **Google Cloud Functions（单独）** | 在 Google Cloud Console 里新建，不通过 Firebase 管理 | 在 **Google Cloud Console → Cloud Functions** 里创建/部署 |

## 本项目如何确认是 Firebase Functions

1. **代码**：使用 `firebase-functions/v1`（或 `firebase-functions/v2`），不是 `@google-cloud/functions-framework` 直接写 HTTP。
2. **配置**：`firebase.json` 里配置了 `functions.source = "functions"`，`.firebaserc` 里指定了 Firebase 项目 `wikiwands`。
3. **部署命令**：只用 Firebase CLI：
   ```bash
   firebase deploy --only functions
   ```
   不要用 `gcloud functions deploy`。
4. **管理入口**：在 [Firebase Console → 函数](https://console.firebase.google.com/project/wikiwands/functions) 里能看到并管理这些函数。

## 部署步骤（仅 Firebase）

```bash
cd wikiwands-cloud-functions
firebase deploy --only functions
```

如需同时更新 Firestore 规则/索引或 Storage 规则：

```bash
firebase deploy
```

当前函数会出现在 Firebase 项目 **wikiwands** 下，区域为 **us-central1**，URL 形如：  
`https://us-central1-wikiwands.cloudfunctions.net/ping`（这是 Firebase 为该函数生成的 HTTP 地址，仍属于 Firebase Functions）。
