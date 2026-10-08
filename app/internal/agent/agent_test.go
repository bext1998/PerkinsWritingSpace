package agent

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"perkins/internal/llm"
	"perkins/internal/project"
	"perkins/internal/proposal"
	"perkins/internal/research"
	"perkins/internal/summary"
)

// scripted 依序回放預先寫好的模型回覆,並記下每次收到的請求。
type scripted struct {
	replies []llm.Message
	reqs    []llm.Request
}

func (s *scripted) Chat(_ context.Context, req llm.Request, onDelta func(string)) (llm.Message, error) {
	s.reqs = append(s.reqs, req)
	r := s.replies[0]
	if len(s.replies) > 1 {
		s.replies = s.replies[1:]
	}
	if onDelta != nil && r.Content != "" {
		onDelta(r.Content)
	}
	return r, nil
}

func setup(t *testing.T) (*Agent, *scripted, string) {
	t.Helper()
	dir := t.TempDir()
	p, err := project.Create(dir, "n")
	if err != nil {
		t.Fatal(err)
	}
	rel, _ := p.NewChapter("第一章", 0)
	p.WriteFile(rel, "# 第一章\n小明走進森林。\n")
	p.WriteFile("canon/characters.md", "小明:十二歲,怕黑。\n")
	p.WriteFile("canon/secret.md", "祕密設定:反派是小明的哥哥。\n")
	s := &scripted{}
	return &Agent{Proj: p, Proposals: &proposal.Store{Proj: p}, LLM: s, Model: "m"}, s, dir
}

func snapshot(t *testing.T, dir string) map[string][32]byte {
	t.Helper()
	out := map[string][32]byte{}
	filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && !strings.Contains(path, ".perkins") {
			b, _ := os.ReadFile(path)
			out[path] = sha256.Sum256(b)
		}
		return nil
	})
	return out
}

func auditText(t *testing.T, dir string) string {
	b, _ := os.ReadFile(filepath.Join(dir, ".perkins", "audit.jsonl"))
	return string(b)
}

// A1 意圖:無論模型要求什麼(含嘗試呼叫寫檔工具),稿件與設定檔都不能被改動。
// A5 意圖:越權嘗試必須被拒絕、告知模型、並留下痕跡。
func TestDeniedToolsDoNotTouchFilesAndAreAudited(t *testing.T) {
	a, s, dir := setup(t)
	before := snapshot(t, dir)
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{
			{ID: "1", Name: "write_file", Arguments: `{"path":"canon/characters.md","content":"被改了"}`},
			{ID: "2", Name: "read_document", Arguments: `{"path":"../perkins.json"}`},
			{ID: "3", Name: "shell", Arguments: `{"cmd":"del *"}`},
		}},
		{Role: "assistant", Content: "好的,我只能提供建議。"},
	}
	var events []Event
	reply, err := a.Ask(context.Background(), AskParams{Question: "幫我改"}, func(e Event) { events = append(events, e) })
	if err != nil || reply == "" {
		t.Fatalf("reply=%q err=%v", reply, err)
	}
	after := snapshot(t, dir)
	for k, v := range before {
		if after[k] != v {
			t.Errorf("檔案被改動: %s", k)
		}
	}
	log := auditText(t, dir)
	for _, name := range []string{"write_file", "shell"} {
		if !strings.Contains(log, `"event":"tool_denied","tool":"`+name+`"`) {
			t.Errorf("審計紀錄缺少被拒絕的 %s:\n%s", name, log)
		}
	}
	// 路徑跳脫被 project 層擋下,且工具結果是錯誤而非檔案內容
	second := s.reqs[1].Messages
	last := second[len(second)-2] // read_document 的結果
	if last.Role != "tool" || !strings.HasPrefix(last.Content, "錯誤:") {
		t.Errorf("路徑跳脫應得到錯誤結果, got %+v", last)
	}
	// 被拒的工具要明確告知模型可用工具,避免它反覆嘗試
	denied := second[len(second)-3]
	if !strings.Contains(denied.Content, "read_document") {
		t.Errorf("拒絕訊息應列出允許的工具: %q", denied.Content)
	}
}

// A5 意圖:模型陷入無限工具循環時必須停下,不能燒光成本或卡住作者。
func TestIterationLimitStopsLoop(t *testing.T) {
	a, s, dir := setup(t)
	a.MaxIter = 3
	s.replies = []llm.Message{{Role: "assistant", ToolCalls: []llm.ToolCall{
		{ID: "x", Name: "search_project", Arguments: `{"query":"小明"}`}}}}
	_, err := a.Ask(context.Background(), AskParams{Question: "?"}, func(Event) {})
	if err == nil {
		t.Fatal("應因迭代上限而停止")
	}
	if len(s.reqs) != 3 {
		t.Errorf("應恰好呼叫模型 3 次, got %d", len(s.reqs))
	}
	if !strings.Contains(auditText(t, dir), `"event":"iter_limit"`) {
		t.Error("審計紀錄缺少 iter_limit")
	}
}

