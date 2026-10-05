package research

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"perkins/internal/project"
)

// setup 建立測試專案與記錄器;on 控制研究記錄開關。
func setup(t *testing.T, on bool) (*Recorder, *project.Project) {
	t.Helper()
	p, err := project.Create(t.TempDir(), "n")
	if err != nil {
		t.Fatal(err)
	}
	if on {
		if err := p.SetResearch(true); err != nil {
			t.Fatal(err)
		}
	}
	return New(p, "sess-1"), p
}

// 意圖(§12.8):關閉時執行各種記錄呼叫,絕不能建立 research.jsonl(預設關閉)。
func TestDisabledCreatesNoFile(t *testing.T) {
	r, p := setup(t, false)
	if r.Enabled() {
		t.Fatal("預設應關閉")
	}
	for i := 0; i < 3; i++ {
		if err := r.Log("save", map[string]any{"path": "manuscript/01.md"}); err != nil {
			t.Fatalf("關閉時 Log 應為 no-op: %v", err)
		}
	}
	if _, err := os.Stat(filepath.Join(p.Root, ".perkins", FileName)); !os.IsNotExist(err) {
		t.Fatal("關閉時不應建立 research.jsonl")
	}
}

// 意圖:開啟時各事件逐行 append,含共同欄位與事件專屬 detail。
func TestEnabledAppendsEvents(t *testing.T) {
	r, p := setup(t, true)
	if err := r.Log("open_file", map[string]any{"path": "manuscript/01.md"}); err != nil {
		t.Fatal(err)
	}
	if err := r.Log("save", map[string]any{"path": "manuscript/01.md", "beforeLen": 5, "afterLen": 9}); err != nil {
		t.Fatal(err)
	}
	evs, err := Read(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 2 {
		t.Fatalf("應有 2 筆: %d", len(evs))
	}
	if evs[0].Session != "sess-1" || evs[0].Name != "open_file" || evs[0].TS == "" {
		t.Fatalf("共同欄位錯誤: %+v", evs[0])
	}
	if _, err := time.Parse("2006-01-02T15:04:05.000Z07:00", evs[0].TS); err != nil {
		t.Fatalf("ts 應為 RFC3339 含毫秒: %v", evs[0].TS)
	}
	var d map[string]any
	if err := json.Unmarshal(evs[0].Detail, &d); err != nil {
		t.Fatal(err)
	}
	if d["path"] != "manuscript/01.md" {
		t.Fatalf("detail 錯誤: %v", d)
	}
	if evs[1].Name != "save" {
		t.Fatalf("第二筆應為 save: %+v", evs[1])
	}
}

// 意圖:寫入失敗回傳 error 給呼叫端,不得 panic;呼叫端可忽略(不中斷作者的操作)。
func TestLogErrorReturnNotPanic(t *testing.T) {
	r, p := setup(t, true)
	r.Proj = &project.Project{Root: filepath.Join(p.Root, "不存在")} // 讓 MkdirAll/Write 失敗的路徑
	// 不存在的 .perkins 上層其實 MkdirAll 會成功,改用檔案佔住目標位置
	r2, p2 := setup(t, true)
	os.WriteFile(filepath.Join(p2.Root, ".perkins"), []byte("不是資料夾"), 0o644)
	if err := r2.Log("save", nil); err == nil {
		t.Fatal(".perkins 被檔案佔住時 Log 應回傳 error")
	}
	if _, err := os.Stat(filepath.Join(p.Root, ".perkins", FileName)); err == nil {
		_ = err
	}
	_ = r
}

// 意圖:detail 為 nil 時不應出現 detail 欄位(omitempty)。
func TestNilDetailOmitted(t *testing.T) {
	r, p := setup(t, true)
	if err := r.Log("custom", nil); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(p.Root, ".perkins", FileName))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "detail") {
		t.Fatalf("nil detail 不應序列化: %s", b)
	}
}
