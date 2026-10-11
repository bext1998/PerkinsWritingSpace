#!/bin/bash
# 用法:stop.sh <Pi pane>;結束 Pi(Esc 清空輸入後 Ctrl+D,不送 /quit 文字)、關閉 pane、從 runtime.json 移除。
# 只在 Pi 已回報且閒置,或停損決定中止時使用。
P=$1
R="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.agent/profile/runtime.json"
herdr pane send-keys "$P" esc >/dev/null; sleep 1
for i in 1 2 3; do
  herdr pane send-keys "$P" ctrl+d >/dev/null; sleep 3
  n=$(herdr pane process-info --pane "$P" | python -c "import json,sys;print([p['name'] for p in json.load(sys.stdin)['result']['process_info']['foreground_processes']])")
  case "$n" in *powershell*) break;; esac
done
herdr pane close "$P" >/dev/null && echo "已關閉 $P"
python - "$R" "$P" <<'PY'
import json,sys,os
r,p=sys.argv[1:]
if os.path.exists(r):
    d=json.load(open(r,encoding='utf-8'))
    w=d.get('worker_pi')
    if isinstance(w,dict) and w.get('pane')==p: del d['worker_pi']
    json.dump(d,open(r,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
PY
