package agent

import (
	"context"
	"strings"
	"testing"

	"perkins/internal/llm"
)

// 意圖(#98,SPEC §12.3「Bot 可讀範圍」、B2):作者允許的資料夾內,Bot 不靠附加也能用工具列出、搜尋、讀取;
// 範圍外且未附加的檔案仍讀不到、搜不到、列不出;允許讀取不等於預先送出全文。
func TestBotReadableFoldersAreToolReadableButNotPushed(t *testing.T) {
	a, s, _ := setupListFiles(t) // canon/characters.md、canon/secret.md、outline/plan.md、notes/private.md
	a.Readable = []string{"canon"}
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{
			{ID: "1", Name: "list_files", Arguments: "{}"},
			{ID: "2", Name: "search_project", Arguments: `{"query":"祕密設定"}`},
			{ID: "3", Name: "read_document", Arguments: `{"path":"canon/characters.md"}`},
			{ID: "4", Name: "read_document", Arguments: `{"path":"notes/private.md"}`},
			{ID: "5", Name: "search_project", Arguments: `{"query":"私人筆記"}`},
		}},
		{Role: "assistant", Content: "好"},
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "小明怕什麼?"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	// 第一次請求:沒有附加,設定全文不得預先送出
	for _, m := range s.reqs[0].Messages {
		if strings.Contains(m.Content, "十二歲") || strings.Contains(m.Content, "反派是小明的哥哥") {
			t.Fatalf("允許讀取的設定不得預先送出全文:\n%s", m.Content)
		}
	}
	res := map[string]string{}
	for _, m := range s.reqs[1].Messages {
		if m.Role == "tool" {
			res[m.ToolCallID] = m.Content
		}
	}
	if !strings.Contains(res["1"], "canon/characters.md") || !strings.Contains(res["1"], "canon/secret.md") {
		t.Errorf("list_files 應列出可讀資料夾內的設定:\n%s", res["1"])
	}
	for _, hidden := range []string{"outline/plan.md", "notes/private.md"} {
		if strings.Contains(res["1"], hidden) {
			t.Errorf("範圍外的 %s 不得列出:\n%s", hidden, res["1"])
		}
	}
	if !strings.Contains(res["2"], "canon/secret.md") {
		t.Errorf("search_project 應搜得到可讀資料夾: %q", res["2"])
	}
	if !strings.Contains(res["3"], "十二歲") {
		t.Errorf("read_document 應讀得到可讀資料夾: %q", res["3"])
	}
	if strings.Contains(res["4"], "私人筆記") || !strings.Contains(res["4"], "錯誤") {
		t.Errorf("範圍外的筆記不得讀到: %q", res["4"])
	}
	if strings.Contains(res["5"], "notes/private.md") {
		t.Errorf("範圍外的筆記不得搜到: %q", res["5"])
	}

	// 預覽回報實際可讀範圍(前端依此顯示,不自己猜)
	pv, err := a.Preview(AskParams{Question: "q"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(pv.Readable, ",") != "canon" {
		t.Errorf("Preview.Readable = %v, want [canon]", pv.Readable)
	}
}

// 意圖:範圍外的資料夾仍可由作者本次附加而讀到(附加 = 本次送出全文,維持原行為)。
func TestAttachmentStillGrantsOutsideReadableScope(t *testing.T) {
	g := gateFor(AskParams{Attachments: []string{"notes/private.md"}}, []string{"canon"})
	if !g.ok("notes/private.md") || !g.ok("canon/x.md") || g.ok("notes/other.md") || g.ok("outline/plan.md") {
		t.Fatalf("gate 應 = 可讀資料夾 ∪ 本次附加: %v", g)
	}
	// 資料夾名稱只比對第一層,不能以前綴相似繞過
	if gateFor(AskParams{}, []string{"canon"}).ok("canonx/a.md") != !Protected("canonx/a.md") {
		t.Fatal("非受保護路徑的判斷不得受可讀範圍影響")
	}
}
