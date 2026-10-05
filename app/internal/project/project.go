// Package project 管理 Perkins 專案資料夾(manuscript/、canon/、outline/、notes/、summaries/、perkins.json)。
// 這裡只有「人類作者」的檔案操作;AI 沒有任何經過本套件的寫入路徑(見 docs/SPEC.md G1/G2)。
package project

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	ConfigFile    = "perkins.json"
	ManuscriptDir = "manuscript"
	CanonDir      = "canon"
	OutlineDir    = "outline"
	NotesDir      = "notes"
	SummariesDir  = "summaries"
)

// Dirs 是作者檔案所在的所有資料夾(順序即顯示/快照順序)。
var Dirs = []string{ManuscriptDir, CanonDir, OutlineDir, NotesDir, SummariesDir}

var (
	ErrNotProject  = errors.New("不是 Perkins 專案資料夾(找不到 perkins.json)")
	ErrBadPath     = errors.New("不允許的檔案路徑")
	ErrProjectHere = errors.New("此資料夾已是 Perkins 專案")
)

const (
	StatusDraft = "draft"
	StatusDone  = "done"
)

type Volume struct {
	Title    string   `json:"title"`
	Chapters []string `json:"chapters"` // manuscript 內檔案的相對路徑(如 manuscript/01.md)
}

type Config struct {
	Name     string            `json:"name"`
	Order    []string          `json:"order,omitempty"` // 舊版單層順序;開啟時轉為單一卷(SPEC §12.1)
	Volumes  []Volume          `json:"volumes"`
	Status   map[string]string `json:"status,omitempty"`  // 章節路徑 → draft | done
	Research bool              `json:"research,omitempty"` // 研究記錄(§12.8),預設關閉
}

type Project struct {
	Root   string
	Config Config
}

type Scene struct {
	Title string `json:"title"`
	Line  int    `json:"line"` // 從 1 起算
}

type Entry struct {
	Path   string  `json:"path"` // 相對專案根,一律使用 /
	Kind   string  `json:"kind"` // 所在資料夾:manuscript | canon | outline | notes | summaries
	Title  string  `json:"title"`
	Status string  `json:"status,omitempty"`
	Scenes []Scene `json:"scenes,omitempty"`
}

type VolumeView struct {
	Title    string  `json:"title"`
	Chapters []Entry `json:"chapters"`
}

type Tree struct {
	Name       string       `json:"name"`
	Volumes    []VolumeView `json:"volumes"`
	Manuscript []Entry      `json:"manuscript"` // 依卷展平後的章節順序
	Canon      []Entry      `json:"canon"`
	Outline    []Entry      `json:"outline"`
	Notes      []Entry      `json:"notes"`
	Warnings   []string     `json:"warnings"`
}

// Create 在 dir 建立新專案。dir 已有 perkins.json 則拒絕,避免覆蓋。
func Create(dir, name string) (*Project, error) {
	if _, err := os.Stat(filepath.Join(dir, ConfigFile)); err == nil {
		return nil, ErrProjectHere
	}
	for _, d := range []string{ManuscriptDir, CanonDir, OutlineDir, NotesDir} {
		if err := os.MkdirAll(filepath.Join(dir, d), 0o755); err != nil {
			return nil, err
		}
	}
	p := &Project{Root: dir, Config: Config{Name: name, Volumes: []Volume{{Title: "第一卷", Chapters: []string{}}}}}
	if err := p.saveConfig(); err != nil {
		return nil, err
	}
	return p, nil
}

func Open(dir string) (*Project, error) {
	b, err := os.ReadFile(filepath.Join(dir, ConfigFile))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNotProject
	}
	if err != nil {
		return nil, err
	}
	p := &Project{Root: dir}
	if err := json.Unmarshal(b, &p.Config); err != nil {
		return nil, fmt.Errorf("perkins.json 格式錯誤: %w", err)
	}
	if p.Config.Volumes == nil {
		// 舊版專案:單層 order 視為一個未命名卷。只在記憶體轉換,下次作者改結構時才寫回。
		p.Config.Volumes = []Volume{{Title: "", Chapters: append([]string{}, p.Config.Order...)}}
	}
	p.Config.Order = nil
	return p, nil
}

func (p *Project) saveConfig() error {
	b, err := json.MarshalIndent(p.Config, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(p.Root, ConfigFile), b)
}

