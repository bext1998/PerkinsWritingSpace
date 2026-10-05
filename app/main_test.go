package main

import (
	"testing"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SPEC §17.1:主螢幕放不下預設視窗(1280×800)才最大化。
// 先建立能證明這個決策的最小驗證(實作見 main.go 的 primaryScreen/needsMaximise)。
// runtime.Screen 的 Size 欄位型別(ScreenSize)未由 runtime 包導出,測試只設定可建構的欄位,
// 回傳索引讓「選到哪個螢幕」可被斷言;尺寸決策拆成純函式 needsMaximise。
func TestPrimaryScreenPicksPrimary(t *testing.T) {
	secondary := runtime.Screen{IsPrimary: false}
	primary := runtime.Screen{IsPrimary: true}
	idx, ok := primaryScreen([]runtime.Screen{secondary, primary, secondary})
	if !ok {
		t.Fatal("primaryScreen 回報找不到主螢幕")
	}
	if idx != 1 {
		t.Fatalf("應選到索引 1 的主螢幕,拿到 %d", idx)
	}
}

func TestPrimaryScreenFallsBackToFirst(t *testing.T) {
	only := runtime.Screen{IsPrimary: false}
	idx, ok := primaryScreen([]runtime.Screen{only})
	if !ok || idx != 0 {
		t.Fatalf("沒有任何主螢幕標記時應退回第一個螢幕,拿到 idx=%d ok=%v", idx, ok)
	}
	if _, ok := primaryScreen(nil); ok {
		t.Fatal("空螢幕清單應回報 false(維持預設尺寸,不最大化)")
	}
}

func TestNeedsMaximise(t *testing.T) {
	cases := []struct {
		name string
		w, h int
		want bool
	}{
		{"1920x1080 放得下", 1920, 1080, false},
		{"剛好 1280x800 放得下", 1280, 800, false},
		{"高度 768 放不下", 1366, 768, true},
		{"寬度差 1px 放不下", 1279, 800, true},
		{"高度等於 800(工作列未計入的已知限制)放得下", 1920, 800, false},
	}
	for _, c := range cases {
		if got := needsMaximise(c.w, c.h); got != c.want {
			t.Errorf("%s: needsMaximise(%d×%d) = %v, want %v", c.name, c.w, c.h, got, c.want)
		}
	}
}