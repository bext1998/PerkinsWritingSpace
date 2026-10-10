package settings

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zalando/go-keyring"

	"perkins/internal/project"
)

// A7 意圖:金鑰若落在專案資料夾,作者備份或分享稿件時就會連金鑰一起外流。
func TestAPIKeyNeverWrittenIntoProjectFolder(t *testing.T) {
	keyring.MockInit()
	projDir := t.TempDir()
	p, _ := project.Create(projDir, "n")
	p.NewChapter("第一章", 0)

	st := &Store{Dir: t.TempDir()}
	const secret = "sk-SUPER-SECRET-123"
	if err := SetAPIKey(secret); err != nil {
		t.Fatal(err)
	}
	if err := st.Save(Settings{Profiles: []Profile{{ID: "default", BaseURL: "https://api.example.com/v1", Model: "m"}}}); err != nil {
		t.Fatal(err)
	}
	if got, _ := APIKey(); got != secret {
		t.Fatalf("金鑰應可從憑證庫取回, got %q", got)
	}
	filepath.WalkDir(projDir, func(path string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			b, _ := os.ReadFile(path)
			if strings.Contains(string(b), secret) {
				t.Errorf("金鑰出現在專案檔案: %s", path)
			}
		}
		return nil
	})
	// 設定檔本身(非機密)也不應含金鑰
	b, _ := os.ReadFile(filepath.Join(st.Dir, "settings.json"))
	if strings.Contains(string(b), secret) {
		t.Error("settings.json 不應含金鑰")
	}
}

func TestClearKeyAndMissingKey(t *testing.T) {
	keyring.MockInit()
	if k, err := APIKey(); err != nil || k != "" {
		t.Fatalf("未設定應回空字串, got %q %v", k, err)
	}
	SetAPIKey("x")
	if err := SetAPIKey(""); err != nil {
		t.Fatal(err)
	}
	if k, _ := APIKey(); k != "" {
		t.Fatal("應已清除")
	}
}

// 意圖:只有真正的本機端點才免除「稿件會外送」警告;未知情況一律警告。
func TestIsRemote(t *testing.T) {
	cases := map[string]bool{
		"http://localhost:1234/v1": false, "http://127.0.0.1:1234/v1": false, "http://[::1]:1234/v1": false,
		"https://api.openai.com/v1": true, "http://192.168.1.5:1234/v1": true,
		"http://localhost.evil.com/v1": true, "%%bad": true,
	}
	for u, want := range cases {
		if IsRemote(u) != want {
			t.Errorf("IsRemote(%q) = %v, want %v", u, !want, want)
		}
	}
}

// 意圖(A7/B10):多端點時每個設定檔的金鑰都只在憑證庫;最近專案清單只在應用程式設定,不寫入任何專案。
func TestMultiProfileKeysAndRecentStayOutOfProject(t *testing.T) {
	keyring.MockInit()
	projDir := t.TempDir()
	project.Create(projDir, "n")
	st := &Store{Dir: t.TempDir()}
	v := st.Load()
	v.Profiles = append(v.Profiles, Profile{ID: "openrouter", Name: "OR", BaseURL: "https://openrouter.ai/api/v1"})
	v.AddRecent(projDir, "n")
	if err := st.Save(v); err != nil {
		t.Fatal(err)
	}
	SetProfileAPIKey("default", "key-A")
	SetProfileAPIKey("openrouter", "key-B")
	if a, _ := ProfileAPIKey("default"); a != "key-A" {
		t.Fatal("default 金鑰錯誤")
	}
	if b, _ := ProfileAPIKey("openrouter"); b != "key-B" {
		t.Fatal("各設定檔金鑰應分開")
	}
	cfg, _ := os.ReadFile(filepath.Join(st.Dir, "settings.json"))
	for _, secret := range []string{"key-A", "key-B"} {
		if strings.Contains(string(cfg), secret) {
			t.Error("settings.json 不應含金鑰")
		}
	}
	entries, _ := os.ReadDir(projDir)
	for _, e := range entries {
		if strings.Contains(e.Name(), "recent") || e.Name() == "settings.json" {
			t.Errorf("專案資料夾不應出現應用程式設定: %s", e.Name())
		}
	}
	if got := st.Load().Recent; len(got) != 1 || got[0].Path != projDir {
		t.Fatalf("最近清單: %+v", got)
	}
}