// saveConfigWith 先以 mutate 修改 Config、寫檔,失敗時完整還原到呼叫前的快照。
func (p *Project) saveConfigWith(mutate func(c *Config)) error {
	snapshot := p.Config // 淺拷貝(slice/map 共用;SetResearch 只動 bool,足夠)
	mutate(&p.Config)
	if err := p.saveConfig(); err != nil {
		p.Config = snapshot
		return err
	}
	return nil
}

func (p *Project) SetName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("專案名稱不可為空")
	}
	p.Config.Name = name
	return p.saveConfig()
}

// resolve 把相對路徑轉成專案內的絕對路徑,只允許 Dirs 內的 .md 檔。
func (p *Project) resolve(rel string) (string, error) {
	rel = filepath.ToSlash(rel)
	if rel == "" || strings.HasPrefix(rel, "/") || strings.Contains(rel, ":") {
		return "", ErrBadPath
	}
	for _, seg := range strings.Split(rel, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return "", ErrBadPath
		}
	}
	top := strings.SplitN(rel, "/", 2)[0]
	if !isDir(top) {
		return "", ErrBadPath
	}
	if !strings.HasSuffix(rel, ".md") || rel == top {
		return "", ErrBadPath
	}
	return filepath.Join(p.Root, filepath.FromSlash(rel)), nil
}

func isDir(top string) bool {
	for _, d := range Dirs {
		if d == top {
			return true
		}
	}
	return false
}

// KindOf 回傳路徑所在的資料夾名稱(不驗證路徑)。
func KindOf(rel string) string {
	return strings.SplitN(filepath.ToSlash(rel), "/", 2)[0]
}

func (p *Project) ReadFile(rel string) (string, error) {
	abs, err := p.resolve(rel)
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(abs)
	return string(b), err
}

// WriteFile 是作者手動存檔的路徑。
func (p *Project) WriteFile(rel, content string) error {
	abs, err := p.resolve(rel)
	if err != nil {
		return err
	}
	return writeAtomic(abs, []byte(content))
}

// Exists 回傳檔案是否存在(路徑不合法視為不存在)。
func (p *Project) Exists(rel string) bool {
	abs, err := p.resolve(rel)
	if err != nil {
		return false
	}
	_, err = os.Stat(abs)
	return err == nil
}

// createNew 建立新檔,既有檔案一律拒絕,絕不覆蓋。
func (p *Project) createNew(dir, title, content string) (string, error) {
	slug := sanitizeName(title)
	if slug == "" {
		return "", fmt.Errorf("名稱無效")
	}
	rel := dir + "/" + slug + ".md"
	abs, err := p.resolve(rel)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(abs); err == nil {
		return "", fmt.Errorf("檔案已存在: %s", rel)
	}
	return rel, writeAtomic(abs, []byte(content))
}

// NewChapter 建立空白章節,附加在指定卷(越界則最後一卷)尾端。回傳相對路徑。
func (p *Project) NewChapter(title string, volume int) (string, error) {
	rel, err := p.createNew(ManuscriptDir, title, "# "+strings.TrimSpace(title)+"\n\n")
	if err != nil {
		return "", err
	}
	if len(p.Config.Volumes) == 0 {
		p.Config.Volumes = []Volume{{Title: "第一卷"}}
	}
	if volume < 0 || volume >= len(p.Config.Volumes) {
		volume = len(p.Config.Volumes) - 1
	}
	v := &p.Config.Volumes[volume]
	v.Chapters = append(v.Chapters, rel)
	return rel, p.saveConfig()
}

// NewDoc 在 canon/、outline/、notes/ 建立新檔(不參與章節結構)。content 為空時用標題當內容。
func (p *Project) NewDoc(dir, title, content string) (string, error) {
	if dir != CanonDir && dir != OutlineDir && dir != NotesDir {
		return "", ErrBadPath
	}
	if content == "" {
		content = "# " + strings.TrimSpace(title) + "\n\n"
	}
	return p.createNew(dir, title, content)
}

// NewCanon 保留給舊呼叫者。
func (p *Project) NewCanon(title string) (string, error) { return p.NewDoc(CanonDir, title, "") }

