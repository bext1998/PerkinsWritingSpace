package proposal

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/project"
	"perkins/internal/snapshot"
)

func setup(t *testing.T) (*Store, string, string) {
	t.Helper()
	dir := t.TempDir()
	p, _ := project.Create(dir, "n")
	rel, _ := p.NewChapter("第一章", 0)
	if err := p.WriteFile(rel, "小明走進森林。天很黑。他很害怕。\n"); err != nil {
		t.Fatal(err)
	}
	return &Store{Proj: p}, rel, dir
}

func read(t *testing.T, s *Store, rel string) string {
	t.Helper()
	c, err := s.Proj.ReadFile(rel)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// A1 意圖:建立提案不能改動稿件——AI 的偏好在作者按下接受之前不得成為作品。
func TestCreateDoesNotModifyManuscript(t *testing.T) {
	s, rel, _ := setup(t)
	before := read(t, s, rel)
	p, err := s.Create("m", rel, "天很黑。", "夜濃得化不開。", "更有畫面", []string{"假設是夜晚"})
	if err != nil {
		t.Fatal(err)
	}
	if p.Status != Pending || read(t, s, rel) != before {
		t.Fatal("提案建立後稿件必須不變且狀態為 pending")
	}
}

// 意圖:模型給的片段若不唯一,套用位置就是猜的,可能改到別處。
func TestCreateRequiresUniqueExactOriginal(t *testing.T) {
	s, rel, _ := setup(t)
	s.Proj.WriteFile(rel, "他笑了。他笑了。\n")
	cases := map[string]string{"": "空", "不存在的句子": "找不到", "他笑了。": "2 次"}
	for orig, want := range cases {
		if _, err := s.Create("m", rel, orig, "x", "", nil); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("original=%q: err=%v, 應含 %q", orig, err, want)
		}
	}
	if _, err := s.Create("m", "../perkins.json", "a", "b", "", nil); err == nil {
		t.Error("路徑跳脫應被拒絕")
	}
}

// 接受後只替換指定片段,其餘內容(含中文標點與換行)原樣保留,並留下快照與來源記錄。
func TestAcceptAppliesOnlyTargetAndSnapshotsFirst(t *testing.T) {
	s, rel, dir := setup(t)
	before := read(t, s, rel)
	p, _ := s.Create("m", rel, "天很黑。", "夜濃得化不開。", "why", nil)
	got, err := s.Accept(p.ID, nil)
	if err != nil || got.Status != Accepted {
		t.Fatalf("err=%v status=%v", err, got)
	}
	if read(t, s, rel) != "小明走進森林。夜濃得化不開。他很害怕。\n" {
		t.Fatalf("內容 = %q", read(t, s, rel))
	}
	snap, err := (&snapshot.Store{Proj: s.Proj}).FileContent(got.SnapshotID, rel)
	if err != nil || snap != before {
		t.Fatalf("快照應等於接受前內容, err=%v", err)
	}
	prov, _ := os.ReadFile(filepath.Join(dir, ".perkins", "provenance.jsonl"))
	if !strings.Contains(string(prov), p.ID) {
		t.Error("provenance 應記錄此次接受")
	}
	if _, err := s.Accept(p.ID, nil); err != ErrNotPending {
		t.Errorf("重複接受應回 ErrNotPending, got %v", err)
	}
}

// A2 意圖:作者在提案之後改了「提案要改的那段」,舊提案不能把作者新寫的字蓋掉。
func TestAcceptConflictWhenAuthorEditedTheSameText(t *testing.T) {
	s, rel, dir := setup(t)
	p, _ := s.Create("m", rel, "天很黑。", "夜濃得化不開。", "", nil)
	edited := "小明走進森林。天色暗得像墨。他很害怕。\n"
	s.Proj.WriteFile(rel, edited)

	got, err := s.Accept(p.ID, nil)
	if err != ErrConflict || got.Status != Conflict {
		t.Fatalf("應為 conflict, err=%v status=%v", err, got.Status)
	}
	if read(t, s, rel) != edited {
		t.Fatal("衝突時不得改動檔案")
	}
	if list, _ := (&snapshot.Store{Proj: s.Proj}).List(); len(list) != 0 {
		t.Error("衝突時不應產生快照")
	}
	_ = dir
}

// A2 意圖(另一面):作者在「別處」繼續寫作是常態,不應讓所有舊提案失效;
// 原文仍唯一時重新定位套用,且作者在別處新寫的內容完整保留。
func TestAcceptRelocatesWhenAuthorEditedElsewhere(t *testing.T) {
	s, rel, _ := setup(t)
	p, _ := s.Create("m", rel, "天很黑。", "夜濃得化不開。", "", nil)
	s.Proj.WriteFile(rel, "【作者在前面補了一段】\n小明走進森林。天很黑。他很害怕。\n【又在後面補一段】\n")

	got, err := s.Accept(p.ID, nil)
	if err != nil || !got.Relocated {
		t.Fatalf("應重新定位並套用, err=%v got=%+v", err, got)
	}
	want := "【作者在前面補了一段】\n小明走進森林。夜濃得化不開。他很害怕。\n【又在後面補一段】\n"
	if read(t, s, rel) != want {
		t.Fatalf("got %q", read(t, s, rel))
	}
}

