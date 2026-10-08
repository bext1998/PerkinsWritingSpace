package agent

// Perkins Bot 評測案例(SPEC §16 第 22 項)。
// 本檔只放「程式可判定」的評測邏輯與不需要模型的單元測試;
// 需要本機 LM Studio 的實機情境在 live_eval_test.go(以 PERKINS_LIVE_MODEL 啟用,平常 skip)。
//
// 判定原則(SPEC §0 第 4 條):檔案未改動、有無對指定文件建立提案、
// 提案原文是否逐字存在於其目標檔,由程式判定(硬標準);
// 字串掃描(伏筆字眼、視角代詞等)無法可靠對應語意,只作為提示記錄在報告中
// 供人工檢查,不影響判定;口吻、氛圍等主觀項目同樣只記錄供人工比對。

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"perkins/internal/llm"
	"perkins/internal/proposal"
)

// evalCheck 是一項程式判定的檢查結果。
type evalCheck struct {
	Name   string
	Pass   bool
	Detail string
}

// evalCase 描述一個評測情境:測試資料、提問參數與程式判定條件。
type evalCase struct {
	Name               string
	Fixture            func(a *Agent) error // 在預設專案上寫入本情境的測試資料
	Params             AskParams
	DocPath            string   // 評測針對的文件(空 = 不指定);RequireProposal 時要求對這個檔案有提案
	RequireProposal    bool     // 是否必須對 DocPath(或任一檔案)建立提案
	ForbidProposalTool bool     // 不得建立任何提案(報告模式)
	ScanHints          []string // 改寫文字的字串提示:只記錄在報告供人工檢查,不影響判定(字串無法對應語意)
	Manual             string   // 需人工比對的項目說明
}

// evalCaseResult 是一個情境跑完後的完整記錄,寫進評測報告。
type evalCaseResult struct {
	Case      evalCase
	Pass      bool
	Checks    []evalCheck
	Notes     []string // 字串提示等僅供人工檢查的記錄,不影響判定
	Tools     []string // 實際獲准執行的工具呼叫
	Proposals []proposal.Proposal
	Reply     string
	AskErr    string
}

// ---- 純判定函式(單元測試直接驗證,不需要模型)----

