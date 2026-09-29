package project

import (
	"crypto/sha256"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func hashFile(t *testing.T, path string) [32]byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return sha256.Sum256(b)
}

// 意圖:路徑跳脫會讓編輯器/AI 碰到專案外或非稿件檔案(例如 perkins.json、.perkins/ 內的審計紀錄)。
func TestResolveRejectsEscapesAndNonManuscriptPaths(t *testing.T) {
	p := &Project{Root: t.TempDir()}
	bad := []string{
		"", "../x.md", "manuscript/../perkins.json", "manuscript/../../x.md",
		"/etc/passwd.md", "C:/x.md", "perkins.json", ".perkins/audit.jsonl",
		"manuscript", "manuscript/a.txt", "other/a.md", "manuscript//a.md",
	}
	for _, r := range bad {
		if _, err := p.resolve(r); err == nil {
			t.Errorf("應拒絕路徑 %q", r)
		}
	}
	for _, r := range []string{"manuscript/01.md", "canon/characters.md", "manuscript/卷一/序章.md", "outline/全書.md", "notes/n.md", "summaries/01.md"} {
		if _, err := p.resolve(r); err != nil {
			t.Errorf("應允許路徑 %q: %v", r, err)
		}
	}
}

// 意圖:排序是作者的結構決定,不可因檔案增減而遺失或被靜默改寫(SPEC §10)。
func TestResolveOrder(t *testing.T) {
	files := []string{"manuscript/a.md", "manuscript/b.md", "manuscript/c.md"}
	got, warns := ResolveOrder([]string{"manuscript/c.md", "manuscript/gone.md", "manuscript/a.md"}, files)
	want := []string{"manuscript/c.md", "manuscript/a.md", "manuscript/b.md"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("順序 = %v, want %v", got, want)
	}
	if len(warns) != 2 {
		t.Fatalf("應有 2 則警告(不存在 + 未列入),got %v", warns)
	}
}

// 意圖:拖曳排序只能改 perkins.json,不能動稿件內容,否則快照/歷史會失效。
func TestSetOrderDoesNotTouchManuscripts(t *testing.T) {
	dir := t.TempDir()
	p, err := Create(dir, "novel")
	if err != nil {
		t.Fatal(err)
	}
	r1, _ := p.NewChapter("第一章", 0)
	r2, _ := p.NewChapter("第二章", 0)
	before1, before2 := hashFile(t, filepath.Join(dir, r1)), hashFile(t, filepath.Join(dir, r2))

	if err := p.SetOrder([]string{r2, r1}); err != nil {
		t.Fatal(err)
	}
	if hashFile(t, filepath.Join(dir, r1)) != before1 || hashFile(t, filepath.Join(dir, r2)) != before2 {
		t.Fatal("排序不應改動稿件檔案")
	}
	reopened, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	tree, _ := reopened.Tree()
	if tree.Manuscript[0].Path != r2 || tree.Manuscript[1].Path != r1 {
		t.Fatalf("重開後順序遺失: %+v", tree.Manuscript)
	}
	if err := p.SetOrder([]string{"canon/characters.md"}); err == nil {
		t.Fatal("order 只應接受 manuscript 檔案")
	}
}

// 意圖:誤選到既有專案資料夾建立時,不能覆蓋作者的設定與順序。
func TestCreateRefusesExistingProject(t *testing.T) {
	dir := t.TempDir()
	if _, err := Create(dir, "a"); err != nil {
		t.Fatal(err)
	}
	if _, err := Create(dir, "b"); err != ErrProjectHere {
		t.Fatalf("應回 ErrProjectHere, got %v", err)
	}
}

func TestOpenNonProject(t *testing.T) {
	if _, err := Open(t.TempDir()); err != ErrNotProject {
		t.Fatalf("got %v", err)
	}
}

// 意圖:章節不可覆蓋既有檔案,避免新增章節時毀掉已寫的內容。
func TestNewChapterNeverOverwrites(t *testing.T) {
	p, _ := Create(t.TempDir(), "n")
	rel, _ := p.NewChapter("序章", 0)
	if err := p.WriteFile(rel, "已寫的內容"); err != nil {
		t.Fatal(err)
	}
	if _, err := p.NewChapter("序章", 0); err == nil {
		t.Fatal("同名章節應被拒絕")
	}
	got, _ := p.ReadFile(rel)
	if got != "已寫的內容" {
		t.Fatalf("內容被覆蓋: %q", got)
	}
}

func TestWriteReadRoundTripChinese(t *testing.T) {
	p, _ := Create(t.TempDir(), "n")
	rel, _ := p.NewChapter("第一章", 0)
	text := "夜色沉下來。「你來了。」她說。\n"
	if err := p.WriteFile(rel, text); err != nil {
		t.Fatal(err)
	}
	if got, _ := p.ReadFile(rel); got != text {
		t.Fatalf("got %q", got)
	}
}

// 設定檔同樣不可覆蓋既有內容,且不應混入章節排序。
func TestNewCanonNeverOverwritesAndStaysOutOfOrder(t *testing.T) {
	p, _ := Create(t.TempDir(), "n")
	rel, err := p.NewCanon("角色")
	if err != nil || rel != "canon/角色.md" {
		t.Fatalf("rel=%q err=%v", rel, err)
	}
	p.WriteFile(rel, "既有設定")
	if _, err := p.NewCanon("角色"); err == nil {
		t.Fatal("同名設定檔應被拒絕")
	}
	if got, _ := p.ReadFile(rel); got != "既有設定" {
		t.Fatal("內容被覆蓋")
	}
	if len(p.Config.Volumes[0].Chapters) != 0 {
		t.Fatalf("設定檔不應進入章節順序: %v", p.Config.Volumes)
	}
}

