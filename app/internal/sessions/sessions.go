// Package sessions 保存 Perkins Bot 的對話記錄(#33,SPEC §12.3「對話記錄」)。
//
// 位置在使用者設定目錄(%USERPROFILE%\.perkins\sessions\<作品鍵>\,與 settings.json 同層),
// 與作品內的 audit.jsonl、research.jsonl 完全分開、互不取代;不寫入作品資料夾。
// 作品鍵是作品根目錄絕對路徑的雜湊:作品沒有固定 ID,作品搬家後舊記錄不跟著走(已知限制)。
//
// 過往會話內容屬 Interpretation(SPEC §0 第 3 條):接續時只當對話上下文參考,
// 不會成為 Canon;本套件只有讀寫設定目錄的程式路徑,不碰稿件與設定檔。
//
// 狀態三種:一般(active)、封存(archived)、已刪除(deleted)。
// 已刪除放在 <作品鍵>/trash/ 子資料夾,可還原,也可永久刪除(永久刪除前由前端確認)。
package sessions

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"perkins/internal/llm"
)

// Status 會話狀態:一般 / 封存 / 已刪除(回收區)。
type Status string

const (
	StatusActive   Status = "active"
	StatusArchived Status = "archived"
	StatusDeleted  Status = "deleted"
)

// Turn 是前端對話中的一列顯示內容(使用者訊息、AI 回覆、工具呼叫列、通知),
// 與 ChatWindow 的顯示結構對應;只用於還原畫面,不是送給模型的內容。
type Turn struct {
	Role   string `json:"role"` // user | assistant | tool | notice
	Text   string `json:"text"`
	Meta   string `json:"meta,omitempty"`
	Args   string `json:"args,omitempty"`   // 工具呼叫列:參數(僅顯示)
	Result string `json:"result,omitempty"` // 工具呼叫列:結果/錯誤/拒絕訊息(僅顯示)
	Bad    bool   `json:"bad,omitempty"`    // 錯誤或被拒
}

// Session 是一份對話記錄。History 是送給模型的 user/assistant 回合(可能以濃縮摘要開頭),
// Rejections 是本次會話作者拒絕提案時說明的原因(#40,放在系統訊息);接續時兩者載回 Agent。
type Session struct {
	ID         string        `json:"id"`
	Title      string        `json:"title"` // 第一個問題截短
	Status     Status        `json:"status"`
	CreatedAt  string        `json:"createdAt"`
	UpdatedAt  string        `json:"updatedAt"`
	History    []llm.Message `json:"history"`
	Rejections []string      `json:"rejections,omitempty"`
	Turns      []Turn        `json:"turns"`
}