// evalChangedFiles 比對兩次快照,回傳被新增、修改或刪除的檔案(相對於 before)。
func evalChangedFiles(before, after map[string][32]byte) []string {
	var out []string
	for k, v := range after {
		if b, ok := before[k]; !ok || b != v {
			out = append(out, k)
		}
	}
	for k := range before {
		if _, ok := after[k]; !ok {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

// evalNonVerbatimProposals 依各提案「實際的目標檔」驗證原文是否逐字存在,
// 回傳不合格(原文不存在、為空或無法取得目標檔內容)的提案 id。
func evalNonVerbatimProposals(docTexts map[string]string, ps []proposal.Proposal) []string {
	var out []string
	for _, p := range ps {
		text, ok := docTexts[p.Target]
		if !ok {
			out = append(out, p.ID+"(無法讀取目標檔 "+p.Target+")")
			continue
		}
		if p.Original == "" || !strings.Contains(text, p.Original) {
			out = append(out, p.ID)
		}
	}
	return out
}

// evalForbiddenHits 回傳 text 中出現的提示字串。
func evalForbiddenHits(text string, forbidden []string) []string {
	var out []string
	for _, s := range forbidden {
		if s != "" && strings.Contains(text, s) {
			out = append(out, s)
		}
	}
	return out
}

// judgeCase 對一個情境的執行結果做程式判定。
// docTexts 是提案目標檔(至少含 lc.DocPath)的路徑 → 內容對照,用來逐提案驗證原文。
// 回傳整體是否合格、逐項檢查,以及不影響判定的字串提示。
func judgeCase(lc *evalCase, docTexts map[string]string, before, after map[string][32]byte,
	tools []string, ps []proposal.Proposal, reply string, askErr error) (bool, []evalCheck, []string) {
	var checks []evalCheck
	pass := func(name string, ok bool, detail string) {
		checks = append(checks, evalCheck{Name: name, Pass: ok, Detail: detail})
	}

	if askErr != nil {
		pass("Ask 執行成功", false, askErr.Error())
	} else {
		pass("Ask 執行成功", true, "")
	}

	// 不得未經提案改動任何檔案
	changed := evalChangedFiles(before, after)
	if len(changed) == 0 {
		pass("檔案未被改動", true, "")
	} else {
		pass("檔案未被改動", false, "被改動的檔案: "+strings.Join(changed, ", "))
	}

	// 原文逐字:依各提案實際目標驗證,不是只看 DocPath
	if len(ps) == 0 {
		pass("提案原文逐字複製文件", true, "(沒有提案可檢查)")
	} else if bad := evalNonVerbatimProposals(docTexts, ps); len(bad) == 0 {
		pass("提案原文逐字複製文件", true, fmt.Sprintf("共 %d 個提案,全部通過", len(ps)))
	} else {
		pass("提案原文逐字複製文件", false, "原文比對失敗的提案: "+strings.Join(bad, ", "))
	}

	// 需要提案時,要求「指定的文件」確實有提案;只改到其他檔案(例如附件設定)不算數
	if lc.RequireProposal {
		if lc.DocPath == "" {
			if len(ps) > 0 {
				pass("有建立提案", true, fmt.Sprintf("共 %d 個提案", len(ps)))
			} else {
				pass("有建立提案", false, "模型沒有成功建立任何提案")
			}
		} else {
			n := 0
			for _, p := range ps {
				if p.Target == lc.DocPath {
					n++
				}
			}
			if n > 0 {
				pass("指定文件有提案", true, fmt.Sprintf("對 %s 共 %d 個提案", lc.DocPath, n))
			} else {
				pass("指定文件有提案", false, fmt.Sprintf("沒有對 %s 的提案(共 %d 個提案,目標:%s)",
					lc.DocPath, len(ps), strings.Join(proposalTargets(ps), ", ")))
			}
		}
	}
	if lc.ForbidProposalTool {
		if len(ps) == 0 {
			pass("不得建立提案", true, "")
		} else {
			pass("不得建立提案", false, fmt.Sprintf("不應有提案,實際 %d 個", len(ps)))
		}
	}

	// 字串提示:字串無法可靠對應語意(例如「遺物」可能出現在毫無關聯的比喻裡),
	// 只記錄供人工檢查,不寫成會隨機失敗的斷言。
	var notes []string
	if len(ps) > 0 && len(lc.ScanHints) > 0 {
		var all strings.Builder
		for _, p := range ps {
			all.WriteString(p.Replacement)
			all.WriteString("\n")
		}
		for _, h := range lc.ScanHints {
			if strings.Contains(all.String(), h) {
				notes = append(notes, fmt.Sprintf("字串提示「%s」:出現在提案改寫中,請人工確認是否恰當(字串出現不代表違規)", h))
			} else {
				notes = append(notes, fmt.Sprintf("字串提示「%s」:未出現在提案改寫中(未出現也不代表沒有洩漏或未改意圖)", h))
			}
		}
	}

	okAll := true
	for _, c := range checks {
		if !c.Pass {
			okAll = false
		}
	}
	return okAll, checks, notes
}

func proposalTargets(ps []proposal.Proposal) []string {
	out := make([]string, len(ps))
	for i, p := range ps {
		out[i] = p.Target
	}
	return out
}

// reportData 是一份完整評測跑完後的結果集合。
type reportData struct {
	Model string
	Time  time.Time
	Cases []evalCaseResult
}

// evalReportMarkdown 把評測結果整理成 Markdown 報告,供不同版本比對。
func evalReportMarkdown(r reportData) string {
	var b strings.Builder
	passed := 0
	for _, c := range r.Cases {
		if c.Pass {
			passed++
		}
	}
	fmt.Fprintf(&b, "# Perkins Bot 評測報告\n\n- 模型:`%s`\n- 時間:%s\n- 結果:%d 個情境,%d 通過、%d 不通過\n\n---\n",
		r.Model, r.Time.Format("2006-01-02 15:04:05"), len(r.Cases), passed, len(r.Cases)-passed)
	for _, c := range r.Cases {
		mark := "❌ 不通過"
		if c.Pass {
			mark = "✅ 通過"
		}
		fmt.Fprintf(&b, "\n## %s %s\n\n", mark, c.Case.Name)
		b.WriteString("- 程式檢查:\n")
		for _, ck := range c.Checks {
			s := "✅"
			if !ck.Pass {
				s = "❌"
			}
			line := fmt.Sprintf("  - %s %s", s, ck.Name)
			if ck.Detail != "" {
				line += "(" + ck.Detail + ")"
			}
			b.WriteString(line + "\n")
		}
		for _, n := range c.Notes {
			b.WriteString("- " + n + "\n")
		}
		fmt.Fprintf(&b, "- 工具呼叫:%s\n", orNone(c.Tools, "無"))
		if len(c.Proposals) > 0 {
			b.WriteString("- 提案:\n")
			for _, p := range c.Proposals {
				fmt.Fprintf(&b, "  - `%s` → `%s`\n    - 原文:%s\n    - 改寫:%s\n    - 理由:%s\n",
					p.ID, p.Target, p.Original, p.Replacement, p.Rationale)
				if len(p.Assumptions) > 0 {
					fmt.Fprintf(&b, "    - 假設:%s\n", strings.Join(p.Assumptions, ";"))
				}
			}
		} else {
			b.WriteString("- 提案:無\n")
		}
		if c.AskErr != "" {
			fmt.Fprintf(&b, "- Ask 錯誤:%s\n", c.AskErr)
		}
		fmt.Fprintf(&b, "- 回覆:\n\n  ```\n  %s\n  ```\n", indent(c.Reply, "  "))
		if c.Case.Manual != "" {
			fmt.Fprintf(&b, "- 人工比對:%s\n", c.Case.Manual)
		}
	}
	return b.String()
}

func orNone(ss []string, none string) string {
	if len(ss) == 0 {
		return none
	}
	return strings.Join(ss, ", ")
}

func indent(s, prefix string) string {
	lines := strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	for i, l := range lines {
		lines[i] = prefix + l
	}
	return strings.TrimRight(strings.Join(lines, "\n"), " \t\n")
}

// writeEvalReport 把報告寫到 PERKINS_EVAL_OUT 指定的路徑;未設定時只用 t.Log。
func writeEvalReport(t *testing.T, rep reportData) {
	t.Helper()
	md := evalReportMarkdown(rep)
	out := strings.TrimSpace(os.Getenv("PERKINS_EVAL_OUT"))
	if out == "" {
		t.Log("\n" + md)
		return
	}
	if st, err := os.Stat(out); err == nil && st.IsDir() {
		out = filepath.Join(out, "perkins-eval-report.md")
	}
	if dir := filepath.Dir(out); dir != "" {
		_ = os.MkdirAll(dir, 0o755)
	}
	if err := os.WriteFile(out, []byte(md), 0o644); err != nil {
		t.Logf("評測報告寫入 %s 失敗: %v\n%s", out, err, md)
		return
	}
	t.Logf("評測報告已寫入 %s", out)
}

// ---- 不需要模型的單元測試:驗證判定邏輯本身(純判定,不寫任何檔案)----

// 原文不逐字 → 判不合格;逐字(含部分段落)→ 合格;依各提案實際目標驗證。
func TestEvalJudgeOriginalVerbatim(t *testing.T) {
	docs := map[string]string{
		"manuscript/第一章.md":   "# 第一章\n小明走進森林。\n",
		"canon/characters.md": "小明:十二歲,怕黑。\n",
	}
	good := []proposal.Proposal{{ID: "p1", Target: "manuscript/第一章.md", Original: "小明走進森林。", Replacement: "小明朝霧裡走去。"}}
	if got := evalNonVerbatimProposals(docs, good); len(got) != 0 {
		t.Errorf("逐字原文應合格,被判不合格: %v", got)
	}
	// 原文只要逐字存在於目標檔就合格(可以是其中一段);完全不存在的原文才不合格。
	part := []proposal.Proposal{{ID: "p4", Target: "manuscript/第一章.md", Original: "小明走進森林", Replacement: "x"}}
	if got := evalNonVerbatimProposals(docs, part); len(got) != 0 {
		t.Errorf("存在於目標檔中的一段應合格: %v", got)
	}
	bad := []proposal.Proposal{{ID: "p2", Target: "manuscript/第一章.md", Original: "小明走進了森林。", Replacement: "x"}} // 措辭與文件不同
	if got := evalNonVerbatimProposals(docs, bad); len(got) != 1 || got[0] != "p2" {
		t.Errorf("不存在的原文應被抓到, got %v", got)
	}
	// 目標檔內容拿不到 → 視為無法驗證,判不合格而不是放行
	missing := []proposal.Proposal{{ID: "p5", Target: "canon/characters.md", Original: "怕黑", Replacement: "x"}}
	if got := evalNonVerbatimProposals(map[string]string{}, missing); len(got) != 1 {
		t.Errorf("無法驗證的提案應判不合格, got %v", got)
	}
	// 逐字與否照各提案自己的目標檔驗:canon 的提案用 canon 的內容驗,不用稿件驗
	mixed := []proposal.Proposal{
		{ID: "p6", Target: "canon/characters.md", Original: "怕黑", Replacement: "怕水"},
		{ID: "p7", Target: "canon/characters.md", Original: "不存在的設定", Replacement: "x"},
	}
	got := evalNonVerbatimProposals(docs, mixed)
	if len(got) != 1 || !strings.Contains(got[0], "p7") {
		t.Errorf("混合目標應只抓到不合格的那筆, got %v", got)
	}
}

// 檔案被改 → 判不合格;未改 → 合格。
func TestEvalJudgeFileChange(t *testing.T) {
	before := map[string][32]byte{"a.txt": {1}, "b.txt": {2}}
	same := map[string][32]byte{"a.txt": {1}, "b.txt": {2}}
	if got := evalChangedFiles(before, same); len(got) != 0 {
		t.Errorf("快照相同應合格, got %v", got)
	}
	after := map[string][32]byte{"a.txt": {9}, "c.txt": {3}} // b 改、c 新增
	got := evalChangedFiles(before, after)
	if len(got) != 3 || got[0] != "a.txt" || got[1] != "b.txt" || got[2] != "c.txt" {
		t.Errorf("應抓出修改與新增, got %v", got)
	}
}

// 整組判定:正常提案合格;檔案被改、原文不逐字、需要提案而沒有(或只有錯誤目標)、Ask 失敗 → 不合格;
// 字串提示只進 Notes,不影響判定。
func TestEvalJudgeCase(t *testing.T) {
	lc := &evalCase{
		Name: "潤飾", DocPath: "manuscript/第一章.md", RequireProposal: true,
		ScanHints: []string{"女兒"},
	}
	docTexts := map[string]string{
		"manuscript/第一章.md":   "# 第一章\n阿海摸了摸腰間的舊羅盤。\n",
		"canon/characters.md": "阿海:六十歲老漁夫。\n",
	}
	before := map[string][32]byte{"m": {1}}
	after := map[string][32]byte{"m": {1}}
	ps := []proposal.Proposal{{ID: "p1", Target: "manuscript/第一章.md", Original: "阿海摸了摸腰間的舊羅盤。", Replacement: "阿海指尖摩挲著腰間的舊羅盤。"}}

	ok, checks, notes := judgeCase(lc, docTexts, before, after, []string{"propose_patch"}, ps, "好", nil)
	if !ok {
		t.Errorf("正常提案應合格: %+v", checks)
	}
	if len(notes) != 1 || !strings.Contains(notes[0], "未出現") {
		t.Errorf("字串提示應記錄在 Notes: %v", notes)
	}

	// 破壞驗證 1:檔案被改 → 不合格
	if ok, checks, _ := judgeCase(lc, docTexts, before, map[string][32]byte{"m": {2}}, nil, ps, "好", nil); ok {
		t.Errorf("檔案被改應不合格: %+v", checks)
	}
	// 破壞驗證 2:原文不逐字 → 不合格
	badPS := []proposal.Proposal{{ID: "p2", Target: "manuscript/第一章.md", Original: "阿海摸了摸舊羅盤", Replacement: "x"}}
	if ok, checks, _ := judgeCase(lc, docTexts, before, after, nil, badPS, "好", nil); ok {
		t.Errorf("原文不逐字應不合格: %+v", checks)
	}
	// 破壞驗證 3:需要提案但模型只回文字 → 不合格
	if ok, checks, _ := judgeCase(lc, docTexts, before, after, nil, nil, "我覺得不用改", nil); ok {
		t.Errorf("需要提案而沒有提案應不合格: %+v", checks)
	}
	// 破壞驗證 4(返工):只有錯誤目標的提案(改到附件設定、沒改到指定文件)→ 不合格
	wrongTarget := []proposal.Proposal{{ID: "p3", Target: "canon/characters.md", Original: "阿海:六十歲老漁夫。", Replacement: "x"}}
	if ok, checks, _ := judgeCase(lc, docTexts, before, after, nil, wrongTarget, "好", nil); ok {
		t.Errorf("只有錯誤目標的提案應不合格: %+v", checks)
	}
	// 混合目標:指定文件有提案 → 該項合格;各提案原文仍照各自目標驗
	mixed := []proposal.Proposal{
		{ID: "p8", Target: "canon/characters.md", Original: "阿海:六十歲老漁夫。", Replacement: "x"},
		{ID: "p9", Target: "manuscript/第一章.md", Original: "阿海摸了摸腰間的舊羅盤。", Replacement: "y"},
	}
	if ok, checks, _ := judgeCase(lc, docTexts, before, after, nil, mixed, "好", nil); !ok {
		t.Errorf("混合目標且指定文件有提案應合格: %+v", checks)
	}
	// 混合目標但指定文件那筆原文不逐字 → 不合格
	mixedBad := []proposal.Proposal{
		{ID: "p10", Target: "canon/characters.md", Original: "阿海:六十歲老漁夫。", Replacement: "x"},
		{ID: "p11", Target: "manuscript/第一章.md", Original: "阿海摸了摸舊羅盤", Replacement: "y"},
	}
	if ok, checks, _ := judgeCase(lc, docTexts, before, after, nil, mixedBad, "好", nil); ok {
		t.Errorf("指定文件的提案原文不逐字應不合格: %+v", checks)
	}
	// Ask 本身失敗 → 不合格
	if ok, checks, _ := judgeCase(lc, docTexts, before, after, nil, nil, "", fmt.Errorf("connection refused")); ok {
		t.Errorf("Ask 失敗應不合格: %+v", checks)
	}
	// 字串提示不影響判定:改寫含提示字串仍合格,但 Notes 要標示
	reveal := []proposal.Proposal{{ID: "p12", Target: "manuscript/第一章.md", Original: "阿海摸了摸腰間的舊羅盤。", Replacement: "羅盤裡刻著失蹤女兒的名字。"}}
	ok, _, notes = judgeCase(lc, docTexts, before, after, nil, reveal, "好", nil)
	if !ok {
		t.Error("字串提示不得影響硬判定(應由人工檢查)")
	}
	if len(notes) == 0 || !strings.Contains(notes[0], "女兒") || !strings.Contains(notes[0], "出現在提案改寫中") {
		t.Errorf("含提示字串應記錄在 Notes 供人工檢查: %v", notes)
	}
}

// 用假 LLM 走完整 Ask 流程驗證判定與快照比對的銜接。
// 這是會寫檔的整合測試:只寫進 Go 測試的 t.TempDir()(測試結束自動清除),
// 以 PERKINS_EVAL_INTEGRATION=1 選用執行;純判定測試(上述 TestEvalJudge*)預設就會執行。
func TestEvalJudgeWithScriptedLLM(t *testing.T) {
	if os.Getenv("PERKINS_EVAL_INTEGRATION") == "" {
		t.Skip("檔案整合測試(只寫 t.TempDir());以 PERKINS_EVAL_INTEGRATION=1 啟用,純判定邏輯由 TestEvalJudge* 預設涵蓋")
	}
	lc := &evalCase{
		Name: "潤飾", DocPath: "manuscript/第一章.md", RequireProposal: true,
		Params: AskParams{Question: "潤飾第一句", Doc: "manuscript/第一章.md"},
	}
	docTextsOf := func(t *testing.T, a *Agent, ps []proposal.Proposal) map[string]string {
		t.Helper()
		texts := map[string]string{}
		if lc.DocPath != "" {
			texts[lc.DocPath] = mustDoc(t, a, lc.DocPath)
		}
		for _, p := range ps {
			if _, ok := texts[p.Target]; !ok {
				texts[p.Target] = mustDoc(t, a, p.Target)
			}
		}
		return texts
	}
	// 正常:逐字原文 + 正當提案
	a, s, dir := setup(t)
	before := snapshot(t, dir)
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Name: "propose_patch",
			Arguments: `{"path":"manuscript/第一章.md","original":"小明走進森林。","replacement":"小明獨自走進幽暗的森林。","rationale":"更有畫面"}`}}},
		{Role: "assistant", Content: "已提案。"},
	}
	reply, err := a.Ask(context.Background(), lc.Params, func(Event) {})
	ps := deref(a.Proposals)
	ok, checks, _ := judgeCase(lc, docTextsOf(t, a, ps), before, snapshot(t, dir), []string{"propose_patch"}, ps, reply, err)
	if !ok {
		t.Errorf("假 LLM 的正常提案應合格: %+v", checks)
	}
	// 破壞:模型給了不存在的原文 → 提案建立失敗 → 需要提案的情境不合格
	// 快照在 a2.Ask 前後分別取,檔案被改才抓得到(返工:不再共用第一個情境的目錄)。
	a2, s2, dir2 := setup(t)
	before2 := snapshot(t, dir2)
	s2.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Name: "propose_patch",
			Arguments: `{"path":"manuscript/第一章.md","original":"小明慢慢走入森林深處","replacement":"x","rationale":"r"}`}}},
		{Role: "assistant", Content: "已提案。"},
	}
	reply2, err2 := a2.Ask(context.Background(), lc.Params, func(Event) {})
	ps2 := deref(a2.Proposals)
	ok2, checks2, _ := judgeCase(lc, docTextsOf(t, a2, ps2), before2, snapshot(t, dir2), nil, ps2, reply2, err2)
	if ok2 {
		t.Errorf("不存在的原文應判不合格: %+v", checks2)
	}
	_ = dir
}

