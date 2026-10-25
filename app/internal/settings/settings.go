// Package settings 儲存應用程式層級的設定(模型端點、最近專案、平台輸出規則、外觀)。
// 非機密設定放使用者設定目錄;API 金鑰放系統憑證庫,絕不寫進專案資料夾或設定檔(A7、B10)。
package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/zalando/go-keyring"

	"perkins/internal/publish"
)

const (
	keyService = "PerkinsWritingSpace"
	keyUser    = "model-api-key" // 第一代單一端點使用的名稱,保留給 id=default 的設定檔
	MaxRecent  = 24

	DefaultContextTokens = 16384

	// Appearance 模式(Issue #118):深色 / 淺色 / 跟隨系統
	AppearanceModeDark   = "dark"
	AppearanceModeLight  = "light"
	AppearanceModeSystem = "system"

	// 主題預設檔:深色側是「夜間書房」「深灰」;淺色側是「白紙」「米白」。
	PresetStudy   = "study"   // 沿用既有 .dark(深藍墨色 + 琥珀金)
	PresetGraphite = "graphite" // 中性深灰,無色調
	PresetPaper   = "paper"   // 沿用既有 :root(暖白紙張)
	PresetCream   = "cream"   // 米白,像舊紙

	// 介面字體大小(以 html 根字級 15 / 16 / 17px 區分)
	UIFontSizeSmall    = "small"
	UIFontSizeStandard = "standard"
	UIFontSizeLarge    = "large"

	// 減少動態效果
	ReduceMotionSystem = "system"
	ReduceMotionOn     = "on"
	ReduceMotionOff    = "off"
)

// DarkPresets / LightPresets 是各側可選的主題清單(供前端對應下拉顯示)。
var (
	DarkPresets  = []string{PresetStudy, PresetGraphite}
	LightPresets = []string{PresetPaper, PresetCream}
)

// Profile 是一個模型端點設定(本機 LM Studio、OpenRouter、Anthropic…)。金鑰不在這裡。
type Profile struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	BaseURL       string `json:"baseUrl"`
	Model         string `json:"model"`
	ContextTokens int    `json:"contextTokens"` // 模型上下文長度,用於對話壓縮的預算(SPEC §12.3)
	// DisableAutoCompact 關閉自動上下文壓縮(#32):超過預算時擋下不送出,由作者 /compact 手動壓縮。
	// 缺省(false)= 自動壓縮開啟;舊設定檔沒有這個欄位時不需遷移。
	DisableAutoCompact bool `json:"disableAutoCompact,omitempty"`
	// Provider 是端點的 API 型別(#30):"" 或 "openai" = OpenAI 相容 /chat/completions(現行);
	// "anthropic" = Anthropic 原生 Messages API。舊設定檔沒有這個欄位 = 現行行為。
	Provider string `json:"provider,omitempty"`
	// ReasoningEffort 是思考強度(#30):"" = 不指定(不送任何思考參數,用服務商預設)。
	// 允許值 low/medium/high/xhigh/max;載入時不合法的值視為 ""。
	// OpenAI 相容端點只送 low/medium/high;xhigh/max 視為不指定(各自驗證)。
	ReasoningEffort string `json:"reasoningEffort,omitempty"`
	// RemoteAckURL 是作者確認過「內容會送到這個服務」的端點網址(#99):每個雲端端點確認一次並保存,
	// 網址改變就不再相符、需要重新確認。只由 App.AckRemote 設定;SaveProfile 不接受前端傳來的值。
	RemoteAckURL string `json:"remoteAckUrl,omitempty"`
}

// RemoteConfirmed 回傳端點是否可以送出內容:本機端點,或作者已確認過目前網址的雲端端點(#99)。
func (p Profile) RemoteConfirmed() bool {
	return !IsRemote(p.BaseURL) || p.RemoteAckURL == p.BaseURL
}

const (
	// ProviderOpenAI 是 OpenAI 相容 /chat/completions(空字串與它同義)。
	ProviderOpenAI = "openai"
	// ProviderAnthropic 是 Anthropic 原生 Messages API(#30)。
	ProviderAnthropic = "anthropic"
)

// ReasoningEfforts 是思考強度的允許值全集(OpenAI 相容端點只用 low/medium/high,
// xhigh/max 是 Anthropic 原生專有,設在 OpenAI 相容端點時不指定)。
var ReasoningEfforts = []string{"low", "medium", "high", "xhigh", "max"}

