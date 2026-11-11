寄件者：Max（Orchestrator，Claude Code）
回報對象：<Orchestrator pane ID>
主旨：<一句話>
關聯：Issue #<n>／分支 maze/<日期>-<短雜湊>／工作樹 <絕對路徑>

## 任務
- 目標：<完成後可以觀察到的結果>
- 背景：<根因、相關檔案:行、參考提交；是線索，不是必須照抄的解法>
- 不要做：<明確排除的範圍>
- 說明與程式或 SPEC 對不上時，先停下回報，不要照說明硬做。

## 限制
- 不 commit、不 push、不開 PR、不切分支（由 Orchestrator 做）。
- 只在上面的工作樹內改檔；不碰作者的作品與 `%USERPROFILE%\.perkins` 設定，唯一例外是下一條明確核准的 E2E 備份／測試／還原流程。
- 一律用上面工作樹的絕對路徑；主倉庫必須保持乾淨（曾有相對路徑改到主倉庫）。
- 不用 junction／符號連結共用主倉庫的 `node_modules`，在工作樹內自己 `npm ci`（刪工作樹時會連主倉庫的依賴一起清空）。
- 破壞驗證不要用 `git checkout -- <檔案>` 還原：未提交的修補會一起消失。先另存修補，或手動改回。
- E2E：<不跑／只跑 `<組名>`>。不跑時完全不碰設定；指定組別時只跑那些組，照 `.agent/skills/e2e/SKILL.md` 備份、還原與清理（它會寫真實設定）。開跑前以 noclobber 建立鎖檔 `D:\AgentCoding\.codex\worktrees\PerkinsWiritingSpace\e2e.lock`，已存在就等。指令照抄：`E2E_SKIP_AI=1 PROJ=<測試專案> node app/e2e/run.js <組名>`；不帶 `E2E_SKIP_AI=1` 會載入本機大模型、吃光記憶體（改動涉及模型流程時，Orchestrator 在這裡另行註明）。
- 收尾關掉自己啟動的 `wails dev` 等程序。

## 交付
- 完成或受阻都用 `herdr agent prompt <Orchestrator pane> "…"` 回報，不必等對方空閒（`AGENTS.md`「排隊送訊」的例外）。
- 開頭寫寄件者、主旨、狀態（完成／部分完成／受阻／失敗），依序寫：做了什麼、改了哪些檔案、實際執行的指令與結果、沒驗證到的部分。沒跑的測試不寫成通過。

## 驗收
- <可觀察的結果，以及對應的檢查指令；依改動風險選，例如相關 Go 套件的 `go test`、前端 `npm run build`、介面改動實際 render 並截圖>
- <Bug 修復：拿掉修補後回歸測試要失敗（破壞驗證），結果寫進回報>

## 選模型的理由
- <參考帳本「日期+任務+PR」：同模型或同類任務的初審與返工結果；沒有就寫「無同類紀錄」>
