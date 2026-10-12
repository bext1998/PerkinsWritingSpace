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

// 意圖(#32):自動上下文壓縮預設開啟;舊設定檔的端點沒有 disableAutoCompact 欄位時
// 不需遷移,載入後必須是「開啟」;作者在設定頁關閉後存回要保留。
func TestAutoCompactDefaultsOnForLegacyProfile(t *testing.T) {
	st := &Store{Dir: t.TempDir()}
	os.MkdirAll(st.Dir, 0o755)
	// 舊設定檔:profile 沒有 disableAutoCompact 欄位(開啟 = 這個欄位為 false)
	legacy := `{"profiles":[{"id":"p1","name":"本機","baseUrl":"http://localhost:1234/v1","model":"m","contextTokens":8192}],"active":"p1"}`
	if err := os.WriteFile(filepath.Join(st.Dir, "settings.json"), []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	s := st.Load()
	p := s.ProfileByID("p1")
	if p == nil {
		t.Fatal("應載入 p1")
	}
	if p.DisableAutoCompact {
		t.Fatal("舊設定檔沒有欄位時自動壓縮應維持開啟")
	}
	// 作者關閉後存回要保留
	s.ProfileByID("p1").DisableAutoCompact = true
	if err := st.Save(s); err != nil {
		t.Fatal(err)
	}
	s2 := st.Load()
	if !s2.ProfileByID("p1").DisableAutoCompact {
		t.Fatal("作者關閉後應維持關閉")
	}
	if !strings.Contains(mustRead(t, st), `"disableAutoCompact": true`) {
		t.Fatal("關閉要寫進設定檔")
	}
}

func mustRead(t *testing.T, st *Store) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(st.Dir, "settings.json"))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
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

// 意圖(稿紙化第二階段(二),SPEC §17.3):舊設定檔沒有稿紙版面欄位時載入預設值,
// 且載入與存回都不會清掉其他欄位;不是預設檔的值(被手改壞)一律回到預設。
func TestPaperLayoutDefaultsAndLegacyFile(t *testing.T) {
	st := &Store{Dir: t.TempDir()}
	os.MkdirAll(st.Dir, 0o755)
	const legacy = `{
  "profiles": [{"id": "default", "name": "本機", "baseUrl": "http://localhost:1234/v1", "model": "qwen", "contextTokens": 8192}],
  "active": "default",
  "recent": [{"path": "D:/novels/長夜", "name": "長夜", "openedAt": "2026-10-10T00:00:00Z"}],
  "theme": "light"
}`
	if err := os.WriteFile(filepath.Join(st.Dir, "settings.json"), []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}

	v := st.Load()
	if v.PaperWidth != PaperWidthDefault || v.PaperFontSize != PaperFontSizeDefault || v.PaperParaGap != PaperParaGapDefault {
		t.Fatalf("舊設定檔應載入稿紙版面預設值: %q %q %q", v.PaperWidth, v.PaperFontSize, v.PaperParaGap)
	}
	if v.Theme != "light" || len(v.Recent) != 1 || v.Recent[0].Path != "D:/novels/長夜" {
		t.Fatalf("其他欄位不得被清掉或改寫: %+v", v)
	}

	// 存回:稿紙版面欄位要寫進設定檔,其他欄位照舊
	if err := st.Save(v); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(st.Dir, "settings.json"))
	for _, want := range []string{`"paperWidth": "44rem"`, `"paperFontSize": "1.08rem"`, `"paperParaGap": "0.7em"`, `"theme": "light"`, "D:/novels/長夜"} {
		if !strings.Contains(string(b), want) {
			t.Errorf("settings.json 應含 %s:\n%s", want, b)
		}
	}
	if got := st.Load(); got.PaperWidth != PaperWidthDefault || got.Theme != "light" || len(got.Recent) != 1 {
		t.Fatalf("存回後載入應一致: %+v", got)
	}

	// 值不是預設檔(被手改壞)時回到預設,而不是照單全收
	os.WriteFile(filepath.Join(st.Dir, "settings.json"), []byte(`{"paperWidth":"99cm","paperFontSize":"huge","paperParaGap":""}`), 0o600)
	got := st.Load()
	if got.PaperWidth != PaperWidthDefault || got.PaperFontSize != PaperFontSizeDefault || got.PaperParaGap != PaperParaGapDefault {
		t.Fatalf("非預設檔的值應回到預設: %q %q %q", got.PaperWidth, got.PaperFontSize, got.PaperParaGap)
	}
}