type Recent struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	OpenedAt string `json:"openedAt"`
}

type Settings struct {
	BaseURL string `json:"baseUrl,omitempty"` // 第一代欄位:載入時轉為 Profile
	Model   string `json:"model,omitempty"`

	Profiles  []Profile          `json:"profiles"`
	Active    string             `json:"active"`
	Recent    []Recent           `json:"recent"`
	Platforms []publish.Platform `json:"platforms"`
	// Appearance(Issue #118):外觀設定。Theme 是第一代欄位,舊設定檔只有 theme 時會在載入時轉成 Appearance。
	// Theme 仍寫回磁碟是為了相容作者手動編輯或檔案備份,不應由前端讀取。
	Theme     string     `json:"theme,omitempty"` // 已棄用:由 Appearance.Mode 取代;Save 時會清掉
	Appearance Appearance `json:"appearance"`
	// 定時自動存檔(SPEC §17.3)。指標用來區分「作者明確關閉」與「舊設定檔沒有這個欄位」,
	// 後者視為開啟;用 bool 的話兩者都是 false,分不出來。
	Autosave *bool `json:"autosave,omitempty"`
	// 打字機音效(#116):稿件編輯器打字時的輕響。預設 false 就是關閉。
	TypingSound bool `json:"typingSound,omitempty"`
	// 打字機音效音量(0–100)。指標用來區分「沒設定」(預設 50)與「作者明確設成 0」。
	TypingVolume *int `json:"typingVolume,omitempty"`

	// 稿紙化第二階段(二)(SPEC §17.3):編輯區版面的作者全域偏好(與主題同一處),不是作品設定
	PaperWidth    string `json:"paperWidth"`    // 版心寬度(正文欄最大寬度)
	PaperFontSize string `json:"paperFontSize"` // 字級(正文字體大小)
	PaperParaGap  string `json:"paperParaGap"`  // 段距(段落之間的距離)
}

// SideAppearance 是單一側(深或淺)的外觀設定:主題預設檔、強調色、背景、文字顏色。
// Accent/Background/Foreground 為空字串時表示「跟隨主題」(由前端 deriveTokens 推算其他 token)。
type SideAppearance struct {
	Preset     string `json:"preset"`               // 深:study/graphite;淺:paper/cream
	Accent     string `json:"accent,omitempty"`     // #rrggbb;空 = 跟隨主題
	Background string `json:"background,omitempty"` // #rrggbb;空 = 跟隨主題
	Foreground string `json:"foreground,omitempty"` // #rrggbb;空 = 跟隨主題
}

// Appearance 是全域外觀設定(Issue #118):模式、各側主題與自訂色、介面字級、減少動態效果。
type Appearance struct {
	Mode         string          `json:"mode"`         // dark / light / system
	Dark         SideAppearance  `json:"dark"`         // 深色側的設定(深色模式生效時用)
	Light        SideAppearance  `json:"light"`        // 淺色側的設定(淺色模式生效時用)
	UIFontSize   string          `json:"uiFontSize"`   // small / standard / large
	ReduceMotion string          `json:"reduceMotion"` // system / on / off
}

// DefaultsAppearance 回傳預設外觀(深色夜間書房、無自訂色、標準字級、跟隨系統動態)。
func DefaultsAppearance() Appearance {
	return Appearance{
		Mode: AppearanceModeDark,
		Dark:  SideAppearance{Preset: PresetStudy},
		Light: SideAppearance{Preset: PresetPaper},
		UIFontSize:   UIFontSizeStandard,
		ReduceMotion: ReduceMotionSystem,
	}
}

// 稿紙版面只有少數幾個預設檔(不做任意數值輸入),值就是前端套用的 CSS 值;
// 預設值等於稿紙化第一階段的畫面(44rem、1.08rem、0.7em)。允許值與前端
// app/frontend/src/paperLayout.ts 的選項一致。
const (
	PaperWidthDefault    = "44rem"
	PaperFontSizeDefault = "1.08rem"
	PaperParaGapDefault  = "0.7em"
)

var (
	PaperWidths    = []string{"36rem", PaperWidthDefault, "52rem"}
	PaperFontSizes = []string{"0.95rem", PaperFontSizeDefault, "1.25rem", "1.45rem"}
	PaperParaGaps  = []string{"0.35em", PaperParaGapDefault, "1.15em"}
)

