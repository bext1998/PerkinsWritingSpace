#!/bin/bash
# 用法:start.sh <OpenRouter 模型 ID> <分支短雜湊> [思考強度,預設 medium]
# 在目前 pane 下方開新 pane,標籤「Wolfe-<短雜湊>」,以指定模型啟動 Pi,寫入 runtime.json,印出 pane ID。
# 已有任何 Pi pane 時拒絕(同時最多一個 Pi 實作者)。
set -e
T="${3:-medium}"
case "$T" in off|minimal|low|medium|high|xhigh|max) ;; *) echo "思考強度不合法:$T"; exit 1;; esac
R="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.agent/profile/runtime.json"
busy=$(herdr agent list | python -c "import json,sys;print(' '.join(a['pane_id'] for a in json.load(sys.stdin)['result']['agents'] if a.get('agent')=='pi'))")
[ -n "$busy" ] && { echo "已有 Pi pane:$busy。同時最多一個 Pi,先用 stop.sh 收掉"; exit 1; }
p=$(herdr pane split --current --direction down | python -c "import json,sys;print(json.load(sys.stdin)['result']['pane']['pane_id'])")
herdr pane rename "$p" "Wolfe-$2" >/dev/null
herdr pane run "$p" "pi --model openrouter/$1 --thinking $T" >/dev/null
for i in $(seq 1 30); do herdr pane read "$p" 2>/dev/null | grep -q "$1" && break; sleep 2; done
python - "$R" "$p" "Wolfe-$2" "$1" "$T" <<'PY'
import json,sys,os,datetime
r,p,label,model,thinking=sys.argv[1:]
d=json.load(open(r,encoding='utf-8')) if os.path.exists(r) else {}
d['worker_pi']={'pane':p,'label':label,'model':model,'thinking':thinking,'started':datetime.datetime.now().isoformat(timespec='minutes')}
json.dump(d,open(r,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
PY
echo "$p"
