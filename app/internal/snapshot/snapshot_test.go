package snapshot

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/project"
)

func setup(t *testing.T) (*Store, string) {
	t.Helper()
	p, err := project.Create(t.TempDir(), "n")
	if err != nil {
		t.Fatal(err)
	}
	rel, _ := p.NewChapter("第一章", 0)
	p.WriteFile(rel, "原稿第一行\n原稿第二行\n")
	p.WriteFile("canon/world.md", "世界觀 v1\n")
	return &Store{Proj: p}, rel
}

// A4 意圖:出錯後必須能回到之前的狀態,且還原後內容與快照當時逐字相同。
func TestRestoreReturnsExactContent(t *testing.T) {
	s, rel := setup(t)
	orig, _ := s.Proj.ReadFile(rel)
	m, err := s.Take("手動", "manual", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(m.Files) != 2 {
		t.Fatalf("未指定檔案時應保存全部稿件與設定, got %v", m.Files)
	}
	s.Proj.WriteFile(rel, "被改壞了")
	s.Proj.WriteFile("canon/world.md", "世界觀 v2")
	if _, err := s.Restore(m.ID, []string{rel}); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.Proj.ReadFile(rel); got != orig {
		t.Fatalf("還原後 = %q, want %q", got, orig)
	}
	// 只還原指定的檔案,其他檔案的新進度不能被一併蓋掉
	if got, _ := s.Proj.ReadFile("canon/world.md"); got != "世界觀 v2" {
		t.Fatalf("未指定的檔案不應被還原, got %q", got)
	}
}

// 意圖:還原本身是有風險的動作(可能選錯版本),必須先保存目前狀態,讓還原也能被撤銷。
func TestRestoreIsItselfUndoable(t *testing.T) {
	s, rel := setup(t)
	m, _ := s.Take("", "manual", []string{rel})
	s.Proj.WriteFile(rel, "作者今天新寫的一千字")
	backup, err := s.Restore(m.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if backup.Reason != "before-restore" {
		t.Fatalf("reason = %s", backup.Reason)
	}
	if _, err := s.Restore(backup.ID, nil); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.Proj.ReadFile(rel); got != "作者今天新寫的一千字" {
		t.Fatalf("撤銷還原失敗, got %q", got)
	}
	prov, _ := os.ReadFile(filepath.Join(s.Proj.Root, ".perkins", "provenance.jsonl"))
	if strings.Count(string(prov), `"event":"restore"`) != 2 {
		t.Errorf("每次還原都應記錄 provenance:\n%s", prov)
	}
}

// 還原前的備份快照失敗 → 不還原(否則作者目前的文字會在無備份的情況下被覆蓋)。
func TestRestoreRefusedWhenBackupFails(t *testing.T) {
	s, rel := setup(t)
	m, _ := s.Take("", "manual", []string{rel})
	s.Proj.WriteFile(rel, "新內容")
	takeBackup = func(*Store, string, string, []string) (*Meta, error) { return nil, errors.New("disk full") }
	defer func() { takeBackup = (*Store).Take }()
	s2 := s
	if _, err := s2.Restore(m.ID, nil); err == nil {
		t.Fatal("無法備份時應拒絕還原")
	}
	if got, _ := s.Proj.ReadFile(rel); got != "新內容" {
		t.Fatal("失敗時不得改動檔案")
	}
}

func TestRejectsBadIDs(t *testing.T) {
	s, _ := setup(t)
	for _, id := range []string{"", "..", "../x", `a\b`, "C:x"} {
		if _, err := s.Get(id); err == nil {
			t.Errorf("應拒絕 id %q", id)
		}
	}
	m, _ := s.Take("", "manual", nil)
	if _, err := s.FileContent(m.ID, "../perkins.json"); err == nil {
		t.Error("不在快照清單的路徑應被拒絕")
	}
}

func TestListNewestFirst(t *testing.T) {
	s, _ := setup(t)
	a, _ := s.Take("a", "manual", nil)
	b, _ := s.Take("b", "manual", nil)
	list, _ := s.List()
	if len(list) != 2 || list[0].ID != b.ID || list[1].ID != a.ID {
		t.Fatalf("list = %+v", list)
	}
}

func TestLineDiff(t *testing.T) {
	d := LineDiff("甲\n乙\n丙\n丁", "甲\n乙改\n丙\n丁\n戊")
	var ops []string
	for _, l := range d {
		ops = append(ops, l.Op+l.Text)
	}
	got := strings.Join(ops, "|")
	want := " 甲|-乙|+乙改| 丙| 丁|+戊"
	if got != want {
		t.Fatalf("got %s\nwant %s", got, want)
	}
	if d := LineDiff("同", "同"); len(d) != 1 || d[0].Op != " " {
		t.Fatalf("相同文字 diff = %+v", d)
	}
}

// 中文一段就是一行:改一個字時,作者要能看出改的是哪個字,而不是整段標色。
func TestLineDiffInlineSegs(t *testing.T) {
	render := func(l DiffLine) string {
		var b strings.Builder
		for _, s := range l.Segs {
			if s.Changed {
				b.WriteString("[" + s.Text + "]")
			} else {
				b.WriteString(s.Text)
			}
		}
		return b.String()
	}
	d := LineDiff("前文\n她推開門,雨聲湧了進來。\n後文", "前文\n她推開窗,雨聲湧了進來。\n後文")
	if len(d) != 4 || d[1].Op != "-" || d[2].Op != "+" {
		t.Fatalf("diff = %+v", d)
	}
	if got := render(d[1]); got != "她推開[門],雨聲湧了進來。" {
		t.Fatalf("刪除行標示 = %s", got)
	}
	if got := render(d[2]); got != "她推開[窗],雨聲湧了進來。" {
		t.Fatalf("新增行標示 = %s", got)
	}
	// 各段接起來必須等於原行,否則畫面顯示的不是實際文字
	for _, l := range d[1:3] {
		var b strings.Builder
		for _, s := range l.Segs {
			b.WriteString(s.Text)
		}
		if b.String() != l.Text {
			t.Fatalf("segs 接起來 %q ≠ 原行 %q", b.String(), l.Text)
		}
	}

	// 整段改寫:逐字標示只剩零星巧合相同的字,應整行標色
	d = LineDiff("她推開門,雨聲湧了進來。", "天亮以前,沒有人說話。")
	for _, l := range d {
		if l.Segs != nil {
			t.Fatalf("整段改寫不應有行內標示: %+v", l)
		}
	}
}

// 長章節每行都有小改時,行內比較不能讓總計算量失控而卡住介面(PR #2 審查發現)。
func TestLineDiffInlineBounded(t *testing.T) {
	lines := func(n int, ch string) string {
		var b strings.Builder
		for i := 0; i < n; i++ {
			fmt.Fprintf(&b, "第%d行%s\n", i, ch)
		}
		return b.String()
	}
	// 行級已退化成整段刪除 + 新增:不得再逐行做字元比較
	for _, l := range LineDiff(lines(2001, "甲"), lines(2001, "乙")) {
		if l.Segs != nil {
			t.Fatalf("退化分支不應有行內標示: %+v", l)
		}
	}

	// 未退化時,總預算用完後其餘行整行標色
	defer func(v int) { inlineBudget = v }(inlineBudget)
	inlineBudget = 40 // 「第N行甲」對「第N行乙」每組 4×4=16 格,只夠兩組
	marked := 0
	for _, l := range LineDiff(lines(10, "甲"), lines(10, "乙")) {
		if l.Op == "-" && l.Segs != nil {
			marked++
		}
	}
	if marked != 2 {
		t.Fatalf("預算 40 應只標示 2 組,實際 %d", marked)
	}
}
