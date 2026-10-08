# PROGRESS.md

## 2026-10-09 — reloadCurrent 讀檔期間切章競態修復(Issue #56)

- `Workspace.reloadCurrent`(接受提案、版本還原後的重載)在 `await ReadFile` 後核對 `latest.current.current` 仍是發起時的檔案,已切到別章就不套用(不 setText、不 setFlashP、不清 dirty、不重掛);比照 `openFile` 的 stale 檢查與 `deleteCategory` 重讀的寫法。原本讀檔期間切章會把 A 章內容放進 B 章編輯器,之後存檔寫進 B 章檔案(資料遺失風險)。
- **E2E(visual-1b,3 項)**:專用章節 A/B,寫入提案檔後覆寫 `ReadFile` 讓 A 章讀取卡在受控 Promise(比照 research R2),接受提案 → 卡住期間切到 B → 放行;斷言麵包屑仍是 B、編輯器仍顯示 B 內容、在 B 打字存檔後磁碟上的 B 未被寫成 A 章內容;`finally` 還原綁定與浮窗收合。
- **破壞驗證**:拿掉核對 → 「編輯器仍顯示章節 B」與「磁碟上的 B 不變」兩項 FAIL(編輯器被寫入 A 章內容,存檔把 A 內容寫進 B 檔);放回後全綠。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)386/386 passed(基準 383 + 3),略過 8 項,148s;settings.json 逐位元組還原,書櫃無殘留,剪貼簿未覆寫。
- **返工(codex 審查,Orchestrator 直接修)**:(1)Major:只比路徑仍會丟字——接受期間作者在同一章打字,重載回來會覆蓋;A→B→A 的過期重載也會通過。改為接受期間(存檔→套用→重載)編輯器唯讀(`Editor` 的 `readOnly` prop,CodeMirror Compartment;版本還原在對話框內,本來就無法打字),並加開檔世代 `navGen`,讀檔期間開過檔即作廢。(2)E2E 放行後明確等讀檔完成、存檔等落盤;覆寫綁定改 try/finally 還原。新增 3 項:接受期間打字不進編輯器、完成後顯示套用內容、完成後解除唯讀。破壞驗證:不上鎖 → 唯讀檢查 FAIL;不解鎖 → 後續存檔失效中斷;拿掉核對 → 切章兩項 FAIL。全新 fixture `--all`:389/389。
- **返工 2(codex 複審 3 項 Major)**:(1)右鍵剪下/貼上直接送出修改,繞過 `readOnly` → 唯讀時再加 `EditorState.changeFilter` 擋下所有文件修改;(2)重複按接受,第二次失敗會提早解鎖 → 鎖改計數(`lockEdits` 回傳解鎖函式,全部結束才解鎖);(3)版本還原可按 Escape 關對話框繼續打字 → 還原(存檔→寫入→重載)也上同一把鎖。新增 3 項檢查;破壞驗證:計數改布林 → 重複接受檢查 FAIL;拿掉 changeFilter → 同項 FAIL;還原不上鎖 → 還原檢查 FAIL。全新 fixture `--all`:393/393。

## 2026-10-09 — Bot 浮窗用量返工(PR #54 審查)

- `App.PreviewContext` 在請求進行中(`a.cancel != nil`)時不再呼叫 `prepare()`,沿用執行中 Agent 的端點設定估算(背景重算不得繞過送出確認換端點;App 層回歸測試 `TestPreviewContextDoesNotTouchRunningAgent`);前端 `busy` 期間停止背景重算,`chat:done` 後再算。
- 背景預覽改用編輯器目前草稿:`AskParams` 新增僅供 Preview 的 `docDraft`,`BuildMessages` 以它取代目前文件的磁碟內容;`AskAI` 清除該欄位(送出前已存檔,兩者相同;回歸測試 `TestPreviewUsesDocDraftButAskDoesNot` + E2E「未存草稿的用量反映草稿內容」)。重算依賴補 `keepSel` 與目前端點的 `contextTokens`;用量重算加世代計數,過期回應不覆蓋。全新 fixture `--all`(E2E_SKIP_AI=1)381/381 passed(基準 380 + 1),略過 8 項。

## 2026-10-09 — Bot 浮窗上下文用量 + 送出預覽來源標示(Issue #37 部分)

範圍:用量百分比與來源標示先行;壓縮狀態指示與開關等 #32 定案,本輪不做。

- **上下文用量**:`agent.Preview` 新增 `limit` 欄位(= `ContextTokens − replyReserve(ContextTokens)`,與 Ask 超預算判斷同一套;budget=0 時為 0),前端不自行重算公式。`ChatWindow` 標題列常駐顯示 `context-usage`(「上下文 N%」,tokens 用後端 `PreviewContext` 回傳值;limit=0 時不顯示,超過 100% 用警示色)。更新時機:開啟浮窗、問題/選取/附加/目前文件/模式等組成改變(debounce 400ms,同 SuggestAttachments)、`chat:done`(含壓縮後)、按「新對話」、切換端點/模型。
- **送出預覽標示來源**(前端追蹤,不改 Go):「本次直接送出」的附加檔案標示「手動附加」(迥紋針/點選)或「採用建議附加」(點建議標籤、檢查面板帶入);「原始訊息」每則加來源標籤:系統指示、先前對話(使用者/AI)、較早對話的摘要(以「【較早對話的摘要】」開頭)、本次提問(最後一則 user)、role=tool 顯示「Agent 工具讀取或搜尋結果」(工具名稱從前一則 assistant 的 toolCalls 以 toolCallId 對回)。依訊息本身判斷,不改訊息內容。
- **驗證**:Go 新增 `TestPreviewLimitMatchesOverBudgetCheck`(limit 與 Ask 超預算判斷同一個值:未超過時 Ask 送出、超過時 Ask 拒絕、以 tokens/limit 重算 Over 與 `Preview.Over` 一致、budget=0 時 limit=0 且不標示超過);`tsc --noEmit`、`npm run build` 通過。
- **E2E(E2E_SKIP_AI=1)**:bot-chat 加 5 項(context-usage 百分比 = 以 `PreviewContext` 拿到的 tokens/limit 算出的值,並用綁定 `contextTokens:200` 的暫時端點在小 limit 下再做精確比對(255%)與警示色;手動附加(迥紋針)與建議附加(建議標籤)在預覽中標示不同;原始訊息有來源標籤);layout-half 加 3 項(640 寬下 context-usage 可見、在浮窗與視窗範圍內,標題未被擠壞,輸入區 ≥ 200)。注意:浮窗位置會被 close-guard 拖到寬視窗位置,layout-half 先暫放大到 1440 把浮窗拖回左上再縮回 640 量測。
- **破壞驗證**:拿掉 `pv.Limit` 賦值 → Go 測試 FAIL;移除 `context-usage` 元素 → bot-chat/layout-half FAIL;前端改用錯誤公式(budget×2)→ 精確百分比 FAIL;附加一律標「手動附加」→ 區分檢查 FAIL;來源標籤改回只顯示 role → 標籤檢查 FAIL;還原後全綠。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)380/380 passed(基準 372 + 8),略過 8 項,143s;settings.json 已逐位元組還原,書櫃無殘留。「新對話」不清問題框屬既有行為(非本輪改動),bot-chat 的參數比對直接讀畫面當下的問題文字。

## 2026-10-09 — 接受提案後短暫標示 AI 改動範圍(Issue #45 第三層 a)

- **做法**:接受提案後編輯器重載,把提案實際寫入的文字(作者修改過就用修改版)以 `cm-ai-flash` 標示,3 秒內淡掉並移除;只是裝飾,不改文件內容,查歷史仍到「版本」。只標目前開著的檔案,刪除(寫入空字串)不標。
- **定位**:後端 `Accept` 在重新定位套用時把 `Start/End` 更新為實際套用處(原本沿用建立時的舊位置),前端把位元組偏移換成字元位置(CRLF 檔案扣掉 `\r`);重載內容與寫入結果不符時不標。標示與重載內容同一次提交,渲染時核對目標仍是目前檔案(讀檔期間切章不標到別章)。以上為 codex 審查返工;Go 回歸測試 `TestAcceptRelocatedReportsAppliedStart`(破壞驗證:拿掉更新 → FAIL),前端改回「取第一次出現」→ E2E 位置檢查 FAIL。返工後全新 fixture `--all`:374/374。
`)。不改 Go。
- **實作**:`Editor` 新增 `flash` prop,在掛載時用 StateField 裝飾套用(StrictMode 會建兩次編輯器,父層一次性 effect 會畫在被丟棄的那個上,見 `.agent/memory/editor-strictmode-remount.md`);`Workspace` 在接受後設定、下一次重掛後清掉;`ChatWindow` 的 `onAccepted` 改傳整個提案。
- **不做**:#45 的 (b) 編輯器內差異、(c) 選取一級互動(與 #35 一起設計)。
- **驗證**:`tsc --noEmit`、`npm run build` 通過。`visual-1b` 新增 2 項:專用章節中改寫後文字故意先出現一次,標示必須落在實際改動處;數秒後移除。破壞驗證 3 次:改取第一次出現 → 位置檢查 FAIL;不套用標示 → FAIL;不移除標示 → 移除檢查 FAIL;還原後全綠。全新 fixture `--all`(E2E_SKIP_AI=1):374/374,略過 8 項,146s;settings.json 逐位元組還原,書櫃無殘留。

## 2026-10-09 — 研究記錄指標 E2E(§16 第 21 項,PR #27 建議的 4 項)

- **research 組新增 R3**(5 項檢查):選取浮動列「分析這段」原樣送出 → ask 記 `quickId=analyze`、`quickEdited=false`;「節奏」帶入後改寫 → `quickId=pace`、`quickEdited=true`,且事件不含原始問題全文(同時確認改寫後問題有被記錄,避免空泛通過);自行輸入 → 無 `quickId`/`quickEdited` 欄位;檢查面板「人物設定矛盾」→ `quickId=char`。
- **不呼叫模型**:R3 期間以綁定暫時新增並啟用 `http://127.0.0.1:9/v1` 端點,送出後連線立即失敗、仍寫入恰好一筆 ask 事件,所以在 `E2E_SKIP_AI=1` 下照常執行;`finally` 還原原端點與模型、刪除暫時端點,再開關設定頁讓 Workspace 重讀設定(使用者若選雲端端點,沿用舊設定會被「送出前確認」擋住)。結束按「新對話」清掉帶入的選取/附加/報告模式——第一次 `--all` 因沒清,polish U2 沿用了 R3 的舊選取而 FAIL。
- **驗證**:破壞驗證 2 次——`quickEdited` 固定 false 並拿掉送出後歸零 → 改寫、自行輸入兩項 FAIL;不送 `quickId` → 原樣、改寫、檢查面板三項 FAIL;還原後全綠。全新 fixture `--all`(E2E_SKIP_AI=1):372/372 passed(基準 367 + 5),略過 8 項,142s;settings.json 已逐位元組還原,書櫃無殘留。

## 2026-10-08 — E2E 測試加速 A+C(§16 第 25 項,Issue #48)

- **基準 vs 拆組後**:
  - 基準(單一 e2e.js,E2E_SKIP_AI=1,不含 wails 啟動):176s,367/367 passed,略過 8 項。
  - 拆組後 `--all`(同一環境):143–144s,367/367 passed,略過 8 項 — 檢查名稱集合與基準**完全相同**(逐一 diff 驗證,無增減)。
  - `--smoke`:全新 fixture 約 4s(9/9);重複執行約 15–20s。
  - 常見情境「只改搜尋」:`node run.js search-editor --smoke` 約 21s(52/52)。
- **A. 拆組**:e2e.js(3,230 行)拆成 `run.js`(執行器:`--all`/`--smoke`/組名)+ `lib.js`(共用:fixture、啟動、check/shot、settle、狀態準備)+ 15 個連續片段組(`suites/*.js`,檢查名稱與斷言未動)。各組以 `ensureProject/ensureChapter/ensureBookshelf` 冪等地自行對齊起始狀態(含回書櫃重開、面板切換、缺章建立),可單獨執行。
- **C. 清固定等待與軟等待**:新增 `settleDOM`(等 DOM 靜默 80ms 或上限),145 處短固定等待轉換(上限保留原延遲);19 處「等不到也算對/收尾」的軟等待保留並逐一註明理由,63 處改為硬等待(等不到就 FAIL)。
- **驗證**:`tsc --noEmit`、`npm run build` 通過;破壞驗證 3 項(選單儲存移除 → titlebar-zen FAIL;搜尋面板掛載移除 → search-editor FAIL;EntityHeader 套用移除 → bible 的 hardened 等待逾時中斷 FAIL),還原後全綠。
- **單組獨立執行驗證(15 組全數通過)**:重建 fixture + 重啟後逐組單跑 — titlebar-zen 29/29、bot-chat 6/6(+8 略過)、bible 23/23、shelf 20/20、layout-visual 7/7、research 8/8、polish 42/42、visual-1b 4/4、save-flow 23/23、notion 23/23、settings-layout 28/28、error-guard 43/43、close-guard 50/50、layout-half 31/31、search-editor 44/44。其中 layout-visual 起的 11 組是在**已被前輪汙染的 fixture** 上通過(拆組的狀態準備有效);titlebar-zen/bot-chat/bible/shelf 需較乾淨的起始狀態,在重建後通過。bible 單跑在同一 fixture 的第二次執行會 FAIL — 別名填入相同值時 EntityHeader 的「套用」鈕不渲染(changed=false),屬 fixture 汙染前提,已寫入 SKILL.md。
- **遇到的狀態陷阱**(拆組必修):章節列點擊一律改 locator(建立後 tree 重渲染不打斷);冒煙組不得用 UI 建章觸發(wails dev 檔案監看器會重啟後端),以 fs 寫「冒煙章」+ 第一章弄髒存檔觸發 refreshTree;goto 後要等自動開作品的 tree 載入穩定(settle)再操作,避免新增章節與在途 tree 更新競態。

## 2026-10-08 — 研究記錄指標返工(PR #27 審查:壓縮統計兩項)

- **#1(Major)壓縮後上下文依 requests 順序配對**:原本一律取「同 session 下一筆 ask 事件」當壓縮後上下文,送出前壓縮(compact → ask 在同一事件)後直接關閉 App 會漏算,繼續提問則配到另一個問題的上下文。改為依 requests 順序:成功壓縮後的第一個 ask 請求(通常同事件內)即配對;送出後壓縮(compact 在事件尾)仍跨事件配對;跨事件 pending 已在事件開頭帶入。fixture 預期值同步修正(compact(500)→ask(30) 配 (500,30),不再配到下一筆的 60),補「最後一筆事件即可完成配對」與跨事件配對檢查。**破壞驗證**:同事件配對拿掉 → fixture + 跨事件 + 最後一筆 3 項 FAIL;還原後全綠。
- **#2(Minor)失敗的壓縮不得當成完成**:`compactCollect` 在模型錯誤前就記錄 compact 請求,統計上分不清是否套用。`researchRequest` 補 `ok *bool`(omitempty,ask 請求不設,不會被誤認為成功);`compactCollect` 的 collect 回呼改帶 `ok`,失敗也記錄但標 `ok:false`;`researchstats` 只配對 `ok=true` 的壓縮,舊記錄無 `ok` 欄位記入 `compactionsUnknown` 不配對,全是這種時輸出「資料不足」。SPEC §12.8 補 `ok` 欄位說明。**回歸測試**:走完整 Ask 路徑(超預算 + History 足以壓縮)斷言 `ok=true`/`ok=false` 各一次;**破壞驗證**:agent 端把失敗也固定回 true → 2 項 FAIL;researchstats 端拿掉 ok=false 跳過 → 失敗壓縮測試 FAIL、拿掉 unknown 記數 → 舊記錄測試 FAIL;還原後全綠。
- **驗證**:`go vet ./internal/... . ./cmd/...`、`go test ./internal/... . ./cmd/...` 全過。本輪只動 Go 與文件,前端未改(tsc/build 於上一輪已驗)。

## 2026-10-08 — 研究記錄指標(§16 第 21 項)

- **(a) ask 補記快速指令來源**:`AskParams` 新增 `quickId` 與 `quickEdited`;前端 `ChatRequest` 加 `quickId`,快速指令的入口(編輯器右鍵選單、選取浮動列、檢查面板 AI 檢查)帶入指令 id,`ChatWindow` 記住原始問題文字,送出時比對是否被改過(只記布林,不記改前全文);非快速指令來源、送出後、重置對話都歸零,不會誤記。ask 事件兩個記錄點(`agent.rlogAsk` 與 `app.logAskPremature`)都只在 `quickId != ""` 時寫入這兩個欄位。wails 綁定已重產(`wails generate module`)。SPEC §12.8 已補欄位說明。
- **(b) researchstats**:`app/cmd/researchstats`,開發用 cmd(非 App 功能、無 Wails 綁定):讀單一作品的 `.perkins/research.jsonl`,輸出提案接受率、修改後接受比例、拒絕率、各快速指令使用次數與改過問題比例、平均對話長度(每 session ask 數與每 ask 回合數)、壓縮前後上下文用量(字元數估計:前 = compact 逐字稿、後 = 下一筆 ask 的第一個請求),`--json` 可選;只讀指定路徑、不上傳、不寫檔。資料來源:接受/拒絕/修改後接受就在 research.jsonl 的 `proposal_accept`(`authorEdited`)/`proposal_reject` 事件,不需要 provenance.jsonl。用法與指標定義見 `docs/RESEARCHSTATS.md`。
- **驗證**:`go vet ./internal/... . ./cmd/...`、`go test ./internal/... .` 全過;新 cmd 測試以虛構 fixture 涵蓋每個指標 + 空檔 + 壞行 + 缺欄位舊版記錄,每個指標都做過破壞驗證(改壞計算 → 測試 FAIL,共 11 項);`tsc --noEmit`、`npm run build` 通過。E2E 未跑(避開同時進行中的 e2e.js 改動),建議補的檢查見 PR 說明。

## 2026-10-08 — 編輯器手感返工二(PR #26 複審:全域鍵守衛與 Select 檢查情境)

