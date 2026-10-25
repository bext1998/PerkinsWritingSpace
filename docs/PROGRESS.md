# PROGRESS.md

## 2026-10-26 — #163 打字機音效只在專注寫作時響

- **#163**(2026-10-25 作者決定):打字機音效改成開關打開**且**專注寫作開啟才響;一般模式與禪模式未開專注寫作都不響,設定頁試播不受此限。SPEC §17.3 對應段已更新,`paper` E2E 新增「一般模式不響」與「關閉專注寫作後不響」檢查。

## 2026-10-25 — 合併 #144–#153(派工管道、#116 專注寫作與打字機音效、#28 介面修正第一批)

- **#144、#149 派工管道**(#143):Pi 可直連 DeepSeek 官方(`deepseek/deepseek-flash`)、MiniMax M3.1 Flash 走 OpenRouter(pi 內建模型表沒有,作者本機 `models.json` 補一筆);「同時最多一個 Pi」改為只算本倉庫與其工作樹的 Pi(作者決定)。
- **#150 規則**:每個 PR 都要經 Codex Reviewer 審查才能回報可合併(#144、#146 曾未審就回報,作者合併後又開 revert,補審通過後關閉 revert)。
- **#145 版本清單說明**(#28 A1、A2):接受提案前的快照說明改為「AI 提案(模型),你修改後接受」,不露出提案 ID;補「刪除分類前」。
- **#146、#152 專注寫作**(#116 PR-1):打字機捲動與段落淡化合成一個開關,工具列常駐按鈕,快捷鍵只留 Ctrl+Shift+D。#146 只跑 `paper --smoke`,漏掉 640 寬章名被擠到 34px 的回歸(`--all` 才抓到),#152 把窄版圖示按鈕改 `iconSm` 修正。
- **#151 打字機音效**(#116 PR-2):Web Audio 程式合成;預設關閉,設定頁「作品」可開關與調音量;只在稿件內文按鍵時響,中文輸入法每次選字送出響一次。
- **#153 介面修正第一批**(#28,依 Codex 介面檢查與作者勾選):設定頁換頁回到頂端、字級收斂到標準類別、書櫃「找不到資料夾」警告不再跟著變淡、「·」分隔改標點或分欄。第二批(陰影、圓角、Tip、離場動畫)待做。
- **派工**:#145、#146、#151、#153 由本機模型 mirai-s-27b 實作(花費 0)。設計寫死在任務說明時可交付,每件仍有 1–3 處小錯(回報宣稱與實際位置不符一次),一律逐行核對。
- **作者待實測**:打字機音效的聽感與注音選字(#116 完成條件);專注寫作按鈕;格式子選單與快捷鍵。

## 2026-10-25 — 合併 #136、#137、#139、#140(#133、#132、#130、#131)

- **#136 Harness 小修**(#133,dsh-code deepseek-flash 初版):稽核與來源紀錄寫入失敗不再被吞;同一次詢問內看得到剛拒絕的提案;OpenAI 相容串流非正常結束或被截斷回錯。Codex 1 Major(還原/接受後來源紀錄失敗跳過重載)Orchestrator 自修(`recordError`)。
- **#137 讀取與外送邊界**(#132,Pi mimo-v2.6-pro-ultraspeed 誤派):Bot 讀取、提案與接受拒絕經過資料夾連結的路徑;模型請求不跟隨跨來源重新導向。Codex 1 Major(連結過濾讓作者側欄與快照看不到連結檔)Orchestrator 自修,過濾移到 Bot 層。
- **#139 格式子選單與快捷鍵**(#130,同上誤派,超過停損後 Orchestrator 接手):右鍵「格式」標題 1/2/3、內文、粗體、斜體、場景分隔;`Ctrl+1/2/3/0/B/I`。
- **#140 提案接受流程**(#131,Pi mimo-v2.6-pro 初版):同一作品的存檔/接受/拒絕/還原序列化;寫入前再確認稿件未被外部改動;先存提案狀態再寫稿。Codex 三輪後 Approve。原本疊在 #136、#137 上,兩者 squash 合併後與 main 出現假衝突(衝突檔在 main 上與原基礎相同),保留分支版本;合併後 `go vet`、`go test ./...`、前端建置通過。
- **作者待實測**:接受提案時外部同步程式改稿的「未套用」提示;格式子選單與快捷鍵的實際手感。

## 2026-10-15 — 合併 #127、#128、#129(#124、#80、#114)

- **#127 拒絕提案後 Bot 不再提案**(#124,Pi/MiniMax M3.1 Flash Preview 初版與兩輪返工):提案卡處理後留在建立它的那個對話原位,顯示已拒絕(附理由)/已接受;理由存進提案 JSON。Bot 端改為**每次送出時依本會話建立過的提案 id 即時讀提案檔**,在系統訊息組「本次對話的提案現況」(最近 20 筆),History 不寫任何提案通知。Orchestrator 初審 3 Major(已處理卡作品層級、無理由拒絕未通知、連續 user 訊息);Codex 再審 4 Major(壓縮後連續 assistant、finish 倒回待審、壓縮期間通知遺失、跨會話狀態過期),Orchestrator 改設計後全解;複審 1 Major(提案檔損壞被靜默略過)Orchestrator 自修 26414db。
- **#128 Caps Lock 快捷鍵**(#80,同上實作):Ctrl+Shift+F 改到 capture 攔截(原本 CM 的 Mod-f 會順手開搜尋)、Ctrl+S 不分大小寫(原本 Caps Lock 下不存檔);Ctrl+F/H 原本正常只補檢查。Codex 審出 Ctrl+S 測試實際送成 Ctrl+Shift+S、右鍵選單在 capture 後不收起,Orchestrator 自修 b7f3d5e。
- **#129 Bot 技能與「/」選單**(#114,MiniMax 初版、Qoder/Qwen3.8-Flash 返工第 1 輪):`~/.perkins/skills/<名>.md`,`/技能名` 只作用於該次提問;`/new`、`/compact` 內建優先;後端讀檔前驗證技能名為單一檔名。Codex 審出 3 Major(ListSkills 呼叫 prepare 改寫執行中端點、路徑穿越、E2E 覆寫作者同名技能檔)+ 2 Minor,Qwen 修;剩 1 Minor(換行後選單仍開)Orchestrator 修 9400ae8。合併 main 時 `app/app.go` 衝突(#127 移除 `saveRejections`)與重複的測試輔助函式由 Orchestrator 解決(f837b38),冷啟動 `E2E_SKIP_AI=1 --all` 675/677。
- **觀察**:MiniMax 照定好的設計實作可交付,需要自己想清楚時序/例外的設計會反覆返工;Qwen3.8-Flash 照明確說明修補可靠,但未遵守 `E2E_SKIP_AI=1`(載入本機模型致記憶體吃緊)且報告稱全程略過。實作者的測試數字一律由 Orchestrator 以正確方式複驗。
- **仍未解決**:`bot-chat`「#32 雲端端點未確認時 /compact 被外流確認擋下」在作者端點已確認的環境必然失敗;`bible`「設定的登場索引列出章節」在 `--all` 偶發(單獨重跑通過);組間隱含相依(`titlebar-zen` 需在 `search-editor`/`paper` 前、`sessions` 在 `polish` 前會讓 polish 中斷)。
- **作者待實測(未用真實模型驗證)**:帶理由/不帶理由拒絕後 Bot 是否重新提案;Caps Lock 下 Ctrl+S、Ctrl+Shift+F(硬體鍵盤);放一份技能檔以 `/名稱` 叫用。

## 2026-10-14 — E2E 修正合併(#125、#126)

- **#125 shelf 組**(#113,MiniMax M3.1 Flash Preview 實作):平台輸出改走清單 → 子頁 → 返回;組開頭先收合前組留下的對話框(`--all` 時 `chat-fab` 不 render 的中斷點)。Codex 審查無發現。
- **#126 layout-half 模型名截斷**(#78,同上實作):量測前以 `SetActiveModel` 換成受控長模型名,不再依賴本機 settings.json。Codex 審出 1 Major(換名後無 try/finally,等待或量測丟例外時作者 settings.json 留下假模型名)+ 1 Minor(等待受控長名的逾時被吞掉,可能誤報通過),Orchestrator 修(7dbb997);破壞驗證:換名後立即 throw,settings.json 仍還原。複審 Approve。
- **觀察**:兩項皆中等難度;診斷與重現設計佳,弱點在失敗路徑與 PR 宣稱(#126 內文聲稱「失敗不殘留」與程式不符)。
- **仍未解決**:`bot-chat`「#32 雲端端點未確認時 /compact 被外流確認擋下」在 main 上失敗;`layout-half` 單獨執行依賴 `polish` U7 建立的長章名章節(組間隱含相依)。

## 2026-10-14 — 合併與重新編譯(#119、#121、#123)

- **#119 設定集**(#117,子代理實作):視窗回到前景時重讀檔案樹/索引/字數;點到已不存在的檔案提示並更新清單;設定集刪除按兩次確認、移到回收區。Codex 審出 2 Major(刪除目前檔案未先存檔、讀檔失敗路徑繞過未存內容保護),Orchestrator 修:刪除前先存檔(大綱/筆記同修),未存內容保護移到 tree effect。
- **#121 外觀頁**(#118,Pi/MiniMax M3 初版與第 1 輪返工,詳見下方兩段):之後 Orchestrator 再修——衍生 token 的 CSS 變數名未轉 kebab-case(自訂色時卡片/選單文字色從未套用)、重新套用前沒清舊覆寫;Codex 審出交錯保存互相覆蓋等 1 Major + 3 Minor,重審再審出佇列失敗時畫面與設定檔錯開,改為「同時最多一個寫入、每次只送最新設定」。
- **#123 轉場**(#120,子代理實作):原 PR #122 疊在 #121 分支上,作者在 #121 合併後也合併了 #122,改動落在過時分支而沒進 main;同樣的提交 cherry-pick 到 main 重開為 #123。另加:減少動態效果時載入轉圈照常旋轉。
- **E2E 偶發(原因不明)**:`visual-1b` #39 一項 10 次 1 次;`bible`「設定的登場索引列出章節」組合執行時 1 次(單獨重跑 2 次通過)。
- **重新編譯**:以 `main` 10204ec `wails build`,放在 `app/build/bin/perkins.exe`(上一版備份 `D:\AgentCoding\.codex\perkins-exe-before-20261014.exe`);啟動 8 秒正常、`settings.json` 未變動(舊 `theme` 欄位在第一次改外觀時才轉成 `appearance` 寫回)。
- **作者待確認**:檔案總管刪設定檔後切回 Perkins 清單更新;四個主題觀感;跟隨系統隨 Windows 深淺色切換;啟動是否閃一下;轉場觀感;減少動態效果開啟後 AI 改動標示仍可見。

## 2026-10-14 — 介面轉場效果,可由「減少動態效果」關閉(#120)

作者發現介面幾乎沒有轉場,外觀頁(#118)的「減少動態效果」等於沒作用,決定補上輕量轉場並可關閉。規則寫在 SPEC §17.3「轉場」與 UI_GUIDE §15。

- **轉場**(`src/lib/motion.ts`,tailwindcss-animate 的 `animate-in`,200ms ease-out,只做進場):書櫃與作品畫面淡入;設定頁淡入加上移、切換導覽頁內容淡入、清單 → 子頁(端點、作者指示、平台)由右滑入、返回清單淡入;側欄由左滑入、切換面板內容淡入;資訊欄由右滑入;Perkins Bot 浮窗與圓鈕只淡入(不縮放:浮窗拖曳與「回到畫面內」依實際尺寸計算,縮放中量到的尺寸會偏小);專注模式 E2E 量測透明度前等漸變結束;離開禪模式時圖示列、側欄、工具列、資訊欄重新顯示即播放進場;專注模式段落淡化加 200ms 透明度漸變。
- **教訓**:tailwind 的 `duration-200` 同時設定 `transition-duration`,而 `transition-property` 預設是 `all`,掛上它的元素所有樣式變化(浮窗的 left/top)都會跟著漸變;`--all` 時 #55「縮窄後浮窗回到畫面內」因此失敗。動畫時長改用 `[animation-duration:200ms]`。
- **不做離場動畫**:關閉時立即移除,不為離場延後卸載元件。
- **減少動態效果**:沿用 #118 的 `.reduce-motion` 歸零規則;另加例外,`.cm-ai-flash`(接受提案後改動標示 3 秒)與 `.cm-flash`(跳行閃爍 1.2 秒)維持原時長、改 `steps(1, end)`,不漸變、時間到直接消失。
- **驗證**:`tsc --noEmit`、`npm run build` 通過;E2E(`E2E_SKIP_AI=1`)`settings-layout` + `titlebar-zen` + `--smoke` 118/118,新增 4 項 #120 檢查;破壞驗證以改動前的 `SettingsPage.tsx`、`style.css` 執行 → 3 項 FAIL,還原後通過。

## 2026-10-14(晚) — 外觀頁 #118 重工(第 1 輪):修 Orchestrator 審查 5 Major + 1 Minor

Major
- **自訂色不再覆蓋主題預設檔**:`applyCustomSide(sideCfg, isDark)` 以讀主題實際的 `--background` / `--foreground` / `--primary` 作為 fallback;只改強調色時只覆寫 `primary` / `primary-foreground` / `ring` / `selection`,背景與文字保留主題預設檔色調(深灰/米白不會被變成夜間書房/白紙)。App.tsx 改用 `applyCustomSide` 取代之前的 `applyDerivedTokens(deriveTokens(...))` 寫法。
- **跟隨系統即時切換**:matchMedia 變更時把 `sysDark` / `sysReducedMotion` 寫進 state,套用 effect 的依賴包含它們;OS 主題變更與作業系統減少動態偏好變更都會即時套用。原本只用 `setTick` 推 render、但 effect 依賴只有 `[appearance]`,不會重跑。
- **hex 文字框不再重掛**:`ColorField` 從父層 render 內定義搬到外面;內部用本地 `draft` state;`onBlur` 才提交合法 `#rrggbb`,打未完成(例如「#」或「#1」)不提交、失焦時不合法就還原為已存值;允許大寫輸入並存小寫。`<input type="color">` 挑色器仍即時生效(本來就是合法 hex)。
- **強調色改成下拉**:跟隨主題 + 6 個具名顏色(色點 + 名稱);選項值存 hex;`ACCENT_PRESETS` 真正拿來用、不再只是 unused import。
- **後端嚴格驗證**:`SetAppearance` 對未知 `mode` / preset / 字級 / 減少動態、非法色碼回錯並拒絕寫進磁碟;大寫 hex 接受並轉小寫。`normalizeAppearance`(舊檔載入用)寬鬆保留、`validateAppearance`(寫入邊界用)嚴格。前端改為「先等 `SetAppearance` 成功才 `setAppearance`」,失敗顯示設定頁錯誤列、不在畫面上吹作者已儲存。新增 `TestValidateAppearanceRejectsInvalidAndLowercasesHex` / `TestSetAppearanceRejectsBadValuesAtBoundary` / `TestLoadStillTolerantForLegacyFile` 三個測試。

Minor
- 移除 `SetTheme` 線定與 `SettingsView.Theme` 欄位(已無前端使用者);`Settings.Theme` 只在讀舊檔時保留。`bible.js` 改讀 `appearance.mode`。

驗證:go test ./... 全綠、tsc --noEmit 0 錯、npm run build 成功;E2E settings-layout 72/72(含 4 個 #118 重工檢查:深灰+藍、米白+自訂背景手動輸入 hex、SetAppearance 拒絕不合法值、system 模式隨 emulateMedia 切換)、bible 38/38、--smoke 9/9。破壞驗證:反向斷言三個新檢查都會 FAIL → 改回後 72/72。截圖:81-appearance-graphite-blue.png(深灰+藍)、82-appearance-cream-custom-bg.png(米白+自訂背景)。

## 2026-10-14 — 外觀頁可自訂主題(Issue #118)

作者參考 Codex 桌面版設定頁後提出(Issue #118):不要再只是「深色 / 淺色」二選一,加上「深灰」「米白」兩個新主題,並開放強調色、背景、前景自訂,讓作者能依個人在寫作環境的偏好微調。依照 #0 第 9 條:不加任何新技術(取色器用原生 `<input type="color">`);不為「之後可能用到」加設定項(不做程式碼字型、差異標記樣式、半透明側欄、指標游標、匯入/匯出主題)。

- **視覺風格區塊**:
  - **模式**:深色 / 淺色 / 跟隨系統(分段按鈕);跟隨系統以 `matchMedia('(prefers-color-scheme: dark)')` 為準,訂閱變更即時切換。
  - **主題**(下拉):深色兩款 — 「夜間書房」`study`(沿用 `.dark` 預設)、「深灰」`graphite`(中性深灰,完整 token 組寫在 `.dark.theme-graphite`,背景近 #181818);淺色兩款 — 「白紙」`paper`(沿用 `:root` 預設)、「米白」`cream`(比白紙明顯更黃,完整 token 組寫在 `.light.theme-cream`)。下拉只列出目前生效那一邊(深或淺);深色與淺色各自記住選擇(切換模式再切回不會丟)。
  - **強調色**(下拉):「跟隨主題」+ 6 個具名顏色(琥珀/藍/綠/紅/紫/青,在深淺底都清楚的色值;作者提供語意,不照搬 Codex)。
  - **背景**、**文字顏色**:色塊(`<input type="color">`)+ hex 文字;空值 = 跟隨主題,每列有「清除」回主題值。
  - 自訂背景/文字/強調色時,其他 token(sidebar/rail/paper/card/popover/muted/secondary/accent/border/input/...)由前端純函式 `deriveTokens(bg, fg, accent, isDark)` 推算,以 inline style 寫到 `document.documentElement`;primary/ring/selection 用強調色,primary-foreground 依 luminance 自動選黑或白。前景與背景對比 < 4.5:1 在文字色列下方顯示警告(不阻止儲存)。
- **進階區塊**(可收合,預設收合):
  - **介面字體大小**:小 / 標準 / 大,html 根字級 15 / 16 / 17px;稿紙字級以 rem 表示會一起等比縮放。
  - **減少動態效果**:系統 / 開啟 / 關閉;開啟時 html 加 `.reduce-motion`(CSS 讓 transition/animation 歸零,並設 `scroll-behavior: auto`),「系統」跟隨 `prefers-reduced-motion`。
  - **重置為預設值**:回到深色夜間書房/淺色白紙、無自訂色、標準字級、跟隨系統動態,稿紙版面不受影響;兩步確認(同刪除端點的樣式)。
- **稿紙版面區塊**:保留現狀,排在外觀頁底部。
- **後端**(`app/internal/settings`):
  - 新增 `Appearance` 型別與 `SideAppearance`(preset/accent/background/foreground);`Settings` 加 `appearance` 欄位,舊 `theme` 欄位標為已棄用(存回時清掉,讀取時遷移到 `Appearance.Mode`)。
  - 設定檔只接受合法值:`normalizeAppearance` 過濾未知 mode/preset/字級/減少動態、非法色碼(#rgb、空、隨意字串),不為作者偷偷保存。
  - 舊設定檔只有 `theme: "dark"|"light"` 時:`theme=dark` → `appearance.mode=dark`、`dark.preset=study`;`theme=light` → `appearance.mode=light`、`light.preset=paper`;作者現有設定不丟失。
  - Go 測試:`TestAppearanceMigratesLegacyThemeField`、`TestAppearanceNormalizesUnknownAndBadValues`、`TestNormalizeHexColor`,加原有 `TestPaperLayoutDefaultsAndLegacyFile` 改成驗證「舊 theme 遷移到 appearance.mode」並移除原期望中的 `"theme"` 欄位檢查。
  - 新綁定 `SetAppearance(appearance)` 寫入並儲存;`App.SetTheme("dark"|"light")` 保留為舊版相容(寫進 `Appearance.Mode`)。
- **前端**(`app/frontend/src/`):
  - `appearance.ts` 新檔:`hexToHSL` / `deriveTokens` / `applyDerivedTokens` / `clearDerivedTokens` / `contrastRatio` / `ACCENT_PRESETS`;HSL 是 H/S/L 結構,CSS 變數是 "H S% L%" 與 style.css 既有的格式一致。
  - `App.tsx` 把單一 `theme` state 換成 `appearance`;啟動時 `GetSettings` 讀 `appearance` 寫進狀態;effect 依 `mode` 決定當前側、套用 `dark`/`light` + `theme-graphite`/`theme-cream` class、套用 `ui-font-*`、`reduce-motion`、自訂色時 inline style 覆寫 token;matchMedia 變更時(僅 system 模式)重新 render。
  - `SettingsPage.tsx` 外觀頁改寫:視覺風格區塊(模式分段 / 主題下拉 / 三個色欄)+ 進階 details(字級 / 減少動態 / 重置)+ 稿紙版面。
  - `style.css` 加 `.dark.theme-graphite`、`.light.theme-cream` 完整 token、`html.ui-font-small/large`、`reduce-motion` class(transition/animation/scroll-behavior 歸零)。
- **Wails 綁定**:`SetAppearance` 與 `settings.Appearance` / `SideAppearance` 型別已在 `frontend/wailsjs/go/main/App.d.ts`、`models.ts` 中(早先版型預生成的)正好符合本次需要,不需要另動綁定。
- **驗證**:
  - `go test ./...` 全綠(12 個套件含新增的 3 個 settings 測試);`tsc --noEmit` 0 錯;`npm run build` 成功(38.99 kB CSS、1.10 MB JS)。
  - Wails 綁定變動為後端新加 `SetAppearance`;前端已同步(物件字面值經 `settings.Appearance.createFrom` 轉成實例後送出)。
- **不做**:程式碼字型、差異標記、半透明側欄、指標游標、匯入/匯出主題(作者明示不需要)。

## 2026-10-13 — 設定檔回到純 Markdown:移除分類,Perkins 只寫別名(作者回饋)

作者實際使用新版後回饋:預設分類棘手、設定檔開頭的 frontmatter(`type/name/aliases`)對作者是負擔,每位作者整理設定的方式不同,Bot 也會自己查閱檔案。SPEC §12.2 改寫(取代 #100「分類只用內建清單」)。

- **移除分類**:新增設定對話框、EntityHeader、Notion 匯入「匯入為」不再有分類;資訊欄「本章提及的設定」不再顯示類型。`bible.Entity` 去掉 `Type`、`bible.Types`/`TypeOther` 移除。作者以 `canon/` 資料夾自行分類。
- **新增設定**:`NewDoc(dir, title)`(綁定少一個參數)建立只有 `# 名稱` 的 Markdown,不寫 frontmatter、不預設「外貌/個性…」欄位。
- **EntityHeader 只剩別名**:`ApplyEntityHeader(content, aliases)` → `bible.SetAliases`:只改 `aliases`;清空時移除該欄,frontmatter 因此變空就整段移除(純 Markdown 加了又清掉別名回到原內容);其他欄位與本文不動。名稱 = 檔名,舊檔的 `name` 仍讀取。
- **Notion 匯入**:去處 設定/大綱/筆記/略過,匯入 `canon/` 不加 frontmatter;依資料夾名猜「設定/大綱/筆記」。
- **相容性**:舊檔的 `type`、`name` 與其他欄位原樣保留,Perkins 不改寫。
- **驗證**:`go test ./...` 通過;`tsc --noEmit`、`npm run build` 通過;E2E(`E2E_SKIP_AI=1`)bible、titlebar-zen 58/58,notion、search-editor 通過;`--all` 605/607,兩項失敗與本次無關:`bot-chat` #32 依作者實際的目前端點是否為未確認雲端端點;`shelf` 停在平台輸出預覽(#110 改為清單+子頁後該組未更新,main 既有問題)、`--all` 時另因前組留下的狀態找不到 chat-fab。
- **E2E 教訓**:EntityHeader 由 `ParseEntity`(防抖 200ms)跟上套用後的內容;連續操作要等「套用」按鈕消失再輸入,否則輸入會被同步蓋回。
- **重新編譯**(合併後):以 `main` d554d50 `wails build`,放在 `app/build/bin/perkins.exe`(上一版備份 `D:\AgentCoding\.codex\perkins-exe-before-20261013b.exe`);啟動 8 秒正常、`settings.json` 未變動。#94 作者實測不再閃爍。

## 2026-10-13(夜) — 設定資料夾搬到 ~/.perkins、本段提到的設定、平台輸出頁改版、下拉閃爍(#104、#108、#94)

作者決定(#104 留言)後由 Orchestrator 推進;各 PR 均經 Hemingway(Codex)審查通過後合併。

- **#107 設定資料夾**:`%APPDATA%\Perkins` → `%USERPROFILE%\.perkins`(設定、全域 AGENTS.md、sessions)。新資料夾不存在時以一次 rename 搬移;只有 ErrNotExist 才當不存在,其他查詢錯誤不改用空白目錄;沒有可用目錄時錯誤對話框後結束;E2E 在未搬移時拒絕執行。**作者機器已完成搬移**(2026-10-13 E2E 啟動時),搬移後 `~/.perkins` 與事前備份逐檔相同;備份在 `D:\AgentCoding\.codex\perkins-appdata-backup-20261013`(作者確認新版正常後可刪)。
- **#109 本段提到的設定**:取代「建議附加」,只把選取段落(或目前文件)提到的設定「名稱(路徑)」附給 Bot,不送內容;作者排除且未附加的不列;送出預覽列出。另:雲端確認說明、附加提示、移除資料夾鎖頭、預覽可讀範圍文字;E2E `polish` U5 自 #101 起已失效的檢查改寫;pi-dispatch 啟動 pane 的工作目錄與回報規則修正。
- **#110 平台輸出頁**(Pi 實作,0.109 美元):清單+子頁,恢復預設與刪除兩步確認;審查發現平台清單整份覆寫造成的並行寫入覆蓋,改為模組層級寫入佇列、輪到時讀後端最新清單(兩輪返工由 Orchestrator 完成)。
- **#111 下拉閃爍(#94)**:捲動箭頭改為疊在清單上、Viewport 加 scroll-padding。**原問題在無頭 Edge 無法重現**,#94 標「待作者實測」、未關閉。
- **重新編譯**:以 `main` c70bbf3 `wails build`,放在 `app/build/bin/perkins.exe`(舊版備份 `D:\AgentCoding\.codex\perkins-exe-before-20261013.exe`);啟動 8 秒正常、使用 `~/.perkins`、設定未變動。
- **作者待辦**:實際開新版確認設定與對話記錄都在;測 #94 下拉捲到底是否還閃爍。

## 2026-10-13 — 設定頁 Perkins Bot 頁改為清單+子頁(Issue #95)

依 `docs/UI_GUIDE.md` §12(作者提供 Codex 設定頁案例後定案)。

- **版型**(`app/frontend/src/SettingsPage.tsx`):新增共用 `Section`(標題在卡片外)、`RowCard`、`SettingRow`(左名稱+說明、右控制項)、`FieldRow`(長文字標題在上)、`NavRow`(「›」進子頁)、`SubpageHeader`;內容區加頁名(`settings-page-title`)。Perkins Bot 頁:端點清單(`profile-list`/`profile-card-<id>`)→ 端點子頁(`profile-page`,「連線」「模型」兩區塊,按儲存才寫入);作者指示兩列入口(`agents-row-global`/`agents-row-project`)→ 子頁編輯。新增/從預設新增後直接進入新端點子頁。
- **刪除端點**:子頁標題列,兩步確認(`delete-profile` → `delete-profile-confirm`/`delete-profile-yes`),說明金鑰一併移除;只剩一個端點時停用並以提示說明原因。
- **離開保護**:子頁回報未儲存狀態(每次 render 回報);返回、切換導覽頁、關閉設定頁(含 Esc)時提醒(`unsaved-leave`:繼續編輯/捨棄並離開);點目前所在的導覽頁不動作。
- **只有按儲存才寫入**:載入模型清單不再先存表單,連線欄位(網址、API 型別、金鑰)未儲存時停用並說明;清除金鑰只動金鑰;儲存回應只同步「送出後沒再改過」的欄位(後端正規化如空白名稱補網址會同步,儲存期間的新輸入保留)。
- **手冊**:`UI_GUIDE.md` 第 3 節區塊標題字級與第 12 節矛盾,以第 12 節為準(區塊標題 14px 粗體;18px 明體改列對話框標題)。SPEC §17.2 同步。
- **審查**:Hemingway(Codex)三輪——初審 2 Major + 1 Minor(同頁導覽後未儲存狀態被清掉、載入清單偷存表單、空白名稱殘留未儲存),返工時另修清除金鑰連帶寫入;複審發現返工新增的儲存競態(回應覆蓋儲存期間的新輸入),再修;第二次複審通過。
- **E2E**(`settings-layout`,Windows,`E2E_SKIP_AI=1`):改走清單 → 子頁;新增清單頁不攤開表單、刪除兩步確認、離開保護、載入清單不偷存、同頁導覽不清未儲存、空白名稱同步、儲存期間新輸入保留(以延遲回應的 `SaveProfile` 替身)共 7 項;修正版 51/51(含 `--smoke` 59/59),各修正逐一改回後對應檢查 FAIL。
- **教訓**:Playwright `waitForFunction` 的條件要同步回傳布林值;本輪一開始寫成回傳 Promise 的條件,檢查在回應交回前就判斷,改壞實作也照樣通過,靠破壞驗證才發現。
- **未做**:平台輸出頁的平台清單同樣要改成清單+子頁;作品頁、平台輸出頁的設定列尚未改用共用元件(UI_GUIDE §14)。

## 2026-10-12 — 產品設計減法:Bot 可讀範圍、雲端確認一次、移除管理分類(Issues #98、#99、#100)

來源:Perkins Bot 與作者操作體驗的設計審查,作者決策採用 P1–P3;送出預覽、提案、快照、工具列與名稱追蹤維持現況。

- **Bot 可讀範圍(#98)**:`perkins.json` 新增 `botRead`(`project.Config.BotReadable()`;沒有的鍵套預設 = 只有 `canon` 可讀,舊作品不需遷移;`Project.SetBotRead` 以新 map 寫入、失敗還原)。`App.prepare` 每次組裝前把可讀資料夾套到 `agent.Agent.Readable`;`gate` 加「資料夾/」鍵,`gate.ok` = 非受保護 ∪ 本次附加 ∪ 可讀資料夾,`read_document`/`search_project`/`list_files`/`propose_patch` 沿用同一個 gate(寫入仍只能提案)。可讀範圍內的檔案**不預先送出全文**。`list_files` 受保護區塊標題改為「設定、大綱、筆記(作者允許讀取或本次附加)」;工具說明、未授權錯誤訊息與系統提示最後一條同步(系統提示只加一句「設定等資料不必等作者附加,可自行查找」,維持既有濃縮測試的預算邊界)。`agent.Preview.readable` 回報實際範圍,送出預覽「AI 工具可讀取範圍」依它顯示。設定頁 Perkins Bot 頁新增「Bot 可讀範圍」區塊(三列開關,`bot-read-<資料夾>`,開作品才顯示),綁定 `GetBotRead`/`SetBotRead`。設定集側欄與大綱/筆記的說明文字同步。
- **雲端外流確認一次並保存(#99)**:`settings.Profile.RemoteAckURL` + `RemoteConfirmed()`;`App.AckRemote` 設定、`SaveProfile` 不接受前端傳來的值(網址沒變沿用);`ProfileView.remoteOk`。`App.begin()` 拒絕送出到未確認的雲端端點(對話、`/compact`、章節摘要共用)。前端移除 `Workspace` 的 `remoteOk` 狀態(原本回書櫃再開作品就重設),`ChatWindow`/`SummaryDialog` 改讀 `profile.remoteOk` 並呼叫 `AckRemote`。
- **移除管理分類(#100)**:刪除 `AddCategory`/`CategoryUsage`/`DeleteCategory`/`EntityTypes`/`ProjectPath` 綁定、`categories.json` 讀寫與 `writeList` 測試注入點、`categories_test.go`(9 個只測分類機制的測試);前端刪除 `useCategories` 共用狀態、`setCategoriesProject`、`Workspace.deleteCategory` 與管理分類對話框。新增設定、EntityHeader、Notion 匯入只列內建分類(Notion 去處以 `bible.Types` 驗證)。既有非內建 `type` 照常讀取、顯示(EntityHeader 列在內建之後)與保留;`categories.json` 不刪除、不再讀取。
- **測試(Go)**:`TestBotReadableFoldersAreToolReadableButNotPushed`、`TestAttachmentStillGrantsOutsideReadableScope`、`TestBotReadDefaultsAndPersists`、`TestBotReadSettingAppliesToNextRequest`、`TestRemoteAckPersistsUntilURLChanges`、`TestNonBuiltinTypeStillParsedAfterCustomCategoriesRemoved`。破壞驗證:gate 不看資料夾 → 可讀範圍測試 FAIL;`SaveProfile` 接受前端的確認值、`begin()` 不檢查確認 → 確認測試各自 FAIL;還原後全綠。另修 `TestListFilesToolDefSerializesWithObjectSchema` 以單次 `Read` 讀 HTTP body、body 變長讀不完整的測試問題(改 `io.ReadAll`)。
- **驗證**:Linux 雲端環境 `go test ./...` 除既有失敗外全綠——`sessions.TestProjectsAreIsolated`(依賴 Windows 路徑不分大小寫)在 `main` 上同樣失敗;原 `TestDeleteCategoryRollsBackWhenSecondWriteFails`(root 不受唯讀權限限制)已隨分類機制移除。`tsc --noEmit`、`npm run build` 通過。介面以 Vite + Playwright 注入模擬綁定實際 render(1280×800、640×672):Bot 可讀範圍區塊與開關、640 寬內容區無水平捲軸、設定集側欄無「管理分類」、非內建 type「組織」照常顯示、雲端確認勾選後呼叫 `AckRemote` 並消失、送出預覽列出實際可讀資料夾。
- **未做/邊界**:完整 E2E(需 Windows `wails dev` 與本機模型)未在此環境執行;`bible` 組改為檢查「沒有管理分類入口」與「非內建 type 照常顯示、檔案未被改寫」,其餘自訂分類檢查隨功能移除;`bot-chat` 的 `/compact` 外流確認檢查沿用(新端點未確認時仍擋下)。`NoteRejection` 對受保護資料夾仍不附原文片段(保守,未隨可讀範圍放寬)。

## 2026-10-12 — 設定頁改版:Perkins Bot 獨立設定頁 + 外觀分頁(Issues #38、#88)

- **導覽四頁**(`app/frontend/src/SettingsPage.tsx`):「作品 / Perkins Bot / 平台輸出 / 外觀」;「Perkins Bot」取代「AI 模型」(`tab-models` 沿用,舊 E2E 可用),外觀為新 `tab-appearance`;**導覽欄底部不再放主題與稿紙版面**。預設開啟頁維持 Perkins Bot;未開作品時沒有作品頁。
- **Perkins Bot 頁**(原 `ModelsTab` 改寫為 `PerkinsBotTab`,分「模型端點」「作者指示(AGENTS.md)」兩個有標題與說明的區塊):端點清單與編輯表單(新增/刪除/金鑰 keyring/雲端外流標示不變);「**從預設新增**」下拉(`ListProfilePresets()`,依「本機/服務商」分組、國際站/中國站與 Anthropic 原生標示;選了就建立端點帶入名稱、網址、Provider、建議上下文長度(預設檔沒給值時用 16384)與預設模型,金鑰欄空白由作者填;仍可「新增空白端點」);**API 型別**(OpenAI 相容/Anthropic 原生)可切換;**思考強度**下拉(不指定/低/中/高/更高/最高,依 Provider 顯示允許值,切換 Provider 時不合法的值重設為不指定);模型(抓清單/手填)、上下文長度、自動壓縮、API 金鑰都在同頁。
- **作者指示 AGENTS.md 編輯(#38)**:兩個編輯區——全域(`%APPDATA%\Perkins\AGENTS.md`)與目前作品(作品根目錄 `AGENTS.md`,沒開作品不顯示);顯示估算長度與上限(4000 估算 tokens)與超限警示,按「儲存」才寫檔(不存在即建立;清空儲存 = 寫入空檔不刪檔),寫檔失敗顯示錯誤;說明兩層關係(作品層優先、不能改變 G1–G4)。這是作者本人編輯(與 G1 不衝突),Bot 工具仍碰不到這兩個檔。
- **後端綁定**(`app/app.go`):`ReadAgentsMd(scope)`/`WriteAgentsMd(scope, text)`(scope = `global`|`project`;沒有開作品讀寫專案層回錯、未知 scope 回錯、寫檔失敗回錯)/`AgentsMdTokens(text)`;`AgentsMdView{text, tokens, limit, path}`。
- **Agent**(`internal/agent/agent.go`):`authorInstructions` 回傳實際送出的層名稱;`buildMessages` 回 `buildInfo{Instructions, Notices}`;**`Preview` 加 `Instructions`**(送出預覽逐項列出,前端不自己猜);`agentsLimit` 匯出為 `AgentsLimit`;新增 `EstimateAgentsMd`(與上限比較同一套估算,空內容為 0);空檔(去除首尾空白後為空)視為沒有指示,不列層也不送出標題。
- **送出預覽**(`ChatWindow.tsx`):「本次直接送出」逐項列出作者指示(例如「· 作者指示:作品 AGENTS.md」,`preview-instructions`);超過上限未送出的不列入,原因照現有 notices 顯示。
- **外觀頁(#88,`AppearanceTab`)**:主題兩張較大的選擇卡(`theme-dark`/`theme-light`,含圖示、名稱、說明與選中態);稿紙版面三列(左名稱+一句說明、右控制項),沿用 `paper-width`/`paper-font-size`/`paper-gap` 與 `*-opt-<值>` 選項 testid;行為不變(即按即存、立即套用、重開保留)。`overlay.tsx` 加 `SelectGroup`/`SelectLabel`。
- **測試(Go,2 個新測試)**:`TestPreviewInstructionsListsSentLayers`(兩層依序列出、超過上限整份不送出的層不列入且原因在 Notices、都沒有時為空、列出的就是實際放進 system 的層);`TestAgentsMdReadWrite`(global/project 讀寫、檔案不存在讀為空、儲存即建立、清空儲存=寫入空檔不刪檔、寫檔失敗回錯、未知 scope 回錯、未開作品讀專案層回錯)。
- **破壞驗證 2 輪**(拿掉實作 → 該測試 FAIL → 還原,還原後 `go test ./...` 全綠):①`authorInstructions` 不回報送出層 → Instructions 測試 FAIL(`got []`);②`WriteAgentsMd` 寫到錯路徑 → 讀寫測試 FAIL(儲存後檔案不存在)。
- **E2E**:`settings-layout` 43 項(四頁導覽切換、導覽欄底部無主題/稿紙、外觀頁主題切換會保存、外觀頁 900/640/1280 捲軸與無水平捲軸、稿紙三項齊全、從預設新增帶入名稱/網址/Provider/金鑰留空、思考強度選項依 Provider 變化並保存(xhigh)、切回 OpenAI 相容時重設不指定、AGENTS.md 編輯儲存後寫入磁碟、估算長度與上限、全域編輯區與路徑);`bot-chat` 加 2 項(送出預覽列出本次送出的作者指示、超上限未送出的不列入清單);既有用到導覽欄底部主題/稿紙的組(bible、layout-visual、paper、search-editor、shelf、visual-1b)在點主題/稿紙前加「切到外觀頁」一步(16 處)。**基準:全新 fixture `--reuse --all` 621/621 passed、略過 8(E2E_SKIP_AI=1),268s**。另有一輪 `--all` 出現 `visual-1b`「#39 舊格式提案(單一版本)不顯示版本切換,照常接受」FAIL——單獨跑 visual-1b 50/50、`research polish visual-1b` 103/103 都無法重現,之後三輪全綠,**原因不明的偶發失敗**(與本次改動的區域無關)。
- **截圖(實際 render,已檢視)**:`app/e2e/shots/`(已 .gitignore)——Perkins Bot 頁 `10-settings-models.png`(1440 寬)、`72-settings-models-900.png`、`76-settings-models-640.png`;外觀頁深 `78-settings-appearance-900.png`、淺 `79-settings-appearance-900-light.png`;640 寬兩頁 `76-settings-models-640.png`、`78-settings-appearance-640.png`。另以像素量測核對主題與選中卡一致(深色圖 = 夜間書房選中、淺色圖 = 白紙選中)。
- **E2E 環境**:鎖檔(`D:\AgentCoding\.codex\worktrees\maze\e2e.lock`,noclobber)進出一次已釋放;`settings.json` 備份後 sha256 逐位元組還原一致;`%APPDATA%\Perkins\` 無 AGENTS.md 殘留(全程未寫作者真實全域檔)、`sessions\` 無殘留;依 PID 只結束自己啟動的程序(perkins-dev、wails、vite,無殘留);`clean-recent.js --dry-run` 0 項。**`--all` 含 `shelf` 組:系統剪貼簿被「複製到平台」覆寫(既有行為,無法還原)**。
- **綁定生成**:`wails generate module` 更新 `App.d.ts`/`App.js`/`models.ts`(runtime 3 檔與 `go.mod` 只有 EOL 差異,未提交)。
- **SPEC 同步**:§17.2 改寫(四頁、Perkins Bot 頁內容、AGENTS.md 編輯、外觀頁、驗收三頁→四頁、第 7 項改為外觀頁);§12.3 作者指示 AGENTS.md 補設定頁編輯與送出預覽逐項列出、思考強度與端點預設檔補設定頁 UI;§17.3 稿紙版面入口改為外觀頁;§13 主畫面設定頁一行描述更新。
- **未做/邊界**(另待作者決定,不在本任務範圍):權限收緊(停用個別工具/呼叫前詢問)、Bot 以提案修改 AGENTS.md 皆未做;E2E 只實測作品層 AGENTS.md 寫入磁碟(不寫作者真實的全域檔,讀寫由 Go 測試覆蓋);估算長度是保守估算(與送出上限同一套,非模型 tokenizer);E2E_SKIP_AI=1 未跑模型段(bot-chat 提案 8 項照舊略過)。

## 2026-10-12 — Anthropic 原生 Messages API、思考強度、端點預設 Profile(後端與綁定;Issues #30、#43)

- **設定**(`app/internal/settings/settings.go`):`Profile` 加 `Provider`(`""`/`openai` = OpenAI 相容 `/chat/completions`;`anthropic` = Anthropic 原生 Messages API)與 `ReasoningEffort`(空 = **不指定**,不送任何思考參數)。載入與存回時正規化(同稿紙版面做法):未知 Provider 視為 OpenAI 相容、不在 `low/medium/high/xhigh/max` 的思考強度視為不指定。舊設定檔沒有這兩個欄位 = 現行行為,不需遷移。
- **OpenAI 相容思考強度**(`internal/llm/llm.go`):`OpenAI.ReasoningEffort` 非空且合法(`low/medium/high`)才送——OpenRouter(host `openrouter.ai`)送 `reasoning: {effort}`,其他送 `reasoning_effort`;`xhigh`/`max` 只有 Anthropic 原生支援,設在 OpenAI 相容端點視為不指定(各自驗證)。空值時送出的 JSON 與改動前**逐位元組相同**(測試以 golden 字串鎖住,本機小模型不受影響)。
- **Anthropic 原生客戶端**(`internal/llm/anthropic.go`,新檔,標準函式庫手寫,沿 `OpenAI` 客戶端風格):`POST {BaseURL}/messages`(預設 `https://api.anthropic.com/v1`),標頭 `x-api-key`、`anthropic-version: 2023-06-01`、`content-type: application/json`,`stream: true`、必填 `max_tokens: 32000`、頂層 `cache_control: {type: "ephemeral"}`(官方自動快取)、思考強度送 `output_config.effort`(`low/medium/high/xhigh/max`,**不送 `thinking` 欄位**,官方:新模型預設自適應思考)。轉換:system 收斂頂層 `system`;assistant 的 tool calls 轉 `tool_use`(`input` 由參數 JSON 解析,解析不了送 `{}`);`tool` 角色轉 user 的 `tool_result`,連續的 tool 結果合併同一個 user 訊息;工具定義用 `input_schema`。串流解析 `content_block_start`/`content_block_delta`(`text_delta` → onDelta、`input_json_delta` → 累積工具參數、`thinking_delta`/`signature_delta` → 累積)、`message_delta`、`message_stop`;**`error` 事件回傳錯誤不吞**。`ListModels` = `GET /models`(同標頭)的 `data[].id`。
- **thinking 區塊原樣傳回**:`llm.Message` 加 `Thinking json.RawMessage`(JSON 標記 `json:"-"`):保存 thinking/redacted_thinking 區塊陣列(含 signature),官方規定工具迴圈中要完整、不修改地傳回下一次請求。agent 的工具迴圈本來就把整則回覆附回 msgs,因此只在**同一個請求的記憶體**中往返;不進對話歷史(`History` 只存文字回合)、不進研究記錄、不給前端。組 assistant 訊息時放在 text/tool_use 之前;OpenAI 相容客戶端忽略它。
- **`clientFor`**(`app/app.go`):依 `Profile.Provider` 建立 `llm.OpenAI` 或 `llm.Anthropic`(回傳型別改為 `llm.Service` = `Chat` + `ListModels`),並帶入 `ReasoningEffort`;`IsRemote` 與雲端外流確認不變。
- **端點預設檔**(`app/internal/settings/presets.go`,新檔;App 綁定 `ListProfilePresets`):26 筆——本機 5(LM Studio、Ollama、llama.cpp server、vLLM、Jan)、服務商 13(OpenRouter、Fireworks AI、Together AI、OpenAI、Google AI Studio 的 OpenAI 相容入口、DeepSeek、xAI、Groq、Mistral、Cerebras、DeepInfra、SiliconFlow、Anthropic 原生)、z.ai/DashScope(通義千問)/MiniMax/Moonshot 各國際站+中國站 8 筆。只含 id、顯示名稱、網址、Provider、站別(`intl`/`cn`)、是否本機、建議上下文長度(全部留 0 = 不設定,載入套 §15 預設 16384 或作者填)與 z.ai 的預設模型名 `glm-5.3`(官方範例模型;z.ai 沒有 `/models` 端點);**不含任何金鑰**。綁定經 `wails generate module` 更新(`App.d.ts`/`App.js`/`models.ts`;runtime 3 檔只有 EOL 差異未提交)。
- **預設檔網址核對(官方文件)**:LM Studio `https://lmstudio.ai/docs/developer/openai-compat`、Ollama `https://ollama.com/blog/openai-compatibility`、llama.cpp `github.com/ggml-org/llama.cpp` 的 `tools/server/README.md`、vLLM `https://docs.vllm.ai/en/stable/serving/online_serving/openai_compatible_server/`、Jan `https://www.jan.ai/docs/desktop/api-server`、OpenRouter `https://openrouter.ai/docs/api-reference/overview`、Fireworks `https://docs.fireworks.ai/getting-started/quickstart`、Together `https://docs.together.ai/docs/openai-api-compatibility`(文件寫 `https://api.together.ai/v1`)、Google AI Studio `https://ai.google.dev/gemini-api/docs/openai`、DeepSeek `https://api-docs.deepseek.com/`、xAI `https://docs.x.ai/docs/overview`、Groq `https://console.groq.com/docs/openai`、Mistral `https://docs.mistral.ai/api/`、Cerebras `https://inference-docs.cerebras.ai/quickstart`、DeepInfra `https://deepinfra.com/docs`、SiliconFlow `https://docs.siliconflow.cn/cn/usercases/use-siliconcloud-in-OpenClaw`、Anthropic `https://platform.claude.com/docs/en/api/overview`、z.ai `https://docs.z.ai/guides/overview/quick-start`、智譜 `https://docs.bigmodel.cn/cn/guide/develop/openai/introduction`、MiniMax `https://platform.minimax.io/docs/guides/text-generation` 與 `https://platform.minimax.cn/docs/guides/text-generation`、Moonshot `https://platform.moonshot.ai/docs/intro` 與 `https://platform.moonshot.cn/docs/intro`。兩項注意:① **OpenAI `https://api.openai.com/v1` 未核對**(官方文件頁抓取被 403 擋下);② DashScope 官方文件現在列 `{WorkspaceId}` 區域網址(`{WorkspaceId}.cn-beijing.maas.aliyuncs.com` 等),舊共用網址(`dashscope-intl`/`dashscope.aliyuncs.com`)只出現在遷移註記且註明仍可用 → 預設檔沿用舊共用網址;③ llama.cpp 官方文件的預設 port 是 **9931**(`8080` 只在 Docker 範例顯式指定),預設檔依官方寫 `http://localhost:9931/v1`,與任務說明的 `8080` 不同,待作者確認。
- **測試(Go,12 個新測試)**:`internal/llm` 9 個——OpenAI 空值/不合法值時 body 與改動前逐位元組相同、OpenRouter 與其他端點各自欄位、Anthropic 請求格式(標頭、頂層 system、tool_use/tool_result 轉換與合併、`input_schema`、`output_config`、`cache_control`、`max_tokens`)、Anthropic effort 驗證(收 `xhigh`/`max`、拒 `ultra`、不送 `thinking`)、串流解析(文字、工具參數分片、thinking+signature)、**工具迴圈第二次請求原樣帶回 thinking 區塊**、error 事件回錯、ListModels、HTTP 錯誤;`internal/settings` 3 個——舊設定檔載入為 OpenAI 相容且不指定思考強度、Provider/思考強度正規化、預設檔清單合法(id 可用、不重複、26 筆齊全、無金鑰欄位)。
- **破壞驗證 7 輪**(拿掉修補 → 該測試 FAIL → 還原,還原後全綠):①OpenAI 不驗證思考強度 → 逐位元組測試 FAIL;②OpenRouter 判定失效 → 各自欄位測試 FAIL;③assistant 不帶回 thinking 區塊 → 原樣帶回測試 FAIL;④Anthropic 不驗證思考強度 → effort 驗證 FAIL;⑤error 事件吞掉 → 錯誤測試 FAIL;⑥tool 結果不轉 `tool_result` → 請求格式測試 FAIL;⑦載入時不正規化 → 正規化測試 FAIL。
- **驗證**:`go test ./...`(app/ 全模組,含根套件;前端先 `npm run build` 產生 `frontend/dist`)全過;E2E(冷啟動,改過 Go 與綁定;E2E_SKIP_AI=1)`bot-chat --smoke` **26/26 passed、略過 8 項**(模型相關,含 bot-chat 提案段)。E2E 環境:開跑前 `netstat` 確認 34115 空閒、鎖檔(`.codex/e2e.lock`,noclobber)進出一次、`settings.json` 備份後 md5 逐位元組還原一致、依 PID 只結束自己啟動的程序(wails/perkins-dev/vite/WebView2,無殘留)、書櫃無垃圾(`clean-recent.js` dry-run 0 項)。本次無介面變更、未覆寫剪貼簿(`shelf` 未跑)。
- **SPEC 同步**:§12.3 新增「端點 API 型別與思考強度」「端點預設檔」。
- **未做/邊界**:設定頁介面由 #38 另一任務做(本次未動 `SettingsPage.tsx`);未呼叫任何真實雲端 API(無金鑰,httptest 覆蓋),Anthropic 原生端點未真機驗證;z.ai coding plan 專用端點未列入預設檔;thinking 區塊只在工具迴圈內往返,跨回合(新一輪提問)不帶回(官方要求只在工具迴圈內);送出預覽與預算估算仍以 Agent 組裝的訊息為準(A6),不呈現各家 wire 格式。

## 2026-10-12 — Perkins Bot 對話記錄:保存、接續、封存、刪除(Issue #33)

- **新套件 `app/internal/sessions`**:對話記錄存 `<設定目錄>/sessions/<作品鍵>/`(設定目錄沿用 `settings.NewStore` 的 `os.UserConfigDir()`,與 `settings.json` 同層、依作品分開),與作品內 `audit.jsonl`、研究記錄完全分開、互不取代,不寫入作品資料夾。作品鍵 = 作品根目錄絕對路徑(正斜線、小寫)的 SHA-256 前 32 位 hex;作品搬家後舊記錄不跟著走(已知限制,已寫入 SPEC)。一份會話一個 JSON(`Session`):id、建立/更新時間、標題(第一個問題截短 40 字)、`History`(`llm.Message`,含濃縮摘要)、`rejections`(#40 拒絕原因)、`turns`(前端顯示列:user/assistant/工具列/通知,含 `args`/`result`/`bad`)。狀態一般/封存/已刪除,已刪除放 `<作品鍵>/trash/`;`Save` 以暫存檔+rename 寫入並清掉狀態變更前的舊位置檔案;`List` 回傳摘要(`Meta`:標題、更新時間、回合數=使用者提問數、狀態),損毀的記錄檔回錯不當成空清單(沿 §12.2 原則);寫入失敗一律回傳錯誤。
- **App 綁定**(`app/app.go`,新欄位 `curSess`):`ListSessions`(含目前會話標示)、`SaveSession(turns)`、`ResumeSession(id, currentTurns)`、`ArchiveSession(id,on)`、`DeleteSession`、`RestoreSession`、`PurgeSession`。`SaveSession`:空會話(沒有任何回合)不存檔;同 id 再存時保留 CreatedAt 與狀態(接續中的封存會話維持封存);舊記錄不在(被永久刪除)就開新 id。`ResumeSession`:請求進行中(`a.cancel != nil`)拒絕切換;目前會話先存好再切換;History 與拒絕原因載回 Agent(`RestoreSession`);已刪除的要先還原才能接續。刪除/永久刪除目前會話時清空 `curSess`,下一次保存開新會話(不清空畫面上的對話)。`ResetChat`(新對話)與 `setProject`(換作品)也清空 `curSess`。
- **Agent**(`app/internal/agent/agent.go`):新增 `Snapshot()`(回傳 History 與拒絕原因的副本)與 `RestoreSession(history, rejections)`(載回兩者);接續後下一次組裝訊息自然含舊 History 與拒絕原因(Interpretation:只當對話上下文參考,不會成為 Canon)。
- **前端**(`ChatWindow.tsx`):標題列加「對話記錄」按鈕(`sessions-btn`),開啟清單對話框(`sessions-dialog`):分「最近/封存/已刪除」(`session-tab-*`),每列標題、更新時間、回合數、目前會話標示(`session-current`),按鈕接續/封存/刪除(`session-resume/archive/delete`);已刪除列為還原/永久刪除(`session-restore/purge`),**永久刪除先顯示「永久刪除後無法還原」+ 確定/取消**(`session-purge-confirm/cancel`),取消則不刪。開啟清單固定回到「最近」分頁(避免停留在剛清空的分頁)。回合結束(`chat:done` 成功後)與手動壓縮後(`setSaveTick` 觸發的 effect)以 `SaveSession` 存一次目前會話,寫檔失敗顯示在對話框錯誤列不靜默;`ResumeSession` 由前端帶入目前 turns(後端先存再切換),接續後載回 turns、重算用量。
- **測試(Go,15 個新測試)**:`internal/sessions` 7 個(存讀往返含 History/rejections/turns、狀態移動含 trash 位置與永久刪除、刪除守衛、不同作品互不相見+鍵正規化、清單含回收區且損毀回錯、寫檔失敗回錯、標題截短);`internal/agent` 2 個(接續後下一次送給模型的訊息含舊 History 與拒絕原因、Snapshot/Restore 對稱且回副本);根套件 6 個(App 層保存/接續往返、Resume 先存目前會話、空會話不存檔、寫檔失敗回錯、請求進行中拒絕切換、刪/封/還原/永久刪除與刪後開新會話)。
- **破壞驗證 5 輪**(拿掉對應實作 → 該測試 FAIL → 還原,還原後 `go test ./...` 全綠):①`Session.Rejections` 不序列化 → 往返 FAIL;②`RestoreSession` 不載入拒絕原因 → 「系統訊息應含拒絕原因」FAIL;③`Delete` 直接刪檔不搬 trash → 狀態移動 FAIL;④空會話也存檔 → 空會話 FAIL;⑤`ResumeSession` 不先存目前會話 → 先存再切換 FAIL。
- **E2E(新組 `sessions`,18 項檢查,不呼叫模型)**:以 `__perkinsChatInject` 注入一個回合 + 綁定 `SaveSession` 保存 → 磁碟有記錄檔;清單顯示標題/回合數/目前標示;新對話後從清單接續看到舊 turns 且不另存一份;封存→封存分頁→取消封存→回最近;刪除→已刪除分頁(回收區)→還原→回最近;永久刪除先確認(取消不刪)→確定後清單與磁碟皆無殘留;640 寬清單在視窗內、無水平捲軸(對話框 32..608/640)。**基準 `--reuse --all`(全新 fixture,E2E_SKIP_AI=1)593/593 passed,略過 8 項,263s**(= 既有 575 + 本次 18);另單獨驗證 `sessions bible` 58/58、`sessions` 18/18。
- **E2E 抓到並修正的兩個問題**:①重開清單停在上次的分頁(剛刪完就是空的「已刪除」)→ 開啟固定回「最近」;②640 段結束後資訊欄已被 §17.1 互斥收合(視窗變寬不自動重開),下一組看不到 `appearances` → 測試組結束前記錄並補回資訊欄狀態。另:量測/截圖要在 Radix 開啟動畫結束後(動畫期間 transform 蓋掉置中位移,量到的框會超出視窗,非版面問題)。
- **截圖(實際 render)**:`C:\Users\tiger\AppData\Local\Temp\perkins-sessions-33\shots\sessions-list-1280.png`、`sessions-list-640.png`(同名檔案也在工作樹 `app/e2e/shots/`,已 .gitignore);已實際檢視:640 寬清單完整、按鈕不被裁、無水平捲軸。
- **E2E 環境**:`settings.json` 備份後逐位元組還原(md5 一致)、無殘留程序(perkins-dev/wails/vite 已結束)、書櫃無垃圾(`clean-recent.js` dry-run 0 項)、`%APPDATA%\Perkins\sessions\` 無殘留(測試組只清 fixture 作品的鍵,開跑與結束各一次)、鎖檔已釋放。**`--all` 含 `shelf` 組:系統剪貼簿被「複製到平台」覆寫(既有行為,無法還原)**。
- **SPEC 同步**:§12.3 新增「對話記錄」(位置、格式、狀態、何時存、接續語意、介面),§15「刪除 = 移到回收區」補對話記錄的回收區位置。
- **未做/邊界**:接續後送出的內容照常計入上下文預算與預覽(A6),但 E2E 未驗失敗寫入時的錯誤列前端行為(由 Go 測試覆蓋:寫檔失敗回錯);封存中的會話接續後維持封存(未自動取消);E2E_SKIP_AI=1 未跑模型相關段(bot-chat 提案 8 項照舊略過);研究記錄與 `audit.jsonl` 格式與寫入時機不變。
## 2026-10-11 — 提案一次提供多個改寫版本,最多 3 個(Issue #39)

- **資料模型**(`app/internal/proposal/proposal.go`):保留 `Replacement`(主版本)+ 加 `Label`(主版本方向)與 `Alternatives []Version{Label, Replacement}`(最多 2 筆,由系統邊界驗證),另有 `AcceptedVersion`(接受時選的序號,0 = 主版本)。`Versions()` 回全部版本。舊提案 JSON 沒有這些欄位 → 照常可讀、視為單一版本、照常接受。原文比對、BaseHash、Start/End、衝突判斷不變(所有版本替換同一段原文,G3 不變)。
- **工具 `propose_patch`**(`agent.go`):參數加選填 `label` 與 `alternatives`;邊界驗證 `parseAlternatives`——格式不對整個忽略(退回單一版本,提案不失敗)、超過 2 筆只取前 2 筆、空白或與原文/其他版本相同的丟掉,每一種都在工具結果說明給模型(含「(N 個版本)」)。系統提示補一句:多個合理改寫方向時可附最多 3 個版本並各自標短方向,只有一種時只給一個,不標示哪個「最佳」。
- **接受流程**:`Store.Accept(id, version, edited)` 加 version 參數(超出範圍回錯且不動狀態);寫入 = 所選版本或作者編輯後的版本(編輯以所選版本為底,部分採用語意不變)。Provenance accept 事件與研究記錄 `proposal_accept` 記 `version`/`versions`(replacement 記所選版本的原文);提案 JSON 記 `acceptedVersion`。拒絕 = 全部版本一起拒絕(#85 行為不變)。`App.AcceptProposal(id, version, edited)` 綁定同步。
- **前端**:`ProposalReview.tsx` 「修改後」上方加版本切換(顯示 label,`data-testid=review-version-<i>`,包在 `review-versions`;單一版本不顯示);**編輯以「提案#版本」為鍵分開保存**——作者編輯過再切換版本,各版本的編輯都留著、切回來就看得到(選擇另存一份的做法,不提示、不丟掉);「還原 AI 版本」還原為目前所選版本;接受鈕帶目前版本序號與編輯文字。`ChatWindow.tsx` 提案卡顯示「N 個版本」(`proposal-versions`),`edited` 鍵改「提案#版本」(卡片任一版本被編輯過就顯示已修改),`accept(p, version, mine)` 直通綁定。
- **測試(Go,3 個新測試;既有 10 個 `Accept` 呼叫補上版本 0,機械改動)**:`TestCreateVersionsSavesAllAndLegacyJSONStaysReadable`(多版本建立與保存、舊 JSON 可讀可接受、選不存在的版本回錯);`TestAcceptSelectedVersionWritesThatVersion`(接受第 2 個版本寫入第 2 個、超範圍回錯不動狀態、編輯第 2 個版本以它為底、Provenance 與研究記錄記 version/versions);`TestProposePatchAlternativesSanitizedAtBoundary`(格式不對退回單一版本、超過 2 筆只取前 2 筆、空白/重複丟掉,三種都在工具結果說明)。
- **破壞驗證 4 輪**(拿掉對應實作 → 該測試 FAIL → 還原,還原後 `cmp` 逐位元組相同):①Accept 忽略版本一律寫主版本 → FAIL;②`Versions()` 不回替代版本 → 3 項 FAIL;③格式不對時靜默吞掉(不說明)→ FAIL;④Provenance 不記版本 → FAIL。
- **驗證**:`go test ./...`(app/ 全模組)全過;前端 `npm run build`(tsc + vite)通過;`wails generate module` 更新綁定(`AcceptProposal` 加 version、`proposal.Version` 類別;runtime 3 檔只有 EOL 差異未提交)。
- **E2E(visual-1b 新增 9 項,`data-testid` 與現有 fixture 寫法)**:卡片顯示「2 個版本」、版本切換依 label 且預設第 1 個、切換版本編輯框換內容、編輯後切換不丟(各版本分開保留)、接受所選的第 2 個版本寫入磁碟(Provenance `version:1,versions:2`)、640 寬版本切換與接受/拒絕都在視窗內可點、編輯第 2 個版本後接受寫入作者版本、舊格式提案不顯示版本切換照常接受。基準:`bot-chat polish visual-1b close-guard --smoke`(E2E_SKIP_AI=1)**163/163 passed,略過 8 項**;單跑 visual-1b 49/49。
- **截圖**:`app/e2e/shots/82-multi-version-card.png`(卡片「2 個版本」「3 個版本」)、`83-multi-version-review.png`(1280 寬版本切換)、`84-multi-version-review-640.png`(640 寬上下堆疊,版本切換與頁尾按鈕都在視窗內);已實際檢視。
- **E2E 環境**:`settings.json` 備份後逐位元組還原(md5 一致)、依 PID 只結束自己啟動的程序(無殘留)、書櫃無垃圾、鎖檔已釋放;`shelf` 組未跑(未覆寫剪貼簿)。
- **SPEC 同步**:§12.3 新增「多版本提案」,§12.8 `proposal_accept` 補 version/versions。
- **未做/邊界**:版本數不提供作者自訂(固定最多 3 個,依作者定案);不改 #85 的拒絕原因流程;提案卡不給直接接受(卡片只做通知,#45 不變)。

## 2026-10-11 — 自動上下文壓縮開關＋/compact 手動壓縮(Issue #32)

- **設定**(`app/internal/settings/settings.go`):`Profile` 加 `DisableAutoCompact bool json:"disableAutoCompact,omitempty"`,每個端點各自一個;缺省 = 自動壓縮**開啟**,舊設定檔沒有欄位不需遷移。`app.go` 的 `prepare` 套用端點時一併傳給 `Agent.DisableAutoCompact`(同 `ContextTokens` 的傳法)。
- **後端 `Ask`(`app/internal/agent/agent.go`)**:自動壓縮關閉時,送出前超過預算**不呼叫** `compactCollect`,直接回錯誤(「送出內容約 N tokens,超過模型可用的 M,而自動壓縮已關閉。可輸入 /compact 手動壓縮較早的對話,或開新對話;也可以減少附加的檔案、取消前情摘要。」);`finish` 內回合結束後的 40% 門檻壓縮也加 `!DisableAutoCompact` 門檻,關閉時不做。開啟時行為完全不變(既有測試照過)。`Preview.Over` 註解同步改寫(開/關兩種語意)。
- **`/compact`**(`App.CompactChat` 綁定 → `Agent.Compact`,即原本的 `compact` 匯出):不論開關都能手動壓縮一次,沿用 B7 的通知;對話太短(`History` ≤ compactKeep)回「沒有可濃縮的較早對話」明確告知。走 `begin()`/`end()`(同時只允許一個模型請求,結束釋放執行權)。聊天輸入送出內容剛好是 `/compact`(前後空白忽略)時呼叫它,不送給模型、不進對話歷史(前端也不加 user turn),錯誤顯示在對話框錯誤列。
- **浮窗狀態指示**(`ChatWindow.tsx`):標題列「上下文 N%」旁加「自動壓縮開/關」(`data-testid=auto-compact`;關閉時警示色),tooltip 說明行為;640 寬放得下、無水平捲軸。`送出預覽` 的 `preview-over` 文案分支:關閉時不再說「送出時會先濃縮」,改說「送出會被擋下,可 /compact 或開新對話」。
- **設定頁**(`SettingsPage.tsx` AI 模型分頁):端點表單加「自動壓縮上下文」核取方塊(勾 = 開啟,`data-testid=auto-compact-setting`)+ 關閉後行為說明;「上下文長度」提示同步改為「自動壓縮開啟時,超過會先濃縮」。跟表單其他欄位一樣按「儲存」才生效。
- **測試(Go,5 個新測試)**:`TestAutoCompactDisabledBlocksOverBudgetWithoutCompacting`(超過預算回錯誤含 /compact 與既有建議、0 個模型請求=沒有壓縮請求);`TestAutoCompactDisabledSkipsPostTurnCompact`(3 回合後歷史越過 40% 門檻——測試內自檢前提——不發通知、不發壓縮請求、歷史 6 則不變);`TestManualCompactWorksWhenAutoCompactDisabled`(關閉時 /compact 仍壓縮成功且發通知);`TestManualCompactTellsWhenNothingToCompact`(太短時明確回錯);`TestCompactChatWiringAndPreparePassesSwitch`(app 層:綁定回傳「沒有可濃縮」原樣錯誤、結束釋放執行權、忙碌時拒絕、prepare 套開關到 Agent);`TestAutoCompactDefaultsOnForLegacyProfile`(settings:舊檔無欄位 = 開啟、關閉後存回保留)。
- **破壞驗證 5 輪**(拿掉對應實作 → 該測試 FAIL → 還原,還原後 `cmp` 逐位元組相同):①拿掉送出前的關閉分支 → 超預算測試 FAIL;②拿掉回合後門檻的開關條件 → 回合後不壓縮測試 FAIL(同時證明該情境真的會觸發壓縮);③`Compact` 被開關擋住(錯誤實作)→ 手動壓縮測試 FAIL;④載入時強制關閉 → 舊設定檔預設開啟測試 FAIL;⑤`CompactChat` 吞掉錯誤 → 綁定測試 FAIL。
- **驗證**:`go test ./...`(app/ 全模組)全過;前端 `npm run build`(tsc + vite)通過;`wails generate module` 更新綁定(`CompactChat`、Profile 欄位;runtime 三個檔只有 EOL 差異已還原不提交)。E2E(冷啟動,E2E_SKIP_AI=1)`settings-layout bot-chat polish visual-1b --smoke` **131/131 passed,略過 8 項**;tooltip 文字調整後以 `--reuse` 對最終程式碼再跑一次,同 131/131。
- **截圖(實際 render,工作樹外)**:`C:\Users\tiger\AppData\Local\Temp\perkins-f2f049bc\shots\` 下 `compact-setting-1280-off/1280-on/640-on.png`(設定頁開關關/開狀態、含說明文字)與 `compact-indicator-640-on/640-off/1280-on/1280-off.png`(浮窗指示兩種狀態×兩個寬度,含 tooltip);已實際檢視:640 寬指示與 tooltip 完整、無水平捲軸(文件 scrollWidth 實測不超出)。
- **E2E 環境**:`settings.json` 備份後逐位元組還原(md5 一致)、無殘留程序、書櫃無垃圾、鎖檔已釋放;`shelf` 組本次未跑(未覆寫剪貼簿)。
- **SPEC 同步**:§12.3 新增「自動壓縮開關與 /compact」、§12.3 對話壓縮與 §15 上下文預算串接、B7 補手動壓縮語意。
- **未做/邊界**:`/compact` 成功路徑未進研究記錄(§12.8 未列獨立 compact 事件;`audit.jsonl` 照舊記 compact,審計完整);E2E 未驗 `/compact` 成功壓縮(E2E_SKIP_AI=1 不呼叫模型),行為由 Go 測試覆蓋;未跑 `--all`。

## 2026-10-11 — 系統提示去掉寫死的作品類型、對話中可展開工具呼叫(Issue #34 第 5、7 項)

- **A. 系統提示中性化**(#34 第 5 項,`app/internal/agent/agent.go`):`systemPrompt` 第一行「作品是中文輕小說。」改為「作品類型、讀者與風格以作者在 AGENTS.md 的說明與作品內容為準。」(作品指示已由 #75 讀進系統訊息,不另做讀取);`summaryPrompt` 的「你是輕小說編輯助手」改「你是寫作編輯助手」。`app/internal/publish/publish.go` 的平台名稱「菠蘿包輕小說」不動。G1–G4 相關句子一字未動。
- **B. 對話中可展開的工具呼叫**(#34 第 7 項,含 #37 移交的「Agent 以工具讀取或搜尋到的內容」):
  - 後端:`Event` 加 `Result`(`json:"result,omitempty"`),工具迴圈改為**執行完才 emit** `tool` 事件,帶上回給模型的同一段結果;錯誤帶「錯誤:…」,被拒帶回給模型的那段拒絕訊息(含可用工具清單)。顯示端由 `displayResult` 截斷到 2000 字並附「…(已截斷,共 N 字)」;送給模型的內容、審計與研究記錄都不變。
  - 前端(`ChatWindow.tsx`):工具列改為 `<details>` 可展開——收合是一行摘要(「讀取 path」/「搜尋 query」…),錯誤/被拒在收合就以【錯誤】/【已拒絕】標示並用警示色;展開顯示完整參數(JSON 排版)與結果,`whitespace-pre-wrap break-words` 換行、框內捲動(max-height + overflow-y-auto)。`Turn` 以 `args`/`result`/`bad` 攜帶顯示資料,`__perkinsChatInject` 因此可注入工具列(截圖用)。只改顯示,不新增任何工具權限。
- **測試(Go,1 個新測試)**:`TestToolEventsCarryResult` — 成功/錯誤/被拒/超長四種工具事件都帶結果;成功與被拒時顯示的與回給模型的訊息逐字一致;錯誤帶「錯誤:」前綴;超長時顯示端截斷到 2000 字並註明總字數、送給模型的仍是完整內容。
- **破壞驗證 2 輪**(拿掉對應實作 → 該測試 FAIL → 還原,還原後 `cmp` 逐位元組相同):①tool 事件不帶 `Result` → FAIL;②`toolResultDisplayLimit` 改 1000000(不截斷)→ FAIL。
- **驗證**:`go test ./...`(app/ 全模組,含根套件 embed)全過;前端 `npm run build`(tsc 型別檢查 + vite)通過。E2E(冷啟動後執行,E2E_SKIP_AI=1)`bot-chat polish visual-1b --smoke` **104/104 passed,略過 8 項**,零 FAIL。既有 E2E 沒有檢查工具列文字(搜 `role === 'tool'` 與 tool 列 testid 皆無),無需更新。
- **截圖(實際 render,放在工作樹外)**:`C:\Users\tiger\AppData\Local\Temp\perkins-f1b5681\shots\tool-turn-640.png` / `tool-turn-1280.png`(640×672 與 1280×800,以 DEV hook `__perkinsChatInject` 注入工具事件後展開成功/錯誤/被拒/截斷四種;已實際檢視:參數 JSON、結果、錯誤與被拒的警示標示、長結果框內捲動)。640 實測無水平捲軸(文件/浮窗/對話區 scrollWidth 皆不超出)。
- **E2E 環境**:`settings.json` 備份後逐位元組還原(md5 一致)、無殘留程序、書櫃無垃圾、鎖檔已釋放;`shelf` 組本次未跑(未覆寫剪貼簿)。破壞驗證依任務只要求 Go 測試層(上方 2 輪);前端未加 E2E 檢查、未做破壞輪,以型別檢查、建置與實際 render 核對。
- **SPEC 同步**:§12.3 新增「系統提示不寫死作品類型」「對話中可展開的工具呼叫」兩條。
- **未做**(依任務限制):不動提案卡/審查視窗、不動工具權限與 G1–G4 行為、`publish.go` 平台名稱不動;研究記錄與 `audit.jsonl` 內容不變。

## 2026-10-11 — 設定集側欄改資料夾檔案樹(#31 第一步,SPEC §12.2)

- **只改呈現**:`app/frontend/src/panels/BiblePanel.tsx` 設定集清單從「依分類分組」改為依 `tree.canon` 路徑組成**資料夾檔案樹**(canon/... 遞迴,後端 `listMD` 本來就是遞迴的)。同層「資料夾在前、檔案在後」,各自依 `localeCompare(..., 'zh-Hant')` 排序;資料夾列可點擊展開/收合(預設展開,狀態只存記憶體,搜尋時強制展開);檔案列顯示檔名(去 `.md`),`index.entities` 該路徑有別名時以淡色接在檔名後,右側沿用登場次數;點擊開檔、目前檔案高亮,沿用 `entity-row` 樣式與 testid(另附 `data-file`,資料夾列 `data-testid=canon-folder`+`data-folder`,供 E2E 精確定位)。
- **搜尋**:改為比對檔名、實體名稱與別名;有搜尋字時只顯示符合的檔案及其上層資料夾。placeholder 改「搜尋檔名、名稱或別名」——原本與按鈕同列時新 placeholder 會被截成「搜尋檔…」,所以搜尋框改整行、「新增/管理分類」移到第二列(行為不變,僅版面)。
- **移除分類分組**:`group-*` 區塊與 `TYPE_ICON`/`iconFor` 一併移除(`TYPE_ICON` 無其他使用處)。「新增」「管理分類」、對話框、空狀態、底部提示不變(新增仍建在 `canon/` 根目錄、帶 frontmatter)。後端、frontmatter/索引/寫法檢查/附加建議、Notion 匯入、EntityHeader 均未動。
- **E2E(bible 組 +7 項)**:子資料夾檔案顯示在對應資料夾下(根層不混入)、資料夾收合隱藏子檔案再展開恢復、搜尋檔名/搜尋別名只剩符合項與上層資料夾、無 frontmatter 的檔可開啟(含 EntityHeader 名稱=檔名)、640 寬無水平捲軸(超長檔名截斷)、測試檔清掉不留痕跡。fixture 自建自清:`canon/人物/主要角色.md`(無 frontmatter、一檔多人物)、`canon/組織/夜鶯團.md`(別名 小夜)、超長檔名檔。
- **既有 3 項檢查改看同一意圖**(不刪檢查、不弱化、名稱保留):原本依賴 `group-組織`/`group-其他` 的,改成「建立後出現在設定集清單 + 檔案 frontmatter `type: 組織`」(讀檔)、「刪除後檔案仍在清單 + `BibleIndex` 的 type=其他」(原「分組移到其他」)、「天網二 在清單 + 磁碟 `type: 組織`」。三者都比原本多一個型別條件,不弱於原斷言;因意圖的實作在 Go 端(`NewDoc` 模板/`DeleteCategory` 改型),前端破壞無法使它們 FAIL,未做破壞輪。
- **破壞驗證 5 輪**(拿掉對應實作 → 對應檢查 FAIL → 還原):①`buildTree` 不建子層(檔案全放根層)→「子資料夾顯示」FAIL;②資料夾點擊不收合 →「收合/展開」FAIL;③搜尋不過濾 → 搜尋檔名/別名 2 項 FAIL;④子資料夾檔案列點擊不開檔 →「無 frontmatter 可開啟」FAIL;⑤檔名改 `whitespace-nowrap` 不截斷 →「640 無水平捲軸」FAIL(treeOK/rowsOK)。6 項新功能檢查各有至少一輪 FAIL;「測試檔已清掉」是測試自體清潔檢查、無對應產品實作,7 輪全 PASS。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)**574/574 passed**,略過 8 項,257s(改動前同一基準實測 **567/567**、254s,= 567 + 本次 7,其他組檢查數未變;PROGRESS 舊記載的 527 已過時,其他合併陸續加檢查未更新該數字)。另跑 bible+冒煙 49/49。settings.json 已逐位元組還原、書櫃無殘留;`shelf` 組「複製到平台」覆寫了系統剪貼簿(既有行為,無法還原)。
- **截圖**:`app/e2e/shots/32-canon-tree-dark`/`33-canon-tree-light`(深/淺各一、含子資料夾,已實際檢視:資料夾在前、縮排層級、別名淡色、超長檔名截斷、placeholder 完整可讀)。
- **未做**(SPEC §12.2 明示不做):名詞清單、右鍵「追蹤這個名字」、AI 找名詞候選、段落級附加、Notion 匯入改版。
- **待作者實機**:真實作品資料夾結構下的側欄手感(無頭環境只驗到 E2E 層)。

## 2026-10-11 — 稿紙化第二階段(一):打字機捲動與專注模式(Issue #44)

- **新模組 `app/frontend/src/paperModes.ts`**(與 paper.ts 並列,`Editor.tsx` 以兩個 Compartment 開關):兩者都是只改呈現的 CodeMirror extension;狀態在 `Workspace.tsx`(記憶體,與禪模式同一模式)、選單在 `TitleBar.tsx`(與禪模式同一區)、快捷鍵在 Workspace 的全域 keydown(`Ctrl+Shift+T`/`Ctrl+Shift+D`,進出同鍵)。
- **打字機捲動**:輸入或移動游標後以 `coordsAtPos` 把游標行對到編輯區上方約 40%(rAF 量測後調 `scrollDOM.scrollTop`,上下界夾住:文件開頭不足以捲動時不硬拉)。**只在 `docChanged`/`selectionSet` 後定位**:作者滾輪/捲軸捲動(只有 `viewportChanged`)不搶回,直到下一次輸入或移動游標;明確定位(scrollToLine、場景跳轉)後同樣停在固定位置。文件結尾另由 `.cm-host.cm-typewriter .cm-content` 的 `padding-bottom: 62vh` 支撐(預設 40vh 不到 60vh,結尾游標只能停在約 60% 處;關閉即恢復)。IME 組字中不捲動(會打斷組字),記 pending、`compositionend` 後補定位。
- **專注模式**:line decoration(`cm-paper-dim`,`opacity: 0.35`)只算可見範圍前後各 60 行;不淡化的判準與 paper.ts 的 touching 相同(游標或選取碰到該行),所以選取跨多段時選取涵蓋的段落都不淡化;空行不套用(沒有文字,分隔空行另由 paper.ts 折起);標題、場景分隔、程式碼區塊一樣依是否在游標所在段落淡化。游標行從不淡化(IME 組字中不動到組字的行);decoration 實例重複使用(同 paper.ts,CM 才只更新變動的行)。
- **快捷鍵查證**:既有快捷鍵(存檔 `Ctrl+S`、禪模式 `Ctrl+Shift+F`、搜尋 `Ctrl+F/H`、`Alt` 系列)與 CodeMirror defaultKeymap/historyKeymap/searchKeymap 皆無 `Ctrl+Shift+T`/`Ctrl+Shift+D`;組字中(`isComposing`/keyCode 229)不動作。
- **E2E(paper 組 +18 項)**:選單開啟後開頭不硬拉、選單反映狀態且選完能回到編輯器、輸入與方向鍵移動時游標行維持固定範圍(同時驗游標真的有動、內容捲動而非游標往下跑)、快捷鍵關閉後恢復一般行為、快捷鍵開啟後回固定位置、滾動閱讀不被拉回、移動游標後才拉回、IME 組字中不捲動、組字結束後才定位、專注模式(游標段落不淡化/其他淡化、換段跟著換、選取跨段不淡化、場景分隔依游標淡化、快捷鍵關閉後全不淡化)、640 寬可用、禪模式下可用、大文件效能。截圖 3 張(`44-typewriter-focus-dark`/`-light`/`-640`,深/淺各一,已實際檢視:游標段落在約 40% 處不淡化、其餘段落淡化)。
- **破壞驗證 9 輪**(拿掉或改壞對應實作 → 對應檢查 FAIL → 還原):R1 定位不動作 → 7 項 FAIL;R2 捲動也搶回 → 不被拉回 FAIL;R3 組字中也捲動 → IME FAIL;R4 不做淡化 → 5 項 FAIL;R5 只看游標行(忽略選取涵蓋段落)→ 選取跨段 FAIL;R6 開頭硬拉(加頂部留白)→ 不硬拉 FAIL;R7 選單項目不動作 → 13 項 FAIL;R8 禪模式藏起兩個開關 → 禪模式項 FAIL;R9 移除快捷鍵 → 3 項 FAIL。18 項新檢查各有至少一輪讓它 FAIL(效能項是量測,無對應破壞,以實測值核對)。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)**527/527 passed**,略過 8 項,214s(= 上一輪基準 509 + 本次 18,零 FAIL、既有組檢查數未變)。settings.json 已逐位元組還原、書櫃無殘留;`shelf` 組「複製到平台」覆寫了系統剪貼簿(既有行為,無法還原)。
- **效能(實測,兩者同時開啟)**:約 7.6 萬字章節(75,892 字、2200 段),按鍵到畫面更新中位數 **14.8ms**、最大 **21.3ms**(40 次)——不低於 SPEC §17.3 既有基準(中位數約 20ms、最大約 30ms)。
- **返工(hemingway 審查 1 Minor,直接修)**:兩個模式快捷鍵原本在 Workspace 的 window bubble listener 處理,Caps Lock 下 `Ctrl+Shift+D` 的 key 是小寫 'd',CodeMirror keymap 的 `Mod-d`(selectNextOccurrence)會先在 contentDOM 把游標所在的英文字選起來,切換專注模式後下一個輸入就取代被選的字;CM 處理後 bubble 到 window 時 `preventDefault` 救不回已發生的選字。改用 **capture 階段的 window listener + `stopPropagation`** 攔截(`Ctrl+Shift+T` 同機制):事件根本到不了 CM 的 keymap。E2E 新增 2 項回歸(CDP 送真實 `key='d'/'t'`+Ctrl+Shift+keyCode 68 模擬 Caps Lock:狀態切換、原本游標/選取不變、document 上的探針看不到事件);破壞驗證:換回 bubble 攔截(無 capture/stopPropagation)→ 2 項 FAIL(選字重現、探針收到事件)→ 還原後 paper 組全過。
- **E2E 陷阱(本次踩到)**:標題欄應用程式選單(Radix DropdownMenu)浮層開著時,後續鍵盤與滑鼠都被浮層吃掉(方向鍵/滾輪無效、點 `.cm-content` 被 `<html>` 攔截而 timeout),整段檢查會空轉後中斷。讀完選單文字後要等 `[data-testid=app-menu-content]` 真的 detach(必要時點中性處關閉)再操作;破壞驗證時選單項目不存在也要避免直接點它,讓檢查自己 FAIL。
- **未做(第二階段)**:名稱/別名比對提示。
- **待作者實機**:打字機捲動在真實注音/倉頡組字下的手感(無頭環境以 CDP 組字事件驗;#47)。

## 2026-10-11 — 稿紙化第二階段(二):版心寬度、字級、段距可調(Issue #44)

- **設定(作者全域偏好,不是作品設定)**:入口與主題(夜間書房／白紙)同一處——設定頁導覽欄底部「稿紙版面」(`data-testid=paper-layout`)三個預設檔下拉,同一種保存方式(全域 `settings.json` 的 `paperWidth`/`paperFontSize`/`paperParaGap`,綁定 `SetPaperLayout`)。預設檔:版心寬度 36/44/52rem(預設 44rem)、字級 0.95/1.08/1.25/1.45rem(預設 1.08rem)、段距 0.35/0.7/1.15em(預設 0.7em);不做任意數值輸入,Go 端 `Settings.SetPaperLayout` 只接受預設檔(任一項不是就整筆不變更),載入與存回都會把非預設檔的值(舊檔沒欄位、被手改壞)正規化回預設,其他欄位照原樣保留。
- **套用**:前端 CSS 變數 `--paper-width`/`--paper-font-size`/`--paper-gap`(新檔 `app/frontend/src/paperLayout.ts`,App 啟動載入、變更立即套用到開著的編輯器,不需重開);`style.css` 與 `paper.ts` 以 `var()` 取用,預設值等於第一階段的畫面(作者沒動設定時外觀完全相同)。標題(1.5em/1.2em)與場景分隔 ◇◇◇ 用 `em` 等比縮放,段首縮排維持 `2em` 隨字級變;只改呈現,檔案內容、存檔、匯出與 Enter/Backspace 行為全部不變。
- **游標穩定保護**:`Editor.tsx` 的縮放保護原本只觀察 host 尺寸,字級/段距/版心變更時內容高度變了但 host 不變,不會觸發;一併觀察 `contentDOM` 高度後,字級調大時原本可見的游標不會被推出畫面(游標已捲出畫面閱讀時仍不拉回,規則不變)。
- **實作上發現(cm 的限制)**:`.cm-scroller` 是 flex 容器,`.cm-content` 寫 `width` 會被 flex-shrink 壓回可用寬度(實測 52rem 在 640 寬仍收成 308px,不會溢出);要破壞驗證「640 不出水平捲軸」得用 `min-width` 才造得出溢出。版心本身用 `max-width` 就是正確做法(視窗比版心窄時照常填滿可用寬度)。
- **Go 測試 2 項**(`internal/settings`):舊設定檔沒有新欄位 → 載入預設值且 theme/recent 等其他欄位不變、存回後檔內含三個新欄位;值不是預設檔 → 回到預設;`SetPaperLayout` 拒絕任意數值且被拒時不變更。
- **E2E(`paper` 組 +10 項)**:預設值等於第一階段畫面(計算後字級/段距/版心/縮排)、字級設定改變正文計算後字級(立即套用,不用重開)、標題與場景分隔行相對大小等比、段首縮排 2em、段距改變、版心改變、重開編輯器後三項仍保持(`page.reload` + `GetSettings` 驗存回)、640 寬(大字級+寬版心)無水平捲軸且版心填滿可用寬度、字級調大時游標穩定保護成立、回到預設值後畫面與改前一致。截圖 4 張(`44-paper-layout-dark-big`/`-settings`/`-light-big`/`-640`,深/淺各一含調大字級;另以像素取樣核對主題與設定頁內容,避免讀取順序錯覺)。
- **破壞驗證 11 輪**(拿掉對應實作 → 對應檢查 FAIL → 還原):①預設檔改值(settings.go)→ 預設值與回到預設兩項 FAIL;②字級寫死 `1.08rem`(style.css)→ 字級改變 FAIL;③標題改固定 px(Editor.tsx/style.css)→ 等比縮放 FAIL;④縮排改 `2rem`(paper.ts)→ 縮排 2em 與預設值兩項 FAIL;⑤段距寫死 `0.7em` → 段距 FAIL;⑥版心寫死 `44rem` → 版心 FAIL;⑦`SetPaperLayout` 不存回(app.go,需重啟 wails dev)→ 重開後保持 FAIL;⑧`.cm-content` 加 `min-width: 52rem` → 640 水平捲軸與版心兩項 FAIL;⑨拿掉 `ro.observe(v.contentDOM)` → 游標穩定 FAIL;⑩回到預設值不套用(paperLayout.ts)→ 回到預設一致 FAIL;⑪Load 不設預設值 → Go 測試 FAIL。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)**509/509 passed**,略過 8 項,197s(= 上一輪基準 499 + 本次 10,零 FAIL、既有組檢查數未變)。settings.json 已逐位元組還原、書櫃無殘留;`shelf` 組「複製到平台」覆寫了系統剪貼簿(既有行為,無法還原)。
- **返工(hemingway 審查 1 Minor,直接修)**:paper 組的版面檢查在量 m0 前沒有先確立受控的預設版面——作者真實 `settings.json` 已在別的檔位(例如字級特大)時,預設外觀與變更幅度斷言會假失敗(實測 5 項假 FAIL:預設值、字級/段距/版心變更幅度、回到預設一致)。修正:量測前用同一個設定入口把三項設成預設值並等待套用再量 m0(只加前置狀態,不弱化既有斷言;作者偏好仍由外層 `settings.json` 備份還原契約負責)。驗證:以可拋棄 APPDATA 目錄種入作者同款偏好(`52rem`/`1.45rem`/`1.15em`)重現假失敗 → 修正後 paper 組 42/42(預設起點亦 42/42);全新 fixture `--all` 509/509 passed(略過 8,199s)。全程不碰作者真實 `settings.json`(md5 未變)。另發現(範圍外,不阻擋合併):`layout-half` 的「模型名省略號截斷」檢查假設設定裡的模型名夠長,預設設定下會假失敗。
- **未做(第二階段)**:名稱/別名比對提示、打字機捲動、專注模式。
## 2026-10-11 — E2E「回書櫃重開作品」等不到卡片的根因與修正(Issue #63)

- **根因(已重現確認,不是 `ListRecent` 覆寫/還原 race)**:`bible.js:337` 與 `layout-visual.js:25/88` 把 `PROJ` 路徑直接拼進 CSS 屬性選擇器。反斜線變體會被 CSS 轉義規則吃掉(`\U`、`\8334f1` 不是合法轉義;Edge + playwright 實測:反斜線 title 0 匹配、正斜線 title 1 匹配),所以選擇器只有在「卡片 `title` 是正斜線且與 `PROJ` 逐字相同」時才會命中。卡片 `title` 是後端把 `PERKINS_OPEN` 字串原樣存進最近清單的結果(`project.Open` 只存 `Root`,不正規化 → `AddRecent`),所以 title 的斜線形式 = 啟動 `wails dev` 時給的路徑形式。
- **什麼決定一輪失敗(=「偶發」的解釋)**:同一台機器上,POSIX 形式 `PERKINS_OPEN="$S/e2e-proj"` 會被 MSYS 轉成 `C:/...`(正斜線)→ 通過;直接給 Windows 形式 `PERKINS_OPEN='C:\Users\...\e2e-proj'`(引號包住,已是 Windows 路徑,MSYS 不轉)→ title 反斜線 → 必定失敗;`PROJ` 給反斜線形式同樣失敗。#63 的 5 筆失敗 log(`all-46b-final`/`final2`/`baseline`、`all-35-final`/`final3`,2026-10-10 01:32–02:45)對應的啟動指令在 pi session 轉錄裡查到,清一色 `PERKINS_OPEN='C:\...\e2e-proj-xxx'`,而 `PROJ` 是正斜線(失敗 log 的第二個選擇器變體)。標準 `rerun*.sh` 兩個都給 POSIX → 全數通過。所以「偶發」是**啟動方式**決定的,同一啟動方式內 100% 必現(5/5),不是隨機 race;同一輪其他組用路徑正規化比對的 `clickProjectCard` 照常通過,所以只有這兩處失敗。
- **同輪證據**:失敗輪中 `shelf` 組的 `p:has-text("E2E測試")` 與 `clickProjectCard`(斜線/大小寫正規化)都成功、`bible`/`layout-visual` 的精確選擇器逾時 → 卡片確實 render 了,只是 `title` 形式對不上;舊失敗 log 的 `waiting for locator(...)` 與本次重現逐字相同。
- **修正(只動測試,不動其他組的行為與斷言)**:`app/e2e/lib.js` 新增 `cardSelector`/`projectCard` — 路徑正規化成正/反斜線兩個變體 + 忽略大小寫的靜態選擇器,`waitFor` 等到卡片 render(= 等 `ListRecent` 資料落地)再回傳 locator;`bible.js` 移除 `p:has-text("E2E測試")` 那行「軟等待保留」,改用它等卡片再點;`layout-visual.js` 兩處 `page.click(button[title=...])` 改用它。`run.js` 把 helper 接進 ctx。
- **重現 → 修正 → 破壞驗證**:刻意用 `PERKINS_OPEN` 反斜線啟動(還原失敗輪形式)→ 未修正前 `bible`+`layout-visual` **17/19、正好這 2 項 FAIL**;修正後同形式 **29/29**。破壞驗證:拿掉 `cardSelector` 的反斜線變體 → 又是這 2 項 FAIL(17/19)→ 還原 → 29/29。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)連跑 3 輪 **499/499 passed,略過 8 項,184s/184s/185s**,零 FAIL;另加一輪 `PERKINS_OPEN` 反斜線啟動的 `--all` 也 **499/499**。settings.json 已逐位元組還原、`clean-recent.js` 清過、無殘留程序;`shelf` 組「複製到平台」覆寫了系統剪貼簿(既有行為,無法還原)。4 輪 `--all` 各覆寫一次。
## 2026-10-11 — Perkins Bot 讀取兩層作者指示 AGENTS.md(Issue #38 作者已定案部分)

- **後端 `app/internal/agent/agent.go`**:`BuildMessages` 拆成內部 `buildMessages`(回傳訊息 + 未送出原因),每次組裝都重讀兩層 `AGENTS.md`:全域 `%APPDATA%\Perkins\AGENTS.md`(`Agent.GlobalAgentsPath`,由 `app.go` 的 `setProject` 從 settings store 目錄接線,空 = 不讀,測試可注入)與作品根目錄 `AGENTS.md`。兩層以「【作者指示:全域/作品 AGENTS.md】」標題放進 system 訊息、在既有規則之後(既有文字不動),並附說明:衝突時作品層為準、不能改變系統規則(G1–G4)。檔案不存在略過;讀取失敗回錯不吞。單份超過 `agentsLimit`(4000,`EstimateTokens` 估算)整份不送出,原因進 `Preview.Notices` 與 Ask 的 `notice` 事件(同 B7 通知機制)。計入上下文預算(system 訊息自然被 `EstimateTokens`/`Preview` 計算)。報告模式套用;章節摘要(`summaryPrompt`)與對話濃縮(`compactPrompt`)不經 `BuildMessages`,不套用。
- **前端**:`ChatWindow.tsx` 預覽視窗新增 notices 顯示(`data-testid=agents-notice`,同 preview-over 警告樣式);`wailsjs/go/models.ts` 補 `notices` 欄位。未動系統提示既有文字、未做設定頁介面、未做子資料夾 AGENTS.md。
- **測試(Go,9 個新測試)**:兩層都有(順序/標題/說明)、都没有 system 不變(含報告模式)、只有一層、每次重讀、超上限不送出且預覽與 Ask 通知都有原因、讀取失敗回錯、預算計入+報告模式套用+摘要/濃縮不套用+預覽=實際送出(A6)、工具(讀/搜尋/提案)與附加都碰不到作品根目錄 AGENTS.md(既有 `project.resolve` 只允許五個內容資料夾,確認+測試,未新增功能)。
- **破壞驗證(Go,6 輪)**:①停用 `authorInstructions` → 6 測 FAIL;②拿掉上限檢查 → 超上限測試 FAIL;③吞掉讀取錯誤 → 讀取失敗測試 FAIL;④Ask 不 emit notice → 超上限測試 FAIL;⑤Preview 不填 Notices → 超上限測試 FAIL;⑥`project.resolve` 同時拿掉兩層根目錄限制(先拿掉 `isDir` 白名單再拿掉 `rel == top` 排除;只拿前者仍被後者擋住,雙層防護)→ 工具碰不到測試 FAIL。全部還原後 `go test ./...` 全綠。
- **E2E(bot-chat 新增 4 項)**:作品 AGENTS.md 以標題進入 system 訊息、預覽可看出衝突時以作品層為準、超上限不送出且預覽顯示原因、送出時對話出現 notice(照 research R3 的死端點模式;切端點後要開關設定頁讓 Workspace 重讀,否則沿用舊雲端端點會被送出前確認擋住——本次實際踩到,已照 R3 同樣處理)。本段自己寫/刪 fixture 的 AGENTS.md,不污染其他組;全域層原本就不存在,未動。破壞驗證 2 輪:①後端停用 `authorInstructions`(重啟 wails dev)→ 4 項全 FAIL;②前端不 render notices(vite 熱重載)→ 只有預覽原因項 FAIL。還原後 `bot-chat --smoke research` **36/36 passed**(略過 8,E2E_SKIP_AI=1)。settings.json 逐位元組還原、無殘留程序、書櫃無垃圾(fixture 已刪)。
- **未做(依任務限制)**:設定頁編輯介面、子資料夾 AGENTS.md、系統提示既有文字調整(#38 其餘部分)。
## 2026-10-11 — Perkins Bot 提案前先確認原文(Issue #34 第 6 項)

- **系統提示**(`app/internal/agent/agent.go` 的 `systemPrompt`)在 propose_patch 那條後新增一條:提案前先用 `read_document` 讀取目標檔,或確認作者本次附加、目前文件的內容;`original` 從讀到的內容逐字複製,不要憑記憶或摘要改寫。G1–G4 相關句子一字未動。
- **`propose_patch` 失敗訊息**(`app/internal/proposal/proposal.go` 的 `Create`,由 `agent.go` 的 `runTool` 原樣回給模型):「在目標檔中找不到 original」與「original 在檔案中出現 N 次」兩則補上「先用 read_document 讀取該檔確認原文」。只改訊息文字:判定規則(`n == 0` / `n > 1`)與既有子字串(「找不到」、「N 次」)不變,既有測試斷言不需修改。
- **測試**:新增 `agent_test.go` 的 `TestSystemPromptTellsModelToReadOriginalBeforeProposing`(系統提示含 `read_document`、逐字複製、不要憑記憶)與 `proposal_test.go` 的 `TestCreateErrorTellsModelToReadDocumentFirst`(兩則失敗訊息都含 `read_document` 提示)。**破壞驗證 3 輪**:①拿掉系統提示新增那條 → FAIL;②拿掉「找不到」訊息的提示 → FAIL(報找不到那個 case);③拿掉「出現 N 次」訊息的提示 → FAIL(報出現多次那個 case)。還原後 `go test -count=1 ./internal/...` 全部通過,`go vet ./internal/...` 無訊息。
- **SPEC**:沒有描述提案工具錯誤訊息或系統提示原則的段落,未改動。
- **未做**:不改提案判定、套用、儲存邏輯,不改其他工具;本任務未涉及介面,E2E 不適用。
## 2026-10-11 — Perkins Bot 三態回應規則與模糊要求評測情境(Issue #34 第 4 項)

- **系統提示**(`app/internal/agent/agent.go` 的 `systemPrompt`):依《AI Agent 與人類協同創意寫作…》§6 不確定性協定與《Agentic Writing 與 Harness Engineering…》護欄 8、10,在「作者故意留白不補完」之後新增三條:意圖明確時直接做、不為保險而提問;意圖不明且不同理解會改變故事方向時先問最多 1–3 個具體問題再提案;多個合理方向列條件式選項、不標示「最佳」。既有「推測要標示」「留白不補完」與 G1–G4 相關句子未動;`reportPrompt`、`summaryPrompt` 未動。
- **關鍵句單元測試**:新增 `TestSystemPromptUncertaintyRules`(`agent_test.go`),檢查三條規則的關鍵句存在於系統提示。既有測試原先只檢查「檢查報告」一句(`TestReportModeHasNoProposeTool`),未檢查推測/留白句,故新規則各補一個關鍵句檢查。
- **實機評測新情境「模糊要求應先澄清」**(`live_eval_test.go`):大綱明確標示後續方向未定(當面質問或暗中調查)＋作者只說「這段改好一點」。硬判定:不得建立提案、檔案未被改動(`ForbidProposalTool`,非報告模式下工具是提供的,驗證模型沒有直接挑一個方向改寫);澄清問題的提出與品質、條件式選項未標「最佳」列人工檢查。`eval_test.go` 的 `ForbidProposalTool` 註解更新為涵蓋兩類情境。
- **破壞驗證**:逐條拿掉系統提示中的三條新規則 → `TestSystemPromptUncertaintyRules` 對應 FAIL(三輪各 FAIL 一項)→ 還原後通過。
- **驗證**:`go test ./internal/...`(不帶實機標記)全部通過,新情境可編譯(`go vet` + `go test -run TestLiveEvalCases` 未設 `PERKINS_LIVE_MODEL` 時 skip 路徑執行)。實機評測需要本機模型,未執行。
- 文件:`docs/SPEC.md` §12.3 新增「不確定時的三態回應」、`docs/LIVE_EVAL.md` 硬判定說明與情境表各加一項、本檔。
## 2026-10-11 — 搜尋結果被截斷時告知總筆數(Issue #34 第 3 項)

- **`app/internal/agent/agent.go` 的 `search`**:原本找到 30 筆符合就直接回傳,模型會以為只有這些結果。改為仍只回傳前 30 筆片段(上限與片段長度規則不變),但走完全部檔案計數符合的行數;總數超過 30 時在結果最後附一行「共 N 筆,只列出前 30 筆;請改用更精確的關鍵字。」,未超過時輸出完全不變(原本的 30 筆提前結束改為 `len(hits) >= searchMaxHits` 時只計數、不再累積片段字串)。
- **G2 不變**:計數只在 `g.ok(f)` 允許的檔案上進行,未附加的 `canon/`、`outline/`、`notes/` 檔案不入計數,檔名與內容都不會出現在結果中。
- **測試**(`app/internal/agent/agent_test.go`):45 筆符合時總數正確且仍只回 30 筆片段;剛好 30 筆、29 筆與 1 筆都沒有截斷說明;未附加的受保護檔案有 5 筆符合時不計入(結果也不含其檔名),附加後總數變 35 筆。
- **破壞驗證 3 輪**(拿掉對應實作 → 該項 FAIL → 還原,還原後 `cmp` 逐位元組相同):①不附截斷說明(`if false`)→ 總數說明與受保護計數 2 項 FAIL;②無條件附說明(`if true`)→「不多一行雜訊」FAIL;③計數不看 gate(`if false`)→「受保護檔案不計入」FAIL。
- **驗證**:`gofmt` 對新增段落無意見(檔案既有的 `AskParams` 註解對齊問題不動);`go test ./internal/...` 11 個套件全部 ok。
## 2026-10-11 — Perkins Bot 新增唯讀工具 list_files(Issue #34 第 2 項)

- **新工具 `list_files`**(`app/internal/agent/agent.go`):不需參數、唯讀;輸出給模型讀的純文字。稿件依 `perkins.json` 卷章順序(與側欄一致,沿用 `project.Tree()` 的 `ResolveVolumes` 解析,未列入卷的檔案照既有規則排最後)、章名取檔內第一個 `# ` 標題(沒有就用檔名)、字數用與狀態列同一套的 `CountText`;另列 `summaries/` 存在的摘要。受保護資料夾(`canon/`、`outline/`、`notes/`)沿用同一個 `gate`(`gateFor`/`g.ok`)過濾,只列作者本次附加的檔案(G2/B2);報告模式可用(`toolsFor` 只排除 `propose_patch`,唯讀工具自然包含)。審計與研究記錄走既有 `runTool` 路徑,無新程式。
- **字數函式抽離**:`CountText` 從 `app/app.go`(package main,agent 套件無法 import)移到新套件 `app/internal/wordcount`,`app.go` 留同名轉發包裝;狀態列、各章字數與 `list_files` 同一套規則。邏輯逐字未改。
- **前端**:`ChatWindow.tsx` 工具顯示名稱對照表加 `list_files: '列出檔案'`,其餘不動。
- **測試**(`list_files_test.go` + 白名單測試更新):卷章順序與 `perkins.json` 一致(兩卷 + 未列入檔案排最後)、章名取一級標題/無標題用檔名、字數含 Markdown 記號與註解排除;未附加的受保護檔案不出現(含內容關鍵字檢查)、附加的會出現;報告模式 `toolsFor` 含 `list_files` 且經 `Ask` 完整流程可呼叫;審計含 `tool_call` 的 `list_files`。
- **破壞驗證 6 輪**(拿掉對應實作 → 該測試 FAIL → 還原):①倒序列印卷 → 順序測試 FAIL;②拿掉 `g.ok` 檢查 → 附加過濾測試 FAIL;③不用一級標題(一律檔名)→ 章名測試 FAIL;④不算字數 → 字數檢查 FAIL;⑤不列摘要 → 摘要檢查 FAIL;⑥報告模式排除 `list_files` → 報告模式測試 FAIL。還原後全綠。
- **驗證**:`go test ./internal/...` 全過(含新套件 `wordcount` 編譯);前端僅加顯示名稱字串。未以真實模型 live 驗證 `list_files` 被呼叫(走 scripted 模型)。
## 2026-10-11 — 迭代上限改以不帶工具的收尾請求回答(Issue #34 第 1 項)

- **問題**:`internal/agent` 的 `Ask` 迴圈到達 `maxIter`(預設 8)時直接回錯誤(「已達單次對話的工具迭代上限…」),模型該輪讀到的工具結果與說明全部遺失,作者只看到錯誤。
- **做法**:到上限仍寫 `iter_limit` 審計並 emit 一則 notice,再送一次**不提供任何工具**的收尾請求(附加 `iterLimitPrompt`:告知已達工具呼叫上限、請就目前已知的內容回答並說明停在哪裡、還缺什麼)。收尾回覆當正常回合處理(迴圈內的文字回覆與收尾共用抽出來的 `finish`:寫入對話歷史、必要時濃縮),照常列入研究記錄的 requests(purpose 仍為 ask);result 改記 `iter_limit`(§12.8 新增值;收尾請求本身失敗則照原本錯誤路徑記 error/cancelled,不重試)。模型仍回傳工具呼叫時忽略呼叫、只取文字內容;上限仍是硬上限(收尾請求不帶工具,不會再進迴圈)。上限數值、其他工具行為、前端均未改。
- **SPEC** 同步:§5 工具迭代上限、§7 A5、§12.8 ask 事件的 requests 與 result。
- **測試**(`internal/agent`):3 個既有測試改為驗證新行為(達上限不再回錯誤、改驗收尾回覆與不帶工具的收尾請求、requests 含收尾快照、iter_limit 審計仍在),新增 2 個:收尾請求失敗(錯誤/取消各一子測試)走錯誤路徑且不重試;收尾回覆夾帶的 `propose_patch` 不被執行(沒有第三次請求、審計無 tool_call、無提案、檔案雜湊不變)。
- **破壞驗證 9 輪**(每輪只改 `agent.go` 一處,只跑上述 5 個相關測試):①改回直接回錯誤 → 5 個全 FAIL;②收尾請求仍帶工具 → 3 個 FAIL;③不寫 iter_limit 審計 → 1 個 FAIL;④不 emit notice → 1 個 FAIL;⑤忽略收尾請求的錯誤 → 收尾失敗測試 FAIL;⑥執行收尾回覆的工具呼叫 → 忽略工具測試 FAIL;⑦result 改回 ok → 研究記錄測試 FAIL;⑧收尾請求不列入 requests → 3 個 FAIL;⑨收尾請求不含上限說明 → 2 個 FAIL。還原後全綠。
- **驗證**:`go test ./internal/...` 全過(agent 5 個相關測試加 `-count=1` 重跑)。根套件 `perkins` 的 `go test ./...` 需要 `app/frontend/dist`(embed),全新工作樹未建置前端因此 setup 失敗,與本次改動無關(未動前端)。
## 2026-10-10 — E2E 重用開發伺服器(Issue #48 B)

- **做法(不加任何 Go 入口)**:新增 `--reuse` 模式(`app/e2e/run.js` + `lib.js`):偵測 34115 上已有的 `wails dev`,重建 fixture → 呼叫既有產品綁定 `OpenProjectAt(測試專案)` → 重載頁面。後端的作品狀態由 `setProject` 整個換掉:`proj`(含記憶體中的 perkins.json)、`agent`(對話與提案快取)、`research`、在途 `cancel`;`session`(研究記錄的 app-run id)與 `quitConfirmed` 是應用層狀態不是作品狀態,不換。前端重載頁面即回到冷啟動的起始畫面。
- **為何不改用 dev-only 綁定**:`wails dev` 每次啟動都會重新產生 `frontend/wailsjs` 綁定(本次實測:內容相同、只有行尾差異),若新增 `//go:build dev` 的 `DevReloadProject`,這兩份已進版控的綁定檔會在 dev/build 之間反覆來回(作者跑 `wails dev` 就會看到 dirty);而 `OpenProjectAt` 本來就是作者從書櫃換作品在用的同一條路徑,重用不必新增入口,正式建置的綁定集合與 main 完全相同。
- **`--reuse` 不自己啟動伺服器**:沒有 34115 時直接報錯並提示啟動指令;`--reuse` 可放任意位置(`node run.js --reuse --all`)。
- **耗時(實測,同一台機器)**:`wails dev` 第一次編譯 41.4 秒、之後冷啟動 20.8 秒;`bible` 一組冷啟動一輪 56.4 秒(0.1 重建 + 41.4 啟動 + 14.9 測試)對 `--reuse` 15.0 秒;重載本身 619 ms。
- **驗證**:(b) 冷啟動 `--all` 468/468 passed(略過 8)176.1 秒;(a) 同一台 dev server 上 `--reuse --all` 連跑兩輪各 468/468(175.6 / 175.1 秒),檢查數與冷啟動逐組相同。(c) 破壞驗證:把重載改成不重新開啟作品(模擬漏掉 perkins.json 快取),先用 `RenameProject` 造出「記憶體與磁碟不一致」,`--reuse titlebar-zen` → 「標題欄 作品畫面標題為作品名」FAIL(28/29,記憶體還留著舊名字);把重載放回去,同情境 29/29 通過。(d) 正式建置:`go build -tags production ./...` 與 `wails build` 都成功,`perkins.exe` 內沒有任何 dev/E2E 專用符號,建置後 `wailsjs`/`go.mod` 無內容差異;本次只改 `app/e2e/{run,lib}.js` 與文件,沒有新增綁定。
- **文件**:`.agent/skills/e2e/SKILL.md` 新增「重用同一個 wails dev(`--reuse`)」一節(何時可以 reuse、何時一定要冷啟動、如何確定測到新程式、等價性實測數字),並改寫原本「重建測試專案後必須重啟 `wails dev`」與「部分組假設全新 fixture」兩條陷阱(改為:冷啟動或 `--reuse` 二選一)。
- **返工(codex 審查 1 Major + 1 Minor,Orchestrator 直接修)**:(1)會呼叫模型的執行被中斷時,後端舊請求與研究記錄可能還在跑,重新開啟作品不會等它結束,會寫進下一輪的新 fixture → `--reuse` 只能搭配 `E2E_SKIP_AI=1`(否則 run.js 報錯退出),跑模型一律冷啟動;不改產品的請求生命週期。(2)只寫 `--reuse` 沒寫組名時印用法並非零退出(原本會重建 fixture 後回報成功)。兩個防護各實測非零退出;`--reuse bible` 23/23。
- **複審(codex)**:零組已解;run.js 只看得到本輪環境變數,「前輪跑過模型、本輪 skip-AI 再 reuse」仍可能撞到舊請求 → SKILL.md 明訂:跑過模型或中途中斷的 `wails dev` 一律先冷啟動,不得 reuse。
## 2026-10-10 — 作品健康檢查第一批(Issue #41)

- **後端 `internal/health`**(SPEC §17.4):只讀作品檔案、只回報不修改、不呼叫模型。五類:frontmatter 無法解析(`bible.Parse` 會靜默退回,這裡指出來)、孤兒摘要(`source` 指向不存在的章節)、摘要可能過期(沿用 `summary` 的 Stale)、斷連結(Markdown 行內連結/圖片指向作品內不存在的檔案;忽略外部連結、錨點、逃出作品根的路徑與程式碼區塊)、卷中列出但不存在的章節(沿用 `project.ResolveVolumes` 的警告,警告字首抽成常數)。名稱/別名重複等依賴設定集結構的檢查等 #31。
- **綁定與介面**:`App.HealthCheck`;左側欄「檢查」面板最上方「作品健康檢查」+「開始檢查」,只在作者按下時檢查,先存檔再檢查。結果依類型分組,點項目開啟該檔(卷中缺章沒有檔案可開,不可點);沒問題時顯示「沒有發現問題」與檢查時間。`Workspace` 不再把開著的 `summaries/` 檔當成已刪除而自動關閉(摘要不在樹上,但可從結果點開)。
- **驗證**:`go test ./internal/...` 通過;Go 破壞驗證 8 輪(五類各自、程式碼區塊、URL 解碼、逃出作品根)皆讓對應測試 FAIL。`tsc --noEmit`、`npm run build` 通過。E2E `bible` 新增 11 項;破壞驗證 7 輪(不分組、不可點、修好後仍列出、開啟作品自動檢查、按鈕無作用、編碼路徑誤報、專用檔未清),每項新檢查至少一輪 FAIL。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)479/479 passed,略過 8 項,174s(main 468 + 11)。實作者先前一輪 `--all` 為 180/191:visual-1b 的 #35 審查視窗「接受」未寫入、視窗未關,擋住後續 7 組;單跑 visual-1b、`bible`+`visual-1b` 連跑兩輪(67/67)與本輪 `--all` 皆未重現,與 #63 記錄的同一偶發現象相同(PR #65 分支也出現過,不經過本次修改),原因未定位。
- **返工(codex 審查 3 Major,Orchestrator 直接修)**:(1)讀檔失敗不再略過:任何一檔讀不到(被其他程式獨占、沒有權限)整次檢查失敗並帶出路徑,走既有錯誤提示,不顯示「沒有發現問題」。(2)連結目標改為逐字讀出:目標內成對的括號是路徑的一部分(`好(1).md`)、`\(`/`\)` 取字面;行內程式碼(`…`、``…``)內的不算。(3)URL 解碼後把 `\` 換成 `/` 再做作品根邊界判斷,`..%5C..%5Coutside.md`、`..\..\outside.md` 不再繞過。新增 Go 回歸(Windows 專用:share mode 0 獨占檔案);破壞驗證 4 輪(吞掉讀檔錯誤、不去行內程式碼、不認成對括號、不換反斜線)各讓對應測試 FAIL,還原後通過。E2E `bible` 34/34。
- **複審返工(codex 複審 1 項,Orchestrator 直接修)**:行內程式碼改在整段(空行/圍欄之間)上辨識,可跨行;辨識到的換成佔位字元而不是刪掉,`[說明]`+行內程式碼+`(x.md)` 不會拼成假連結。新增 2 個回歸;破壞驗證(改回刪除、改回逐行)各讓測試 FAIL,還原後通過。
## 2026-10-10 — 審查地點收斂為審查視窗、在稿件中顯示、Ctrl+Shift+Enter(Issue #45 方案 A)

- **作者定案(#45 方案 A)**:做決定的地方只有審查視窗。聊天提案卡改為只做通知(檔名、原文一行、理由、已修改/衝突狀態、「審查」按鈕),不再在卡片內編輯或接受/拒絕。SPEC §2.2、§6、§10「審查地點」、§12.3 改寫。
- **在稿件中顯示**:審查視窗頁尾按鈕。目前章節直接捲到原文並短暫標示(沿用 `cm-ai-flash`,不改選取,選取不會變成附加內容);別章先開啟,由 Editor 的 `reveal` prop 在掛載時套用(StrictMode 會建立兩次編輯器,父層 effect 對舊 view 下指令會落空,同 `.agent/memory/editor-strictmode-remount.md`)。位置先用提案記錄的位元組位置,作者在前面打字而位移時改用原文唯一出現處,找不到或不唯一就提示,不猜。開啟被後來的切換取代時取消定位(以 `navSeq` 判斷)。
- **#45 (c)**:選取後 `Ctrl+Shift+Enter` 等同「詢問這段」(右鍵選單標示快捷鍵,浮動列以 tooltip 標示);IME 組字中不動作,沒有選取時不攔截。
- **E2E**:visual-1b、bot-chat 的卡片內接受改走審查視窗(`reviewAccept` helper,卡片以原文定位);#35 的「卡片內編輯同步」改為「卡片只有『審查』」;清單變動兩項改由後端 `RejectProposal` 觸發。新增:在稿件中顯示(別章切回、原文位移)、Ctrl+Shift+Enter。
- **破壞驗證**:停用標示 → 在稿件中顯示 2 項 FAIL;拿掉唯一出現處退回 → 位移項 FAIL(另一項仍 PASS,證明測到的是退回路徑);卡片加回拒絕鈕 → 卡片項 FAIL;改掉快捷鍵 → 快捷鍵項 FAIL;還原全綠。過程中修正一個無效測試:第二次標示原本讀到第一次殘留的標示,改為先等上一次標示消失。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)471/471 passed,略過 8 項。
- **返工(codex 審查 1 Major + 1 Minor + 1 驗證缺口,Orchestrator 直接修)**:(1)CRLF 稿件的多行原文:作者在原文外打字後,編輯器回傳的全文已把 `\r\n` 換成 `\n`,退回搜尋找不到。改為比對前兩邊都把 `\r\n` 視為一個換行(索引即編輯器位置;提案存的原文與接受路徑不變)。新增 E2E:BOM+CRLF 章節的多行原文,直接顯示與在文末打字後都能標示;破壞驗證(換回舊搜尋)→ 該項 FAIL,還原通過。(2)SPEC §12.3「部分採用」與審查視窗段落改寫為最終規則(編輯與接受/拒絕只在審查視窗,卡片只通知)。(3)640 寬「已修改」狀態的頁尾:新增 E2E 量「在稿件中顯示/還原 AI 版本/拒絕/接受」都在視窗內且點得到——實測通過;曾試加 `flex-wrap`,但拿掉後同一檢查仍通過(單行放得下),故未保留該樣式。全新 fixture `--all` 473/473 passed,略過 8 項,186s(上一版 471 + 2)。
## 2026-10-10 — 定時自動存檔(Issue #36)

- **何時存**(SPEC §17.3):編輯器有未存變更時,停止輸入 **2 秒**後存;持續打字不停時,距第一個未存變更**最多 30 秒**也存一次(`Workspace.tsx` 的 `AUTOSAVE_IDLE_MS`/`AUTOSAVE_MAX_MS`)。單一 effect 依 `[autosaveOn, dirty, text, current, editLocked]` 重排計時器:每次輸入重設 2 秒;`autoSince` 記住這輪起點以守住上限,存檔後仍 dirty 就從下一次變更重新起算。
- **走既有的 `save()`**:不新增寫檔路徑、不建快照、Provenance 不變;與 Ctrl+S/按鈕共用同一個序列化 Promise(存檔途中重複觸發不會並行寫入)。成功只更新工具列/狀態列,**不跳「已儲存」提示框**(手動存檔照舊);失敗走既有 `fail` 的錯誤提示,不吞錯。
- **避開組字**:`EditorHandle` 新增 `composing()`(讀 `view.composing`/`compositionStarted`);計時器到點時仍在組字就每 200ms 重試,`compositionend` 後才存(組字中不再有輸入事件時也不會卡住不存)。
- **切檔/回書櫃/關閉**:計時器綁在當下的 `current`/`dirty` 上,切檔或卸載(回書櫃、關閉前存檔流程)時清掉;`save()` 一律讀 `latest.current`(path+text 成對),不會把舊檔內容寫進新檔。錯誤防護的緊急存檔不變。
- **設定**:`settings.json` 加 `autosave`(用 `*bool` 區分「舊設定檔沒這個欄位」(視為開啟)與「作者明確關閉」);設定頁「作品」新增「自動存檔」開關(`data-testid=autosave-switch`,說明「停止輸入 2 秒後自動存檔,不建立版本快照」),不提供間隔設定。
- **驗證**:`go test ./internal/settings/`(新增舊設定檔相容與預設值)、`tsc --noEmit`、`npm run build` 通過(工作樹 `npm ci`)。
- **E2E(save-flow 新增 15 項)**:停止輸入約 2 秒才存(實測 2153ms)、2 秒內不寫入、狀態列已儲存且不跳提示框;持續打字時由上限觸發(掛鉤縮成 idle 20s / 上限 0.8s,實測 2.9s 落盤,不必真的等 30 秒);組字中不存、`compositionend` 後存;設定關閉後打字不存而 Ctrl+S 照舊(含提示框)並還原設定;打字後 2 秒內切章→舊章的字在舊章、新章不被寫入。開發模式另加 `__perkinsAutosaveTiming(idle, max)`/`__perkinsAutosaveOff()` 掛鉤。
- **破壞驗證 11 輪**(每輪重建 fixture、只跑 `save-flow`):①不排程→(a)(b)(c) 5 項 FAIL;②不管 IME→(c) 2 項 FAIL;③自動存檔也跳提示→(a) 提示框 FAIL;④不等停止輸入→(a) 2 項 FAIL;⑤計時器不清+用最新路徑配舊文字→(d) 新章 FAIL;⑥忽略設定開關→(e) 2 項 FAIL;⑦手動存檔不跳提示→(e) 提示框 FAIL;⑧切檔前不存→(d) 舊章 FAIL(另帶 E5);⑨移除 Ctrl+S→(e) 手動存檔 2 項 FAIL;⑩只移 `openFile` 的 `setDirty(false)`→不受影響;⑪⑩再併①(不排程自動存檔)→該斷言仍未 FAIL,因為切檔前 `await save()` 已把 dirty 清掉。因此「切章後新章為已儲存」沒有可辨識的失敗情境,**已刪掉該檢查**,不拿永遠會過的斷言充數。
- **基準**:全新 fixture + 重啟 wails dev 的 `--all`(E2E_SKIP_AI=1)**471/473 passed**,略過 8 項,231s。2 項 FAIL 是既有 #63 書櫃 `ListRecent` race(`bible`、`layout-visual` 的「回書櫃重開作品」等不到卡片)並讓這兩組提早中斷(少 10 項檢查);同一環境上一輪 PR 的 `all-35-final3.log` 是同樣這 2 項,基準 `run.log` 為 468/468 全過 → 無 race 時的預期是 468 + 15 = **483/483**。其餘 13 組檢查數與基準逐一相同,只有 `save-flow` 22 → 37。`app/e2e/shots/71-settings-project-1280.png` 與另行拍攝的 640×672 截圖都確認新區塊正常(內容區無水平捲軸、開關不超出內容區)。
- **E2E 預設關閉自動存檔**:`lib.launch` 以 `addInitScript` 設 `__perkinsE2eAutosaveOff`,開發模式載入 `Workspace` 時讀它——既有多數測試假設「打字後仍是未存狀態」(未儲存標記、關閉保護、緊急存檔時序),自動存檔會隨機器快慢不定時打斷它們。自動存檔自己的檢查在 `save-flow` 段落內明確打開,段落開始先把設定頁開關設成開啟(不假設起始狀態)、結束還原。
- **返工(codex 審查 1 Major,Orchestrator 直接修)**:自動存檔已在寫的途中才開始 IME 組字,序列化存檔迴圈的下一輪會把組字中的字寫進磁碟。改為記錄這一輪是否只由自動存檔發起:是的話每輪開始前遇到組字就停下(組字結束後自動存檔再接手);手動存檔、切章、關閉、接受提案等呼叫者一加入就改回「全部落盤才結束」。新增 2 項 E2E(c2):存檔延遲 1.2 秒期間開始組字 → 組字中的字不落盤、第一輪的字已存;組字結束後落盤。破壞驗證:拿掉停下判斷 → (c2) 第一項 FAIL(重現審查描述的情形),還原全綠。全新 fixture `--all` 485/485 passed;另一輪 `--all` 曾出現 visual-1b 審查視窗接受未生效而連鎖中斷(E2E 預設關閉自動存檔,不經過本次修改的分支;單跑 visual-1b 與再跑 `--all` 皆通過),記入 #63。
- **複審返工(codex 複審 1 項,Orchestrator 直接修)**:無事可存時的手動存檔(乾淨狀態按 Ctrl+S)會先設「全部落盤」旗標再直接返回,旗標留到下一次自動存檔,使它略過組字檢查。改為只在加入在途存檔或真的開始一輪時設定。(c2) 前置加入「乾淨狀態按 Ctrl+S」。破壞驗證:換回舊寫法 → (c2) 第一項 FAIL(組字中的字落盤),還原後 `save-flow` 40/40;全新 fixture `--all` 485/485 passed,略過 8 項,203s。

## 2026-10-10 — 稿紙化第一階段:一個 Enter 一段、隱藏段落空行與 Markdown 標記(Issue #44)

- **新模組 `app/frontend/src/paper.ts`**(`Editor.tsx` 只接線:擴充掛在 `defaultKeymap` 之前,才會取代 Enter/Backspace/Delete 的預設行為)。規則本身寫在 `docs/SPEC.md` §17.3 稿紙化,這裡只記實作與驗證。
- **三個實作上的坑(都實測過,註解寫在 `paper.ts`)**:
  1. **block decoration 不能由 ViewPlugin 提供**(CM 會拋 「Block decorations may not be specified via plugins」):藏段落空行只能放 `StateField`,那份整份文件算一次空行;行內標記與行樣式仍然只算可見範圍前後各 60 行。
  2. **語法高亮的 mark 會蓋掉同範圍的 replace decoration**(CM 在 `openStart` 分支不建立 widget):`# ` 前綴用 replace 藏不掉,畫面照樣出現 `#`;改用 `mark` + `display:none`。
  3. **`atomicRanges` 只移動「嚴格落在範圍內」的位置**:只蓋那一個換行的原子範圍,左右方向鍵會停在隱藏空行的邊界上;原子範圍改成比 decoration 前後各寬一格。
- **實作期間發現並修掉的漏**:Enter 的 guard 原本只判斷程式碼區塊、沒判斷 frontmatter。行尾按 Enter 的結果剛好與預設相同,舊檢查看不出來;改成「在行首按 Enter」(段落化會補 `

`、預設只補一個 `
`)才暴露,已修。
- **E2E**:新增 `app/e2e/suites/paper.js`(29 項檢查,另加共用的「頁面沒有 JavaScript 錯誤」):段落化 Enter(段中/段尾/軟換行/程式碼區塊/frontmatter/IME 組字)、一次 Ctrl+Z、段首 Backspace 與段尾 Delete 合併(含多個空行的間隔)、(箭頭)/(左右)方向鍵與點擊不落在隱藏空行、多空行只藏分隔那一個、標記隱藏與游標回到該行時還原、◇◇◇、註解弱化、段距與段首縮排(computed style)、既有稿件開檔存檔逐位元組不變、640 寬不出水平捲軸、專用檔清理;附深/淺色與 640 寬截圖。
- **既有測試的觀察方式(經 Orchestrator 裁決)**:`search-editor.js` 的 `editorTxt`/兩處 `docText`/`caretAt`/`cursorToLine` 改讀 CodeMirror state(`__perkinsEditor.doc()/cursor()`),check() 名稱、比較條件、期望值一字未改,`caretAt` 行號以文件行為準。原因是稿紙化後「作者看到的畫面」不再等於檔案文字,而 `cursorToLine` 用 ArrowDown 次數定位會被隱藏空行跳過。`openMenu` 的右鍵位置改依「森林深處」那一行的文字框(固定像素在版面改變後會落到不同字元)。三階段:改前 **87/97** → helper 改後 **95/97** → openMenu 改後 **97/97**。`Editor.tsx` 的 DEV hook 另加 `doc()`/`cursor()`/`setCursor()`(只在 `import.meta.env.DEV` 下,正式建置不含)。
- **破壞驗證 18 輪**(拿掉對應實作 → 該項必須 FAIL → 還原):R1 Enter 綁定、R2 插入拆成兩次 dispatch、R2b Shift+Enter 接到段落化、R3 程式碼區塊/frontmatter 判斷、R4 IME 防護、R5 不藏空行、R6 原子範圍+行盒不收起、R7 Backspace/Delete 綁定、R8 標記隱藏、R9 忽略 touching、R10 ◇◇◇ widget、R11 註解弱化、R12 段落樣式、R13 置中、R14 區塊內也套用、R15 存檔時正規化(錯誤寫法)、R16 段落不換行(版面溢出)、R17 清理;18 輪都讓對應檢查 FAIL。
- **`--all`(全新 fixture,冷啟動)**:497/497 passed(略過 8,184 秒)= main 基準 468 項 + paper 組新增 29 項、零 FAIL;既有 15 組的檢查數與基準逐一相同(沒有退步)。
- **效能(實測)**:約 7.6 萬字章節(2212 行),按鍵到畫面更新中位數 **13.2ms**、最大 **20.1ms**(40 次),捲到中段 149ms——不低於 SPEC §17.3 的既有基準(中位數約 20ms、最大約 30ms)。
- **未做(第二階段)**:名稱/別名比對提示、可調版心寬度、字級/段距設定、打字機捲動、專注模式。
- **待作者實機**:真實注音/倉頡組字下的 Enter 與 decoration 不會跳動(#47;無頭環境只能用合成/CDP 組字事件驗)。
- **返工(codex 審查 2 Major,Orchestrator 直接修)**:(1)段首 Backspace/段尾 Delete 的合併沒排除程式碼區塊與 frontmatter,會跨過可見空行把兩行接起來(`a: x`+`b: y` → `a: xb: y`)→ 兩端任一在區塊內就走預設行為。(2)呈現契約:原本單一換行後的行畫成同段續行,與「複製為平台格式」每個非空行一段不一致(以單一換行分段的既有稿件會看成一大段)→ 每個非空白的一般行都套段落樣式;檔案格式、Enter 雙換行、匯出規則不變。新增 2 項 E2E(區塊內行首 Backspace),Shift+Enter 檢查改為兩行各是一段。破壞驗證:拿掉區塊判斷 → 2 項 FAIL;改回續行判斷 → Shift+Enter 項 FAIL(第一次執行被書櫃 race 中斷,重跑得到結果);還原後 `paper` 32/32,全新 fixture `--all` 499/499 passed,略過 8 項,184s。

## 2026-10-10 — 提案審查改為可調整大小的懸浮視窗(Issue #35)

- **新元件 `ProposalReview.tsx`**:`fixed` 懸浮、標題列可拖曳、CSS `resize: both` 可調整大小,預設 `min(900px,92vw)`×`min(640px,85vh)` 置中;開啟與視窗縮放時限制回可見範圍(照 #55 ChatWindow 的 effect)。層級 `z-50` 在聊天浮窗(`z-40`)之上。
- **入口**:每張提案卡加「放大審查」圖示鈕+tooltip;聊天窗內原本的卡片與接受/拒絕不變。標題列顯示目標檔名、`第 i / n 個`、上一個/下一個、模型名、關閉。
- **內容**:左「原文」唯讀(沿用 `diff-del`)、右「修改後」可編輯 textarea(沿用 `diff-add`);堆疊門檻用**視窗自己**的寬度(< 720px,`ResizeObserver` 驅動),不是螢幕寬度;下方顯示理由、假設與衝突文案(照卡片)。頁尾:還原 AI 版本(有修改時)、拒絕/捨棄、接受。
- **共用狀態**:`edited` 由 ChatWindow 持有並以 props 傳入,與聊天卡片雙向反映;接受/拒絕呼叫**同一組** `accept`/`reject`(後端路徑、唯讀鎖、快照、Provenance 用語都不變,未新增任何自動接受路徑)。處理完一張接清單上的下一個待審提案,已是最後一個就關閉;`Esc` 只關閉視窗、提案維持待審。未動後端。
- **驗證**:`tsc --noEmit`、`npm run build` 通過(工作樹 `npm ci`)。E2E `visual-1b` 新增 13 項(專用章節 `manuscript/審查視窗.md` + 兩個專用提案):卡片開啟與第 i / n 個、上一個/下一個、Esc 不動提案狀態、拖到右側後縮成 640 完整在畫面內且接受/拒絕可見可點、640 上下堆疊、1280 左右並排、標題列拖曳、右下角調整大小、視窗編輯→卡片「已修改」、卡片編輯→視窗同步、接受後磁碟為作者版本並切到下一個、拒絕最後一個關閉且從待審消失。
- **破壞驗證 9 輪**(每輪只跑 `visual-1b`):①不 render 審查視窗 → 13 項全 FAIL;②上一個/下一個 no-op → 2 項 FAIL;③不共用 `edited` → 2 項 FAIL;④接受/拒絕後不切換 → 2 項 FAIL;⑤一律左右並排 → 640 堆疊 FAIL;⑥一律上下堆疊 → 1280 並排 FAIL;⑦不做縮窄回可見範圍 → 640 完整在畫面內 FAIL;⑧標題列不拖+`resize:none` → 拖曳與調整大小 FAIL;⑨Esc 不關閉 → Esc 檢查 FAIL。還原後全綠。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)**452/454 passed**,略過 8 項,212s;新增 13 項全過。2 項 FAIL 是 #63 的既有書櫃 `ListRecent` race(`bible`、`layout-visual` 的「回書櫃重開作品」等不到卡片;同一環境下 main 不含本 PR 的一輪也是同樣這 2 項 FAIL)。settings.json 已逐位元組還原、書櫃無殘留、`shelf` 組「複製到平台」覆寫了系統剪貼簿(既有行為,無法還原)。
- **跨組影響(本次發現)**:本節的 640×672 檢查會觸發 §17.1 的 ≤960 側欄/資訊欄互斥而收掉資訊欄;`save-flow` 的 E6 步驟會落到資訊欄裡的場景清單,少了資訊欄就等不到「森林」而 abort。已在本節窄寬度檢查後把資訊欄還原成開著狀態(fs 檢查 `[data-testid=inspector]`,沒有就點 `[data-testid=toggle-inspector]`);`visual-1b + save-flow` 兩組連跑 52/52 全過。未修改 `save-flow`。
- **返工(codex 審查 1 Major + 3 Minor,Orchestrator 直接修)**:(1)手動放大後縮窄:視窗尺寸上限跟著可見範圍(`max-width: 100vw`、`max-height` 扣標題欄),頁尾按鈕不會落到畫面外。(2)接受/拒絕失敗(衝突、寫檔失敗)不再跳到下一個:改由「目前提案離開待審清單」驅動切換,失敗時提案仍在清單上,視窗留在原處。(3)清單在視窗開著時變動(從聊天卡片處理目前或下一張):依最新清單接下一張或關閉,過渡的一次 render 沿用上一張內容,不留空殼與失效的監聽器。(4)上方剪貼簿描述改為實情。新增 4 項 E2E(手動放大後縮到 640、接受等待中從卡片拒絕下一張、衝突留在原處、目前提案從卡片捨棄後縮放不拋錯);破壞驗證:換回修正前的兩個元件 → 4 項 FAIL,還原全綠。全新 fixture `--all` 468/468 passed(main 451 + 17)。

## 2026-10-10 — 段落移動、插入場景標題、編輯器內場景跳轉(Issue #46 後半)

- **段落上移/下移**:`Alt+↑`/`Alt+↓`(綁定放在 defaultKeymap 前,取代 CodeMirror 的 moveLineUp/Down)。游標所在行(有選取時為選取涵蓋的所有行)與上/下最近的非空白行交換位置,中間的空白行留在原處(空行分段與不空行兩種寫法都保持段落間距不變);選取結束在下一行行首時該行不算在單位內(與視覺選取一致);已在頂/底不動作。游標與選取跟著內容走,一次 Ctrl+Z 復原(`isolateHistory.of('full')`)。
- **插入場景標題**:`Alt+Enter` 與右鍵子選單「段落與場景」。在游標所在行後面插入 `## `,標題前後各留一個空白行:游標行或下一行已是空白行就沿用(不重複加),檔案最後一行就不再補後面那行;游標放在 `## ` 之後讓作者直接輸入場景名稱。
- **編輯器內場景跳轉**:`Alt+PageUp`/`Alt+PageDown` 跳到上/下一個場景(`## ` 開頭且標題非空,與側欄場景清單同一套判準),游標移到該行行首並捲入可視範圍,沒有就不動作;右鍵子選單另有「上一個場景/下一個場景」。
- **右鍵選單**:上述 5 項收在子選單「段落與場景」,標示快捷鍵,樣式與往左開規則照「插入標點」。
- **IME 與快捷鍵衝突**:`view.composing`/`compositionStarted` 時不動作;`Alt+↑/↓` 與 PageUp/Down 在 defaultKeymap 有預設綁定,組字中要吃掉按鍵才不會落到 moveLineUp/Down(與 #46 前半「不攔截」的差別在此)。`Alt+Enter` 查過 CodeMirror 各 keymap 與前端全域 keydown 皆無綁定,不與既有快捷鍵衝突。
- **驗證**:`tsc --noEmit`、`npm run build` 通過(工作樹 `npm ci`)。E2E `search-editor` 新增 22 項,破壞驗證 3 輪:①拿掉 5 個 keymap 綁定 → 19 項 FAIL(不空行上/下移與 CodeMirror moveLine 行為等價,此輪 PASS;右鍵選單 3 項由②驗證);②拿掉「段落與場景」子選單 → 選單 3 項 FAIL;③三個函式改成 no-op → 含不空行上/下移在內全部 FAIL。還原後全綠。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)**433/435 passed**,略過 8 項,207s;新增 22 項全過。2 項 FAIL 是既有書櫃 `ListRecent` race(`bible`、`layout-visual` 的「回書櫃重開作品」等待卡片逾時,suite 自己在 `bible.js` 註明為既有 flaky race);把本次改動 stash 掉只跑 main 的一輪同樣是這 2 項 FAIL(411/413),書櫃清空後(clean-recent.js)仍重現 → 與本次改動無關。settings.json 已逐位元組還原、書櫃無殘留;`shelf` 組「複製到平台」覆寫了系統剪貼簿(既有行為,無法還原)。
- **返工(codex 審查 2 項 Minor,Orchestrator 直接修)**:(1)場景跳轉改用與側欄 `ParseScenes` 同一套判準,略過程式碼區塊內的 `## `;新增 2 項 E2E(fence 內假標題雙向都不跳入),破壞驗證(停用 fence 判斷 → 2 項 FAIL)後還原。(2)上方基準的剪貼簿描述改為實情。全新 fixture `--all` 447/447 passed(main 423 + 24)。

## 2026-10-10 — Perkins Bot 浮窗縮窄後回到畫面內(Issue #55)

- `ChatWindow.tsx`:浮窗開啟時與視窗縮放時,把拖曳過的位置限制在可見範圍內(依浮窗實際大小,上界仍是標題欄底緣);收起狀態下縮窄,重新開啟時才調整。
- **E2E(layout-half,4 項)**:1440 寬拖到右側 → 縮到 640 後浮窗完整在畫面內;收起時縮窄 → 重新開啟仍在畫面內。移除 PR #54 留下的「放大到 1440 拖回左上再縮回」變通。
- **破壞驗證**:停用位置限制 → 2 項 #55 檢查與 640 寬 context-usage 檢查 FAIL;還原全綠。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)427/427 passed(基準 423 + 4)。

## 2026-10-09 — PR #59 返工(codex 審查 3 項 Minor)

- **插入自成一個復原步驟**:`insertPair`/`insertRaw` 的 dispatch 加 `annotations: isolateHistory.of('full')`,打字後立刻插入不再與前次輸入合併,一次 Ctrl+Z 只撤插入。E2E:打字後立刻 Alt+[ → Ctrl+Z 只撤插入、前面的字還在。
- **IME 防護補組字初期**:組字開始後尚無文字變更時 `view.composing` 仍為 false;快捷鍵 handler 在 `preventDefault()` 前補查 `view.compositionStarted`(CM6 `inputState.composing >= 0`,組字結束會重置)/`event.isComposing`/`keyCode 229`,任一成立就不動作、不攔截;插入函式內層同步。E2E:模擬 `compositionstart` 後 Alt+[ 不插入,組字結束(`compositionend`)後恢復插入(確認不會永遠擋住)。
- **選取字數過期回覆**:`Workspace.tsx` 加世代計數,取消選取或選取變更後,已發出的舊 `WordCount` 回覆不得寫入;取消選取立刻清空顯示。E2E:以受控延遲的 `WordCount` 綁定(只對選取文字「森林深處」卡住,比照 research R2)重現:放行前不顯示 → 放行顯示(管路正常)→ 取消後放行過期回覆不寫入。
- **破壞驗證**:移除 `isolateHistory` → 合併撤銷重現 FAIL;移除 IME 防護(keydown 與插入函式兩層)→ 組字初期插入 FAIL;移除世代核對 → 過期回覆寫入 FAIL(需在取消前確保卡住的請求已過 debounce 發出,否則無過期回覆可驗)。還原後全綠。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)412/412 passed(基準 405 + 7),略過 8 項,158s。

## 2026-10-09 — 全形標點插入 + 選取字數(Issue #46 前半)

- **標點插入**(`Editor.tsx`):作者決定打字時不做任何自動改寫,只以快捷鍵與右鍵選單「插入標點」子選單(沿用快速指令子選單樣式與往左開規則)插入:`Alt+[`「」、`Alt+Shift+[`『』(無選取游標在中間;有選取包住、選取保持在內文)、`Alt+.` `……`、`Alt+-` `——`(取代選取);IME 組字中(`view.composing`)不動作。插入為單一 dispatch,走正常 dirty/存檔,Ctrl+Z 一次復原。
- **實作細節**:快捷鍵不用 `keymap.of`——Windows Chromium 在 Alt 組合下 `event.key` 不反映 Shift(`Alt+Shift+[` 的 key 仍是 `[`),CM 的 key 名會把兩者視為同一鍵(實測 `Alt+Shift+[` 被當成 `Alt-[` 插了「」);改用 `EditorView.domEventHandlers` 以實體鍵 `event.code` + `shiftKey` 區分,並只在編輯器內容聚焦時處理。衝突檢查:defaultKeymap/historyKeymap/searchKeymap 與 CM 預設無這四個 Alt 組合(既有僅 `Alt-u` redo)。
- **選取字數**(`Workspace.tsx`):編輯器有選取時狀態列在本章字數旁顯示「已選 N 字」(`count-selection`),N 用與本章字數同一套 `WordCount` 綁定、同樣 250ms debounce,不在前端另算;沒有選取不顯示;640 寬 `shrink-0 whitespace-nowrap` 不溢出。
- **E2E(search-editor,22 項,E2E_SKIP_AI=1)**:專用章節;4 個快捷鍵(無選取游標位置、有選取包住並保留選取)、各 Ctrl+Z 一次復原、右鍵選單 4 項與快捷鍵標示、靠右緣子選單往左開、選取字數與 `WordCount(該段)` 同值、取消選取消失、640 寬狀態列不溢出。注意:Windows Chromium 右鍵會先把游標移到點擊處(原生 contenteditable 行為),選單插入落在右鍵點擊處,以累積連續片段驗證。
- **破壞驗證**:移除快捷鍵 handler → 12 項快捷鍵檢查 FAIL;選單項目改為不動作 → 4 項選單插入檢查 FAIL;選取字數固定值 → 同值檢查 FAIL;無條件渲染 span → 「取消選取後消失」的 detach 等待逾時(組中斷,守住存在性);還原後全綠。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)405/405 passed(基準 383 + 22),略過 8 項,153s。`tsc --noEmit`、`npm run build` 通過。後半(段落上移/下移、場景標題插入與跳轉)未做。

## 2026-10-09 — reloadCurrent 讀檔期間切章競態修復(Issue #56)

- `Workspace.reloadCurrent`(接受提案、版本還原後的重載)在 `await ReadFile` 後核對 `latest.current.current` 仍是發起時的檔案,已切到別章就不套用(不 setText、不 setFlashP、不清 dirty、不重掛);比照 `openFile` 的 stale 檢查與 `deleteCategory` 重讀的寫法。原本讀檔期間切章會把 A 章內容放進 B 章編輯器,之後存檔寫進 B 章檔案(資料遺失風險)。
- **E2E(visual-1b,3 項)**:專用章節 A/B,寫入提案檔後覆寫 `ReadFile` 讓 A 章讀取卡在受控 Promise(比照 research R2),接受提案 → 卡住期間切到 B → 放行;斷言麵包屑仍是 B、編輯器仍顯示 B 內容、在 B 打字存檔後磁碟上的 B 未被寫成 A 章內容;`finally` 還原綁定與浮窗收合。
- **破壞驗證**:拿掉核對 → 「編輯器仍顯示章節 B」與「磁碟上的 B 不變」兩項 FAIL(編輯器被寫入 A 章內容,存檔把 A 內容寫進 B 檔);放回後全綠。
- **基準**:全新 fixture `--all`(E2E_SKIP_AI=1)386/386 passed(基準 383 + 3),略過 8 項,148s;settings.json 逐位元組還原,書櫃無殘留,剪貼簿未覆寫。
- **返工(codex 審查,Orchestrator 直接修)**:(1)Major:只比路徑仍會丟字——接受期間作者在同一章打字,重載回來會覆蓋;A→B→A 的過期重載也會通過。改為接受期間(存檔→套用→重載)編輯器唯讀(`Editor` 的 `readOnly` prop,CodeMirror Compartment;版本還原在對話框內,本來就無法打字),並加開檔世代 `navGen`,讀檔期間開過檔即作廢。(2)E2E 放行後明確等讀檔完成、存檔等落盤;覆寫綁定改 try/finally 還原。新增 3 項:接受期間打字不進編輯器、完成後顯示套用內容、完成後解除唯讀。破壞驗證:不上鎖 → 唯讀檢查 FAIL;不解鎖 → 後續存檔失效中斷;拿掉核對 → 切章兩項 FAIL。全新 fixture `--all`:389/389。
- **返工 2(codex 複審 3 項 Major)**:(1)右鍵剪下/貼上直接送出修改,繞過 `readOnly` → 唯讀時再加 `EditorState.changeFilter` 擋下所有文件修改;(2)重複按接受,第二次失敗會提早解鎖 → 鎖改計數(`lockEdits` 回傳解鎖函式,全部結束才解鎖);(3)版本還原可按 Escape 關對話框繼續打字 → 還原(存檔→寫入→重載)也上同一把鎖。新增 3 項檢查;破壞驗證:計數改布林 → 重複接受檢查 FAIL;拿掉 changeFilter → 同項 FAIL;還原不上鎖 → 還原檢查 FAIL。全新 fixture `--all`:393/393。
- **返工 3(codex 複審 1 項 Major)**:同一章的重載重疊(連續接受兩個提案、接受與還原重疊)時,較舊讀取晚回來會倒序覆蓋較新內容。加重載世代 `reloadGen`,只套用最後發起的那次。新增檢查:讀取立即發出但結果暫扣,較新先回、較舊後回,畫面須為兩個提案都套用後的內容;破壞驗證:拿掉世代核對 → FAIL。全新 fixture `--all`:394/394。

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
- SPEC M3 寫「行內 diff」;目前是提案卡片內的「原文/替換」對照,尚未在編輯器內行內顯示(未使用 `@codemirror/merge`)。這是與規格的差異,待作者決定是否需要。(2026-10-10 已由 #45 方案 A「審查視窗」取代,見 SPEC §10「審查地點」。)

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