// paperPreset 只接受預設檔;不是預設檔(舊檔、被手改壞的值)一律回到預設。
func paperPreset(v string, allowed []string, def string) string {
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	return def
}

// SetPaperLayout 由前端的「稿紙版面」設定呼叫;三項都只接受預設檔,任一不是就整筆不變更。
func (v *Settings) SetPaperLayout(width, fontSize, paraGap string) error {
	if paperPreset(width, PaperWidths, "") == "" {
		return fmt.Errorf("未知的版心寬度")
	}
	if paperPreset(fontSize, PaperFontSizes, "") == "" {
		return fmt.Errorf("未知的字級")
	}
	if paperPreset(paraGap, PaperParaGaps, "") == "" {
		return fmt.Errorf("未知的段距")
	}
	v.PaperWidth, v.PaperFontSize, v.PaperParaGap = width, fontSize, paraGap
	return nil
}

// SetAppearance 由前端的「外觀」設定呼叫;整體取代(設定檔裡也只放合法值)。
// 載入/存回前 normalizeAppearance 會再做一次把關。
func (v *Settings) SetAppearance(a Appearance) {
	v.Appearance = a
}

// ValidateAppearance 給 App.SetAppearance 用(#118):嚴格版檢查,不合法回錯並拒絕寫入。
// 載入舊檔用 normalizeAppearance(寬鬆)。
func ValidateAppearance(a Appearance) error {
	return validateAppearance(&a)
}

// normalizeProfile 把載入的設定檔欄位正規化:未知的 Provider 視為 OpenAI 相容、
// 不合法的思考強度視為不指定(#30,與稿紙版面同一種做法)。
func normalizeProfile(p *Profile) {
	switch p.Provider {
	case "", ProviderOpenAI, ProviderAnthropic:
	default:
		p.Provider = ""
	}
	for _, e := range ReasoningEfforts {
		if p.ReasoningEffort == e {
			return
		}
	}
	p.ReasoningEffort = ""
}

// normalizeAppearance 把載入的 Appearance 欄位正規化:未知值用預設,
// 顏色欄位只接受 #rrggbb(7 字元),不合法的視為空(跟隨主題)。
// 載入舊檔時才這麼寬鬆:作者手上的設定檔可能含手改壞的值,默默以預設取代
// 比報錯中斷應用啟動更安全(#118);綁定邊界的寫入另有 validateAppearance 擋下。
func normalizeAppearance(a *Appearance) {
	switch a.Mode {
	case AppearanceModeDark, AppearanceModeLight, AppearanceModeSystem:
	default:
		a.Mode = AppearanceModeDark
	}
	a.Dark.Preset = normalizePreset(a.Dark.Preset, DarkPresets, PresetStudy)
	a.Light.Preset = normalizePreset(a.Light.Preset, LightPresets, PresetPaper)
	a.Dark.Accent = normalizeHexColor(a.Dark.Accent)
	a.Dark.Background = normalizeHexColor(a.Dark.Background)
	a.Dark.Foreground = normalizeHexColor(a.Dark.Foreground)
	a.Light.Accent = normalizeHexColor(a.Light.Accent)
	a.Light.Background = normalizeHexColor(a.Light.Background)
	a.Light.Foreground = normalizeHexColor(a.Light.Foreground)
	switch a.UIFontSize {
	case UIFontSizeSmall, UIFontSizeStandard, UIFontSizeLarge:
	default:
		a.UIFontSize = UIFontSizeStandard
	}
	switch a.ReduceMotion {
	case ReduceMotionSystem, ReduceMotionOn, ReduceMotionOff:
	default:
		a.ReduceMotion = ReduceMotionSystem
	}
}

