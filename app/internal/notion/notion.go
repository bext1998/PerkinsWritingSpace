// Package notion 一次性匯入 Notion「Markdown & CSV」匯出(SPEC §12.5)。
// 確定性轉換:去除 Notion id、內部連結轉純文字、依資料夾分組;作者為每組指定去處。
// 絕不覆蓋既有檔案(B9);每次匯入留下紀錄,可整批移到回收區復原。
package notion

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"perkins/internal/bible"
	"perkins/internal/project"
)

var (
	reID      = regexp.MustCompile(`\s+[0-9a-f]{32}$`)
	reImage   = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	reLink    = regexp.MustCompile(`\[([^\]]*)\]\([^)]*\)`)
	reProp    = regexp.MustCompile(`^([^:\n]{1,30}):\s+(.+)$`)
	reHeading = regexp.MustCompile(`^#\s+(.+)$`)
)

// CleanName 去掉 Notion 附加在檔名/資料夾名後面的 32 位 id。
func CleanName(s string) string {
	s = strings.TrimSuffix(s, ".md")
	return strings.TrimSpace(reID.ReplaceAllString(s, ""))
}

type File struct {
	Src   string `json:"src"`  // 在匯出中的相對路徑
	Name  string `json:"name"` // 清理後的名稱(即檔名與實體名稱)
	Bytes int    `json:"bytes"`
}

type Group struct {
	Key   string `json:"key"`   // 清理後的資料夾路徑,最上層為 ""
	Label string `json:"label"` // 顯示用
	Files []File `json:"files"`
}

type Plan struct {
	Source string  `json:"source"`
	Groups []Group `json:"groups"`
	Images int     `json:"images"` // 匯出中的圖片數(不匯入,只告知)
}

// Target 是作者為一組選擇的去處:分類(內建或自訂,由呼叫者給定 types,→ canon/)、"筆記"、"大綱"、"略過"。
const (
	TargetNotes   = "筆記"
	TargetOutline = "大綱"
	TargetSkip    = "略過"
)

type source struct {
	files map[string][]byte // 相對路徑(/)→ 內容,只收 .md
	imgs  int
}

func isImage(name string) bool {
	switch strings.ToLower(path.Ext(name)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp":
		return true
	}
	return false
}

func readSource(src string) (*source, error) {
	st, err := os.Stat(src)
	if err != nil {
		return nil, err
	}
	s := &source{files: map[string][]byte{}}
	if st.IsDir() {
		err = filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return err
			}
			rel, _ := filepath.Rel(src, p)
			rel = filepath.ToSlash(rel)
			switch {
			case strings.HasSuffix(strings.ToLower(rel), ".md"):
				b, err := os.ReadFile(p)
				if err != nil {
					return err
				}
				s.files[rel] = b
			case strings.HasSuffix(strings.ToLower(rel), ".zip"):
				b, err := os.ReadFile(p)
				if err != nil {
					return err
				}
				return s.addZip(b, strings.TrimSuffix(rel, path.Ext(rel))+"/", 1)
			case isImage(rel):
				s.imgs++
			}
			return nil
		})
		return s, err
	}
	b, err := os.ReadFile(src)
	if err != nil {
		return nil, err
	}
	return s, s.addZip(b, "", 2)
}

// addZip 讀取 zip(Notion 大型匯出會把多個 Part-N.zip 包在外層 zip 裡,所以允許巢狀一層)。
func (s *source) addZip(b []byte, prefix string, depth int) error {
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return fmt.Errorf("無法讀取 zip: %w", err)
	}
	for _, f := range zr.File {
		if f.FileInfo().IsDir() {
			continue
		}
		name := strings.TrimPrefix(path.Clean("/"+f.Name), "/")
		lower := strings.ToLower(name)
		switch {
		case strings.HasSuffix(lower, ".md"), strings.HasSuffix(lower, ".zip") && depth > 1:
			rc, err := f.Open()
			if err != nil {
				return err
			}
			data, err := io.ReadAll(io.LimitReader(rc, 512<<20))
			rc.Close()
			if err != nil {
				return err
			}
			if strings.HasSuffix(lower, ".zip") {
				if err := s.addZip(data, prefix, depth-1); err != nil {
					return err
				}
				continue
			}
			s.files[prefix+name] = data
		case isImage(lower):
			s.imgs++
		}
	}
	return nil
}

// Scan 讀取匯出(資料夾或 zip)並依資料夾分組。不寫入任何檔案。
func Scan(src string) (*Plan, error) {
	s, err := readSource(src)
	if err != nil {
		return nil, err
	}
	if len(s.files) == 0 {
		return nil, fmt.Errorf("找不到任何 Markdown 檔:請在 Notion 選擇「Markdown & CSV」格式匯出")
	}
	groups := map[string]*Group{}
	for rel, b := range s.files {
		dir, file := path.Split(rel)
		key := cleanDir(strings.TrimSuffix(dir, "/"))
		g := groups[key]
		if g == nil {
			label := key
			if label == "" {
				label = "(最上層頁面)"
			}
			g = &Group{Key: key, Label: label}
			groups[key] = g
		}
		g.Files = append(g.Files, File{Src: rel, Name: project.SanitizeName(CleanName(file)), Bytes: len(b)})
	}
	plan := &Plan{Source: src, Images: s.imgs}
	for _, g := range groups {
		sort.Slice(g.Files, func(i, j int) bool { return g.Files[i].Src < g.Files[j].Src })
		plan.Groups = append(plan.Groups, *g)
	}
	sort.Slice(plan.Groups, func(i, j int) bool { return plan.Groups[i].Key < plan.Groups[j].Key })
	return plan, nil
}

