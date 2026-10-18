# DeepSeek Harness 派工(dsh headless)

Orchestrator 把**可以用一份說明完整交代、中途不需要追問**的工作,交給本機 DeepSeek Harness(`@deepseek-ai/dsh`)的 headless 模式執行,讀回結果。這是 Pi(`pi-dispatch`)以外的第二種派工方式:不開 herdr pane、跑一個任務就結束,呼叫 DeepSeek 官方 API(作者付費的 DeepSeek 帳戶,不經 OpenRouter)。腳本 `dsh-run.sh` 在本目錄,用 Git Bash 執行。

## 何時用
- **唯讀分析**(`--readonly`):大範圍程式掃描、摘要、找呼叫點、第二意見審查(只看程式,不跑測試)。
- **內容明確、設計已定的小型實作**(不加 `--readonly`,在任務工作樹):補測試、小修補、照說明修改。需要邊做邊判斷設計、碰介面打磨或作者真實資料的工作不派。
- 優先級與成本照 `AGENTS.md`「派工成本與優先級」;小到自己做更快的不派。
- 選 dsh 或 Pi:dsh 適合一次說清楚、跑完就交的工作;需要中途往返、返工對話或長時間監看的用 Pi。

## 已驗證行為(2026-10-18,dsh developer preview;版本升級後重測)
- `--help` 只有 `--json`、`--session-id <id>`,沒有工作目錄、模型、權限旗標;旗標放在任務文字前;任務文字可用 `-` 從 stdin 讀(腳本的 `--file`)。
- **工作目錄 = 執行時的目前目錄**。模型由 `~/.dsh` 設定決定(API 名稱 `deepseek-flash`,2026-10-17 起為 V4.1-Flash-1017)。
- **預設權限是 workspace-write**:可改工作目錄內檔案、可跑 shell(go、git…),也能寫系統暫存目錄;寫工作目錄外(例如使用者家目錄)會被擋,要求提權時 headless 沒有核准管道,一律失敗。
- **`DSH_PERMISSION_MODE=read-only` 在 headless 有效**:寫檔被擋;shell 仍可執行,但**連 `go test`、`go build` 都會失敗**(不能寫建置暫存目錄)。要跑測試就得用可寫模式。
- **exit code 只代表這一輪正常結束**:任務做不到(被權限擋、找不到東西)時仍是 0,會在答案裡說明。判斷成敗要讀答案。未知 session、旗標錯誤等是 1,訊息在 stderr。
- stdout 只有最終答案;stderr 帶推理過程與診斷。`--json` 事件類型:`session`(含 `sessionId`、`cwd`)、`status`(`turn_start`/`step_start`/`step_end`,`step_end` 帶 `usage` token 數;`turn_end` 帶結束原因)、`thinking`、`tool_call`、`tool_result`、`text`、`final`。
- `--session <id>` 可接續上下文(session id 取自 `--json` 的 `session` 事件)。

## 步驟
1. **任務說明**寫成檔案(格式照 `AGENTS.md`「Agent 之間的主動溝通」:寄件者、主旨、關聯;「任務」「限制」「交付」)。dsh 跑完就結束、不會用 herdr 回報,所以「交付」寫成**最後答案要包含的內容**:做了什麼、改了哪些檔案、實際執行的指令與結果、沒做到的部分。限制裡一律寫:
   - 不 commit、不 push、不開 PR、不切分支(由 Orchestrator 做)。
   - 不碰 `%USERPROFILE%\.perkins`、作者設定與作品資料;不跑完整 E2E。真的要跑 E2E 時,在說明裡寫出完整可複製的一行指令(含 `E2E_SKIP_AI=1`),並註明「不帶這個變數會載入本機大模型」。
2. **選模式與位置**:
   - 唯讀分析:在要分析的目錄(主倉庫或工作樹)跑 `dsh-run.sh --readonly --file <說明檔>`。
   - 實作:先照 `AGENTS.md` 開任務工作樹,在工作樹根目錄跑 `dsh-run.sh --json --file <說明檔>`,**不在主倉庫跑可寫模式**。可寫的 dsh 算「同時最多一個 Pi 實作者」的名額(共用 E2E 埠與 settings.json):有 Pi pane 開著時不跑,反之亦然。唯讀分析不占名額。
3. **執行**:短任務直接跑(Bash timeout 600000);預期超過 10 分鐘的用背景執行,`--json` 輸出導到暫存檔,並在背景執行時加 `timeout 1800`(30 分鐘停損,同 Pi)。執行期間 Orchestrator 不編輯同一批檔案。
4. **處理結果**:
   - 讀最終答案(`--json` 時是 `final` 事件);任務被擋或沒完成時答案會寫,不能只看 exit code。
   - 答案裡引用的檔案、行號、測試結果,寫進回報或 Issue 前親自核對。
   - 實作:用 `git diff`/`git status` 檢查實際改動,照一般流程驗證(相關套件測試、型別檢查,介面改動照 `UI_GUIDE.md` 實看),再由 Orchestrator commit、推送、開 PR。
   - exit 1:回報 stderr 的錯誤,修正參數後最多重試一次。
   - 需要追問或返工:用同一個 session(`--session <id>`)送修正說明;同一問題返工兩輪仍不過就由 Orchestrator 接手。
5. **記錄**:每次派工在主倉庫 `.agent/profile/pi-ledger.md` 加一列,方式寫 `dsh`,模型寫 `deepseek-flash(V4.1-Flash-1017)`;用量填 `--json` 各 `step_end` 的 token 加總,金額以 DeepSeek 平台餘額前後差為準。PR「Agent 貢獻」寫 `Implemented-by: DeepSeek Harness (dsh) | deepseek-flash(V4.1-Flash-1017)`。
6. **收尾**:刪掉暫存的說明與輸出檔;PR 合併後照常清掉工作樹與分支。

## 限制
- 只有作者明確同意才在主倉庫跑可寫模式;預設唯讀分析加 `--readonly`。
- 不改 `~/.dsh` 的設定或憑證,不全域安裝 dsh,一律 `npx -y`(腳本已處理)。
- 不把金鑰、作者稿件或私人設定放進任務說明;倉庫是公開的,說明檔放系統暫存目錄。
