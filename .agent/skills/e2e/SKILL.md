---
name: e2e
description: 以 wails dev + 無頭 Edge 執行 Perkins 前端 E2E(app/e2e/run.js 測試組),含會影響使用者環境的副作用與清理步驟。
---

# Perkins 前端 E2E

## 何時使用

介面變更需要以真實 Go 後端驗證互動、或修改涉及 G1–G4／B1–B10 的前端流程時。只改 Go 邏輯時用 `go test ./...` 即可,不必跑 E2E。

## 副作用(執行前必讀)

- `wails dev` 讀寫**使用者真實的** `%APPDATA%\Perkins\settings.json`(最近專案清單、目前模型)。執行前先備份到暫存區,結束後逐位元組還原。
- 「複製到平台」步驟會覆寫**系統剪貼簿**,無法還原;回報時要說明。
- 提案步驟會呼叫本機 LM Studio(`http://localhost:1234/v1`)上設定中選定的模型,一次約 40–120 秒。LM Studio 未啟動時該步驟會失敗(平常開發用 `E2E_SKIP_AI=1` 跳過)。

## 步驟

1. 備份設定:把 `%APPDATA%\Perkins\settings.json` 複製到暫存資料夾。
2. 建立拋棄式測試專案:`node app/e2e/run.js --fixture <暫存資料夾>/e2e-proj`(不要放在倉庫內)。
3. 另開背景程序:在 `app/` 執行 `PERKINS_OPEN=<測試專案> wails dev -noreload`,等 `http://localhost:34115` 有回應且記錄出現 `Watching`。
   **要跑很多輪(破壞驗證)時只需啟動這一次**:之後每輪用 `--reuse`,它會重建 fixture、叫後端重新開啟作品、重載頁面(見「重用同一個 wails dev」)。
4. 第一次使用時在 `app/e2e/` 執行 `npm install`(只有 playwright-core,使用本機 Edge:`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`)。
5. 執行:`PROJ=<測試專案> node app/e2e/run.js <模式或組名>`。截圖在 `app/e2e/shots/`(已被 .gitignore 排除)。
6. 清理:`taskkill //F //IM perkins-dev.exe`、`taskkill //F //IM wails.exe`,並結束監聽 `[::1]:5173` 的 vite node 程序;還原 settings.json。
7. 清書櫃垃圾:`node .agent/skills/e2e/clean-recent.js`(先加 `--dry-run` 看清單)。移除「最近作品」中位於系統暫存資料夾的項目與殘留的 `perkins-e2e-b-*` 測試專案;暫存資料夾以外的作品一律保留。**只在沒有其他 E2E 在跑時執行**(會刪掉正在使用的乙作品目錄)。

## 執行模式(SPEC §16 第 25 項 A)

- `node app/e2e/run.js`:印出組清單、各組內容與「何時跑哪組」。
- `--smoke`:冒煙組(全新 fixture 約 20 秒,不重建 fixture 時更快),涵蓋開檔、打字存檔、提案預覽不外流、關閉保護主流程、標題欄/禪模式基本進出、搜尋開關。平常改完程式先跑這個。
- `<組名>...`:只跑指定組(可與 `--smoke` 並用,如 `node run.js search-editor --smoke`)。各組自行把應用帶到需要的起始狀態(必要時回書櫃重開作品、切面板、開章節),可單獨執行。
- `--all`:全部 15 組依序執行(全新 fixture 約 140 秒 + wails 啟動)。**合併前跑一次**。
- `--reuse [其他模式]`:重用已經在 34115 上的 `wails dev`,不冷啟動。它會:重建 fixture → 呼叫既有綁定 `OpenProjectAt(測試專案)`(後端 `setProject` 會取消在途請求並換掉 `proj`、`agent`(含對話與提案快取)、`research`)→ 重載頁面回到起始畫面。整個重載約 0.6 秒,對照冷啟動 20–41 秒。`--reuse` 可放任意位置(例如 `node run.js --reuse --all`)。
- 測試組在 `app/e2e/suites/*.js`,共用基礎(啟動、check/shot、fixture、狀態準備)在 `app/e2e/lib.js`。

## 重用同一個 wails dev(`--reuse`)

**可以 reuse**:這次沒改任何 Go 程式(`wails dev -noreload` 不會重編譯 Go)、沒改 `wails.json`/`main.go`、沒有增減綁定;只是重複跑測試組,或只改了前端。

**只能搭配 `E2E_SKIP_AI=1`**(run.js 會拒絕):會呼叫模型的執行若被中斷,後端舊請求與研究記錄可能還在跑,重新開啟作品不會等它結束,會寫進下一輪的新 fixture;跑模型一律冷啟動。

**一定要冷啟動**:任何 `.go` 變更(含 `internal/`)、`wails.json`/`app/main.go` 變更、新增或移除綁定、前端建置設定變更。有疑問就冷啟動。

怎麼確定測到的是新程式:
- 前端:dev server 由 vite 隨請求編譯磁碟上的最新原始碼,`--reuse` 又會重載頁面,所以看到的一定是新前端。前端改動不必冷啟動。
- Go:二進位是啟動時編譯的;`--reuse` 只是叫既有的後端重新開啟作品。改過 Go 就只能冷啟動(`taskkill` + 重建 fixture + 重啟 `wails dev`)。

