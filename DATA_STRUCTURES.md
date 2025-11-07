# 数据结构说明

## 1. generateVideo - 生成视频

### 输入参数 (GenerateVideoRequest)

```typescript
{
  imageUrl: string;    // 商品图片 URL（需先上传到 Firebase Storage）
  script: string;      // 商品介绍脚本（最大 5000 字符）
  avatarId: string;    // Avatar ID（从 getAvatars 获取）
}
```

**示例：**
```json
{
  "imageUrl": "https://storage.googleapis.com/your-bucket/product.jpg",
  "script": "这是一款高质量的商品，具有以下特点...",
  "avatarId": "avatar_123"
}
```

### 返回数据

```typescript
{
  success: true;
  video_id: string;        // 视频 ID，用于后续查询状态
  video_url: string | null; // 视频 URL（如果已生成）
  status: string;          // 状态：通常为 "processing" 或 "completed"
  message: string;         // 提示信息
}
```

**示例：**
```json
{
  "success": true,
  "video_id": "video_1234567890",
  "video_url": null,
  "status": "processing",
  "message": "Video generation task created successfully"
}
```

### Firestore 存储结构 (video_tasks 集合)

**文档路径：** `video_tasks/{video_id}`

```typescript
{
  uid: string;                    // 用户 ID
  video_id: string;               // 视频 ID（文档 ID）
  video_url: string | null;       // 视频 URL
  status: string;                 // 状态：processing, completed, failed
  image_url: string;              // 商品图片 URL
  script: string;                 // 商品介绍脚本
  avatar_id: string;              // Avatar ID
  created_at: Timestamp;          // 创建时间
  updated_at: Timestamp;          // 更新时间
}
```

**示例：**
```json
{
  "uid": "user_abc123",
  "video_id": "video_1234567890",
  "video_url": null,
  "status": "processing",
  "image_url": "https://storage.googleapis.com/your-bucket/product.jpg",
  "script": "这是一款高质量的商品...",
  "avatar_id": "avatar_123",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 发送给 HeyGen API 的请求体

```typescript
{
  avatar_id: string;
  script: {
    type: "text";
    input: string;
  };
  background: {
    type: "image";
    url: string;
  };
  // 可选参数（已注释）
  // aspect_ratio: "16:9";
  // resolution: "1080p";
}
```

**示例：**
```json
{
  "avatar_id": "avatar_123",
  "script": {
    "type": "text",
    "input": "这是一款高质量的商品..."
  },
  "background": {
    "type": "image",
    "url": "https://storage.googleapis.com/your-bucket/product.jpg"
  }
}
```

### HeyGen API 响应 (HeyGenVideoResponse)

```typescript
{
  data?: {
    video_id?: string;
    video_url?: string;
    status?: string;
  };
  error?: {
    message: string;
    code?: string;
  };
}
```

**成功示例：**
```json
{
  "data": {
    "video_id": "video_1234567890",
    "video_url": null,
    "status": "processing"
  }
}
```

**错误示例：**
```json
{
  "error": {
    "message": "Invalid avatar_id",
    "code": "INVALID_AVATAR"
  }
}
```

---

## 2. getAvatars - 获取 Avatar 列表

### 输入参数

无需参数（但需要用户登录）

```typescript
{} // 空对象
```

### 返回数据

```typescript
{
  success: true;
  avatars: AvatarInfo[];  // Avatar 列表
  count: number;          // Avatar 数量
}
```

**AvatarInfo 结构：**
```typescript
{
  avatar_id: string;      // Avatar ID（必需）
  name?: string;          // Avatar 名称
  preview_url?: string;   // 预览图 URL
  gender?: string;        // 性别
  age?: string;           // 年龄
  style?: string;         // 风格
}
```

**示例：**
```json
{
  "success": true,
  "avatars": [
    {
      "avatar_id": "avatar_123",
      "name": "Professional Woman",
      "preview_url": "https://example.com/preview.jpg",
      "gender": "female",
      "age": "30",
      "style": "professional"
    },
    {
      "avatar_id": "avatar_456",
      "name": "Friendly Man",
      "preview_url": "https://example.com/preview2.jpg",
      "gender": "male",
      "age": "25",
      "style": "casual"
    }
  ],
  "count": 2
}
```

### HeyGen API 响应 (HeyGenAvatarsResponse)

```typescript
{
  data?: {
    avatars?: AvatarInfo[];
  };
  error?: {
    message: string;
    code?: string;
  };
}
```

---

## 3. getVideoStatus - 查询视频状态

### 输入参数

```typescript
{
  videoId: string;  // 视频 ID（从 generateVideo 返回）
}
```

**示例：**
```json
{
  "videoId": "video_1234567890"
}
```

### 返回数据

```typescript
{
  success: true;
  video_id: string;
  status: string;              // processing, completed, failed, unknown
  video_url: string | null;    // 视频 URL（如果已完成）
  created_at: string | null;   // ISO 8601 格式的创建时间
  updated_at: string | null;   // ISO 8601 格式的更新时间
}
```

**示例（处理中）：**
```json
{
  "success": true,
  "video_id": "video_1234567890",
  "status": "processing",
  "video_url": null,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

**示例（已完成）：**
```json
{
  "success": true,
  "video_id": "video_1234567890",
  "status": "completed",
  "video_url": "https://example.com/video.mp4",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:05:00.000Z"
}
```

### HeyGen API 状态查询响应

```typescript
{
  data?: {
    status?: string;      // processing, completed, failed
    video_url?: string;   // 视频 URL
  };
}
```

---

## 4. 状态值说明

### 视频状态 (status)

- `processing` - 处理中，视频正在生成
- `completed` - 已完成，视频已生成
- `failed` - 失败，视频生成失败
- `unknown` - 未知状态

---

## 5. 错误响应

所有函数在出错时都会抛出 `HttpsError`，包含以下字段：

```typescript
{
  code: string;     // 错误代码
  message: string;  // 错误消息
  details?: any;    // 详细信息（可选）
}
```

### 常见错误代码

- `unauthenticated` - 用户未登录
- `invalid-argument` - 参数无效
- `not-found` - 资源未找到
- `permission-denied` - 权限不足
- `failed-precondition` - 前置条件失败（如配置缺失）
- `internal` - 内部错误

**示例：**
```json
{
  "code": "invalid-argument",
  "message": "imageUrl is required and must be a string"
}
```

---

## 6. 完整使用流程示例

### 步骤 1: 获取 Avatar 列表

**请求：**
```swift
let function = functions.httpsCallable("getAvatars")
let result = try await function.call()
```

**响应：**
```json
{
  "success": true,
  "avatars": [...],
  "count": 10
}
```

### 步骤 2: 生成视频

**请求：**
```swift
let function = functions.httpsCallable("generateVideo")
let result = try await function.call([
  "imageUrl": "https://storage.googleapis.com/...",
  "script": "商品介绍...",
  "avatarId": "avatar_123"
])
```

**响应：**
```json
{
  "success": true,
  "video_id": "video_1234567890",
  "video_url": null,
  "status": "processing",
  "message": "Video generation task created successfully"
}
```

### 步骤 3: 查询状态（轮询）

**请求：**
```swift
let function = functions.httpsCallable("getVideoStatus")
let result = try await function.call([
  "videoId": "video_1234567890"
])
```

**响应（处理中）：**
```json
{
  "success": true,
  "video_id": "video_1234567890",
  "status": "processing",
  "video_url": null,
  ...
}
```

**响应（已完成）：**
```json
{
  "success": true,
  "video_id": "video_1234567890",
  "status": "completed",
  "video_url": "https://example.com/video.mp4",
  ...
}
```

