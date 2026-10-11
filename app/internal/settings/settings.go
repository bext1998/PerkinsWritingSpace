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
	Theme     string             `json:"theme"` // dark | light
	// 定時自動存檔(SPEC §17.3)。指標用來區分「作者明確關閉」與「舊設定檔沒有這個欄位」,
	// 後者視為開啟;用 bool 的話兩者都是 false,分不出來。
	Autosave *bool `json:"autosave,omitempty"`

	// 稿紙化第二階段(二)(SPEC §17.3):編輯區版面的作者全域偏好(與主題同一處),不是作品設定
	PaperWidth    string `json:"paperWidth"`    // 版心寬度(正文欄最大寬度)
	PaperFontSize string `json:"paperFontSize"` // 字級(正文字體大小)
	PaperParaGap  string `json:"paperParaGap"`  // 段距(段落之間的距離)
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

func defaults() Settings {
	return Settings{
		Profiles:      []Profile{{ID: "default", Name: "本機 LM Studio", BaseURL: "http://localhost:1234/v1", ContextTokens: DefaultContextTokens}},
		Active:        "default",
		Recent:        []Recent{},
		Platforms:     publish.Presets(),
		Theme:         "dark",
		PaperWidth:    PaperWidthDefault,
		PaperFontSize: PaperFontSizeDefault,
		PaperParaGap:  PaperParaGapDefault,
	}
}

type Store struct{ Dir string }

// NewStore 使用 %APPDATA%\Perkins(其他平台為對應的使用者設定目錄)。
func NewStore() (*Store, error) {
	d, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	return &Store{Dir: filepath.Join(d, "Perkins")}, nil
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
	if raw.Theme == "" {
		raw.Theme = out.Theme
	}
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
	// 存回時正規化設定檔欄位(同載入):未知 Provider / 不合法思考強度不進設定檔
	for i := range v.Profiles {
		normalizeProfile(&v.Profiles[i])
	}
	// 存回時正規化稿紙版面:設定檔裡永遠是有效的預設檔(直接呼叫 Save 的測試與舊資料也一樣)
	v.PaperWidth = paperPreset(v.PaperWidth, PaperWidths, PaperWidthDefault)
	v.PaperFontSize = paperPreset(v.PaperFontSize, PaperFontSizes, PaperFontSizeDefault)
	v.PaperParaGap = paperPreset(v.PaperParaGap, PaperParaGaps, PaperParaGapDefault)
	b, _ := json.MarshalIndent(v, "", "  ")
	return os.WriteFile(filepath.Join(s.Dir, "settings.json"), b, 0o600)
}

// AutosaveOn 回傳定時自動存檔是否啟用:沒設定過(舊設定檔)時預設開啟。
func (v Settings) AutosaveOn() bool { return v.Autosave == nil || *v.Autosave }

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
