# Perkins WritingSpace

以 Agentic Writing 為核心的領域專用 Agent Harness：整合寫作編輯器、作品工作環境與 Agent 執行機制，讓作者在保有創作主導權的前提下與 AI 協作。作品資料夾就是 Perkins Bot 的工作環境，Bot 可按需讀取作品內容（作者可排除特定資料夾）；對稿件與設定的任何修改都只能以提案提出，經作者接受才會寫入，並可回溯。應用程式使用 Wails、Go、React 與 TypeScript。

## 目前階段

**核心流程已實作並經過驗證，尚未作為穩定產品發布。** 「AI 只能提案、作者接受後才寫入、接受後可回溯」的核心流程已可使用。現階段依新的產品定位（見 [規格書](docs/SPEC.md) §0）調整 Agent 的治理方式，並持續修整介面與操作體驗、改進試用回饋。

介面與操作細節仍可能依試用回饋調整。試用前請備份作品；已實作項目與已知限制見 [實作進度](docs/PROGRESS.md)。

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
