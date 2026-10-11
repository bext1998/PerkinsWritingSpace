#!/bin/bash
# 用法:usage.sh;印出 OpenRouter key 的累計用量(美元)。只送到 openrouter.ai。
K=$(pi auth print-api-key --provider openrouter 2>/dev/null | tail -1)
curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer $K" | python -c "import json,sys;print(json.load(sys.stdin)['data']['usage'])"