// A6 意圖:作者以為沒送出的設定檔不能出現在送往模型的內容中;預覽必須等於實際送出。
func TestContextOnlyIncludesCheckedCanonAndPreviewMatchesSend(t *testing.T) {
	a, s, _ := setup(t)
	p := AskParams{Question: "小明怕什麼?", Doc: "manuscript/第一章.md", Selection: "小明走進森林。", Attachments: []string{"canon/characters.md"}}
	preview, err := a.BuildMessages(p)
	if err != nil {
		t.Fatal(err)
	}
	joined := ""
	for _, m := range preview {
		joined += m.Content
	}
	if strings.Contains(joined, "祕密設定") {
		t.Fatal("未勾選的 canon/secret.md 不應出現在上下文")
	}
	if !strings.Contains(joined, "怕黑") || !strings.Contains(joined, "小明走進森林。") {
		t.Fatal("勾選的 Canon 與選取段落應在上下文")
	}
	s.replies = []llm.Message{{Role: "assistant", Content: "怕黑"}}
	if _, err := a.Ask(context.Background(), p, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	sent := s.reqs[0].Messages
	if len(sent) != len(preview) {
		t.Fatalf("預覽 %d 則,實際送出 %d 則", len(preview), len(sent))
	}
	for i := range sent {
		if sent[i].Content != preview[i].Content || sent[i].Role != preview[i].Role {
			t.Errorf("第 %d 則訊息預覽與實際送出不一致", i)
		}
	}
}

// 意圖:附加只能是專案內的作者檔案,不能藉附加讀到 perkins.json、審計紀錄或專案外檔案。
func TestAttachmentsMustBeProjectFiles(t *testing.T) {
	a, _, _ := setup(t)
	for _, bad := range []string{"../perkins.json", ".perkins/audit.jsonl", "perkins.json", "C:/Windows/win.ini"} {
		if _, err := a.BuildMessages(AskParams{Question: "q", Attachments: []string{bad}}); err == nil {
			t.Errorf("應拒絕附加 %q", bad)
		}
	}
	if _, err := a.BuildMessages(AskParams{Question: "q", Attachments: []string{"manuscript/第一章.md"}}); err != nil {
		t.Errorf("其他章節應可附加: %v", err)
	}
}

func TestWhitelistHasNoWriteTools(t *testing.T) {
	got := strings.Join(ToolNames(), ",")
	if got != "read_document,search_project,propose_patch" {
		t.Fatalf("白名單應是兩個唯讀工具加提案工具,不得有寫入工具, got %s", got)
	}
}

// A1 意圖(經由 agent 路徑):模型呼叫 propose_patch 只會產生待審提案,稿件與設定檔不變。
// A3 意圖:待審提案的內容不能回流進後續請求的上下文,否則未批准的文字會被當成既定事實。
func TestProposePatchCreatesPendingAndDoesNotLeakIntoContext(t *testing.T) {
	a, s, dir := setup(t)
	before := snapshot(t, dir)
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Name: "propose_patch",
			Arguments: `{"path":"manuscript/第一章.md","original":"小明走進森林。","replacement":"小明獨自闖入幽暗的森林。","rationale":"更有張力","assumptions":["推測:時間是夜晚"]}`}}},
		{Role: "assistant", Content: "我提了一個修改提案,請審核。"},
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "潤飾第一句", Doc: "manuscript/第一章.md"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	for k, v := range snapshot(t, dir) {
		if before[k] != v {
			t.Errorf("提案不應改動檔案: %s", k)
		}
	}
	list, _ := a.Proposals.List()
	if len(list) != 1 || list[0].Status != proposal.Pending || list[0].Replacement != "小明獨自闖入幽暗的森林。" {
		t.Fatalf("應有一個 pending 提案: %+v", list)
	}
	// 之後任何新提問的上下文都不含提案的替換文字
	msgs, err := a.BuildMessages(AskParams{Question: "繼續", Doc: "manuscript/第一章.md", Attachments: []string{"canon/characters.md"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range msgs {
		if strings.Contains(m.Content, "幽暗的森林") {
			t.Fatalf("待審提案內容洩漏進上下文: role=%s", m.Role)
		}
	}
}

// 模型給了不唯一/不存在的原文時,要把錯誤回給模型讓它修正,而不是默默建立錯位的提案。
func TestProposePatchBadOriginalReturnsErrorToModel(t *testing.T) {
	a, s, _ := setup(t)
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Name: "propose_patch",
			Arguments: `{"path":"manuscript/第一章.md","original":"根本不存在","replacement":"x","rationale":"r"}`}}},
		{Role: "assistant", Content: "抱歉"},
	}
	a.Ask(context.Background(), AskParams{Question: "q"}, func(Event) {})
	toolMsg := s.reqs[1].Messages[len(s.reqs[1].Messages)-1]
	if toolMsg.Role != "tool" || !strings.HasPrefix(toolMsg.Content, "錯誤:") {
		t.Fatalf("應把錯誤回給模型, got %+v", toolMsg)
	}
	if list, _ := a.Proposals.List(); len(list) != 0 {
		t.Fatal("錯誤的提案不應被建立")
	}
}

