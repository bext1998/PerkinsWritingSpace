#!/bin/bash
# 用法:pane-of.sh <標籤>;由 pane 標籤查 pane ID(herdr 送訊只認 ID)。
herdr pane list | python -c "import json,sys;print('\n'.join(p['pane_id'] for p in json.load(sys.stdin)['result']['panes'] if p.get('label')==sys.argv[1]))" "$1"
