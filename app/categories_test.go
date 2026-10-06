package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/bible"
	"perkins/internal/project"
)

// newCatApp 建一個帶暫存專案的 App(自訂分類測試用,SPEC §12.2)。
func newCatApp(t *testing.T) *App {
	t.Helper()
	p, err := project.Create(t.TempDir(), "n")
	if err != nil {
		t.Fatal(err)
	}
	a := NewApp()
	a.proj = p
	return a
}

// 意圖:新增自訂分類要去空白、清單=內建+自訂,且落在作品內 .perkins/categories.json 跟著作品走。
func TestAddCategoryAndList(t *testing.T) {
	a := newCatApp(t)
	for _, b := range bible.Types {
		if !contains(a.EntityTypes(), b) {
			t.Fatalf("清單應含內建分類 %q: %v", b, a.EntityTypes())
		}
	}
	list, err := a.AddCategory("  組織  ")
	if err != nil {
		t.Fatal(err)
	}
	if !contains(list, "組織") || strings.TrimSpace(list[len(list)-1]) != "組織" {
		t.Fatalf("新增後清單應含去空白的「組織」: %v", list)
	}
	// 換一個 App 實例(重新讀檔)仍在:存作品內
	b := NewApp()
	b.proj = a.proj
	if !contains(b.EntityTypes(), "組織") {
		t.Fatal("重新載入後自訂分類應仍在(.perkins/categories.json 隨作品)")
	}
	// .perkins/ 不走專案檔案 API(設計如此),以絕對路徑驗證落盤內容
	raw, err := os.ReadFile(filepath.Join(a.proj.Root, ".perkins", "categories.json"))
	if err != nil || !strings.Contains(string(raw), "組織") {
		t.Fatalf("分類清單應存 .perkins/categories.json: %q err=%v", raw, err)
	}
}

