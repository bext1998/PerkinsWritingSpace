# PR 審查(Reviewer 派工)

每個 PR 在 Orchestrator 完成自己的驗證後使用(`AGENTS.md`「Git 與工作樹」)。Reviewer 開在 herdr pane 裡,可以自己跑 `git`、讀檔、實測,完成後用 herdr 回報。腳本借用 `pi-dispatch`、`dsh-dispatch`,用 Git Bash 執行。

## 選工具與模型
- **Pi(預設)**:`deepseek/deepseek-flash`(DeepSeek 官方 API),思考強度 `high`。2026-10-27 PR #167 實測約 13 分鐘,會自己跑 git 與 PowerShell 實測佐證發現。
- **dsh-code**:同一份 DeepSeek 額度,可擇一使用。DSH 改版後先確認能正常啟動與執行 shell 再派;2026-10-27 新版在唯讀與單次模式下 shell 失敗、長時間繞路,當時改用 Pi。
- **迴避**:審查模型不得與該 PR 的實作模型相同。DeepSeek 實作的 PR(dsh-code 或 Pi `deepseek-*`)改用其他模型的 Pi 審(例如 `xiaomi/mimo-v2.6-pro`),或由 Claude Code 子代理主審。
- 啟動腳本會檢查「本專案同時最多一個 Pi／dsh-code」;送審時實作者應已回報並收掉,還開著就先 `stop.sh`。

## 步驟
1. **審查說明**寫成系統暫存目錄的檔案,開頭列寄件者、回報對象(Orchestrator pane ID)、主旨、關聯(PR／分支／工作樹)。
   - 任務:審查 `git diff origin/main...HEAD`;寫明任務與驗收條件、相關 SPEC 章節;職責與範圍指向 `.agent/profile/reviewer.md`、`AGENTS.md`「審查範圍」。
   - 只寫事實背景(已知會另外處理的部分、相關既有機制),**不寫 Orchestrator 對風險或對錯的判斷**,保持審查獨立;高風險加審也用同一份。
   - 限制:唯讀——不改檔、不 commit、不 push、不切分支、不在 GitHub 留言;可以跑 git、讀檔、在暫存目錄做小實驗。
   - 交付:完成用 `herdr agent prompt <Orchestrator pane> "…"` 回報(不必等對方空閒),開頭寫寄件者、主旨、狀態(通過／Request changes);每項發現附嚴重度、檔案:行、觸發情境、建議修法;範圍外另列;最後寫沒驗證到的部分。內容長就寫到暫存檔,訊息只附路徑。
2. **啟動**:`cd` 到 PR 的工作樹根目錄。
   - Pi:`pi-dispatch/start.sh deepseek/deepseek-flash <分支短雜湊> high`;送任務用 `herdr agent prompt <pane> "…"`。
   - dsh-code:`dsh-dispatch/start.sh <分支短雜湊>`;送任務用 `dsh-dispatch/send.sh`。
   - 啟動後 `herdr pane rename <pane> Hemingway-<分支短雜湊>`。
3. **監看**:背景執行對應的 `watch.sh <pane>`。審查本來就不改檔,「30 分鐘沒有修改」不代表卡住,結束時看 pane 畫面判斷。
4. **處理**:逐項親自核對發現是否成立(可能誤判);成立的修掉,在同一個 session 請它複審,說明只放修補提交範圍與先前的發現。不成立的在 PR 回覆寫明理由。
5. **高風險 PR 加審**(定義見 `AGENTS.md`):另開一個新的 Claude Code 子代理(不是 fork,不帶 Orchestrator 的對話脈絡),只給同一份說明檔與工作樹路徑。
6. **記錄**:主倉庫 `.agent/profile/pi-ledger.md` 加一列(任務寫「審查 #<PR>」);DeepSeek 官方 API 的花費以 DeepSeek 平台餘額前後差為準(Pi 的 `watch.sh` 只看 OpenRouter)。PR「Agent 貢獻」寫 `Reviewed-by: Hemingway (Pi) | deepseek/deepseek-flash` 或 `Reviewed-by: Hemingway (DSH Code) | deepseek-flash(V4.1-Flash-1017)`;加審另列 `Reviewed-by: <角色名或「未知」> (Claude Code 子代理) | <模型 ID>`。
7. **收尾**:審查通過、不再需要複審時 `stop.sh <pane>`。

## 過渡期(到 2026-11-21 Codex 訂閱到期)
Codex 照舊審同一份 PR 作對照,紀錄寫雙方的發現,標出哪一方多抓或誤報。到期後移除本專案所有 Codex 對照字句:本節、`AGENTS.md`「Git 與工作樹」的過渡期條、`.agent/profile/reviewer.md` 的 Agent 欄。
