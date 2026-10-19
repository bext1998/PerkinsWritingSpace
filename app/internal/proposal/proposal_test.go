package proposal

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"perkins/internal/project"
	"perkins/internal/research"
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

// 意圖:失敗訊息要告訴模型怎麼修正——先用 read_document 讀該檔確認原文,而不是繼續憑記憶猜。
func TestCreateErrorTellsModelToReadDocumentFirst(t *testing.T) {
	s, rel, _ := setup(t)
	s.Proj.WriteFile(rel, "他笑了。他笑了。\n")
	for _, orig := range []string{"不存在的句子", "他笑了。"} {
		_, err := s.Create("m", rel, orig, "x", "", nil)
		if err == nil || !strings.Contains(err.Error(), "read_document") {
			t.Errorf("original=%q 的錯誤訊息應提示先用 read_document 確認原文: %v", orig, err)
		}
	}
}

// 接受後只替換指定片段,其餘內容(含中文標點與換行)原樣保留,並留下快照與來源記錄。
func TestAcceptAppliesOnlyTargetAndSnapshotsFirst(t *testing.T) {
	s, rel, dir := setup(t)
	before := read(t, s, rel)
	p, _ := s.Create("m", rel, "天很黑。", "夜濃得化不開。", "why", nil)
	got, err := s.Accept(p.ID, 0, nil)
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
	if _, err := s.Accept(p.ID, 0, nil); err != ErrNotPending {
		t.Errorf("重複接受應回 ErrNotPending, got %v", err)
	}
}

// A2 意圖:作者在提案之後改了「提案要改的那段」,舊提案不能把作者新寫的字蓋掉。
func TestAcceptConflictWhenAuthorEditedTheSameText(t *testing.T) {
	s, rel, dir := setup(t)
	p, _ := s.Create("m", rel, "天很黑。", "夜濃得化不開。", "", nil)
	edited := "小明走進森林。天色暗得像墨。他很害怕。\n"
	s.Proj.WriteFile(rel, edited)

	got, err := s.Accept(p.ID, 0, nil)
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

	got, err := s.Accept(p.ID, 0, nil)
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

	got, err := s.Accept(p.ID, 0, nil)
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
	if _, err := s.Accept(p.ID, 0, nil); err != ErrConflict || read(t, s, rel) != edited {
		t.Fatalf("應衝突且不改檔, err=%v", err)
	}
}

func TestRejectNeverTouchesFile(t *testing.T) {
	s, rel, _ := setup(t)
	before := read(t, s, rel)
	p, _ := s.Create("m", rel, "天很黑。", "X", "", nil)
	if _, err := s.Reject(p.ID, "語氣不對"); err != nil {
		t.Fatal(err)
	}
	if read(t, s, rel) != before {
		t.Fatal("拒絕不得改動稿件")
	}
	if _, err := s.Accept(p.ID, 0, nil); err != ErrNotPending {
		t.Fatalf("已拒絕的提案不可再接受, got %v", err)
	}
	list, _ := s.List()
	if len(list) != 1 || list[0].Status != Rejected {
		t.Fatalf("list = %+v", list)
	}
}

