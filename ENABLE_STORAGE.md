# 启用 Firebase Storage

## 问题
错误信息：`Object does not exist` 或 `Firebase Storage has not been set up`

## 解决步骤

### 1. 在 Firebase Console 中启用 Storage

1. 打开 Firebase Console：https://console.firebase.google.com/project/wikiwands/storage
2. 点击 "Get Started" 或 "开始使用"
3. 选择存储位置（建议选择与 Functions 相同的位置，如 `us-central1`）
4. 选择安全规则模式：
   - **测试模式**（用于开发，允许所有读写）
   - **生产模式**（使用我们配置的规则）

### 2. 部署 Storage 规则

启用 Storage 后，部署我们配置的规则：

```bash
cd /Users/xiaojiacai/Documents/wikiwands-cloud-functions
firebase deploy --only storage
```

### 3. 验证

在 Firebase Console 中：
1. 进入 Storage 页面
2. 尝试上传一个测试文件
3. 确认可以正常上传和下载

## Storage 规则说明

我们配置的规则允许：
- 用户只能上传和读取自己的文件（路径：`video_generation/{userId}/{fileName}`）
- 其他路径默认拒绝访问

## 如果仍然有问题

1. 检查 Firebase 项目是否正确配置
2. 确认用户已登录
3. 检查 Storage 规则是否正确部署
4. 查看 Firebase Console 中的 Storage 使用情况

