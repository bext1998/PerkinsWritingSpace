# researchstats — 研究記錄指標(開發用小程式)

SPEC §16 第 21 項(b) 的開發工具。讀單一作品的 `.perkins/research.jsonl`(§12.8 研究記錄),在 stdout 輸出指標;**不是 App 功能**,沒有 Wails 綁定,不會出現在介面。

- 只讀指定的檔案或資料夾;不讀其他位置、不上傳任何東西、不寫檔(輸出到 stdout)。
- 位置:`app/cmd/researchstats`(Go,`go run` 或 `go build` 後執行)。

## 用法

```bash
cd app
go run ./cmd/researchstats <作品資料夾或 research.jsonl 路徑> [--json]
```

- 參數是**作品資料夾**時,讀 `<資料夾>/.perkins/research.jsonl`;是**檔案**時直接讀該檔。
- `--json` 以 JSON 輸出(順序不拘);不加則輸出人讀格式,分母都標明在輸出中。
- 不需開啟 App;研究記錄開關(設定頁)開著的作品才會有資料。

## 指標與資料來源

| 指標 | 計算方式 | 分母 |
|---|---|---|
| 提案接受率 | `proposal_accept` 事件數 ÷(accept + reject) | 記錄中有決定的提案;**待審中的提案沒有事件,不計** |
| 作者修改後接受比例 | `proposal_accept` 中 `authorEdited=true` ÷ 全部 accept | 全部 accept |
| 拒絕率 | `proposal_reject` 事件數 ÷(accept + reject) | 同接受率 |
| 各快速指令使用次數 | 帶 `quickId` 的 `ask` 事件依 id 分組計數 | 該指令的 ask 事件數 |
| 送出前改過問題比例 | 同上事件中 `quickEdited=true` 的比例 | 同上 |
| 平均對話長度 | 每 session 的 ask 事件數;與每個 ask 的回合數(`requests` 中 purpose=ask 的請求數,工具迭代算多回合) | 出現 ask 的 session 數 / ask 事件數 |
| 壓縮前後上下文用量 | 依 `requests` 順序配對:「前」= compact 請求中被濃縮的對話逐字稿字元數;「後」= 該壓縮(**僅成功套用者**,`ok=true`)之後的第一個 ask 請求訊息字元數。送出前壓縮(compact 與 ask 在同一事件)同事件內即可配對;送出後壓縮(compact 在事件尾)由同 session 下一筆 ask 事件配對 | 可配對的壓縮次數 |

資料來源說明:提案的接受/拒絕/修改後接受就記在 `research.jsonl` 的 `proposal_accept`(`authorEdited` 欄位)與 `proposal_reject` 事件裡,因此**不需要** provenance.jsonl。

壓縮的成功/失敗:compact 請求自 2026-10 起帶 `ok` 欄位(§12.8),失敗的壓縮(模型錯誤)也會記錄但標 `ok:false`,未改變對話歷史,不納入壓縮前後統計;**舊版記錄沒有 `ok` 欄位**,無法確認是否套用,另計在 `compactionsUnknown`,不計入配對;若記錄中全是這種壓縮,該指標輸出「資料不足」。

## 已知限制

- **壓縮前後上下文用量是估計值**:記錄裡沒有 token 數欄位,以訊息字元數計。壓縮後的上下文大小沒有獨立欄位,以「壓縮後第一個 ask 請求」的訊息字元數代替;若成功壓縮之後直到 session 結束都沒有 ask 請求,該次無法配對,不計。若之後需要更準的數字,可考慮在 §12.8 的 `requests` 快照補 token 數欄位(目前**不**為此擴充記錄)。
- 舊版記錄(沒有 `quickId`、`requests`、`authorEdited` 等欄位)不會出錯:缺欄位就以零值處理,快速指令統計只計入有 `quickId` 的事件。
- 壞行(JSON 解析失敗)跳過並計數(`badLines`),不中斷。

## 測試

```bash
cd app
go test ./cmd/researchstats/
```

測試用自行撰寫的虛構 jsonl fixture,涵蓋每個指標、空檔、壞行、缺欄位的舊版記錄(含 compact 無 `ok` 欄位)、失敗壓縮、同事件配對與跨事件配對;每個指標的計算都做過破壞驗證(改壞計算後測試會 FAIL)。