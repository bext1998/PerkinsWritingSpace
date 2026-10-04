package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"

	"perkins/internal/agent"
	"perkins/internal/bible"
	"perkins/internal/publish"
	"perkins/internal/llm"
	"perkins/internal/notion"
	"perkins/internal/project"
	"perkins/internal/proposal"
	"perkins/internal/research"
	"perkins/internal/settings"
	"perkins/internal/snapshot"
	"perkins/internal/summary"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 是前端可呼叫的後端入口。所有檔案規則都在 internal/ 內執行,前端無法繞過。
type App struct {
	ctx      context.Context
	proj     *project.Project
	store    *settings.Store
	research *research.Recorder // 研究記錄(§12.8);關閉時 Log 為 no-op
	session  string             // 研究記錄的 session id(App 啟動時產生)

	mu     sync.Mutex
	agent  *agent.Agent
	cancel context.CancelFunc
}

func NewApp() *App {
	return &App{session: randomID()}
}

// randomID 產生研究記錄的 session id(區分不同使用時段)。
func randomID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "s-unknown"
	}
	return fmt.Sprintf("%x", b)
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.store, _ = settings.NewStore()
	// 開發/測試用:以環境變數直接開啟專案,略過原生資料夾對話框。
	if dir := os.Getenv("PERKINS_OPEN"); dir != "" {
		if p, err := project.Open(dir); err == nil {
			a.setProject(p)
		}
	}
}

// setProject 切換專案時一併重置對話,避免上一個專案的內容混入;並記入最近專案(存在應用程式設定,B10)。
func (a *App) setProject(p *project.Project) {
	a.mu.Lock()
	if a.cancel != nil {
		a.cancel()
	}
	a.proj = p
	a.research = research.New(p, a.session)
	a.agent = &agent.Agent{Proj: p, Proposals: &proposal.Store{Proj: p}, Research: a.research}
	a.mu.Unlock()
	if p != nil && a.store != nil {
		s := a.store.Load()
		s.AddRecent(p.Root, p.Config.Name)
		a.store.Save(s)
	}
}

var errNoProject = errors.New("尚未開啟專案")

// ---- 專案與書櫃 ----

// PickAndOpenProject 讓作者選資料夾並開啟;取消則回傳 nil。
func (a *App) PickAndOpenProject() (*project.Tree, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "開啟 Perkins 專案資料夾"})
	if err != nil || dir == "" {
		return nil, err
	}
	return a.OpenProjectAt(dir)
}

func (a *App) OpenProjectAt(dir string) (*project.Tree, error) {
	p, err := project.Open(dir)
	if err != nil {
		return nil, err
	}
	a.setProject(p)
	return p.Tree()
}

// PickAndCreateProject 讓作者選(或先建好)資料夾並在其中建立新專案。
func (a *App) PickAndCreateProject(name string) (*project.Tree, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "選擇新專案的資料夾",
		CanCreateDirectories: true,
	})
	if err != nil || dir == "" {
		return nil, err
	}
	p, err := project.Create(dir, name)
	if err != nil {
		return nil, err
	}
	a.setProject(p)
	return p.Tree()
}

func (a *App) CloseProject() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.cancel != nil {
		a.cancel()
	}
	a.proj, a.agent = nil, nil
}

type RecentView struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	OpenedAt string `json:"openedAt"`
	Cover    string `json:"cover"`   // data URL,沒有自訂封面時為空(介面依書名產生)
	Missing  bool   `json:"missing"` // 資料夾已不存在或不再是專案
}

const maxCoverBytes = 4 << 20

var coverExts = []string{".png", ".jpg", ".jpeg", ".webp"}

func coverPath(root string) string {
	for _, ext := range coverExts {
		p := filepath.Join(root, ".perkins", "cover"+ext)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func coverDataURL(root string) string {
	p := coverPath(root)
	if p == "" {
		return ""
	}
	b, err := os.ReadFile(p)
	if err != nil || len(b) > maxCoverBytes {
		return ""
	}
	mime := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}[strings.ToLower(filepath.Ext(p))]
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)
}

func (a *App) ListRecent() []RecentView {
	out := []RecentView{}
	for _, r := range a.store.Load().Recent {
		v := RecentView{Path: r.Path, Name: r.Name, OpenedAt: r.OpenedAt}
		if p, err := project.Open(r.Path); err != nil {
			v.Missing = true
		} else {
			v.Name = p.Config.Name
			v.Cover = coverDataURL(r.Path)
		}
		out = append(out, v)
	}
	return out
}

