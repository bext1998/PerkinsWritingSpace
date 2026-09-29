// Package snapshot 實作 G3「版本與回溯」:保存檔案的完整副本,可列出、比較、還原。
// 還原本身也會先自動快照,因此還原錯了也能再還原回來。
package snapshot

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"perkins/internal/project"
)

type Meta struct {
	ID      string   `json:"id"`
	Time    string   `json:"time"`
	Label   string   `json:"label"`
	Reason  string   `json:"reason"` // manual | before-accept | before-restore
	Files   []string `json:"files"`
	Missing []string `json:"missing,omitempty"` // 快照當時不存在的檔案(還原時代表「不存在」)
}

type Store struct{ Proj *project.Project }

var seq atomic.Int64

// takeBackup 讓測試能模擬「還原前備份失敗」。
var takeBackup = (*Store).Take

func (s *Store) dir() string { return filepath.Join(s.Proj.Root, ".perkins", "snapshots") }

func validID(id string) bool {
	return id != "" && !strings.ContainsAny(id, `/\.:`)
}

// Take 保存指定檔案;files 為空時保存全部稿件與設定檔。
func (s *Store) Take(label, reason string, files []string) (*Meta, error) {
	if len(files) == 0 {
		all, err := s.Proj.AllFiles()
		if err != nil {
			return nil, err
		}
		files = all
	}
	now := time.Now()
	m := &Meta{
		ID:     fmt.Sprintf("%s-%03d", now.Format("20060102-150405"), seq.Add(1)%1000),
		Time:   now.Format(time.RFC3339),
		Label:  label,
		Reason: reason,
	}
	base := filepath.Join(s.dir(), m.ID)
	for _, rel := range files {
		content, err := s.Proj.ReadFile(rel)
		if errors.Is(err, os.ErrNotExist) {
			m.Missing = append(m.Missing, rel)
			continue
		}
		if err != nil {
			return nil, err
		}
		p := filepath.Join(base, "files", filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			return nil, err
		}
		m.Files = append(m.Files, rel)
	}
	if err := os.MkdirAll(base, 0o755); err != nil {
		return nil, err
	}
	b, _ := json.MarshalIndent(m, "", "  ")
	if err := os.WriteFile(filepath.Join(base, "meta.json"), b, 0o644); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Store) Get(id string) (*Meta, error) {
	if !validID(id) {
		return nil, fmt.Errorf("無效的快照 id")
	}
	b, err := os.ReadFile(filepath.Join(s.dir(), id, "meta.json"))
	if err != nil {
		return nil, fmt.Errorf("找不到快照 %s", id)
	}
	var m Meta
	return &m, json.Unmarshal(b, &m)
}

// List 由新到舊。
func (s *Store) List() ([]*Meta, error) {
	entries, err := os.ReadDir(s.dir())
	if errors.Is(err, os.ErrNotExist) {
		return []*Meta{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := []*Meta{}
	for _, e := range entries {
		if m, err := s.Get(e.Name()); err == nil && e.IsDir() {
			out = append(out, m)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID > out[j].ID })
	return out, nil
}

// FileContent 回傳快照中某檔案的內容。
func (s *Store) FileContent(id, rel string) (string, error) {
	m, err := s.Get(id)
	if err != nil {
		return "", err
	}
	for _, f := range m.Files {
		if f == rel {
			b, err := os.ReadFile(filepath.Join(s.dir(), id, "files", filepath.FromSlash(rel)))
			return string(b), err
		}
	}
	return "", fmt.Errorf("快照 %s 不含 %s", id, rel)
}

// Restore 把快照中的檔案寫回(files 為空則全部)。還原前先自動快照目前狀態,回傳該快照。
func (s *Store) Restore(id string, files []string) (*Meta, error) {
	m, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		files = m.Files
	}
	contents := map[string]string{}
	for _, rel := range files {
		c, err := s.FileContent(id, rel)
		if err != nil {
			return nil, err
		}
		contents[rel] = c
	}
	before, err := takeBackup(s, "還原 "+id+" 之前", "before-restore", files)
	if err != nil {
		return nil, fmt.Errorf("還原前快照失敗,未還原: %w", err)
	}
	for _, rel := range files {
		if err := s.Proj.WriteFile(rel, contents[rel]); err != nil {
			return before, err
		}
	}
	Provenance(s.Proj, map[string]any{"event": "restore", "snapshot": id, "files": files, "backup": before.ID})
	return before, nil
}

// Provenance 追加一筆來源記錄到 .perkins/provenance.jsonl。
func Provenance(p *project.Project, rec map[string]any) {
	rec["time"] = time.Now().Format(time.RFC3339)
	dir := filepath.Join(p.Root, ".perkins")
	if os.MkdirAll(dir, 0o755) != nil {
		return
	}
	f, err := os.OpenFile(filepath.Join(dir, "provenance.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	b, _ := json.Marshal(rec)
	f.Write(append(b, '\n'))
}
