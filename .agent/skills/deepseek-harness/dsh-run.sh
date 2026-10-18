#!/bin/bash
# 用法:dsh-run.sh [--readonly] [--session ID] [--json] (--file 任務說明檔 | "任務描述")
# 以目前目錄為工作區,用 headless 模式跑一個 DeepSeek Harness(dsh)任務後結束。
# --readonly    設 DSH_PERMISSION_MODE=read-only(headless 下是否生效見 SKILL.md「已驗證行為」)
# --session ID  接續既有 dsh session(轉成 --session-id)
# --json        stdout 改為 newline-delimited JSON 事件串流
# --file PATH   任務說明從檔案讀(經 stdin 交給 dsh 的 `-`),長的派工說明用這個
# dsh 的 stdout、stderr 與 exit code 原樣保留(exec)。
set -euo pipefail
usage() { echo '用法:dsh-run.sh [--readonly] [--session ID] [--json] (--file 任務說明檔 | "任務描述")' >&2; exit 2; }
opts=()
file=""
while [ $# -gt 0 ]; do
    case "$1" in
        --readonly) export DSH_PERMISSION_MODE=read-only; shift ;;
        --session) [ $# -ge 2 ] || usage; opts+=(--session-id "$2"); shift 2 ;;
        --json) opts+=(--json); shift ;;
        --file) [ $# -ge 2 ] || usage; file="$2"; shift 2 ;;
        -h|--help) usage ;;
        --) shift; break ;;
        -*) echo "未知選項:$1" >&2; usage ;;
        *) break ;;
    esac
done
if [ -n "$file" ]; then
    [ $# -eq 0 ] || usage # 檔案與文字任務擇一
    [ -f "$file" ] || { echo "找不到任務說明檔:$file" >&2; exit 2; }
    exec npx -y @deepseek-ai/dsh --profile headless ${opts[@]+"${opts[@]}"} - < "$file"
fi
[ $# -gt 0 ] || usage
exec npx -y @deepseek-ai/dsh --profile headless ${opts[@]+"${opts[@]}"} "$*"