// 意圖:稿紙版面不做任意數值輸入——setter 只接受預設檔,任一項不是就整筆不變更。
func TestSetPaperLayoutOnlyAcceptsPresets(t *testing.T) {
	var v Settings
	v.PaperWidth, v.PaperFontSize, v.PaperParaGap = PaperWidthDefault, PaperFontSizeDefault, PaperParaGapDefault
	if err := v.SetPaperLayout("36rem", "1.25rem", "1.15em"); err != nil {
		t.Fatalf("預設檔應可設定: %v", err)
	}
	if v.PaperWidth != "36rem" || v.PaperFontSize != "1.25rem" || v.PaperParaGap != "1.15em" {
		t.Fatalf("應寫入預設檔值: %+v", v)
	}
	for _, bad := range [][]string{{"99rem", "1.25rem", "1.15em"}, {"36rem", "16px", "1.15em"}, {"36rem", "1.25rem", "2"}} {
		if err := v.SetPaperLayout(bad[0], bad[1], bad[2]); err == nil {
			t.Errorf("應拒絕任意數值 %v", bad)
		}
		if v.PaperWidth != "36rem" || v.PaperFontSize != "1.25rem" || v.PaperParaGap != "1.15em" {
			t.Fatalf("被拒絕時不得變更: %+v", v)
		}
	}
}