// SetResearch 切換研究記錄(§12.8),存在 perkins.json 隨作品走。
// 寫檔成功才更新 Config;失敗完整還原(記憶體不汙染,後續其他設定保存也不會把失敗值落盤)。
func (p *Project) SetResearch(on bool) error {
	old := p.Config.Research
	if old == on {
		return nil
	}
	if err := p.saveConfigWith(func(c *Config) { c.Research = on }); err != nil {
		return err
	}
	return nil
}

// SetVolumes 只更新 perkins.json,不動任何稿件檔案(SPEC §10、B1)。
func (p *Project) SetVolumes(vols []Volume) error {
	seen := map[string]bool{}
	clean := make([]Volume, 0, len(vols))
	for _, v := range vols {
		cv := Volume{Title: strings.TrimSpace(v.Title), Chapters: []string{}}
		for _, rel := range v.Chapters {
			rel = filepath.ToSlash(rel)
			if KindOf(rel) != ManuscriptDir {
				return ErrBadPath
			}
			if _, err := p.resolve(rel); err != nil {
				return err
			}
			if seen[rel] {
				return fmt.Errorf("章節重複出現: %s", rel)
			}
			seen[rel] = true
			cv.Chapters = append(cv.Chapters, rel)
		}
		clean = append(clean, cv)
	}
	if len(clean) == 0 {
		return fmt.Errorf("至少需要一卷")
	}
	p.Config.Volumes = clean
	return p.saveConfig()
}

// Trash 把檔案移到 .perkins/trash/<時間>/ 下(不真正刪除,作者可自行搬回),並從卷與狀態中移除。
func (p *Project) Trash(rel, stamp string) error {
	abs, err := p.resolve(rel)
	if err != nil {
		return err
	}
	dst := filepath.Join(p.Root, ".perkins", "trash", stamp, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	if err := os.Rename(abs, dst); err != nil {
		return err
	}
	if KindOf(rel) != ManuscriptDir {
		return nil
	}
	for i := range p.Config.Volumes {
		v := &p.Config.Volumes[i]
		kept := v.Chapters[:0]
		for _, c := range v.Chapters {
			if c != rel {
				kept = append(kept, c)
			}
		}
		v.Chapters = kept
	}
	delete(p.Config.Status, rel)
	return p.saveConfig()
}

// SetOrder 把單層順序套用為單一卷(保留第一卷標題)。保留給舊呼叫者與測試。
func (p *Project) SetOrder(order []string) error {
	title := ""
	if len(p.Config.Volumes) > 0 {
		title = p.Config.Volumes[0].Title
	}
	return p.SetVolumes([]Volume{{Title: title, Chapters: order}})
}

func (p *Project) SetStatus(rel, status string) error {
	if KindOf(rel) != ManuscriptDir {
		return ErrBadPath
	}
	if _, err := p.resolve(rel); err != nil {
		return err
	}
	if status != "" && status != StatusDraft && status != StatusDone {
		return fmt.Errorf("未知的章節狀態: %s", status)
	}
	if p.Config.Status == nil {
		p.Config.Status = map[string]string{}
	}
	if status == "" {
		delete(p.Config.Status, rel)
	} else {
		p.Config.Status[rel] = status
	}
	return p.saveConfig()
}

// Chapters 回傳依卷展平的章節順序(已過濾不存在的檔案、補上未列入的檔案)。
func (p *Project) Chapters() ([]string, error) {
	ms, err := listMD(p.Root, ManuscriptDir)
	if err != nil {
		return nil, err
	}
	vols, _ := ResolveVolumes(p.Config.Volumes, ms)
	var out []string
	for _, v := range vols {
		out = append(out, v.Chapters...)
	}
	return out, nil
}

// AllFiles 回傳所有作者檔案(章節依卷順序,其他依檔名)。快照與搜尋使用。
func (p *Project) AllFiles() ([]string, error) {
	out, err := p.Chapters()
	if err != nil {
		return nil, err
	}
	for _, d := range Dirs[1:] {
		fs, err := listMD(p.Root, d)
		if err != nil {
			return nil, err
		}
		out = append(out, fs...)
	}
	return out, nil
}

func (p *Project) Tree() (*Tree, error) {
	ms, err := listMD(p.Root, ManuscriptDir)
	if err != nil {
		return nil, err
	}
	vols, warnings := ResolveVolumes(p.Config.Volumes, ms)
	t := &Tree{Name: p.Config.Name, Warnings: warnings, Volumes: []VolumeView{}, Manuscript: []Entry{},
		Canon: []Entry{}, Outline: []Entry{}, Notes: []Entry{}}
	for _, v := range vols {
		vv := VolumeView{Title: v.Title, Chapters: []Entry{}}
		for _, r := range v.Chapters {
			e := Entry{Path: r, Kind: ManuscriptDir, Title: baseTitle(r), Status: p.Config.Status[r]}
			if text, err := p.ReadFile(r); err == nil {
				e.Scenes = ParseScenes(text)
			}
			vv.Chapters = append(vv.Chapters, e)
			t.Manuscript = append(t.Manuscript, e)
		}
		t.Volumes = append(t.Volumes, vv)
	}
	for _, d := range []struct {
		dir string
		dst *[]Entry
	}{{CanonDir, &t.Canon}, {OutlineDir, &t.Outline}, {NotesDir, &t.Notes}} {
		fs, err := listMD(p.Root, d.dir)
		if err != nil {
			return nil, err
		}
		for _, r := range fs {
			*d.dst = append(*d.dst, Entry{Path: r, Kind: d.dir, Title: baseTitle(r)})
		}
	}
	return t, nil
}

func baseTitle(rel string) string {
	return strings.TrimSuffix(filepath.Base(filepath.FromSlash(rel)), ".md")
}

// ParseScenes 以章節內的 `## ` 標題作為場景(SPEC §12.1)。程式碼區塊內的不算。
func ParseScenes(text string) []Scene {
	var out []Scene
	fence := false
	for i, line := range strings.Split(text, "\n") {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "```") {
			fence = !fence
			continue
		}
		if !fence && strings.HasPrefix(line, "## ") {
			if t := strings.TrimSpace(strings.TrimPrefix(line, "## ")); t != "" {
				out = append(out, Scene{Title: t, Line: i + 1})
			}
		}
	}
	return out
}

