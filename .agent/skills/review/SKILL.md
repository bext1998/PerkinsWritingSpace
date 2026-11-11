# PR 審查(Reviewer 派工)

每個 PR 在 Orchestrator 完成自己的驗證後使用(`AGENTS.md`「Git 與工作樹」)。Reviewer 開在 herdr pane 裡,可以自己跑 `git`、讀檔、實測,完成後用 herdr 回報。腳本借用 `pi-dispatch`、`dsh-dispatch`,用 Git Bash 執行。

## 選工具與模型
- **Pi(預設)**:`deepseek/deepseek-flash`(DeepSeek 官方 API),思考強度 `high`。2026-10-27 PR #167 實測約 13 分鐘,會自己跑 git 與 PowerShell 實測佐證發現。
- **dsh-code**:**2026-10-27 起暫停**(作者決定改用 Pi)。原因:Harness 主程式的終端機工具在沙箱下每次輸出 `InvalidOperation`、PowerShell 印中文成亂碼,修正要等 Harness 主程式更新。作者表示恢復後,先確認能正常執行 shell 再派。
- **迴避**:審查模型不得與該 PR 的實作模型相同。DeepSeek 實作的 PR(dsh-code 或 Pi `deepseek-*`)改用其他模型的 Pi 審(例如 `xiaomi/mimo-v2.6-pro`,啟動時把步驟 2 的模型 ID 換掉)。Claude Code 子代理不當主審,只當高風險加審(步驟 6)。
- 啟動腳本會檢查「本專案同時最多一個 Pi／dsh-code」;送審時實作者應已回報並收掉,還開著就先 `stop.sh`。

## 步驟
1. **審查說明**寫在 `D:\AgentCoding\.codex\worktrees\PerkinsWiritingSpace\Agent2AgentMSG`,檔名包含日期、分支或 PR 與用途；開頭列寄件者、回報對象(Orchestrator pane ID)、主旨、關聯(PR／分支／工作樹)。
   - 任務:審查 `git diff origin/main...HEAD`;寫明任務與驗收條件、相關 SPEC 章節;職責與範圍指向 `.agent/profile/reviewer.md`、`AGENTS.md`「審查範圍」。
   - 只寫事實背景(已知會另外處理的部分、相關既有機制),**不寫 Orchestrator 對風險或對錯的判斷**,保持審查獨立;高風險加審也用同一份。
   - 限制:唯讀——不改受版本控制的檔案、不 commit、不 push、不切分支、不在 GitHub 留言;可以跑 git、讀檔、在任務工作樹內以未追蹤檔案做小實驗，信件目錄只放說明與回報。
   - 交付:完成用 `herdr agent prompt <Orchestrator pane> "…"` 回報(不必等對方空閒,`AGENTS.md`「排隊送訊」的例外),開頭寫寄件者、主旨、狀態(通過／Request changes);每項發現附嚴重度、檔案:行、觸發情境、建議修法;範圍外另列;最後寫沒驗證到的部分。內容長就寫到上述 Agent2AgentMSG 目錄的回報檔,訊息只附路徑。
2. **啟動**:`cd` 到 PR 的工作樹根目錄。
   - Pi:`pi-dispatch/start.sh deepseek/deepseek-flash <分支短雜湊> high`;送任務用 `herdr agent prompt <pane> "…"`。
   - dsh-code:`dsh-dispatch/start.sh <分支短雜湊>`;送任務用 `dsh-dispatch/send.sh`。
   - 啟動後 `herdr pane rename <pane> Hemingway-<分支短雜湊>`。
