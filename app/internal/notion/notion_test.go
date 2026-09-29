package notion

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/bible"
	"perkins/internal/project"
)

const hexID = "0123456789abcdef0123456789abcdef"

// 模擬 Notion 匯出:資料庫「角色」下兩頁、最上層一頁世界觀、一張圖片。
func fixture(t *testing.T) string {
	dir := t.TempDir()
	w := func(rel, content string) {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		os.MkdirAll(filepath.Dir(p), 0o755)
		os.WriteFile(p, []byte(content), 0o644)
	}
	w("世界觀 "+hexID+".md", "# 世界觀\n\n魔法以[艾莉絲](%E8%A7%92%E8%89%B2%20"+hexID+"/%E8%89%BE%E8%8E%89%E7%B5%B2%20"+hexID+".md)為中心。\n")
	w("角色 "+hexID+"/艾莉絲 "+hexID+".md", "# 艾莉絲\n\n年齡: 17\n陣營: 王國\n\n口癖是「才不是呢」。\n![](艾莉絲/pic.png)\n")
	w("角色 "+hexID+"/雷恩 "+hexID+".md", "# 雷恩\n\n隊長。\n")
	w("角色 "+hexID+"/艾莉絲/pic.png", "PNG")
	w("角色 "+hexID+".csv", "Name,年齡\n艾莉絲,17\n")
	return dir
}

func TestScanGroupsAndCleansNames(t *testing.T) {
	plan, err := Scan(fixture(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 2 || plan.Groups[0].Key != "" || plan.Groups[1].Key != "角色" {
		t.Fatalf("分組錯誤: %+v", plan.Groups)
	}
	names := []string{plan.Groups[1].Files[0].Name, plan.Groups[1].Files[1].Name}
	if names[0] != "艾莉絲" || names[1] != "雷恩" {
		t.Fatalf("名稱應去除 Notion id: %v", names)
	}
	if plan.Images != 1 {
		t.Fatalf("應告知圖片數: %d", plan.Images)
	}
}

func TestConvertLinksAndProperties(t *testing.T) {
	got := Convert("# 艾莉絲\n\n年齡: 17\n陣營: 王國\n\n見[雷恩](%E9%9B%B7%E6%81%A9%20" + hexID + ".md)。\n![](x.png)\n")
	want := "# 艾莉絲\n\n- 年齡:17\n- 陣營:王國\n\n見雷恩。"
	if strings.TrimSpace(got) != want {
		t.Fatalf("got\n%q\nwant\n%q", got, want)
	}
}

// B9 意圖:匯入絕不覆蓋作者已有的設定;要能整批撤銷,且撤銷不是刪除(檔案還在回收區)。
func TestApplyNeverOverwritesAndCanUndo(t *testing.T) {
	src := fixture(t)
	dir := t.TempDir()
	p, _ := project.Create(dir, "n")
	p.WriteFile("canon/雷恩.md", "作者原本寫的雷恩")

	res, err := Apply(p, src, map[string]string{"角色": "角色", "": TargetNotes})
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := p.ReadFile("canon/雷恩.md"); got != "作者原本寫的雷恩" {
		t.Fatal("既有檔案被覆蓋")
	}
	if len(res.Skipped) != 1 || !strings.Contains(res.Skipped[0], "未覆蓋") {
		t.Fatalf("同名應列入略過: %v", res.Skipped)
	}
	c, err := p.ReadFile("canon/艾莉絲.md")
	if err != nil {
		t.Fatal(err)
	}
	e := bible.Parse("canon/艾莉絲.md", c)
	if e.Type != "角色" || e.Name != "艾莉絲" || !strings.Contains(c, "- 年齡:17") || !strings.Contains(c, "才不是呢") {
		t.Fatalf("匯入內容錯誤: %+v\n%s", e, c)
	}
	if n, _ := p.ReadFile("notes/世界觀.md"); !strings.Contains(n, "魔法以艾莉絲為中心") {
		t.Fatalf("最上層頁面應匯入為筆記且連結轉純文字: %q", n)
	}

	moved, err := Undo(p, res.ID)
	if err != nil || len(moved) != 2 {
		t.Fatalf("moved=%v err=%v", moved, err)
	}
	if p.Exists("canon/艾莉絲.md") || p.Exists("notes/世界觀.md") {
		t.Fatal("撤銷後匯入的檔案應移除")
	}
	if got, _ := p.ReadFile("canon/雷恩.md"); got != "作者原本寫的雷恩" {
		t.Fatal("撤銷不應動到作者原有的檔案")
	}
	if _, err := os.Stat(filepath.Join(dir, ".perkins", "trash", "import-"+res.ID, "canon", "艾莉絲.md")); err != nil {
		t.Fatal("撤銷的檔案應在回收區")
	}
}

func TestSkipTargetImportsNothing(t *testing.T) {
	p, _ := project.Create(t.TempDir(), "n")
	res, err := Apply(p, fixture(t), map[string]string{"角色": TargetSkip})
	if err != nil || len(res.Created) != 0 {
		t.Fatalf("created=%v err=%v", res.Created, err)
	}
}

// Notion 大型匯出:外層 zip 內含 Part-1.zip。
func TestNestedZip(t *testing.T) {
	var inner bytes.Buffer
	zw := zip.NewWriter(&inner)
	f, _ := zw.Create("角色 " + hexID + "/艾莉絲 " + hexID + ".md")
	f.Write([]byte("# 艾莉絲\n"))
	zw.Close()
	var outer bytes.Buffer
	zo := zip.NewWriter(&outer)
	g, _ := zo.Create("Export-Part-1.zip")
	g.Write(inner.Bytes())
	zo.Close()
	zp := filepath.Join(t.TempDir(), "export.zip")
	os.WriteFile(zp, outer.Bytes(), 0o644)
	plan, err := Scan(zp)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Groups) != 1 || plan.Groups[0].Key != "角色" || plan.Groups[0].Files[0].Name != "艾莉絲" {
		t.Fatalf("巢狀 zip 解析錯誤: %+v", plan.Groups)
	}
}
