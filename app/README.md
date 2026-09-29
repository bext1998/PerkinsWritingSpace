# Perkins WritingSpace 應用程式

Wails v2 桌面應用:Go 後端(`app.go`、`internal/`)+ React/TypeScript 前端(`frontend/`,shadcn/ui + Tailwind)。功能範圍與驗收標準見 [規格書](../docs/SPEC.md)。

## 需要的環境

- Go 1.23 以上、Node.js 18 以上、[Wails CLI v2](https://wails.io/docs/gettingstarted/installation)
- Windows 需要 WebView2(Windows 11 內建)
- 本機模型(選用):LM Studio,預設端點 `http://localhost:1234/v1`

## 常用指令(在 `app/` 執行)

| 目的 | 指令 |
|---|---|
| 開發模式(前端熱更新) | `wails dev` |
| 建置 | `wails build` → `build/bin/perkins.exe` |
| 後端測試 | `go test ./...` |
| 前端型別檢查 | `cd frontend && npx tsc --noEmit` |
| 修改 Go 綁定後重新產生前端綁定 | `wails generate module` |
| 前端 E2E | 見 `../.agent/skills/e2e/SKILL.md` |

## 目錄

- `internal/project`:專案資料夾、卷與章節、路徑規則
- `internal/agent`:AI 代理迴圈、工具白名單、上下文組裝與壓縮
- `internal/proposal`、`internal/snapshot`:提案審核、快照與還原
- `internal/bible`:設定集實體、登場索引、寫法檢查
- `internal/summary`:章節摘要
- `internal/publish`:平台輸出與繁簡轉換
- `internal/notion`:Notion 匯入
- `internal/settings`:應用程式設定(金鑰存在系統憑證庫)
- `internal/llm`:OpenAI 相容 API 客戶端

開發模式下設定環境變數 `PERKINS_OPEN=<專案資料夾>` 可以在啟動時直接開啟專案,略過資料夾對話框。