// validateAppearance 在寫入邊界檢查(#118):所有列舉值與色碼都必須合法,不合法的話
// 一個欄位錯就整筆拒絕並回錯;大寫 hex 接受並轉小寫。呼叫端要確保這個檢查不被跳過,
// 避免前端寫一個字串進來、設定檔裡卻是另一個值。順便把大寫 hex 轉小寫讓設定檔一致。
func validateAppearance(a *Appearance) error {
	switch a.Mode {
	case AppearanceModeDark, AppearanceModeLight, AppearanceModeSystem:
	default:
		return fmt.Errorf("未知的模式: %q", a.Mode)
	}
	if !contains(DarkPresets, a.Dark.Preset) {
		return fmt.Errorf("未知的深色主題: %q", a.Dark.Preset)
	}
	if !contains(LightPresets, a.Light.Preset) {
		return fmt.Errorf("未知的淺色主題: %q", a.Light.Preset)
	}
	dark, err := validateSide("深色", a.Dark)
	if err != nil {
		return err
	}
	a.Dark = dark
	light, err := validateSide("淺色", a.Light)
	if err != nil {
		return err
	}
	a.Light = light
	switch a.UIFontSize {
	case UIFontSizeSmall, UIFontSizeStandard, UIFontSizeLarge:
	default:
		return fmt.Errorf("未知的介面字級: %q", a.UIFontSize)
	}
	switch a.ReduceMotion {
	case ReduceMotionSystem, ReduceMotionOn, ReduceMotionOff:
	default:
		return fmt.Errorf("未知的減少動態設定: %q", a.ReduceMotion)
	}
	return nil
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// validateSide 檢查一側的三個顏色欄位,接受後轉小寫回寫。
func validateSide(label string, s SideAppearance) (SideAppearance, error) {
	v, err := strictHexColor(s.Accent)
	if err != nil {
		return s, fmt.Errorf("%s側強調色 %v", label, err)
	}
	s.Accent = v
	if v, err = strictHexColor(s.Background); err != nil {
		return s, fmt.Errorf("%s側背景 %v", label, err)
	}
	s.Background = v
	if v, err = strictHexColor(s.Foreground); err != nil {
		return s, fmt.Errorf("%s側文字顏色 %v", label, err)
	}
	s.Foreground = v
	return s, nil
}

// strictHexColor 只接受小寫 7 字元 #rrggbb;大寫字母接受後轉小寫,其他字串(含空、簡寫、隨意字串)回錯。
func strictHexColor(v string) (string, error) {
	if v == "" {
		return "", nil
	}
	if len(v) != 7 || v[0] != '#' {
		return "", fmt.Errorf("不是合法 hex 顏色(需 #rrggbb): %q", v)
	}
	out := []byte(v)
	for i := 1; i < 7; i++ {
		c := out[i]
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		case c >= 'A' && c <= 'F':
			out[i] = c + ('a' - 'A')
		default:
			return "", fmt.Errorf("不是合法 hex 顏色(需 #rrggbb): %q", v)
		}
	}
	return string(out), nil
}

func normalizePreset(v string, allowed []string, def string) string {
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	return def
}

// normalizeHexColor 載入時用:接受 7 字元 #rrggbb(大小寫都收,轉小寫),
// 其他(含簡寫、隨意字串)視為空。
func normalizeHexColor(v string) string {
	out, err := strictHexColor(v)
	if err != nil {
		return ""
	}
	return out
}

func defaults() Settings {
	return Settings{
		Profiles:      []Profile{{ID: "default", Name: "本機 LM Studio", BaseURL: "http://localhost:1234/v1", ContextTokens: DefaultContextTokens}},
		Active:        "default",
		Recent:        []Recent{},
		Platforms:     publish.Presets(),
		Theme:         "", // 已棄用,Appearance.Mode 取代
		Appearance:    DefaultsAppearance(),
		PaperWidth:    PaperWidthDefault,
		PaperFontSize: PaperFontSizeDefault,
		PaperParaGap:  PaperParaGapDefault,
	}
}

type Store struct{ Dir string }

// NewStore 使用 %USERPROFILE%\.perkins(2026-10-13 作者定案,#104;同 Codex 的 ~/.codex)。
// 舊版的 %APPDATA%\Perkins(os.UserConfigDir)由 migrateDir 搬到新位置。
// 回傳值:store 為 nil 表示沒有可用的設定目錄(呼叫者不得繼續);store 非 nil 而 err 非 nil 表示搬移失敗、
// 暫時沿用舊位置(資料完整,下次啟動再試)。
func NewStore() (*Store, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	cfg, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	return migrateDir(filepath.Join(cfg, "Perkins"), filepath.Join(home, ".perkins"))
}

// ErrMigrate 表示舊設定資料夾搬移失敗,暫時沿用舊位置。
var ErrMigrate = errors.New("設定資料夾搬移失敗")

