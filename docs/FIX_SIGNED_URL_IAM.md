# 修复 resumeUpload 的 signBlob 权限错误

错误信息：
```text
Permission 'iam.serviceAccounts.signBlob' denied on resource (or it may not exist).
```

原因：Cloud Functions 里用 `bucket.file(path).getSignedUrl()` 时，需要当前运行的服务账号具备「以自己身份签名」的权限（IAM `signBlob`）。默认的 Functions 服务账号没有该权限。

## 解决步骤

1. 确保已安装并登录 gcloud，且当前项目为 Firebase 项目：
   ```bash
   gcloud config set project wikiwands
   ```

2. 给默认服务账号授予「Service Account Token Creator」角色（作用于自身）：
   ```bash
   gcloud iam service-accounts add-iam-policy-binding wikiwands@appspot.gserviceaccount.com \
     --member="serviceAccount:wikiwands@appspot.gserviceaccount.com" \
     --role="roles/iam.serviceAccountTokenCreator"
   ```

3. 等待约 1–2 分钟让 IAM 生效，然后再次在 App 里尝试上传简历。

说明：`wikiwands@appspot.gserviceaccount.com` 是 Firebase/App Engine 默认使用的服务账号，Cloud Functions 默认以该账号运行。
