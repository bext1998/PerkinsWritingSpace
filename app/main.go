package main

import (
	"context"
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

// 預設視窗尺寸(SPEC §17.1):主螢幕放不下就啟動時最大化,見 maximiseIfScreenTooSmall。
const (
	defaultWidth  = 1280
	defaultHeight = 800
)

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Perkins WritingSpace",
		Width:     defaultWidth,
		Height:    defaultHeight,
		MinWidth:  900,
		MinHeight: 600,
		Frameless: true, // 標題欄由前端自畫(SPEC §17.1);DisableResize 保持 false,邊緣縮放才有效
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
			maximiseIfScreenTooSmall(ctx)
		},
		OnBeforeClose: app.beforeClose,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

// maximiseIfScreenTooSmall:主螢幕放不下預設視窗時改為最大化(SPEC §17.1)。
// Wails v2.12 的 runtime.Screen 只回報螢幕尺寸,沒有工作區(工作列)欄位,判斷以主螢幕
// 邏輯尺寸(Size,與 options.App 的 Width/Height 同單位)為準;讀不到螢幕資訊就維持
// 預設尺寸,不影響啟動。
func maximiseIfScreenTooSmall(ctx context.Context) {
	screens, err := runtime.ScreenGetAll(ctx)
	if err != nil {
		return
	}
	i, ok := primaryScreen(screens)
	if !ok {
		return
	}
	if needsMaximise(screens[i].Size.Width, screens[i].Size.Height) {
		runtime.WindowMaximise(ctx)
	}
}

// primaryScreen 回傳主螢幕在清單中的索引;沒有任何 IsPrimary 標記時退回第一個,清單為空回 false。
func primaryScreen(screens []runtime.Screen) (int, bool) {
	for i, s := range screens {
		if s.IsPrimary {
			return i, true
		}
	}
	if len(screens) > 0 {
		return 0, true
	}
	return 0, false
}

// needsMaximise:螢幕邏輯尺寸小於預設視窗任一邊就該最大化;等於剛好放下則不動。
func needsMaximise(screenW, screenH int) bool {
	return screenW < defaultWidth || screenH < defaultHeight
}