func (a *App) RemoveRecent(path string) error {
	s := a.store.Load()
	s.RemoveRecent(path)
	return a.store.Save(s)
}

// PickCover 讓作者為目前專案選封面圖,複製到 .perkins/cover.*(不改稿件)。回傳新的 data URL。
func (a *App) PickCover() (string, error) {
	if a.proj == nil {
		return "", errNoProject
	}
	f, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "選擇封面圖片",
		Filters: []runtime.FileFilter{{DisplayName: "圖片", Pattern: "*.png;*.jpg;*.jpeg;*.webp"}}})
	if err != nil || f == "" {
		return "", err
	}
	ext := strings.ToLower(filepath.Ext(f))
	ok := false
	for _, e := range coverExts {
		ok = ok || e == ext
	}
	if !ok {
		return "", fmt.Errorf("只支援 png、jpg、webp")
	}
	b, err := os.ReadFile(f)
	if err != nil {
		return "", err
	}
	if len(b) > maxCoverBytes {
		return "", fmt.Errorf("圖片太大(上限 4MB)")
	}
	if old := coverPath(a.proj.Root); old != "" {
		os.Remove(old)
	}
	dst := filepath.Join(a.proj.Root, ".perkins", "cover"+ext)
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(dst, b, 0o644); err != nil {
		return "", err
	}
	return coverDataURL(a.proj.Root), nil
}

func (a *App) ClearCover() error {
	if a.proj == nil {
		return errNoProject
	}
	if p := coverPath(a.proj.Root); p != "" {
		return os.Remove(p)
	}
	return nil
}

func (a *App) GetCover() string {
	if a.proj == nil {
		return ""
	}
	return coverDataURL(a.proj.Root)
}

func (a *App) RenameProject(name string) (*project.Tree, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	if err := a.proj.SetName(name); err != nil {
		return nil, err
	}
	s := a.store.Load()
	s.AddRecent(a.proj.Root, a.proj.Config.Name)
	a.store.Save(s)
	return a.proj.Tree()
}

// ---- 檔案與結構 ----

func (a *App) GetTree() (*project.Tree, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	return a.proj.Tree()
}

func (a *App) ReadFile(rel string) (string, error) {
	if a.proj == nil {
		return "", errNoProject
	}
	return a.proj.ReadFile(rel)
}

func (a *App) SaveFile(rel, content string) error {
	if a.proj == nil {
		return errNoProject
	}
	before, _ := a.proj.ReadFile(rel)
	err := a.proj.WriteFile(rel, content)
	// 研究記錄(§12.8):save 只記路徑與字數(CountText 規則),不記內文;
	// 失敗時記 error、不記 afterCount(預計內容不等於已保存內容)。寫入失敗不影響存檔本身。
	d := map[string]any{"path": rel, "beforeCount": CountText(before)}
	if err == nil {
		d["afterCount"] = CountText(content)
		d["ok"] = true
	} else {
		d["ok"] = false
		d["error"] = err.Error()
	}
	if logErr := a.research.Log("save", d); logErr != nil {
		println("research log failed:", logErr.Error())
	}
	return err
}

// ---- 研究記錄(§12.8)綁定 ----

// GetResearch 回傳研究記錄開關。
func (a *App) GetResearch() bool {
	if a.proj == nil {
		return false
	}
	return a.proj.Config.Research
}

// SetResearch 切換研究記錄(存在 perkins.json,隨作品走)。
// 後端:perkins.json 寫入成功才切換記憶體狀態(失敗不異動);Recorder 為同一實例,不重建。
func (a *App) SetResearch(on bool) error {
	if a.proj == nil {
		return errNoProject
	}
	if err := a.proj.SetResearch(on); err != nil {
		return err
	}
	if a.research == nil {
		a.research = research.New(a.proj, a.session)
	}
	a.research.SetEnabled(on)
	return nil
}