- **#1(Minor)popper wrapper 擋住 Tooltip**:Select 守衛用了所有 Radix 浮層共用的 `[data-radix-popper-content-wrapper]`,Tooltip 顯示時(滑鼠停在「設定」等按鈕上)Ctrl+F 也被擋。存在檢查收斂為 `[data-testid=settings-page], [role=dialog], [role=menu], [role=listbox]`;`closest` 的 popper wrapper 保留(Tooltip 焦點不會進 popper content,不影響;其他浮層焦點在內時仍擋)。**回歸檢查**:hover「設定」鈕等 Tooltip 出現 → Ctrl+F 面板開啟且聚焦搜尋欄。
- **#2(Minor)Select 檢查情境無效**:原本在設定頁內開 Select(平台輸出的章節標題),設定頁守衛本來就擋,單獨移除 Select 守衛仍會通過(破壞驗證證實)。改為**作品畫面內**的 Select:設定集 EntityHeader 的類型選單(`[data-testid=entity-header-type]`),開啟後 Ctrl+F 面板不得開啟;檢查後切回稿件。
- **破壞驗證(兩輪分離歸因)**:(A) 還原 popper wrapper 到存在檢查 → Tooltip 檢查 FAIL(面板被擋)、Select 檢查 PASS(設定頁情境的舊檢查確實無法失敗);(B) 移除 `[role=listbox]`(closest 與存在檢查)→ Select 檢查 FAIL(焦點在 Select content 內,面板在選單背後開啟搶焦點)、Tooltip 檢查 PASS。兩輪各自證明對應檢查能抓到對應守衛的缺失。還原後全綠。
- **E2E 流程陷阱**:EntityHeader 檢查途中切到 canon 檔,`openFile` 把先前貼上的字存了檔,回到第一章後是乾淨的 — 長章檢查的 Ctrl+S 對乾淨檔不觸發 refreshTree,新章節列不出來(waitForSelector 15s 逾時);改用「空格+Backspace」弄髒(內容不變)再存。另外合成 Ctrl+Shift+F 會切禪模式(合併後),檢查後有 `[data-testid=zen-exit]` 就用真實快捷鍵離開;Orchestrator 合併時新增的「CapsLock 下 Ctrl+Shift+F 進入禪模式」檢查與本段共存。
- **驗證**:`tsc --noEmit`、`npm run build` 通過;E2E(E2E_SKIP_AI=1)**367/367 passed,略過 8 項**;長章量測無回歸(輸入中位 20–21ms、捲動 16–26ms)。

## 2026-10-08 — 編輯器手感返工(PR #26 審查修復)

- **#1 還原重試拉走明確定位**:位置還原是 rAF 重試(等 CM 排版,最多約 40 frame),作者在這個視窗內點場景/搜尋結果跳行(`scrollToLine`),稍後仍被拉回舊位置(實測 scrollTop 741→10708)。修法:追蹤還原 rAF(`restoreRafRef`)與旗標(`restoringRef`),`cancelRestore()` 在三個時機呼叫 — 作者操作(編輯器內 `pointerdown`/`wheel`/`keydown`)、明確定位(`scrollToLine`、`openSearch`)、卸載。
- **#2 縮放保護拉走閱讀位置**:縮放保護原本只看「縮放後」游標是否可見,作者游標在開頭、捲到中段閱讀時縮放會被拉回開頭(scrollTop 2610→4)。修法:`cursorVisibleRef` 在選取/捲動時記錄「縮放前」游標可見性,原本就在畫面外就不拉回。
- **#3 全域鍵守衛漏設定頁與 Radix Select 浮層**:設定頁是 fixed 覆蓋層(無 `role=dialog`),Radix Select 開啟時焦點還在觸發鈕上。除了 `closest` 檢查,補「覆蓋層存在即不攔截」的整體檢查(`[data-testid=settings-page]`、`[data-radix-popper-content-wrapper]`、`[role=dialog]`、`[role=menu]`)——焦點可能在 body 或不在覆蓋層元素內,以覆蓋層開著為準。
- **#4 全域鍵不攔 Shift/Alt/defaultPrevented/IME**:CapsLock 下 Ctrl+Shift+F 的 key 是小寫 f會被當成搜尋(PR #24 禪模式用 Ctrl+Shift+F,合併後兩個 handler 都會跑);補 `e.shiftKey||e.altKey`、`e.defaultPrevented`、`e.isComposing||e.keyCode===229` 守衛。
- **#5 刪檔後位置記憶殘留**:同名新檔案會套用已刪文件的位置。修法:tree 更新時清掉不存在的路徑;E2E 驗證「刪除後建立同名文件從預設位置開始」。
- **#6 貼上檢查拿掉雙軌備援**:原「剪貼簿內容不符時只驗文件變長」允許貼入錯誤內容(只看長度)。改為暫時替換 `clipboard.readText()` 固定回傳測試字串,斷言實際插入內容(含 `\r\n` 正規化),再還原替身。
- **E2E**:新增/改寫 9 項檢查(貼上改替身斷言、設定頁/Select 浮層/Shift+Alt/defaultPrevented/IME 229 五項守衛、還原中點場景、閱讀中縮放、刪除清記憶、同名重建);長章 fixture 加場景標題(場景清單只在章節為作用中時渲染)。**破壞驗證(六項修正同時移除)**:9 項全 FAIL,各自重現原問題 — C1(anchor 已跳到 8 但捲動被拉回 48212)、C2(閱讀中縮放被拉回 scrollTop 50)、F5(記憶未清、同名重建套用舊位置 anchor 7)、全域鍵四項開了面板、貼上 FAIL。還原後全綠。
- **E2E 陷阱**:側欄場景清單用 `li` 的 `startsWith` 匹配(外層章節 li 的 textContent 含場景名,`includes` 會點錯);Radix Dialog Escape 後要 `waitForSelector('[role=dialog]', {state: 'hidden'})`;設定頁預設在 AI 模型分頁,先切 `[data-testid=tab-project]` 才找得到 research-row。
- **驗證**:`tsc --noEmit`、`npm run build` 通過;E2E(E2E_SKIP_AI=1)**358/358 passed,略過 8 項**。截圖:`74-resize-reading-preserved.png`(閱讀中縮放保留位置)已親自檢視。

## 2026-10-08 — 編輯器手感(§16 第 24 項第一層剩餘)

- **切章位置記憶**:`Workspace` 持有 `posMemo` Map(檔案路徑 → {anchor, head, scrollTop},只存記憶體不寫檔);`Editor` 掛載時讀取還原、選取/捲動變動時持續寫回(updateListener + scroll 事件 rAF 節流),因此外部重載(`reloadCurrent`、接受提案、`applyHeader`)重掛後也回到原位置。相容性靠既有機制:過期導覽由 `navSeq` 擋、重掛由 `key={current}:{reloadKey}`。陷阱:
  - 掛載還原的 `dispatch(selection)` 自己會觸發 `selectionSet` → 把 `scrollTop=0` 寫回 Map 蓋掉記住的值:還原期間用旗標擋 `savePos`。
  - 捲動還原要等 CM 排版(首次排版捲動高度逐步長大),等不到目標高度就重試(最多約 40 frame);不額外 `scrollIntoView`(游標在可視範圍外時會把捲動位置拉走)。
  - 超出文件長度夾住(`Math.min(saved, len)`):外部重載縮短後 `EditorSelection.range` 超界會拋錯(「Selection points outside of document」),E2E 已驗。
- **全域 Ctrl+F / Ctrl+H**:`Workspace` 的 window keydown;編輯器聚焦時不會走到這裡(cm-content 是 contenteditable,由 Editor 的 searchKeymap 處理);守衛 `input, textarea, select, [contenteditable=true], [role=dialog], [role=menu], [data-testid=chat-window]`(對話框、Perkins Bot 浮窗、選單內不攔截);沒有開檔不做任何事。Editor 新增 `openSearch(replace?)` handle。
- **視窗縮放游標穩定**:Editor 內 `ResizeObserver`(rAF 節流)觀察自身寬高,游標(`coordsAtPos`)落在可視範圍外才以 `scrollIntoView(nearest)` 最小捲動帶回(不跳到頂端,本來就看得到就不動);≤960 側欄/資訊欄互斥收合的情境由 E2E 以 640×672 實測。
- **貼上的格式處理**:CodeMirror 原生 paste 只取純文字圖層(帶 `text/html` 雙格式的合成 paste 事件也只插入 plain,已驗證,不需改);右鍵選單「貼上」走前端 `clipboard.readText()`,補 `\r\n→\n` 正規化(不做其他改寫)。
- **長章節實測**:約 7.7 萬字章節(E2E fixture 動態建立),輸入一個字到畫面更新中位數 19–22ms、最大 21–31ms(10 次),捲動定位 16–27ms;無明顯問題,**未改程式**。
- **E2E**:新增 13 項檢查(貼上 3、全域鍵 4、長章量測 1、縮放穩定 1、位置記憶 3 + 前置 1);全段在 IME 段之後,檢查間會關閉開著的面板。**破壞驗證(三輪)**:(1) 移除夾住 + 縮放保護 + 全域鍵 + 貼上正規化 → 縮放穩定 FAIL(游標不可視)、夾住移除後「Selection points outside of document」炸掉編輯器(JS 錯誤檢查抓到)、貼上檢查 FAIL;(2) 移除還原 + 不攔截守衛 → 切章還原 FAIL(anchor 46→0、scroll 360→0)、Perkins Bot 輸入框與對話框內 Ctrl+F 被攔截(兩項 FAIL);(3) 全域鍵移除 + 貼上插錯內容 → 全域鍵兩項 FAIL;貼上檢查原以「文件變長」為容差,收緊為「嚴格內容斷言 + 剪貼簿確認」後破壞版必 FAIL。還原後全綠。
- **E2E 陷阱(重要)**:
  - E4a 段(crash/救援)把 `navigator.clipboard.writeText` 換成不寫真剪貼簿的替身,之後未還原;該段結尾 app 會 reload(替身消失),但無頭環境真 `writeText` 在此之後仍偶發不生效(寫入 resolve、讀回仍是舊內容)→ 右鍵貼上檢查用雙軌斷言:剪貼簿是預期測試文字時驗內容,不生效時(殘留的救援複本仍含 `\r\n`)以「文件精確變長 + 無 `\r`」驗正規化,兩軌都能抓到破壞。
  - Chromium 右鍵點擊會把游標移到點擊處(貼入位置在中間,不是檔尾);右鍵選單用明確座標 + `waitForSelector('.ctxmenu')`。
  - 還原捲動的 `maxScroll` 掛載當下為 0(視埠未排版),要等排版完成重試。
  - 每輪 run 前重建 fixture + 重啟 wails dev(run 會新增章節/修改檔案,不重置會讓章節數檢查與存檔類檢查互相汙染)。
- **驗證**:`tsc --noEmit`、`npm run build` 通過;E2E(E2E_SKIP_AI=1)**349/349 passed,略過 8 項**。截圖:`app/e2e/shots/70-global-find.png`(全域 Ctrl+F)、`71-resize-640-stable.png`(640 縮放後游標可視)、`72-long-chapter.png`(長章)、`73-position-restored.png`(切章還原選取+捲動),均已親自檢視。**IME(A9)未驗證**:無頭環境無真實 IME,真實 IME(注音/倉頡)仍待作者實機確認。

## 2026-10-08 — 搜尋面板返工二(PR #23 審查修復)

## 2026-10-08 — 評測案例返工二(PR #25 第二輪審查)

- **#1(Minor)快照接線修正缺回歸驗證**:原先只斷言總結果不合格,但沒有提案本來就會讓總結果不合格,換回錯誤快照仍會通過。修法:在 `TestEvalJudgeWithScriptedLLM` 第二情境的 Ask 事件 callback 中受控改寫 `dir2` 的虛構 fixture(測試直接寫檔,不經模型工具;G1 限制的是模型工具,不是測試),並單獨斷言「檔案未被改動」這一項檢查失敗且詳情列出被改檔案,不只看總結果。**破壞驗證**:把 `before2` 的快照時機換回 Ask 之後(舊錯誤接線)→ 「應抓到檔案未被改動失敗」斷言轉紅(證實舊接線確實假通過);還原 → 全綠。
- **#2(Minor)LIVE_EVAL 判定表與實作不一致**:改為逐項列出各情境實際啟用的硬檢查——「設定衝突」不要求提案,只列「檔案未被改動 · 提案原文逐字複製(若有提案)」;報告模式列「不得建立提案 · 檔案未被改動」,不再同時出現矛盾的「指定文件有提案」。
- **驗證**:`go vet ./internal/agent` 通過;`go test ./internal/agent -count=1` 全過;整合測試(PERKINS_EVAL_INTEGRATION=1)通過。未再實跑模型。

## 2026-10-08 — 評測案例返工(PR #25 審查修復)

- **#1(Major)錯誤目標的提案也能通過**:`RequireProposal` 只看提案數量,原文檢查又跳過 `Target != DocPath` 的提案,模型只改附件 Canon 沒改稿件仍判通過。修法:`judgeCase` 新增「指定文件有提案」硬檢查(需要提案時必須對 `DocPath` 有提案),原文逐字改用路徑 → 內容對照表(`docTexts`)依各提案**實際目標檔**驗證;live runner 會讀取每個提案目標檔的內容,讀不到視為不合格。補單元測試:只有錯誤目標 → 不合格、混合目標 → 照各目標驗。**破壞驗證**:拿掉「指定文件有提案」檢查 → `TestEvalJudgeCase` 的「只有錯誤目標的提案應不合格」轉紅;還原 → 全綠。
- **#2(Major)字串條件不能當語意硬判定**:伏筆情境「羅盤宛如舊時代的遺物」(比喻,沒洩漏)會誤判失敗,「羅盤裡刻著他失聯孩子的姓名」(換說法洩漏)反而通過;敘事意圖情境「小嵐留好傘,我踏進書店」改了視角也抓不到。修法:把伏筆與敘事意圖的字串條件從硬判定改成 `ScanHints`——只記錄在報告的「字串提示」列供人工檢索,不影響 Pass;`docs/LIVE_EVAL.md` 改為明說字串提示「未出現不代表沒有洩漏、不能證明意圖未變」,人工檢查以語意為準。**破壞驗證**:把提示改回硬判定(突變)→ 「字串提示不得影響硬判定」斷言轉紅;還原 → 全綠。
- **#3(Minor)整合測試未設 live 開關也寫檔**:`TestEvalJudgeWithScriptedLLM` 改為 opt-in(`PERKINS_EVAL_INTEGRATION=1`),skip 訊息與 `docs/LIVE_EVAL.md` 明說它只寫進 Go 測試的 `t.TempDir()`(測試結束自動清除),不寫其他位置;純判定測試(`TestEvalJudge*`,不寫任何檔案)預設執行。**驗證**:預設 skip、設環境變數後跑且通過。
- **#4(Minor)第二個整合情境快照假通過**:原本丟棄 `a2` 的目錄、before/after 都在 Ask 之後取自第一個情境的目錄,檔案變更偵測永遠空轉。修法:保留 `dir2`,在 `a2.Ask` 前後分別對 `dir2` 取快照。**說明**:透過 scripted LLM 無法真的讓 agent 在 Ask 中途改檔(G1 設計上無寫入路徑),檔案變更偵測本身的正確性由 `TestEvalJudgeFileChange` 與破壞驗證 1(快照不一致 → 不合格)涵蓋。
- **驗證**:`go vet ./internal/agent` 通過;`go test ./internal/agent -count=1` 全過(實機測試 skip、整合測試 opt-in)。依指示未再實跑模型。

## 2026-10-08 — Perkins Bot 評測案例(SPEC §16 第 22 項)

- 新增 `app/internal/agent/live_eval_test.go`:6 個固定情境(角色口吻、設定衝突、伏筆不可擅自補完、改寫不改變敘事意圖、提案原文逐字複製、報告模式不提案),每情境一個子測試,以 `PERKINS_LIVE_MODEL` 啟用(本機 LM Studio),平常 skip。情境資料為自行撰寫的小型虛構作品(海邊小鎮)。
- 判定分兩層(`eval_test.go`):程式可確定的(檔案快照未改、有無提案、提案原文逐字存在於文件、改寫含/不含指定字串)寫成斷言;主觀項(口吻、氛圍、是否指出衝突)只記錄輸出供人工比對,不寫成會隨機失敗的斷言。每個情境結束都比對檔案快照,不得未經提案改動任何檔案。
- 每次執行把結果(判定、工具呼叫、提案、完整回覆)寫成 Markdown 報告到 `PERKINS_EVAL_OUT` 指定路徑,未設定就 `t.Log`;說明文件在 `docs/LIVE_EVAL.md`。
- **驗證**:`go vet` 通過;判定邏輯有不需要模型的單元測試(`TestEvalJudge*`,用假 LLM/假資料驗證:原文不逐字→不合格、檔案被改→不合格、改寫寫出伏筆→不合格、需要提案而沒提案→不合格、正常提案→合格),並做破壞驗證(故意給壞輸入確認判定會抓到);未設環境變數時 `go test ./internal/agent` 全過且實機測試 skip。
- **實跑**(一次,`qwen3.6-35b-a3b-apex`):6 情境全部通過程式判定(約 5.5 分鐘)。值得注意:設定衝突情境中模型照指示提案但在回覆與假設中明確標出與 Canon 矛盾(「小雨不會游泳、怕水」),供作者審核——屬人工比對項,報告見 scratchpad。逐字複製情境中模型把半形逗號「修正」為全形,但提案原文仍逐字(原文含半形逗號),判定正確通過。