// A6 延伸意圖:作者沒勾選的設定檔(例如還沒想讓 AI 知道的伏筆)不能被 AI 透過工具自行讀取、搜尋或提案修改;
// 否則「預覽送出內容」就不是 AI 實際能看到的全部。
func TestToolsCannotReachUncheckedCanon(t *testing.T) {
	a, s, _ := setup(t)
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{
			{ID: "1", Name: "read_document", Arguments: `{"path":"canon/secret.md"}`},
			{ID: "2", Name: "search_project", Arguments: `{"query":"反派"}`},
			{ID: "3", Name: "propose_patch", Arguments: `{"path":"canon/secret.md","original":"反派是小明的哥哥","replacement":"x","rationale":"r"}`},
			{ID: "4", Name: "read_document", Arguments: `{"path":"canon/characters.md"}`},
			{ID: "5", Name: "read_document", Arguments: `{"path":"manuscript/第一章.md"}`},
		}},
		{Role: "assistant", Content: "ok"},
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "q", Attachments: []string{"canon/characters.md"}}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	msgs := s.reqs[1].Messages
	results := msgs[len(msgs)-5:]
	for i, m := range results {
		if strings.Contains(m.Content, "反派是小明的哥哥") {
			t.Errorf("工具結果 %d 洩漏未勾選的設定: %q", i, m.Content)
		}
	}
	if !strings.HasPrefix(results[0].Content, "錯誤:") || !strings.HasPrefix(results[2].Content, "錯誤:") {
		t.Errorf("讀取/提案未勾選設定應回錯誤: %q / %q", results[0].Content, results[2].Content)
	}
	if !strings.Contains(results[3].Content, "怕黑") || !strings.Contains(results[4].Content, "森林") {
		t.Error("已勾選的設定與稿件應可讀取")
	}
	if list, _ := a.Proposals.List(); len(list) != 0 {
		t.Error("不應對未勾選的設定建立提案")
	}
}

// B2 意圖:大綱(含尚未寫到的劇情)與私人筆記,跟設定一樣只有附加時 AI 才看得到;工具也不能繞過。
func TestOutlineAndNotesProtectedLikeCanon(t *testing.T) {
	a, s, _ := setup(t)
	a.Proj.WriteFile("outline/第二卷.md", "第二卷:哥哥背叛。\n")
	a.Proj.WriteFile("notes/私人.md", "私人筆記:不要讓 AI 看到。\n")
	msgs, _ := a.BuildMessages(AskParams{Question: "q", Doc: "manuscript/第一章.md"})
	for _, m := range msgs {
		if strings.Contains(m.Content, "哥哥背叛") || strings.Contains(m.Content, "私人筆記") {
			t.Fatal("未附加的大綱/筆記不應出現在上下文")
		}
	}
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{
			{ID: "1", Name: "read_document", Arguments: `{"path":"outline/第二卷.md"}`},
			{ID: "2", Name: "search_project", Arguments: `{"query":"筆記"}`},
			{ID: "3", Name: "read_document", Arguments: `{"path":"notes/私人.md"}`},
		}},
		{Role: "assistant", Content: "ok"},
	}
	a.Ask(context.Background(), AskParams{Question: "q"}, func(Event) {})
	for _, m := range s.reqs[1].Messages[len(s.reqs[1].Messages)-3:] {
		if strings.Contains(m.Content, "哥哥背叛") || strings.Contains(m.Content, "不要讓 AI 看到") {
			t.Fatalf("工具洩漏受保護內容: %q", m.Content)
		}
	}
	// 附加後就看得到
	msgs, _ = a.BuildMessages(AskParams{Question: "q", Attachments: []string{"outline/第二卷.md"}})
	if !strings.Contains(msgs[len(msgs)-1].Content, "哥哥背叛") {
		t.Fatal("附加的大綱應在上下文")
	}
}

// B5 意圖:「只檢查」的請求不能變成偷改——不提供提案工具,模型硬要呼叫也會被拒絕並記錄。
func TestReportModeHasNoProposeTool(t *testing.T) {
	a, s, dir := setup(t)
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Name: "propose_patch",
			Arguments: `{"path":"manuscript/第一章.md","original":"小明走進森林。","replacement":"改掉","rationale":"r"}`}}},
		{Role: "assistant", Content: "報告:沒有發現問題。"},
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "檢查", Doc: "manuscript/第一章.md", Mode: ModeReport}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	for _, tool := range s.reqs[0].Tools {
		if tool.Name == "propose_patch" {
			t.Fatal("報告模式不應提供 propose_patch")
		}
	}
	if !strings.Contains(s.reqs[0].Messages[0].Content, "檢查報告") {
		t.Error("系統提示應說明報告模式")
	}
	if list, _ := a.Proposals.List(); len(list) != 0 {
		t.Fatal("報告模式不應產生提案")
	}
	if !strings.Contains(auditText(t, dir), `"event":"tool_denied","tool":"propose_patch"`) {
		t.Error("報告模式下的提案嘗試應記錄為被拒")
	}
}

