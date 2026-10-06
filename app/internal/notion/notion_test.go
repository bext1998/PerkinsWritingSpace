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

	res, err := Apply(p, src, map[string]string{"角色": "角色", "": TargetNotes}, nil, bible.Types)
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
	res, err := Apply(p, fixture(t), map[string]string{"角色": TargetSkip}, nil, bible.Types)
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

// 逐頁覆寫:同一資料夾三頁分別匯入為角色/地點/略過,各落在正確位置與 frontmatter 類型。
func TestApplyPerPageOverrides(t *testing.T) {
	src := fixture(t)
	p, _ := project.Create(t.TempDir(), "n")
	// 角色 00000000/... — 從 fixture 取實際 Src
	plan, err := Scan(src)
	if err != nil {
		t.Fatal(err)
	}
	var aliceSrc, rainSrc string
	for _, g := range plan.Groups {
		for _, f := range g.Files {
			switch f.Name {
			case "艾莉絲":
				aliceSrc = f.Src
			case "雷恩":
				rainSrc = f.Src
			}
		}
	}
	if aliceSrc == "" || rainSrc == "" {
		t.Fatalf("fixture 缺頁面: %+v", plan)
	}
	pages := map[string]string{
		aliceSrc: "角色",
		rainSrc:  "地點",
		"世界觀 " + hexID + ".md": TargetSkip,
		"不存在的頁.md":    "角色", // key 不在掃描結果中:忽略,不報錯
	}
	res, err := Apply(p, src, map[string]string{"角色": TargetSkip, "": TargetSkip}, pages, bible.Types)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Created) != 2 {
		t.Fatalf("created=%v", res.Created)
	}
	cAlice, err := p.ReadFile("canon/艾莉絲.md")
	if err != nil {
		t.Fatalf("角色頁應匯入: %v", err)
	}
	e := bible.Parse("canon/艾莉絲.md", cAlice)
	if e.Type != "角色" {
		t.Fatalf("覆寫為角色未生效: %+v", e)
	}
	cRain, err := p.ReadFile("canon/雷恩.md")
	if err != nil {
		t.Fatalf("地點頁應匯入: %v", err)
	}
	if e := bible.Parse("canon/雷恩.md", cRain); e.Type != "地點" {
		t.Fatalf("覆寫為地點未生效: %+v", e)
	}
	if p.Exists("notes/世界觀.md") {
		t.Fatal("略過的頁面不應匯入")
	}
	if _, err := Undo(p, res.ID); err != nil || len(res.Created) != 2 {
		t.Fatalf("undo err=%v", err)
	}
	if p.Exists("canon/艾莉絲.md") || p.Exists("canon/雷恩.md") {
		t.Fatal("撤銷後應移除")
	}
}

// 群組略過、單頁指定類型:只匯入那一頁;群組有類型、單頁略過:其餘照常匯入。
func TestApplyPerPageAgainstGroup(t *testing.T) {
	src := fixture(t)
	plan, _ := Scan(src)
	var aliceSrc string
	for _, g := range plan.Groups {
		for _, f := range g.Files {
			if f.Name == "艾莉絲" {
				aliceSrc = f.Src
			}
		}
	}

	p1, _ := project.Create(t.TempDir(), "n1")
	res, err := Apply(p1, src, map[string]string{"角色": TargetSkip, "": TargetNotes}, map[string]string{aliceSrc: "道具"}, bible.Types)
	if err != nil || len(res.Created) != 2 {
		t.Fatalf("群組略過但單頁指定: created=%v err=%v", res.Created, err)
	}
	c, _ := p1.ReadFile("canon/艾莉絲.md")
	if e := bible.Parse("canon/艾莉絲.md", c); e.Type != "道具" {
		t.Fatalf("單頁覆寫未生效: %+v", e)
	}
	if _, err := p1.ReadFile("canon/雷恩.md"); !os.IsNotExist(err) {
		t.Fatal("群組略過的雷恩不應匯入")
	}
	if n, _ := p1.ReadFile("notes/世界觀.md"); !strings.Contains(n, "魔法以艾莉絲為中心") {
		t.Fatal("未覆寫的最上層頁面應跟隨群組去處")
	}

	p2, _ := project.Create(t.TempDir(), "n2")
	res2, err := Apply(p2, src, map[string]string{"角色": "角色", "": TargetNotes}, map[string]string{aliceSrc: TargetSkip}, bible.Types)
	if err != nil || len(res2.Created) != 2 {
		t.Fatalf("群組有類型但單頁略過: created=%v err=%v", res2.Created, err)
	}
	if _, err := p2.ReadFile("canon/雷恩.md"); err != nil {
		t.Fatal("群組角色的雷恩應照常匯入")
	}
	if p2.Exists("canon/艾莉絲.md") {
		t.Fatal("單頁略過不應匯入")
	}
}

// 意圖:自訂分類(SPEC §12.2)要能作為匯入去處 — targetDir 依呼叫者給的清單驗證,
// 不在清單的值仍然被拒絕(§16-9:Go 端 Target 驗證一併放行自訂分類)。
func TestTargetDirAcceptsCustomCategory(t *testing.T) {
	dir, typ, ok := targetDir("組織", []string{"角色", "組織"})
	if !ok || dir != project.CanonDir || typ != "組織" {
		t.Fatalf("自訂分類應匯入 canon/ 且 type=組織: dir=%q typ=%q ok=%v", dir, typ, ok)
	}
	if _, _, ok := targetDir("亂寫的分類", []string{"角色", "組織"}); ok {
		t.Fatal("不在允許清單的去處要被拒絕")
	}
	// 特殊去處不依賴 types 清單
	if d, _, ok := targetDir(TargetSkip, nil); ok || d != "" {
		t.Fatalf("略過仍應不匯入: d=%q ok=%v", d, ok)
	}
}

// 意圖:實際以自訂分類匯入 — 檔案落在 canon/ 且 frontmatter type 為該自訂分類。
func TestApplyWithCustomCategoryTarget(t *testing.T) {
	p, _ := project.Create(t.TempDir(), "n")
	res, err := Apply(p, fixture(t), map[string]string{"角色": "組織", "": TargetNotes}, nil, []string{"角色", "組織"})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Created) == 0 {
		t.Fatalf("應有匯入檔案: %+v", res)
	}
	c, err := p.ReadFile("canon/艾莉絲.md")
	if err != nil {
		t.Fatal(err)
	}
	if e := bible.Parse("canon/艾莉絲.md", c); e.Type != "組織" {
		t.Fatalf("匯入 type 應為自訂分類「組織」, got %q", e.Type)
	}
}

// 意圖(第二輪 #2 附帶):target 不在可匯入分類清單時不得靜默 continue,
// 要列入略過報告並附原因,作者才知道那頁為何沒匯入。
func TestApplyReportsUnknownTargetInSkipped(t *testing.T) {
	p, _ := project.Create(t.TempDir(), "n")
	res, err := Apply(p, fixture(t), map[string]string{"角色": "不存在的分類", "": TargetSkip}, nil, bible.Types)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Created) != 0 {
		t.Fatalf("不認得的去處不應匯入任何檔案: %v", res.Created)
	}
	hit := false
	for _, s := range res.Skipped {
		if strings.Contains(s, "不存在的分類") && strings.Contains(s, "略過") {
			hit = true
		}
	}
	if !hit {
		t.Fatalf("不認得的去處應列入略過報告並附原因: %v", res.Skipped)
	}
}
