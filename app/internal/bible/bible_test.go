package bible

import (
	"crypto/sha256"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"perkins/internal/project"
)

// 意圖:設定檔就是純 Markdown,沒有 frontmatter 也要能用,名稱 = 檔名。
func TestParseWithoutFrontmatterFallsBack(t *testing.T) {
	e := Parse("canon/艾莉絲.md", "# 艾莉絲\n十七歲")
	if e.Name != "艾莉絲" || len(e.Aliases) != 0 {
		t.Fatalf("got %+v", e)
	}
}

// 意圖:舊檔 frontmatter 的 name/aliases 照常讀取(type 等其他欄位不再使用,也不影響讀取)。
func TestParseFrontmatter(t *testing.T) {
	c := "---\ntype: 角色\nname: 艾莉絲\naliases: [艾莉, 小艾]\nage: 17\n---\n\n# 艾莉絲\n"
	e := Parse("canon/a.md", c)
	if e.Name != "艾莉絲" || !reflect.DeepEqual(e.Aliases, []string{"艾莉", "小艾"}) {
		t.Fatalf("got %+v", e)
	}
	e2 := Parse("canon/b.md", "---\nname: 雷恩\naliases: 雷、隊長\n---\n")
	if !reflect.DeepEqual(e2.Aliases, []string{"雷", "隊長"}) {
		t.Fatalf("字串別名應可用頓號分隔: %+v", e2.Aliases)
	}
}

// 意圖:Perkins 只改別名;作者寫在 frontmatter 的其他欄位(含舊的 type、name)與本文一個字都不能掉。
func TestSetAliasesPreservesOtherFieldsAndBody(t *testing.T) {
	c := "---\ntype: 其他\nname: 舊名\nage: 17\nnote: 保留我\n---\n# 本文\n口癖:「才不是呢」\n"
	out, err := SetAliases(c, []string{"艾莉", " "})
	if err != nil {
		t.Fatal(err)
	}
	if e := Parse("canon/x.md", out); e.Name != "舊名" || !reflect.DeepEqual(e.Aliases, []string{"艾莉"}) {
		t.Fatalf("別名未更新: %+v \n%s", e, out)
	}
	for _, k := range []string{"type: 其他", "name: 舊名", "age: 17", "note: 保留我"} {
		if !strings.Contains(out, k) {
			t.Fatalf("其他欄位遺失 %q:\n%s", k, out)
		}
	}
	if _, body := SplitFrontmatter(out); body != "# 本文\n口癖:「才不是呢」\n" {
		t.Fatalf("本文被改動: %q", body)
	}
	// 清空別名:只移除 aliases,其他欄位照留
	out2, err := SetAliases(out, nil)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out2, "aliases") || !strings.Contains(out2, "note: 保留我") || !strings.Contains(out2, "type: 其他") {
		t.Fatalf("清空別名應只移除 aliases:\n%s", out2)
	}
}

// 意圖(SPEC §12.2):純 Markdown 設定檔加別名只多一行 aliases;清空別名就回到原本的純 Markdown,不留痕跡。
func TestSetAliasesOnPlainFileRoundTrips(t *testing.T) {
	plain := "# 艾莉絲\n十七歲。\n"
	if out, _ := SetAliases(plain, nil); out != plain {
		t.Fatalf("沒有別名時不應加 frontmatter: %q", out)
	}
	out, err := SetAliases(plain, []string{"艾莉"})
	if err != nil {
		t.Fatal(err)
	}
	if y, _ := SplitFrontmatter(out); strings.TrimSpace(y) != "aliases: [艾莉]" {
		t.Fatalf("frontmatter 應只有 aliases: %q", y)
	}
	if back, _ := SetAliases(out, nil); back != plain {
		t.Fatalf("清空別名應回到原本內容: %q", back)
	}
}

// 意圖:frontmatter 沒有結尾時不能把整份設定當成 YAML 吃掉。
func TestUnterminatedFrontmatterIsBody(t *testing.T) {
	y, body := SplitFrontmatter("---\n這其實是分隔線\n內容")
	if y != "" || body != "---\n這其實是分隔線\n內容" {
		t.Fatalf("y=%q body=%q", y, body)
	}
}

// 意圖(SPEC §12.2):新設定只有標題,不預設欄位、不寫 frontmatter。
func TestTemplate(t *testing.T) {
	if c := Template(" 艾莉絲 "); c != "# 艾莉絲\n" {
		t.Fatalf("got %q", c)
	}
}

var ents = []Entity{
	{Path: "canon/艾莉絲.md", Name: "艾莉絲", Aliases: []string{"艾莉"}},
	{Path: "canon/雷恩.md", Name: "雷恩"},
	{Path: "canon/王都.md", Name: "王都艾爾文"},
}