// ResearchOpenFile 記錄作者切換檔案(前端呼叫);只接受專案內既有的作者檔案路徑,其餘忽略。
func (a *App) ResearchOpenFile(rel string) {
	if a.proj == nil || rel == "" {
		return
	}
	switch project.KindOf(rel) {
	case project.ManuscriptDir, project.CanonDir, project.NotesDir, project.OutlineDir:
		if a.proj.Exists(rel) {
			_ = a.research.Log("open_file", map[string]any{"path": rel})
		}
	}
}

func (a *App) NewChapter(title string, volume int) (string, error) {
	if a.proj == nil {
		return "", errNoProject
	}
	return a.proj.NewChapter(title, volume)
}

// NewDoc 在 canon/(entityType 為實體類型)、outline/、notes/ 建立新檔。
func (a *App) NewDoc(dir, title, entityType string) (string, error) {
	if a.proj == nil {
		return "", errNoProject
	}
	content := ""
	if dir == project.CanonDir {
		if entityType == "" {
			entityType = bible.TypeOther
		}
		content = bible.Template(entityType, strings.TrimSpace(title))
	}
	return a.proj.NewDoc(dir, title, content)
}

func (a *App) SetVolumes(vols []project.Volume) (*project.Tree, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	if err := a.proj.SetVolumes(vols); err != nil {
		return nil, err
	}
	return a.proj.Tree()
}

func (a *App) SetChapterStatus(rel, status string) error {
	if a.proj == nil {
		return errNoProject
	}
	return a.proj.SetStatus(rel, status)
}

// TrashFile 把檔案移到 .perkins/trash(可復原)。
func (a *App) TrashFile(rel string) (*project.Tree, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	if err := a.proj.Trash(rel, time.Now().Format("20060102-150405")); err != nil {
		return nil, err
	}
	return a.proj.Tree()
}

// CountText 計算字數:不含空白、Markdown 記號(標題 #、強調 *_~、引用 >、程式碼 `)與 HTML 註解(作者筆記)。
// 以程式計算,讓狀態列與各章字數用同一套規則。
func CountText(s string) int {
	for {
		i := strings.Index(s, "<!--")
		if i < 0 {
			break
		}
		j := strings.Index(s[i:], "-->")
		if j < 0 {
			s = s[:i]
			break
		}
		s = s[:i] + s[i+j+3:]
	}
	n := 0
	for _, line := range strings.Split(s, "\n") {
		if t := strings.TrimLeft(line, " \t"); strings.HasPrefix(t, "- ") || strings.HasPrefix(t, "+ ") {
			line = t[2:] // 清單記號
		}
		for _, r := range line {
			if unicode.IsSpace(r) || strings.ContainsRune("*_~`#>|", r) {
				continue
			}
			n++
		}
	}
	return n
}

func (a *App) WordCount(text string) int { return CountText(text) }

// ChapterWordCounts 回傳每章字數(依章節路徑)。
func (a *App) ChapterWordCounts() (map[string]int, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	ch, err := a.proj.Chapters()
	if err != nil {
		return nil, err
	}
	out := map[string]int{}
	for _, c := range ch {
		if t, err := a.proj.ReadFile(c); err == nil {
			out[c] = CountText(t)
		}
	}
	return out, nil
}

// ---- 設定集(全部是確定性文字比對,不經模型,B3) ----

func (a *App) EntityTypes() []string { return bible.Types }

func (a *App) ParseEntity(rel, content string) bible.Entity { return bible.Parse(rel, content) }

// ApplyEntityHeader 回傳更新 frontmatter 後的內容,不寫檔:由編輯器套用後作者自行存檔。
func (a *App) ApplyEntityHeader(content, typ, name string, aliases []string) (string, error) {
	return bible.SetHeader(content, typ, name, aliases)
}

func (a *App) BibleIndex() (*bible.Index, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	return bible.BuildIndex(a.proj)
}

// SuggestAttachments 回傳 text 中提到的設定實體(作者點選才會附加)。
func (a *App) SuggestAttachments(text string) ([]string, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	ents, err := bible.Load(a.proj)
	if err != nil {
		return nil, err
	}
	return bible.Mentions(ents, text), nil
}

func (a *App) ignorePath() string {
	return filepath.Join(a.proj.Root, ".perkins", "variant-ignore.json")
}

func (a *App) loadIgnored() map[string]bool {
	out := map[string]bool{}
	b, err := os.ReadFile(a.ignorePath())
	if err != nil {
		return out
	}
	var list []string
	json.Unmarshal(b, &list)
	for _, w := range list {
		out[w] = true
	}
	return out
}

