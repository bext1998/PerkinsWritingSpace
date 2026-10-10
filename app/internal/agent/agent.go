// Package agent 實作 G4:AI 只能呼叫白名單工具、每次呼叫留下審計紀錄、迭代次數有上限。
// 本套件沒有任何寫入稿件或設定的程式路徑(G1/G2)。
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"perkins/internal/llm"
	"perkins/internal/project"
	"perkins/internal/proposal"
	"perkins/internal/research"
	"perkins/internal/summary"
)

const DefaultMaxIter = 8

const systemPrompt = `你是這位作者的寫作編輯助手。作者是作品的唯一主導者。作品是中文輕小說。
- 你不能直接修改稿件或設定;你只能閱讀、分析、提出建議。
- 具體的改寫請使用 propose_patch 提出提案(original 必須逐字複製原文且在檔案中唯一),由作者審核後才會套用。你無法套用提案。
- 只是討論或分析時,直接用文字回答即可,不必提案。
- 不要憑空新增世界觀或角色設定;若你在推測,請明確標示「推測」。
- 作者故意留白或模糊之處,不要擅自補完。
- 「前情摘要」是作者確認過的章節摘要,可能省略細節;需要細節時用工具查原文。
- 需要查看其他檔案時,使用提供的工具。`

const reportPrompt = `
本次是「檢查報告」模式:只輸出檢查報告,逐項列出問題、出現位置(引用原文)與依據(引用設定或前文)。
不要改寫文字,本次也無法提出修改提案。找不到問題時直接說沒有發現問題,不要硬湊。`

const ModeReport = "report"

// AskParams 是一次提問的輸入。
type AskParams struct {
	Question       string   `json:"question"`
	Doc            string   `json:"doc"`            // 目前開啟的檔案(相對路徑),可空
	Selection      string   `json:"selection"`      // 選取的文字,可空
	Attachments    []string `json:"attachments"`    // 作者附加的專案檔(設定、大綱、筆記、其他章節…)
	Mode           string   `json:"mode"`           // "" = 一般;report = 檢查報告(不提供提案工具,B5)
	PriorSummaries bool     `json:"priorSummaries"` // 附上本章之前已確認的章節摘要
	QuickID        string   `json:"quickId,omitempty"` // 快速指令 id(§16 第 21 項);非快速指令來源為空,研究記錄不記此欄
	QuickEdited    bool     `json:"quickEdited,omitempty"` // 作者送出前改過快速指令帶入的問題文字(只記布林,不記改前全文)
	// DocDraft 只供 Preview 使用的目前文件編輯器草稿(PR #54 返工):背景用量預覽在作者未存檔時也以草稿估算;
	// Ask 路徑不用(送出前已存檔,磁碟內容與草稿相同,AskAI 會清除它)。nil = 未提供;空字串 = 作者清空了全文,不是未提供。
	DocDraft *string `json:"docDraft,omitempty"`
}

type Event struct {
	Kind    string `json:"kind"` // delta | tool | notice
	Text    string `json:"text,omitempty"`
	Tool    string `json:"tool,omitempty"`
	Args    string `json:"args,omitempty"`
	Allowed bool   `json:"allowed,omitempty"`
}

type Agent struct {
	Proj          *project.Project
	Proposals     *proposal.Store // 只使用 Create;沒有任何套用路徑
	LLM           llm.Client
	Model         string
	MaxIter       int
	ContextTokens int                // 端點上下文長度;0 = 不限制(測試用)
	Research      *research.Recorder // 研究記錄(§12.8);nil 或關閉時不記錄
	Remote        bool               // 目前端點是否在本機之外(研究記錄用)

	mu      sync.Mutex
	History []llm.Message // 只含 user/assistant 文字回合(可能以濃縮摘要開頭)
}

// rlog 記錄研究事件(關閉或 nil 時為 no-op;失敗只留內部訊息,不影響 AI 流程)。
func (a *Agent) rlog(name string, detail any) {
	if a.Research == nil {
		return
	}
	_ = a.Research.Log(name, detail)
}