// migrateDir 決定要使用的設定目錄:新目錄已存在就用新目錄(舊目錄不動);確定沒有新目錄、只有舊目錄時以一次 rename
// 整個搬過去(設定、全域 AGENTS.md、對話記錄一起走,舊目錄不再保留);rename 失敗沿用舊目錄並回傳 ErrMigrate。
// 只有「確定不存在」(fs.ErrNotExist)才當作沒有;其他查詢錯誤(權限、網路磁碟暫時失效)無法判斷,回傳 nil store,
// 不能把它當成首次安裝而改用空白的新目錄——否則舊資料恢復可用後也不會再被讀到。
func migrateDir(legacy, dir string) (*Store, error) {
	_, err := os.Stat(dir)
	if err == nil {
		return &Store{Dir: dir}, nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("無法確認設定資料夾 %s: %w", dir, err)
	}
	if _, err := os.Stat(legacy); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return &Store{Dir: dir}, nil // 首次安裝
		}
		return nil, fmt.Errorf("無法確認舊設定資料夾 %s: %w", legacy, err)
	}
	if err := os.Rename(legacy, dir); err != nil {
		return &Store{Dir: legacy}, fmt.Errorf("%w:無法從 %s 搬到 %s,暫時沿用舊位置: %v", ErrMigrate, legacy, dir, err)
	}
	return &Store{Dir: dir}, nil
}

func (s *Store) Load() Settings {
	out := defaults()
	b, err := os.ReadFile(filepath.Join(s.Dir, "settings.json"))
	if err != nil {
		return out
	}
	var raw Settings
	if json.Unmarshal(b, &raw) != nil {
		return out
	}
	if len(raw.Profiles) == 0 && raw.BaseURL != "" {
		// 第一代設定:單一端點 → 設定檔 default(沿用原本的金鑰名稱,已存的金鑰不會遺失)
		raw.Profiles = []Profile{{ID: "default", Name: "預設端點", BaseURL: raw.BaseURL, Model: raw.Model}}
		raw.Active = "default"
	}
	raw.BaseURL, raw.Model = "", ""
	if len(raw.Profiles) == 0 {
		raw.Profiles = out.Profiles
	}
	for i := range raw.Profiles {
		if raw.Profiles[i].ContextTokens <= 0 {
			raw.Profiles[i].ContextTokens = DefaultContextTokens
		}
		normalizeProfile(&raw.Profiles[i])
	}
	if raw.ProfileByID(raw.Active) == nil {
		raw.Active = raw.Profiles[0].ID
	}
	if raw.Recent == nil {
		raw.Recent = []Recent{}
	}
	if len(raw.Platforms) == 0 {
		raw.Platforms = out.Platforms
	}
	// Appearance:舊設定檔只有 theme 欄位時,把 mode 對應到 dark/light 並帶入對應預設檔(#118)。
	// Theme 欄位不再依賴;Appearance.Mode 才是生效狀態,但 Theme 仍原樣保留供回溯,
	// 直到 Save 時才清掉。
	if raw.Theme == AppearanceModeDark {
		if raw.Appearance.Mode == "" {
			raw.Appearance.Mode = AppearanceModeDark
			raw.Appearance.Dark.Preset = PresetStudy
		}
	} else if raw.Theme == AppearanceModeLight {
		if raw.Appearance.Mode == "" {
			raw.Appearance.Mode = AppearanceModeLight
			raw.Appearance.Light.Preset = PresetPaper
		}
	}
	if raw.Appearance.Mode == "" {
		raw.Appearance = out.Appearance
	}
	normalizeAppearance(&raw.Appearance)
	// 舊設定檔沒有這三個欄位(或值不是預設檔)時回到預設,其他欄位照原樣保留
	raw.PaperWidth = paperPreset(raw.PaperWidth, PaperWidths, out.PaperWidth)
	raw.PaperFontSize = paperPreset(raw.PaperFontSize, PaperFontSizes, out.PaperFontSize)
	raw.PaperParaGap = paperPreset(raw.PaperParaGap, PaperParaGaps, out.PaperParaGap)
	return raw
}

