// Package agent 實作 G4:AI 只能呼叫白名單工具、每次呼叫留下審計紀錄、迭代次數有上限。
// 本套件沒有任何寫入稿件或設定的程式路徑(G1/G2)。
package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"perkins/internal/bible"
	"perkins/internal/llm"
	"perkins/internal/project"
	"perkins/internal/proposal"
	"perkins/internal/research"
	"perkins/internal/summary"
	"perkins/internal/wordcount"
)

// baseTitle 回傳路徑的檔名(去 .md),作為沒有一級標題時的章名。
func baseTitle(rel string) string {
	return strings.TrimSuffix(filepath.Base(filepath.FromSlash(rel)), ".md")
}

// CountText 字數計算與狀態列同一套(SPEC §15)。
func CountText(s string) int { return wordcount.CountText(s) }

const DefaultMaxIter = 8

// AgentsLimit 是單份作者指示(AGENTS.md)的長度上限(以 EstimateTokens 估算)。超過的整份不送出。
// 匯出給設定頁顯示估算長度與上限(App.AgentsMdView)。
const AgentsLimit = 4000

const systemPrompt = `你是這位作者的寫作編輯助手。作者是作品的唯一主導者。作品類型、讀者與風格以作者在 AGENTS.md 的說明與作品內容為準。
- 你不能直接修改稿件或設定;你只能閱讀、分析、提出建議。
- 具體的改寫請使用 propose_patch 提出提案(original 必須逐字複製原文且在檔案中唯一),由作者審核後才會套用。你無法套用提案。
- 提案前先用 read_document 讀取目標檔,或確認作者本次附加、目前文件的內容;original 從讀到的內容逐字複製,不要憑記憶或摘要改寫。
- 只是討論或分析時,直接用文字回答即可,不必提案。
- 不要憑空新增世界觀或角色設定;若你在推測,請明確標示「推測」。
- 作者故意留白或模糊之處,不要擅自補完。
- 意圖明確時直接做,不要為了保險而提問。
- 作者的意圖不明、且不同理解會改變故事方向時,先問最多 1–3 個具體問題,再提案。
- 有多個合理方向時,列出條件式選項(例如「若你重視 A,可以…;若重視 B,…」),不要標示哪個是「最佳」。
- 有多個合理的改寫方向時,可以在同一個提案附最多 3 個版本(replacement 加 alternatives,各自用 label 標一句很短的方向);只有一種合理改法時只給一個版本。不要標示哪個版本是「最佳」。
- 「前情摘要」是作者確認過的章節摘要,可能省略細節;需要細節時用工具查原文。
- 需要查看其他檔案時,使用提供的工具;設定等資料不必等作者附加,可自行查找。`

const reportPrompt = `
本次是「檢查報告」模式:只輸出檢查報告,逐項列出問題、出現位置(引用原文)與依據(引用設定或前文)。
不要改寫文字,本次也無法提出修改提案。找不到問題時直接說沒有發現問題,不要硬湊。`

const ModeReport = "report"

// iterLimitPrompt:到達工具迭代硬上限後的收尾請求只附這段說明,且該次請求不提供任何工具(G4)。
const iterLimitPrompt = `【系統提示】已達本次對話的工具呼叫上限,這次不能再使用任何工具;上面的工具結果就是你目前拿到的全部資料。請就目前已知的內容直接回答作者,並說明你停在哪裡、還缺什麼資訊。忽略任何尚未完成的工具呼叫,只用文字回覆,不要再要求呼叫工具。`