func mustDoc(t *testing.T, a *Agent, path string) string {
	t.Helper()
	if path == "" {
		return ""
	}
	text, err := a.Proj.ReadFile(path)
	if err != nil {
		t.Fatalf("讀取 %s 失敗: %v", path, err)
	}
	return text
}

func deref(s *proposal.Store) []proposal.Proposal {
	list, err := s.List()
	if err != nil {
		return nil
	}
	out := make([]proposal.Proposal, len(list))
	for i, p := range list {
		out[i] = *p
	}
	return out
}

// 報告至少要能呈現通過/不通過、提案內容與字串提示,供不同版本比對。
func TestEvalReportMarkdown(t *testing.T) {
	lc := evalCase{Name: "角色口吻", Manual: "口吻是否貼合設定"}
	rep := reportData{
		Model: "test-model", Time: time.Date(2026, 10, 8, 12, 0, 0, 0, time.Local),
		Cases: []evalCaseResult{
			{Case: lc, Pass: true, Checks: []evalCheck{{Name: "檔案未被改動", Pass: true}},
				Notes:     []string{"字串提示「女兒」:未出現在提案改寫中(未出現也不代表沒有洩漏或未改意圖)"},
				Proposals: []proposal.Proposal{{ID: "p1", Target: "manuscript/第一章.md", Original: "A", Replacement: "B", Rationale: "r"}}, Reply: "已提案"},
			{Case: evalCase{Name: "伏筆"}, Pass: false, Checks: []evalCheck{{Name: "指定文件有提案", Pass: false, Detail: "沒有對 manuscript/第一章.md 的提案"}}},
		},
	}
	md := evalReportMarkdown(rep)
	for _, want := range []string{"test-model", "✅ 通過 角色口吻", "❌ 不通過 伏筆", "字串提示「女兒」", "口吻是否貼合設定", "原文:A", "改寫:B", "指定文件有提案"} {
		if !strings.Contains(md, want) {
			t.Errorf("報告缺少 %q:\n%s", want, md)
		}
	}
}
