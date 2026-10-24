# Pi 派工(按需啟動與生命週期)

Orchestrator 派工給 Pi 實作者時使用。Pi 不常駐:派工時才開 pane、指定模型啟動,回報並審查完就收掉。腳本都在本目錄,用 Git Bash 執行。

## 本機檔案(不進 Git)
- `.agent/profile/pi-ledger.md`(主倉庫):第一行寫 `停損門檻:<美元>`(作者設定),其下是派工紀錄表。倉庫公開,花費與門檻只寫在這裡。
- `.agent/profile/runtime.json`:`start.sh`/`stop.sh` 自動維護 `worker_pi`(pane、標籤、模型、開始時間)。只是備忘,實際狀態以 `herdr agent list` 為準。

## 步驟
1. **選模型**:預設簡單工作 `xiaomi/mimo-v2.6-flash`、複雜工作 `xiaomi/mimo-v2.6-pro`。為累積比較資料,可依任務性質改用 `z-ai/glm-5.3`、`z-ai/glm-5.3-flash`、`deepseek/deepseek-v4.1-flash`、`minimax/minimax-m3.1-flash`;選擇理由寫進紀錄。
   **MiniMax M3.1 Flash** 走 OpenRouter(原本的 MiniMax 訂閱不再使用)。pi 1.1.0 的內建模型表(`pi update --models` 之後仍然)沒有這個模型,2026-10-25 已補在 `~/.pi/agent/models.json` 的 `openrouter.models`(只新增這一筆,內建模型照舊);pi 收錄後可移除。
   **DeepSeek 官方 API**:Pi 內建供應商 `deepseek`,寫 `deepseek/deepseek-flash`(V4.1 Flash),走作者的 DeepSeek 帳戶額度,不經 OpenRouter。同一份額度也可用 dsh-code(`dsh-dispatch` 技能)派工,依任務擇一;OpenRouter 上的 `deepseek/deepseek-v4.1-flash` 則照常走 OpenRouter。
   **Qoder**(Qwen 3.8 Flash Next):作者自己開的 pane,免費期間作備援,免費結束後停用;不經本腳本啟動。
   **本機模型** `mirai/mirai-s-27b`(Qwen3.8-27B 約 2.4 位元量化,作者家中 RTX 4070 那台跑 llama-server,Pi 供應商 `mirai` 由作者設在 `~/.pi/agent/models.json`):不另外花錢,適合簡單、範圍明確的工作;程式品質尚在試用,重要工作仍用 OpenRouter 模型。那台電腦不一定開著,啟動前先確認連得上;一次只能處理一個請求。
   **思考強度**依任務難度選:簡單工作 `medium`;複雜工作、或返工/審查被打回後重派用 `high`;`xhigh`/`max` 原則上不用(思考 token 也計費)。不依賴 `~/.pi/agent/settings.json` 的預設值(實測不一定生效),一律在啟動時指定。
   各模型實際可用的強度(2026-10-12 查 OpenRouter `/api/v1/models` 的 `reasoning.supported_efforts` 與 pi 1.1.0 內建模型表;換模型或升級 pi 後重查):

   | 模型 | pi 可用強度 | 不支援的值會被 pi 換成 | 備註 |
   |---|---|---|---|
   | MiMo V2.6 Pro / Flash | off、minimal、low、medium、high | xhigh/max → high | OpenRouter 只標「可開關思考」,沒有列強度檔位;low/medium/high 是否真有差別未實測 |
   | GLM 5.3 / 5.3 Flash | low、high、max(不能關) | medium → **high**、off → low | 不指定時 OpenRouter 預設 **max**(最貴) |
   | DeepSeek V4.1 Flash(OpenRouter 與官方 `deepseek-flash` 相同) | off、low、high、max | medium → **high** | 不指定時預設 high;官方檔位依 pi 內建模型表(2026-10-25) |
   | MiniMax M3.1 Flash(OpenRouter) | low、medium、high、xhigh、max(不能關) | off → low | 不指定時 OpenRouter 預設 **max**;OpenRouter `supported_efforts`(2026-10-25) |
   | mirai-s-27b(本機) | pi 設定為可思考 | 未實測 | 強度檔位是否對 llama-server 有作用未實測 |

   pi 遇到不支援的值會**往上**找最近的檔位,所以「簡單工作 medium」在 GLM、DeepSeek 上實際是 high;這兩家簡單工作改用 `low`。MiniMax M3.1 Flash 有 medium,照一般規則。