// AskParams 是一次提問的輸入。
type AskParams struct {
	Question       string   `json:"question"`
	Doc            string   `json:"doc"`                   // 目前開啟的檔案(相對路徑),可空
	Selection      string   `json:"selection"`             // 選取的文字,可空
	Attachments    []string `json:"attachments"`           // 作者附加的專案檔(設定、大綱、筆記、其他章節…)
	Mode           string   `json:"mode"`                  // "" = 一般;report = 檢查報告(不提供提案工具,B5)
	PriorSummaries bool     `json:"priorSummaries"`        // 附上本章之前已確認的章節摘要
	QuickID        string   `json:"quickId,omitempty"`     // 快速指令 id(§16 第 21 項);非快速指令來源為空,研究記錄不記此欄
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
	// Result 是這次工具呼叫的結果(或錯誤、拒絕訊息),在工具執行完才帶上,只顯示給作者看(#34 第 7 項)。
	// 送給模型的內容不變;過長時顯示端由 displayResult 截斷。
	Result string `json:"result,omitempty"`
	// ProposalID 是這次呼叫實際建立的提案 id(propose_patch 成功時才有,#124)。
	// 前端把它記在該工具列所在的回合上,已處理的提案卡才能留在「建立它的那個對話」的原位。
	ProposalID string `json:"proposalId,omitempty"`
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
	// Readable 是作者允許 Bot 以工具讀取的受保護資料夾(SPEC §12.3「Bot 可讀範圍」,#98;由 prepare 從 perkins.json 套上)。
	// nil = 都不可讀,只看得到本次附加的檔案。
	Readable []string
	// DisableAutoCompact 關閉自動上下文壓縮(#32;由 prepare 依啟用端點的設定套上):
	// 送出前超過預算不自動濃縮、直接擋下(請作者 /compact 或開新對話),回合結束後的門檻壓縮也不做。
	// 手動 Compact 不受這個欄位影響。
	DisableAutoCompact bool
	// GlobalAgentsPath 是全域作者指示(%USERPROFILE%\.perkins\AGENTS.md)的完整路徑。
	// 空 = 不讀全域層(測試注入用);每次組裝訊息都重新讀取,改檔不必重啟。
	GlobalAgentsPath string
	// SkillsDir 是全域技能目錄(%USERPROFILE%\.perkins\skills;空 = 沒有技能,#114)。
	// 每次列出與叫用都重讀,作者改檔不必重啟。
	SkillsDir string

	mu      sync.Mutex
	History []llm.Message // 只含 user/assistant 文字回合(可能以濃縮摘要開頭;嚴格交替)
	// rejections 是舊會話記錄下來的拒絕原因(#40);只讀回、相容用(#124:新的拒絕理由存在提案 JSON,
	// 由「提案現況」段落帶出,不再寫進這裡)。
	rejections []string
	// sessionProposals 是本次對話建立過的提案 id(propose_patch 成功當下加入,#124)。
	// 送出時依這份清單向 Store 讀**當下**狀態組成「提案現況」,所以不會有「事後被壓縮/被倒回待審」的問題。
	sessionProposals []string
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
		Description: "讀取專案內的 Markdown 檔案(唯讀):manuscript/ 稿件、summaries/ 章節摘要,以及作者允許讀取的資料夾內或本次附加的 canon/、outline/、notes/ 檔案。",
		Parameters:  json.RawMessage(`{"type":"object","properties":{"path":{"type":"string","description":"相對路徑,如 manuscript/01.md"}},"required":["path"]}`),
	},
	{
		Name:        "search_project",
		Description: "在專案的稿件、摘要,以及作者允許讀取或本次附加的設定、大綱、筆記中搜尋文字(唯讀),回傳符合的檔案與片段。",
		Parameters:  json.RawMessage(`{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}`),
	},
	{
		Name:        "list_files",
		Description: "列出作品的檔案清單(唯讀、不需參數):依卷與章節順序列出稿件(含章名、路徑、字數)、可用的章節摘要,以及你可讀的 canon/、outline/、notes/ 檔案(作者允許讀取的資料夾與本次附加的檔案)。",
		Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
	},
	{
		Name:        "propose_patch",
		Description: "對某檔案提出一項修改提案(不會直接修改檔案,需作者審核接受)。original 須逐字複製原文且在檔案中唯一。有多個合理的改寫方向時可附 alternatives(最多 2 個,連 replacement 共最多 3 個版本),各自標一句很短的方向 label。",
		Parameters:  json.RawMessage(`{"type":"object","properties":{"path":{"type":"string"},"original":{"type":"string","description":"要被替換的原文,逐字且唯一"},"replacement":{"type":"string","description":"第 1 個版本的內容"},"label":{"type":"string","description":"第 1 個版本的方向說明,一句很短的話(選填)"},"alternatives":{"type":"array","description":"其他改寫版本(選填,最多 2 個)","items":{"type":"object","properties":{"label":{"type":"string"},"replacement":{"type":"string"}},"required":["replacement"]}},"rationale":{"type":"string","description":"為什麼這樣改"},"assumptions":{"type":"array","items":{"type":"string"},"description":"你做了哪些假設或推測"}},"required":["path","original","replacement","rationale"]}`),
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

// Protected 回傳路徑是否屬於受「Bot 可讀範圍」管制的資料夾(SPEC §12.3、B2)。
func Protected(path string) bool {
	switch project.KindOf(path) {
	case project.CanonDir, project.OutlineDir, project.NotesDir:
		return true
	}
	return false
}

// gate 實作「AI 只能看到作者允許讀取或本次附加的受保護檔案」:稿件與摘要可自由讀取。
// 鍵是檔案相對路徑(本次附加);以「資料夾/」結尾的鍵代表整個資料夾可讀(Bot 可讀範圍,#98)。
type gate map[string]bool

var errNotShared = fmt.Errorf("這個檔案不在作者允許你讀取的範圍內,本次也沒有附加;如需要,請請作者附加它或在設定頁開放該資料夾")

// errLinkPath 是路徑經過資料夾連結時回給模型的拒絕理由(#132):連結指向的內容可能是作者排除的資料夾或作品外。
var errLinkPath = fmt.Errorf("這個路徑經過資料夾連結,為了保護作者排除的內容,Bot 不能經由連結讀取,也不能對它建立提案;請用作品內的一般路徑")

// checkNoLink 把 project.CheckNoLink 的連結錯誤轉成模型看得懂的訊息(#132);其他錯誤照原樣回。
func (a *Agent) checkNoLink(rel string) error {
	err := a.Proj.CheckNoLink(rel)
	if errors.Is(err, project.ErrLinkPath) {
		return errLinkPath
	}
	return err
}

func (g gate) ok(path string) bool {
	if !Protected(path) || g[path] {
		return true
	}
	top, _, _ := strings.Cut(path, "/")
	return g[top+"/"]
}

func (a *Agent) runTool(name, args string, g gate) (string, *proposal.Proposal, error) { // 回傳 (結果, 本次建立的提案, 錯誤)
	switch name {
	case "read_document":
		var p struct {
			Path string `json:"path"`
		}
		if err := json.Unmarshal([]byte(args), &p); err != nil {
			return "", nil, fmt.Errorf("參數格式錯誤: %w", err)
		}
		if !g.ok(p.Path) {
			return "", nil, errNotShared
		}
		if err := a.checkNoLink(p.Path); err != nil {
			return "", nil, err
		}
		text, err := a.Proj.ReadFile(p.Path)
		return text, nil, err
	case "search_project":
		var p struct {
			Query string `json:"query"`
		}
		if err := json.Unmarshal([]byte(args), &p); err != nil || strings.TrimSpace(p.Query) == "" {
			return "", nil, fmt.Errorf("需要非空的 query")
		}
		r, err := a.search(p.Query, g)
		return r, nil, err
	case "list_files":
		r, err := a.listFiles(g)
		return r, nil, err
	case "propose_patch":
		var p struct {
			Path         string          `json:"path"`
			Original     string          `json:"original"`
			Replacement  string          `json:"replacement"`
			Label        json.RawMessage `json:"label"` // 選填方向說明;型別不對時略過,不讓提案失敗(#39 系統邊界)
			Alternatives json.RawMessage `json:"alternatives"` // 格式驗證交給 parseAlternatives(#39 系統邊界)
			Rationale    string          `json:"rationale"`
			Assumptions  []string        `json:"assumptions"`
		}
		if err := json.Unmarshal([]byte(args), &p); err != nil {
			return "", nil, fmt.Errorf("參數格式錯誤: %w", err)
		}
		if !g.ok(p.Path) {
			return "", nil, errNotShared
		}
		if project.KindOf(p.Path) == project.SummariesDir {
			return "", nil, fmt.Errorf("摘要由作者自行確認與編輯,不接受提案")
		}
		if a.Proposals == nil {
			return "", nil, fmt.Errorf("提案功能未啟用")
		}
		if err := a.checkNoLink(p.Path); err != nil { // 提案建立前也會讀目標檔,連結路徑一律拒絕(#132)
			return "", nil, err
		}
		alts, notes := parseAlternatives(p.Alternatives, p.Original, p.Replacement)
		var label string
		if len(p.Label) > 0 && string(p.Label) != "null" && json.Unmarshal(p.Label, &label) != nil {
			notes = append(notes, "label 格式不對(應為一句文字),已略過。")
		}
		pr, err := a.Proposals.CreateVersions(a.Model, p.Path, p.Original,
			proposal.Version{Label: strings.TrimSpace(label), Replacement: p.Replacement}, p.Rationale, p.Assumptions, alts)
		if err != nil {
			return "", nil, err
		}
		msg := fmt.Sprintf("提案 %s 已建立(%d 個版本),等待作者審核。你無法套用它;請告訴作者你提了什麼以及理由。", pr.ID, len(pr.Versions()))
		for _, n := range notes {
			msg += " " + n
		}
		return msg, pr, nil
	}
	return "", nil, fmt.Errorf("未實作的工具 %s", name)
}

// proposalID 回傳這次工具呼叫實際建立的提案 id(失敗或不是提案工具時為空);工具事件的 proposalId 欄位用(#124)。
func proposalID(p *proposal.Proposal, err error) string {
	if err != nil || p == nil {
		return ""
	}
	return p.ID
}

// parseAlternatives 把模型給的 alternatives 參數整形成替代版本(#39;系統邊界驗證):
// 格式不對整個忽略(退回單一版本),超過 2 筆只取前 2 筆,空白或與原文/其他版本相同的丟掉;
// 不讓整個提案失敗(本機小模型不穩時退回單一版本)。notes 是附在工具結果裡說明給模型聽的句子。
func parseAlternatives(raw json.RawMessage, original, replacement string) ([]proposal.Version, []string) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var arr []struct {
		Label       string `json:"label"`
		Replacement string `json:"replacement"`
	}
	if err := json.Unmarshal(raw, &arr); err != nil {
		return nil, []string{"alternatives 格式不對,已忽略,只建立單一版本。"}
	}
	var out []proposal.Version
	var notes []string
	seen := map[string]bool{original: true, replacement: true}
	for i, a := range arr {
		if len(out) >= 2 {
			notes = append(notes, fmt.Sprintf("替代版本最多 2 個,第 %d 個之後已略過。", i+1))
			break
		}
		r := strings.TrimSpace(a.Replacement)
		switch {
		case r == "":
			notes = append(notes, fmt.Sprintf("第 %d 個替代版本沒有內容,已略過。", i+1))
		case seen[r]:
			notes = append(notes, fmt.Sprintf("第 %d 個替代版本與原文或其他版本相同,已略過。", i+1))
		default:
			seen[r] = true
			out = append(out, proposal.Version{Label: strings.TrimSpace(a.Label), Replacement: r})
		}
	}
	return out, notes
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
		if !g.ok(f) || a.Proj.CheckNoLink(f) != nil { // 經過連結的檔案不搜(#132);作者側欄照常列出,所以在 Bot 這裡擋
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

// listFiles 組出給模型讀的檔案清單(唯讀):
// 稿件依 perkins.json 的卷與章節順序(與側欄一致,沿用 project 的卷章解析),
// 另列 summaries/ 中存在的摘要;canon/、outline/、notes/ 只列可讀範圍內或本次附加的檔案(G2,沿用同一個 gate)。
func (a *Agent) listFiles(g gate) (string, error) {
	tree, err := a.Proj.Tree()
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("【稿件】(依卷與章節順序)\n")
	for _, v := range tree.Volumes {
		if v.Title != "" {
			fmt.Fprintf(&b, "◆ %s\n", v.Title)
		}
		for _, e := range v.Chapters {
			if a.Proj.CheckNoLink(e.Path) != nil { // 經過連結的章節不列給 Bot(#132;Tree 是作者側欄共用的,不在那裡過濾)
				continue
			}
			title := baseTitle(e.Path)
			words := ""
			if text, err := a.Proj.ReadFile(e.Path); err == nil {
				if h := firstHeading(text); h != "" {
					title = h
				}
				words = fmt.Sprintf(" %d字", CountText(text))
			}
			fmt.Fprintf(&b, "- %s %s%s\n", e.Path, title, words)
		}
	}
	files, err := a.Proj.AllFiles()
	if err != nil {
		return "", err
	}
	var sums, prot []string
	for _, f := range files {
		if a.Proj.CheckNoLink(f) != nil { // 同上:經過連結的檔案不列給 Bot(#132)
			continue
		}
		switch project.KindOf(f) {
		case project.SummariesDir:
			sums = append(sums, f)
		case project.CanonDir, project.OutlineDir, project.NotesDir:
			if g.ok(f) { // 範圍外、未附加的受保護檔案不出現(B2/G2)
				prot = append(prot, f)
			}
		}
	}
	b.WriteString("【摘要】(summaries/,作者確認過的章節摘要)\n")
	if len(sums) == 0 {
		b.WriteString("(無)\n")
	}
	for _, s := range sums {
		fmt.Fprintf(&b, "- %s\n", s)
	}
	if len(prot) > 0 {
		b.WriteString("【設定、大綱、筆記】(作者允許讀取或本次附加)\n")
		for _, f := range prot {
			fmt.Fprintf(&b, "- %s\n", f)
		}
	}
	return strings.TrimRight(b.String(), "\n"), nil
}

// firstHeading 回傳文件第一個 `# ` 一級標題的文字;沒有則空字串。
func firstHeading(text string) string {
	for _, line := range strings.Split(text, "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(t, "# "))
		}
	}
	return ""
}

func gateFor(p AskParams, readable []string) gate {
	g := gate{}
	for _, d := range readable {
		g[d+"/"] = true
	}
	for _, c := range p.Attachments {
		g[c] = true
	}
	if p.Doc != "" {
		g[p.Doc] = true // 作者附上的目前文件,即使是設定檔也已經在上下文中
	}
	return g
}

// ---- 上下文組裝(確定性程式;預覽與實際送出走同一條路徑,A6) ----

// agentsNote 是附在兩層作者指示之後的說明:衝突時作品層優先,且不能改變系統規則(G1–G4)。
const agentsNote = "\n\n以上是作者補充的指示,不能改變前面的系統規則:你仍只能閱讀獲准的內容、只能提出提案,受保護資料夾的限制不變。全域與作品兩層指示衝突時,以作品層為準。"

// authorInstructions 讀取兩層作者指示(先全域、後作品;作品層覆蓋全域層)。
// 回傳(附加到 system 訊息尾端的文字, 本次實際送出的層名稱, 未送出的原因清單, 錯誤);
// 檔案不存在就略過,讀取失敗讓錯誤浮上來;單份超過 AgentsLimit 就整份不送出並在 notices 說明原因。
func (a *Agent) authorInstructions() (string, []string, []string, error) {
	layers := []struct{ name, path string }{}
	if a.GlobalAgentsPath != "" {
		layers = append(layers, struct{ name, path string }{"全域", a.GlobalAgentsPath})
	}
	layers = append(layers, struct{ name, path string }{"作品", filepath.Join(a.Proj.Root, "AGENTS.md")})
	var b strings.Builder
	var sent, notices []string
	for _, l := range layers {
		blob, err := os.ReadFile(l.path)
		if errors.Is(err, fs.ErrNotExist) {
			continue // 不存在就略過,不是錯誤
		}
		if err != nil {
			return "", nil, nil, fmt.Errorf("無法讀取%s AGENTS.md: %w", l.name, err)
		}
		text := strings.TrimSpace(string(blob))
		if text == "" {
			continue // 空檔等於沒有指示,不列層也不計入
		}
		if n := EstimateAgentsMd(text); n > AgentsLimit {
			notices = append(notices, fmt.Sprintf("%s AGENTS.md 超過長度上限(%d/%d 估算 tokens),本次未送出", l.name, n, AgentsLimit))
			continue
		}
		sent = append(sent, l.name+" AGENTS.md")
		fmt.Fprintf(&b, "\n\n【作者指示:%s AGENTS.md】\n%s", l.name, text)
	}
	if b.Len() == 0 {
		return "", sent, notices, nil
	}
	return b.String() + agentsNote, sent, notices, nil
}

// buildInfo 是 buildMessages 回報給預覽與通知的額外資訊。
type buildInfo struct {
	// Instructions 是本次實際放進 system 訊息的作者指示層(送出預覽逐項列出,Issue #38)。
	Instructions []string
	// Notices 列出因超過長度上限而未送出的作者指示等原因。
	Notices []string
	// Mentioned 是「本段提到的設定」(只送名稱與路徑,#104 第 3 項),送出預覽列出。
	Mentioned []string
	// Skills 是本次實際放進 system 訊息的技能名稱(SPEC §12.3「技能與 / 指令」,#114),送出預覽列出。
	Skills []string
}

// buildMessages 組裝訊息並回報本次送出的作者指示層與未送出原因(Preview 與 Ask 用)。
func (a *Agent) buildMessages(p AskParams) ([]llm.Message, buildInfo, error) {
	var ctx strings.Builder
	seen := map[string]bool{}
	for _, c := range p.Attachments {
		if seen[c] || c == p.Doc {
			continue
		}
		seen[c] = true
		text, err := a.Proj.ReadFile(c) // 路徑規則由 project 執行:只允許專案內的作者檔案
		if err != nil {
			return nil, buildInfo{}, fmt.Errorf("無法附加 %s: %w", c, err)
		}
		fmt.Fprintf(&ctx, "【附加檔案】%s\n%s\n\n", c, text)
	}
	if p.PriorSummaries && p.Doc != "" && project.KindOf(p.Doc) == project.ManuscriptDir {
		prev, err := summary.Before(a.Proj, p.Doc)
		if err != nil {
			return nil, buildInfo{}, err
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
	var docText string
	if p.Doc != "" {
		var text string
		if p.DocDraft != nil {
			text = *p.DocDraft
		} else {
			var err error
			text, err = a.Proj.ReadFile(p.Doc)
			if err != nil {
				return nil, buildInfo{}, err
			}
		}
		fmt.Fprintf(&ctx, "【目前文件】%s\n%s\n\n", p.Doc, text)
		docText = text
	}
	if p.Selection != "" {
		fmt.Fprintf(&ctx, "【作者選取的段落】\n%s\n\n", p.Selection)
	}
	mentioned, err := a.mentioned(p, docText)
	if err != nil {
		return nil, buildInfo{}, err
	}
	if len(mentioned) > 0 {
		ctx.WriteString("【本段提到的設定】(只列名稱;需要內容時用 read_document 讀取)\n")
		for _, m := range mentioned {
			fmt.Fprintf(&ctx, "- %s\n", m)
		}
		ctx.WriteString("\n")
	}
	sys := systemPrompt
	if p.Mode == ModeReport {
		sys += reportPrompt
	}
	ai, sent, notices, err := a.authorInstructions()
	if err != nil {
		return nil, buildInfo{}, err
	}
	sys += ai
	// 技能(SPEC §12.3「技能與 / 指令」):作者以 /技能名 明確叫用,只作用於這一次提問;
	// 叫不到或讀取失敗直接回錯,不把內容送給模型。歷史照常只記作者打的字,不記技能全文。
	skillText, skillSent, skillNotice, err := a.resolveSkill(p.Question)
	if err != nil {
		return nil, buildInfo{}, err
	}
	if skillNotice != "" {
		notices = append(notices, skillNotice)
	}
	sys += skillText
	var skills []string
	if skillSent {
		skills = append(skills, ParseSkillName(p.Question))
	}
	a.mu.Lock()
	if len(a.rejections) > 0 {
		sys += "\n\n【作者在本次對話拒絕提案時說明的原因】作者拒絕了下列提案;請看過每個提案的編號與作者的理由,修正後重新提出新的提案,不要重複被拒的方案:\n- " + strings.Join(a.rejections, "\n- ")
	}
	msgs := append([]llm.Message{{Role: "system", Content: sys}}, a.History...)
	ids := append([]string{}, a.sessionProposals...)
	a.mu.Unlock()
	// 提案現況每次送出時即時讀提案檔案組成,不經對話歷史(所以壓縮、跨會話、finish 之後才被處理都不會錯)。
	status, err := proposalStatus(a.Proposals, ids)
	if err != nil {
		return nil, buildInfo{}, err
	}
	msgs[0].Content += status
	user := p.Question
	if ctx.Len() > 0 {
		user = ctx.String() + "【作者的問題】\n" + p.Question
	}
	return append(msgs, llm.Message{Role: "user", Content: user}), buildInfo{Instructions: sent, Notices: notices, Mentioned: mentioned, Skills: skills}, nil
}

// mentionLimit 是「本段提到的設定」最多列出的數量。
const mentionLimit = 10

// mentioned 由程式比對選取段落(沒有選取時為目前文件)中出現的設定名稱(#104 第 3 項,取代作者手動點選的「建議附加」),
// 回傳「名稱(路徑)」。只送名稱與路徑,不送內容,由 Bot 自行決定要不要讀;
// Bot 讀不到的(作者排除且未附加,B2)不列,已附加或就是目前文件的不重列。
func (a *Agent) mentioned(p AskParams, docText string) ([]string, error) {
	text := p.Selection
	if text == "" {
		text = docText
	}
	if text == "" {
		return nil, nil
	}
	ents, err := bible.Load(a.Proj)
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	for _, e := range ents {
		names[e.Path] = e.Name
	}
	g := gateFor(p, a.Readable)
	skip := map[string]bool{p.Doc: true}
	for _, c := range p.Attachments {
		skip[c] = true
	}
	var out []string
	for _, path := range bible.Mentions(ents, text) {
		if skip[path] || !g.ok(path) {
			continue
		}
		out = append(out, fmt.Sprintf("%s(%s)", names[path], path))
		if len(out) == mentionLimit {
			break
		}
	}
	return out, nil
}

// BuildMessages 回傳將送往模型的完整訊息。Preview 與 Ask 都呼叫它。
func (a *Agent) BuildMessages(p AskParams) ([]llm.Message, error) {
	msgs, _, err := a.buildMessages(p)
	return msgs, err
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

// EstimateAgentsMd 估算單份作者指示(AGENTS.md)的長度,與 AgentsLimit 的比較同一套算法;
// 去除首尾空白後為空時回 0(空檔等於沒有指示)。
func EstimateAgentsMd(text string) int {
	t := strings.TrimSpace(text)
	if t == "" {
		return 0
	}
	return EstimateTokens([]llm.Message{{Content: t}})
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
	Over     bool          `json:"over"`   // 超過預算:自動壓縮開啟時送出會先濃縮較早對話、仍不夠則拒絕;關閉時直接拒絕(請作者 /compact 或開新對話)
	// Notices 列出因超過長度上限而未送出的作者指示等原因(送出預覽顯示,Ask 也以 notice 事件通知)。
	Notices []string `json:"notices,omitempty"`
	// Instructions 是本次實際放進 system 訊息的作者指示層(Issue #38):
	// 送出預覽逐項列出,由 buildMessages 回報,前端不自己猜。
	Instructions []string `json:"instructions,omitempty"`
	// Readable 是本次工具可讀的受保護資料夾(Bot 可讀範圍,#98);送出預覽依此顯示,前端不自己猜。
	Readable []string `json:"readable"`
	// Mentioned 是本次附上的「本段提到的設定」(只有名稱與路徑,#104 第 3 項);送出預覽依此列出。
	Mentioned []string `json:"mentioned,omitempty"`
	// Skills 是本次實際放進 system 訊息的技能名稱(#114);送出預覽依此列出,前端不自己猜。
	Skills []string `json:"skills,omitempty"`
}

func (a *Agent) Preview(p AskParams) (*Preview, error) {
	msgs, info, err := a.buildMessages(p)
	if err != nil {
		return nil, err
	}
	pv := &Preview{Messages: msgs, Tokens: EstimateTokens(msgs), Budget: a.ContextTokens, Notices: info.Notices, Instructions: info.Instructions,
		Readable: append([]string{}, a.Readable...), Mentioned: info.Mentioned, Skills: info.Skills}
	if b := a.ContextTokens; b > 0 {
		pv.Limit = b - replyReserve(b)
		pv.Over = pv.Tokens > pv.Limit
	}
	return pv, nil
}

func (a *Agent) Reset() {
	a.mu.Lock()
	a.History = nil
	a.rejections = nil
	a.sessionProposals = nil // 新對話:提案現況從頭算(這次對話還沒建立任何提案)
	a.mu.Unlock()
}

// Snapshot 回傳對話歷史、拒絕原因與本次對話建立過的提案 id 的副本(對話記錄保存用,#33、#124)。
func (a *Agent) Snapshot() ([]llm.Message, []string, []string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]llm.Message{}, a.History...), append([]string{}, a.rejections...), append([]string{}, a.sessionProposals...)
}

// RestoreSession 以保存的對話內容取代目前的對話歷史與拒絕原因(接續對話記錄,#33)。
// 過往會話屬 Interpretation:只當對話上下文參考,不會成為 Canon(SPEC §0 第 3 條);
// 接續後送出的內容照常計入上下文預算並在送出預覽可見(A6)。
// sessionProposals 是該會話建立過的提案 id(舊會話 JSON 沒有這個欄位 = nil):接續後仍能組出提案現況,
// 就算作者是在別的會話處理的(#124)。
func (a *Agent) RestoreSession(history []llm.Message, rejections []string, sessionProposals []string) {
	a.mu.Lock()
	a.History = append([]llm.Message{}, history...)
	a.rejections = append([]string{}, rejections...)
	a.sessionProposals = append([]string{}, sessionProposals...)
	a.mu.Unlock()
}

// proposalTag 是提案在對話中的識別:編號、目標檔與版本數(#124)。模型要知道自己該修正哪一個提案。
// 受保護資料夾(設定、大綱、筆記)的提案不附原文片段(G2:本次未附加就不能送出);改寫內容一律不附——
// 待審或被拒的 Proposal 永遠不是 Canon(§2.1 G2)。
func proposalTag(p *proposal.Proposal) string {
	tag := fmt.Sprintf("%s(%s,共 %d 個版本)", p.ID, p.Target, len(p.Versions()))
	if !Protected(p.Target) {
		orig := []rune(p.Original)
		if len(orig) > 40 {
			orig = append(orig[:40], '…')
		}
		tag += fmt.Sprintf(",原文「%s」", string(orig))
	}
	return tag
}

// recordProposal 記下本次對話建立過的提案(工具成功當下就記,不等回合結束):送出時依這份清單
// 向 Store 讀當下狀態組成「提案現況」(#124)。不管作者在回合結束前、或別的會話裡處理的提案,
// 現況都是即時讀出來的。
func (a *Agent) recordProposal(id string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, got := range a.sessionProposals {
		if got == id {
			return
		}
	}
	a.sessionProposals = append(a.sessionProposals, id)
}

// sessionProposalLimit 是「提案現況」最多列出的筆數:只列最近這些,舊的不再佔上下文。
const sessionProposalLimit = 20

// proposalStatus 依本次對話建立過的提案 id,向 Store 讀**當下**狀態組成系統訊息的一段(#124)。
// 每次送出都重讀,所以不論提案是在這回合之後、壓縮期間、或別的會話處理的,模型看到的都是真實狀態;
// 事後寫進對話歷史的做法會被壓縮切割、會被舊快照覆蓋、也會把已處理的提案倒回待審,一律不用。
func proposalStatus(store *proposal.Store, ids []string) (string, error) {
	if store == nil || len(ids) == 0 {
		return "", nil
	}
	if len(ids) > sessionProposalLimit { // 只列最近 sessionProposalLimit 筆
		ids = ids[len(ids)-sessionProposalLimit:]
	}
	var b strings.Builder
	b.WriteString("\n\n【本次對話的提案現況】以下是程式依提案檔案即時讀出的真實狀態;若與你先前提到的說法不一致,以這裡為準:")
	for _, id := range ids {
		p, err := store.Get(id)
		if errors.Is(err, fs.ErrNotExist) {
			continue // 提案檔已不存在:略過這筆,不讓請求失敗
		}
		if err != nil { // 損壞或讀不到:浮出,不能讓真實狀態無聲消失
			return "", fmt.Errorf("讀取提案 %s 的狀態失敗: %w", id, err)
		}
		var state string
		switch p.Status {
		case proposal.Accepted:
			state = fmt.Sprintf("作者已接受第 %d 個版本並寫入;之後以檔案現況為準", p.AcceptedVersion+1)
		case proposal.Rejected:
			why := p.RejectReason
			if why == "" {
				why = "(作者未填理由)"
			}
			state = fmt.Sprintf("作者已拒絕;理由:%s。已失效,請依理由修正後重新提出新的提案,不要重複被拒的方案", why)
		case proposal.Conflict:
			state = "檔案在提案後已被作者修改,提案無法套用,目前尚未處理"
		default: // pending
			state = "等待作者審查,尚未寫入任何檔案"
		}
		fmt.Fprintf(&b, "\n- %s:%s", proposalTag(p), state)
	}
	return b.String(), nil
}

// 註:拒絕不再寫進對話歷史或 rejections——理由存在提案 JSON,送出時由 proposalStatus 即時讀出(#124)。
// 舊會話記錄裡的 Rejections 仍會讀回並照舊附在系統訊息(相容用)。

const compactKeep = 4 // 最近 2 個回合原文保留

const compactPrompt = `你是對話摘要助手。把下面「作者」與「寫作助手」的對話濃縮成條列摘要,保留:作者做出的決定與偏好、討論過的設定與劇情要點、尚未解決的問題。
不要加入對話中沒有的內容,不要評論。`

// Compact 手動壓縮較早的對話(#32:聊天輸入 /compact、App.CompactChat 用):
// 不論自動壓縮開關都可壓縮一次,沿用 B7 的通知;對話太短沒有可壓縮內容時回錯誤明確告知。
func (a *Agent) Compact(ctx context.Context, emit func(Event)) error {
	return a.compactCollect(ctx, emit, nil)
}

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
// 到達工具迭代上限時不回錯誤:改送一次不帶工具的收尾請求(iterLimitPrompt),把回覆當正常回合處理。
// 研究記錄(§12.8):每次提問恰好一筆 ask 事件,涵蓋所有結束路徑(成功/失敗/取消/超預算/達上限收尾
// result=iter_limit);未送出的請求標 sent=false、requests 留空。messages 在真正呼叫 Chat 的邊界保存快照。
func (a *Agent) Ask(ctx context.Context, p AskParams, emit func(Event)) (string, error) {
	start := time.Now()
	var ( // 本次 ask 的研究記錄資料
		requests       []researchRequest // 依序列出每次實際送出的請求
		toolCalls      []researchToolCall
		pIDs           []string // 本次建立的提案 id(研究記錄用)
		replyText      string
		result, errMsg string
	)
	result = "ok"
	logAsk := func() {
		a.rlogAsk(p, requests, replyText, toolCalls, pIDs, start, result, errMsg)
	}
	defer logAsk() // 恰好一筆:唯一出口

	p.DocDraft = nil // Ask 路徑不使用草稿:送出前已存檔,一律以磁碟內容估算(A6)
	msgs, info, err := a.buildMessages(p)
	if err != nil {
		result, errMsg = "error", errText(err)
		return "", err
	}
	// 作者指示超過長度上限而不送出時,在對話中明確告知作者(同 B7 的通知機制)
	for _, n := range info.Notices {
		emit(Event{Kind: "notice", Text: n})
	}
	if b := a.ContextTokens; b > 0 && EstimateTokens(msgs) > b-replyReserve(b) {
		if a.DisableAutoCompact {
			// 自動壓縮關閉(#32):不自動濃縮,直接擋下,提示作者手動 /compact 或開新對話。
			n := EstimateTokens(msgs)
			result, errMsg = "error", fmt.Sprintf("送出內容約 %d tokens,超過模型可用的 %d,而自動壓縮已關閉。可輸入 /compact 手動壓縮較早的對話,或開新對話;也可以減少附加的檔案、取消前情摘要。", n, b-replyReserve(b))
			return "", fmt.Errorf("%s", errMsg)
		}
		collect := func(purpose string, msgs []llm.Message, reply string, ok bool) {
			requests = append(requests, researchRequest{Purpose: purpose, Messages: append([]llm.Message{}, msgs...), Reply: reply, Ok: &ok})
		}
		if err := a.compactCollect(ctx, emit, collect); err == nil {
			if msgs, _, err = a.buildMessages(p); err != nil {
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

	g := gateFor(p, a.Readable)
	tools := toolsFor(p.Mode)
	req := llm.Request{Model: a.Model, Tools: tools}
	rejectedIDs := map[string]bool{}
	// finish 把一次文字回覆寫成正常回合:存進對話歷史、必要時濃縮後回傳。
	// 工具迴圈內的文字回覆與達上限後的收尾回覆都走這條路徑(研究記錄照常)。
	// 歷史維持嚴格 user/assistant 交替:提案狀態不寫進歷史,而是送出時即時組出(見 proposalStatus,#124)。
	finish := func(content string) (string, error) {
		replyText = content // 已由上方保存到對應 request
		a.mu.Lock()
		a.History = append(a.History,
			llm.Message{Role: "user", Content: p.Question},
			llm.Message{Role: "assistant", Content: content})
		a.mu.Unlock()
		// 對話變長時在回合結束後就先濃縮,讓下一次的預覽 = 實際送出(B7);自動壓縮關閉時不做(#32)
		if b := a.ContextTokens; b > 0 && !a.DisableAutoCompact && a.historyTokens() > b*2/5 {
			collect := func(purpose string, msgs []llm.Message, reply string, ok bool) {
				requests = append(requests, researchRequest{Purpose: purpose, Messages: append([]llm.Message{}, msgs...), Reply: reply, Ok: &ok})
			}
			a.compactCollect(ctx, emit, collect)
		}
		return content, nil
	}
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
			return finish(reply.Content)
		}
		msgs = append(msgs, reply)
		for _, tc := range reply.ToolCalls {
			if !allowed(tc.Name, tools) {
				a.audit(auditRecord{Event: "tool_denied", Tool: tc.Name, Args: tc.Arguments, Detail: "mode=" + p.Mode})
				denyMsg := "錯誤:此工具不存在或本次不被允許。你只能使用: " + strings.Join(names(tools), ", ")
				emit(Event{Kind: "tool", Tool: tc.Name, Args: tc.Arguments, Allowed: false, Result: displayResult(denyMsg)})
				rejectedIDs[tc.ID] = true
				toolCalls = append(toolCalls, researchToolCall{Name: tc.Name, Args: tc.Arguments, Denied: true})
				msgs = append(msgs, llm.Message{Role: "tool", ToolCallID: tc.ID, Content: denyMsg})
				continue
			}
			result2, pr, terr := a.runTool(tc.Name, tc.Arguments, g)
			a.audit(auditRecord{Event: "tool_call", Tool: tc.Name, Args: tc.Arguments, Detail: errText(terr)})
			if terr != nil {
				result2 = "錯誤:" + terr.Error()
			}
			// 執行完才 emit,帶上回給模型的同一段結果(錯誤也在內),讓作者看得到工具讀到/搜到什麼(#34 第 7 項)。
			emit(Event{Kind: "tool", Tool: tc.Name, Args: tc.Arguments, Allowed: true, Result: displayResult(result2), ProposalID: proposalID(pr, terr)})
			toolCalls = append(toolCalls, researchToolCall{Name: tc.Name, Args: tc.Arguments, Err: errText(terr), Denied: rejectedIDs[tc.ID]})
			if terr == nil && pr != nil {
				pIDs = append(pIDs, pr.ID)
				a.recordProposal(pr.ID)
			}
			msgs = append(msgs, llm.Message{Role: "tool", ToolCallID: tc.ID, Content: result2})
		}
	}
	// 到達硬上限:不再進入工具迴圈。先留審計痕跡並告知介面,再送一次「不提供任何工具」的收尾請求,
	// 讓模型就目前已知的內容回答作者(這次讀到的工具結果與說明不白費)。
	a.audit(auditRecord{Event: "iter_limit", Detail: fmt.Sprintf("已達上限 %d", a.maxIter())})
	emit(Event{Kind: "notice", Text: fmt.Sprintf("已達單次對話的工具迭代上限(%d 次),已請 AI 就目前已知的內容收尾回答。", a.maxIter())})

	wrapMsgs := append(append([]llm.Message{}, msgs...), llm.Message{Role: "user", Content: iterLimitPrompt})
	snapshot := append([]llm.Message{}, wrapMsgs...)
	// 不帶 Tools:收尾請求本身不會再要求工具,上限仍是硬上限。
	reply, err := a.LLM.Chat(ctx, llm.Request{Model: a.Model, Messages: wrapMsgs}, func(s string) { emit(Event{Kind: "delta", Text: s}) })
	requests = append(requests, researchRequest{Purpose: "ask", Messages: snapshot, Reply: reply.Content})
	if err != nil {
		// 收尾請求失敗(含取消)照現有錯誤路徑處理,不重試。
		result = "error"
		if ctx.Err() != nil {
			result = "cancelled"
		}
		errMsg = errText(err)
		return "", err
	}
	// 模型若仍回傳工具呼叫:收尾請求沒有工具可執行,忽略呼叫只取文字內容。
	result = "iter_limit" // 研究記錄(§12.8):到達上限但已由收尾請求回覆
	return finish(reply.Content)
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
		"sent":     len(requests) > 0, // 未送出就失敗(前置錯誤、超預算)時 false
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

const summaryPrompt = `你是寫作編輯助手。為下面這一章寫一份「之後寫作時參考用」的摘要,300 字以內,條列:
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

// toolResultDisplayLimit 是工具結果顯示給作者的長度上限(字);超過就截斷並註明總長度(#34 第 7 項)。
// 只影響對話中的顯示(Event.Result),送給模型的工具結果不變。
const toolResultDisplayLimit = 2000

func displayResult(s string) string {
	r := []rune(s)
	if len(r) <= toolResultDisplayLimit {
		return s
	}
	return string(r[:toolResultDisplayLimit]) + fmt.Sprintf("\n…(已截斷,共 %d 字)", len(r))
}
