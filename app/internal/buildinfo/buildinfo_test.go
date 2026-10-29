package buildinfo

import (
	"strings"
	"testing"
)

// 這組測試會改寫套件層級變數(version/commit),一律先封存原值、再用 t.Cleanup 還原,
// 避免殘留值影響同套件的其他測試(包含 buildinfo_ldflags_test.go 的注入驗收)。

// 注入值存在時要回報完整版本字串(SPEC §17 版本規則,#174):版本 + 提交編號(7 碼)。
func TestFullVersionWithInjection(t *testing.T) {
	prevVersion, prevCommit := version, commit
	t.Cleanup(func() { version, commit = prevVersion, prevCommit })
	version, commit = "0.1.0-a1", "abc1234"
	if got, want := FullVersion(), "0.1.0-a1 (abc1234)"; got != want {
		t.Fatalf("注入 0.1.0-a1 + abc1234 時 FullVersion() = %q, want %q", got, want)
	}
}

// 只注入版本、沒有提交編號時不硬湊空括号。
func TestFullVersionWithoutCommit(t *testing.T) {
	prevVersion, prevCommit := version, commit
	t.Cleanup(func() { version, commit = prevVersion, prevCommit })
	version, commit = "0.1.1-a1", ""
	if got, want := FullVersion(), "0.1.1-a1"; got != want {
		t.Fatalf("只注入版本時 FullVersion() = %q, want %q", got, want)
	}
}

// 本機 wails dev/wails build 沒注入:要看得出來是開發版,且不出現看似正式的版本號。
func TestFullVersionWithoutInjectionIsDevBuild(t *testing.T) {
	prevVersion, prevCommit := version, commit
	t.Cleanup(func() { version, commit = prevVersion, prevCommit })
	version, commit = defaultVersion, defaultCommit
	got := FullVersion()
	if !strings.Contains(got, "開發版") {
		t.Fatalf("未注入時應回報開發版標示,拿到 %q", got)
	}
	if strings.Contains(got, "-a1") || strings.Contains(got, "0.1.") {
		t.Fatalf("未注入時不得顯示看似正式的版本號: %q", got)
	}
	if got != DevLabel {
		t.Fatalf("未注入時 FullVersion() = %q, want DevLabel %q", got, DevLabel)
	}
}