2. **啟動**:`start.sh <完整模型 ID(OpenRouter 含廠商前綴,如 `xiaomi/mimo-v2.6-pro`;直連供應商寫 `mirai/mirai-s-27b`、`deepseek/deepseek-flash`)> <分支短雜湊> [思考強度]` → 印出 pane ID。思考強度省略時用 `medium`。**不帶廠商前綴會被拒絕**:pi 對 `openrouter/<名稱>` 做模糊比對,2026-10-19 `mimo-v2.6-pro` 被解析成 `xiaomi/mimo-v2.6-pro-ultraspeed`(輸入/輸出單價 10 倍),#132、#130 兩次派工因此多花約 2 美元;腳本會等 pi 狀態列出現剛好這個模型 ID,不符就關掉 pane 並回錯。已有任何 Pi pane 時會拒絕(同時最多一個;作者在其他專案自己開的 Pi 也算,要等它關掉或問作者)。分支短雜湊由 Orchestrator 先決定並寫進任務說明,讓標籤與分支對得上。
3. **送任務**:任務說明寫成檔案,`herdr agent prompt <pane ID> "<寄件者、主旨、檔案路徑>"`。
   **啟動前先 `cd` 到任務工作樹**(`start.sh` 以執行時目錄為新 pane 的工作目錄)。任務說明的「交付」寫明:**完成回報直接送給 Orchestrator,不必等它空閒**——Orchestrator 作業期間幾乎一直是 working,照一般排隊規則等待會卡住(2026-10-13 實際發生,Pi 以 `herdr agent wait --until idle` 反覆等了數分鐘)。
4. **監看**:立刻在背景執行 `watch.sh <pane ID>`。它會印出供應商,並在 Pi 停下、30 分鐘沒有任何修改、或花費超過停損門檻時結束。
   - `watch.sh` 的花費停損只查 OpenRouter;用 DeepSeek 官方或本機模型時這項不會觸發,DeepSeek 官方要自己看平台餘額。
   - 迷路或超過門檻:Esc 中斷 Pi,判斷改由自己接手、換模型重派,或回報作者;不讓它繼續燒錢。
   - 同一問題返工兩輪仍未通過審查:停止返工,由 Orchestrator 接手。
5. **記錄**:每次派工(含返工)在 `pi-ledger.md` 加一列:日期、任務、PR、模型、思考強度、供應商、花費(OpenRouter 以 `usage.sh` 前後差額為準,pi 介面顯示的金額不可靠;DeepSeek 官方以 DeepSeek 平台餘額前後差為準;本機為 0)、初審結果、返工、備註。
6. **收尾**:Pi 回報且不再需要它(審查通過,或返工已交由別人)時,確認閒置後 `stop.sh <pane ID>` 關掉 Pi 與 pane。PR 合併後刪除對應工作樹與本機分支。

## 標籤
- Pi pane 標籤 `Wolfe-<分支短雜湊>`;角色名沿用 `.agent/profile/`。herdr 的 pane ID 是自動編號、不能自訂,送訊仍要用 ID:由標籤查 ID 用 `pane-of.sh <標籤>`。

## 限制
- 不改 pi 的全域預設模型(`~/.pi/agent/settings.json`)。供應商排序由作者在 `~/.pi/agent/models.json` 設定,改了要重啟 Pi 才生效。
- 結束 Pi 用 Esc + Ctrl+D(`stop.sh`),不送 `/quit`、`/model` 等文字。
- 金鑰只由 `pi auth print-api-key` 取得並只送到 openrouter.ai,不寫進檔案或紀錄。