func cleanDir(dir string) string {
	if dir == "" {
		return ""
	}
	parts := strings.Split(dir, "/")
	for i, p := range parts {
		parts[i] = CleanName(p)
	}
	return strings.Join(parts, "/")
}

// Convert 把一個 Notion 頁面轉成 Perkins 的 Markdown 本文:連結轉純文字、移除圖片、
// 標題下方的屬性行(「欄位: 值」)轉成條列。
func Convert(md string) string {
	md = strings.ReplaceAll(md, "\r\n", "\n")
	md = reImage.ReplaceAllString(md, "")
	md = reLink.ReplaceAllStringFunc(md, func(m string) string {
		sub := reLink.FindStringSubmatch(m)
		text := sub[1]
		if u, err := url.PathUnescape(text); err == nil {
			text = u
		}
		return CleanName(text)
	})
	lines := strings.Split(md, "\n")
	inProps := false
	for i, l := range lines {
		if reHeading.MatchString(l) && i < 3 {
			inProps = true
			continue
		}
		if inProps {
			if strings.TrimSpace(l) == "" {
				if i > 0 && strings.HasPrefix(lines[i-1], "- ") {
					inProps = false
				}
				continue
			}
			if m := reProp.FindStringSubmatch(l); m != nil {
				lines[i] = "- " + m[1] + ":" + m[2]
				continue
			}
			inProps = false
		}
	}
	return strings.TrimSpace(strings.Join(lines, "\n")) + "\n"
}

type Result struct {
	ID      string   `json:"id"`
	Created []string `json:"created"`
	Skipped []string `json:"skipped"` // 「來源 → 原因」
}

func targetDir(target string, types []string) (string, string, bool) {
	switch target {
	case TargetSkip, "":
		return "", "", false
	case TargetNotes:
		return project.NotesDir, "", true
	case TargetOutline:
		return project.OutlineDir, "", true
	}
	for _, t := range types {
		if t == target {
			return project.CanonDir, t, true
		}
	}
	return "", "", false
}

// Apply 依作者的選擇匯入。choices:群組 key → 去處;pages:逐頁覆寫(頁面 File.Src → 去處,
// 與群組同一套值),頁面有覆寫就用覆寫,否則用所屬群組的去處;key 不在掃描結果中時忽略。
// 同名檔案一律略過並列入報告,絕不覆蓋(B9)。types:可匯入 canon/ 的分類清單
// (內建+自訂,SPEC §12.2),targetDir 依它驗證去處。
func Apply(p *project.Project, src string, choices map[string]string, pages map[string]string, types []string) (*Result, error) {
	plan, err := Scan(src)
	if err != nil {
		return nil, err
	}
	s, err := readSource(src)
	if err != nil {
		return nil, err
	}
	res := &Result{ID: time.Now().Format("20060102-150405"), Created: []string{}, Skipped: []string{}}
	for _, g := range plan.Groups {
		for _, f := range g.Files {
			// 逐頁覆寫優先;否則用所屬群組的去處
			target := choices[g.Key]
			if v, ok := pages[f.Src]; ok {
				target = v
			}
			dir, typ, ok := targetDir(target, types)
			if !ok {
				continue
			}
			if f.Name == "" {
				res.Skipped = append(res.Skipped, f.Src+" → 名稱無效")
				continue
			}
			rel := dir + "/" + f.Name + ".md"
			if p.Exists(rel) {
				res.Skipped = append(res.Skipped, f.Src+" → 已有同名檔案 "+rel+",未覆蓋")
				continue
			}
			body := Convert(string(s.files[f.Src]))
			if typ != "" {
				if body, err = bible.SetHeader(body, typ, f.Name, nil); err != nil {
					return res, err
				}
			}
			if err := p.WriteFile(rel, body); err != nil {
				return res, err
			}
			res.Created = append(res.Created, rel)
		}
	}
	if err := saveLog(p, res); err != nil {
		return res, err
	}
	return res, nil
}

func logPath(p *project.Project, id string) string {
	return filepath.Join(p.Root, ".perkins", "imports", id+".json")
}

func saveLog(p *project.Project, r *Result) error {
	if err := os.MkdirAll(filepath.Dir(logPath(p, r.ID)), 0o755); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(r, "", "  ")
	return os.WriteFile(logPath(p, r.ID), b, 0o644)
}

// Undo 把某次匯入建立的檔案移到回收區(不刪除)。作者之後修改過的檔案也一併移走,
// 所以回傳清單讓介面顯示。
func Undo(p *project.Project, id string) ([]string, error) {
	if strings.ContainsAny(id, `/\.:`) || id == "" {
		return nil, fmt.Errorf("無效的匯入 id")
	}
	b, err := os.ReadFile(logPath(p, id))
	if err != nil {
		return nil, fmt.Errorf("找不到匯入紀錄 %s", id)
	}
	var r Result
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, err
	}
	var moved []string
	for _, rel := range r.Created {
		if !p.Exists(rel) {
			continue
		}
		if err := p.Trash(rel, "import-"+id); err != nil {
			return moved, err
		}
		moved = append(moved, rel)
	}
	return moved, os.Remove(logPath(p, id))
}