// 意圖:舊設定檔(沒有 provider/reasoningEffort 欄位)必須載入成現行行為——
// OpenAI 相容端點、不指定思考強度;不需要遷移(#30)。
func TestLoadLegacyProfileIsOpenAICompatWithoutEffort(t *testing.T) {
	st := &Store{Dir: t.TempDir()}
	if err := os.MkdirAll(st.Dir, 0o755); err != nil {
		t.Fatal(err)
	}
	legacy := `{"profiles":[{"id":"default","name":"本機","baseUrl":"http://localhost:1234/v1","model":"m","contextTokens":8192}],"active":"default"}`
	if err := os.WriteFile(filepath.Join(st.Dir, "settings.json"), []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	s := st.Load()
	p := s.ActiveProfile()
	if p.Provider != "" || p.ReasoningEffort != "" {
		t.Fatalf("舊設定檔應為 OpenAI 相容且不指定思考強度: %+v", p)
	}
	if p.ContextTokens != 8192 || p.Model != "m" {
		t.Fatalf("既有欄位不應被改動: %+v", p)
	}
}

// 意圖:設定檔可能被手改壞;未知的 Provider 與不合法的思考強度載入時視為不指定,不會被送出。
func TestLoadNormalizesProviderAndEffort(t *testing.T) {
	st := &Store{Dir: t.TempDir()}
	if err := os.MkdirAll(st.Dir, 0o755); err != nil {
		t.Fatal(err)
	}
	bad := `{"profiles":[
		{"id":"a","name":"a","baseUrl":"https://a/v1","provider":"claude","reasoningEffort":"ultra","contextTokens":100},
		{"id":"b","name":"b","baseUrl":"https://b/v1","provider":"anthropic","reasoningEffort":"xhigh","contextTokens":100},
		{"id":"c","name":"c","baseUrl":"https://c/v1","provider":"openai","reasoningEffort":"high","contextTokens":100}
	],"active":"a"}`
	if err := os.WriteFile(filepath.Join(st.Dir, "settings.json"), []byte(bad), 0o600); err != nil {
		t.Fatal(err)
	}
	s := st.Load()
	if p := s.ProfileByID("a"); p.Provider != "" || p.ReasoningEffort != "" {
		t.Fatalf("未知 Provider/思考強度應視為不指定: %+v", p)
	}
	if p := s.ProfileByID("b"); p.Provider != ProviderAnthropic || p.ReasoningEffort != "xhigh" {
		t.Fatalf("Anthropic + xhigh 應保留: %+v", p)
	}
	if p := s.ProfileByID("c"); p.Provider != ProviderOpenAI || p.ReasoningEffort != "high" {
		t.Fatalf("OpenAI 相容 + high 應保留: %+v", p)
	}
}

// 意圖:預設 Profile 是作者新增端點的起點(#43);id 要能當設定檔 id、不得含金鑰。
func TestPresetsAreValid(t *testing.T) {
	seen := map[string]bool{}
	for _, p := range Presets() {
		if err := ValidProfileID(p.ID); err != nil {
			t.Errorf("preset id %q: %v", p.ID, err)
		}
		if seen[p.ID] {
			t.Errorf("preset id 重複: %q", p.ID)
		}
		seen[p.ID] = true
		if p.Name == "" || p.BaseURL == "" {
			t.Errorf("preset %q 缺名稱或網址", p.ID)
		}
		if p.Provider != "" && p.Provider != ProviderAnthropic {
			t.Errorf("preset %q provider = %q", p.ID, p.Provider)
		}
		switch p.Region {
		case "", "intl", "cn":
		default:
			t.Errorf("preset %q region = %q", p.ID, p.Region)
		}
	}
	// 作者點名的服務商都要在清單裡(含國際站/中國站各一組)
	for _, id := range []string{"lmstudio", "ollama", "llamacpp", "vllm", "jan", "openrouter", "fireworks",
		"together", "openai", "google-ai-studio", "deepseek", "xai", "groq", "mistral", "cerebras",
		"deepinfra", "siliconflow", "anthropic",
		"zai-intl", "zai-cn", "dashscope-intl", "dashscope-cn", "minimax-intl", "minimax-cn", "moonshot-intl", "moonshot-cn"} {
		if !seen[id] {
			t.Errorf("預設清單缺少 %q", id)
		}
	}
	if n := len(Presets()); n != 26 {
		t.Fatalf("預設檔數量 = %d", n)
	}
}

// 意圖(#104):設定資料夾改到 ~/.perkins。舊版資料夾(設定、全域 AGENTS.md、對話記錄)在第一次啟動時整個搬過去、
// 舊位置不再保留;新資料夾已存在時不動舊資料夾(不覆蓋、不刪除作者可能還需要的資料)。
func TestMigrateDirMovesLegacyFolderOnce(t *testing.T) {
	base := t.TempDir()
	legacy, dir := filepath.Join(base, "Perkins"), filepath.Join(base, ".perkins")
	if err := os.MkdirAll(filepath.Join(legacy, "sessions", "k"), 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(legacy, "settings.json"), []byte(`{"active":"x"}`), 0o644)
	os.WriteFile(filepath.Join(legacy, "sessions", "k", "s1.json"), []byte(`{}`), 0o644)

	got, err := migrateDir(legacy, dir)
	if err != nil || got != dir {
		t.Fatalf("migrateDir = %q, %v; want %q", got, err, dir)
	}
	if b, err := os.ReadFile(filepath.Join(dir, "settings.json")); err != nil || string(b) != `{"active":"x"}` {
		t.Fatalf("settings.json 沒有搬到新位置: %q %v", b, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "sessions", "k", "s1.json")); err != nil {
		t.Fatalf("對話記錄沒有搬到新位置: %v", err)
	}
	if _, err := os.Stat(legacy); !os.IsNotExist(err) {
		t.Fatalf("舊資料夾應已不存在: %v", err)
	}

	// 新資料夾已存在:舊資料夾(假設又被舊版建立)原封不動
	os.MkdirAll(legacy, 0o755)
	os.WriteFile(filepath.Join(legacy, "settings.json"), []byte(`old`), 0o644)
	if got, err := migrateDir(legacy, dir); err != nil || got != dir {
		t.Fatalf("新資料夾已存在時應直接使用: %q %v", got, err)
	}
	if b, _ := os.ReadFile(filepath.Join(legacy, "settings.json")); string(b) != "old" {
		t.Fatal("新資料夾已存在時不得動舊資料夾")
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "settings.json")); string(b) != `{"active":"x"}` {
		t.Fatal("新資料夾已存在時不得被舊資料覆蓋")
	}

	// 兩者都沒有:用新位置(首次安裝)
	fresh := filepath.Join(base, "fresh")
	if got, err := migrateDir(filepath.Join(base, "none"), fresh); err != nil || got != fresh {
		t.Fatalf("首次安裝應使用新位置: %q %v", got, err)
	}
}
