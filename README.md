# Perkins WritingSpace

以作者控制權為核心的本機小說寫作桌面應用。AI 可以讀取作者允許的內容並提出修改；稿件與設定須經作者接受才會改動。應用程式使用 Wails、Go、React 與 TypeScript。

## 目前階段

**本專案處於最小原型（MVP）製作與實驗階段，尚未作為穩定產品發布。** 目標是透過寫作試用，驗證「作者掌握控制權、AI 只讀取與提案、接受修改後可回溯」的核心流程。

功能、介面與資料格式可能隨實驗結果調整，部分流程仍待驗證。試用前請備份作品；已實作項目、待驗證流程與已知限制見 [實作進度](docs/PROGRESS.md)。

## 專案內容

- `app/`：桌面應用程式與測試。
- `docs/SPEC.md`：功能規格與驗收標準。
- `docs/PROGRESS.md`：實作進度與已知限制。
- `docs/PITFALLS.md`：已確認的問題與教訓。
- `.agent/`：專案 Agent 的記憶與專用技能，不屬於應用程式的 AI 工具權限。

## 開發

在 `app/` 目錄執行 `wails dev` 啟動開發版，或執行 `wails build` 建置桌面應用。Go 測試使用 `go test ./...`。所需環境與其他操作見 [應用程式說明](app/README.md)；功能範圍以 [規格書](docs/SPEC.md) 為準。

## 授權

專案採用 [MIT 授權](LICENSE)。內含字型依其 [OFL 授權](app/frontend/src/assets/fonts/OFL.txt)。