- **#1(Major)面板顯示與實際取代條件不同步**:`openSearchPanel` 等內建流程會用 `setSearchQuery` effect 帶入新條件(例如回編輯器選取「天」再按 Ctrl+H,實際 query 變成「天→空」),自訂面板的 `update()` 沒處理,會顯示舊條件(森林→樹林),作者按「全部取代」實際卻刪「天」。修法:`update()` 掃 transactions 的 effects,`setSearchQuery` 且不等於目前 query 時呼叫 `setQuery()` 同步兩欄與比對數。**回歸檢查**:面板開著輸入「森林→樹林」→ 回編輯器選取「天」(TreeWalker 找文字節點,行內文字包在 highlight span 裡,不能用 `.cm-line` 直接子節點找)→ Ctrl+H → 斷言面板顯示「天→空」、比對數 1/1、選取高亮在「天」→ 全部取代後文件確實移除「天」且走正常 dirty → 存檔流程。**破壞驗證**:拿掉 update() 同步 → FAIL,症狀與審查描述一致(synced=森林/樹林/2/2,sel=天);還原 → PASS。
- **#2(Major)IME 防護不足**:keydown 只看 `e.isComposing`,漏掉 `this.composing`(旗標)與 `keyCode===229`(IME 轉送邊界)的組字按鍵,搜尋欄會跳下一筆、取代欄可能誤取代、Escape 會誤關面板。三條件合併防護,直接 `return` 不 `preventDefault`(不影響正常 IME 輸入)。
- **#3(Minor)e2e IME 檢查假通過**:舊檢查提交的值與原 query 相同、CDP key 用 `key:'Process'` 進不了 Enter 分支、只看捲動與 input 值。重寫:(a) 合成 `InputEvent(isComposing: true)` 驗組字中途不提交,提交後改用與原 query **不同總數**的字(森林 total 2 → 雷恩 total 1)斷言 `1/1` — 若用「營火」(total 也是 2)提交前後都是 1/2,阻止提交進處理器時仍會假通過;(b) CDP `imeSetComposition` 會發**真實** composition 事件(旗標生效),`key:'Enter'`+keyCode 229 驗 Enter/Escape 都不動作(比對數/捲動/文件不變、面板未關);(c) CDP 提交同樣用「雷恩」,斷言值、比對數 `1/1`、**唯一高亮就是雷恩那筆**(`.cm-searchMatch`,Enter 前不會有 selected)、文件不變、組字結束;(d) 組字結束後一般 Enter(keyCode 13)恢復,選取與高亮仍在雷恩比對(`1/1`)。**破壞驗證**(兩輪):(1) 拿掉 keydown+input 防護 → 組字中途立即提交(mid='0')、229 Escape 關掉面板(IME 檢查 FAIL);(2) 讓提交進不了 handler(input/compositionend 不呼叫 commit)→ 兩項提交檢查 FAIL — CDP 項抓到 value 累成「森林雷恩」但 count=0、無高亮(事件有到、提交沒生效);還原 → 全綠。
- **環境陷阱(重要)**:CDP 模擬的 composition 事件**不會觸發 `on*` 屬性 handler**(addEventListener 會),實測 `input.oncompositionend` 有指派、事件有到 input,handler 卻沒被呼叫。面板的 input/composition 事件改用 `addEventListener` 掛(keydown 維持 property,實測正常);這同時讓 CDP 路徑與真實瀏覽器行為一致。另外合成 `CompositionEvent` dispatch 也不會觸發 property handler,組字旗標的防護只能靠真實(CDP)composition 事件驗,無頭環境無法模擬「真實 IME 組字中按一般鍵」的情境。
- **驗證**:`tsc --noEmit`、`npm run build` 通過;E2E(E2E_SKIP_AI=1)**329/329 passed,略過 8 項**。真實 IME(注音/倉頡)仍建議作者實機確認。

## 2026-10-08 — 編輯器搜尋/取代 + 右鍵選單改名(SPEC §16 第 13 項、第 24 項第一層)