3. **監看**:背景執行對應的監看腳本:Pi 用 `pi-dispatch/watch.sh <pane>`,dsh-code 用 `dsh-dispatch/watch.sh <pane> <工作樹路徑>`。審查本來就不改檔,「30 分鐘沒有修改」不代表卡住,結束時看 pane 畫面判斷。
4. **標題標記**:建立 PR 時標題就加前綴 `[未經獨立審查]`(`AGENTS.md`「Git 與工作樹」),主審、高風險加審都通過且修補已複審後才移除。
5. **處理**:先在工作樹跑 `git status` 確認審查者沒有改檔;再逐項親自核對發現是否成立(可能誤判);成立的依 `AGENTS.md`「派工成本與優先級」修掉(本機模型開著時寫明確指令交回它並核對),在同一個 session 請它複審,說明只放修補提交範圍與先前的發現。不成立的在 PR 回覆寫明理由。
6. **高風險 PR 加審**(定義見 `AGENTS.md`):另開一個新的 Claude Code 子代理(不是 fork,不帶 Orchestrator 的對話脈絡),只給同一份說明檔與工作樹路徑。
7. **記錄**:主倉庫 `.agent/profile/pi-ledger.md` 加一列(任務寫「審查 #<PR>」);DeepSeek 官方 API 的花費欄寫「月結」,每月初另記上月總額(`AGENTS.md`「Pi 按需啟動」);其他模型照 pi-dispatch 步驟 5。PR「Agent 貢獻」寫 `Reviewed-by: Hemingway (Pi) | deepseek/deepseek-flash` 或 `Reviewed-by: Hemingway (DSH Code) | deepseek-flash(V4.1-Flash-1017)`;加審另列 `Reviewed-by: <角色名或「未知」> (Claude Code 子代理) | <模型 ID>`。
8. **收尾**:審查通過、不再需要複審時 `stop.sh <pane>`。

## 常駐審查者(Codex 到期後,作者自己開)
作者會自己開一個常駐的 Pi pane 當審查者;有它時用它,不另外啟動。
1. **認領**:`herdr agent list` 找本倉庫(主倉庫或工作樹)裡 `agent: pi` 的 pane,再用 `herdr pane list` 看它們的 `label`(`agent list` 沒有標籤欄),排除 Orchestrator 自己啟動的(`Wolfe-*`、`Hemingway-<短雜湊>`);從狀態列確認模型。`herdr pane rename <pane> Hemingway`,並在主倉庫 `.agent/profile/runtime.json` 寫 `"reviewer_pi": "<pane ID>"`(是 `w12:p1E` 這種 ID,不是標籤)——`pi-dispatch/start.sh` 靠這個值把它排除在「同時最多一個實作者」之外。寫完再跑一次 `herdr pane list` 核對 ID 與標籤對得上。找不到或不確定是哪一個時,照上面步驟按需啟動,並告訴作者。
2. **新 PR 先開新對話**:每個新 PR 初審前,等它空閒後送 `/new` 開新對話,避免沿用前幾個 PR 的上下文(每輪重新計費,也會記得先前的討論)。在 Git Bash 要寫 `MSYS_NO_PATHCONV=1 herdr agent prompt <pane> "/new"`——不加的話 `/new` 會被轉成 `C:/Program Files/Git/new` 當成一般訊息送出(2026-11-11 實測)。送出後看狀態列上下文回到 `0.0%` 再送審。同一個 PR 的複審沿用同一個對話。
3. **送審**:上面「步驟」第 1 步的說明檔照寫,寫明工作樹的絕對路徑(它的工作目錄可能是主倉庫,要用 `git -C <工作樹>`);用 `herdr agent prompt`,對方正在工作時先等它空閒。
4. **迴避**:它的模型與該 PR 的實作模型相同時,這次改用按需啟動的其他模型(見「選工具與模型」的迴避)。
5. **不收掉**:審查完不 `stop.sh`;pane 消失或換了,重新認領並更新 `runtime.json`。

## 過渡期(到 2026-11-21 Codex 訂閱到期)
Codex 照舊審同一份 PR 作對照,紀錄寫雙方的發現,標出哪一方多抓或誤報。到期後移除本專案所有 Codex 對照字句:本節、`AGENTS.md`「Git 與工作樹」的過渡期條、`.agent/profile/reviewer.md` 的 Agent 欄。