等價性驗證(2026-10-10,#48 B,實測):
- 冷啟動 `--all` 468/468 passed(略過 8)176 秒;同一台 dev server 上 `--reuse --all` 連兩輪各 468/468(175.6 / 175.1 秒),檢查數與冷啟動完全相同。
- 每次節省的是冷啟動那段:`wails dev` 第一次編譯 41 秒,之後約 21 秒;單獨一組(例如 `bible`)冷啟動一輪 56 秒、`--reuse` 一輪 15 秒。
- 破壞驗證:把重載改成不重新開啟作品(模擬漏掉 `perkins.json` 快取),先用應用程式自己的 API 把作品改名造成「記憶體與磁碟不一致」,再跑 `--reuse titlebar-zen` → 「標題欄 作品畫面標題為作品名」FAIL(記憶體還留著舊名字);把重載放回去,同樣情境 29/29 通過。也就是說 `--reuse` 的等價性有被測到。

## 何時跑哪些組

| 改動類型 | 跑 |
|---|---|
| 標題欄、應用程式選單、禪模式、品牌 | `titlebar-zen` |
| Perkins Bot 對話、提案、預覽 | `bot-chat` `polish` `visual-1b` |
| 設定集、自訂分類、寫法檢查 | `bible` |
| Notion 匯入 | `notion` |
| 章節、書櫃、平台輸出、摘要 | `shelf` `layout-visual` |
| 研究記錄、快速指令來源 | `research` |
| 存檔流程 | `save-flow` `error-guard` `close-guard` |
| 錯誤防護、關閉保護 | `error-guard` `close-guard` |
| 設定頁版面 | `settings-layout` |
| 半螢幕、窄寬度工具列 | `layout-half` |
| 搜尋/取代、IME、編輯器手感 | `search-editor` |
| 不確定 | `--smoke` + 相關組 |

- 平常開發:`--smoke` + 受影響的組(一兩分鐘內)。
- 破壞驗證、返工:只跑該組。
- 合併前:`--all`(檢查清單必須與基準一致,不得減少)。

## 多個 Agent 同時跑 E2E

- E2E 共用 34115/5173 埠與 settings.json,一次只能跑一個。開始前建立鎖檔(Orchestrator 指定路徑,例如 scratchpad 的 `e2e.lock`,以 noclobber 建立),已存在就等;跑完、清理、還原、清書櫃垃圾後刪除。
- 備份 settings.json 必須在拿到鎖之後才做:在別人跑到一半時備份,會把對方留下的測試作品一起「還原」回去,書櫃因此累積垃圾(2026-10-08 實際發生,一次多出 11 筆)。

## 已知陷阱

- **重建測試專案後要讓後端重新開啟作品**:後端把 `perkins.json`、`agent`(對話與提案快取)、`research` 留在記憶體,不處理會用舊結構覆寫新檔,或讓測試看到前幾輪的殘留(曾造成「第3卷」這類假失敗)。做法二選一:(a) 冷啟動(`taskkill` + 重建 fixture + 重啟 `wails dev`,改過 Go 時唯一選擇);(b) `--reuse`(重建 fixture + 後端重新開啟作品 + 重載頁面,兩者等價性見上節實測)。
- **等模型回覆**:送出後先等對話框出現「停止」按鈕,再等「送出」按鈕回來;直接等「送出」會在請求開始前就判定結束。
- **會呼叫 Go 的 UI 操作**(例如設定欄位「套用」)要等畫面出現結果後再按下一個鍵,否則測試比非同步回應快。
- **原生對話框無法在無頭模式操作**(Notion 匯入、封面、整卷匯出、開啟資料夾):這些流程用 Go 測試覆蓋,回報時註明 GUI 未實測。
- Claude in Chrome 擴充在這台電腦未連線,不要改用它。
- 測試資料要包含「什麼都沒命中」的內容(例如沒有提到任何設定的章節),見 `docs/PITFALLS.md` #1。
- **部分組假設全新 fixture**:`titlebar-zen`(B1 嚴格 3 章與 perkins.json 未改)、`research`(R1 檔案不存在)、`save-flow`(E3 標記字未寫入)、`bible`(別名未套用過、無自訂分類殘留)、`bot-chat`/`search-editor`(依賴第一章原始內容)。這些組跑前要重建 fixture,並讓後端重新開啟作品(冷啟動或 `--reuse`,見上);重複執行同一 fixture 會因前輪汙染 FAIL(例如 bible 的別名填入相同值時 EntityHeader 的「套用」鈕不渲染),不是產品 bug。`--all` 一律從全新 fixture 開始。
- **要驗證「送出」本身(研究記錄、參數)但不想呼叫模型**:照 `research` R3,用綁定暫時 `SaveProfile` + `SetActiveModel` 到 `http://127.0.0.1:9/v1`,連線立即失敗仍會走完整 Ask 路徑;`finally` 還原原端點並 `DeleteProfile`,再開關設定頁讓 Workspace 重讀設定(使用者常選雲端端點,沿用舊設定會被送出前確認擋住)。用過對話框的組結束前按「新對話」,否則選取/附加/報告模式會漏到下一組(曾讓 polish U2 FAIL)。
- **共用狀態準備要冪等**:拆組後各組用 `lib.ensureProject/ensureChapter/ensureBookshelf` 對齊起始狀態;章節列點擊一律用 locator(自動重試,建立後的 tree 重渲染不打斷);冒煙組以專用「冒煙章」寫入(fs + 弄髒存檔觸發 refreshTree),不依賴也不汙染 fixture 原始內容。

## 驗證與回報

回報通過數(例如 367/367)、失敗項目與截圖路徑、settings.json 是否已還原、是否有殘留程序、剪貼簿是否被覆寫。無法重現的偶發失敗要標明「原因不明」,不要當成已確認的偶發問題。跑 `run.js` 會在結尾印各組耗時與總耗時,加速比對時記錄。
