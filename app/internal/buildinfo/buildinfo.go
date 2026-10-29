// Package buildinfo 提供完整版本字串(#174 / SPEC §17 版本規則)。
//
// 正式建置(.github/workflows/ci.yml 的 build 工作)以 ldflags 注入 version 與 commit:
//
//	go build -ldflags "-X perkins/internal/buildinfo.version=0.1.0-a1 -X perkins/internal/buildinfo.commit=abc1234"
//
// 本機 `wails dev` 與 `wails build` 沒有注入,值維持預設,FullVersion 回報開發版標示。
// Alpha 階段標記(a1)只寫在 CI workflow 的變數,不在這裡寫死。
package buildinfo

const (
	// defaultVersion 是未注入時的版本值,同時作為「是否有注入」的判斷基準;
	// 正式建置不可注入與之同名的版本字串,否則開發版會被誤判為正式版。
	defaultVersion = "dev"

	// defaultCommit 是未注入時的提交編號值(空字串表示沒有提交編號)。
	defaultCommit = ""

	// DevLabel 是未注入時 FullVersion 回傳的內容:讓「關於」頁面看得出是開發版。
	DevLabel = "開發版 (未注入版本資訊)"
)

// 建置時注入的套件層級變數;名稱與路徑要和 CI 的 -X 參數一致。
var (
	version = defaultVersion
	commit  = defaultCommit
)

// FullVersion 回傳完整版本字串:
//
//	注入   : 0.1.0-a1 (abc1234)
//	未注入 : 開發版 (未注入版本資訊)
//
// 注入版本但沒有提交編號(例如手動只注入版本)時,只回傳版本部分。
func FullVersion() string {
	if version == defaultVersion || version == "" {
		return DevLabel
	}
	if commit == "" {
		return version
	}
	return version + " (" + commit + ")"
}
