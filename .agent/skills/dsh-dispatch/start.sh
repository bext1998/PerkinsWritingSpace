#!/bin/bash
# 用法:start.sh <分支短雜湊>;在任務工作樹根目錄執行(新 pane 的工作目錄 = 目前目錄,也是 dsh-code 的工作區)。
# 在目前 pane 下方開新 pane,標籤「DSH-<短雜湊>」,以完全權限啟動 dsh-code(全螢幕),寫入 runtime.json,印出 pane ID。
# 同一 workspace 已有 Pi 或 dsh-code 時拒絕(同時最多一個實作者)。
# 完全權限的原因:workspace-write 下 Windows 沙箱無法替 D:\AgentCoding\.codex\worktrees 加權限,shell 一律啟動失敗(SKILL.md)。
set -e
[ -n "$1" ] || { echo "用法:start.sh <分支短雜湊>"; exit 2; }
git rev-parse --is-inside-work-tree >/dev/null
[ "$(git rev-parse --show-toplevel)" != "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")" ] || { echo "目前目錄是主倉庫,請先 cd 到任務工作樹"; exit 1; }
R="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.agent/profile/runtime.json"
busy=$(herdr agent list | python -c "import json,sys,os;w=os.environ['HERDR_WORKSPACE_ID'];print(' '.join(a['pane_id'] for a in json.load(sys.stdin)['result']['agents'] if a.get('agent') in ('pi','dsh-code') and a['pane_id'].startswith(w+':')))")
[ -n "$busy" ] && { echo "已有實作者 pane:$busy。同時最多一個,先收掉"; exit 1; }
p=$(herdr pane split --current --direction down --cwd "$(pwd -W 2>/dev/null || pwd)" --no-focus | python -c "import json,sys;print(json.load(sys.stdin)['result']['pane']['pane_id'])")
herdr pane rename "$p" "DSH-$1" >/dev/null
herdr pane run "$p" "dsh-code --permission danger-full-access" >/dev/null
for i in $(seq 1 30); do herdr pane read "$p" --source visible 2>/dev/null | grep -q "DSH Code" && break; sleep 2; done
python - "$R" "$p" "DSH-$1" <<'PY'
import json,sys,os,datetime
r,p,label=sys.argv[1:]
d=json.load(open(r,encoding='utf-8')) if os.path.exists(r) else {}
d['worker_dsh']={'pane':p,'label':label,'started':datetime.datetime.now().isoformat(timespec='minutes')}
json.dump(d,open(r,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
PY
echo "$p"