// #124 意圖:拒絕理由要存進提案 JSON——重開作品時聊天卡片才顯示得出作者的理由;
// 舊提案 JSON 沒有這個欄位時照常可讀(不能因為欄位新增就打不開舊資料)。
func TestRejectStoresReasonAndOldJSONStillReadable(t *testing.T) {
	s, rel, _ := setup(t)
	p, _ := s.Create("m", rel, "天很黑。", "X", "", nil)
	rj, err := s.Reject(p.ID, "節奏太快")
	if err != nil {
		t.Fatal(err)
	}
	if rj.RejectReason != "節奏太快" {
		t.Fatalf("Reject 應回傳帶理由的提案:%+v", rj)
	}
	onDisk, err := os.ReadFile(filepath.Join(s.dir(), p.ID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(onDisk), `"rejectReason": "節奏太快"`) {
		t.Fatalf("提案 JSON 應存有拒絕理由:%s", onDisk)
	}
	again, err := s.Get(p.ID) // 重開作品時是從磁碟讀的
	if err != nil || again.RejectReason != "節奏太快" || again.Status != Rejected {
		t.Fatalf("重讀應拿到狀態與理由:%+v err=%v", again, err)
	}

	// 舊格式 JSON(手寫一份沒有 rejectReason 的舊提案檔):照常讀得出來
	old, _ := s.Create("m", rel, "他很害怕。", "Y", "", nil)
	legacy := fmt.Sprintf(`{"id":%q,"createdAt":"2026-09-01T10:00:00+08:00","model":"m","target":%q,"original":"他很害怕。","replacement":"Y","rationale":"","assumptions":[],"baseHash":"h","start":0,"end":5,"status":"pending"}`, old.ID, rel)
	if err := os.WriteFile(filepath.Join(s.dir(), old.ID+".json"), []byte(legacy), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(old.ID)
	if err != nil || got.RejectReason != "" || got.Status != Pending {
		t.Fatalf("舊格式 JSON 應照常可讀:%+v err=%v", got, err)
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
	if _, err := s.Accept(p.ID, 0, nil); err == nil {
		t.Fatal("快照失敗時應拒絕套用")
	}
	if read(t, s, rel) != before {
		t.Fatal("快照失敗時稿件不得被改動")
	}
}

// 意圖(#133/G3):稿件已寫入但 provenance 寫不進去時要回錯,且訊息不能讓人誤以為沒寫入。
func TestAcceptReportsProvenanceFailure(t *testing.T) {
	s, rel, dir := setup(t)
	p, err := s.Create("m", rel, "天很黑。", "夜濃得化不開。", "why", nil)
	if err != nil {
		t.Fatal(err)
	}
	// 讓 provenance.jsonl 變成資料夾,寫入必定失敗。
	if err := os.MkdirAll(filepath.Join(dir, ".perkins", "provenance.jsonl"), 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := s.Accept(p.ID, 0, nil)
	// 不回錯:前端要照「已接受」重載稿件,否則作者接著存檔會把舊內容寫回(PR #136 審查)
	if err != nil {
		t.Fatalf("稿件已寫入時不應回錯, got %v", err)
	}
	if !strings.Contains(got.RecordError, "已寫入") || !strings.Contains(got.RecordError, "來源紀錄") {
		t.Fatalf("RecordError 應說明稿件已寫入、來源紀錄失敗, got %q", got.RecordError)
	}
	if got.Status != Accepted {
		t.Fatalf("回傳的提案應是已接受, got %+v", got)
	}
	if read(t, s, rel) != "小明走進森林。夜濃得化不開。他很害怕。\n" {
		t.Fatalf("稿件應已寫入, got %q", read(t, s, rel))
	}
}

// B4 意圖:作者改過建議文字後接受,寫進稿件的必須是作者的版本(不是 AI 原版),
// 且紀錄能分辨這次有人類修改,之後才能判斷哪些文字是作者的貢獻。
func TestAcceptWithAuthorEdit(t *testing.T) {
	s, rel, dir := setup(t)
	p, _ := s.Create("m", rel, "天很黑。", "夜濃得化不開,像墨一樣。", "why", nil)
	mine := "夜濃得化不開。"
	got, err := s.Accept(p.ID, 0, &mine)
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
	got2, _ := s.Accept(p2.ID, 0, &same)
	if got2.AuthorEdited {
		t.Error("文字未變不應標記為作者修改")
	}
}

// #39 意圖:多版本提案(主版本 + 最多 2 個替代版本)要完整保存;舊提案 JSON 沒有版本欄位,
// 照常可讀、可接受(單一版本)。
func TestCreateVersionsSavesAllAndLegacyJSONStaysReadable(t *testing.T) {
	s, rel, dir := setup(t)
	p, err := s.CreateVersions("m", rel, "天很黑。",
		Version{Label: "收斂", Replacement: "夜色沉了下來。"}, "why", nil,
		[]Version{{Label: "更誇張", Replacement: "夜色像墨一樣漫開。"}})
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	vs := got.Versions()
	if len(vs) != 2 || vs[0] != (Version{Label: "收斂", Replacement: "夜色沉了下來。"}) ||
		vs[1] != (Version{Label: "更誇張", Replacement: "夜色像墨一樣漫開。"}) {
		t.Fatalf("Versions() = %+v", vs)
	}
	raw, _ := os.ReadFile(filepath.Join(dir, ".perkins", "proposals", p.ID+".json"))
	if !strings.Contains(string(raw), `"alternatives"`) || !strings.Contains(string(raw), "更誇張") {
		t.Fatalf("保存的 JSON 應含替代版本: %s", raw)
	}

	// 舊提案 JSON(沒有 label/alternatives 欄位):照常可讀、可接受
	content := read(t, s, rel)
	start := strings.Index(content, "天很黑。")
	legacy := fmt.Sprintf(`{"id":"20260101-000000-legacy","createdAt":"2026-01-01T00:00:00+08:00","model":"m","target":%q,"original":"天很黑。","replacement":"夜很黑。","rationale":"","assumptions":[],"baseHash":%q,"start":%d,"end":%d,"status":"pending"}`,
		rel, Hash(content), start, start+len("天很黑。"))
	if err := os.WriteFile(filepath.Join(dir, ".perkins", "proposals", "20260101-000000-legacy.json"), []byte(legacy), 0o644); err != nil {
		t.Fatal(err)
	}
	old, err := s.Get("20260101-000000-legacy")
	if err != nil {
		t.Fatalf("舊提案 JSON 應可讀: %v", err)
	}
	if len(old.Versions()) != 1 || old.Versions()[0].Replacement != "夜很黑。" {
		t.Fatalf("舊提案應視為單一版本: %+v", old.Versions())
	}
	if _, err := s.Accept("20260101-000000-legacy", 1, nil); err == nil {
		t.Fatal("舊提案沒有第 2 個版本,選第 2 個應回錯")
	}
	if _, err := s.Accept("20260101-000000-legacy", 0, nil); err != nil || !strings.Contains(read(t, s, rel), "夜很黑。") {
		t.Fatalf("舊提案接受第 1 個版本應照常寫入: %v", err)
	}
}

// #39 意圖:作者選第 2 個版本,寫入的就是第 2 個版本;Provenance 與研究記錄都記下選了
// 第幾個版本與版本總數;序號超出範圍回錯且不寫檔。編輯以所選版本為底(部分採用)。
func TestAcceptSelectedVersionWritesThatVersion(t *testing.T) {
	s, rel, dir := setup(t)
	mk := func() *Proposal {
		p, err := s.CreateVersions("m", rel, "天很黑。",
			Version{Label: "收斂", Replacement: "夜色沉了下來。"}, "why", nil,
			[]Version{{Label: "更誇張", Replacement: "夜色像墨一樣漫開。"}})
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	p := mk()
	if _, err := s.Accept(p.ID, 5, nil); err == nil {
		t.Fatal("版本序號超出範圍應回錯")
	}
	if got, _ := s.Get(p.ID); got.Status != Pending {
		t.Fatalf("回錯時不得改變狀態: %v", got.Status)
	}
	got, err := s.Accept(p.ID, 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	if read(t, s, rel) != "小明走進森林。夜色像墨一樣漫開。他很害怕。\n" {
		t.Fatalf("應寫入第 2 個版本: %q", read(t, s, rel))
	}
	if got.AcceptedVersion != 1 {
		t.Fatalf("AcceptedVersion = %d, want 1", got.AcceptedVersion)
	}
	prov, _ := os.ReadFile(filepath.Join(dir, ".perkins", "provenance.jsonl"))
	if !strings.Contains(string(prov), `"version":1`) || !strings.Contains(string(prov), `"versions":2`) {
		t.Errorf("provenance 應記錄選了第幾個版本與版本總數: %s", prov)
	}
	if err := s.Proj.SetResearch(true); err != nil {
		t.Fatal(err)
	}
	LogAccept(research.New(s.Proj, "sess"), got)
	res, _ := os.ReadFile(filepath.Join(dir, ".perkins", "research.jsonl"))
	if !strings.Contains(string(res), `"version":1`) || !strings.Contains(string(res), `"versions":2`) {
		t.Errorf("研究記錄 proposal_accept 應記錄版本: %s", res)
	}

	// 作者編輯第 2 個版本:以所選版本為底(部分採用)
	if err := s.Proj.WriteFile(rel, "小明走進森林。天很黑。他很害怕。\n"); err != nil {
		t.Fatal(err)
	}
	p2 := mk()
	mine := "夜色張牙舞爪。"
	got2, err := s.Accept(p2.ID, 1, &mine)
	if err != nil {
		t.Fatal(err)
	}
	if read(t, s, rel) != "小明走進森林。夜色張牙舞爪。他很害怕。\n" || !got2.AuthorEdited ||
		got2.Final != mine || got2.AcceptedVersion != 1 {
		t.Fatalf("編輯第 2 個版本應寫入作者版本並記錄版本: %+v %q", got2, read(t, s, rel))
	}
}

// makeDirLink 建立資料夾連結(Windows 用 junction,不需要管理員;其他平台用符號連結),#132 測試用。
func makeDirLink(t *testing.T, link, target string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput()
		if err != nil {
			t.Fatalf("mklink /J %s: %v: %s", link, err, out)
		}
		return
	}
	if err := os.Symlink(target, link); err != nil {
		t.Fatalf("symlink %s: %v", link, err)
	}
}

// 意圖(#132):Accept 是全系統唯一會因 AI 提案寫入稿件的路徑;目標經過連結時,
// 實際讀寫的可能是作者排除的資料夾或作品外的檔案,讀稿前就要拒絕、不寫入、不改狀態。
func TestAcceptRejectsTargetThroughLink(t *testing.T) {
	s, _, dir := setup(t)
	if err := s.Proj.WriteFile("canon/hidden.md", "秘密內容\n"); err != nil {
		t.Fatal(err)
	}
	makeDirLink(t, filepath.Join(dir, "manuscript", "link"), filepath.Join(dir, "canon"))
	p, err := s.Create("m", "manuscript/link/hidden.md", "秘密內容", "改寫後", "", nil)
	if err != nil {
		t.Fatal(err) // 提案建立本身不寫入;這裡只要能建出「目標經過連結」的提案
	}
	if _, err := s.Accept(p.ID, 0, nil); !errors.Is(err, project.ErrLinkPath) {
		t.Fatalf("Accept 應拒絕經過連結的目標: %v", err)
	}
	b, err := os.ReadFile(filepath.Join(dir, "canon", "hidden.md"))
	if err != nil || string(b) != "秘密內容\n" {
		t.Fatalf("目標檔案不得被改動: %q %v", b, err)
	}
	if q, err := s.Get(p.ID); err != nil || q.Status != Pending {
		t.Fatalf("失敗的 Accept 不得改變提案狀態: %+v %v", q, err)
	}
}
