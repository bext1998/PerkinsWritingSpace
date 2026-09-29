# Perkins WritingSpace

以作者控制權為核心的本機小說寫作桌面應用。AI 可以讀取作者允許的內容並提出修改；稿件與設定須經作者接受才會改動。應用程式使用 Wails、Go、React 與 TypeScript。

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