func (a *App) FindVariants() ([]bible.Variant, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	ents, err := bible.Load(a.proj)
	if err != nil {
		return nil, err
	}
	ch, err := a.proj.Chapters()
	if err != nil {
		return nil, err
	}
	return bible.FindVariants(ents, ch, a.proj.ReadFile, a.loadIgnored()), nil
}

// IgnoreVariant 記錄作者判定「不是錯字」的寫法,之後不再回報。
func (a *App) IgnoreVariant(w string) error {
	if a.proj == nil {
		return errNoProject
	}
	ig := a.loadIgnored()
	ig[w] = true
	var list []string
	for k := range ig {
		list = append(list, k)
	}
	b, _ := json.MarshalIndent(list, "", "  ")
	os.MkdirAll(filepath.Dir(a.ignorePath()), 0o755)
	return os.WriteFile(a.ignorePath(), b, 0o644)
}

// ---- 模型端點設定 ----

type ProfileView struct {
	settings.Profile
	HasKey bool `json:"hasKey"`
	Remote bool `json:"remote"` // 端點不在本機:稿件會離開這台電腦
}

type SettingsView struct {
	Profiles  []ProfileView     `json:"profiles"`
	Active    string            `json:"active"`
	Platforms []publish.Platform `json:"platforms"`
	Theme     string            `json:"theme"`
}

func (a *App) GetSettings() SettingsView {
	s := a.store.Load()
	v := SettingsView{Active: s.Active, Platforms: s.Platforms, Theme: s.Theme, Profiles: []ProfileView{}}
	for _, p := range s.Profiles {
		k, _ := settings.ProfileAPIKey(p.ID)
		v.Profiles = append(v.Profiles, ProfileView{Profile: p, HasKey: k != "", Remote: settings.IsRemote(p.BaseURL)})
	}
	return v
}

// SaveProfile 新增或更新端點設定。apiKey 為 nil 表示不變更;空字串表示清除。
func (a *App) SaveProfile(p settings.Profile, apiKey *string) (SettingsView, error) {
	if err := settings.ValidProfileID(p.ID); err != nil {
		return SettingsView{}, err
	}
	if strings.TrimSpace(p.BaseURL) == "" {
		return SettingsView{}, fmt.Errorf("端點網址不可為空")
	}
	if p.ContextTokens <= 0 {
		p.ContextTokens = settings.DefaultContextTokens
	}
	if strings.TrimSpace(p.Name) == "" {
		p.Name = p.BaseURL
	}
	s := a.store.Load()
	if cur := s.ProfileByID(p.ID); cur != nil {
		*cur = p
	} else {
		s.Profiles = append(s.Profiles, p)
	}
	if err := a.store.Save(s); err != nil {
		return SettingsView{}, err
	}
	if apiKey != nil {
		if err := settings.SetProfileAPIKey(p.ID, *apiKey); err != nil {
			return SettingsView{}, err
		}
	}
	return a.GetSettings(), nil
}

func (a *App) DeleteProfile(id string) (SettingsView, error) {
	s := a.store.Load()
	if len(s.Profiles) <= 1 {
		return SettingsView{}, fmt.Errorf("至少要保留一個端點")
	}
	kept := []settings.Profile{}
	for _, p := range s.Profiles {
		if p.ID != id {
			kept = append(kept, p)
		}
	}
	s.Profiles = kept
	if s.ProfileByID(s.Active) == nil {
		s.Active = s.Profiles[0].ID
	}
	if err := a.store.Save(s); err != nil {
		return SettingsView{}, err
	}
	settings.SetProfileAPIKey(id, "")
	return a.GetSettings(), nil
}

// SetActiveModel 由對話框的模型切換呼叫。
func (a *App) SetActiveModel(profileID, model string) (SettingsView, error) {
	s := a.store.Load()
	p := s.ProfileByID(profileID)
	if p == nil {
		return SettingsView{}, fmt.Errorf("找不到端點設定 %s", profileID)
	}
	s.Active = profileID
	p.Model = model
	if err := a.store.Save(s); err != nil {
		return SettingsView{}, err
	}
	return a.GetSettings(), nil
}

func (a *App) SetTheme(theme string) error {
	if theme != "dark" && theme != "light" {
		return fmt.Errorf("未知的主題")
	}
	s := a.store.Load()
	s.Theme = theme
	return a.store.Save(s)
}