// Meta 是清單顯示用的摘要(標題、更新時間、回合數、狀態、是否目前會話)。
type Meta struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Status    Status `json:"status"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
	Turns     int    `json:"turns"` // 回合數(使用者提問的次數)
	Current   bool   `json:"current"`
}

// ErrNotFound 找不到指定的會話。
var ErrNotFound = errors.New("找不到這份對話記錄")

// Store 是對話記錄的儲存層。Dir 是 <設定目錄>/sessions;
// 每個作品一個子資料夾(作品鍵),互不相見。
type Store struct {
	Dir string
}

// NewStore 以設定目錄(settings.Store 的同一個目錄)為根,對話記錄存於 <dir>/sessions/。
func NewStore(dir string) *Store { return &Store{Dir: filepath.Join(dir, "sessions")} }

// Key 回傳作品根目錄的對話記錄鍵:絕對路徑(正斜線、小寫)的 SHA-256 雜湊前 32 位 hex。
// 大小寫視為相同(Windows 路徑語意);作品搬家後鍵會變,舊記錄不跟著走(已知限制)。
func Key(root string) string {
	p := root
	if abs, err := filepath.Abs(root); err == nil {
		p = abs
	}
	norm := strings.ToLower(filepath.ToSlash(filepath.Clean(p)))
	sum := sha256.Sum256([]byte(norm))
	return fmt.Sprintf("%x", sum[:16])
}

// dirFor 是某個作品的記錄目錄;trash 是其下的回收區。
func (s *Store) dirFor(root string) string  { return filepath.Join(s.Dir, Key(root)) }
func (s *Store) trashFor(root string) string { return filepath.Join(s.dirFor(root), "trash") }

// NewID 產生新的會話 id(時間排序 + 隨機,檔名可讀且不衝突)。
func NewID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return time.Now().Format("20060102-150405") + "-" + fmt.Sprintf("%x", b)
}

// TitleFor 以第一個使用者問題為標題,過長時截短。
func TitleFor(turns []Turn) string {
	const max = 40
	for _, t := range turns {
		if t.Role != "user" {
			continue
		}
		r := []rune(strings.TrimSpace(t.Text))
		if len(r) == 0 {
			continue
		}
		if len(r) > max {
			return string(r[:max]) + "…"
		}
		return string(r)
	}
	return ""
}

// fileFor 依狀態決定檔案位置:已刪除在 trash/,其餘在作品記錄目錄下。
func (s *Store) fileFor(root string, st Status, id string) string {
	dir := s.dirFor(root)
	if st == StatusDeleted {
		dir = s.trashFor(root)
	}
	return filepath.Join(dir, id+".json")
}

// read 讀一份會話;兩個位置都找(狀態與檔案位置一致,但被外部改動時仍讀得到)。
func (s *Store) read(root, id string) (*Session, string, error) {
	if id == "" || strings.ContainsAny(id, `/\`) {
		return nil, "", ErrNotFound
	}
	for _, st := range []Status{StatusActive, StatusArchived, StatusDeleted} {
		path := s.fileFor(root, st, id)
		b, err := os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, "", fmt.Errorf("讀取對話記錄 %s 失敗: %w", path, err)
		}
		var sess Session
		if err := json.Unmarshal(b, &sess); err != nil {
			return nil, "", fmt.Errorf("對話記錄 %s 格式錯誤: %w", path, err)
		}
		return &sess, path, nil
	}
	return nil, "", ErrNotFound
}

// Get 讀一份會話。
func (s *Store) Get(root, id string) (*Session, error) {
	sess, _, err := s.read(root, id)
	return sess, err
}

// Save 保存一份會話:更新 UpdatedAt(沒有 CreatedAt 就補上),以暫存檔 + rename 寫入;
// 狀態改變時(例如移入回收區)把舊位置的檔案移除。寫入失敗回傳錯誤,不靜默。
func (s *Store) Save(root string, sess *Session) error {
	if sess.ID == "" {
		sess.ID = NewID()
	}
	if strings.ContainsAny(sess.ID, `/\`) {
		return fmt.Errorf("不合法的會話 id:%s", sess.ID)
	}
	now := time.Now().Format(time.RFC3339)
	if sess.CreatedAt == "" {
		sess.CreatedAt = now
	}
	sess.UpdatedAt = now
	if sess.Status == "" {
		sess.Status = StatusActive
	}
	b, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return err
	}
	path := s.fileFor(root, sess.Status, sess.ID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("建立對話記錄目錄失敗: %w", err)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return fmt.Errorf("寫入對話記錄失敗: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("寫入對話記錄失敗: %w", err)
	}
	// 狀態變了:清掉另一個位置的舊檔
	for _, st := range []Status{StatusActive, StatusArchived, StatusDeleted} {
		if st == sess.Status {
			continue
		}
		if old := s.fileFor(root, st, sess.ID); old != path {
			_ = os.Remove(old)
		}
	}
	return nil
}

// List 列出作品的全部對話記錄摘要(不含內文),依更新時間新到舊。
// 讀取或解析失敗回傳錯誤(不當成空清單),作者才有機會修復。
func (s *Store) List(root string) ([]Meta, error) {
	var out = []Meta{}
	for _, dir := range []string{s.dirFor(root), s.trashFor(root)} {
		entries, err := os.ReadDir(dir)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("讀取對話記錄目錄失敗: %w", err)
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
				continue
			}
			sess, err := s.Get(root, strings.TrimSuffix(e.Name(), ".json"))
			if err != nil {
				return nil, err
			}
			out = append(out, metaOf(sess))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, nil
}

func metaOf(sess *Session) Meta {
	n := 0
	for _, t := range sess.Turns {
		if t.Role == "user" {
			n++
		}
	}
	return Meta{
		ID: sess.ID, Title: sess.Title, Status: sess.Status,
		CreatedAt: sess.CreatedAt, UpdatedAt: sess.UpdatedAt, Turns: n,
	}
}

// MetaOf 回傳會話的清單摘要(目前會話標示由呼叫端決定)。
func MetaOf(sess *Session) Meta { return metaOf(sess) }

// Archive 封存(on=true)或取消封存(on=false)。已刪除的會話先還原才能封存。
func (s *Store) Archive(root, id string, on bool) error {
	sess, err := s.Get(root, id)
	if err != nil {
		return err
	}
	if sess.Status == StatusDeleted {
		return fmt.Errorf("已刪除的會話要先還原才能封存")
	}
	if on {
		sess.Status = StatusArchived
	} else {
		sess.Status = StatusActive
	}
	return s.Save(root, sess)
}

// Delete 刪除會話:移到回收區(trash/),可 Restore 還原。已在回收區就不動。
func (s *Store) Delete(root, id string) error {
	sess, err := s.Get(root, id)
	if err != nil {
		return err
	}
	if sess.Status == StatusDeleted {
		return nil
	}
	sess.Status = StatusDeleted
	return s.Save(root, sess)
}

// Restore 從回收區還原成一般狀態。
func (s *Store) Restore(root, id string) error {
	sess, err := s.Get(root, id)
	if err != nil {
		return err
	}
	if sess.Status != StatusDeleted {
		return fmt.Errorf("只有回收區中的會話可以還原")
	}
	sess.Status = StatusActive
	return s.Save(root, sess)
}

// Purge 永久刪除回收區中的會話(前端須先確認);只限已刪除的會話。
func (s *Store) Purge(root, id string) error {
	sess, _, err := s.read(root, id)
	if err != nil {
		return err
	}
	if sess.Status != StatusDeleted {
		return fmt.Errorf("只有回收區中的會話可以永久刪除")
	}
	if err := os.Remove(s.fileFor(root, StatusDeleted, id)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("永久刪除對話記錄失敗: %w", err)
	}
	return nil
}