// B6 意圖:AI 草擬的摘要在作者儲存前不存在於任何檔案或上下文;儲存後章節被改,摘要要標示可能過期。
func TestSummaryDraftNotUsedUntilSavedAndStaleAfterEdit(t *testing.T) {
	a, s, dir := setup(t)
	ch2, _ := a.Proj.NewChapter("第二章", 0)
	a.Proj.WriteFile(ch2, "# 第二章\n天亮了。\n")
	s.replies = []llm.Message{{Role: "assistant", Content: "草稿:小明在森林裡遇到怪物。"}}
	before := snapshot(t, dir)
	draft, err := a.DraftSummary(context.Background(), "manuscript/第一章.md", func(Event) {})
	if err != nil || !strings.Contains(draft, "怪物") {
		t.Fatalf("draft=%q err=%v", draft, err)
	}
	if len(snapshot(t, dir)) != len(before) {
		t.Fatal("草擬摘要不應寫入任何檔案")
	}
	p := AskParams{Question: "q", Doc: ch2, PriorSummaries: true}
	msgs, _ := a.BuildMessages(p)
	if strings.Contains(msgs[len(msgs)-1].Content, "怪物") || strings.Contains(msgs[len(msgs)-1].Content, "前情摘要") {
		t.Fatal("未儲存的摘要草稿不應進入上下文")
	}
	if _, err := summary.Save(a.Proj, "manuscript/第一章.md", "小明進入森林,很害怕。"); err != nil {
		t.Fatal(err)
	}
	msgs, _ = a.BuildMessages(p)
	last := msgs[len(msgs)-1].Content
	if !strings.Contains(last, "小明進入森林,很害怕。") || strings.Contains(last, "可能過期") {
		t.Fatalf("已儲存的摘要應出現且不過期: %s", last)
	}
	a.Proj.WriteFile("manuscript/第一章.md", "# 第一章\n小明逃出森林。\n")
	msgs, _ = a.BuildMessages(p)
	if !strings.Contains(msgs[len(msgs)-1].Content, "可能過期") {
		t.Fatal("章節修改後摘要應標示可能過期")
	}
	// 目前章節自己的摘要不應被當成「前情」
	msgs, _ = a.BuildMessages(AskParams{Question: "q", Doc: "manuscript/第一章.md", PriorSummaries: true})
	if strings.Contains(msgs[len(msgs)-1].Content, "前情摘要") {
		t.Fatal("第一章之前沒有前情")
	}
}

// B7 意圖:對話變長時濃縮一定要讓作者知道;濃縮後下一次的預覽仍等於實際送出。
func TestCompactionNotifiesAndPreviewStillMatches(t *testing.T) {
	a, s, _ := setup(t)
	a.ContextTokens = 1200
	long := strings.Repeat("很長的討論內容。", 12)
	var notices []string
	emit := func(e Event) {
		if e.Kind == "notice" {
			notices = append(notices, e.Text)
		}
	}
	for i := 0; i < 3; i++ {
		s.replies = []llm.Message{{Role: "assistant", Content: long}, {Role: "assistant", Content: "摘要:討論了森林。"}}
		if _, err := a.Ask(context.Background(), AskParams{Question: long}, emit); err != nil {
			t.Fatal(err)
		}
	}
	if len(notices) == 0 || !strings.Contains(notices[0], "濃縮") {
		t.Fatalf("應有濃縮通知: %v", notices)
	}
	if !strings.HasPrefix(a.History[0].Content, "【較早對話的摘要】") {
		t.Fatalf("歷史應以摘要開頭: %q", a.History[0].Content)
	}
	p := AskParams{Question: "下一個問題"}
	pv, err := a.Preview(p)
	if err != nil {
		t.Fatal(err)
	}
	s.replies = []llm.Message{{Role: "assistant", Content: "好"}}
	n := len(s.reqs)
	a.Ask(context.Background(), p, func(Event) {})
	sent := s.reqs[n].Messages
	if len(sent) != len(pv.Messages) {
		t.Fatalf("預覽 %d 則,實際 %d 則", len(pv.Messages), len(sent))
	}
	for i := range sent {
		if sent[i].Content != pv.Messages[i].Content {
			t.Fatalf("第 %d 則預覽與實際不同", i)
		}
	}
}

// 意圖:附加內容本身就超過模型上限時要明確拒絕送出,而不是默默截斷或讓模型端報錯。
func TestOverBudgetRefusesToSend(t *testing.T) {
	a, s, _ := setup(t)
	a.ContextTokens = 200
	a.Proj.WriteFile("canon/巨大.md", strings.Repeat("設定。", 200))
	_, err := a.Ask(context.Background(), AskParams{Question: "q", Attachments: []string{"canon/巨大.md"}}, func(Event) {})
	if err == nil || !strings.Contains(err.Error(), "超過") {
		t.Fatalf("應拒絕送出: %v", err)
	}
	if len(s.reqs) != 0 {
		t.Fatal("不應呼叫模型")
	}
	pv, _ := a.Preview(AskParams{Question: "q", Attachments: []string{"canon/巨大.md"}})
	if !pv.Over {
		t.Fatal("預覽應標示超過預算")
	}
}

func TestEstimateTokens(t *testing.T) {
	n := EstimateTokens([]llm.Message{{Content: "中文十個字中文十個字"}, {Content: "abcdefghi"}})
	if n != 4+10+4+3 {
		t.Fatalf("got %d", n)
	}
}

// ---- 研究記錄(§12.8) ----

// rlogText 讀回研究記錄全文(不存在時回傳空字串)。
func rlogText(t *testing.T, dir string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, ".perkins", "research.jsonl"))
	if err != nil {
		return ""
	}
	return string(b)
}

// 意圖(§12.8):研究記錄預設關閉;執行 ask 與提案後,research.jsonl 不得存在。
func TestResearchDisabledCreatesNoFile(t *testing.T) {
	a, s, dir := setup(t)
	s.replies = []llm.Message{{Role: "assistant", Content: "回答"}}
	if _, err := a.Ask(context.Background(), AskParams{Question: "q"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, ".perkins", "research.jsonl")); len(b) != 0 {
		t.Fatalf("關閉時不應建立 research.jsonl: %s", b)
	}
}