func (s *Store) Save(v Settings) error {
	if err := os.MkdirAll(s.Dir, 0o755); err != nil {
		return err
	}
	v.BaseURL, v.Model = "", ""
	// Theme 欄位已棄用;存回時清掉避免磁碟同時留著兩份狀態(#118)。
	v.Theme = ""
	// 存回時正規化設定檔欄位(同載入):未知 Provider / 不合法思考強度不進設定檔
	for i := range v.Profiles {
		normalizeProfile(&v.Profiles[i])
	}
	// 存回時正規化 Appearance:未知 mode/preset/字級/減少動態、非法顏色一律不進設定檔
	normalizeAppearance(&v.Appearance)
	// 存回時正規化稿紙版面:設定檔裡永遠是有效的預設檔(直接呼叫 Save 的測試與舊資料也一樣)
	v.PaperWidth = paperPreset(v.PaperWidth, PaperWidths, PaperWidthDefault)
	v.PaperFontSize = paperPreset(v.PaperFontSize, PaperFontSizes, PaperFontSizeDefault)
	v.PaperParaGap = paperPreset(v.PaperParaGap, PaperParaGaps, PaperParaGapDefault)
	b, _ := json.MarshalIndent(v, "", "  ")
	return os.WriteFile(filepath.Join(s.Dir, "settings.json"), b, 0o600)
}

// AutosaveOn 回傳定時自動存檔是否啟用:沒設定過(舊設定檔)時預設開啟。
func (v Settings) AutosaveOn() bool { return v.Autosave == nil || *v.Autosave }

// TypingVolumeOr 回傳打字機音效音量:沒設定過(舊設定檔)時預設 50;0 是作者明確設的值。
func (v Settings) TypingVolumeOr() int {
	if v.TypingVolume == nil {
		return 50
	}
	return *v.TypingVolume
}

func (v *Settings) ProfileByID(id string) *Profile {
	for i := range v.Profiles {
		if v.Profiles[i].ID == id {
			return &v.Profiles[i]
		}
	}
	return nil
}

func (v *Settings) ActiveProfile() Profile {
	if p := v.ProfileByID(v.Active); p != nil {
		return *p
	}
	return v.Profiles[0]
}

// AddRecent 把專案移到最近清單最前面(同路徑去重,超過上限捨棄最舊的)。
func (v *Settings) AddRecent(path, name string) {
	kept := []Recent{{Path: path, Name: name, OpenedAt: time.Now().Format(time.RFC3339)}}
	for _, r := range v.Recent {
		if !samePath(r.Path, path) && len(kept) < MaxRecent {
			kept = append(kept, r)
		}
	}
	v.Recent = kept
}

func (v *Settings) RemoveRecent(path string) {
	kept := []Recent{}
	for _, r := range v.Recent {
		if !samePath(r.Path, path) {
			kept = append(kept, r)
		}
	}
	v.Recent = kept
}

func samePath(a, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

// ---- 金鑰 ----

func keyName(profileID string) string {
	if profileID == "" || profileID == "default" {
		return keyUser
	}
	return keyUser + ":" + profileID
}

// ProfileAPIKey 沒有設定時回傳空字串(本機端點不需要金鑰)。
func ProfileAPIKey(profileID string) (string, error) {
	k, err := keyring.Get(keyService, keyName(profileID))
	if errors.Is(err, keyring.ErrNotFound) || errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	return k, err
}

// SetProfileAPIKey 空字串代表清除。
func SetProfileAPIKey(profileID, k string) error {
	if k == "" {
		err := keyring.Delete(keyService, keyName(profileID))
		if errors.Is(err, keyring.ErrNotFound) {
			return nil
		}
		return err
	}
	return keyring.Set(keyService, keyName(profileID), k)
}

// APIKey / SetAPIKey 對應 default 設定檔(保留給第一代呼叫者)。
func APIKey() (string, error)  { return ProfileAPIKey("default") }
func SetAPIKey(k string) error { return SetProfileAPIKey("default", k) }

// ValidProfileID 限制 id 字元,避免被拼進憑證名稱時產生歧義。
func ValidProfileID(id string) error {
	if id == "" || len(id) > 40 {
		return fmt.Errorf("設定檔 id 無效")
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
			return fmt.Errorf("設定檔 id 只能包含小寫英文、數字與 -")
		}
	}
	return nil
}

// IsRemote 判斷端點是否在本機之外(稿件會離開這台電腦)。無法解析時保守視為遠端。
func IsRemote(baseURL string) bool {
	u, err := url.Parse(baseURL)
	if err != nil {
		return true
	}
	switch u.Hostname() {
	case "localhost", "127.0.0.1", "::1":
		return false
	}
	return true
}