// 意圖:長名稱與其別名重疊時只算一次,否則登場次數會灌水,誤導作者判斷角色戲份。
func TestMentionsLongestMatchCountsOnce(t *testing.T) {
	m := newMatcher(ents)
	got := m.count("艾莉絲說。艾莉笑了。雷恩點頭。艾莉絲與雷恩前往王都艾爾文。")
	if got["canon/艾莉絲.md"] != 3 || got["canon/雷恩.md"] != 2 || got["canon/王都.md"] != 1 {
		t.Fatalf("got %v", got)
	}
	if s := Mentions(ents, "雷恩看著艾莉。"); len(s) != 2 {
		t.Fatalf("got %v", s)
	}
}

// 意圖:稿件沒有提到任何設定時,Mentions 必須是空陣列而非 nil。Wails 會把 nil 序列化成 null,
// 前端對它呼叫 .filter 會拋錯,整個 React 樹卸載(視窗全白)。
func TestMentionsEmptyIsNotNil(t *testing.T) {
	got := Mentions(ents, "完全沒有提到任何設定的一段話。")
	if got == nil {
		t.Fatal("沒有命中時應回傳空陣列,不可為 nil")
	}
	if b, _ := json.Marshal(got); string(b) != "[]" {
		t.Fatalf("序列化應為 [],got %s", b)
	}
}

// 意圖(B3):寫法檢查要抓出只差一字的錯寫,但不能把別名、其他角色或作者已忽略的寫法當成錯字。
func TestFindVariants(t *testing.T) {
	chapters := map[string]string{
		"manuscript/1.md": "艾莉絲走進來。艾麗絲坐下。艾莉說話了。",
		"manuscript/2.md": "艾麗絲又出現。王都艾爾丈很遠。艾莉絲!",
	}
	read := func(p string) (string, error) { return chapters[p], nil }
	got := FindVariants(ents, []string{"manuscript/1.md", "manuscript/2.md"}, read, nil)
	byVar := map[string]Variant{}
	for _, v := range got {
		byVar[v.Variant] = v
	}
	if v, ok := byVar["艾麗絲"]; !ok || v.Count != 2 || v.Chapter != "manuscript/1.md" || v.Known != "艾莉絲" {
		t.Fatalf("應抓到艾麗絲 ×2: %+v", got)
	}
	if _, ok := byVar["王都艾爾丈"]; !ok {
		t.Fatalf("應抓到王都艾爾丈: %+v", got)
	}
	for w := range byVar {
		if strings.Contains(w, "艾莉") {
			t.Fatalf("包含已知別名的寫法不應回報: %q", w)
		}
	}
	got2 := FindVariants(ents, []string{"manuscript/1.md", "manuscript/2.md"}, read, map[string]bool{"艾麗絲": true})
	for _, v := range got2 {
		if v.Variant == "艾麗絲" {
			t.Fatal("作者忽略的寫法不應再回報")
		}
	}
}

// 意圖(B3):建立索引只讀檔案,不改任何稿件或設定。
func TestBuildIndexReadOnly(t *testing.T) {
	dir := t.TempDir()
	p, _ := project.Create(dir, "n")
	c1, _ := p.NewChapter("一", 0)
	c2, _ := p.NewChapter("二", 0)
	p.WriteFile(c1, "艾莉絲出場。")
	p.WriteFile(c2, "雷恩和艾莉。艾莉絲。")
	aliased, _ := SetAliases(Template("艾莉絲"), []string{"艾莉"})
	p.WriteFile("canon/艾莉絲.md", aliased)
	p.WriteFile("canon/雷恩.md", "# 雷恩\n")

	sum := func() [32]byte {
		h := sha256.New()
		for _, f := range []string{c1, c2, "canon/艾莉絲.md", "canon/雷恩.md"} {
			b, _ := os.ReadFile(filepath.Join(dir, filepath.FromSlash(f)))
			h.Write(b)
		}
		var out [32]byte
		copy(out[:], h.Sum(nil))
		return out
	}
	before := sum()
	idx, err := BuildIndex(p)
	if err != nil {
		t.Fatal(err)
	}
	if sum() != before {
		t.Fatal("建立索引不應修改檔案")
	}
	ap := idx.Appearances["canon/艾莉絲.md"]
	if len(ap) != 2 || ap[0].Path != c1 || ap[1].Count != 2 {
		t.Fatalf("艾莉絲登場錯誤: %+v", ap)
	}
	if bc := idx.ByChapter[c2]; len(bc) != 2 || bc[0].Path != "canon/艾莉絲.md" {
		t.Fatalf("第二章登場錯誤: %+v", bc)
	}
}
