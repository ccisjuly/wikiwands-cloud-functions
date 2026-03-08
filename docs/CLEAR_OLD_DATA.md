# 清理 Firebase 旧数据（Storage / Firestore）

用于删除旧版 wikiwands 在 Firestore 和 Storage 里不再使用的数据与结构。

## 会被删除的内容

### Firestore 集合（整集合及其子集合）

| 集合 | 说明 |
|------|------|
| `products` | 旧商品数据 |
| `video_tasks` | 视频生成任务 |
| `user_images` | 用户图片 |
| `credits` | 积分/点数 |
| `entitlements` | 权益订阅 |
| `payments` | 支付记录（含子集合 `rc`） |

**不会删除**：`users` 集合（新 job-app 仍使用 `users/{uid}`，如需清空可自行在脚本中加上）。

### Storage 路径前缀

| 前缀 | 说明 |
|------|------|
| `video_generation/` | 视频生成相关文件 |

## 运行方式

### 1. 凭证（必做，否则会报 Could not load the default credentials）

需具备 Firebase 项目 **wikiwands** 的写权限，任选其一：

**方式一（推荐）：服务账号密钥**

1. 打开 [Firebase 控制台](https://console.firebase.google.com/) → 选择项目 **wikiwands** → 项目设置（齿轮）→ **服务账号**
2. 点击「生成新的私钥」→ 下载 JSON 文件到本机
3. 在终端执行（路径换成你下载的 JSON 的绝对路径）：
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/你的密钥文件.json"
   ```
4. **不要关掉该终端**，在同一终端里执行下面的 2、3 步

**方式二：gcloud 默认凭证**

1. 安装 [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) 并登录
2. 执行：
   ```bash
   gcloud auth application-default login
   ```
3. 按提示在浏览器里用有项目权限的 Google 账号登录后，再执行下面的 2、3 步

### 2. 先预览（不删任何数据）

```bash
cd wikiwands-cloud-functions/functions
npm run build
npm run clear-old-data
```

会打印将要删除的集合名、文档数量以及 Storage 文件数量。

### 3. 确认后真正执行删除

```bash
npm run clear-old-data -- --execute
```

执行后不可恢复，请确认无误再运行。

## 脚本位置

- 源码：`functions/src/scripts/clearOldFirebaseData.ts`
- 编译后：`functions/lib/scripts/clearOldFirebaseData.js`

如需调整要删的集合或 Storage 前缀，可编辑该脚本中的：

- `FIRESTORE_COLLECTIONS_TO_DELETE`
- `STORAGE_PREFIXES_TO_DELETE`
