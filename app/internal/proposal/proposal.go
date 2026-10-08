// Package proposal 實作 G1「提案非提交」:AI 的修改只會成為待審 Proposal;
// 只有作者呼叫 Accept 才會寫入稿件,且寫入前一定先快照、並驗證基準雜湊(A2)。
package proposal

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"perkins/internal/project"
	"perkins/internal/snapshot"
)

type Status string

const (
	Pending  Status = "pending"
	Accepted Status = "accepted"
	Rejected Status = "rejected"
	Conflict Status = "conflict"
)

var (
	ErrConflict   = errors.New("檔案在提案建立後已被修改,為避免覆蓋你的編輯,提案未套用")
	ErrNotPending = errors.New("此提案已處理過")
)

type Proposal struct {
	ID          string   `json:"id"`
	CreatedAt   string   `json:"createdAt"`
	Model       string   `json:"model"`
	Target      string   `json:"target"`
	Original    string   `json:"original"`
	Replacement string   `json:"replacement"`
	Rationale   string   `json:"rationale"`
	Assumptions []string `json:"assumptions"`
	BaseHash    string   `json:"baseHash"`
	Start       int      `json:"start"` // Original 在檔案中的位元組偏移;重新定位套用後改為實際套用處(編輯器據此標示改動)
	End         int      `json:"end"`
	Status      Status   `json:"status"`
	SnapshotID  string   `json:"snapshotId,omitempty"` // 接受時產生
	Relocated   bool     `json:"relocated,omitempty"`  // 檔案在別處有變動,依原文重新定位後套用
	// 部分採用(SPEC §12.3):作者在接受前編輯過建議文字時,實際寫入的是 Final。
	AuthorEdited bool   `json:"authorEdited,omitempty"`
	Final        string `json:"final,omitempty"`
}

type Store struct{ Proj *project.Project }

func Hash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func (s *Store) dir() string { return filepath.Join(s.Proj.Root, ".perkins", "proposals") }

func (s *Store) save(p *Proposal) error {
	if err := os.MkdirAll(s.dir(), 0o755); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(p, "", "  ")
	return os.WriteFile(filepath.Join(s.dir(), p.ID+".json"), b, 0o644)
}

func (s *Store) Get(id string) (*Proposal, error) {
	if id == "" || strings.ContainsAny(id, `/\.`) {
		return nil, fmt.Errorf("無效的提案 id")
	}
	b, err := os.ReadFile(filepath.Join(s.dir(), id+".json"))
	if err != nil {
		return nil, fmt.Errorf("找不到提案 %s", id)
	}
	var p Proposal
	return &p, json.Unmarshal(b, &p)
}

// Create 由 AI 工具呼叫。它只寫入 .perkins/proposals/,不碰稿件與設定。
// original 必須在目標檔中恰好出現一次,以精確定位(模型給的行號/偏移不可靠)。
func (s *Store) Create(model, target, original, replacement, rationale string, assumptions []string) (*Proposal, error) {
	if original == "" {
		return nil, errors.New("original 不可為空:請提供要被替換的原文片段")
	}
	if original == replacement {
		return nil, errors.New("replacement 與 original 相同,沒有修改")
	}
	content, err := s.Proj.ReadFile(target)
	if err != nil {
		return nil, err
	}
	switch n := strings.Count(content, original); {
	case n == 0:
		return nil, errors.New("在目標檔中找不到 original,請逐字複製原文")
	case n > 1:
		return nil, fmt.Errorf("original 在檔案中出現 %d 次,請提供更長、唯一的片段", n)
	}
	start := strings.Index(content, original)
	now := time.Now()
	p := &Proposal{
		ID:          fmt.Sprintf("%s-%s", now.Format("20060102-150405"), Hash(content + replacement + now.String())[:6]),
		CreatedAt:   now.Format(time.RFC3339),
		Model:       model,
		Target:      target,
		Original:    original,
		Replacement: replacement,
		Rationale:   rationale,
		Assumptions: append([]string{}, assumptions...),
		BaseHash:    Hash(content),
		Start:       start,
		End:         start + len(original),
		Status:      Pending,
	}
	return p, s.save(p)
}

func (s *Store) List() ([]*Proposal, error) {
	entries, err := os.ReadDir(s.dir())
	if errors.Is(err, os.ErrNotExist) {
		return []*Proposal{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := []*Proposal{}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		if p, err := s.Get(strings.TrimSuffix(e.Name(), ".json")); err == nil {
			out = append(out, p)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID > out[j].ID })
	return out, nil
}

// Reject 拒絕提案;回傳提案供呼叫端記錄研究事件。
func (s *Store) Reject(id string) (*Proposal, error) {
	p, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	if p.Status != Pending && p.Status != Conflict {
		return nil, ErrNotPending
	}
	p.Status = Rejected
	return p, s.save(p)
}

// Accept 是全系統唯一會因 AI 提案而寫入稿件的路徑,只由作者的介面動作觸發。
// edited 非 nil 時表示作者編輯過建議文字(部分採用),寫入的是作者的版本(B4)。
func (s *Store) Accept(id string, edited *string) (*Proposal, error) {
	p, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	if p.Status != Pending {
		return nil, ErrNotPending
	}
	content, err := s.Proj.ReadFile(p.Target)
	if err != nil {
		return nil, err
	}
	start, end := p.Start, p.End
	unchanged := Hash(content) == p.BaseHash && p.End <= len(content) && content[p.Start:p.End] == p.Original
	if !unchanged {
		// 作者在提案後改過檔案。只有原文仍原封不動且唯一時才重新定位套用;
		// 作者動過這段(找不到)或已無法唯一定位,一律衝突,絕不猜測位置。
		if strings.Count(content, p.Original) != 1 {
			p.Status = Conflict
			if err := s.save(p); err != nil {
				return nil, err
			}
			return p, ErrConflict
		}
		start = strings.Index(content, p.Original)
		end = start + len(p.Original)
		p.Relocated = true
		p.Start, p.End = start, end
	}
	final := p.Replacement
	if edited != nil && *edited != p.Replacement {
		final = *edited
		p.AuthorEdited, p.Final = true, final
	}
	// G3:先快照,快照失敗就不套用。
	snap, err := takeSnapshot(&snapshot.Store{Proj: s.Proj}, "接受提案 "+p.ID+" 之前", "before-accept", []string{p.Target})
	if err != nil {
		return nil, fmt.Errorf("快照失敗,未套用提案: %w", err)
	}
	if err := s.Proj.WriteFile(p.Target, content[:start]+final+content[end:]); err != nil {
		return nil, err
	}
	p.Status, p.SnapshotID = Accepted, snap.ID
	if err := s.save(p); err != nil {
		return nil, err
	}
	snapshot.Provenance(s.Proj, map[string]any{"event": "accept", "proposal": p.ID, "target": p.Target, "model": p.Model,
		"snapshot": snap.ID, "rationale": p.Rationale, "relocated": p.Relocated,
		"authorEdited": p.AuthorEdited, "final": final})
	return p, nil
}

// takeSnapshot 讓測試能模擬快照失敗。
var takeSnapshot = (*snapshot.Store).Take
