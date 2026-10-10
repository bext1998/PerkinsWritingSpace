package agent

import (
	"context"
	"strings"
	"testing"

	"perkins/internal/llm"
	"perkins/internal/project"
)

// 兩卷專案:卷順序存在 perkins.json;02.md 有一級標題、03.md 沒有(章名用檔名)、
// draft-extra.md 未列入任何卷(依 ResolveVolumes 規則排最後);另有摘要、大綱與筆記各一檔。
func setupListFiles(t *testing.T) (*Agent, *scripted, string) {
	t.Helper()
	a, s, dir := setup(t)
	p := a.Proj
	if err := p.WriteFile("manuscript/02.md", "# 第二章\n莉莉在圖書館。\n\n<!-- 作者筆記 -->\n"); err != nil {
		t.Fatal(err)
	}
	if err := p.WriteFile("manuscript/03.md", "沒有標題的一章。\n"); err != nil {
		t.Fatal(err)
	}
	if err := p.WriteFile("manuscript/draft-extra.md", "# 未列入順序\nx\n"); err != nil {
		t.Fatal(err)
	}
	if err := p.SetVolumes([]project.Volume{
		{Title: "第一卷", Chapters: []string{"manuscript/第一章.md", "manuscript/02.md"}},
		{Title: "第二卷", Chapters: []string{"manuscript/03.md"}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := p.WriteFile("summaries/01.md", "摘要內容\n"); err != nil {
		t.Fatal(err)
	}
	if err := p.WriteFile("outline/plan.md", "# 大綱\n"); err != nil {
		t.Fatal(err)
	}
	if err := p.WriteFile("notes/private.md", "私人筆記\n"); err != nil {
		t.Fatal(err)
	}
	return a, s, dir
}

// 意圖:list_files 的卷/章順序必須與 perkins.json 一致(與側欄相同),
// 章名取檔內第一個 `# ` 標題(沒有就用檔名),字數與狀態列同一套(CountText)。
func TestListFilesOrderTitleCount(t *testing.T) {
	a, _, _ := setupListFiles(t)
	r, err := a.listFiles(gate{})
	if err != nil {
		t.Fatal(err)
	}
	// 順序:第一卷(第一章→02)、第二卷(03)、未列入的 draft-extra 排最後
	want := []string{
		"【稿件】",
		"◆ 第一卷",
		"manuscript/第一章.md 第一章 10字", // # 第一章(3)+ 小明走進森林。(7);# 不算
		"manuscript/02.md 第二章 10字",  // # 第二章(3)+ 莉莉在圖書館。(7);<!-- --> 註解不算
		"◆ 第二卷",
		"manuscript/03.md 03 8字", // 沒有一級標題 → 用檔名
		"manuscript/draft-extra.md",
	}
	pos := -1
	for _, w := range want {
		i := strings.Index(r, w)
		if i < 0 {
			t.Fatalf("清單缺少 %q:\n%s", w, r)
		}
		if i < pos {
			t.Fatalf("順序錯誤:%q 出現在前面項目之前,應與 perkins.json 一致:\n%s", w, r)
		}
		pos = i
	}
	if !strings.Contains(r, "【摘要】") || !strings.Contains(r, "- summaries/01.md") {
		t.Fatalf("應列出 summaries/ 中存在的摘要:\n%s", r)
	}
}

// 意圖(G2/B2):受保護資料夾(canon/、outline/、notes/)只列作者本次附加的檔案,
// 沒附加的不得出現——透過 Ask 完整流程驗證(走 runTool,並寫審計)。
func TestListFilesShowsOnlyAttachedProtectedFiles(t *testing.T) {
	a, s, dir := setupListFiles(t)
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Name: "list_files", Arguments: "{}"}}},
		{Role: "assistant", Content: "清單已回報。"},
	}
	var events []Event
	if _, err := a.Ask(context.Background(), AskParams{
		Question:    "作品有哪些檔案?",
		Attachments: []string{"canon/characters.md", "outline/plan.md"},
	}, func(e Event) { events = append(events, e) }); err != nil {
		t.Fatal(err)
	}
	// 找出回給模型的工具結果
	var toolMsg string
	for _, m := range s.reqs[1].Messages {
		if m.Role == "tool" {
			toolMsg = m.Content
		}
	}
	if !strings.Contains(toolMsg, "canon/characters.md") || !strings.Contains(toolMsg, "outline/plan.md") {
		t.Fatalf("附加的受保護檔案應出現:\n%s", toolMsg)
	}
	for _, hidden := range []string{"canon/secret.md", "notes/private.md", "祕密設定", "私人筆記"} {
		if strings.Contains(toolMsg, hidden) {
			t.Fatalf("未附加的受保護檔案不得出現(%q):\n%s", hidden, toolMsg)
		}
	}
	if !strings.Contains(auditText(t, dir), `"event":"tool_call","tool":"list_files"`) {
		t.Error("審計紀錄應含 list_files 的 tool_call")
	}
}

// 意圖:list_files 是唯讀工具,報告模式(不提供 propose_patch)仍可用。
func TestListFilesAvailableInReportMode(t *testing.T) {
	a, s, _ := setupListFiles(t)
	tools := toolsFor(ModeReport)
	if !allowed("list_files", tools) {
		t.Fatal("報告模式應提供 list_files")
	}
	if allowed("propose_patch", tools) {
		t.Fatal("報告模式不應提供 propose_patch")
	}
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Name: "list_files", Arguments: "{}"}}},
		{Role: "assistant", Content: "報告完成。"},
	}
	toolMsg := ""
	if _, err := a.Ask(context.Background(), AskParams{Question: "檢查", Mode: ModeReport}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	for _, m := range s.reqs[1].Messages {
		if m.Role == "tool" {
			toolMsg = m.Content
		}
	}
	if strings.HasPrefix(toolMsg, "錯誤:") || !strings.Contains(toolMsg, "【稿件】") {
		t.Fatalf("報告模式下 list_files 應正常回傳清單, got %q", toolMsg)
	}
}