// 意圖:空名稱、與既有分類重複、與匯入去處(大綱/筆記/略過)重複、含路徑字元都要拒絕。
func TestAddCategoryRejectsInvalidNames(t *testing.T) {
	a := newCatApp(t)
	cases := []struct{ in, why string }{
		{"", "空字串"},
		{"   ", "全是空白"},
		{"角色", "與內建分類重複"},
		{"大綱", "與匯入去處重複"},
		{"筆記", "與匯入去處重複"},
		{"略過", "與匯入去處重複"},
		{"a/b", "含斜線"},
		{`a\b`, "含反斜線"},
		{"a:b", "含冒號"},
	}
	for _, c := range cases {
		if _, err := a.AddCategory(c.in); err == nil {
			t.Errorf("AddCategory(%q)(%s) 應被拒絕", c.in, c.why)
		}
	}
	// 自訂分類之後也不可重複
	if _, err := a.AddCategory("組織"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.AddCategory("組織"); err == nil {
		t.Error("與自訂分類重複應被拒絕")
	}
	if _, err := a.AddCategory(" 組織 "); err == nil {
		t.Error("去空白後與自訂分類重複也應被拒絕")
	}
	if contains(a.EntityTypes(), "大綱") {
		t.Fatal("拒絕的分類不應進入清單")
	}
}

// 意圖:內建分類不可刪(G3/規格),刪除不存在或非自訂的名稱要報錯。
func TestDeleteCategoryRefusesBuiltIn(t *testing.T) {
	a := newCatApp(t)
	if _, err := a.DeleteCategory("角色"); err == nil {
		t.Error("內建分類不可刪除")
	}
	if _, err := a.DeleteCategory("大綱"); err == nil {
		t.Error("非自訂分類不可刪除")
	}
	if _, err := a.DeleteCategory("沒這個分類"); err == nil {
		t.Error("不存在的分類應報錯")
	}
	if !contains(a.EntityTypes(), "角色") {
		t.Fatal("拒絕刪除後內建分類仍在")
	}
}

// 意圖:刪除仍有設定檔的自訂分類 → 先自動快照(G3)→ 檔案 type 改「其他」,
// name/aliases/本文與其他 frontmatter 欄位都不動,檔案不刪。
func TestDeleteCategoryWithFilesSnapshotsAndRetags(t *testing.T) {
	a := newCatApp(t)
	orig := "---\ntype: 組織\nname: 天網\naliases:\n  - 網\nnote: 保留我\n---\n\n# 天網\n\n內文要一字不動。\n"
	if err := a.proj.WriteFile("canon/天網.md", orig); err != nil {
		t.Fatal(err)
	}
	if _, err := a.AddCategory("組織"); err != nil {
		t.Fatal(err)
	}
	n, err := a.DeleteCategory("組織")
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("應回報 1 個設定檔被改歸, got %d", n)
	}
	// 快照:理由為刪除分類前,包含該檔案
	snaps, err := a.ListSnapshots()
	if err != nil || len(snaps) == 0 {
		t.Fatalf("刪除應先建立快照: err=%v len=%d", err, len(snaps))
	}
	found := false
	for _, m := range snaps {
		if m.Reason == "before-delete-category" && contains(m.Files, "canon/天網.md") {
			found = true
		}
	}
	if !found {
		t.Fatalf("應有 reason=before-delete-category 且含 canon/天網.md 的快照: %+v", snaps[0])
	}
	// 檔案:type 其他,其餘不變
	got, err := a.proj.ReadFile("canon/天網.md")
	if err != nil {
		t.Fatal(err)
	}
	e := bible.Parse("canon/天網.md", got)
	if e.Type != bible.TypeOther {
		t.Fatalf("type 應改為其他, got %q", e.Type)
	}
	if e.Name != "天網" || !contains(e.Aliases, "網") {
		t.Fatalf("name/aliases 應保留: %+v", e)
	}
	_, origBody := bible.SplitFrontmatter(orig)
	_, gotBody := bible.SplitFrontmatter(got)
	if origBody != gotBody {
		t.Fatalf("本文應一字不動:\n---orig---\n%q\n---got---\n%q", origBody, gotBody)
	}
	if !strings.Contains(strings.Split(got, "---\n")[1], "note: 保留我") {
		t.Fatalf("其他 frontmatter 欄位應保留: %s", got)
	}
	if a.proj.Exists("canon/天網.md") != true {
		t.Fatal("設定檔本身不刪")
	}
	if contains(a.EntityTypes(), "組織") {
		t.Fatal("刪除後自訂分類應從清單移除")
	}
}

// 意圖:沒有設定檔的分類直接刪,不需要快照(沒有檔案要保護)。
func TestDeleteCategoryWithoutFiles(t *testing.T) {
	a := newCatApp(t)
	if _, err := a.AddCategory("交通工具"); err != nil {
		t.Fatal(err)
	}
	before, _ := a.ListSnapshots()
	n, err := a.DeleteCategory("交通工具")
	if err != nil || n != 0 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	after, _ := a.ListSnapshots()
	if len(after) != len(before) {
		t.Fatal("沒有設定檔時不應建立快照")
	}
	if contains(a.EntityTypes(), "交通工具") {
		t.Fatal("刪除後應從清單移除")
	}
}

// CategoryUsage 要能算出自訂分類底下的設定檔數(確認對話框的數字來源)。
func TestCategoryUsageCountsOnlyMatchingType(t *testing.T) {
	a := newCatApp(t)
	if err := a.proj.WriteFile("canon/天網.md", "---\ntype: 組織\nname: 天網\n---\n\n# 天網\n"); err != nil {
		t.Fatal(err)
	}
	if err := a.proj.WriteFile("canon/別的.md", "---\ntype: 角色\nname: 別的\n---\n\n# 別的\n"); err != nil {
		t.Fatal(err)
	}
	if n, err := a.CategoryUsage("組織"); err != nil || n != 1 {
		t.Fatalf("組織 n=%d err=%v, want 1", n, err)
	}
	if n, err := a.CategoryUsage("角色"); err != nil || n != 1 {
		t.Fatalf("角色 n=%d err=%v, want 1", n, err)
	}
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
