# HeyGen API 端点测试

根据错误日志，HeyGen API 返回 404，说明端点不正确。

## 可能的原因

1. **API 端点格式不正确**
   - 当前尝试：`/avatars` 或 `/avatar.list`
   - 可能需要：`/v1/avatar.list` 或其他格式

2. **API Base URL 不正确**
   - 当前使用：`https://api.heygen.com/v1`
   - 可能需要：`https://api.heygen.com` 或其他

3. **请求头格式不正确**
   - 当前使用：`X-Api-Key`
   - 可能需要：`Authorization: Bearer <token>` 或其他格式

## 建议的解决方案

请查看 HeyGen API 文档，确认：
1. 正确的 API Base URL
2. 正确的端点路径
3. 正确的认证方式（请求头格式）

## 临时解决方案

如果无法立即找到正确的端点，可以：
1. 查看 HeyGen 开发者文档
2. 联系 HeyGen 技术支持
3. 或者暂时返回一个模拟的 Avatar 列表用于测试

## 测试命令

可以在 Firebase Console 中查看函数日志，或者使用 curl 测试：

```bash
# 测试端点 1
curl -X GET "https://api.heygen.com/v1/avatar.list" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json"

# 测试端点 2
curl -X GET "https://api.heygen.com/v1/avatars" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

