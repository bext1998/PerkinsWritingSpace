#!/bin/bash
# 用法:start.sh <完整模型 ID(OpenRouter 含廠商前綴,如 xiaomi/mimo-v2.6-pro;直連供應商寫 mirai/mirai-s-27b、strata-lan/qwen3.8-flash-next-iq3_xxs、deepseek/deepseek-flash)> <分支短雜湊> [思考強度,預設 medium]
# 不帶廠商前綴時 pi 會模糊比對到別的模型(2026-10-19:mimo-v2.6-pro 被解析成 10 倍價的 -ultraspeed),所以拒絕,並在啟動後核對實際模型。
# 在任務工作樹執行:新 pane 的工作目錄 = 執行時的目前目錄(不指定時會沿用呼叫者 pane 的目錄,Pi 會跑到主倉庫)。
# 在目前 pane 下方開新 pane,標籤「Wolfe-<短雜湊>」,以指定模型啟動 Pi,寫入 runtime.json,印出 pane ID。
# 本專案已有 Pi 或 dsh-code 實作者時拒絕(同時最多一個)。
set -e
case "$1" in */*) ;; *) echo "模型 ID 要含廠商前綴(例如 xiaomi/mimo-v2.6-pro)"; exit 2;; esac
# 直連供應商(本機 mirai、strata-lan,DeepSeek 官方)不加 openrouter/;OpenRouter 上的 deepseek/deepseek-v4.1-flash 等仍走 OpenRouter
case "$1" in mirai/*|strata-lan/*|deepseek/deepseek-flash) M="$1";; *) M="openrouter/$1";; esac
want="${M#*/}" # pi 狀態列顯示的模型名:openrouter 是完整 ID,直連供應商去掉供應商名
T="${3:-medium}"
case "$T" in off|minimal|low|medium|high|xhigh|max) ;; *) echo "思考強度不合法:$T"; exit 1;; esac
R="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.agent/profile/runtime.json"
# 只算本專案(與目前目錄同一個 Git 倉庫的主倉庫或工作樹)的實作者;作者在其他專案開的 Pi 不影響這裡
C="$(git rev-parse --path-format=absolute --git-common-dir)"
busy=$(herdr agent list | python -c "
import json,sys,os,subprocess
w=os.environ.get('HERDR_WORKSPACE_ID','')
def ours(cwd):
    if not cwd: return False # 沒有 cwd 時 git -C '' 會查目前目錄,誤判成本專案
    r=subprocess.run(['git','-C',cwd,'rev-parse','--path-format=absolute','--git-common-dir'],capture_output=True,text=True)
    return r.returncode==0 and os.path.normcase(os.path.abspath(r.stdout.strip()))==os.path.normcase(os.path.abspath(sys.argv[1]))
# 作者開的常駐審查者(runtime.json 的 reviewer_pi)不是實作者,不占名額
rv=json.load(open(sys.argv[2],encoding='utf-8')).get('reviewer_pi') if os.path.exists(sys.argv[2]) else None
print(' '.join(a['pane_id'] for a in json.load(sys.stdin)['result']['agents'] if a['pane_id']!=rv and ((a.get('agent')=='pi' and ours(a.get('cwd',''))) or (a.get('agent')=='dsh-code' and a['pane_id'].startswith(w+':')))))
" "$C" "$R")
[ -n "$busy" ] && { echo "本專案已有 Pi 或 dsh-code pane:$busy。同時最多一個實作者,先收掉"; exit 1; }
# 兩個本機供應商共用家中同一台 llama-server,作者開哪個就只有哪個;狀態列只反映 pi 的設定,所以先問伺服器實際載入的模型
case "$1" in mirai/*|strata-lan/*) PYTHONIOENCODING=utf-8 python - "${1%%/*}" "${1#*/}" <<'PY' || exit 1
import json,sys,os,urllib.request
prov,mid=sys.argv[1:]
p=json.load(open(os.path.expanduser('~/.pi/agent/models.json'),encoding='utf-8'))['providers'][prov]
try:
    r=urllib.request.urlopen(urllib.request.Request(p['baseUrl'].rstrip('/')+'/models',headers={'Authorization':'Bearer '+p.get('apiKey','')}),timeout=5)
    ids=[m['id'] for m in json.load(r)['data']]
except Exception as e:
    sys.exit(f'本機模型伺服器沒有回應 {prov}({e});電腦可能沒開,或現在載入的是另一個本機模型'+(',也可能是 models.json 的 apiKey 與伺服器不符' if getattr(e,'code',None)==401 else ''))
if mid not in ids: sys.exit(f'本機伺服器現在載入的是 {ids},不是 {mid}')
PY
;; esac
p=$(herdr pane split --current --direction down --cwd "$(pwd -W 2>/dev/null || pwd)" | python -c "import json,sys;print(json.load(sys.stdin)['result']['pane']['pane_id'])")
herdr pane rename "$p" "Wolfe-$2" >/dev/null
herdr pane run "$p" "pi --model $M --thinking $T" >/dev/null
ok=
for i in $(seq 1 30); do herdr pane read "$p" 2>/dev/null | grep -qF " $want • " && { ok=1; break; }; sleep 2; done
# 狀態列不是剛好這個模型(模糊比對到別的、或沒起來)就收掉,不讓它燒錢
[ -n "$ok" ] || { herdr pane read "$p" 2>/dev/null | tail -3; bash "$(dirname "$0")/stop.sh" "$p"; echo "啟動的模型不是 $want,已關閉"; exit 1; }
python - "$R" "$p" "Wolfe-$2" "$1" "$T" <<'PY'
import json,sys,os,datetime
r,p,label,model,thinking=sys.argv[1:]
d=json.load(open(r,encoding='utf-8')) if os.path.exists(r) else {}
d['worker_pi']={'pane':p,'label':label,'model':model,'thinking':thinking,'started':datetime.datetime.now().isoformat(timespec='minutes')}
json.dump(d,open(r,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
PY
echo "$p"
