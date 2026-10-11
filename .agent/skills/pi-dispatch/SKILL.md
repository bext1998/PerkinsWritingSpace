# Pi 派工(按需啟動與生命週期)

Orchestrator 派工給 Pi 實作者時使用。Pi 不常駐:派工時才開 pane、指定模型啟動,回報並審查完就收掉。腳本都在本目錄,用 Git Bash 執行。

## 本機檔案(不進 Git)
- `.agent/profile/pi-ledger.md`(主倉庫):第一行寫 `停損門檻:<美元>`(作者設定),其下是派工紀錄表。倉庫公開,花費與門檻只寫在這裡。
- `.agent/profile/runtime.json`:`start.sh`/`stop.sh` 自動維護 `worker_pi`(pane、標籤、模型、開始時間)。只是備忘,實際狀態以 `herdr agent list` 為準。

## 步驟
1. **選模型**:預設簡單工作 `xiaomi/mimo-v2.6-flash`、複雜工作 `xiaomi/mimo-v2.6-pro`。為累積比較資料,可依任務性質改用 `z-ai/glm-5.3`、`z-ai/glm-5.3-flash`、`deepseek/deepseek-v4.1-flash`;選擇理由寫進紀錄。
2. **啟動**:`start.sh <模型 ID> <分支短雜湊>` → 印出 pane ID。已有任何 Pi pane 時會拒絕(同時最多一個)。分支短雜湊由 Orchestrator 先決定並寫進任務說明,讓標籤與分支對得上。
3. **送任務**:任務說明寫成檔案,`herdr agent prompt <pane ID> "<寄件者、主旨、檔案路徑>"`。
4. **監看**:立刻在背景執行 `watch.sh <pane ID>`。它會印出供應商,並在 Pi 停下、30 分鐘沒有任何修改、或花費超過停損門檻時結束。
   - 迷路或超過門檻:Esc 中斷 Pi,判斷改由自己接手、換模型重派,或回報作者;不讓它繼續燒錢。
   - 同一問題返工兩輪仍未通過審查:停止返工,由 Orchestrator 接手。
5. **記錄**:每次派工(含返工)在 `pi-ledger.md` 加一列:日期、任務、PR、模型、供應商、花費(`usage.sh` 前後差額為準;pi 介面顯示的金額不可靠)、初審結果、返工、備註。
6. **收尾**:Pi 回報且不再需要它(審查通過,或返工已交由別人)時,確認閒置後 `stop.sh <pane ID>` 關掉 Pi 與 pane。PR 合併後刪除對應工作樹與本機分支。

## 標籤
- Pi pane 標籤 `Wolfe-<分支短雜湊>`;角色名沿用 `.agent/profile/`。herdr 的 pane ID 是自動編號、不能自訂,送訊仍要用 ID:由標籤查 ID 用 `pane-of.sh <標籤>`。

## 限制
- 不改 pi 的全域預設模型(`~/.pi/agent/settings.json`)。供應商排序由作者在 `~/.pi/agent/models.json` 設定,改了要重啟 Pi 才生效。
- 結束 Pi 用 Esc + Ctrl+D(`stop.sh`),不送 `/quit`、`/model` 等文字。
- 金鑰只由 `pi auth print-api-key` 取得並只送到 openrouter.ai,不寫進檔案或紀錄。