// 意圖:開啟後 ask 筆記錄 model、mode、doc、selection 字數、attachments、送出的完整 messages、
// 回覆、工具呼叫清單、proposal id、耗時與結果。
func TestResearchAskRecordsMessagesAndReply(t *testing.T) {
	a, s, dir := setup(t)
	on := true
	a.Proj.SetResearch(on)
	a.Research = research.New(a.Proj, "sess-1")
	// 先讓模型建立提案(工具呼叫),下一輪直接回答
	p := AskParams{Question: "改寫開頭", Doc: "manuscript/第一章.md", Selection: "小明走進森林。", Attachments: []string{"canon/characters.md"}}
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{
			{ID: "t1", Name: "propose_patch", Arguments: `{"path":"manuscript/第一章.md","original":"小明走進森林。","replacement":"小明踱進森林。","rationale":"更有畫面"}`},
			{ID: "t2", Name: "read_document", Arguments: `{"path":"../perkins.json"}`},
		}},
		{Role: "assistant", Content: "已提出提案,也嘗試讀了不該讀的檔案。"},
	}
	reply, err := a.Ask(context.Background(), p, func(Event) {})
	if err != nil || reply == "" {
		t.Fatalf("reply=%q err=%v", reply, err)
	}
	text := rlogText(t, dir)
	if text == "" {
		t.Fatal("開啟後應有 research.jsonl")
	}
	var rec struct {
		TS      string `json:"ts"`
		Session string `json:"session"`
		Event   string `json:"event"`
		Detail  struct {
			Model     string   `json:"model"`
			Remote    bool     `json:"remote"`
			Mode      string   `json:"mode"`
			Doc       string   `json:"doc"`
			SelLen    int      `json:"selectionLen"`
			Attach    []string `json:"attachments"`
			Summaries bool     `json:"priorSummaries"`
			Sent      bool     `json:"sent"`
			Requests  []struct {
				Purpose  string        `json:"purpose"`
				Messages []llm.Message `json:"messages"`
				Reply    string        `json:"reply"`
			} `json:"requests"`
			Reply     string `json:"reply"`
			ToolCalls []struct {
				Name   string `json:"name"`
				Args   string `json:"args"`
				Denied bool   `json:"denied"`
				Err    string `json:"err"`
			} `json:"toolCalls"`
			ProposalIDs []string `json:"proposalIds"`
			ElapsedMs   int64    `json:"elapsedMs"`
			Result      string   `json:"result"`
			Error       string   `json:"error"`
		} `json:"detail"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(text)), &rec); err != nil {
		t.Fatalf("研究記錄格式錯誤: %v\n%s", err, text)
	}
	if rec.TS == "" || rec.Session != "sess-1" || rec.Event != "ask" {
		t.Fatalf("共同欄位錯誤: %+v", rec)
	}
	d := rec.Detail
	if d.Model != "m" || d.Doc != "manuscript/第一章.md" || d.SelLen != len([]rune("小明走進森林。")) {
		t.Errorf("基本欄位錯誤: %+v", d)
	}
	if len(d.Attach) != 1 || d.Attach[0] != "canon/characters.md" {
		t.Errorf("attachments 錯誤: %v", d.Attach)
	}
	// 實際送出的完整 messages:ask 請求的最後一則 user 應含附加檔案內容與問題
	if len(d.Requests) == 0 || d.Requests[0].Purpose != "ask" || !d.Sent {
		t.Fatalf("應記錄已送出的 ask 請求: sent=%v requests=%v", d.Sent, d.Requests)
	}
	var lastUser string
	for _, m := range d.Requests[0].Messages {
		if m.Role == "user" {
			lastUser = m.Content
		}
	}
	if !strings.Contains(lastUser, "怕黑") || !strings.Contains(lastUser, "改寫開頭") {
		t.Errorf("messages 應含送出的完整內容: %q", lastUser)
	}
	if d.Reply != "已提出提案,也嘗試讀了不該讀的檔案。" {
		t.Errorf("reply 錯誤: %q", d.Reply)
	}
	if len(d.ToolCalls) != 2 {
		t.Fatalf("應記錄 2 次工具呼叫: %+v", d.ToolCalls)
	}
	if d.ToolCalls[0].Name != "propose_patch" || d.ToolCalls[0].Denied {
		t.Errorf("propose_patch 記錄錯誤: %+v", d.ToolCalls[0])
	}
	// read_document 是白名單工具,但路徑跳脫被 project 層擋下 → 不標 denied(那是「工具不被允許」),
	// 而是記錄在 err 欄位,讓研究者看得到這次呼叫的結果
	if d.ToolCalls[1].Name != "read_document" || d.ToolCalls[1].Denied || d.ToolCalls[1].Args == "" {
		t.Errorf("越權工具呼叫應記錄名稱/參數,不標 denied: %+v", d.ToolCalls[1])
	}
	if d.ToolCalls[1].Err == "" {
		t.Errorf("越權呼叫的錯誤應記錄在 err: %+v", d.ToolCalls[1])
	}
	if len(d.ProposalIDs) != 1 || d.ProposalIDs[0] == "" {
		t.Errorf("應記錄本次建立的提案 id: %v", d.ProposalIDs)
	}
	if d.Result != "ok" {
		t.Errorf("result 應為 ok: %q(%q)", d.Result, d.Error)
	}
}

// 意圖(§16 第 21 項):ask 帶快速指令來源時記 quickId 與 quickEdited;
// 非快速指令來源不寫這兩個欄位(與 §12.8 欄位說明一致)。
func TestResearchAskQuickFields(t *testing.T) {
	a, s, dir := setup(t)
	a.Proj.SetResearch(true)
	a.Research = research.New(a.Proj, "sess-q")
	s.replies = []llm.Message{{Role: "assistant", Content: "回答"}}
	// 快速指令來源:記 id 與「是否改過問題」布林
	if _, err := a.Ask(context.Background(), AskParams{Question: "改過的問題", QuickID: "analyze", QuickEdited: true}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	// 非快速指令來源:不應出現 quickId/quickEdited 欄位
	if _, err := a.Ask(context.Background(), AskParams{Question: "自己打的"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(dir, ".perkins", "research.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(b)), "\n")
	if len(lines) != 2 {
		t.Fatalf("應兩筆 ask, got %d", len(lines))
	}
	if !strings.Contains(lines[0], `"quickId":"analyze"`) || !strings.Contains(lines[0], `"quickEdited":true`) {
		t.Errorf("快速指令來源應記 quickId/quickEdited: %s", lines[0])
	}
	if strings.Contains(lines[1], "quickId") || strings.Contains(lines[1], "quickEdited") {
		t.Errorf("非快速指令來源不應記快速指令欄位: %s", lines[1])
	}
}

// 意圖:AI 的回覆/研究記錄不得進入上下文,工具也讀不到 research.jsonl(G1–G4)。
func TestResearchFileNotInContextAndNotReadableByTools(t *testing.T) {
	a, s, dir := setup(t)
	a.Proj.SetResearch(true)
	a.Research = research.New(a.Proj, "sess-1")
	s.replies = []llm.Message{{Role: "assistant", Content: "回答"}}
	if _, err := a.Ask(context.Background(), AskParams{Question: "q", Doc: "manuscript/第一章.md"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".perkins", "research.jsonl")); err != nil {
		t.Fatal("應已產生 research.jsonl")
	}
	// 工具讀不到 .perkins/(路徑規則由 project 層擋下)
	if _, _, err := a.runTool("read_document", `{"path":".perkins/research.jsonl"}`, gate{}); err == nil {
		t.Fatal("read_document 不應讀到 .perkins/research.jsonl")
	}
	// 上下文組裝不會包含研究記錄
	msgs, err := a.BuildMessages(AskParams{Question: "q2", Doc: "manuscript/第一章.md"})
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range msgs {
		if strings.Contains(m.Content, "research.jsonl") {
			t.Fatal("研究記錄不得進入上下文")
		}
	}
}

// 意圖:切換開關寫回 perkins.json,重開專案仍保留。
func TestResearchTogglePersists(t *testing.T) {
	p, err := project.Create(t.TempDir(), "n")
	if err != nil {
		t.Fatal(err)
	}
	dir := p.Root
	if err := p.SetResearch(true); err != nil {
		t.Fatal(err)
	}
	p2, err := project.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !p2.Config.Research {
		t.Fatal("重開專案後 research 應保留")
	}
	b, _ := os.ReadFile(filepath.Join(dir, "perkins.json"))
	if !strings.Contains(string(b), `"research": true`) {
		t.Fatalf("perkins.json 應含 research 欄位: %s", b)
	}
	if err := p2.SetResearch(false); err != nil {
		t.Fatal(err)
	}
	p3, _ := project.Open(dir)
	if p3.Config.Research {
		t.Fatal("關閉後應保留關閉狀態")
	}
}

// ---- 研究記錄:審查修補(review-3) ----

// 意圖(第 1 點):每次提問恰好一筆 ask 記錄;超預算(未送出)也要有,標 sent=false。
func TestResearchOverBudgetExactlyOneRecord(t *testing.T) {
	a, _, _ := setup(t)
	a.Proj.SetResearch(true)
	a.Research = research.New(a.Proj, "sess-1")
	a.ContextTokens = 200
	a.Proj.WriteFile("canon/巨大.md", strings.Repeat("設定。", 200))
	_, err := a.Ask(context.Background(), AskParams{Question: "q", Attachments: []string{"canon/巨大.md"}}, func(Event) {})
	if err == nil {
		t.Fatal("應拒絕送出")
	}
	evs, _ := research.Read(a.Proj)
	if len(evs) != 1 {
		t.Fatalf("應恰好一筆 ask, got %d", len(evs))
	}
	var d struct {
		Sent     bool `json:"sent"`
		Requests []struct {
			Purpose string `json:"purpose"`
		} `json:"requests"`
		Result string `json:"result"`
	}
	if err := json.Unmarshal(evs[0].Detail, &d); err != nil {
		t.Fatal(err)
	}
	if d.Sent || len(d.Requests) != 0 {
		t.Fatalf("未送出應標 sent=false、requests 空: %+v", d)
	}
	if d.Result != "error" {
		t.Fatalf("result 應為 error: %q", d.Result)
	}
}

// 意圖(第 1 點):模型失敗與取消各恰好一筆。
func TestResearchModelFailureAndCancel(t *testing.T) {
	a, _, _ := setup(t)
	a.Proj.SetResearch(true)
	a.Research = research.New(a.Proj, "sess-1")

	// 失敗:假 LLM 回傳錯誤
	a.LLM = failLLM{}
	_, err := a.Ask(context.Background(), AskParams{Question: "q"}, func(Event) {})
	if err == nil {
		t.Fatal("應失敗")
	}
	evs, _ := research.Read(a.Proj)
	if len(evs) != 1 {
		t.Fatalf("模型失敗應恰好一筆, got %d", len(evs))
	}

	// 取消:Chat 回 context.Err 的假 LLM
	a2, _, _ := setup(t)
	a2.Proj.SetResearch(true)
	a2.Research = research.New(a2.Proj, "sess-1")
	a2.LLM = cancelLLM{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = a2.Ask(ctx, AskParams{Question: "q"}, func(Event) {})
	if err == nil {
		t.Fatal("應因取消而失敗")
	}
	evs2, _ := research.Read(a2.Proj)
	if len(evs2) != 1 {
		t.Fatalf("取消應恰好一筆, got %d", len(evs2))
	}
	var d2 struct {
		Result string `json:"result"`
		Sent   bool   `json:"sent"`
	}
	json.Unmarshal(evs2[0].Detail, &d2)
	if d2.Result != "cancelled" {
		t.Fatalf("result 應為 cancelled: %q", d2.Result)
	}
	if !d2.Sent {
		t.Fatal("取消發生在送出後應標 sent=true")
	}
}

// failLLM 一定回傳錯誤的假 LLM。
type failLLM struct{}

func (failLLM) Chat(_ context.Context, _ llm.Request, _ func(string)) (llm.Message, error) {
	return llm.Message{}, fmt.Errorf("端點連不上")
}

// cancelLLM 模擬請求進行中 context 被取消。
type cancelLLM struct{}

func (cancelLLM) Chat(ctx context.Context, _ llm.Request, _ func(string)) (llm.Message, error) {
	return llm.Message{}, ctx.Err()
}

// 意圖(第 2 點):proposalIds 只含本次建立的提案;上一次提問的提案不得誤記。
func TestResearchProposalIDsOnlyThisAsk(t *testing.T) {
	a, s, _ := setup(t)
	a.Proj.SetResearch(true)
	a.Research = research.New(a.Proj, "sess-1")
	// 第一次:建立一個提案
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{
			{ID: "t1", Name: "propose_patch", Arguments: `{"path":"manuscript/第一章.md","original":"小明走進森林。","replacement":"小明踱進森林。","rationale":"r"}`},
		}},
		{Role: "assistant", Content: "已提案"},
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "q1"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	// 第二次:純討論,沒有提案
	s.replies = []llm.Message{{Role: "assistant", Content: "只是討論"}}
	if _, err := a.Ask(context.Background(), AskParams{Question: "q2"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	// 第三次:一次建立兩個提案(original 取磁碟上實際存在的文字;canon 要附加才讀得到)
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{
			{ID: "a", Name: "propose_patch", Arguments: `{"path":"manuscript/第一章.md","original":"小明走進森林。","replacement":"X","rationale":"r"}`},
			{ID: "b", Name: "propose_patch", Arguments: `{"path":"canon/characters.md","original":"十二歲,怕黑。","replacement":"十三歲,怕黑。","rationale":"r"}`},
		}},
		{Role: "assistant", Content: "兩個提案"},
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "q3", Attachments: []string{"canon/characters.md"}}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	evs, _ := research.Read(a.Proj)
	if len(evs) != 3 {
		t.Fatalf("應三筆 ask, got %d", len(evs))
	}
	var ids [3][]string
	for i, ev := range evs {
		var d struct {
			ProposalIDs []string `json:"proposalIds"`
		}
		if err := json.Unmarshal(ev.Detail, &d); err != nil {
			t.Fatal(err)
		}
		ids[i] = d.ProposalIDs
	}
	if len(ids[0]) != 1 {
		t.Fatalf("第一次應一個提案: %v", ids[0])
	}
	if len(ids[1]) != 0 {
		t.Fatalf("純討論不得誤記提案: %v", ids[1])
	}
	if len(ids[2]) != 2 {
		t.Fatalf("一次兩個提案應記錄兩個: %v", ids[2])
	}
}

// 意圖(第 3 點):迭代上限時 requests 只含已送出的快照,未送出的工具結果不列入。
func TestResearchIterLimitRequestsAreSentOnly(t *testing.T) {
	a, s, _ := setup(t)
	a.Proj.SetResearch(true)
	a.Research = research.New(a.Proj, "sess-1")
	a.MaxIter = 2
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Name: "search_project", Arguments: `{"query":"小明"}`}}},
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "2", Name: "search_project", Arguments: `{"query":"森林"}`}}},
	}
	_, err := a.Ask(context.Background(), AskParams{Question: "q"}, func(Event) {})
	if err == nil {
		t.Fatal("應因迭代上限停止")
	}
	evs, _ := research.Read(a.Proj)
	if len(evs) != 1 {
		t.Fatalf("應恰好一筆, got %d", len(evs))
	}
	var d struct {
		Sent     bool `json:"sent"`
		Requests []struct {
			Purpose  string        `json:"purpose"`
			Messages []llm.Message `json:"messages"`
		} `json:"requests"`
	}
	json.Unmarshal(evs[0].Detail, &d)
	if !d.Sent || len(d.Requests) != 2 {
		t.Fatalf("應兩筆已送出的請求: sent=%v n=%d", d.Sent, len(d.Requests))
	}
	// 最後一筆快照不應含尚未送出的工具結果(最後一輪的 search 結果)
	last := d.Requests[1]
	for _, m := range last.Messages {
		if m.Role == "tool" && strings.Contains(m.Content, "森林: ") {
			t.Fatalf("最後一筆請求快照不應含未送出的工具結果: %q", m.Content)
		}
	}
}

// 意圖(第 5 點):配置 false 的實際 Recorder 不建檔、不建 .perkins;SetEnabled(false) 回傳後並行寫入不會新增。
func TestResearchDisabledRealRecorderAndConcurrentOff(t *testing.T) {
	p, err := project.Create(t.TempDir(), "n")
	if err != nil {
		t.Fatal(err)
	}
	r := research.New(p, "sess-1")
	if r.Enabled() {
		t.Fatal("預設應關閉")
	}
	if err := r.Log("save", map[string]any{"path": "x"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(p.Root, ".perkins")); !os.IsNotExist(err) {
		t.Fatal("配置 false 的實際 Recorder 不應建立 .perkins")
	}

	// 開啟、關閉,再從 goroutine 並行寫入:SetEnabled(false) 回傳後不得再新增行
	if err := p.SetResearch(true); err != nil {
		t.Fatal(err)
	}
	r.SetEnabled(true)
	if err := r.Log("save", nil); err != nil {
		t.Fatal(err)
	}
	r.SetEnabled(false)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _ = r.Log("save", nil) }()
	}
	wg.Wait()
	evs, err := research.Read(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("停用回傳後不得再寫入: %d 筆", len(evs))
	}
}

// 意圖(第 4 點):SetResearch 保存失敗時,記憶體狀態不異動。
// 意圖(review-round3 第 2 點):開啟/關閉兩向都在同一個作品 p 製造確定寫入失敗(perkins.json 換成
// 同名目錄);之後在同一個 p 恢復合法 perkins.json、成功呼叫 SetName(真正走 saveConfig,非參數驗證
// 就返回的操作),重開作品核對 Research 仍是失敗前的值 — 失敗的開關值不會經其他設定保存落盤。
func TestResearchToggleSaveFailureKeepsMemory(t *testing.T) {
	dir := t.TempDir()
	p, err := project.Create(dir, "n")
	if err != nil {
		t.Fatal(err)
	}
	cfgPath := filepath.Join(dir, "perkins.json")
	breakDisk := func() {
		os.Remove(cfgPath)
		if err := os.Mkdir(cfgPath, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	restoreDisk := func(researchOn bool) {
		// 移除同名目錄,寫回合法 perkins.json(research 與失敗前一致),再成功保存一次
		if err := os.RemoveAll(cfgPath); err != nil {
			t.Fatal(err)
		}
		b, err := json.Marshal(map[string]any{"name": "n", "volumes": []map[string]any{{"title": "第一卷", "chapters": []string{}}}, "research": researchOn})
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(cfgPath, b, 0o600); err != nil {
			t.Fatal(err)
		}
	}

	// ——— 開啟方向 ———
	breakDisk()
	if err := p.SetResearch(true); err == nil {
		t.Fatal("perkins.json 是目錄時應失敗")
	}
	if p.Config.Research {
		t.Fatal("開啟保存失敗時 Config.Research 應還原為 false")
	}
	restoreDisk(false) // 失敗前磁碟值 false
	if err := p.SetName("改名"); err != nil {
		t.Fatalf("恢復後 SetName 應成功: %v", err)
	}
	reopened, err := project.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Config.Research {
		t.Fatal("重開後 Research 應為失敗前值 false(開啟失敗值未落盤)")
	}

	// ——— 關閉方向(同一個作品 p)———
	p.Config.Research = true // 模擬未保存的開啟意圖(繞過保存)
	breakDisk()
	if err := p.SetResearch(false); err == nil {
		t.Fatal("關閉保存應失敗")
	}
	if !p.Config.Research {
		t.Fatal("關閉保存失敗時 Config.Research 應還原為 true")
	}
	restoreDisk(true) // 失敗前值 true
	if err := p.SetName("再改名"); err != nil {
		t.Fatalf("恢復後 SetName 應成功: %v", err)
	}
	reopened, err = project.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !reopened.Config.Research {
		t.Fatal("重開後 Research 應為失敗前值 true(關閉失敗值未落盤)")
	}
}

// 意圖(第 4 點):每次 Chat 回傳都保存該次回覆,含帶工具呼叫的中間回覆;MaxIter=1 逐筆比對。
func TestResearchRequestsIncludeIntermediateReplies(t *testing.T) {
	a, s, _ := setup(t)
	a.Proj.SetResearch(true)
	a.Research = research.New(a.Proj, "sess-1")
	a.MaxIter = 1
	s.replies = []llm.Message{
		{Role: "assistant", Content: "先查資料", ToolCalls: []llm.ToolCall{{ID: "1", Name: "search_project", Arguments: `{"query":"小明"}`}}},
	}
	_, err := a.Ask(context.Background(), AskParams{Question: "q"}, func(Event) {})
	if err == nil {
		t.Fatal("MaxIter=1 應因迭代上限停止")
	}
	evs, _ := research.Read(a.Proj)
	if len(evs) != 1 {
		t.Fatalf("應恰好一筆, got %d", len(evs))
	}
	var d struct {
		Requests []struct {
			Purpose  string        `json:"purpose"`
			Messages []llm.Message `json:"messages"`
			Reply    string        `json:"reply"`
		} `json:"requests"`
	}
	json.Unmarshal(evs[0].Detail, &d)
	if len(d.Requests) != 1 {
		t.Fatalf("應一筆請求, got %d", len(d.Requests))
	}
	if d.Requests[0].Reply != "先查資料" {
		t.Fatalf("中間回覆應被保存: %q", d.Requests[0].Reply)
	}
}
