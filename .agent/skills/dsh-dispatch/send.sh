#!/bin/bash
# 用法:send.sh <pane> <訊息>;送一則訊息給 dsh-code 並按 Enter。
# herdr 0.9.1 的 `agent prompt` 對 dsh-code 這類自行回報的 agent 回 agent_not_ready,所以改用 pane 指令。
# 長內容寫成檔案,訊息只附路徑。dsh-code 忙碌時送出的訊息會排到下一輪。
[ $# -eq 2 ] || { echo "用法:send.sh <pane> <訊息>"; exit 2; }
herdr pane send-text "$1" "$2" >/dev/null && herdr pane send-keys "$1" Enter >/dev/null