- **右鍵選單改名**:「詢問 AI…」→「詢問 Perkins Bot…」(`Editor.tsx`);ChatWindow 空白狀態提示引用的文字一併更新。E2E 沒有比對舊字串的檢查,不需改。
- **搜尋/取代 v2(PR #23 返工,自訂面板)**:初版直接用 CodeMirror 預設面板,像 IDE 且 640 寬折成四排壓掉編輯區。改為自訂 `PerkinsSearchPanel`(`search({top: true, createPanel: view => (activeSearchPanel = new PerkinsSearchPanel(view))})`),兩列設計:
  - **搜尋列(單排,永遠顯示)**:搜尋輸入框、上一個/下一個(ChevronUp/Down 圖示鈕,含 title/aria-label)、比對數「目前第幾個/共幾個」(用公開的 `SearchQuery.getCursor` 掃全文計算,`update()` 在 docChanged/selectionSet 時即時更新,上限 10000)、「取代」切換鈕(aria-expanded)、「×」關閉。
  - **取代列(預設隱藏)**:Ctrl+H 開面板並展開聚焦「取代為」欄(searchKeymap 沒有取代快捷鍵,自訂 Mod-h),或點「取代」切換鈕;含取代輸入框、取代、全部取代。取代走一般編輯流程:dispatch → onChange → dirty → Ctrl+S 落盤。
  - **移除預設面板的核取方塊**:區分大小寫/正規/整詞不做(整詞對中文無意義,正規與大小寫非小說作者常用)。仍保留 query 的預設能力(未用到的 caseSensitive/regexp 欄位保持預設值)。
  - **IME 防護**:輸入框 `oninput` 同時檢查 `compositionstart/end` 旗標與事件的 `isComposing`(雙重防護);組字中途不提交 query,`compositionend` 才提交;面板 keydown 對 `isComposing` 的按鍵(含 keyCode 229 的 Enter)不觸發 findNext/close。
  - **樣式陷阱(沿用)**:CM baseTheme 的 `.cm-button` 帶 background-image 漸層,會蓋掉 background-color,按鈕需 `backgroundImage: 'none'`。比對高亮(`.cm-searchMatch*`)用 `--selection` token。
  - **實作細節**:面板用小 `h()`/`searchBtn()` helper 建立原生 DOM(crelt 未安裝);`main-field` 屬性維持在搜尋欄(讓 CM 的 openSearchPanel 自動聚焦邏輯運作);`onmousedown preventDefault` 讓圖示鈕不攝走輸入框焦點。
- **E2E 17 項檢查**(e2e.js「搜尋/取代」段,依新介面改寫):Ctrl+F 開面板聚焦(中文 placeholder)、面板精簡(0 個核取方塊)、Enter 選取比對並高亮、比對數「1/2」、Escape 關面板(先確認面板開著)、預設收起取代列、切換鈕展開/收起取代列、Ctrl+H 聚焦「取代為」並展開、全部取代後內容改變、dirty 徽章、磁碟落盤、640×672 收起單排(panelH≤40)、展開取代兩排(panelH≤61≤76,兩次量測都無水平捲軸、無裁切、×可按)、IME 組字中不更新比對數(isComposing 略過)、組字中 Enter 不捲動(CDP 229)、提交後收到完整字串。**破壞驗證**:拿掉 `search()`+`searchKeymap`+Mod-h → 17 項全 FAIL;還原 → 全綠(只拿掉 `search()` 不夠,`openSearchPanel` 會用 appendConfig 自裝擴充)。
- **E2E 陷阱(沿用+新增)**:Playwright 對 CJK 用 insertText(無 keyup),自訂面板已改 oninput 不受影響;面板會保留上次 query,輸入前三連擊全選;640 段前要先 Escape 關掉上一段遺留的開著面板(取樣基準才乾淨);CDP `imeSetComposition` 在無頭環境不發 composition 事件(值直接改)+「組字中不提交」無法用 CDP 驗,改用合成事件(`InputEvent` isComposing/`CompositionEvent`)直接驗防護邏輯。
- **驗證**:`tsc --noEmit`、`npm run build` 通過;E2E(E2E_SKIP_AI=1)**326/326 passed,略過 8 項**。截圖(`shots/`,兩主題+640 都看過):`65-search-panel-dark.png`、`66-search-640-dark.png`(收起單排)、`66-search-640-dark-replace.png`(展開兩排)、`67-search-dark-1280.png`、`68-search-light.png`。
- **未驗證**:真實 IME(注音/倉頡)組字:無頭環境 CDP 不發 composition 事件,「組字中不提交」以合成事件驗證防護邏輯,建議作者實機確認一次。Ctrl+F 僅在編輯器聚焦時作用(CodeMirror 慣例;焦點在其他面板時不會轉發,轉發需改 Workspace.tsx,依指示未碰)。

## 2026-10-07 — PR #19 返工:設定頁 640 寬三欄並排壓爆表單

- **#1(Major)設定頁「AI 模型」「平台輸出」640 寬不可用**:上一輪只消了水平捲軸,但導覽(200)+清單(220)+表單三欄並排把表單壓到約 148px——模型輸入框 clientWidth 只剩 24px(看不到模型名)、下拉文字被截、開關標籤擠成兩行;無水平捲軸 ≠ 可用,違反驗收 (c)。修法(`SettingsPage.tsx`):兩個分頁的清單欄/表單容器改 `grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)]`——lg(1024px)以下(含 640/768/960 驗收尺寸)清單與表單上下堆疊、表單滿寬;1280 維持並排。左導覽 200px 不動(640 寬內容區約 392px,堆疊後不需收成圖示)。
- **#2(Minor)SPEC 矛盾**:§17.1 窄寬度工具列驗收原文「900×600、側欄與資訊欄都展開」與互斥規則衝突(≤960 兩欄不可能同開)。改為目前可達的最窄常態「640×672 側欄開、資訊欄自動收、main 約 308px」,工具列/狀態列退化要求不變,補 900×600(側欄開、資訊欄收,main 約 568px)落圖示段;設定頁 bullet 由「148px 仍可操作」改為堆疊版面與控制項 ≥200px 的要求。
- **回歸檢查(E2E 新增 7 項,640×672)**:模型輸入框 clientWidth=390(修改前 24)、所有可見 input/下拉觸發器可用寬度 ≥ 200(實測 270–392)、下拉值不被截斷(scrollW ≤ clientW,實測 0 個截斷)、外層 grid 單欄(上下堆疊)、models/platforms 內容區無水平捲軸。**破壞驗證**:拿掉堆疊(git stash)→ 紅燈:urlW=146、最窄控制項 26px、外層 grid 找不到 lg:grid-cols(cols=0),主要斷言全部 FAIL;放回 → 綠燈:urlW=390、cols=1。驗證中另抓到自己檢查的選擇器錯誤:`url.closest('div.grid')` 抓到 Field 內層 grid(永遠單欄,檢查永遠通過),改為沿父層找含 `lg:grid-cols` 的外層容器。
- **驗證**:`go test -count=1 ./...` 全過(11 套件);`npm run build` 通過;E2E(E2E_SKIP_AI=1)**308/308 passed,略過 8 項**。設定頁三頁在 640×672/768×728/960×1040/1280×800 全部重拍無溢出;1280 並排版面不退步。
- **截圖**(scratchpad `halfscreen-shots/rework19/`):settings-{models,project,platforms}-{640x672,768x728,960x1040,1280x800}.png 共 12 張。
- **返工二(Hemingway)**:「下拉選單值不被截斷」檢查原停在 AI 模型頁——那頁沒有 `button[role=combobox]`,truncSel 恆 0、永遠通過(空轉)。移到平台輸出頁:先斷言找得到下拉(selCount ≥ 1,實測 2),再比較值文字自身 scrollWidth/clientWidth(值 span 是 inline、clientWidth 恆 0,量測時暫轉 inline-block 後還原)。**破壞驗證**:頁面內把下拉寬度壓到 48px → truncated=2、檢查 FAIL;還原 → truncated=0、PASS。E2E(E2E_SKIP_AI=1)309/309。

---

## 2026-10-07 — 半螢幕並排支援(SPEC §16 第 7 項)

- **修改前量測**(640×672,側欄+資訊欄都開):圖示列 60+側欄 272+資訊欄 280=612px,主編輯區只剩 **28px**(768 時 156px、960 時 348px);工具列內容右緣 226 超出可視 32px、狀態列 172/32、CodeMirror 114/28,全部被擠爆——這就是回歸檢查要抓的根因。設定頁 640 寬 AI 模型頁內容區溢出(sw472/cw440)、平台輸出頁(sw556/cw440)。書櫃、標題欄(三顆按鈕右緣恰貼視窗右緣)、Perkins Bot 浮窗(初始位置在視窗內、拖到最上停 y=32)、版本/摘要對話框(640 寬全寬不溢出)修改前即正常,未動。
- **main.go**:`MinWidth` 900→640(`MinHeight` 維持 600);SPEC §17.1 兩處「最小尺寸 900×600」同步改。
- **側欄/資訊欄互斥**(`Workspace.tsx`):門檻訂為視窗寬 ≤960px(1920×1080 縮放 100% 的半邊、驗收尺寸上限;此範圍兩欄同開主編輯區最多剩 348px@960、28px@640)。`resize` 事件記 `vpW`:由 >960 縮到 ≤960(或初始就在窄寬度)且兩欄都開→自動收資訊欄(側欄是主要導覽,先保住);窄時手動開側欄自動收資訊欄、反之亦然(手動開關一律有效);變寬後不自動重開。實作陷阱:不把 `setPanel(null)` 包進另一個 `setInspector` 的 updater(不保證執行,實測踩過——E2E 側欄未收),改在 onClick 內依當下狀態直接判斷。
- **設定頁 640 寬溢出根因**:`<input>` 固有 min-content(約 204px)沿巢狀 grid 的 auto track 一路上推——`grid-cols-[220px_1fr]` 的 1fr 欄、`Field`、`Input` 都沒有 `min-w-0`;另外 models「儲存/刪除端點」與 platforms「儲存/恢復內建預設」按鈕列(`flex` 不換行)min-content 分別 204/288。修法:`Input`/`Textarea` 加 `min-w-0`、兩處 `grid-cols-[220px_minmax(0,1fr)]`、`Field` 加 `min-w-0 grid-cols-[minmax(0,1fr)]`、platforms 兩欄 `lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`、models 表單 `grid-cols-[minmax(0,1fr)]`、兩個按鈕列加 `flex-wrap`、模型輸入列 Input 加 `min-w-0 flex-1`。修完 640 寬三頁內容區 sw=cw=440 無溢出。
- **E2E**(`app/e2e/e2e.js`):改寫窄寬度區段——原本以「900×600 兩欄都開」為前提,新行為下 640–960 兩欄互斥,該情境不再存在;改為 640×672 側欄開(資訊欄已自動收):標題欄三顆視窗鈕完整、互斥成立、main=308≥300、整頁無水平捲軸、工具列 tight(「更多」選單含摘要/版本/複製到平台且可觸發)、徽章單行、麵包屑截斷、狀態列不溢出且模型名截斷;手動開資訊欄自動收側欄(main=300)再開側欄自動收資訊欄;900×600 圖示化退化+互斥仍成立;1280×800 完整標籤+不自動重開資訊欄。Notion 匯入表格加 640 寬檢查。選擇器陷阱:Inspector 根元素也是 `<aside data-testid=inspector>`,檢查側欄要用 `aside:not([data-testid=inspector])`。E1 崩潰段補開資訊欄並每個 area 重置寬度基準(補開本身會改寬度)。
- **破壞驗證**(獨立腳本 `break-verify.js`):修補在→互斥/主編輯區寬度/無水平捲軸/設定頁三頁無溢出全 PASS;拿掉 Workspace 修補→「兩者同時存在=true、main=28」FAIL;放回→PASS;拿掉設定頁修補(SettingsPage+basic.tsx)→「models sw472/cw440、platforms sw556/cw440」FAIL;放回→PASS。E2E 新檢查(301 項)每項都由這些修補支撐。
- **驗證**:`go test -count=1 ./...` 全過;`npm run build` 通過;E2E(E2E_SKIP_AI=1)**301/301 passed,略過 8 項**(AI 流程;提案/摘要等走模型的部分未跑,但本次無 AI 邏輯變更)。1280×800 經既有檢查+新檢查確認不退步。
- **截圖**(scratchpad `halfscreen-shots/`):修改前 `before/`、`before2/`、`before3/`(workspace 640 兩欄同開 main=28、titlebar、chat、versions、summary、settings×3頁、bookshelf);修改後 `after/`(同尺寸重拍,640 下資訊欄已自動收起);1280×800 確認 `after/workspace-1280x800.png`。
- **未實測/限制**:Notion 匯入表格 640 寬檢查在 E2E 內以 PickNotionExport 覆寫走流程(非原生對話框);實機 Win+←/→ 貼齊後的 WebView2 行為(含縮放 125%/150% 的 DPI)未在真實環境驗證;`e2e-proj` 重建後 wails dev 有重啟(避免 perkins.json 記憶體覆寫的已知陷阱)。

---
## 2026-10-06 — PR #17 第三輪返工:目錄安全與在途查詢補查

- **#1(Major,資料安全)E2E 刪除非本次建立目錄**:`e2e.js` 第二專案 B 改用 `fs.mkdtempSync(path.join(os.tmpdir(), 'perkins-e2e-b-'))` 唯一目錄,**絕不 rm 預先存在的 `PROJ-b`**;清理只針對本次建立的路徑(guard 目錄/檔案若非本輪建立就不動)。路徑統一正斜線(反斜線會讓 CSS 屬性選擇器的 `\` 跳脫失敗,卡片選擇器永遠匹配不到——實測踩過)。回歸(回歸#8):跑前預先建立 `PROJ-b` 並放檔案 → 跑完檔案仍在;紅燈=舊 rm 實作把整個目錄刪掉(check FAIL + 目錄消失)。
- **#2(Minor)舊世代 finally 清掉新世代 in-flight**:`types.ts` 把 `loading` 布林換成 `loadingGen`(在途查詢所屬世代)＋`pending` 旗標——只有「目前世代且仍持有該請求者」才能清 in-flight/補查;舊世代 finally 不動新世代狀態;在途期間收到的刷新記 `pending`,完成後再查一次(不丟棄);`setCategoriesProject` 切作品時重置持有權與 pending;掛載時只判 `!loaded`(在途由 pending 自行補)。
- **驗證方式與紅燈證據(回歸#9,可控 Promise)**:E2E 用一次性 `EntityTypes` 覆寫(call1=A 掛起回陳舊內建清單、call2=B 掛起回「缺乙新增」的陳舊清單、其後走原函式)編排完成順序:A 在途 → 切 B → **釋放 A(舊回應先回)** → B 清單變更(在途加「乙新增分類」)→ **等待 1s 讓舊碼會啟的第二份查詢先落地** → 釋放 B(**陳舊回應最後到達**)→ 最終清單必須同時有「乙分類」與「乙新增分類」。**紅燈**:修補缺席(舊 `loading` 布林)跑兩輪——第一輪發現時序假設反了(新清單晚到),加 1s 等待後第二輪確定 FAIL(陳舊覆蓋新清單);綠燈 PASS。過程中另修一個我自己寫的選擇器 typo(`]` 多餘)與 mkdtemp 反斜線問題,均如實記錄。
- **驗證**:`go test -count=1 ./...` 全綠;`npm run build` 通過;E2E(E2E_SKIP_AI=1)**285/286**(回歸#8/#9 與既有全過,僅「複製到平台顯示結果」舊 flake——本分支無 PR #18 修正,照實記錄)。
## 2026-10-06 — PR #17 第二輪返工:刪除在途保護與分類快照綁定作品

- **#1 刪除在途可中斷(Major)**:`BiblePanel` 管理對話框加 `deleting` 狀態——在途時 `onOpenChange` 擋住 Esc/外點/關閉鈕(對話框是 modal,關不掉就擋住編輯與切檔)、確認鈕停用並顯示「刪除中…」;`Workspace.deleteCategory` 套用重讀內容前確認目前開啟的檔案仍是該路徑,不是就不套用;刪除成功但重讀失敗→**關閉目前檔案**(回到未選檔狀態)並拋錯提示作者重新開啟,舊 buffer 不得再存回已刪除的 type(此時無未存內容,刪除前已存檔)。
- **#2 分類快照跨作品沿用(Major)**:`panels/types.ts` 共用狀態綁定作品——新增 `setCategoriesProject(路徑)`,切作品時清空清單/錯誤/載入狀態並重查,`generation` 世代計數忽略上一作品的在途結果;`App.tsx` 在 tree 變化時以新綁定 `ProjectPath()`(作品路徑)同步綁定,同作品的 tree 刷新(同路徑)不重置。附帶:`notion.Apply` 對不認得的去處不再靜默 `continue`,列入略過報告並附原因(新 Go 測試)。
- **驗證**:`go test -count=1 ./...` 全過(notion 新測試:未知去處入報告);`npm run build` 通過;E2E(E2E_SKIP_AI=1)新增 4 項回歸:回歸#5(延遲 DeleteCategory 期間按 Esc/外點對話框仍在、確認鈕停用顯示刪除中)、回歸#6(覆寫 ReadFile 失敗→檔案關閉、磁碟 type 其他、提示重新開啟)、回歸#7×2(A→書櫃→B 後管理清單與 EntityHeader 只顯示 B 的分類;B 以 fs 建第二專案 + ListRecent 覆寫開卡,回程還原並重開 A)。**破壞驗證**:修補缺席先跑→4 項 FAIL(基線不受影響);完成後四項修補同時拿掉(對話框不擋關閉、不關檔、快取不綁作品、Notion 靜默略過)→4 項再度 FAIL(含 R6 診斷 `closed=false`、toast 無「重新開啟」)與 Go T-notion FAIL;還原後最終跑 **283/284** 全綠(除下述 flake)。
- **破壞驗證插曲如實記錄**:備份指令與破壞 edit 誤放在同一個平行工具區塊,備份到的是「已破壞」檔案,sha256 校驗因此自我循環(比對的是破壞檔)。發現後以四段精確反向 edit 還原(無 TEMP-BREAK 殘留、`go test`/`npm run build`/最終 E2E 全綠確認還原正確)。教訓:備份與破壞必須分開執行、校驗基線要在破壞前單獨完成。
- **已知 flake 如實記錄**:「複製到平台顯示結果」(既有檢查,讀到上一個「摘要已儲存」toast)本輪 6 次跑了 5 次失敗,即 PR #12 已記錄的時序問題;PR #18 已修正,本分支依指示不修。其中 green3 輪曾達 **284/284**。
## 2026-10-06 — PR #17 返工:Hemingway 審查四項修正

- **#1 刪除後編輯器寫回舊 type(Major)**:刪除改由 Workspace 協調(`Workspace.tsx` `deleteCategory`):按確認刪除先 `await save()`(序列化存檔迴圈,保存未存內容;失敗即中止、不動檔案),存檔成功才呼叫 `DeleteCategory`(快照因此含作者最新內容);完成後若目前開啟的檔案在受影響清單(`DeleteCategory` 改回傳路徑)內就從磁碟重載 text/latest/dirty 並 `reloadKey+1`,之後存檔不會把舊 type 寫回;確認對話框開著時編輯器被擋,未另加鎖。
- **#2 批次改型部分失敗(Major)**:`app.go DeleteCategory` 改「先備好全部新內容 → 逐一寫入 → 任一失敗回復已寫檔案」;回復失敗時錯誤列出受影響路徑與快照標籤/ID;清單改 `writeCategories` 暫存檔＋rename 原子寫入,清單寫入失敗同樣回復檔案;前端失敗分支 `reloadCats()+refreshIndex()` 畫面反映實際狀態。
- **#3 損毀清單被當空清單(Major)**:`loadCustomCategories` 只有 `os.ErrNotExist` 才回空;讀取/解析失敗回傳錯誤(`EntityTypes` 改 `([]string, error)`,JS 綁定型別不變);`AddCategory`/`DeleteCategory` 因此拒絕操作、不得覆寫原檔;管理分類顯示 `category-load-error` 並停用新增。
- **#4 清單不同步(Minor)**:`panels/types.ts` 改模組層級共用狀態(訂閱/通知),所有 `useCategories` 消費者共用一份清單,新增/刪除後全部重讀——已開啟的 EntityHeader 類型選單立即更新(SelectTrigger 加 `entity-header-type` testid)。
- **SPEC §12.2**:自訂分類新增「健壯性」四點(刪除前先存檔、批次原子、損毀不當空、清單同步)。
- **驗證**:`go test -count=1 ./...` 全過(新增 #2a 第二檔失敗回復/清單寫入失敗回復/損毀不覆蓋 + 既有測試適配 `DeleteCategory` 回傳路徑);`npm run build` 通過;E2E(E2E_SKIP_AI=1)**280/280 passed,略過 8 項**(新增回歸#1、#4)。**破壞驗證(各自紅燈)**:①修補缺席先跑 → 回歸#1、#4 FAIL(基線不中斷);②Go 紅燈先寫 → 第二檔失敗未回復、損毀被覆寫成 `["新分類"]` 兩項 FAIL(對舊實作);③完成後四項修補同時拿掉(rollback 改 no-op、損毀當空、不存檔不重載、不訂閱共享通知)→ #2a/#2b/#3 Go FAIL + 回歸#1/#4 E2E FAIL,還原後三檔 sha256 與綠燈輪完全吻合。如實記錄:「複製到平台顯示結果」在 red/green 各失敗一次(PROGRESS #12 已記錄的既有時序 flake,與本次無關),重跑後 280/280。

## 2026-10-06 — 設定集自訂分類(SPEC §12.2 / §16 第 9 項)

- **規則**(SPEC §12.2 新增「自訂分類」、§16 第 9 項標已完成):清單存作品內 `.perkins/categories.json`;自訂可刪、內建(角色/地點/勢力/道具/名詞/其他)不可刪;刪除仍有設定檔的分類先確認(告知幾個檔案改歸「其他」)→ 自動快照(G3,reason=`before-delete-category`)→ frontmatter `type` 改「其他」(name/aliases/本文不動、檔案不刪),快照失敗就不動檔案;名稱去空白、非空、不與既有分類或大綱/筆記/略過重複、不含路徑字元。AI 工具白名單不變(G2/G4)。
- **後端**(`app/app.go`):`AddCategory`/`CategoryUsage`/`DeleteCategory` 綁定,`EntityTypes` 改回內建+自訂;`notion.Apply` 與 `targetDir` 增加 `types` 參數,`NotionApply` 傳 `a.EntityTypes()`(Notion 匯入 Go 端驗證放行自訂分類)。新測試 `app/categories_test.go`(6 個)+ `notion_test.go` 兩個(targetDir/實際建檔),既有 5 處 Apply 呼叫補參數。
- **前端**:`panels/types.ts` 移除寫死的 `TYPE_ORDER`,改 `useCategories()`(EntityTypes 取清單,回傳[清單, reload]);BiblePanel 頂列加「管理分類」入口(清單+新增+刪除確認對話框,testid: manage-categories/category-list/category-name/category-add/del-cat-*/category-confirm/-go),分組加 `group-*` testid、自訂分類用 Folder 通用圖示、新增設定的類型選單吃 cats;EntityHeader 類型選單、NotionImport TARGETS 與猜測清單同源(NotionImport 只換資料來源,JSX 版面未動)。
- **驗證**:Go 新增測試涵蓋新增/重複與非法名稱拒絕/不可刪內建/刪除有檔分類(先快照+改歸其他+名稱本文其他欄位全保留)/無檔直刪不建快照/Usage 計數/Notion 接受自訂分類——`go test -count=1 ./...` 全過;`npm run build` 通過;E2E(E2E_SKIP_AI=1)**278/278 passed,略過 8 項**。**破壞驗證**:新 10 項流程檢查在修補缺席(現況)全數 FAIL 且不中斷基線(268/278),套用後全綠——每項新檢查都有對應的紅燈證據。截圖 `80-manage-categories`、`81-sidebar-custom-category`(scratchpad `categories/`)。
- **如實記錄**:E2E 截圖驗證時發現影像傳輸快取會錯置(同一 read 序列回傳舊圖),以檔案 sha256+像素亮度比對+裁切重讀確認兩張截圖內容正確。

## 2026-10-06 — 修正 Notion 匯入展開後排版錯亂(SPEC §16 第 8 項)

- 根因:展開後的逐頁清單渲染在「匯入為」那一欄(`w-40`)的儲存格裡,清單列(頁名＋`w-44` 選單)比欄寬寬,自動表格版面因此重新分配欄寬:「匯入為」欄被撐大、「頁數」欄標題被擠成直排、資料夾列被撐高。
- 修正(`NotionImport.tsx`):逐頁清單移到資料夾列下方的獨立整列(`colSpan=3`);表格改 `table-fixed`,「頁數」「匯入為」欄寬固定。
- 審查修補(Hemingway):長資料夾名稱在固定欄寬下仍會溢出第一欄;資料夾按鈕改 `w-full min-w-0`、名稱 `truncate` 並以 `title` 保留全名。新增 900×600 長名稱(120 個 A)檢查,拿掉截斷時 FAIL(名稱右緣 1347 > 頁數欄 623),放回後通過。
- 附帶修正既有的 E2E 時序問題:`複製到平台顯示結果` 會讀到上一步「摘要已儲存」的通知;改為等「已複製」通知出現再讀。修正後連跑兩次 271/271。
- 驗證:E2E(`E2E_SKIP_AI=1`)271/271,略過 8 項。新增 2 項版面檢查(清單不在「匯入為」欄內、清單佔整列寬度),換回舊元件時兩項皆 FAIL(清單左緣與選單同為 1048、寬 238),放回後通過。測試資料頁名較短,舊版在此資料下未出現「頁數」直排,故不以它當檢查。

## 2026-10-06 — 設定頁改為左側導覽版面

- **重現與根因**(作者回饋「非最大化視窗時設定頁排版有問題」;現況圖 8 張在 scratchpad `settings-prefix/pre-*.png`):以 E2E 環境量測 900×600 / 1280×800,三項根因全部量化:(1) 設定頁根節點 `overflow-y-auto` 是整頁捲軸——捲軸貼在視窗右緣、捲動連頁首一起跑(作品頁 774>568 @900、774>768 @1280;模型頁 646>568、平台頁 783>568 @900);(2) 外層 `max-w-5xl px-10` 與內層 ProjectTab `max-w-3xl` 不一致且內層未置中——內容靠左、右側大片空白(左右間距 40/92 @900、168/344 @1280,差 52/176);(3) 研究記錄 `mt-6` 疊在容器 `gap-8` 上——區塊間距 56px。
- **改版**(`app/frontend/src/SettingsPage.tsx`):根節點改 `flex flex-col overflow-hidden`(頁首＋左右兩欄,根節點不滾);左側 200px 導覽欄 `settings-nav`(作品/AI 模型/平台輸出,沿用 `tab-project`/`tab-models`/`tab-platforms` testid,選中態 `aria-current`＋`bg-accent`);右側 `settings-content` 為 `overflow-y-auto` 獨立捲動,內部單一 `mx-auto max-w-5xl` 置中;作品頁改三個有小標題的區塊(基本資料 h2、研究記錄、Notion),單一 `gap-8` 不再 `mt-6` 疊加,封面＋欄位 `flex-wrap` 窄寬度不重疊;平台頁內層改 `grid-cols-1 lg:grid-cols-2`(900 寬不擠);「外觀」頁取消,夜間書房/白紙改成導覽欄底部兩顆常駐小按鈕(任何頁面可見,`SetTheme` 保存)。預設頁維持 AI 模型;未開作品時無作品頁。E2E 6 處「先點外觀頁」步驟隨設計刪除(其後的白紙/夜間書房點擊與其餘流程原樣保留)。
- **SPEC**:新增 §17.2(版面與導覽、三頁與合併、主題切換、間距單一來源、封面換行、7 條驗收、修正過的排版問題與量測值)。
- **驗證**:`npm run build`、`go test ./...` 通過;E2E(E2E_SKIP_AI=1)**268/268 passed,略過 8 項**(既有 249 項含調整後的主題流程全過)。新增 19 項版面檢查。**破壞驗證(三輪證據)**:①修補缺席(現況)→ 9 項 FAIL(根節點 646/783/774>568、gap=56、diff=52/176、無導覽欄、作品頁看不到主題按鈕、1280 作品頁 774>768);②合成注入 `min-w-[900px]` 人為製造水平溢出 → 「水平捲軸×3(sw900>cw700)、元素右緣越界、置中 diff=200」共 5 項 FAIL,證明這兩類「現況本就符合」的不變式檢查非空轉;③還原後檔案內容與綠燈輪逐位元相同(`sed -i` 只把行尾 CRLF→LF,補回 CRLF 後 hash 完全吻合 f8180863…),綠燈截圖 6 張 hash 核對一致。**如實記錄**:19 項中 10 項(水平捲軸×6、右緣、封面不重疊、1280 模型/平台根節點)在現況即通過,屬守護新版面的不變式,由第②輪證明非空轉;根節點不滾/間距/置中/導覽/主題等 9 項由第①輪證明。
- **假設**:內容區滿寬時其捲軸像素位置仍貼視窗右緣(滿寬內容區的正常行為,同 VS Code 設定頁);作者問題的本質是「整頁跟著捲」,已改為只捲內容、頁首與導覽欄固定,已寫入 SPEC §17.2。主題切換做成兩顆常駐小按鈕(非下拉),因此 E2E 需移除「先點外觀頁」步驟。
- 截圖:修改後 6 張(scratchpad `settings-after/70–75`,倉庫內 `app/e2e/shots/` 同名)、現況 8 張(scratchpad `settings-prefix/pre-*`)。

## 2026-10-06 — 預設視窗 1280×800 與窄寬度工具列退化(PR #14)

- **預設視窗 1280×800 + 啟動時最大化判斷**(`app/main.go`):`Width/Height` 改 1280×800(`MinWidth/MinHeight` 900×600 不變);`OnStartup` 呼叫 `maximiseIfScreenTooSmall`——`runtime.ScreenGetAll` 讀螢幕,`primaryScreen` 取主螢幕(無 `IsPrimary` 退回第一個,空清單不動),`needsMaximise`(邏輯尺寸小於 1280×800 任一邊)成立才 `runtime.WindowMaximise`;讀不到螢幕就維持預設尺寸不失敗啟動。**已知限制**(已寫入 SPEC §17.1):Wails v2.12 的 `Screen` 只有螢幕尺寸沒有工作區(工作列)欄位,以主螢幕整體尺寸判斷。新測試 `app/main_test.go`(選主螢幕/退回第一個/空清單、1920×1080 與剛好 1280×800 不最大化、1366×768 與 1279×800 最大化)。
- **編輯區工具列窄寬度退化**(`app/frontend/src/Workspace.tsx`):工具列以自身 `ResizeObserver` 量寬(contentRect 不含 px-4),588/408 兩道門檻三段退化(完整文字 → 只剩圖示並保留 `title`/`aria-label` → 隱藏「摘要」「複製到平台」「版本」;「儲存」與資訊欄開關、狀態徽章必留);麵包屑 span 加 `min-w-0` 真的會截斷,最窄段只留章名(分隔號一併隱藏);徽章 `shrink-0 whitespace-nowrap`;工具列 `overflow-hidden`。900×600、側欄+資訊欄都開(主編輯區約 288px)時不再溢出資訊欄、徽章不再擠成直排、麵包屑省略號截斷且看得到章名開頭。E2E 新增 10 項(900×600/1100×800/1280×800 三種寬度,含「內容右緣 ≤ 資訊欄左緣」用所有可見後代的最大 right 量測,不被 overflow-hidden 的視覺裁切騙過);截圖 `60-toolbar-900x600`、`61-toolbar-1280x800`。
- 驗證:`npm run build`(tsc+vite)通過、`go test ./...` 全過(含新 `TestPrimaryScreen*`/`TestNeedsMaximise`)、`wails build` 通過;E2E(E2E_SKIP_AI=1)**242/242 passed,略過 8 項**。**破壞驗證**:先在工具列修補缺席時跑同一份檢查 → 6 項新檢查 FAIL 且原因正確(內容右緣 802>620 溢出 182px、徽章 38px 直排、麵包屑被擠到 w=0、標籤未退化、按鈕超出工具列右緣、icon-only 未觸發),既有 232 項全不受影響;套用修補後 242/242。
- **原生視窗實測**:標準 `wails build` 產物啟動後由應用回報 `ScreenGetAll`=1 主螢幕 2560×1440、`WindowGetSize`=1280×800、`maximised=false`(符合這台螢幕);暫把門檻改 3000×3000 重 build → `maximised=true`、視窗 2576×1408,證明最大化接線真的會執行,驗完已還原。**踩坑如實記**:`go build` 與實測 `wails build -o bin/…` 的產物缺少 `desktop,production` build tags,啟動只會彈「Wails applications will not build without the build tags」對話框、`OnStartup` 根本不會執行(先誤以為是尺寸 bug);原生驗證一律用標準 `wails build`。
- 當輪範圍外(截圖可見):900×600 時底部狀態列的「已儲存」等文字被擠成直排,第一輪未修;作者看截圖後要求同一個 PR 一併修,見下一條追加修正。
- **追加修正(PR #14 第二輪,同日)**:(1) 最窄段不再直接隱藏次要按鈕(功能不能消失):`Workspace.tsx` 新增「更多」(⋯)下拉(`data-testid=toolbar-more`,既有 DropdownMenu),收「章節摘要」「版本」與展開的平台清單;列上維持儲存、資訊欄開關、徽章,麵包屑在最窄段連檔案圖示一起讓位。(2) 底部狀態列修直排:footer 加 `overflow-hidden` 與 `data-testid=statusbar`,各項 `shrink-0 whitespace-nowrap`,模型名 `min-w-0 truncate`,最窄段省略「本卷」「全書」(「本章」與儲存狀態必留);1280 時全部項次恢復顯示。SPEC §17.1 驗收同步更新(窄寬度不得讓功能無法觸及、狀態列不換行不溢出)。E2E 新增 7 項(900 寬:狀態列「單行且不超出 main 右緣」、「保留本章/已儲存且模型名截斷」、更多選單「有按鈕/含三功能/開啟摘要/開啟版本/觸發複製」)。**破壞驗證**:修補缺席時 7 項全 FAIL(狀態列每項 h=48px 三行直排、`toolbar-more` 不存在);如實記錄:「不超出右緣」單獨成項時在破壞態因「改用直排而非水平溢出」而 PASS,與「單行」合併成一項後才 FAIL,故合併成一項。最終 E2E(E2E_SKIP_AI=1)**249/249 passed,略過 8 項**;截圖 60/61 重拍、新增 `62-toolbar-more-menu`(等開合動畫 300ms 後拍);`npm run build`、`go test ./...` 重跑通過。

## 2026-10-05 — PR #12 審查修補(第二輪)

- **(1) 救援原文改在失敗當下才取**:`lib/quitGuard.tsx:63`(catch 分支)重讀 `reg.rescue()`,不再用存檔前(流程開頭)的快照;存檔途中新打的字會出現在提示與「複製全文」。回歸測試 `(a4)`:用 `__perkinsSaveDelay` 把存檔停住 → 繼續打字 → 讓這輪寫入失敗(`__perkinsSaveFailOnce`)→ 提示原文與複製內容都含新打的字、未放行。破壞驗證:改回存檔前的快照 → `(a4) 存檔失敗時提示是最新文字` 與 `(a4) 複製全文也是最新文字` FAIL。
- **(2) 關閉提示改用 Radix Dialog**:`lib/quitGuard.tsx:76-129`(提示本體,含 `DialogPrimitive.Content` 與綁在內容節點上的 Escape 監聽)、`:143-155`(提示改由一個長命的獨立 React root 以一般 render 顯示/收起,同一時間最多一份)。Radix 會把新掛的 Dialog 當成最上層 focus scope 並暫停底下對話框的那層,焦點與 Tab 因此留在提示內;Escape 監聽綁在提示自己的內容節點(不靠 document/window 捕捉順序),按 Escape = 取消、不關視窗、不動底下對話框。回歸測試 `(g)`:開著版本對話框 → 觸發關閉且存檔失敗 → `document.activeElement` 在提示內、Tab 連續 6 次都在提示的按鈕/文字區間循環、Tab 可走到「仍要關閉」且 Enter 生效、滑鼠點「仍要關閉」也生效、Escape 收起提示且未呼叫 `ConfirmQuit`。破壞驗證:提示改回單層 fixed div(只有單次 `focus()`、無 Escape 處理)→ `Tab 只在提示內移動`(焦點被底下對話框搶回)與 `Escape 等於取消` FAIL。
- **順帶修掉一個真 bug**:提示先前用 `createRoot` + `root.unmount()` 收起,實測會留下 Radix portal 的內容(提示 DOM 不消失、舊實例的監聽疊著),例如按「仍要關閉」後再觸發關閉時,舊提示會把新的 Escape 吃掉。改成同一個長命 root 以 `render(null)` 收起後不再發生(E2E 連 4 輪提示循環全過)。
- 驗證:`go test ./...` 全過、`npm run build` 通過、`wails build` 通過、`app/frontend/dist` 無 `__perkins*` 開發鉤子;E2E(E2E_SKIP_AI=1)**232/232 passed,略過 8 項**。
- **如實記錄**:`複製到平台顯示結果`(既有檢查,與本次修改無關)在多次重跑中有時讀到上一個 toast(摘要已儲存),屬時序競爭,本次未動它。

## 2026-10-05 — PR #12 審查修補(第一輪)

- **(必修 1) 關閉存檔途中新增的文字**:`lib/quitGuard.tsx:55` 的關閉存檔改用 Workspace 既有的序列化存檔迴圈(`Workspace.tsx:194` 的 `saveAll`,即 `save()`:等在途存檔 → 再存最新版本 → 存完還在 dirty 再一輪),確認最新內容落盤才 `ConfirmQuit()`。崩潰救援(單次寫入)與關閉存檔分工寫在 `quitGuard.tsx:1-10`、`Workspace.tsx:183-186`。回歸測試 `(a2)`:用 `__perkinsSaveDelay` 把存檔停住、關閉途中繼續打字 → `ConfirmQuit` 當下磁碟已含新字(`(a2)` 三項)。破壞驗證:拿掉存檔迴圈的 `editVersion` 再檢查(`Workspace.tsx:161`)→ `(a2) 放行當下…`(disk=true,false)與 `(a2) 磁碟最後確實有新字` 都 FAIL(新字真的掉),另兩個既有 E5 檢查也 FAIL。
- **(必修 1,補) 在途存檔失敗不得被吞掉**:原本的緊急存檔 `await saveInFlight.catch(() => {})` 會吞掉在途寫入錯誤再補一次寫入就放行;現在錯誤直接傳到關閉提示。新增開發鉤子 `window.__perkinsSaveFailOnce()`(`Workspace.tsx:33-43` 的宣告與掛鉤、`:48-58` 的 `trackedSaveFile`,DEV-only)與回歸測試 `(a3)`:在途存檔失敗 → 出提示、帶實際失敗原因、救援原文含未落盤的文字、`ConfirmQuit` 未被呼叫。破壞驗證:把 `saveAll` 改回修補前的單次快照語意 → 恰好這 3 項 FAIL(其餘 220 項不受影響),證明 `(a3)` 才是區分新舊實作的檢查(`(a2)` 在該破壞下仍 PASS,已如實回報)。
- **(必修 2) 崩潰 + 緊急存檔狀態在 React 樹外**:`components/ErrorBoundary.tsx:55-101` 新增模組層 `crashSave`(`idle/saving/saved/failed` + 救援原文 + 失敗訊息)、`getCrashSave()`、`waitCrashSave()`、`startCrashSave()`;`componentDidCatch`(:177)改呼叫 `startCrashSave()` 並在 then 後讀狀態。關閉流程(`quitGuard.tsx:36-42`)先等 `saving` 結束,`failed` 就直接顯示同一份救援原文。回歸測試 `(e)`(進行中不放行,放行當下磁碟已是最新)、`(f)`(失敗 → 提示同一份原文、未 `ConfirmQuit`、取消後不重設再關閉仍重現、明確選仍要關閉才呼叫一次)。破壞驗證:關閉流程忽略崩潰狀態 → `(e)(f)` 8 項 FAIL。
  - 附帶修掉一個真 bug:先前 `componentDidCatch` 把「已處理過 rejection 的 promise」當成功(`p.then(ok, fail)` 的 `p` 必定 resolve),造成緊急存檔失敗時畫面顯示「未儲存的內容已存檔」;現在一律在 then 後讀 `crashSave.state`(`ErrorBoundary.tsx:186-192`),`E4 存檔失敗顯示目標路徑與原因` 等既有檢查因此回復。
- **(必修 3) Radix 對話框開著時的可點性**:`quitGuard.tsx:76-82` 提示加 `pointer-events-auto`、`z-[70]`,並把焦點移到提示(`box.current.focus()`);`TitleBar.tsx:45` 標題欄加 `pointer-events-auto`。E2E `(g)`:在版本對話框開著、且明確套用 `body { pointer-events: none }`(Radix modal 的行為)的條件下,用真實滑鼠 `page.click` 驗標題欄關閉鈕(以 `WailsInvoke` 替身計數)、提示焦點、複製全文、取消、仍要關閉全部有效;`(h)` 聊天浮窗拖到最上方停在 `TITLEBAR_HEIGHT`(32)且拖曳列完整可見可操作(`ChatWindow.tsx:295`、`lib/layout.ts`)。破壞驗證:拿掉兩處 `pointer-events-auto`、提示 z-index 降到 overlay 之下、拿掉焦點移動 → 這 6 項 FAIL(`promptPE/barPE` 由 `auto` 變 `none`,點擊被攔)。實測本機 Radix 版本開對話框時 body 並沒有 inline `pointer-events:none`(與審查者環境不同),因此測試改為明確套用該條件再驗,不依賴版本行為。
- **(建議 4) 取消後不再人工重設**:`quitGuard.tsx:21-31` 進場 guard 只在流程進行中鎖住,流程結束沒跳提示或按「取消」就解鎖;移除 `resetQuitGuard` 與 `window.__perkinsQuitReset`。`(b)(f)` 改為「取消後不重設任何旗標,直接再按關閉」,驗證提示重現、`ConfirmQuit` 次數、磁碟內容。破壞驗證:移除進場 guard + 取消不解鎖 → `(b)` 5 項 + `(c)` 1 項 FAIL(重複關閉會開第二份流程並把未存字寫下去)。
- **(建議 5) 聊天浮窗上界**與**(小事 6) 標題欄 logo 條件**:見上;標題欄 logo 改由外殼狀態 `lib/shellState.ts` 的 `railLogoVisible`(目前畫面看不見側欄 logo 才顯示)決定,`App.tsx:31` 維護、`TitleBar.tsx:22-29` 訂閱;新增檢查「設定頁(有開作品)有小 logo」「離開設定頁回到作品畫面後收起小 logo」。破壞驗證:logo 條件改回「沒開作品才顯示」→ 設定頁那項 FAIL。
- **(小事 7) 文件**:SPEC §17 第 280 行圖示來源改指向量版 logo;`outputfilename` 維持 `perkins`(產出 `perkins.exe`;`wails dev` 用 `perkins-dev.exe`)與顯示名稱分開寫。
- 驗證:`go test ./...` 全過、`npm run build` 通過、`wails build` 通過、`app/frontend/dist` grep 確認 `__perkinsCloseRequest`/`__perkinsCrash`/`__perkinsSaveFailOnce`/`__perkinsQuitReset` 等開發鉤子都不存在;E2E(E2E_SKIP_AI=1)**224/224 passed,略過 8 項**,新增 25 項檢查,6 輪破壞驗證(q0 修補前原版 → 188/192;迴圈/logo/浮窗 → 212/220;單次快照 → 220/223;崩潰狀態+pointer-events+焦點 → 207/220;防重入 → 218/224;標題欄/監聽進樹內 → 216/224;不存檔直接放行 → 184/189)。截圖沿用 `54-titlebar-min-900x600`、`55-quit-save-failed`、`56-titlebar-settings-logo`、`57-chat-dragged-top`。
- **尚未有破壞案例的檢查**(如實列出):`(a)(a2)(c)` 的「只呼叫一次 / 存檔進行中不呼叫 ConfirmQuit」等負向計數檢查,以及 `(e) 緊急存檔進行中不先放行`(其中一輪破壞曾 FAIL,但屬計時競態,已加 400ms 等待使其穩定);這些的對應正向檢查都有破壞驗證。
- **限作者實機確認**(無頭瀏覽器碰不到原生視窗):在存檔很慢的情況下(例如稿件所在磁碟擁擠)按 Alt+F4/工作列關閉,是否等到文字真的落盤才關;以及真 WebView 下「關著版本對話框時」彈出關閉提示的字型/層級觀感。前一節的實機確認項目(邊缘拖曳、雙擊/按鈕最大化、Windows 11 貼齊版面、900×600 版面)仍待作者確認。

## 2026-10-05 — 客製視窗標題欄、關閉前存檔保護與向量版 logo

- **向量版 logo**(`app/frontend/src/assets/images/perkins-logo.svg`,約 9 KB):金色遮罩用 vtracer 0.6.15 描邊、黑底圓角方塊依原稿 alpha 量測為 `x=103 y=135 w=1048 h=1002 rx=219.5` 直接畫 rect;只有兩色 `#000000` / `#FDB53D`。與原稿全尺寸比對:金色區域差 0.18%、透明度差 0.13%。側欄 `rail-logo` 改用 SVG,刪除 `perkins-logo.png`;exe 圖示不動。比對圖在 scratchpad(`logo-svg-compare.png`、`logo-svg-36px.png`、`logo-svg-20px.png`),截圖不進倉庫。
- **客製標題欄**(`app/frontend/src/components/TitleBar.tsx`,32px):`main.go` 改 `Frameless: true` + `MinWidth: 900 / MinHeight: 600`。左側顯示「作品名 — Perkins WritingSpace」,沒開作品時加 20px 小 logo(作品畫面已有側欄 logo 不重複);右側最小化/最大化(還原)/關閉,關閉鈕 hover 紅底白字。拖曳用 `--wails-draggable: drag`、按鈕 `no-drag`,雙擊切換最大化。標題欄掛在 `RootBoundary` 之外(`main.tsx`),錯誤畫面也看得到、關得掉。設定頁改 `top-8`,不再蓋住標題欄。
- **關閉前存檔保護**:`options.App.OnBeforeClose` → 未確認就回 true 阻止關閉並發 `perkins:close-request`;新綁定 `ConfirmQuit()` 設旗標後 `runtime.Quit()`,第二次 `OnBeforeClose` 放行。前端監聽在模組層(`lib/quitGuard.tsx`,React 樹外),沿用 `ErrorBoundary` 的緊急存檔;沒有未存內容或存檔成功 → `ConfirmQuit`;失敗 → 原地提示(路徑、原因、複製全文、仍要關閉、取消),不逾時放行。`setEmergencySaveFail` 現在由錯誤畫面與關閉流程共用(`runEmergencySave`)。
- **Wails frameless 查證**(v2.12.0):(1) `on` 邊缘縮放:前端在距邊界 6px 按下時送 `resize:<edge>`(`internal/frontend/runtime/desktop/main.js:138-139`、`:167-203`),Go 以 `WM_NCLBUTTONDOWN` + `HTLEFT/HTRIGHT/HTTOP/HTBOTTOM/HTTOPLEFT/...` 交給系統(`internal/frontend/desktop/windows/frontend.go:688-696`、`:740-752`、`:888-894`);frameless 只是用 `WM_NCCALCSIZE` 藏起標準邊框,`WS_THICKFRAME` 仍保留(`internal/frontend/desktop/windows/window.go` WM_NCCALCSIZE 註解),navigation completed 後自動設 `window.wails.flags.enableResize = true`(`frontend.go:909`)。(2) 雙擊最大化:**Wails 沒有內建**(runtime 的 mousedown 只在 `e.detail===1` 時拖曳,無 dblclick 處理),由前端自行呼叫 `WindowToggleMaximise`。
- 驗證:`go test ./...` 全過(含新增 `TestBeforeCloseBlocksUntilConfirmed`)、`npm run build` 通過、`wails build` 產出 `perkins.exe`;`app/frontend/dist` 已 grep 確認 `__perkinsCloseRequest`/`__perkinsQuitReset`/`__perkinsCrash` 等開發鉤子皆不存在(只剩真正的 `perkins:close-request`)。E2E(E2E_SKIP_AI=1)**197/197 passed,略過 8 項**;新增 26 項標題欄/關閉保護檢查,並以 6 輪破壞驗證(隱藏標題欄、寫死名稱、拿掉視窗鈕 testid、設定頁蓋住、logo 條件反轉、監聽改掛 App、存檔順序反轉、失敗也確認、拿掉防重入、寫錯檔、改用 window.confirm)確認會 FAIL。截圖:`50-titlebar-workspace-dark`、`51-titlebar-workspace-light`、`52-titlebar-settings`、`53-titlebar-bookshelf`、`54-titlebar-min-900x600`、`55-quit-save-failed`。
- **限作者實機確認**(無頭瀏覽器碰不到原生視窗):邊缘拖曳縮放、雙擊/按鈕最大化與還原圖示切換、拖曳移動、最小化、Alt+F4 與工作列右鍵關閉會走到存檔流程、關閉提示在真 WebView 下的字型/尺寸、900×600 時編輯器工具列與狀態列會折成兩行(1920px 等寬螢幕下不折)、Windows 11 貼齊版面選單已失效。

## 2026-10-05 — 品牌套用(新圖示、側欄 logo、改名 Perkins WritingSpace / Perkins Bot)

完成 SPEC §17 品牌與命名:

- **應用程式圖示**:以 `docs/perkins-icon-black-gold.png` 產出 `app/build/appicon.png`(1024×1024,保留透明)與 `app/build/windows/icon.ico`(Pillow 產生,內含 16/24/32/48/64/128/256 七個尺寸,非單一尺寸縮放)。16px 版筆尖會糊成一小塊(原稿細節過細),24px 以上可辨;未改造型,已回報。
- **側欄 logo**:`Workspace.tsx` 圖示列最上方的大寫 P 方塊換成 `app/frontend/src/assets/images/perkins-logo.png`(128×128 縮小版),維持 36×36,加 `alt` 與 `data-testid=rail-logo`;不再套 bg-primary/15。深淺主題下皆清楚。
- **改名**:視窗標題(`app/main.go`)、`app/wails.json` 的 `info.productName`/`productVersion`(0.2.0)、`app.go` 開啟資料夾對話框標題、`SettingsPage.tsx` 啟動說明改為 `Perkins WritingSpace`;AI 助手顯示名稱改為 `Perkins Bot`(`ChatWindow.tsx` 視窗標題與開啟按鈕 title)。泛指功能類別的「AI」字樣保留。內部識別(outputfilename、Go module、`%APPDATA%\Perkins`、`.perkins/`、`perkins.json`、keyring、`PERKINS_OPEN`、`window.__perkins*`)刻意不改。
- **`app/build/windows/info.json` 補字串表 `FileVersion` 與 fixed `product_version`**:Wails 預設模板缺 `FileVersion`,導致 .NET `FileVersionInfo`(PowerShell `(Get-Item).VersionInfo`)的 `GetVersionInfoForCodePage` 因 `_fileVersion` 為空而回傳 false,把 ProductName 等其他欄位一併清空;補上後 PowerShell 可讀到 ProductName/FileDescription/ProductVersion。
- 驗證:`go test ./...` 全過、`npm run build` 通過、`wails build` 產出 `app/build/bin/perkins.exe`(ProductName = Perkins WritingSpace)、E2E(E2E_SKIP_AI=1)**171/171 passed,略過 8 項**。
- E2E 新增 7 項品牌檢查(側欄 logo 是已載入的 img 且 36×36、開啟按鈕 title、AI 視窗標題深/淺色為 Perkins Bot、頁面不再出現「AI 助手」、淺色 logo 仍載入);破壞驗證:改回 P 字方塊 + 「AI 助手」→ 7 項全部 FAIL(169/171、164/171),還原後 171/171。截圖 `40-brand-rail-dark`、`41-brand-rail-light`、`42-brand-chat-title-dark`、`43-brand-chat-title-light`。

## 2026-10-05 — 長書名驗證改 render 真實元件(review-1b2,I 段)

- H4 的臨時 div 驗證移除(它不 render GeneratedCover,只取標籤的 computed style,封面修補被破壞仍會通過);E2E 改為:覆寫 `window.go.main.App.ListRecent` 回傳受控資料(`TheLastGallopAndTheForgottenKingdom` 與 `The Last Gallop and the Forgotten Kingdom`,路徑指向不存在的暫存位置、missing=true 不開啟;另置入真實作品卡供驗證後重開),回書櫃讓真實 Bookshelf/GeneratedCover render,分別核對兩種長名的封面 span(斷行兩行、與書脊線間距≥20px)與下方書名標籤(兩行內、不溢出)。找不到測試卡片即 FAIL,不退回短名、不跳過。
- 補拍 `32-1b-cover-zoom.png`(長名卡特寫)與 `38-1b-longname-covers.png`(兩筆受控長名+1 真實卡之書櫃全張,深色):無空白長名封面斷行兩行、書名標籤兩行省略、書脊線間距正常。
- 破壞驗證兩項各自成立:只移除封面的 overflow-wrap → 封面斷行檢查 FAIL(spanH 退回單行 17.9px,標籤檢查仍 PASS);只移除標籤的 overflow-wrap → 標籤檢查 FAIL(tagNoOverflow=false,封面檢查仍 PASS)。
- 不碰作者真實最近清單:只在頁面上覆寫綁定、結束前還原;settings.json 照常備份還原。
- 驗證:`go test ./...` 全過、`npm run build` 通過、E2E(E2E_SKIP_AI=1)**75/75 passed,略過 8 項**。

## 2026-10-05 — 第二批審查修補(review-1b,H 段)

- **回覆縮短子項取消**(作者決定):原本「新 pending 提案+最後 assistant 氣泡>80 字→覆寫成『已建立提案』」會吃掉模型回覆中的其他資訊(限制、未處理項目、其他答案),字數不是「重述」的判準;整個縮短邏輯(含 askStartProposals 標記)移除,回覆完整以 Markdown 呈現。
- **md-lite 區塊順序**(`lib/md-lite.tsx`):清單後遇到一般段落先結束清單(原先 intro→- item→closing 會被重排成 intro→closing→item;- first/paragraph/- second 的兩份清單會被合併)。單元測試補兩個順序案例與完整輸出順序斷言;E2E 的 Markdown 檢查改核對實際 DOM 有 strong/ul/li。破壞驗證:移除 flushList → 三項順序檢查 FAIL。
- **內層包框(review-1b 第 3 點)**:assistant 回覆去掉整塊背景氣泡,改左分隔線+留白;提案卡去外框/獨立背景,以上下分隔線分層;保留替換文字輸入框輪廓、diff-del/diff-add 紅綠提示、衝突時的警示文字;作者訊息保留輕量背景區分說話者。E2E 加 H3 檢查(computed background 透明、無 rounded-lg)。破壞驗證:改回背景氣泡 → H3 第一項 FAIL。
- **長單字書名**(`Bookshelf.tsx`):封面文字與書架列表書名標籤加 `overflow-wrap:anywhere`,無空白長英文名可斷行;封內文字容器改 pl-5 與書脊線(left-3)留間距。E2E 加 H4 檢查(長名卡間距≥20px、標籤不溢出、隔離 layout 驗證取實際 computed overflow-wrap 測 TheLastGallopAndTheForgottenKingdom 斷行)。破壞驗證:移除 anywhere → 隔離驗證 FAIL。
- 驗證:`go test ./...` 全過、`npm run build` 通過、md-lite 單元驗證 9 檢查 PASS、E2E(E2E_SKIP_AI=1)**73/73 passed,略過 8 項**。截圖 34-1b-chat-reply-dark、36-1b-chat-reply-light 已重拍(回覆無背景塊、提案卡無外框,深淺色)。

## 2026-10-05 — 介面打磨第二批(去 AI slop 的視覺問題,16/17/15/14/10/18)

完成 SPEC §16 第 1 項第二批(依設計審查 16、15、14、10、17、18,作者拍板):

- **16 書櫃首頁**(`Bookshelf.tsx`):移除大品牌標題、英文 eyebrow「Agentic Writing」與口號;改為左對齊小標題列(「我的書櫃」+「開啟資料夾」「建立作品」同列右側);最近作品提到首屏上方;書架層板改低對比分隔線。
- **17 自動書封**(`Bookshelf.tsx`、`style.css`):GeneratedCover 改單色底(hsl 依書名)+一條書脊線;移除漸層、金線、字影、複合內陰影;書名水平顯示、最多兩行(line-clamp-2);書架列表的書名標籤同樣兩行。`book-spine-shadow`/`shelf-plank` CSS 移除,SettingsPage 封面容器改用 border。作者自選封面圖不變。
- **15 陰影與包框**:浮窗(ChatWindow)、Dialog(overlay.tsx)shadow-2xl → shadow-lg;AI 圓鈕與 toast shadow-xl → shadow-md;Editor 浮動列/右鍵選單同級降級;預覽原始訊息取消訊息內包框,改分隔線分層。未新增顏色。
- **14 字級**(`ManuscriptPanel.tsx`、`Workspace.tsx` 等):移除 text-[10px]/text-[11px](全改 text-xs 12px 起跳);卷名獨立一行(13px 突出)、統計移到次行;章節字數定寬右對齊(tabular-nums);狀態列升 12px。
- **10 AI 回覆 Markdown**(`lib/md-lite.tsx`、`ChatWindow.tsx`):自寫受限轉換(粗體/斜體/行內代碼/段落/清單),不允許原始 HTML(React 元素輸出,不經 innerHTML);未加新依賴。單元式驗證 `app/e2e/md-lite.test.mjs`(esbuild bundle + renderToStaticMarkup,不呼叫模型):粗體/清單/代碼跳脫/script 與 img onerror 不執行/未成對標記退回字面,7 檢查 PASS。提案建立成功時,重述型回覆縮為一行「已建立提案,見下方卡片。」(ask 開始時記提案 id,proposals 出現新 pending 且最後 assistant 氣泡過長時替換)。
- **18 側欄教學文字**(`Inspector.tsx`、`BiblePanel.tsx`、`ChecksPanel.tsx`):「沒有摘要」空狀態縮為「尚無摘要」+「建立摘要」,詳細說明收進可展開「摘要如何使用」;「本章登場」改「本章提及的設定」,列表以類型文字(角色/地點/…)區分;移除「其他」的 Sparkles 閃光圖示(TYPE_ICON 不再含「其他」);檢查面板與設定集空狀態說明縮短。
- ChatWindow 新增 DEV-only hook `__perkinsChatInject`/`__perkinsRefreshProposals`(E2E 截圖用,不呼叫模型;正式建置 dist 無此碼)。
- 驗證:`go test ./...` 全過、`npm run build` 通過、E2E(E2E_SKIP_AI=1)**61/61 passed,略過 8 項**;md-lite 單元驗證 PASS;破壞驗證:移除粗體解析 → 粗體檢查 FAIL(還原後 PASS)。
- 視覺截圖(深/淺各一,已目視):`31-1b-bookshelf-dark`、`33-1b-bookshelf-light`(小標題列+首屏書櫃)、`32-1b-cover-zoom`(單色書封+書脊線,書名水平兩行內)、`01-workspace`(深色工作區:卷名一行/統計次行、字級 12px+)、`12-light-theme`(淺色工作區)、`34-1b-chat-reply-dark`、`36-1b-chat-reply-light`(Markdown 回覆+提案卡,浮窗單層陰影)、`37-1b-inspector-light`(資訊欄:尚無摘要+摘要如何使用、本章提及的設定以類型文字)。
- E2E 更新:書櫃等待改 `bookshelf-title`;資訊欄檢查名稱改「本章提及的設定」(斷言內容不變)。

## 2026-10-05 — 研究記錄(研究模式)

完成 SPEC §16 第 3 項,規格見新增的 §12.8(作者拍板:中等粒度、存在作品內預設關閉、另開 research.jsonl 不動 audit/provenance)。

- **開關**:`project.Config.Research`(perkins.json,隨作品走);綁定 `GetResearch`/`SetResearch`。設定頁作品分頁有 Switch(`data-testid=research-switch`)與說明(記錄內容、只存本機、檔案位置),只在開啟作品時顯示。
- **記錄器**:`app/internal/research` 套件,`Recorder.Log(event, detail)`;關閉時 no-op 不建立檔案,開啟時 append 一行 JSON 到 `.perkins/research.jsonl`;共同欄位 `ts`(RFC3339 含毫秒)、`event`、`session`(App 啟動時隨機產生,區分使用時段);寫入失敗回傳 error 給呼叫端記錄,不中斷存檔/AI 流程。
- **事件**(全部在 Go 後端記錄):`ask`(agent 內部取得:model、remote、mode、doc、selection 字數、attachments、實際送出的完整 messages、AI 回覆、工具呼叫清單(名稱/參數/denied/err)、proposal id、耗時、結果 ok/error/cancelled)、`proposal_accept`/`proposal_reject`(id、target、authorEdited、原 replacement 與 Final、從建立到決定的耗時;Reject 簽名改回傳 `*Proposal`)、`save`(path、前後字數,不記內文)、`snapshot`/`restore`、`summary_draft`/`summary_save`、`copy_chapter`/`export_volume`、`open_file`(前端切檔時呼叫 `ResearchOpenFile`,後端只接受專案內既有的 manuscript/canon/notes/outline 路徑)。
- **G1–G4**:`research.jsonl` 不在 project 路徑白名單內,AI 工具讀不到(測試鎖定);研究記錄不進入 AI 上下文(測試鎖定);研究記錄只寫 `.perkins/`,不碰稿件與 Canon。
- **測試**:`internal/research`(關閉不建檔、開啟逐筆 append、共同欄位、寫入失敗回 error 不 panic)、`internal/agent`(預設關閉 ask 不建檔、開啟後 ask 筆含完整 messages/回覆/工具呼叫/proposal id、AI 工具讀不到 research.jsonl 且不進上下文、開關寫回 perkins.json 重開保留);`internal/proposal` 測試隨 Reject 簽名調整。
- **E2E**(一律 E2E_SKIP_AI=1,不呼叫本機模型):R1 情境——預設關閉檔案不存在 → 設定頁開關 → 開章有 open_file、存檔有 save → 關閉後存檔不再新增 → 記錄不含逐字內文。check() 已正規化 `!!ok`:非略過的 falsy 一律計失敗、退出碼非 0。
- 審查修補(c4f63c5,七點全修):
  1. ask 記錄改為單一結束流程(defer logAsk):每次提問恰好一筆,涵蓋 App 前置失敗(未送出 sent=false、requests 空)、超預算、模型失敗、取消(result=cancelled)、成功。第三輪修補(App 層):App.AskAI 前置失敗(未選模型等)由 `logAskPremature` 記錄,測試從 App.AskAI 入口驗證(`TestAskAIPrematureFailureRecordsOnce`);破壞驗證:移除呼叫後 FAIL(got 0 筆)。
  2. proposalIds 改為本次 Ask 建立的提案 id 陣列(runTool 回傳 prID 收集),移除跨回合的 lastProposal;測試:純討論不誤記、一次兩個提案記兩個。
  3. requests 改為依序列出每次實際送出的請求快照(purpose: ask|compact、messages、reply),在 Chat 呼叫邊界保存;compact 加 compactCollect 收集器把濃縮請求記進同一筆 ask;迭代上限時未送出的工具結果不列入。§12.8 同步。
  4. 開關一致性:後端 perkins.json 寫入成功才切換記憶體(`saveConfigWith`,失敗完整還原 Config;失敗值不會經其他設定保存落盤)。第四輪測試補強(review-round3 第 2 點):`TestResearchToggleSaveFailureKeepsMemory` 改為開啟/關閉兩向都在**同一個作品**以 perkins.json 換同名目錄製造真寫入失敗;每向恢復合法 perkins.json 後以 SetName 成功走完 saveConfig,重開作品(project.Open)核對 Research 仍是失敗前的值;不再用另一個作品或會在參數驗證就返回的 SetVolumes(nil)。破壞驗證:移除 saveConfigWith 的失敗還原 → 開啟向 FAIL;前端 await 成功才更新 Switch,失敗保持原值並顯示錯誤;載入與保存期間停用 Switch;GetResearch 載入失敗保持未知(researchOn=null)、Switch 停用並顯示錯誤,不得冒充關閉。
  - 第四輪補強(review-round3 第 1、3 點):`TestAskAIPrematureFailureRecordsOnce` 改為完整隔離的 App 狀態(agent 非空、隔離 store、測試開頭 `keyring.MockInit()` 隔離憑證庫,不碰作者的原生 keyring — review-round4 D3),情境 A「尚未選擇模型」從 AskAI 入口走到 begin 拒絕並斷言錯誤內容、恰好一筆 ask(sent=false、requests 空);情境 B「端點錯誤」:prepare 的 clientFor("") 不會失敗,端點錯誤發生在交給 Agent 之後,以同一套端點/模型呼叫 Agent.Ask(封閉埠 127.0.0.1:1,不呼叫真模型),斷言恰好一筆(model=m、sent=true、requests 含失敗請求、error 含 dial)、App 層不重複。破壞驗證兩項:前置記錄只記 errNoProject → 情境 A FAIL;漏記端點錯誤(result=error 且 requests>0 不記)→ 情境 B FAIL。註:App.AskAI 的 goroutine 會呼叫 wails runtime EventsEmit,測試程序無法提供 wails context(直接終止程序),情境 B 因此經 prepare 後的同一 Agent 驗證,記錄路徑與 goroutine 內相同。
  - E2E R2(E2E_SKIP_AI=1):受控 GetResearch Promise(覆寫 window.go.main.App.GetResearch)— 等待期間 Switch 停用;拒絕後仍停用且顯示 research-load-error,不冒充關閉。破壞驗證:改回舊 catch(setResearchOn(false))→ research-load-error 不出現,中斷 FAIL。
  5. Recorder 固定同一實例(SetResearch 不重建),SetEnabled 與 Log 共用同一把鎖,Enabled 在鎖內判斷;停用回傳後不得再寫(並行 goroutine 測試鎖定);配置 false 的實際 Recorder 不建 .perkins。`go test -race ./internal/research/` 通過。
  6. save 事件改用 CountText 計字數(beforeCount/afterCount),失敗時記 ok=false 與 error、不記 afterCount。
  7. §12.8 把 proposal_accept 與 proposal_reject 欄位分開列,與實作一致。
- 驗證:`go test ./...` 全過;`npm run build` 通過;E2E **33/33 passed,略過 8 項(E2E_SKIP_AI=1)**。截圖 `shots/19-research-settings.png`、`shots/26-research-load-error.png` 已目視。

## 2026-10-05 — 第四輪審查修補(review-round4 E1/E4/E5,G 段)

- **E1 取消選取不得回填**(`Workspace.tsx`):`onSelect` 收到 null(點別行取消選取)時同步清掉 `lastSel` 回填候選;E2E 新增 U8(未開 AI 時選取私人筆記→點別行取消→開 AI,PreviewContext messages 不含該段)。破壞驗證:移除清除 → U8 兩項 FAIL。
- **E4 U4 精確比對選取區塊**(`e2e.js`):以【作者選取的段落】區塊本身(標題後至空行前)精確比較,不再以整則 message 含關鍵句的方式(文件本文含雷恩句會誤判通過)。破壞驗證:selection 改為同文件舊選取 → U4 FAIL。
- **E5 U3 精確驗證還原**(`e2e.js`):首點前保存磁碟/編輯器基準與快照內容(讀 `.perkins/snapshots/<id>/files/`);首點/取消後磁碟與編輯器各精確比較(編輯器以 .cm-line 行串接);確定後磁碟與編輯器精確等於快照;before-restore 備份讀回核對等於還原前磁碟;保留其他檔案未變。破壞驗證兩項:restore-file 略過確認直接還原(確認區不出現,中斷 FAIL);略過 RestoreSnapshot(磁碟/備份 4 項 FAIL)。
- 驗證:`go test ./...` 全過、`npm run build` 通過、E2E(E2E_SKIP_AI=1)**67/67 passed,略過 8 項**。

## 2026-10-05 — 介面打磨第一批(操作問題,01/02/03/04/07)

完成 SPEC §16 第 1 項的第一批(依設計審查前 5 優先中的操作類,作者拍板):

- **01 新章入口常駐**(`ManuscriptPanel.tsx`):每卷章節列表底部常駐「+ 新增章節」(不需 hover);點擊原地出現名稱輸入框 +「建立」「取消」(Enter 建立、Escape 取消保留);卷標題 hover 的 + 按鈕移除(避免兩個入口),卷選單內「新增章節」保留。
- **02 選取來源**(`ChatWindow.tsx`/`Workspace.tsx`):選取記住來源檔案(`selFrom`);開啟 AI 視窗時帶入編輯器當下選取,沒有則帶入最後一次選取(`lastSel`,Workspace 記錄來源)。來源≠目前文件時:標籤以警示色顯示「選取 N 字(來自〈舊章〉)」+「仍要附加」按鈕;**送出預設不附加該選取**,明確點「仍要附加」才送出。E2E 以送出內容預覽驗證(不呼叫模型)。
- **03 還原分層**(`VersionDialog.tsx`):「還原此檔」為主要按鈕;「還原快照內全部檔案」移到「更多…」下拉。兩者點擊後原地確認區塊:快照時間+原因+說明、要還原的檔案、目前內容會先自動備份、「確定還原」「取消」(不用 window.confirm)。
- **04 選取後直接問 AI**(`Editor.tsx`):有選取時編輯器右上浮動列「詢問這段」+「段落指令」(展開快速指令);點擊帶入當下選取;右鍵選單保留。AI 圓鈕開啟對話框時讀取當下選取(`onPickSelection`)。
- **07 送出內容預覽**(`ChatWindow.tsx`):眼睛圖示改為文字按鈕「送出內容」;預覽分兩區:「本次直接送出」(目前文件、選取及來源、附加檔案、摘要、問題、報告模式)與「AI 工具可讀取範圍」(manuscript/ 全部、summaries/ 已確認、canon/ 僅附加者),標示端點位置(本機/雲端);完整原始訊息移到 `<details>` 可展開區。
- E2E 移植 E2E_SKIP_AI=1(check 正規化 `!!ok`);新情境 U1–U7;書櫃檢查補 waitForSelector + waitForFunction(已知 flaky race,根因未明,屬書櫃列表渲染時機)。驗證:`go test ./...` 全過、`npm run build` 通過、E2E **60/60 passed,略過 8 項**。截圖 20/21/22/23/24/25 已目視:常駐新章鈕、還原確認區、選取浮動列、預覽兩區、無復活選取、長章名 chip 均正常。
- 審查修補(review-1a 第 1–4 點,E 段):
  - **移除選取不得復活**(`ChatWindow.tsx`):`clearSel()` 同時呼叫 `onClearLastSel?.()`(Workspace 清掉 `lastSel`),只有「新的選取」能重新取得重開時回填資格;E2E U6 以私人筆記選取情境驗證(移除後重開 AI 視窗無選取標籤、原始 messages 不含該段)。
  - **長章名 chip**(`ChatWindow.tsx`):Chip 新增 `shrinkText`——truncate 區只放來源段文字,操作按鈕(仍要附加/移除)放 `shrink-0` 區域;警示 chip 放寬到 max-w-[22rem]。E2E U7 建立長章名章節,斷言來源段與「仍要附加」分離且按鈕完整可見可點。
  - **工具可讀範圍說明**(`ChatWindow.tsx`):改為「canon/、outline/、notes/:只有你本次送出的目前文件或明確點選附加的檔案」;E2E U5 斷言含 outline/、notes/ 與完整說明字樣。
  - **送出紀錄 meta**(`ChatWindow.tsx`):記錄送出當下實際附加的選取(`selSent`),非視窗開啟時的 `sel`;E2E U2 以 PreviewContext 原始 messages 核對預設不送出/明確點「仍要附加」才送。
  - **還原前磁碟/編輯器狀態**:U3 加還原前後比對與 before-restore 備份斷言。
  - 破壞驗證五項均成立:(1) 移除 `onClearLastSel` → U6 兩項 FAIL;(2) Chip 移除 shrinkText 機制 → U7(separated:false)+U2 FAIL;(3) 說明改回舊文字 → U5 新斷言 FAIL;(4) `selection` 改回 `sel` → U2「預設不送出」FAIL;(5) `restore-file` 略過確認直接還原 → U3 確認區不出現中斷 FAIL。
- 已知 E2E 測試碼注意事項:`add-chapter-0` 點擊後按鈕被輸入框取代,playwright 穩定性檢查會誤判 timeout,改用 `page.evaluate` 直擊;`rail-manuscript`/`rail-docs` 是雙態按鈕,重複點會收合側欄,需先條件判斷;`page.evaluate` 內不能用 playwright 專屬的 `:has-text` selector;`--fixture` 重建時會清 perkins.json 的 lastOpen,未重建 fixture 重跑會直接進編輯器導致書櫃情境 timeout。

## 2026-10-05 — Notion 匯入可逐頁分類

完成 SPEC §16 第 2 項:同一資料夾裡的角色、地點、名詞可以分開歸類。

- 後端:`notion.Apply` 新增第三參數 `pages map[string]string`(key = `File.Src`,value 與群組同一套值);頁面有覆寫就用覆寫,否則用所屬群組去處;key 不在掃描結果中時忽略。允許「群組略過、單頁指定類型」與「群組有類型、單頁略過」。`App.NotionApply(src, choices, pages)` 同步更新,wailsjs 綁定已重新生成。B9 不變:同名不覆蓋、匯入前快照、可撤銷。
- Go 測試(`notion_test.go`):同資料夾三頁分別匯入角色/地點/略過、群組略過但單頁指定、群組有類型但單頁略過、不存在的 key 忽略。
- 前端 `NotionImport.tsx`:資料夾列可展開(ChevronRight/Down),逐頁 Select 預設「跟隨資料夾(目前:X)」,清空回跟隨;覆寫頁數顯示「N 頁另行指定」;「匯入 N 頁」按逐頁結果計算(略過不算);展開區 max-h + 捲動。
- E2E 新情境 N1:覆寫 `window.go.main.App.PickNotionExport`(wailsjs 呼叫當下才讀 window.go)繞過無頭模式無法操作的原生檔案對話框;fixture 在測試專案外建立 Notion 匯出(同資料夾三頁,檔名帶 32 位 hex id)。三頁分別跟隨(角色)/地點/略過 → 匯入 → 斷言王都 frontmatter 為地點、草稿不存在、同名艾莉絲未覆蓋、撤銷後王都消失。審查修補(b7d10a1):
- check() 正規化 `!!ok`:非略過的 falsy(含 optional chaining 的 undefined)一律計失敗、退出碼非 0;只有 skip 產生略過記錄。
- N1 新增第四頁「劉洋」(fixture 有四頁):先覆寫為地點(覆寫頁數 1、匯入 4 頁),再選回「跟隨資料夾」(覆寫清除、匯入計數回到 3)→ 匯入後劉洋在 canon/、frontmatter 為角色、撤銷後消失;艾莉絲保留作 B9 不覆蓋檢查。過程發現:e2e 的選項匹配原本用全等,「跟隨資料夾(目前:角色)」匹配不到,已改 startsWith。
- 未覆寫頁的閉合 Select 顯示改為隨群組即時更新的「跟隨資料夾(目前:X)」(placeholder 動態),E2E 斷言閉合顯示含目前群組去處。第三輪修補(C2):N1 新增「把人物群組改為略過」情境——兩個跟隨頁(艾莉絲/劉洋)閉合顯示變「跟隨資料夾(目前:略過)」、匯入數變 1、已覆寫頁保持原值(王都地點/草稿略過)、覆寫頁數不變,再切回角色完成匯入與撤銷;群組 Select 加 data-testid=group-select。破壞驗證兩項:(1) 忽略逐頁覆寫 → Go 測試 TestApplyPerPageOverrides/AgainstGroup FAIL;(2) placeholder 改回固定文字 → N1c 與 C2 跟隨頁顯示檢查 FAIL(41/44)。
- E2E 新增 `E2E_SKIP_AI=1`(2026-10-05 作者回饋:本機模型吃大量記憶體):跳過所有向模型送出請求的步驟,被跳過的檢查印成「略過」,結尾統計「略過 N 項」,不算通過。
- 踩坑記錄:`NOTION_SRC` 以 `path.dirname(PROJ)` 推導時,POSIX 風格路徑在 Windows 上會解析成 `
otion-export`,Go 端報 `GetFileAttributesEx
otion-export` 錯;改用 `path.resolve` + 明確基準(fixture 模式取 dir 上層、runtime 模式取 PROJ 上層)。
- 驗證:`go test ./...` 全過(含 4 個新測試);`npm run build` 通過;E2E **33/33 通過,略過 8 項(E2E_SKIP_AI=1:模型回覆完成、模型建立提案並顯示卡片、A1 提案顯示前稿件未被改動、編輯後提示將寫入作者版本、B4 接受後寫入作者編輯的版本、B4 provenance 記錄 authorEdited、編輯器重新載入為磁碟內容、接受提案前的自動快照在版本清單)**。截圖 `shots/18-notion-perpage.png` 已目視:展開列表、覆寫頁數、逐頁 Select 與匯入頁數均正常。

## 2026-10-05 — 錯誤防護(ErrorBoundary)

完成 SPEC §16 第 0 項:render 期間未捕捉錯誤不再讓視窗全白。同日依審查意見修補四點(ea4d024 審查):

- **救援資料**:緊急存檔改註冊 `{save, rescue}`,`rescue()` 在呼叫 SaveFile 前先取好 `{path, text}`(不可寫入 log 或檔案)。存檔失敗時錯誤畫面顯示目標路徑、唯讀可全選的 textarea 放原文與「複製全文」(`navigator.clipboard.writeText`),不做另存救援檔。
- **重新載入時序**:存檔中(`data-save-state=saving`)停用「重新載入」;存檔失敗時按鈕文字改為「放棄未存內容並重新載入」。
- **區域 fallback 版面**:chat fallback 改為右下 fixed 小卡片(不佔版面流);inspector fallback 保留 `w-[280px] shrink-0`;側欄保留 272px;錯誤文字可斷行。E1 對 sidebar/inspector/chat 各別觸發,斷言 `.cm-editor` 寬度前後差 < 3px 且仍可輸入。
- **E2E 競態**:`emergency-save` 加 `data-save-state`,E2 等 `saved` 再讀磁碟;新增 E4 情境:開發模式專用 `window.__perkinsSaveFail`(以 `import.meta.env.DEV` 包住,正式建置 grep 不到)模擬存檔失敗,驗證 textarea 內容等於未存原文(磁碟內容+輸入字)、唯讀、複製全文、放棄重載後檔案無未存字。另移植已核准的「書櫃顯示最近的作品」waitForSelector 穩定性修正。**已知問題(2026-10-05,原因未明)**:「書櫃顯示最近的作品」檢查仍偶發失敗(a958a55 修補後的第三輪執行再次失敗),加 waitForSelector 未證明消除 race;候選原因:剛關閉設定頁啟動的 GetTree 可能在 onClose 清空 tree 後才回傳,把書櫃卸載回作品畫面;CloseProject/SetTheme 未等待完成,ListRecent 讀取可能遇到空檔或不完整 JSON。待以可控請求順序的回歸情境驗證後再修,勿視為已解決。
- 驗證:`npm run build`(含 tsc)通過;`go test ./...` 全過;E2E **57/57 通過**(四輪執行:一輪 LM Studio 模型未產生提案卡屬模型 flakiness,與本變更無關)。

**第二輪審查修補(a958a55 複審)**:

- 救援畫面視覺權重:「複製全文」改為主要按鈕(default);「放棄未存內容並重新載入」降為次要(ghost,文字用 destructive 色),且改為兩段式:第一次點擊原地顯示「尚未儲存的原文將無法取回,確定要放棄?」加「確定放棄並重新載入」與「取消」(不用 window.confirm),確認後才 reload;存檔成功時的「重新載入」維持一次點擊。
- **複製防護(PR #4 審查;第二輪審查後重寫回歸)**:複製 Promise 進行中停用「複製全文」(copyAll 防重入,連按不啟動第二個 Promise)、第一段放棄與確認段「確定放棄並重新載入」都依同一狀態停用,confirmAbandon 也檢查狀態(按鈕 disabled 屬性繞不過 handler 防護);複製失敗後仍可手動全選複製或明確確認放棄。E4a 回歸情境:受控剪貼簿替身(覆寫 writeText 記錄呼叫數與捕捉文字、釋放時才寫真剪貼簿)——進確認段後複製 → 確認按鈕與複製按鈕停用、繞過 disabled 的點擊不重載;防重入兩層驗證:繞過 disabled 的 handler 呼叫 + DEV 直接呼叫 copyAll 兩次,writeText 呼叫數均為 1;**破壞驗證成立:移除防重入後「直接呼叫兩次」檢查 FAIL(calls=3)**;釋放後顯示已複製、替身捕捉的文字等於未存原文、放棄恢復可用。
- E4 新增斷言:剪貼簿 `navigator.clipboard.readText()` 與救援 textarea 完整比對;兩段式放棄(第一次點擊不重載、取消可回救援畫面、確定後才重載)與按鈕樣式(default/ghost+destructive)。「存檔中不能重載」的直接驗證未補(延遲掛鉤在另一分支)。

原實作內容:

- `app/frontend/src/components/ErrorBoundary.tsx`(新):`RootBoundary`(最外層,錯誤畫面 + 重新載入按鈕,`componentDidCatch` 先呼叫緊急存檔再顯示畫面,存檔成功/失敗都寫在畫面上)與 `AreaBoundary`(區域防護,顯示簡短錯誤 + 「重試」重設 boundary 狀態)。未引入新依賴。
- `main.tsx` 最外層包 `RootBoundary`;`Workspace.tsx` 內 `ChatWindow`、`Inspector`、側欄(aside)各自包 `AreaBoundary`,並把讀 `latest` ref 的存檔邏輯註冊到模組層級 `emergencySave`(只做 `SaveFile`,不依賴卸載後的 setState)。
- 開發模式拋錯點:`main.tsx` 在 `import.meta.env.DEV` 下掛 `window.__perkinsCrash(area)`,讓 `chat`/`inspector`/`sidebar`/`root` 對應區塊下一次 render 拋錯;`App.tsx` 監聽拋錯事件強制重繪。正式建置已以 `grep -r __perkinsCrash app/frontend/dist` 確認不存在。
- `app/e2e/e2e.js` 新增兩個情境:E1(chat 區崩潰 → 編輯器仍在、未存的字仍在、ChatWindow 區顯示錯誤、重試後恢復)、E2(root 崩潰 → 錯誤畫面顯示「未儲存的內容已存檔」、磁碟檔案含未存的字、重新載入後稿件保留)。刻意拋錯在 dev 模式會被 React 重拋到 window 成 pageerror,屬預期,不計入「頁面沒有 JavaScript 錯誤」。
- 驗證:`npm run build`(含 tsc)通過;`go test ./...` 全過;E2E **42/42 通過**(含既有情境無退步,LM Studio 本機模型正常回覆)。備註:「書櫃顯示最近的作品」首次執行曾失敗一次,第二輪(同程式碼)通過,判斷為既有檢查在書櫃非同步載入 `ListRecent` 時的偶發 race,與本變更無關。

## 2026-10-05 — 編輯器看得見的存檔按鈕

完成 SPEC §16 第 5 項:存檔不再只有 Ctrl+S。同日依審查意見修補三點(77d86f4 審查),再依第二輪複審(1f3ce46)重構存檔層:

- **save() 改為單一序列化寫入迴圈**(1f3ce46 複審第 1 點):重複觸發(Ctrl+S/按鈕/自動存檔)回傳同一個 Promise,迴圈持續到畫面上的字全部落盤才結束;同時最多一個 SaveFile,忙碌狀態由這個迴圈的生命週期推導。修掉上一版「各 waiter 醒來後各自再啟動一筆寫入」的並行寫入缺陷(受控驗證曾達同時 3 筆)。踩過的坑:無事可存時若仍建立 IIFE,它會同步跑完,finally 先清 null、外層又把已結束的 Promise 指回 ref,之後每次 save() 都回傳過期 Promise、永遠不再寫入;已改為前置檢查 `current && dirty`,無事可存直接 resolve 不建立 Promise。
- **openFile 防丟字**(複審第 2 點):`await save()` → ReadFile(目標) → 若等待期間又打字(dirty 再變 true)再 `await save()` 一次,然後才同步切換 setCurrent/setText/清 dirty。
- **「已儲存」通知與狀態一致**(複審第 3 點):所有呼叫者等到畫面全文落盤才 resolve,saveNow 的通知不再有「僅舊版本已存、仍有新修改」的誤導。
- E5 改寫:存檔延遲中輸入新字並連按 Ctrl+S 三次,斷言最終磁碟含全部文字、按鈕「已儲存」、`window.__perkinsSaveStats`(DEV 包住)記錄的 SaveFile 最大並行數為 1;延遲中點另一章,切換前在原章輸入的字(含存檔途中補的字)都在原章檔案、目標章逐位元組不變。
- **導覽序號防重疊**(PR #5 審查第 1 項):`openFile` 加 `navSeq` ref,每個在途請求記下自己的序號;每個 await 後、套用讀檔結果前,序號已不是最新就直接返回,不 setCurrent/setText/清 dirty。E7 回歸:開發模式專用 `__perkinsReadDelay`(DEV 包住)延遲讀檔——A→B→C 快速切換最後停在 C;在途導覽回來後編輯器仍是第一章、期間輸入的 `staleGuard` 仍在且為未儲存,存檔後磁碟不丟字。
- **E6 恆真斷言移除**(審查第 2 項):點場景前存下完整編輯器文字,點後逐字比較(不再 `|| true`),並斷言仍為未儲存。
- **重開目前檔案不重讀**(第三輪複審 ebd8107,只修第 1 點):`openFile(rel)` 當 rel 等於目前檔案時直接返回,保留編輯器內容(含未存的字),只做場景定位;避免「讀檔等待期間又打字,存了新字後卻把舊稿放回編輯器」的丟字。場景列點擊加 `stopPropagation`,避免冒泡重複導覽。E6 回歸情境:同章打字(不存)→ 點同章章節列與場景列 → 新字仍在編輯器且磁碟未存 → 存檔後磁碟保有新字。
- E2E 移植 `E2E_SKIP_AI=1`(同第 2 項分支的作法,作者回饋:本機模型吃大量記憶體):本分支 E2E 以 E2E_SKIP_AI=1 執行,略過模型相關檢查。48/48 通過,略過 8 項(check 已正規化 !!ok,非略過的 falsy 一律計失敗)。

第一輪修補(77d86f4 審查):

- **存檔途中輸入不會被誤標已儲存**(既有 bug):`save` 以 `editVersion` ref(每次 onChange/applyHeader 加 1)記錄版本,SaveFile 完成後只有檔案與版本都沒變才清 dirty;期間又有編輯時保留「未儲存」讓下次存檔處理新版本。E2E 新增 E5 回歸情境:開發模式專用 `window.__perkinsSaveDelay(ms)`(以 `import.meta.env.DEV` 包住,正式建置 grep 不到)延遲 SaveFile 1.5s,存檔途中輸入 B,完成後斷言按鈕仍為「儲存」、狀態列「未儲存」、磁碟只有 A,再存一次後磁碟含 A+B。
- **in-flight 防重入**:`save` 用 `saveInFlight` ref 協調,重複觸發(Ctrl+S/按鈕/自動存檔)等同一請求結束、仍 dirty 才再存,不並行兩個 SaveFile;`saving` 由這個 ref 推導,最後一個請求結束才解除(先結束的請求不會提早結束忙碌)。E5 驗證存檔中再按 Ctrl+S 的最終狀態與磁碟內容。
- **E3 去除固定等待**:點擊前先斷言磁碟沒有標記字;以按鈕進入「儲存」/「已儲存且停用」作為完成訊號(waitForFunction/waitForSelector)後才讀磁碟。
- 驗證:`npm run build`(含 tsc)通過、dist 無開發掛鉤;`go test ./...` 全過;E2E 44/44 通過(當時以本機模型執行;之後改用 E2E_SKIP_AI=1)。

原實作內容:

- `Workspace.tsx` 頂端工具列(與「摘要」「版本」同列)新增存檔按鈕(`data-testid=save-button`),章節檔與設定集檔都有:未儲存時主色「儲存」(lucide `Save` 圖示、title「儲存(Ctrl+S)」);存檔中顯示「儲存中…」並停用避免連點;已儲存時為低調 ghost 樣式且停用。Ctrl+S 與按鈕共用同一個 `saveNow`(呼叫既有 `save()`,成功 `notify`、失敗走 `fail`),未複製邏輯。狀態列改為只顯示「未儲存」(快捷鍵提示移到按鈕 tooltip);麵包屑旁小圓點保留。未加定時自動存檔(不在本項範圍)。
- `app/e2e/e2e.js` 新增 E3 情境:開第二章、打字、斷言按鈕顯示「儲存」且可按、點按鈕後檔案含新字、按鈕變「已儲存」且停用。截圖 `shots/13-save-button-dirty.png`(未儲存)與 `shots/14-save-button.png`(已儲存)已實際目視,兩種狀態區分明顯,工具列未擠壞。
- 順手修正既有 E2E 檢查的 flaky race:「書櫃顯示最近的作品」原本在 `ListRecent` 資料回來前就用 `page.$` 判定(三輪執行兩次偶發失敗、已用 probe 驗證書櫃資料實際有 render);改為先 `waitForSelector` 再斷言,不弱化檢查內容。
- 驗證:`npm run build`(含 tsc)通過;`go test ./...` 全過;E2E **37/37 通過**(LM Studio 本機模型正常回覆)。

## 2026-09-30 — 版本差異標出行內改動的字

「版本」對話框原本只能整行標紅/綠(中文一段一行,改一個字也整段標色)。`snapshot.LineDiff` 現在會把相鄰的刪除行與新增行配對,以字元 LCS 標出實際變動的字;共同字不到一半(整段改寫)或行太長時仍整行標色。提案卡片的原文/替換對照未改(替換是可編輯的輸入框)。Go 測試與 `tsc` 通過;**畫面未實機 render,請開「版本」看一次**。

## 2026-09-30 — 修正:無設定章節開啟 AI 視窗白屏

`SuggestAttachments` 在沒有命中時回傳 `null`,前端 `.filter` 拋錯使整個視窗全白;後端改回傳 `[]`、前端加 `?? []`,E2E 新增回歸檢查(34/34)。詳見 [PITFALLS.md](PITFALLS.md)。

## 2026-09-30 — 第二階段完成報告(請先看這段)

**結論**:SPEC §14 的 M6–M11 全部實作完成。Go 測試全數通過;新的前端 E2E 以真實 LM Studio 模型(qwen3.6)跑完 **33/33 通過**。`app\build\bin\perkins.exe` 已重新建置。

### 做了什麼
- **介面(shadcn/ui + Tailwind)**:書櫃啟動頁(依書名自動產生直排書封,可自訂封面);最左側圖示列(稿件/設定集/大綱與筆記/檢查)+ 可收合側欄;**齒輪固定在左下角** → 全頁設定;右側可收合資訊欄;右下角圓鈕 → 可拖曳、可調整大小的浮動 AI 對話框;狀態列字數;深色「夜間書房」與淺色「白紙」兩種主題。
- **作品結構**:卷 → 章 → 場景(`##` 標題);章節拖曳到其他卷;草稿/完成狀態;大綱、筆記;移到回收區。
- **設定集**:角色/地點/勢力/道具/名詞(frontmatter:type、name、aliases),表單編輯;登場索引(本章登場、每個設定出現在哪幾章);名稱寫法檢查(程式比對,不經 AI)。
- **AI 協作**:附加標籤 + 📎 附加任何專案檔 + 「建議附加」(稿件中出現的設定,點了才附加);多端點與模型切換;提案卡片可編輯後再接受(部分採用);右鍵「快速指令」;檢查面板的 AI 一致性檢查(報告模式,不提供提案工具);章節摘要(AI 草擬 → 你儲存才生效,章節改動後標示可能過期);「前情摘要」;對話過長時自動濃縮並通知;超過模型上限時拒絕送出而不是默默截斷。
- **輸出**:章節「複製到平台」(五個平台預設)、整卷匯出 `.txt`、繁簡轉換(OpenCC,預設只換字形);作者註解 `<!-- -->` 永遠不會輸出。
- **Notion 匯入**:設定 › 作品 › 從 Notion 匯入(zip 或資料夾;每個資料夾指定匯入類型;不覆蓋同名檔;匯入前自動快照;可一鍵撤銷)。

### 驗收對照(SPEC §13)
| ID | 證據 |
|---|---|
| B1 | project 測試(舊 order 升級、卷調整不動稿件、重複拒絕);E2E 舊專案開啟順序正確且未改寫 perkins.json、拖曳到新卷後稿件雜湊不變 |
| B2 | agent 測試(未附加的大綱/筆記不在上下文,工具也讀不到);E2E 預覽不含筆記與大綱 |
| B3 | bible 測試(索引唯讀、最長比對不重複計數、錯寫偵測與忽略);E2E 抓到「艾麗絲」 |
| B4 | proposal 測試 + E2E:以真實模型建立提案 → 你編輯後接受 → 稿件寫入你的版本、provenance 有 `authorEdited` |
| B5 | agent 測試:報告模式不提供 `propose_patch`,模型硬呼叫被拒並記錄 |
| B6 | agent 測試(草稿不寫檔、未儲存不進上下文、改章後過期);E2E 摘要儲存後出現在下一章的前情 |
| B7 | agent 測試:濃縮有通知、濃縮後預覽 = 實際送出;超過上限拒絕送出 |
| B8 | publish 測試(縮排不疊加、註解不外流、確定性);E2E 複製不改稿 |
| B9 | notion 測試(不覆蓋、撤銷到回收區、巢狀 zip)。**GUI 流程未實測**(需要原生檔案對話框,無頭瀏覽器無法操作) |
| B10 | settings 測試:多端點金鑰只在憑證庫;最近專案不寫入專案 |

### 需要你知道的事
- **平台規則全部未驗證**:請實際貼到各平台看一次,不對就到「設定 › 平台輸出」調整,確認後打開「已驗證」。
- **請實際試一次 Notion 匯入**(用真的匯出檔)。Notion 的匯出格式我只依已知結構寫了測試,你的資料可能有我沒預料到的結構。
- **你的設定檔會自動升級**:第一次開新版時,原本的端點與模型會轉成「預設端點」設定檔,金鑰沿用,不需重新輸入。
- **E2E 會碰你的真實設定**:`wails dev` 使用 `%APPDATA%\Perkins\settings.json`。這次測試前我備份、測完已還原;剪貼簿曾被「複製到平台」測試覆寫過一次。
- **仍然存在的限制**:外部工具修改 `perkins.json` 不會即時反映(app 開著時);提案與摘要的差異以「行」為單位;前端打包約 950KB(桌面 app 可接受,未做分割)。
- 我代你做的決定都寫在 SPEC §15,不喜歡可以改。
- 修改前的程式碼備份:`.backup/app-before-phase2-2026-09-29.tar`。(2026-09-30 更新:已建立 Git 倉庫並推送到 GitHub,工作流程見 `AGENTS.md`「Git 與工作樹」。)

### 請你試(約 10 分鐘)
執行 `app\build\bin\perkins.exe`:書櫃 → 開啟作品 → 設定集新增一個角色並填別名 → 在章節裡寫到他 → 資訊欄看「本章登場」→ 選一段文字,右鍵「快速指令 › 檢查是否違反設定」→ 點「建議附加」→ 送出 → 請 AI 改寫一句,改一下它的版本再接受 → 「摘要」→ 「複製到平台」。

### 怎麼重跑測試
- 後端:`cd app && go test ./...`
- 前端 E2E:見 `.agent/skills/e2e/SKILL.md`(含會影響使用者設定與剪貼簿的注意事項)。

## 2026-09-29 下午 — 自主推進報告(下班回來請先看這段)

**結論**:SPEC 的 M0–M4 已實作完成,A1–A8 有自動化或實機證據,A9 由你先前確認。剩下的 M5 是「拿真實小說寫一段時間」,只能由你來做。以里程碑計約 5/6(超過要求的 50%)。

### SPEC 驗收對照
| ID | 狀態 | 證據 |
|---|---|---|
| A1 AI 無法未經同意改稿 | ✅ | agent/proposal 測試:越權工具、提案建立後稿件雜湊不變;E2E 確認提案顯示時稿件未變 |
| A2 衝突不覆寫作者編輯 | ✅(已放寬,見 SPEC §10) | proposal 測試 3 則(改到同段→衝突、改別處→重定位、原文變不唯一→衝突);E2E「接受時未存檔的補寫沒有遺失」 |
| A3 待審提案不進上下文 | ✅ | agent 測試 |
| A4 快照與還原 | ✅ | snapshot 測試(逐字還原、還原本身可撤銷、備份失敗就不還原——已做變異檢查);E2E 還原後磁碟=快照、編輯器同步 |
| A5 白名單與迭代上限 | ✅ | agent 測試(已做變異檢查) |
| A6 預覽=實際送出 | ✅ | agent 測試;E2E 預覽隨勾選變化;**新增**:工具也讀不到未勾選的設定檔 |
| A7 金鑰不進專案 | ✅ | settings 測試 |
| A8 本機模型完整迴圈 | ✅ | E2E 以你設定的 `minicpm5-2b` 走完:選字→右鍵詢問→模型呼叫 propose_patch→卡片→接受→版本還原(75 秒);另以 qwen3.6 跑 live 測試通過 |
| A9 中文 IME | ✅ 你已確認 | — |

### 這次做了什麼
1. **M4 版本**:`internal/snapshot`(快照、列表、逐行差異、還原;還原前自動備份、備份失敗拒絕還原;provenance 記錄)。介面:編輯器上方「版本」按鈕 → 建快照、看差異、還原單檔或全部。提案接受也改用同一套快照。
2. **三個待決事項我照保守方向決定了**(都寫進 SPEC §10,不喜歡可以改回):
   - 衝突放寬:原文未動且唯一 → 重新定位套用;否則衝突。
   - AI 只看得到你**勾選**的設定檔(工具也一樣),稿件不受限。
   - 編輯器內行內 diff 暫不做。
3. **修掉兩個會吃字的 bug**:編輯器有未存檔文字時接受提案或還原版本,重新載入會把未存的字丟掉。現在兩者都會先存檔。(E2E 驗證)
4. **補上缺口**:之前介面沒辦法新增設定檔 → 側欄「設定 Canon ＋」。
5. **前端 E2E 測試** `app/e2e/`:用 `wails dev` + 本機 Edge 無頭模式跑 21 項,全部通過。新增 `PERKINS_OPEN=<專案資料夾>` 環境變數讓 app 啟動時直接開專案(略過資料夾對話框),正式使用不受影響。

### 需要你知道的事
- **`minicpm5-2b` 會混入簡體字**:E2E 裡它的提案寫出「泼」。在台灣繁中寫作上這是實際品質問題,也正好是研究報告提到的語言偏差。這個提案機制讓你能拒絕,但選模型時值得留意;qwen3.6 那次沒有出現。
- **差異以「行」為單位**:中文一段通常就是一行,改一個字也會整段標紅/綠。
- **版本差異中常見一行空白的「-」**:是檔尾換行的差異,不影響內容。
- **外部修改 `perkins.json` 不會即時反映**:app 開著時用別的工具改順序,app 仍用記憶中的版本,重開專案才會讀新的。
- 專案**還不是 git repo**,我沒有擅自初始化。要版本控管程式碼的話說一聲。
- 介面仍很陽春;你說 GUI 設計已有底,我沒動視覺風格,也還沒引入 shadcn/ui。

### 請你試(約 5 分鐘)
執行 `app\build\bin\perkins.exe`:選字 → 右鍵「詢問 AI」→ 請它潤飾 → 接受提案 → 點「版本」看到「接受提案前」的快照 → 還原。

### 怎麼重跑測試
- 後端:`cd app && go test ./...`
- 實機模型:`PERKINS_LIVE_MODEL=<模型id> go test ./internal/agent -run Live -v`
- 前端 E2E:見 `app/e2e/e2e.js` 開頭;先 `cd app/e2e && npm install`,在另一個終端以 `PERKINS_OPEN=<測試專案>` 執行 `wails dev`,再 `PROJ=<測試專案> node e2e.js`。**會修改測試專案內容**,請用拋棄式資料夾。

---

## M3 — 後端與實機提案已驗證;提案審核 UI 待作者實機驗證

作者確認 M2 對話功能正常,並表示 GUI 設計已有底,之後另行調整。M3 是作者離開期間自主完成的。

**已驗證(自動化,`go test ./...` 全過)**
- `internal/proposal`:A1 建立提案不改稿件;`original` 必須在檔案中恰好出現一次(空/找不到/多次都被拒);接受只替換指定片段並先快照、寫 provenance;**A2** 作者在提案後改過檔案 → 標 conflict、不覆寫、不產生快照;拒絕不動檔案且不可再接受;**快照失敗時拒絕套用**(沒有回溯點就不修改)。
- `internal/agent`:白名單為 `read_document, search_project, propose_patch`(無寫入工具);經 agent 路徑提案後稿件雜湊不變;**A3** 待審提案的替換文字不出現在後續請求的上下文;模型給錯 `original` 時錯誤回給模型、不建立提案。
- 實機:LM Studio `qwen3.6-35b-a3b-apex` 依指示呼叫 `propose_patch`,建立 1 個提案(「小明走進森林。」→「小明踏入了那片幽深寂靜的森林。」,含理由),稿件未變(71 秒)。

**未驗證**
- 提案卡片 UI(接受/拒絕/衝突顯示)、接受後編輯器重新載入、送出前自動存檔,只通過 `tsc` 與 `wails build`,沒有人實際操作過。
- SPEC M3 寫「行內 diff」;目前是提案卡片內的「原文/替換」對照,尚未在編輯器內行內顯示(未使用 `@codemirror/merge`)。這是與規格的差異,待作者決定是否需要。

**已知限制 / 待決定**
- A2 採規格的嚴格版:檔案只要有任何變動(即使在別處)就 conflict。實際寫作時可能太嚴格(例如提案後在別段打了字),可考慮「雜湊不同但原文仍唯一且位置可重定位時允許套用」,需作者決定。
- `read_document` 讓 AI 可讀未勾選的 Canon(見 M2 記錄),仍待作者決定是否限制。
- 快照目前只是「接受前該檔完整內容」,尚無列表/還原介面與手動快照 → M4。
- 提案沒有 Canon 專用的額外確認;AI 可對 `canon/` 檔提案,接受流程與稿件相同。

---

## M2 — 程式面完成,GUI 對話流程待作者實機驗證

**已驗證(自動化)**:`go test ./...` 全過。
- `internal/llm`:串流解析(分片 tool call 組回)、Bearer 金鑰、HTTP 錯誤;本機端點不送空 Bearer。
- `internal/agent`:A1/A5 越權工具被拒、告知模型、寫入審計、檔案雜湊不變;迭代上限會停並記錄;A6 預覽與實際送出逐則一致、未勾選的 Canon 不在上下文、附件只允許 canon/。已做變異檢查:把白名單改成全放行,測試會失敗。
- `internal/settings`:A7 金鑰不在專案資料夾也不在 settings.json;`IsRemote` 保守判斷。
- **實機**:以 LM Studio `qwen3.6-35b-a3b-apex` 跑 `PERKINS_LIVE_MODEL=... go test -run Live`,模型確實呼叫 `search_project` 並答對、稿件未被改動(58 秒)。SPEC §8-1 風險(本地模型 tool-calling 不可靠)在此模型上未發生,但只測了一個模型一個問題。

**未驗證**
- 對話面板 UI 的實際操作(設定、載入模型清單、串流顯示、停止、預覽、遠端警告勾選)只通過編譯。
- 右鍵選單剪貼簿、長文捲動、Ctrl+Z(M1 待確認項)作者尚未回報。
- 設計張力:`read_document` 讓 AI 能自行讀取未勾選的 Canon(工具呼叫會顯示在對話中並寫入審計,但送出前預覽看不到)。A6 針對的是初始上下文;是否要限制工具可讀範圍,待作者決定。

**修正**:M1 回報「選取文字不反白」——CodeMirror 內建深色主題的選取色(#233)優先權高於覆寫規則。已改用同優先權選擇器,待作者確認。

**A9(中文輸入法)**:作者截圖確認正常。

---

## M1 — 程式面完成,待作者實機驗證(A9)

M0 已由作者實機確認功能正常。M1:`Editor.tsx`(CodeMirror 6 + Markdown + 自動換行)取代 textarea;右鍵自訂選單(詢問 AI / 剪下 / 複製 / 貼上),選取文字後「詢問 AI」目前只顯示已選字數,對話接上是 M2。`tsc` 與 `wails build` 通過。

**需作者驗證(A9,我無法代測)**
1. 中文輸入法:注音/拼音組字、選字、標點、在句中插入、組字中按方向鍵/Enter,是否有跳字、重複、游標錯位。
2. 右鍵選單:選字後「詢問 AI…」可點;剪下/複製/貼上是否可用(貼上用 `navigator.clipboard.readText`,WebView2 可能跳權限提示或失敗)。
3. 長章節(數萬字)捲動是否流暢;Ctrl+Z 復原是否正常;切換檔案後內容/存檔是否正確。

未通過時的備案:貼上失敗 → 改走原生選單或 Wails runtime 剪貼簿;IME 有問題 → 評估替代編輯器(SPEC §8-2)。

---

## 2026-09-29 — M0 程式面完成,GUI 未實機驗證

**已完成並驗證**
- `app/`:Wails v2.12 + React-TS 骨架,`wails build` 成功。
- `app/internal/project`:專案建立/開啟、路徑安全(只允許 `manuscript/`、`canon/` 下 `.md`)、原子寫檔、章節排序(`perkins.json` 的 `order`)。`go test ./internal/...` 通過(7 個測試,涵蓋路徑跳脫、排序不動稿件、不覆蓋既有專案/章節)。
- 前端最小殼:開啟/建立專案、稿件與 Canon 檔案樹、拖曳排序、textarea 編輯、Ctrl+S 與切檔自動存檔。`tsc --noEmit` 通過。

**尚未驗證(不可視為完成)**
- 沒有實際開啟視窗操作過:拖曳排序、資料夾選擇對話框、行內輸入框的實際行為都只通過編譯,未人工驗證。
- M0 完成條件「能開資料夾並編輯存檔」需要作者實機確認。
- 前端尚無自動化測試。

**與規格的差異**
- M0 用 textarea 編輯;CodeMirror 6 留到 M1(規格本就如此)。
- 尚未套用 shadcn/ui;UI 還只有幾十行,待 M1 之後有需要再引入。

**下一步**:作者確認 M0 可用後進 M1(CodeMirror、右鍵選單、中文 IME 驗證)。
