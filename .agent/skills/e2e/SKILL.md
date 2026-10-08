---
name: e2e
description: 以 wails dev + 無頭 Edge 執行 Perkins 前端 E2E(app/e2e/e2e.js),含會影響使用者環境的副作用與清理步驟。
---

# Perkins 前端 E2E

## 何時使用

介面變更需要以真實 Go 後端驗證互動、或修改涉及 G1–G4／B1–B10 的前端流程時。只改 Go 邏輯時用 `go test ./...` 即可,不必跑 E2E。

## 副作用(執行前必讀)

- `wails dev` 讀寫**使用者真實的** `%APPDATA%\Perkins\settings.json`(最近專案清單、目前模型)。執行前先備份到暫存區,結束後逐位元組還原。
- 「複製到平台」步驟會覆寫**系統剪貼簿**,無法還原;回報時要說明。
- 提案步驟會呼叫本機 LM Studio(`http://localhost:1234/v1`)上設定中選定的模型,一次約 40–120 秒。LM Studio 未啟動時該步驟會失敗。

## 步驟

1. 備份設定:把 `%APPDATA%\Perkins\settings.json` 複製到暫存資料夾。
2. 建立拋棄式測試專案:`node app/e2e/e2e.js --fixture <暫存資料夾>/e2e-proj`(不要放在倉庫內)。
3. 另開背景程序:在 `app/` 執行 `PERKINS_OPEN=<測試專案> wails dev -noreload`,等 `http://localhost:34115` 有回應且記錄出現 `Watching`。
4. 第一次使用時在 `app/e2e/` 執行 `npm install`(只有 playwright-core,使用本機 Edge:`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`)。
5. 執行:`PROJ=<測試專案> node app/e2e/e2e.js`。截圖在 `app/e2e/shots/`(已被 .gitignore 排除)。
6. 清理:`taskkill //F //IM perkins-dev.exe`、`taskkill //F //IM wails.exe`,並結束監聽 `[::1]:5173` 的 vite node 程序;還原 settings.json。
7. 清書櫃垃圾:`node .agent/skills/e2e/clean-recent.js`(先加 `--dry-run` 看清單)。移除「最近作品」中位於系統暫存資料夾的項目與殘留的 `perkins-e2e-b-*` 測試專案;暫存資料夾以外的作品一律保留。**只在沒有其他 E2E 在跑時執行**(會刪掉正在使用的乙作品目錄)。

## 多個 Agent 同時跑 E2E

- E2E 共用 34115/5173 埠與 settings.json,一次只能跑一個。開始前建立鎖檔(Orchestrator 指定路徑,例如 scratchpad 的 `e2e.lock`,以 noclobber 建立),已存在就等;跑完、清理、還原、清書櫃垃圾後刪除。
- 備份 settings.json 必須在拿到鎖之後才做:在別人跑到一半時備份,會把對方留下的測試作品一起「還原」回去,書櫃因此累積垃圾(2026-10-08 實際發生,一次多出 11 筆)。

## 已知陷阱

- **重建測試專案後必須重啟 `wails dev`**:後端把 `perkins.json` 留在記憶體,不重啟會用舊結構覆寫新檔(曾造成「第3卷」這類假失敗)。
- **等模型回覆**:送出後先等對話框出現「停止」按鈕,再等「送出」按鈕回來;直接等「送出」會在請求開始前就判定結束。
- **會呼叫 Go 的 UI 操作**(例如設定欄位「套用」)要等畫面出現結果後再按下一個鍵,否則測試比非同步回應快。
- **原生對話框無法在無頭模式操作**(Notion 匯入、封面、整卷匯出、開啟資料夾):這些流程用 Go 測試覆蓋,回報時註明 GUI 未實測。
- Claude in Chrome 擴充在這台電腦未連線,不要改用它。
- 測試資料要包含「什麼都沒命中」的內容(例如沒有提到任何設定的章節),見 `docs/PITFALLS.md` #1。

## 驗證與回報

回報通過數(例如 34/34)、失敗項目與截圖路徑、settings.json 是否已還原、是否有殘留程序、剪貼簿是否被覆寫。無法重現的偶發失敗要標明「原因不明」,不要當成已確認的偶發問題。
