# dsh-code 派工(DeepSeek Harness)

Pi(`pi-dispatch`)以外的第二種派工方式。`dsh-code` 是作者為 DeepSeek Harness 做的終端機 coding agent(類 Codex CLI,原始碼 `D:\AgentCoding\DSH\dsh-code-tui`,說明見其 `README.md`),工具、權限、session、技能都是 Harness 的同一套;它會主動向 herdr 回報狀態,也裝了 `herdr` 技能,能自己用 `herdr agent prompt` 回報 Orchestrator。模型由 `~/.dsh` 的 `code-host` profile 決定(預設 `deepseek-official/deepseek-flash`,2026-10-17 起為 V4.1-Flash-1017),花費走作者的 DeepSeek 帳戶,不經 OpenRouter。腳本在本目錄,用 Git Bash 執行。

## 何時用
- **實作**(herdr pane):內容明確、設計已定的工作——補測試、小修補、照說明修改。需要邊做邊決定設計、介面打磨或碰作者真實資料的工作不派。
- **唯讀分析**(單次):程式掃描、摘要、找呼叫點、第二意見。在要分析的目錄執行 `dsh-code -p --permission read-only "<任務>"`(長說明用 `dsh-code -p --permission read-only -` 從 stdin 讀),stdout 就是答案。不占實作者名額。
- **PR 審查**(單次):Reviewer 主審,見下方「審查」。
- 優先級與成本照 `AGENTS.md`「派工成本與優先級」;小到自己做更快的不派。

## 已驗證行為(2026-10-19,dsh-code 0.3.1、herdr 0.9.1-preview)
- **權限**:`workspace-write` 在任務工作樹(`D:\AgentCoding\.codex\worktrees\…`)下,Windows 沙箱替資料夾加權限失敗(`SetNamedSecurityInfoW failed (Win32 5)`):讀檔、改檔工具正常,但 **shell 一律無法啟動**(不能 `go test`、不能 `herdr` 回報),它會要求提權去改資料夾 ACL。作者決定(2026-10-19):實作派工用 **`--permission danger-full-access`**,只在任務工作樹執行,靠任務說明約束——與 Pi 相同(Pi 也沒有沙箱)。不要核准它修改資料夾權限的請求。
- **`-p --permission read-only`** 在同樣位置可用(讀檔工具不受影響)。
- **送訊**:`herdr agent prompt` 對 dsh-code 回 `agent_not_ready`,改用 `send.sh`(`pane send-text` + Enter)。`herdr agent list` 看得到 `agent: dsh-code` 與 `working`/`idle`/`blocked`。
- **讀畫面**:預設全螢幕(作者偏好,不加 `--inline`);全螢幕下 `herdr agent read` 讀不到內容,用 `herdr pane read <pane> --source visible`。
- **回報**:任務說明要求「完成用 `herdr agent prompt w12:p1 …` 回報」時,它會自己送出,內容與實際 diff 一致(測試派工實測)。

## 步驟
1. **任務說明**寫成檔案(放系統暫存目錄;格式照 `AGENTS.md`「Agent 之間的主動溝通」:寄件者、回報對象 pane ID、主旨、關聯;「任務」「限制」「交付」)。限制裡一律寫:
   - 不 commit、不 push、不開 PR、不切分支(由 Orchestrator 做;它跑完整權限,這條要明寫)。
   - 只在目前工作樹內改檔;不碰 `%USERPROFILE%\.perkins`、`~/.dsh`、作者設定與作品資料。
   - 不跑完整 E2E。真的要跑時寫出完整可複製的一行指令(含 `E2E_SKIP_AI=1`),註明「不帶這個變數會載入本機大模型」。
   - 交付:完成或受阻都用 `herdr agent prompt <Orchestrator pane> "…"` 回報(不必等對方空閒),寫明狀態、改了哪些檔案、實際執行的指令與結果、沒做到的部分。
