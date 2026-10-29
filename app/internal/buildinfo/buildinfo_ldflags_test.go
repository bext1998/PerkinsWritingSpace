package buildinfo

import (
	"os"
	"testing"
)

// 封存 ldflags 注入後、其他測試改寫之前的實際值;
// 相依關係保證 version/commit 先於這兩個變數初始化(-X 是寫進初始值,init 之前).
var (
	injectedVersion = version
	injectedCommit  = commit
)

const expectEnvName = "PERKINS_EXPECT_FULL_VERSION"

// TestFullVersionFromLdflags 是 CI build 工作的驗收腳本:用與 wails build 相同的一組 ldflags
// 建置這個測試,讀回 FullVersion() 的實際值,而不是在 exe 裡搜字串(-ldflags 參數本身會被 Go
// 記錄進執行檔的 build metadata,搜字串搜到不代表注入成功).
//
// 只有設了 PERKINS_EXPECT_FULL_VERSION 才執行;一般 go test ./... 與 CI check 不受影響。
func TestFullVersionFromLdflags(t *testing.T) {
	want := os.Getenv(expectEnvName)
	if want == "" {
		t.Skipf("未設定 %s,跳過 ldflags 注入驗收", expectEnvName)
	}
	// 變數名稱拼錯時 Go linker 不報錯,version 會維持預設值;先講清楚這一路。
	if injectedVersion == defaultVersion || injectedVersion == "" {
		t.Fatalf("buildinfo.version 未被注入,仍為預設值 %q(檢查 -X 的變數名稱是否為 perkins/internal/buildinfo.version)", injectedVersion)
	}
	if got := FullVersion(); got != want {
		t.Fatalf("FullVersion() = %q,預期 %q(version=%q commit=%q)", got, want, injectedVersion, injectedCommit)
	}
}
