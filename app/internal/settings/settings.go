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

// Profile 是一個模型端點設定(本機 LM Studio、OpenRouter…)。金鑰不在這裡。
type Profile struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	BaseURL       string `json:"baseUrl"`
	Model         string `json:"model"`
	ContextTokens int    `json:"contextTokens"` // 模型上下文長度,用於對話壓縮的預算(SPEC §12.3)
}

type Recent struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	OpenedAt string `json:"openedAt"`
}

type Settings struct {
	BaseURL string `json:"baseUrl,omitempty"` // 第一代欄位:載入時轉為 Profile
	Model   string `json:"model,omitempty"`

	Profiles  []Profile         `json:"profiles"`
	Active    string            `json:"active"`
	Recent    []Recent          `json:"recent"`
	Platforms []publish.Platform `json:"platforms"`
	Theme     string            `json:"theme"` // dark | light
}

func defaults() Settings {
	return Settings{
		Profiles:  []Profile{{ID: "default", Name: "本機 LM Studio", BaseURL: "http://localhost:1234/v1", ContextTokens: DefaultContextTokens}},
		Active:    "default",
		Recent:    []Recent{},
		Platforms: publish.Presets(),
		Theme:     "dark",
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
	return raw
}

func (s *Store) Save(v Settings) error {
	if err := os.MkdirAll(s.Dir, 0o755); err != nil {
		return err
	}
	v.BaseURL, v.Model = "", ""
	b, _ := json.MarshalIndent(v, "", "  ")
	return os.WriteFile(filepath.Join(s.Dir, "settings.json"), b, 0o600)
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
func APIKey() (string, error) { return ProfileAPIKey("default") }
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
