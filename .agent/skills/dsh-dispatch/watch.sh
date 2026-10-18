#!/bin/bash
# 用法:watch.sh <pane> <工作樹路徑>;派工後在背景執行。每分鐘看一次狀態,
# dsh-code 不在工作(idle/blocked/離開)、或 30 分鐘內工作樹沒有任何檔案修改時結束並印出原因。
P=$1; W=$2
[ $# -eq 2 ] || { echo "用法:watch.sh <pane> <工作樹路徑>"; exit 2; }
st() { herdr agent list | python -c "import json,sys;print(([a['agent_status'] for a in json.load(sys.stdin)['result']['agents'] if a['pane_id']=='$P' and a.get('agent')=='dsh-code']+['gone'])[0])"; }
sig() { git -C "$W" status --porcelain | md5sum; }
sleep 60
last=$(sig); since=$(date +%s)
while :; do
  s=$(st)
  [ "$s" = working ] || { echo "dsh-code 狀態:$s"; exit 0; }
  now=$(sig)
  if [ "$now" != "$last" ]; then last=$now; since=$(date +%s)
  elif [ $(( $(date +%s) - since )) -ge 1800 ]; then echo "30 分鐘沒有任何修改"; exit 0; fi
  sleep 60
done
