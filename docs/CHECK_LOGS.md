# 查看 Cloud Functions 日志

排查「一直 loading」或 GTMSessionFetcher "already running" 时，可先看后端是否收到请求、是否正常返回。

## 1. Firebase Console

1. 打开 [Firebase Console → 函数](https://console.firebase.google.com/project/wikiwands/functions)
2. 点击函数名（如 `resumesList`）→ **日志** 标签
3. 查看是否有 `resumesList: start`、`resumesList: done`（已在代码里加 logger）

- 若**没有** "start"：请求未到云端（网络、鉴权或客户端重复请求被忽略）
- 若有 "start" 无 "done"：函数在 Firestore 查询或 toApi 处卡住/报错
- 若有 "done"：后端已返回，问题在客户端或网络

## 2. 命令行

```bash
cd wikiwands-cloud-functions
firebase functions:log
```

或只看 `resumesList`：

```bash
firebase functions:log --only resumesList
```

## 3. 已做的修改（减少「already running」）

- **客户端**：`ResumesListView` 增加 `loadInProgress`，同一时间只允许一次 `load()`，避免 Tab 切换或重复 `.task` 触发多次并发 `resumesList` 调用。
- **后端**：`resumesList` 内增加 `functions.logger.info("resumesList: start|done", ...)`，便于在日志里确认请求是否到达和完成。