// 意圖:升級後第一代的端點與模型設定不能遺失,且沿用原本的金鑰名稱(作者不必重新輸入金鑰)。
func TestLegacySettingsMigrate(t *testing.T) {
	keyring.MockInit()
	st := &Store{Dir: t.TempDir()}
	os.MkdirAll(st.Dir, 0o755)
	os.WriteFile(filepath.Join(st.Dir, "settings.json"), []byte(`{"baseUrl":"http://localhost:1234/v1","model":"qwen"}`), 0o600)
	SetAPIKey("old-key")
	v := st.Load()
	p := v.ActiveProfile()
	if p.ID != "default" || p.BaseURL != "http://localhost:1234/v1" || p.Model != "qwen" || p.ContextTokens != DefaultContextTokens {
		t.Fatalf("遷移錯誤: %+v", p)
	}
	if k, _ := ProfileAPIKey(p.ID); k != "old-key" {
		t.Fatal("舊金鑰應沿用")
	}
	if len(v.Platforms) != 5 {
		t.Fatalf("應帶入平台預設: %d", len(v.Platforms))
	}
}

func TestRecentDedupAndCap(t *testing.T) {
	var v Settings
	for i := 0; i < MaxRecent+5; i++ {
		v.AddRecent(filepath.Join("D:/novels", string(rune('a'+i))), "x")
	}
	v.AddRecent(filepath.Join("D:/novels", "c"), "c")
	if len(v.Recent) != MaxRecent || v.Recent[0].Name != "c" {
		t.Fatalf("len=%d first=%+v", len(v.Recent), v.Recent[0])
	}
	n := 0
	for _, r := range v.Recent {
		if r.Name == "c" || strings.HasSuffix(r.Path, "c") {
			n++
		}
	}
	if n != 1 {
		t.Fatal("同一路徑應去重")
	}
}

// 意圖(SPEC §17.3):自動存檔預設開啟;舊設定檔沒有 autosave 欄位時要維持開啟,
// 只有作者在設定頁明確關閉才是關閉(用 *bool 才分得出這兩者)。
func TestAutosaveDefaultOnUnlessExplicitlyOff(t *testing.T) {
	st := &Store{Dir: t.TempDir()}
	if !st.Load().AutosaveOn() {
		t.Fatal("沒有設定檔時應預設開啟")
	}
	os.MkdirAll(st.Dir, 0o755)
	os.WriteFile(filepath.Join(st.Dir, "settings.json"), []byte(`{"theme":"light"}`), 0o600)
	if !st.Load().AutosaveOn() {
		t.Fatal("舊設定檔沒有 autosave 欄位時應視為開啟")
	}
	off := false
	if err := st.Save(Settings{Autosave: &off}); err != nil {
		t.Fatal(err)
	}
	if st.Load().AutosaveOn() {
		t.Fatal("作者關閉後應維持關閉")
	}
	b, _ := os.ReadFile(filepath.Join(st.Dir, "settings.json"))
	if !strings.Contains(string(b), `"autosave": false`) {
		t.Fatalf("關閉要寫進設定檔: %s", b)
	}
	on := true
	if err := st.Save(Settings{Autosave: &on}); err != nil {
		t.Fatal(err)
	}
	if !st.Load().AutosaveOn() {
		t.Fatal("重新開啟後應為開啟")
	}
}

func TestValidProfileID(t *testing.T) {
	for _, bad := range []string{"", "A", "a:b", "a/b", strings.Repeat("a", 41)} {
		if ValidProfileID(bad) == nil {
			t.Errorf("應拒絕 %q", bad)
		}
	}
	if ValidProfileID("open-router2") != nil {
		t.Error("應接受")
	}
}