2. **啟動**:照 `AGENTS.md` 開任務工作樹,`cd` 到工作樹根目錄,`start.sh <分支短雜湊>` → 印出 pane ID。同一 workspace 已有 Pi 或 dsh-code 時會拒絕(兩者共用「同時最多一個實作者」的名額)。
3. **送任務**:`send.sh <pane> "請讀任務說明檔 <Windows 路徑> 並照做。"`
4. **監看**:立刻在背景執行 `watch.sh <pane> <工作樹路徑>`;dsh-code 停下(idle/blocked)或 30 分鐘沒有任何修改時結束。`blocked` 時先 `pane read --source visible` 看它在問什麼,只在任務範圍內回答(用 `send.sh`);要求提權、改系統設定一律拒絕。迷路就 `stop.sh`,改由自己接手或換方式重派。
5. **驗收**:讀回報後親自核對 `git status`/`git diff` 與相關測試(介面改動照 `UI_GUIDE.md` 實看),再由 Orchestrator commit、推送、開 PR。返工用 `send.sh` 在同一個 session 送修正說明;同一問題返工兩輪仍不過就自己接手。
6. **記錄**:每次派工在主倉庫 `.agent/profile/pi-ledger.md` 加一列,方式寫 `dsh-code`,模型寫 `deepseek-flash(V4.1-Flash-1017)`;花費以 DeepSeek 平台餘額前後差為準。PR「Agent 貢獻」寫 `Implemented-by: DSH Code (DeepSeek Harness) | deepseek-flash(V4.1-Flash-1017)`。
7. **收尾**:回報且不再需要時 `stop.sh <pane>`;PR 合併後照常清掉工作樹與分支。

## 審查(Reviewer 主審,2026-10-27 起)
唯讀單次模式,不開 pane、不占實作者名額。唯讀模式下能否跑 shell 未驗證,所以 diff 由 Orchestrator 放進說明,不靠它自己跑 `git`。
1. **審查說明**寫成系統暫存目錄的檔案:開頭照 `AGENTS.md` 列寄件者、主旨、關聯(PR／分支);正文放審查範圍、任務與驗收條件、相關 SPEC 章節、Orchestrator 認為的風險點,再貼 `.agent/profile/reviewer.md` 的職責與 `AGENTS.md`「審查範圍」;最後附 `git diff origin/main...HEAD` 全文。要求輸出:每項發現附嚴重度、檔案:行、觸發情境、建議修法,範圍外發現另列;沒有就寫可合併並交代沒驗證到的部分。
2. **執行**:在 PR 的工作樹根目錄(讓它能讀到上下文檔案)執行 `dsh-code -p --permission read-only - < <說明檔>`,stdout 就是審查結果。
3. **處理**:逐項親自核對發現是否成立(它可能誤判);成立的修掉,複審時說明只放修補的 diff 與先前的發現。不成立的在 PR 回覆中寫明理由。
4. **高風險 PR 加審**(定義見 `AGENTS.md`):另開一個 Claude Code 子代理,只給同一份說明檔路徑與工作樹路徑,不給 Orchestrator 自己的判斷結論,讓它獨立審。
5. **記錄**:本機紀錄加一列(審查也算花費);過渡期同時寫 Codex 對同一 PR 的發現,標出哪一方多抓或誤報。PR「Agent 貢獻」寫 `Reviewed-by: Hemingway (DSH Code) | deepseek-flash(V4.1-Flash-1017)`,加審的另列 `Reviewed-by: <名稱> (Claude Code 子代理) | <模型 ID>`。

## 限制
- 不改 `~/.dsh`(含 `code-host` profile 的模型設定)與憑證;要換模型用啟動參數 `--model`,並寫進紀錄。
- 完全權限只用在任務工作樹;不在主倉庫或作者資料夾啟動。
- 不把金鑰、作者稿件或私人設定放進任務說明;倉庫是公開的。
