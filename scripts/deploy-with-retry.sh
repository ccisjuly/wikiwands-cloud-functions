#!/usr/bin/env bash
# 部署 Firebase：失败时按已知错误自动修复并重试（最多 2 次修复后重试）
# 用法: ./scripts/deploy-with-retry.sh [target]
#   target 可选: functions | firestore | storage 等，不传则全量部署
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FUNCTIONS_DIR="$ROOT/functions"
MAX_RETRIES=2
TARGET="${1:-}"

run_deploy() {
  if [[ -n "$TARGET" ]]; then
    firebase deploy --only "$TARGET"
  else
    firebase deploy
  fi
}

try_fix() {
  local err_file="$1"
  local fixed=0

  # 1) 构建失败：tsc 找不到 / predeploy 非零 → 在 functions 里 npm install 后重试
  if grep -q "tsc: command not found\|predeploy error\|non-zero exit code" "$err_file" 2>/dev/null; then
    echo "[fix] 检测到构建失败，正在 functions 目录执行 npm install..."
    (cd "$FUNCTIONS_DIR" && rm -rf node_modules package-lock.json 2>/dev/null; npm install)
    fixed=1
  fi

  # 2) 检测到 pnpm 导致要求 Functions Framework → 移除 pnpm 锁文件
  if grep -q "pnpm\|Functions Framework\|@google-cloud/functions-framework" "$err_file" 2>/dev/null; then
    if [[ -f "$FUNCTIONS_DIR/pnpm-lock.yaml" ]]; then
      echo "[fix] 移除 pnpm-lock.yaml 以使用 npm 构建..."
      rm -f "$FUNCTIONS_DIR/pnpm-lock.yaml"
      fixed=1
    fi
  fi

  # 3) Firebase app does not exist → 提示为代码问题，已通过延迟 getDb/getBucket 修复
  if grep -q "default Firebase app does not exist\|initializeApp" "$err_file" 2>/dev/null; then
    echo "[fix] 检测到 initializeApp 相关错误：请确保 callables 中仅在运行时调用 getDb()/getBucket()，不要顶层调用 admin.firestore()。"
    fixed=0
  fi

  # 4) Firestore 单字段索引报错 "not necessary"
  if grep -q "index is not necessary\|single field index" "$err_file" 2>/dev/null; then
    echo "[fix] Firestore 索引报错：请检查 firestore.indexes.json，移除仅含单字段的索引。"
    fixed=0
  fi

  [[ $fixed -eq 1 ]]
}

err_log=$(mktemp)
trap 'rm -f "$err_log"' EXIT

for attempt in $(seq 1 $((MAX_RETRIES + 1))); do
  echo "=== 部署尝试 $attempt / $((MAX_RETRIES + 1)) ==="
  if run_deploy 2>"$err_log"; then
    echo "部署成功。"
    exit 0
  fi
  exitcode=$?
  cat "$err_log" >&2

  if [[ $attempt -le $MAX_RETRIES ]]; then
    echo "部署失败，尝试自动修复..."
    if try_fix "$err_log"; then
      echo "已应用修复，正在重试部署..."
    else
      echo "无法自动修复或无需修复，退出。"
      exit $exitcode
    fi
  else
    echo "已达最大重试次数，部署失败。"
    exit $exitcode
  fi
done