// ResolveVolumes 依 SPEC §10:卷中存在的檔案依序;列入但不存在者忽略並警告(不修改設定);
// 未列入任何卷者依檔名排在最後一卷尾端並警告。
func ResolveVolumes(vols []Volume, files []string) ([]Volume, []string) {
	exists := make(map[string]bool, len(files))
	for _, f := range files {
		exists[f] = true
	}
	seen := map[string]bool{}
	var warns []string
	out := make([]Volume, 0, len(vols)+1)
	for _, v := range vols {
		nv := Volume{Title: v.Title, Chapters: []string{}}
		for _, r := range v.Chapters {
			if seen[r] {
				continue
			}
			seen[r] = true
			if exists[r] {
				nv.Chapters = append(nv.Chapters, r)
			} else {
				warns = append(warns, "順序清單中的檔案不存在,已忽略: "+r)
			}
		}
		out = append(out, nv)
	}
	var extra []string
	for _, f := range files {
		if !seen[f] {
			extra = append(extra, f)
		}
	}
	sort.Strings(extra)
	for _, f := range extra {
		warns = append(warns, "檔案未列入順序,已排在最後: "+f)
	}
	if len(extra) > 0 {
		if len(out) == 0 {
			out = append(out, Volume{Chapters: []string{}})
		}
		last := &out[len(out)-1]
		last.Chapters = append(last.Chapters, extra...)
	}
	return out, warns
}

// ResolveOrder 為單層版本(保留給測試與舊呼叫者)。
func ResolveOrder(order, files []string) ([]string, []string) {
	vols, warns := ResolveVolumes([]Volume{{Chapters: order}}, files)
	return vols[0].Chapters, warns
}

func listMD(root, dir string) ([]string, error) {
	var out []string
	base := filepath.Join(root, dir)
	err := filepath.WalkDir(base, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(d.Name(), ".md") {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		out = append(out, filepath.ToSlash(rel))
		return nil
	})
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	sort.Strings(out)
	return out, err
}

func sanitizeName(s string) string {
	s = strings.TrimSpace(s)
	repl := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "*", "", "?", "", "\"", "", "<", "", ">", "", "|", "")
	s = strings.Trim(repl.Replace(s), ". ")
	return s
}

// SanitizeName 供匯入等功能產生安全檔名。
func SanitizeName(s string) string { return sanitizeName(s) }

// writeAtomic 先寫暫存檔再改名,避免存檔中途中斷毀掉稿件。
func writeAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
