# PITFALLS.md — 踩過的坑

## 1. Go 的 nil slice 變成 JSON `null`,前端 `.filter` 一拋錯就整個視窗全白(2026-09-30)

**症狀**:在章節裡收合左側欄,再按右下角 AI 助手圓鈕,整個視窗變成一片空白,沒有任何 UI。

**重現**:開啟專案 → 開一個**沒有出現任何設定(角色/地點…)名稱**的章節 → 按 AI 助手圓鈕。收合側欄只是巧合,不是條件;側欄展開時同樣會白屏。相反地,只要章節文字提到任何設定名稱(例如 E2E 的第一章、第二章)就不會發生,所以很難在平常的測試資料裡碰到。

**根因**:`bible.Mentions` 用 `var out []string`,沒有命中時回傳 nil。Wails 把 nil slice 序列化成 `null`,`SuggestAttachments` 的結果 `null` 被 `setSuggest` 存進 state,下一次 render 執行 `suggest.filter(...)` 時拋出 `TypeError: Cannot read properties of null (reading 'filter')`(`ChatWindow.tsx`)。React 18 遇到 render 期間未被捕捉的錯誤會卸載整棵樹,而 app 沒有 ErrorBoundary,所以整個視窗全白。這個 effect 只在 AI 視窗開啟時才跑,所以錯誤要等到按下圓鈕才發生。

**修法**:
- 後端:`Mentions` 改成 `out := []string{}`,和 `Tree`、`ListProposals`、`ListSnapshots`、`FindVariants` 等其他綁定方法一樣永遠回傳非 nil 切片。
- 前端:`ChatWindow` 收到 `SuggestAttachments` 結果時 `r ?? []`,即使後端日後又漏掉也不會炸。
- 單元測試 `TestMentionsEmptyIsNotNil` 鎖住「沒有命中 → 序列化為 `[]`」。

**日後怎麼避免**:
- 任何會被 Wails 綁定、回傳 slice 或 map 的 Go 函式:回傳前保證非 nil(`[]T{}`、`make(...)`、`map[..]..{}`),不要用 `var out []T` 直接回傳。struct 裡的 slice 欄位同理。
- 前端把綁定結果存進 state、且之後會 `.map/.filter/.length` 時,在接收處用 `?? []` 正規化。
- 測「空結果」的路徑:測資裡要有一份「什麼都沒命中」的稿件,而不是只測有命中的。

**其他同型態的地方**:已逐一檢查所有回傳 slice/map 的綁定方法與前端使用處(`ListRecent`、`ChapterWordCounts`、`ListProposals`、`ListSnapshots`、`SnapshotDiff`、`ListModels`、`FindVariants`、`NotionScan/Undo`、`GetTree`、`BibleIndex`、Preview 等),後端都已回傳非 nil,僅 `SuggestAttachments` 漏掉。`ConvertOptions` 內容固定非空,未改。

**回歸檢查**:`app/e2e/e2e.js` 的「收合側欄後在無設定的章節開啟 AI 視窗」(fixture 新增了不提任何設定的「第三章」);Go 端為 `internal/bible` 的 `TestMentionsEmptyIsNotNil`。
