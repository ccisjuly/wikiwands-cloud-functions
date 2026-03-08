# 自动修复并重试部署

使用 `scripts/deploy-with-retry.sh` 可在部署失败时按已知错误自动修复并重试（最多重试 2 次）。

## 用法

```bash
# 在项目根目录 wikiwands-cloud-functions 下执行

# 全量部署（Firestore + Storage + Functions）
./scripts/deploy-with-retry.sh

# 仅部署 Functions
./scripts/deploy-with-retry.sh functions

# 仅部署 Firestore
./scripts/deploy-with-retry.sh firestore
```

## 当前会尝试的修复

| 错误特征 | 自动修复动作 |
|----------|----------------|
| `tsc: command not found` / predeploy 构建失败 | 在 `functions` 目录执行 `rm -rf node_modules package-lock.json` 后 `npm install`，再重试 |
| 检测到 pnpm / Functions Framework 相关报错 | 若存在 `functions/pnpm-lock.yaml` 则删除，再重试 |
| Firebase app does not exist / initializeApp | 仅提示：需在 callables 内用 getDb()/getBucket()，勿在顶层调用 admin.firestore() |
| Firestore 索引 "not necessary" | 仅提示：需在 firestore.indexes.json 中移除单字段索引 |

无法自动修复时会打印错误并退出，保留原始退出码。