func (a *App) clientFor(profileID string) (*llm.OpenAI, settings.Profile, error) {
	s := a.store.Load()
	p := s.ActiveProfile()
	if profileID != "" {
		pp := s.ProfileByID(profileID)
		if pp == nil {
			return nil, p, fmt.Errorf("找不到端點設定 %s", profileID)
		}
		p = *pp
	}
	k, _ := settings.ProfileAPIKey(p.ID)
	return &llm.OpenAI{BaseURL: p.BaseURL, APIKey: k}, p, nil
}

func (a *App) ListModels(profileID string) ([]string, error) {
	c, _, err := a.clientFor(profileID)
	if err != nil {
		return nil, err
	}
	return c.ListModels(a.ctx)
}

// ---- AI 對話 ----

// prepare 把目前啟用的端點與模型套到 agent 上。呼叫者需持有 a.mu。
func (a *App) prepare() (*agent.Agent, error) {
	if a.agent == nil {
		return nil, errNoProject
	}
	c, p, err := a.clientFor("")
	if err != nil {
		return nil, err
	}
	a.agent.LLM, a.agent.Model, a.agent.ContextTokens = c, p.Model, p.ContextTokens
	a.agent.Remote = settings.IsRemote(p.BaseURL) // 研究記錄:ask 筆記下 profile 是否 remote
	return a.agent, nil
}

// PreviewContext 回傳「實際會送往模型」的訊息與預算估算(與 AskAI 走同一個組裝函式,A6)。
func (a *App) PreviewContext(p agent.AskParams) (*agent.Preview, error) {
	a.mu.Lock()
	ag, err := a.prepare()
	a.mu.Unlock()
	if err != nil {
		return nil, err
	}
	return ag.Preview(p)
}

func (a *App) ResetChat() {
	if a.agent != nil {
		a.agent.Reset()
	}
}

func (a *App) CancelAsk() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.cancel != nil {
		a.cancel()
	}
}

// begin 取得執行權;同時只允許一個模型請求。
func (a *App) begin() (*agent.Agent, context.Context, context.CancelFunc, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.cancel != nil {
		return nil, nil, nil, errors.New("上一個請求尚未結束")
	}
	ag, err := a.prepare()
	if err != nil {
		return nil, nil, nil, err
	}
	if ag.Model == "" {
		return nil, nil, nil, errors.New("尚未選擇模型,請先在對話框或設定頁選擇")
	}
	ctx, cancel := context.WithCancel(a.ctx)
	a.cancel = cancel
	return ag, ctx, cancel, nil
}

func (a *App) end(cancel context.CancelFunc) {
	a.mu.Lock()
	a.cancel = nil
	a.mu.Unlock()
	cancel()
}

// AskAI 在背景執行代理迴圈;過程以 chat:event 事件回報,結束時送出 chat:done。
func (a *App) AskAI(p agent.AskParams) error {
	ag, ctx, cancel, err := a.begin()
	if err != nil {
		return err
	}
	go func() {
		reply, err := ag.Ask(ctx, p, func(e agent.Event) { runtime.EventsEmit(a.ctx, "chat:event", e) })
		done := map[string]string{"reply": reply}
		if err != nil {
			done["error"] = err.Error()
		}
		a.end(cancel)
		runtime.EventsEmit(a.ctx, "chat:done", done)
	}()
	return nil
}

// DraftSummary 請模型草擬章節摘要;只回傳文字,不寫檔(B6)。
func (a *App) DraftSummary(chapter string) (string, error) {
	ag, ctx, cancel, err := a.begin()
	if err != nil {
		return "", err
	}
	start := time.Now()
	defer func() { _ = a.research.Log("summary_draft", map[string]any{"chapter": chapter, "elapsedMs": time.Since(start).Milliseconds()}) }()
	defer a.end(cancel)
	return ag.DraftSummary(ctx, chapter, func(e agent.Event) { runtime.EventsEmit(a.ctx, "summary:delta", e.Text) })
}

func (a *App) GetSummary(chapter string) (summary.Summary, error) {
	if a.proj == nil {
		return summary.Summary{}, errNoProject
	}
	return summary.Load(a.proj, chapter)
}

