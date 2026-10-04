// Package research 實作研究記錄(SPEC §12.8)。
// 開關存在 perkins.json(預設關閉);開啟時把事件逐行 append 到 .perkins/research.jsonl。
// 完全不動 audit.jsonl 與 provenance.jsonl。寫入失敗不中斷作者的操作:回傳 error 給呼叫端記錄即可。
package research

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"perkins/internal/project"
)

const FileName = "research.jsonl"

// Event 是一筆研究記錄:共同欄位 + Detail(事件專屬欄位,以 JSON 物件內嵌)。
type Event struct {
	TS      string          `json:"ts"`
	Session string          `json:"session"`
	Name    string          `json:"event"`
	Detail  json.RawMessage `json:"detail,omitempty"`
}

// Recorder 屬於一個專案與一個使用時段(session)。
type Recorder struct {
	Proj    *project.Project
	Session string

	mu sync.Mutex // 逐筆序列化,避免交錯寫入同一行
}

// New 建立記錄器;session 為 App 啟動時產生的隨機 id。
func New(p *project.Project, session string) *Recorder {
	return &Recorder{Proj: p, Session: session}
}

// Enabled 回傳研究記錄是否開啟(存在 perkins.json)。
func (r *Recorder) Enabled() bool { return r != nil && r.Proj != nil && r.Proj.Config.Research }

// Log 記錄一筆事件。關閉時直接 return(nil),不建立任何檔案。
// 開啟時以 append 寫一行 JSON;失敗回傳 error 給呼叫端記錄,不中斷作者的操作。
func (r *Recorder) Log(name string, detail any) error {
	if !r.Enabled() {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	var raw json.RawMessage
	if detail != nil {
		b, err := json.Marshal(detail)
		if err != nil {
			return fmt.Errorf("研究記錄序列化失敗: %w", err)
		}
		raw = b
	}
	ev := Event{TS: time.Now().Format("2006-01-02T15:04:05.000Z07:00"), Session: r.Session, Name: name, Detail: raw}
	b, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("研究記錄序列化失敗: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(r.Proj.Root, ".perkins"), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(r.Proj.Root, ".perkins", FileName), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.Write(append(b, '\n')); err != nil {
		return err
	}
	return nil
}

// Read 讀回全部記錄(測試用)。
func Read(p *project.Project) ([]Event, error) {
	b, err := os.ReadFile(filepath.Join(p.Root, ".perkins", FileName))
	if err != nil {
		return nil, err
	}
	var out []Event
	for _, line := range splitLines(b) {
		var ev Event
		if err := json.Unmarshal(line, &ev); err != nil {
			return out, err
		}
		out = append(out, ev)
	}
	return out, nil
}

func splitLines(b []byte) [][]byte {
	var lines [][]byte
	start := 0
	for i, c := range b {
		if c == '\n' {
			if i > start {
				lines = append(lines, b[start:i])
			}
			start = i + 1
		}
	}
	if start < len(b) {
		lines = append(lines, b[start:])
	}
	return lines
}