func (a *Agent) maxIter() int {
	if a.MaxIter > 0 {
		return a.MaxIter
	}
	return DefaultMaxIter
}

// ---- 審計 ----

type auditRecord struct {
	Time   string `json:"time"`
	Event  string `json:"event"` // request | tool_call | tool_denied | iter_limit | compact | summary_draft
	Tool   string `json:"tool,omitempty"`
	Args   string `json:"args,omitempty"`
	Detail string `json:"detail,omitempty"`
}

func (a *Agent) audit(r auditRecord) {
	r.Time = time.Now().Format(time.RFC3339)
	dir := filepath.Join(a.Proj.Root, ".perkins")
	if os.MkdirAll(dir, 0o755) != nil {
		return
	}
	f, err := os.OpenFile(filepath.Join(dir, "audit.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	b, _ := json.Marshal(r)
	f.Write(append(b, '\n'))
}

// ---- 工具白名單 ----

var toolDefs = []llm.ToolDef{
	{
		Name:        "read_document",
		Description: "讀取專案內的 Markdown 檔案(唯讀):manuscript/ 稿件、summaries/ 章節摘要,以及作者本次附加的 canon/、outline/、notes/ 檔案。",
		Parameters:  json.RawMessage(`{"type":"object","properties":{"path":{"type":"string","description":"相對路徑,如 manuscript/01.md"}},"required":["path"]}`),
	},
	{
		Name:        "search_project",
		Description: "在專案的稿件、摘要與作者附加的檔案中搜尋文字(唯讀),回傳符合的檔案與片段。",
		Parameters:  json.RawMessage(`{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}`),
	},
	{
		Name:        "propose_patch",
		Description: "對某檔案提出一項修改提案(不會直接修改檔案,需作者審核接受)。original 須逐字複製原文且在檔案中唯一。",
		Parameters:  json.RawMessage(`{"type":"object","properties":{"path":{"type":"string"},"original":{"type":"string","description":"要被替換的原文,逐字且唯一"},"replacement":{"type":"string"},"rationale":{"type":"string","description":"為什麼這樣改"},"assumptions":{"type":"array","items":{"type":"string"},"description":"你做了哪些假設或推測"}},"required":["path","original","replacement","rationale"]}`),
	},
}

// ToolNames 回傳完整白名單,供測試與介面顯示。
func ToolNames() []string { return names(toolDefs) }

func names(defs []llm.ToolDef) []string {
	out := make([]string, len(defs))
	for i, t := range defs {
		out[i] = t.Name
	}
	return out
}

// toolsFor 回傳本次請求可用的工具。報告模式不提供提案工具(B5)。
func toolsFor(mode string) []llm.ToolDef {
	if mode != ModeReport {
		return toolDefs
	}
	var out []llm.ToolDef
	for _, t := range toolDefs {
		if t.Name != "propose_patch" {
			out = append(out, t)
		}
	}
	return out
}

func allowed(name string, tools []llm.ToolDef) bool {
	for _, t := range tools {
		if t.Name == name {
			return true
		}
	}
	return false
}

// Protected 回傳路徑是否屬於「只有附加才看得到」的資料夾(SPEC §12.3、B2)。
func Protected(path string) bool {
	switch project.KindOf(path) {
	case project.CanonDir, project.OutlineDir, project.NotesDir:
		return true
	}
	return false
}

// gate 實作「AI 只能看到作者附加的受保護檔案」:稿件與摘要可自由讀取。
type gate map[string]bool

var errNotShared = fmt.Errorf("作者沒有在本次對話附加這個檔案;如需要,請請作者在對話框附加它")

func (g gate) ok(path string) bool { return !Protected(path) || g[path] }

func (a *Agent) runTool(name, args string, g gate) (string, string, error) { // 回傳 (結果, proposalID, 錯誤)
	switch name {
	case "read_document":
		var p struct {
			Path string `json:"path"`
		}
		if err := json.Unmarshal([]byte(args), &p); err != nil {
			return "", "", fmt.Errorf("參數格式錯誤: %w", err)
		}
		if !g.ok(p.Path) {
			return "", "", errNotShared
		}
		text, err := a.Proj.ReadFile(p.Path)
		return text, "", err
	case "search_project":
		var p struct {
			Query string `json:"query"`
		}
		if err := json.Unmarshal([]byte(args), &p); err != nil || strings.TrimSpace(p.Query) == "" {
			return "", "", fmt.Errorf("需要非空的 query")
		}
		r, err := a.search(p.Query, g)
		return r, "", err
	case "propose_patch":
		var p struct {
			Path        string   `json:"path"`
			Original    string   `json:"original"`
			Replacement string   `json:"replacement"`
			Rationale   string   `json:"rationale"`
			Assumptions []string `json:"assumptions"`
		}
		if err := json.Unmarshal([]byte(args), &p); err != nil {
			return "", "", fmt.Errorf("參數格式錯誤: %w", err)
		}
		if !g.ok(p.Path) {
			return "", "", errNotShared
		}
		if project.KindOf(p.Path) == project.SummariesDir {
			return "", "", fmt.Errorf("摘要由作者自行確認與編輯,不接受提案")
		}
		if a.Proposals == nil {
			return "", "", fmt.Errorf("提案功能未啟用")
		}
		pr, err := a.Proposals.Create(a.Model, p.Path, p.Original, p.Replacement, p.Rationale, p.Assumptions)
		if err != nil {
			return "", "", err
		}
		return "提案 " + pr.ID + " 已建立,等待作者審核。你無法套用它;請告訴作者你提了什麼以及理由。", pr.ID, nil
	}
	return "", "", fmt.Errorf("未實作的工具 %s", name)
}

// searchMaxHits 是 search_project 一次回傳的片段上限(不變;超過只多附一行總筆數)。
const searchMaxHits = 30

// search 只回傳前 searchMaxHits 筆片段,但會計數全部符合的行數;
// 超過上限時在最後附一行總筆數,讓模型知道結果被截斷(不再累積多餘的片段字串)。
func (a *Agent) search(q string, g gate) (string, error) {
	files, err := a.Proj.AllFiles()
	if err != nil {
		return "", err
	}
	var hits []string
	total := 0
	for _, f := range files {
		if !g.ok(f) {
			continue
		}
		text, err := a.Proj.ReadFile(f)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(text, "\n") {
			if !strings.Contains(line, q) {
				continue
			}
			total++
			if len(hits) >= searchMaxHits {
				continue
			}
			if r := []rune(line); len(r) > 120 {
				line = string(r[:120]) + "…"
			}
			hits = append(hits, f+": "+strings.TrimSpace(line))
		}
	}
	if total == 0 {
		return "沒有找到符合的內容。", nil
	}
	out := strings.Join(hits, "\n")
	if total > searchMaxHits {
		out += fmt.Sprintf("\n共 %d 筆,只列出前 %d 筆;請改用更精確的關鍵字。", total, searchMaxHits)
	}
	return out, nil
}

func gateFor(p AskParams) gate {
	g := gate{}
	for _, c := range p.Attachments {
		g[c] = true
	}
	if p.Doc != "" {
		g[p.Doc] = true // 作者附上的目前文件,即使是設定檔也已經在上下文中
	}
	return g
}

// ---- 上下文組裝(確定性程式;預覽與實際送出走同一條路徑,A6) ----

// BuildMessages 回傳將送往模型的完整訊息。Preview 與 Ask 都呼叫它。
func (a *Agent) BuildMessages(p AskParams) ([]llm.Message, error) {
	var ctx strings.Builder
	seen := map[string]bool{}
	for _, c := range p.Attachments {
		if seen[c] || c == p.Doc {
			continue
		}
		seen[c] = true
		text, err := a.Proj.ReadFile(c) // 路徑規則由 project 執行:只允許專案內的作者檔案
		if err != nil {
			return nil, fmt.Errorf("無法附加 %s: %w", c, err)
		}
		fmt.Fprintf(&ctx, "【附加檔案】%s\n%s\n\n", c, text)
	}
	if p.PriorSummaries && p.Doc != "" && project.KindOf(p.Doc) == project.ManuscriptDir {
		prev, err := summary.Before(a.Proj, p.Doc)
		if err != nil {
			return nil, err
		}
		if len(prev) > 0 {
			ctx.WriteString("【前情摘要】(作者確認過的前面章節摘要)\n")
			for _, s := range prev {
				stale := ""
				if s.Stale {
					stale = "(章節已修改,摘要可能過期)"
				}
				fmt.Fprintf(&ctx, "〈%s〉%s\n%s\n\n", s.Chapter, stale, s.Text)
			}
		}
	}
	if p.Doc != "" {
		var text string
		if p.DocDraft != nil {
			text = *p.DocDraft
		} else {
			var err error
			text, err = a.Proj.ReadFile(p.Doc)
			if err != nil {
				return nil, err
			}
		}
		fmt.Fprintf(&ctx, "【目前文件】%s\n%s\n\n", p.Doc, text)
	}
	if p.Selection != "" {
		fmt.Fprintf(&ctx, "【作者選取的段落】\n%s\n\n", p.Selection)
	}
	sys := systemPrompt
	if p.Mode == ModeReport {
		sys += reportPrompt
	}
	msgs := []llm.Message{{Role: "system", Content: sys}}
	a.mu.Lock()
	msgs = append(msgs, a.History...)
	a.mu.Unlock()
	user := p.Question
	if ctx.Len() > 0 {
		user = ctx.String() + "【作者的問題】\n" + p.Question
	}
	return append(msgs, llm.Message{Role: "user", Content: user}), nil
}

// ---- 上下文預算(程式計算,不交給模型) ----

// EstimateTokens 保守估算:中日韓字元每字 1 token,其他字元約 3 字元 1 token,每則訊息另加 4。
func EstimateTokens(msgs []llm.Message) int {
	n := 0
	for _, m := range msgs {
		n += 4
		other := 0
		for _, r := range m.Content {
			if r >= 0x2E80 {
				n++
			} else {
				other++
			}
		}
		for _, tc := range m.ToolCalls {
			other += len(tc.Arguments)
		}
		n += (other + 2) / 3
	}
	return n
}

// replyReserve 是預留給模型回覆與工具結果的額度。
func replyReserve(budget int) int {
	r := budget / 4
	if r > 4096 {
		r = 4096
	}
	return r
}

type Preview struct {
	Messages []llm.Message `json:"messages"`
	Tokens   int           `json:"tokens"`
	Budget   int           `json:"budget"` // 0 = 未設定
	Limit    int           `json:"limit"`  // 可用上下文 = Budget-replyReserve(Budget);Budget=0 時為 0(前端不顯示用量)
	Over     bool          `json:"over"`   // 超過預算:送出時會先濃縮較早對話,仍不夠則拒絕送出
}

func (a *Agent) Preview(p AskParams) (*Preview, error) {
	msgs, err := a.BuildMessages(p)
	if err != nil {
		return nil, err
	}
	pv := &Preview{Messages: msgs, Tokens: EstimateTokens(msgs), Budget: a.ContextTokens}
	if b := a.ContextTokens; b > 0 {
		pv.Limit = b - replyReserve(b)
		pv.Over = pv.Tokens > pv.Limit
	}
	return pv, nil
}

func (a *Agent) Reset() {
	a.mu.Lock()
	a.History = nil
	a.mu.Unlock()
}

const compactKeep = 4 // 最近 2 個回合原文保留

const compactPrompt = `你是對話摘要助手。把下面「作者」與「寫作助手」的對話濃縮成條列摘要,保留:作者做出的決定與偏好、討論過的設定與劇情要點、尚未解決的問題。
不要加入對話中沒有的內容,不要評論。`

// compact 把較早的對話濃縮成一段摘要(B7:一定發出通知)。
func (a *Agent) compact(ctx context.Context, emit func(Event)) error {
	return a.compactCollect(ctx, emit, nil)
}

// collect 非 nil 時收集濃縮請求(研究記錄的 ask 事件用它);ok 表示壓縮是否成功套用。
func (a *Agent) compactCollect(ctx context.Context, emit func(Event), collect func(purpose string, msgs []llm.Message, reply string, ok bool)) error {
	a.mu.Lock()
	if len(a.History) <= compactKeep {
		a.mu.Unlock()
		return fmt.Errorf("沒有可濃縮的較早對話")
	}
	old := append([]llm.Message{}, a.History[:len(a.History)-compactKeep]...)
	keep := append([]llm.Message{}, a.History[len(a.History)-compactKeep:]...)
	a.mu.Unlock()

	var tr strings.Builder
	for _, m := range old {
		who := "作者"
		if m.Role == "assistant" {
			who = "寫作助手"
		}
		fmt.Fprintf(&tr, "%s:%s\n\n", who, m.Content)
	}
	compactMsgs := []llm.Message{{Role: "system", Content: compactPrompt}, {Role: "user", Content: tr.String()}}
	reply, err := a.LLM.Chat(ctx, llm.Request{Model: a.Model, Messages: compactMsgs}, nil)
	if collect != nil {
		// 失敗也記錄,但標 ok=false;是否套用由這個欄位分辨(§16 第 21 項返工)
		collect("compact", compactMsgs, strings.TrimSpace(reply.Content), err == nil)
	}
	if err != nil {
		return fmt.Errorf("濃縮較早對話失敗: %w", err)
	}
	a.mu.Lock()
	a.History = append([]llm.Message{
		{Role: "user", Content: "【較早對話的摘要】(由 AI 濃縮,可能遺漏細節)\n" + strings.TrimSpace(reply.Content)},
		{Role: "assistant", Content: "好的,我會以這份摘要為前提繼續。"},
	}, keep...)
	a.mu.Unlock()
	a.audit(auditRecord{Event: "compact", Detail: fmt.Sprintf("濃縮 %d 則訊息", len(old))})
	emit(Event{Kind: "notice", Text: fmt.Sprintf("為了節省上下文,較早的 %d 則對話已濃縮成摘要;AI 可能不記得其中的細節。", len(old))})
	return nil
}

func (a *Agent) historyTokens() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return EstimateTokens(a.History)
}

// Ask 執行一次提問的代理迴圈。回傳最終回覆文字。
// 研究記錄(§12.8):每次提問恰好一筆 ask 事件,涵蓋所有結束路徑(成功/失敗/取消/超預算/迭代上限);
// 未送出的請求標 sent=false、requests 留空。messages 在真正呼叫 Chat 的邊界保存快照。
func (a *Agent) Ask(ctx context.Context, p AskParams, emit func(Event)) (string, error) {
	start := time.Now()
	var ( // 本次 ask 的研究記錄資料
		requests    []researchRequest // 依序列出每次實際送出的請求
		toolCalls   []researchToolCall
		pIDs        []string // 本次建立的提案 id
		replyText   string
		result, errMsg string
	)
	result = "ok"
	logAsk := func() {
		a.rlogAsk(p, requests, replyText, toolCalls, pIDs, start, result, errMsg)
	}
	defer logAsk() // 恰好一筆:唯一出口

	p.DocDraft = nil // Ask 路徑不使用草稿:送出前已存檔,一律以磁碟內容估算(A6)
	msgs, err := a.BuildMessages(p)
	if err != nil {
		result, errMsg = "error", errText(err)
		return "", err
	}
	if b := a.ContextTokens; b > 0 && EstimateTokens(msgs) > b-replyReserve(b) {
		collect := func(purpose string, msgs []llm.Message, reply string, ok bool) {
			requests = append(requests, researchRequest{Purpose: purpose, Messages: append([]llm.Message{}, msgs...), Reply: reply, Ok: &ok})
		}
		if err := a.compactCollect(ctx, emit, collect); err == nil {
			if msgs, err = a.BuildMessages(p); err != nil {
				result, errMsg = "error", errText(err)
				return "", err
			}
		}
		if n := EstimateTokens(msgs); n > b-replyReserve(b) {
			result, errMsg = "error", fmt.Sprintf("送出內容約 %d tokens,超過模型可用的 %d。請減少附加的檔案、取消前情摘要,或開新對話。", n, b-replyReserve(b))
			return "", fmt.Errorf("%s", errMsg)
		}
	}
	a.audit(auditRecord{Event: "request", Detail: fmt.Sprintf("doc=%s selection=%d字元 attachments=%v mode=%s summaries=%v tokens≈%d",
		p.Doc, len([]rune(p.Selection)), p.Attachments, p.Mode, p.PriorSummaries, EstimateTokens(msgs))})

	g := gateFor(p)
	tools := toolsFor(p.Mode)
	req := llm.Request{Model: a.Model, Tools: tools}
	rejectedIDs := map[string]bool{}
	for i := 0; i < a.maxIter(); i++ {
		// 在真正呼叫 Chat 的邊界保存請求快照(不可變副本)
		req.Messages = msgs
		snapshot := append([]llm.Message{}, msgs...)
		reply, err := a.LLM.Chat(ctx, req, func(s string) { emit(Event{Kind: "delta", Text: s}) })
		requests = append(requests, researchRequest{Purpose: "ask", Messages: snapshot, Reply: reply.Content}) // 每次回覆都保存(含帶工具呼叫的中間回覆)
		if err != nil {
			result = "error"
			if ctx.Err() != nil {
				result = "cancelled"
			}
			errMsg = errText(err)
			return "", err
		}
		if len(reply.ToolCalls) == 0 {
			replyText = reply.Content // 已由上方保存到對應 request
			a.mu.Lock()
			a.History = append(a.History,
				llm.Message{Role: "user", Content: p.Question},
				llm.Message{Role: "assistant", Content: reply.Content})
			a.mu.Unlock()
			// 對話變長時在回合結束後就先濃縮,讓下一次的預覽 = 實際送出(B7)
			if b := a.ContextTokens; b > 0 && a.historyTokens() > b*2/5 {
				collect := func(purpose string, msgs []llm.Message, reply string, ok bool) {
					requests = append(requests, researchRequest{Purpose: purpose, Messages: append([]llm.Message{}, msgs...), Reply: reply, Ok: &ok})
				}
				a.compactCollect(ctx, emit, collect)
			}
			return reply.Content, nil
		}
		msgs = append(msgs, reply)
		for _, tc := range reply.ToolCalls {
			if !allowed(tc.Name, tools) {
				a.audit(auditRecord{Event: "tool_denied", Tool: tc.Name, Args: tc.Arguments, Detail: "mode=" + p.Mode})
				emit(Event{Kind: "tool", Tool: tc.Name, Args: tc.Arguments, Allowed: false})
				rejectedIDs[tc.ID] = true
				toolCalls = append(toolCalls, researchToolCall{Name: tc.Name, Args: tc.Arguments, Denied: true})
				msgs = append(msgs, llm.Message{Role: "tool", ToolCallID: tc.ID, Content: "錯誤:此工具不存在或本次不被允許。你只能使用: " + strings.Join(names(tools), ", ")})
				continue
			}
			result2, prID, terr := a.runTool(tc.Name, tc.Arguments, g)
			a.audit(auditRecord{Event: "tool_call", Tool: tc.Name, Args: tc.Arguments, Detail: errText(terr)})
			emit(Event{Kind: "tool", Tool: tc.Name, Args: tc.Arguments, Allowed: true})
			toolCalls = append(toolCalls, researchToolCall{Name: tc.Name, Args: tc.Arguments, Err: errText(terr), Denied: rejectedIDs[tc.ID]})
			if terr == nil && prID != "" {
				pIDs = append(pIDs, prID)
			}
			if terr != nil {
				result2 = "錯誤:" + terr.Error()
			}
			msgs = append(msgs, llm.Message{Role: "tool", ToolCallID: tc.ID, Content: result2})
		}
	}
	a.audit(auditRecord{Event: "iter_limit", Detail: fmt.Sprintf("已達上限 %d", a.maxIter())})
	msg := fmt.Sprintf("已達單次對話的工具迭代上限(%d 次),已停止。", a.maxIter())
	emit(Event{Kind: "notice", Text: msg})
	result, errMsg = "error", msg
	return "", fmt.Errorf("%s", msg)
}

// ---- 研究記錄(§12.8):ask 事件的欄位,全部從 agent 內部取得 ----

// researchToolCall 記錄一次工具呼叫(名稱、參數、是否被拒、錯誤)。
type researchToolCall struct {
	Name   string `json:"name"`
	Args   string `json:"args,omitempty"`
	Denied bool   `json:"denied,omitempty"`
	Err    string `json:"err,omitempty"`
}

// researchRequest 記錄一次實際送出的請求:用途、送出的 messages、該次回覆。
// Ok 只用於 compact 請求(§16 第 21 項返工):壓縮是否成功套用;ask 請求不設(nil,
// omitempty 下不會出現在記錄,也不會被誤認為成功)。
type researchRequest struct {
	Purpose  string        `json:"purpose"` // ask | compact
	Messages []llm.Message `json:"messages"`
	Reply    string        `json:"reply,omitempty"` // 該次請求的回覆文字(工具迭代的中間回覆不重複存)
	Ok       *bool         `json:"ok,omitempty"`    // compact:true=成功套用、false=失敗(舊版記錄無此欄)
}

// rlogAsk 寫一筆 ask 事件(含每次實際送出的請求快照、回覆、工具呼叫、本次建立的提案、耗時、結果)。
func (a *Agent) rlogAsk(p AskParams, requests []researchRequest, replyText string, tcs []researchToolCall, pIDs []string, start time.Time, result, errMsg string) {
	if a.Research == nil || !a.Research.Enabled() {
		return
	}
	d := map[string]any{
		"model": a.Model, "remote": a.ResearchRemote(), "mode": p.Mode, "doc": p.Doc,
		"selectionLen": len([]rune(p.Selection)), "attachments": p.Attachments, "priorSummaries": p.PriorSummaries,
		"sent": len(requests) > 0, // 未送出就失敗(前置錯誤、超預算)時 false
		"requests": requests, "reply": replyText, "toolCalls": tcs,
		"proposalIds": pIDs, "elapsedMs": time.Since(start).Milliseconds(),
		"result": result, "error": errMsg,
	}
	// 快速指令來源(§16 第 21 項):非快速指令來源不寫這兩個欄位。
	if p.QuickID != "" {
		d["quickId"] = p.QuickID
		d["quickEdited"] = p.QuickEdited
	}
	a.Research.Log("ask", d)
}

// ResearchRemote 回傳目前模型端點是否在本機之外(研究記錄用;由 App 在 prepare 時設定)。
func (a *Agent) ResearchRemote() bool { return a.Remote }

const summaryPrompt = `你是輕小說編輯助手。為下面這一章寫一份「之後寫作時參考用」的摘要,300 字以內,條列:
1. 主要事件(依發生順序)
2. 登場人物與其狀態、關係的變化
3. 新揭露的設定或資訊
4. 埋下的伏筆與未解之謎
只根據本章內容,不要評論,不要推測後續。`

// DraftSummary 請模型草擬章節摘要。結果只回傳給介面,不寫入任何檔案(B6)。
func (a *Agent) DraftSummary(ctx context.Context, chapter string, emit func(Event)) (string, error) {
	if project.KindOf(chapter) != project.ManuscriptDir {
		return "", fmt.Errorf("只能為稿件章節產生摘要")
	}
	text, err := a.Proj.ReadFile(chapter)
	if err != nil {
		return "", err
	}
	a.audit(auditRecord{Event: "summary_draft", Detail: chapter})
	reply, err := a.LLM.Chat(ctx, llm.Request{Model: a.Model, Messages: []llm.Message{
		{Role: "system", Content: summaryPrompt},
		{Role: "user", Content: "【章節】" + chapter + "\n" + text},
	}}, func(s string) { emit(Event{Kind: "delta", Text: s}) })
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(reply.Content), nil
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