// SaveSummary 是作者確認摘要的唯一路徑。
func (a *App) SaveSummary(chapter, text string) (summary.Summary, error) {
	if a.proj == nil {
		return summary.Summary{}, errNoProject
	}
	s, err := summary.Save(a.proj, chapter, text)
	_ = a.research.Log("summary_save", map[string]any{"chapter": chapter})
	return s, err
}

// ---- 提案審核(只有這裡的 AcceptProposal 會因 AI 提案而寫入稿件) ----

func (a *App) ListProposals() ([]*proposal.Proposal, error) {
	if a.agent == nil {
		return nil, errNoProject
	}
	return a.agent.Proposals.List()
}

// AcceptProposal 回傳更新後的提案;edited 非 nil 表示作者編輯過建議文字(部分採用)。
func (a *App) AcceptProposal(id string, edited *string) (*proposal.Proposal, error) {
	if a.agent == nil {
		return nil, errNoProject
	}
	p, err := a.agent.Proposals.Accept(id, edited)
	if err == nil && p != nil {
		proposal.LogAccept(a.research, p)
	}
	return p, err
}

// RejectProposal 拒絕提案並記錄研究事件;回傳提案供呼叫端(目前僅供研究記錄內部使用)。
func (a *App) RejectProposal(id string) (*proposal.Proposal, error) {
	if a.agent == nil {
		return nil, errNoProject
	}
	p, err := a.agent.Proposals.Reject(id)
	if err == nil && p != nil {
		proposal.LogReject(a.research, p)
	}
	return p, err
}

// ---- 版本(G3) ----

func (a *App) snaps() (*snapshot.Store, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	return &snapshot.Store{Proj: a.proj}, nil
}

// TakeSnapshot 手動保存全部作者檔案。
func (a *App) TakeSnapshot(label string) (*snapshot.Meta, error) {
	s, err := a.snaps()
	if err != nil {
		return nil, err
	}
	m, err := s.Take(label, "manual", nil)
	if err == nil && m != nil {
		_ = a.research.Log("snapshot", map[string]any{"id": m.ID, "label": label, "files": m.Files})
	}
	return m, err
}

func (a *App) ListSnapshots() ([]*snapshot.Meta, error) {
	s, err := a.snaps()
	if err != nil {
		return nil, err
	}
	return s.List()
}

// SnapshotDiff 比較快照中的檔案與目前檔案(舊 = 快照,新 = 目前)。
func (a *App) SnapshotDiff(id, rel string) ([]snapshot.DiffLine, error) {
	s, err := a.snaps()
	if err != nil {
		return nil, err
	}
	old, err := s.FileContent(id, rel)
	if err != nil {
		return nil, err
	}
	cur, err := a.proj.ReadFile(rel)
	if err != nil {
		cur = ""
	}
	return snapshot.LineDiff(old, cur), nil
}

// RestoreSnapshot 還原指定檔案(空 = 快照內全部);回傳還原前自動建立的備份快照。
func (a *App) RestoreSnapshot(id string, files []string) (*snapshot.Meta, error) {
	s, err := a.snaps()
	if err != nil {
		return nil, err
	}
	m, err := s.Restore(id, files)
	if err == nil && m != nil {
		_ = a.research.Log("restore", map[string]any{"id": id, "files": files, "backupId": m.ID})
	}
	return m, err
}

// ---- 平台輸出(B8:只輸出到剪貼簿或作者指定的檔案,不動稿件) ----

func (a *App) platform(id string) (publish.Platform, error) {
	for _, p := range a.store.Load().Platforms {
		if p.ID == id {
			return p, nil
		}
	}
	return publish.Platform{}, fmt.Errorf("找不到平台設定 %s", id)
}

type Option struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

func (a *App) ConvertOptions() []Option {
	var out []Option
	for _, o := range publish.ConvertOptions {
		out = append(out, Option{ID: o.ID, Label: o.Label})
	}
	return out
}

// PreviewExport 以指定規則轉換一段文字(設定頁與複製前預覽用)。
func (a *App) PreviewExport(text string, rules publish.Rules) (string, error) {
	return publish.Convert(text, rules)
}

