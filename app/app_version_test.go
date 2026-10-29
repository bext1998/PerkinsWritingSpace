package main

import (
	"strings"
	"testing"

	"perkins/internal/buildinfo"
)

// AppVersion 是前端(#175「關於」頁面)取完整版本字串的綁定(#174 / SPEC §17 版本號規則)。
// 本機 go test 不會以 ldflags 注入,所以這裡看到的是開發版標示,不是看似正式的版本號。
func TestAppVersionReportsDevLabelWhenNotInjected(t *testing.T) {
	app := NewApp()
	got := app.AppVersion()
	if !strings.Contains(got, "開發版") {
		t.Fatalf("AppVersion() 未注入時應回報開發版標示,拿到 %q", got)
	}
	if got != buildinfo.DevLabel {
		t.Fatalf("AppVersion() = %q, want buildinfo.DevLabel %q", got, buildinfo.DevLabel)
	}
}