// 意圖(B1):舊版只有 order 的專案,升級後章節順序必須原樣保留,且開啟本身不改寫 perkins.json。
func TestLegacyOrderBecomesSingleVolume(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "manuscript"), 0o755)
	os.WriteFile(filepath.Join(dir, "manuscript", "a.md"), []byte("a"), 0o644)
	os.WriteFile(filepath.Join(dir, "manuscript", "b.md"), []byte("b"), 0o644)
	cfg := []byte(`{"name":"舊","order":["manuscript/b.md","manuscript/a.md"]}`)
	os.WriteFile(filepath.Join(dir, "perkins.json"), cfg, 0o644)
	before := hashFile(t, filepath.Join(dir, "perkins.json"))

	p, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	tree, _ := p.Tree()
	if len(tree.Volumes) != 1 || len(tree.Volumes[0].Chapters) != 2 ||
		tree.Volumes[0].Chapters[0].Path != "manuscript/b.md" {
		t.Fatalf("舊順序遺失: %+v", tree.Volumes)
	}
	if hashFile(t, filepath.Join(dir, "perkins.json")) != before {
		t.Fatal("只是開啟不應改寫 perkins.json")
	}
}

// 意圖(B1):卷的調整只改 perkins.json;同一章不能同時在兩卷(否則之後排序/匯出會重複輸出)。
func TestSetVolumesKeepsFilesAndRejectsDuplicates(t *testing.T) {
	dir := t.TempDir()
	p, _ := Create(dir, "n")
	r1, _ := p.NewChapter("一", 0)
	r2, _ := p.NewChapter("二", 0)
	h1, h2 := hashFile(t, filepath.Join(dir, r1)), hashFile(t, filepath.Join(dir, r2))
	if err := p.SetVolumes([]Volume{{Title: "上", Chapters: []string{r2}}, {Title: "下", Chapters: []string{r1}}}); err != nil {
		t.Fatal(err)
	}
	if hashFile(t, filepath.Join(dir, r1)) != h1 || hashFile(t, filepath.Join(dir, r2)) != h2 {
		t.Fatal("調整卷不應改動稿件")
	}
	q, _ := Open(dir)
	tree, _ := q.Tree()
	if tree.Volumes[1].Title != "下" || tree.Volumes[1].Chapters[0].Path != r1 || tree.Manuscript[0].Path != r2 {
		t.Fatalf("重開後卷結構錯誤: %+v", tree.Volumes)
	}
	if err := p.SetVolumes([]Volume{{Chapters: []string{r1}}, {Chapters: []string{r1}}}); err == nil {
		t.Fatal("同一章出現在兩卷應被拒絕")
	}
	if err := p.SetVolumes([]Volume{{Chapters: []string{"notes/x.md"}}}); err == nil {
		t.Fatal("卷只應接受 manuscript 檔案")
	}
}

// 意圖:新章節要進入作者指定的卷,而不是永遠丟到第一卷。
func TestNewChapterGoesToChosenVolume(t *testing.T) {
	p, _ := Create(t.TempDir(), "n")
	p.SetVolumes([]Volume{{Title: "一"}, {Title: "二"}})
	rel, err := p.NewChapter("新章", 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Config.Volumes[1].Chapters) != 1 || p.Config.Volumes[1].Chapters[0] != rel {
		t.Fatalf("章節未加入第二卷: %+v", p.Config.Volumes)
	}
}

func TestParseScenesIgnoresCodeFences(t *testing.T) {
	text := "# 第一章\n\n## 夜襲\n文字\n```\n## 不是場景\n```\n## 黎明\n"
	got := ParseScenes(text)
	if len(got) != 2 || got[0].Title != "夜襲" || got[0].Line != 3 || got[1].Title != "黎明" {
		t.Fatalf("got %+v", got)
	}
}

// 意圖:刪除是可回復的——檔案仍在 .perkins/trash,只從結構中移除。
func TestTrashKeepsFileRecoverable(t *testing.T) {
	dir := t.TempDir()
	p, _ := Create(dir, "n")
	rel, _ := p.NewChapter("廢稿", 0)
	p.WriteFile(rel, "捨不得丟的字")
	p.SetStatus(rel, StatusDone)
	if err := p.Trash(rel, "t1"); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(dir, ".perkins", "trash", "t1", "manuscript", "廢稿.md"))
	if err != nil || string(b) != "捨不得丟的字" {
		t.Fatalf("回收區內容不對: %q %v", b, err)
	}
	if p.Exists(rel) || len(p.Config.Volumes[0].Chapters) != 0 || p.Config.Status[rel] != "" {
		t.Fatal("應從結構與狀態中移除")
	}
}

func TestNewDocOnlyInDocDirs(t *testing.T) {
	p, _ := Create(t.TempDir(), "n")
	for _, d := range []string{CanonDir, OutlineDir, NotesDir} {
		if _, err := p.NewDoc(d, "x", ""); err != nil {
			t.Errorf("%s: %v", d, err)
		}
	}
	for _, d := range []string{ManuscriptDir, SummariesDir, ".perkins"} {
		if _, err := p.NewDoc(d, "y", ""); err == nil {
			t.Errorf("NewDoc 不應允許 %s", d)
		}
	}
}
