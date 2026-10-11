#!/bin/bash
# 用法:watch.sh <Pi pane> [起點 usage];派工後在背景執行。
# 2 分鐘後印出最近請求的供應商;之後每分鐘看狀態、每 15 分鐘看花費。
# 碰到任一條件就結束並印出原因:Pi 不在工作、30 分鐘內沒有任何修改、這次花費超過停損門檻(讀 pi-ledger.md 的「停損門檻」)。
D=$(cd "$(dirname "$0")" && pwd); P=$1
L="$(dirname "$(git -C "$D" rev-parse --path-format=absolute --git-common-dir)")/.agent/profile/pi-ledger.md"
LIMIT=$(python -c "import re,sys;m=re.search(r'停損門檻[:：]\s*([0-9.]+)',open(sys.argv[1],encoding='utf-8').read());print(m.group(1) if m else '')" "$L")
[ -z "$LIMIT" ] && { echo "找不到停損門檻:$L"; exit 1; }
BASE=${2:-$(bash "$D/usage.sh")}; echo "起點 usage=$BASE 停損=$LIMIT"
sess() { herdr pane get "$P" | python -c "import json,sys;print(json.load(sys.stdin)['result']['pane'].get('agent_session',{}).get('value',''))"; }
sleep 120
K=$(pi auth print-api-key --provider openrouter 2>/dev/null | tail -1); f=$(sess)
for id in $(grep -o '"responseId":"gen-[^"]*"' "$f" | cut -d'"' -f4 | tail -3); do
  curl -s "https://openrouter.ai/api/v1/generation?id=$id" -H "Authorization: Bearer $K" | python -c "import json,sys;d=json.load(sys.stdin).get('data',{});print('供應商',d.get('provider_name'),d.get('generation_time'))"
done
for i in $(seq 1 240); do
  s=$(herdr pane get "$P" | python -c "import json,sys;print(json.load(sys.stdin)['result']['pane']['agent_status'])")
  [ "$s" != "working" ] && { echo "Pi 狀態=$s $(date +%H:%M) 花費=$(python -c "print(round($(bash "$D/usage.sh")-$BASE,3))")"; exit 0; }
  if [ $i -eq 28 ]; then
    f=$(sess); [ "$(grep -cE '"name":"(write|edit)"' "$f")" -eq 0 ] && { echo "30 分鐘內沒有任何修改,可能迷路"; exit 0; }
  fi
  if [ $((i % 15)) -eq 0 ]; then
    u=$(bash "$D/usage.sh"); echo "$(date +%H:%M) 花費=$(python -c "print(round($u-$BASE,3))")"
    python -c "import sys;sys.exit(0 if $u-$BASE>$LIMIT else 1)" && { echo "花費超過停損門檻 $LIMIT"; exit 0; }
  fi
  sleep 60
done
echo "監看超過 4 小時,請檢查"
