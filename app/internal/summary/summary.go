// Package summary 管理「作者確認過」的章節摘要(SPEC §12.3)。
// 只有作者按下儲存的摘要才會存在 summaries/;AI 的草稿只存在於介面記憶體中,永遠不會被當成上下文(B6)。
package summary

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"perkins/internal/bible"
	"perkins/internal/project"
)

type Summary struct {
	Chapter string `json:"chapter"`
	Path    string `json:"path"`
	Text    string `json:"text"`
	Exists  bool   `json:"exists"`
	Stale   bool   `json:"stale"` // 章節在摘要儲存後被修改過
	Updated string `json:"updated,omitempty"`
}

func hash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// PathFor 回傳章節對應的摘要路徑:manuscript/a/b.md → summaries/a/b.md。
func PathFor(chapter string) (string, error) {
	if project.KindOf(chapter) != project.ManuscriptDir {
		return "", fmt.Errorf("只有稿件章節可以有摘要: %s", chapter)
	}
	return project.SummariesDir + strings.TrimPrefix(chapter, project.ManuscriptDir), nil
}

type front struct {
	Source     string `yaml:"source"`
	SourceHash string `yaml:"sourceHash"`
	Updated    string `yaml:"updated"`
}

func Load(p *project.Project, chapter string) (Summary, error) {
	sp, err := PathFor(chapter)
	if err != nil {
		return Summary{}, err
	}
	s := Summary{Chapter: chapter, Path: sp}
	raw, err := p.ReadFile(sp)
	if err != nil {
		return s, nil // 沒有摘要不是錯誤
	}
	y, body := bible.SplitFrontmatter(raw)
	var f front
	yaml.Unmarshal([]byte(y), &f)
	s.Exists, s.Text, s.Updated = true, strings.TrimSpace(body), f.Updated
	cur, err := p.ReadFile(chapter)
	s.Stale = err != nil || f.SourceHash == "" || hash(cur) != f.SourceHash
	return s, nil
}

// Save 由作者的介面動作觸發,記錄儲存當下章節內容的雜湊,之後用來判斷摘要是否過期。
func Save(p *project.Project, chapter, text string) (Summary, error) {
	sp, err := PathFor(chapter)
	if err != nil {
		return Summary{}, err
	}
	cur, err := p.ReadFile(chapter)
	if err != nil {
		return Summary{}, err
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return Summary{}, fmt.Errorf("摘要不可為空")
	}
	fm, _ := yaml.Marshal(front{Source: chapter, SourceHash: hash(cur), Updated: time.Now().Format(time.RFC3339)})
	if err := p.WriteFile(sp, "---\n"+string(fm)+"---\n\n"+text+"\n"); err != nil {
		return Summary{}, err
	}
	return Load(p, chapter)
}

// Before 回傳 chapter 之前(依卷章順序)所有已儲存的摘要。chapter 為空時回傳全部。
func Before(p *project.Project, chapter string) ([]Summary, error) {
	order, err := p.Chapters()
	if err != nil {
		return nil, err
	}
	var out []Summary
	for _, c := range order {
		if c == chapter {
			break
		}
		s, err := Load(p, c)
		if err == nil && s.Exists {
			out = append(out, s)
		}
	}
	return out, nil
}