// CopyChapter 把章節轉成平台格式並放到剪貼簿;回傳轉換結果供介面顯示。
func (a *App) CopyChapter(rel, platformID string) (string, error) {
	if a.proj == nil {
		return "", errNoProject
	}
	pl, err := a.platform(platformID)
	if err != nil {
		return "", err
	}
	defer func() { _ = a.research.Log("copy_chapter", map[string]any{"chapter": rel, "platform": platformID}) }()
	text, err := a.proj.ReadFile(rel)
	if err != nil {
		return "", err
	}
	out, err := publish.Convert(text, pl.Rules)
	if err != nil {
		return "", err
	}
	if err := runtime.ClipboardSetText(a.ctx, out); err != nil {
		return "", fmt.Errorf("寫入剪貼簿失敗: %w", err)
	}
	return out, nil
}

// ExportVolume 把整卷匯出成 .txt(作者選擇存檔位置)。回傳存檔路徑,取消時為空。
func (a *App) ExportVolume(volume int, platformID string) (string, error) {
	if a.proj == nil {
		return "", errNoProject
	}
	defer func() { _ = a.research.Log("export_volume", map[string]any{"volume": volume, "platform": platformID}) }()
	pl, err := a.platform(platformID)
	if err != nil {
		return "", err
	}
	t, err := a.proj.Tree()
	if err != nil {
		return "", err
	}
	if volume < 0 || volume >= len(t.Volumes) {
		return "", fmt.Errorf("卷不存在")
	}
	v := t.Volumes[volume]
	var chapters []string
	for _, c := range v.Chapters {
		text, err := a.proj.ReadFile(c.Path)
		if err != nil {
			return "", err
		}
		chapters = append(chapters, text)
	}
	out, err := publish.Volume(v.Title, chapters, pl.Rules)
	if err != nil {
		return "", err
	}
	name := t.Name
	if v.Title != "" {
		name += " " + v.Title
	}
	dst, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "匯出整卷", DefaultFilename: project.SanitizeName(name) + ".txt",
		Filters: []runtime.FileFilter{{DisplayName: "文字檔", Pattern: "*.txt"}}})
	if err != nil || dst == "" {
		return "", err
	}
	// 防呆:不允許把匯出檔寫進專案的作者資料夾,避免被當成稿件或覆蓋稿件
	if rel, err := filepath.Rel(a.proj.Root, dst); err == nil && !strings.HasPrefix(rel, "..") {
		for _, d := range project.Dirs {
			if strings.HasPrefix(filepath.ToSlash(rel), d+"/") {
				return "", fmt.Errorf("請不要把匯出檔存進專案的 %s/ 資料夾", d)
			}
		}
	}
	return dst, os.WriteFile(dst, []byte(out), 0o644)
}

func (a *App) SavePlatforms(ps []publish.Platform) (SettingsView, error) {
	s := a.store.Load()
	for _, p := range ps {
		if strings.TrimSpace(p.ID) == "" || strings.TrimSpace(p.Name) == "" {
			return SettingsView{}, fmt.Errorf("平台需要 id 與名稱")
		}
		if _, err := publish.Convert("測試", p.Rules); err != nil {
			return SettingsView{}, err
		}
	}
	s.Platforms = ps
	if err := a.store.Save(s); err != nil {
		return SettingsView{}, err
	}
	return a.GetSettings(), nil
}

func (a *App) ResetPlatforms() (SettingsView, error) {
	return a.SavePlatforms(publish.Presets())
}

// ---- Notion 匯入 ----

func (a *App) PickNotionExport(zipFile bool) (string, error) {
	if zipFile {
		return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "選擇 Notion 匯出的 zip",
			Filters: []runtime.FileFilter{{DisplayName: "zip", Pattern: "*.zip"}}})
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "選擇 Notion 匯出後解壓縮的資料夾"})
}

func (a *App) NotionScan(src string) (*notion.Plan, error) { return notion.Scan(src) }

func (a *App) NotionApply(src string, choices map[string]string) (*notion.Result, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	// 匯入前快照目前的全部檔案(B9);匯入本身也不覆蓋任何檔案
	s, _ := a.snaps()
	if _, err := s.Take("Notion 匯入前", "before-import", nil); err != nil {
		return nil, fmt.Errorf("快照失敗,未匯入: %w", err)
	}
	return notion.Apply(a.proj, src, choices)
}

func (a *App) NotionUndo(id string) ([]string, error) {
	if a.proj == nil {
		return nil, errNoProject
	}
	return notion.Undo(a.proj, id)
}
