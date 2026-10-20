#!/usr/bin/env bash
# 网络恢复后一键推送（GitHub 443 经代理经常 502/超时）
# 用法：bash scripts/push.sh
set -u
cd "$(dirname "$0")/.." || exit 1

echo "待推送提交："
git log origin/main..HEAD --oneline || true

for i in $(seq 1 10); do
  echo "--- 第 $i 次尝试 ---"
  out=$(git push origin main 2>&1 | tail -3)
  echo "$out"
  case "$out" in
    *"main -> main"*|*"Everything up-to-date"*) echo "✅ 推送成功"; exit 0 ;;
  esac
  sleep 5
done

echo "❌ 10 次仍未成功。检查网络/代理后重跑：bash scripts/push.sh"
echo "   若公司网络限制，可改用 SSH：git remote set-url origin git@github.com:fengyi-SONG/-.git"
exit 1
