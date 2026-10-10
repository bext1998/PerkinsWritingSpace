package health

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/project"
	"perkins/internal/summary"
)

// newProject 建一個暫存作品;回傳的 write 會自動建資料夾。
func newProject(t *testing.T) (*project.Project, func(rel, text string)) {
	t.Helper()
	dir := t.TempDir()
	if _, err := project.Create(dir, "測試"); err != nil {
		t.Fatal(err)
	}
	p, err := project.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	write := func(rel, text string) {
		t.Helper()
		abs := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(abs, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return p, write
}

func run(t *testing.T, p *project.Project) Report {
	t.Helper()
	rep, err := Check(p)
	if err != nil {
		t.Fatal(err)
	}
	return rep
}

// paths 回傳某一類問題的檔案路徑(已依排序),方便與期望值逐字比對。
func paths(rep Report, check string) []string {
	var out []string
	for _, is := range rep.Issues {
		if is.Check == check {
			out = append(out, is.Path)
		}
	}
	return out
}

func wantPaths(t *testing.T, rep Report, check string, want ...string) {
	t.Helper()
	got := paths(rep, check)
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("%s 回報 %v,want %v", check, got, want)
	}
}

// 意圖:frontmatter 解析失敗時 bible.Parse 會靜默退回「其他/檔名」,作者看不到資料壞掉;
// 這一類要把壞掉的檔案與錯誤訊息指出來,同時不誤報沒有 frontmatter、合法 frontmatter
// 與沒有結尾 --- 的檔案(SplitFrontmatter 把後者視為沒有 frontmatter)。
func TestFrontmatterParseErrorReported(t *testing.T) {
	p, write := newProject(t)
	write("canon/壞.md", "---\ntype: 角色\nname: [未關閉\n---\n\n# 壞\n")
	write("canon/好.md", "---\ntype: 角色\nname: 好\naliases: []\n---\n\n# 好\n")
	write("canon/沒frontmatter.md", "# 沒 frontmatter\n\n正文。\n")
	write("notes/沒結尾.md", "---\ntype: 角色\nname: 沒結尾\n\n正文。\n")

	rep := run(t, p)
	wantPaths(t, rep, CheckFrontmatter, "canon/壞.md")
	for _, is := range rep.Issues {
		if is.Check == CheckFrontmatter && !strings.Contains(is.Message, "frontmatter 無法解析") {
			t.Fatalf("訊息沒有附上解析錯誤: %q", is.Message)
		}
	}
}

// 意圖:summaries/ 的 source 指向已不存在的章節(孤兒摘要)、以及章節在摘要儲存後被改過(過期)
// 都要能指出來;沒有問題的摘要不得回報。過期沿用 summary 的 Stale,不另寫一套雜湊規則。
func TestSummaryOrphanAndStale(t *testing.T) {
	p, write := newProject(t)
	write("manuscript/第一章.md", "# 第一章\n\n原本的內容。\n")
	// 沒有 sourceHash 的摘要(對不上任何章節內容):視為可能過期
	write("summaries/第一章.md", "---\nsource: manuscript/第一章.md\nupdated: 2026-10-10T00:00:00+08:00\n---\n\n第一章摘要\n")

	rep := run(t, p)
	wantPaths(t, rep, CheckOrphanSummary)
	wantPaths(t, rep, CheckStaleSummary, "summaries/第一章.md")

	// 用 summary.Save 存一份對得上章節內容的摘要 → 不再過期
	if _, err := summary.Save(p, "manuscript/第一章.md", "第一章摘要"); err != nil {
		t.Fatal(err)
	}
	rep = run(t, p)
	wantPaths(t, rep, CheckStaleSummary)

	// 孤兒摘要:source 指向不存在的章節
	write("summaries/孤兒.md", "---\nsource: manuscript/已刪除的章.md\nsourceHash: abc\nupdated: 2026-10-10T00:00:00+08:00\n---\n\n看不到章節。\n")
	rep = run(t, p)
	wantPaths(t, rep, CheckOrphanSummary, "summaries/孤兒.md")
	wantPaths(t, rep, CheckStaleSummary)

	// 章節改過 → 已存的摘要過期
	write("manuscript/第一章.md", "# 第一章\n\n改過的內容。\n")
	rep = run(t, p)
	wantPaths(t, rep, CheckStaleSummary, "summaries/第一章.md")
}

// 意圖:作者會把圖片等非 .md 檔放在作品資料夾裡,連結只要檔案真的存在就不能誤報;
// 外部連結、mailto、純錨點、程式碼區塊裡的範例、以及 URL 編碼後仍然存在的路徑都不是問題。
func TestBrokenLinkReportedAndOthersIgnored(t *testing.T) {
	p, write := newProject(t)
	write("manuscript/第一章.md", "# 第一章\n\n正文。\n")
	write("canon/好.md", "# 好\n")
	write("manuscript/pic.png", "not really a png")
	write("notes/好(1).md", "# 括號\n")
	write("notes/連結.md", strings.Join([]string{
		"# 連結",
		"[好](../canon/好.md)",
		"[編碼](../canon/%E5%A5%BD.md)",
		"[外部](https://example.com/a.md)",
		"[信](mailto:a@example.com)",
		"[錨點](#小節)",
		"[圖片](../manuscript/pic.png)",
		"[逃出作品](../../outside.md)",
		"[壞](不存在.md)",
		"[圖壞](沒有這張.png)",
		"[標題](不存在2.md \"標題\")",
		"[括號成對](好(1).md)", // PR #67 審查:目標內成對的括號是路徑的一部分
		`[跳脫括號](好\(1\).md)`,
		"範例 `[行內程式碼](行內不存在.md)` 只是文字", // 行內程式碼裡的不是連結
		"範例 ``[雙反引號](雙不存在.md)`` 也是",
		"[反斜線逃出](..%5C..%5Coutside.md)", // %5C 解碼成 Windows 分隔,不得繞過作品根判斷
		`[反斜線逃出2](..\..\outside2.md)`,
		"",
		"```",
		"[程式碼區塊裡](也不存在.md)",
		"```",
		"",
	}, "\n"))

	rep := run(t, p)
	wantPaths(t, rep, CheckBrokenLink, "notes/連結.md", "notes/連結.md", "notes/連結.md")
	for _, target := range []string{"..%5C..%5Coutside.md", `..\..\outside.md`} {
		if dest, ok := resolveLink("notes/連結.md", target); ok {
			t.Fatalf("%s 逃出作品根卻被接受:%q", target, dest)
		}
	}
	msgs := []string{}
	for _, is := range rep.Issues {
		if is.Check == CheckBrokenLink {
			msgs = append(msgs, is.Message)
		}
	}
	for _, want := range []string{"notes/不存在.md", "notes/沒有這張.png", "notes/不存在2.md"} {
		found := false
		for _, m := range msgs {
			if strings.Contains(m, want) {
				found = true
			}
		}
		if !found {
			t.Fatalf("沒有回報 %s:%v", want, msgs)
		}
	}
}

// 意圖:磁碟上的檔案被搬走後,perkins.json 的卷還列著它;沿用 ResolveVolumes 的判斷回報,
// 但「未列入順序」不是問題,不得混進這一類。
func TestMissingChapterReportedFromConfig(t *testing.T) {
	p, write := newProject(t)
	write("manuscript/第一章.md", "# 第一章\n\n正文。\n")
	write("manuscript/未列入.md", "# 未列入\n\n正文。\n")
	if err := p.SetVolumes([]project.Volume{{Title: "第一卷", Chapters: []string{"manuscript/第一章.md", "manuscript/已刪除.md"}}}); err != nil {
		t.Fatal(err)
	}

	rep := run(t, p)
	wantPaths(t, rep, CheckMissingChapter, "manuscript/已刪除.md")
	for _, is := range rep.Issues {
		if is.Check == CheckMissingChapter && !strings.Contains(is.Message, "perkins.json") {
			t.Fatalf("訊息應說明來源是 perkins.json: %q", is.Message)
		}
	}
}

// 意圖:乾淨的作品不得回報任何問題(全綠是這一類檢查最容易誤報的地方:正常的連結、
// 合法的 frontmatter、剛存好的摘要都要放過),而且檢查時間要有值。
func TestCleanProjectHasNoIssues(t *testing.T) {
	p, write := newProject(t)
	write("manuscript/第一章.md", "# 第一章\n\n艾莉絲走進森林。\n")
	write("canon/艾莉絲.md", "---\ntype: 角色\nname: 艾莉絲\naliases:\n  - 小艾\n---\n\n# 艾莉絲\n\n十七歲。\n")
	write("notes/連結.md", "[第一章](../manuscript/第一章.md)與[設定](../canon/艾莉絲.md)\n")
	if _, err := summary.Save(p, "manuscript/第一章.md", "艾莉絲走進森林。"); err != nil {
		t.Fatal(err)
	}
	if err := p.SetVolumes([]project.Volume{{Title: "第一卷", Chapters: []string{"manuscript/第一章.md"}}}); err != nil {
		t.Fatal(err)
	}

	rep := run(t, p)
	if len(rep.Issues) != 0 {
		t.Fatalf("乾淨的作品不該有問題: %+v", rep.Issues)
	}
	if rep.CheckedAt == "" {
		t.Fatal("檢查時間不可為空")
	}
}
