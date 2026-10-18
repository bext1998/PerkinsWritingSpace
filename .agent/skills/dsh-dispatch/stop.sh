#!/bin/bash
# 用法:stop.sh <pane>;結束 dsh-code(Ctrl+C 中斷進行中的回合,再 Ctrl+D 離開)、關閉 pane、從 runtime.json 移除。
# 只在 dsh-code 已回報且不再需要,或停損決定中止時使用。
P=$1
[ -n "$P" ] || { echo "用法:stop.sh <pane>"; exit 2; }
R="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.agent/profile/runtime.json"
herdr pane send-keys "$P" ctrl+c >/dev/null; sleep 1
herdr pane send-keys "$P" ctrl+d >/dev/null; sleep 3
herdr pane close "$P" >/dev/null && echo "已關閉 $P"
python - "$R" "$P" <<'PY'
import json,sys,os
r,p=sys.argv[1:]
if os.path.exists(r):
    d=json.load(open(r,encoding='utf-8'))
    w=d.get('worker_dsh')
    if isinstance(w,dict) and w.get('pane')==p: del d['worker_dsh']
    json.dump(d,open(r,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
PY