// 重新定位套用後,回傳的 Start 必須是實際寫入處:編輯器依它標示 AI 改動(#45 a);
// 若沿用建立時的舊位置,作者在前面補寫且替換文字在別處也出現時,會標到錯的段落。
func TestAcceptRelocatedReportsAppliedStart(t *testing.T) {
	s, rel, _ := setup(t)
	p, _ := s.Create("m", rel, "天很黑。", "夜濃得化不開。", "", nil)
	content := "夜濃得化不開。【作者在前面補寫】\n小明走進森林。天很黑。他很害怕。\n"
	s.Proj.WriteFile(rel, content)

	got, err := s.Accept(p.ID, nil)
	if err != nil || !got.Relocated {
		t.Fatalf("應重新定位並套用, err=%v got=%+v", err, got)
	}
	if want := strings.Index(content, "天很黑。"); got.Start != want {
		t.Fatalf("Start=%d,應為實際套用處 %d", got.Start, want)
	}
	if after := read(t, s, rel); after[got.Start:got.Start+len("夜濃得化不開。")] != "夜濃得化不開。" {
		t.Fatalf("Start 處不是寫入的文字: %q", after)
	}
}

// 作者編輯後原文出現兩次:位置無法唯一決定,不可猜。
func TestAcceptConflictWhenOriginalBecomesAmbiguous(t *testing.T) {
	s, rel, _ := setup(t)
	p, _ := s.Create("m", rel, "天很黑。", "X", "", nil)
	edited := "天很黑。小明走進森林。天很黑。\n"
	s.Proj.WriteFile(rel, edited)
	if _, err := s.Accept(p.ID, nil); err != ErrConflict || read(t, s, rel) != edited {
		t.Fatalf("應衝突且不改檔, err=%v", err)
	}
}

func TestRejectNeverTouchesFile(t *testing.T) {
	s, rel, _ := setup(t)
	before := read(t, s, rel)
	p, _ := s.Create("m", rel, "天很黑。", "X", "", nil)
	if _, err := s.Reject(p.ID); err != nil {
		t.Fatal(err)
	}
	if read(t, s, rel) != before {
		t.Fatal("拒絕不得改動稿件")
	}
	if _, err := s.Accept(p.ID, nil); err != ErrNotPending {
		t.Fatalf("已拒絕的提案不可再接受, got %v", err)
	}
	list, _ := s.List()
	if len(list) != 1 || list[0].Status != Rejected {
		t.Fatalf("list = %+v", list)
	}
}

// 快照寫不進去時寧可不套用:沒有回溯點的修改不允許發生(G3)。
func TestAcceptRefusedWhenSnapshotFails(t *testing.T) {
	s, rel, dir := setup(t)
	before := read(t, s, rel)
	p, _ := s.Create("m", rel, "天很黑。", "X", "", nil)
	takeSnapshot = func(*snapshot.Store, string, string, []string) (*snapshot.Meta, error) {
		return nil, errors.New("disk full")
	}
	defer func() { takeSnapshot = (*snapshot.Store).Take }()
	_ = dir
	if _, err := s.Accept(p.ID, nil); err == nil {
		t.Fatal("快照失敗時應拒絕套用")
	}
	if read(t, s, rel) != before {
		t.Fatal("快照失敗時稿件不得被改動")
	}
}

// B4 意圖:作者改過建議文字後接受,寫進稿件的必須是作者的版本(不是 AI 原版),
// 且紀錄能分辨這次有人類修改,之後才能判斷哪些文字是作者的貢獻。
func TestAcceptWithAuthorEdit(t *testing.T) {
	s, rel, dir := setup(t)
	p, _ := s.Create("m", rel, "天很黑。", "夜濃得化不開,像墨一樣。", "why", nil)
	mine := "夜濃得化不開。"
	got, err := s.Accept(p.ID, &mine)
	if err != nil {
		t.Fatal(err)
	}
	if read(t, s, rel) != "小明走進森林。夜濃得化不開。他很害怕。\n" {
		t.Fatalf("應寫入作者編輯後的版本: %q", read(t, s, rel))
	}
	if !got.AuthorEdited || got.Final != mine || got.Replacement != "夜濃得化不開,像墨一樣。" {
		t.Fatalf("提案紀錄應保留 AI 原版並標記作者修改: %+v", got)
	}
	prov, _ := os.ReadFile(filepath.Join(dir, ".perkins", "provenance.jsonl"))
	if !strings.Contains(string(prov), `"authorEdited":true`) {
		t.Errorf("provenance 應記錄 authorEdited: %s", prov)
	}
	// 沒有改動的「編輯」不算作者修改
	p2, _ := s.Create("m", rel, "他很害怕。", "他怕得發抖。", "why", nil)
	same := "他怕得發抖。"
	got2, _ := s.Accept(p2.ID, &same)
	if got2.AuthorEdited {
		t.Error("文字未變不應標記為作者修改")
	}
}
