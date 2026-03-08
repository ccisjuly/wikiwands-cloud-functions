# Firebase / Vertex AI 简历解析与分析

本仓库使用 **Vertex AI Gemini** 实现简历解析、AI 分析与改进建议，无需 API Key（Cloud Functions 使用 ADC）。

## 1. 启用 Vertex AI API

在 GCP 项目中启用 Vertex AI API：

```bash
gcloud config set project wikiwands
gcloud services enable aiplatform.googleapis.com
```

或在 [Google Cloud Console](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=wikiwands) 中搜索 “Vertex AI API” 并启用。

## 2. 环境变量（可选）

- **GCLOUD_PROJECT** / **GCP_PROJECT**：Firebase 部署时会自动注入，一般不需设置。
- **VERTEX_LOCATION**：Vertex AI 区域，默认 `us-central1`。若 Functions 部署在其他区域，可设为同一区域以降低延迟。

## 3. 功能说明

| 功能 | 触发方式 | 说明 |
|------|----------|------|
| **简历解析** | 上传 PDF 后自动（Storage onFinalize）或手动「重新解析」 | 使用 Gemini 多模态读取 PDF，输出结构化 `ParsedResume`（段落、联系方式等） |
| **AI 分析** | 简历详情页「AI 分析」 | 基于解析结果生成优势、可改进点、建议技能等，写入 `resumeAnalyses` |
| **改进建议** | 简历详情页「生成改进建议」 | 生成多条改进建议（语法、清晰度、ATS、格式等），写入 `resumeSuggestions` |

## 4. 计费说明

Vertex AI Gemini 按 token 计费。可在 [Vertex AI 定价](https://cloud.google.com/vertex-ai/generative-ai/pricing) 查看。当前使用的模型为 `gemini-1.5-flash-001`，成本较低。

## 5. 故障排查

- **Permission denied / 403**：确认已启用 Vertex AI API，且 Cloud Functions 使用的服务账号具有 `roles/aiplatform.user` 或项目默认账号权限。
- **Empty response**：检查 Firestore 中该简历是否有 `parsed.rawFullText`（解析完成后才有）；分析/建议依赖解析结果。
- **解析一直 pending**：查看 Storage 触发器是否部署成功（`onResumeFileFinalized`）；或使用「重新解析」手动触发 `resumeParse`。
