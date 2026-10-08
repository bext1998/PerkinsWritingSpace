package agent

// Perkins Bot 評測案例(SPEC §16 第 22 項)。
// 本檔只放「程式可判定」的評測邏輯與不需要模型的單元測試;
// 需要本機 LM Studio 的實機情境在 live_eval_test.go(以 PERKINS_LIVE_MODEL 啟用,平常 skip)。
//
// 判定原則(SPEC §0 第 4 條):檔案未改動、有無建立提案、原文是否逐字存在於文件、
// 提案改寫是否含禁止字串,一律由程式判定;口吻、氛圍、是否指出衝突等主觀項目
// 只記錄輸出供人工比對,不寫成會隨機失敗的斷言。

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
	Name                   string
	Fixture                func(a *Agent) error // 在預設專案上寫入本情境的測試資料
	Params                 AskParams
	DocPath                string   // 原文逐字檢查的目標文件(空 = 不檢查)
	RequireProposal        bool     // 是否必須建立提案
	RequiredInReplacement  []string // 提案改寫必須包含的字串(有提案時)
	ForbiddenInReplacement []string // 提案改寫不得包含的字串(伏筆、視角改變等)
	ForbidProposalTool     bool     // 不得建立任何提案(報告模式)
	Manual                 string   // 需人工比對的項目說明
}

// evalCaseResult 是一個情境跑完後的完整記錄,寫進評測報告。
type evalCaseResult struct {
	Case      evalCase
	Pass      bool
	Checks    []evalCheck
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

// evalNonVerbatimProposals 回傳 original 不是逐字存在 docText 中的提案 id。
func evalNonVerbatimProposals(path, docText string, ps []proposal.Proposal) []string {
	var out []string
	for _, p := range ps {
		if p.Target != path {
			continue
		}
		if p.Original == "" || !strings.Contains(docText, p.Original) {
			out = append(out, p.ID)
		}
	}
	return out
}

// evalForbiddenHits 回傳 text 中出現的禁止字串。
func evalForbiddenHits(text string, forbidden []string) []string {
	var out []string
	for _, s := range forbidden {
		if s != "" && strings.Contains(text, s) {
			out = append(out, s)
		}
	}
	return out
}

// judgeCase 對一個情境的執行結果做程式判定。回傳整體是否合格與逐項檢查。
func judgeCase(lc *evalCase, docText string, before, after map[string][32]byte,
	tools []string, ps []proposal.Proposal, reply string, askErr error) (bool, []evalCheck) {
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

	nonVerbatim := evalNonVerbatimProposals(lc.DocPath, docText, ps)
	if lc.DocPath == "" {
		pass("提案原文逐字複製文件", true, "(本情境不指定文件,略過)")
	} else if len(nonVerbatim) == 0 {
		pass("提案原文逐字複製文件", true, fmt.Sprintf("共 %d 個提案", len(ps)))
	} else {
		pass("提案原文逐字複製文件", false, "原文比對失敗的提案: "+strings.Join(nonVerbatim, ", "))
	}

	if lc.RequireProposal {
		if len(ps) > 0 {
			pass("有建立提案", true, fmt.Sprintf("共 %d 個提案", len(ps)))
		} else {
			pass("有建立提案", false, "模型沒有成功建立任何提案")
		}
	}
	if lc.ForbidProposalTool {
		if len(ps) == 0 {
			pass("不得建立提案", true, "")
		} else {
			pass("不得建立提案", false, fmt.Sprintf("不應有提案,實際 %d 個", len(ps)))
		}
	}

	// 提案改寫的必要字串與禁止字串
	if len(ps) > 0 {
		var all string
		for _, p := range ps {
			all += p.Replacement + "\n"
		}
		for _, req := range lc.RequiredInReplacement {
			if strings.Contains(all, req) {
				pass("提案改寫包含「"+req+"」", true, "")
			} else {
				pass("提案改寫包含「"+req+"」", false, "改寫文字中找不到")
			}
		}
		if hits := evalForbiddenHits(all, lc.ForbiddenInReplacement); len(hits) == 0 {
			pass("提案改寫不含禁止字串", true, "")
		} else {
			pass("提案改寫不含禁止字串", false, "出現禁止字串: "+strings.Join(hits, ", "))
		}
	}

	okAll := true
	for _, c := range checks {
		if !c.Pass {
			okAll = false
		}
	}
	return okAll, checks
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

// ---- 不需要模型的單元測試:驗證判定邏輯本身 ----

// 原文不逐字 → 判不合格;逐字 → 合格。
func TestEvalJudgeOriginalVerbatim(t *testing.T) {
	doc := "# 第一章\n小明走進森林。\n"
	path := "manuscript/第一章.md"
	good := []proposal.Proposal{{ID: "p1", Target: path, Original: "小明走進森林。", Replacement: "小明朝霧裡走去。"}}
	if got := evalNonVerbatimProposals(path, doc, good); len(got) != 0 {
		t.Errorf("逐字原文應合格,被判不合格: %v", got)
	}
	// 原文只要逐字存在於文件就合格(可以是其中一段);完全不存在的原文才不合格。
	part := []proposal.Proposal{{ID: "p4", Target: path, Original: "小明走進森林", Replacement: "x"}}
	if got := evalNonVerbatimProposals(path, doc, part); len(got) != 0 {
		t.Errorf("存在於文件中的一段應合格: %v", got)
	}
	bad := []proposal.Proposal{{ID: "p2", Target: path, Original: "小明走進了森林。", Replacement: "x"}} // 措辭與文件不同
	if got := evalNonVerbatimProposals(path, doc, bad); len(got) != 1 || got[0] != "p2" {
		t.Errorf("不存在的原文應被抓到, got %v", got)
	}
	other := []proposal.Proposal{{ID: "p3", Target: "canon/characters.md", Original: "不存在的原文", Replacement: "x"}}
	if got := evalNonVerbatimProposals(path, doc, other); len(got) != 0 {
		t.Errorf("不同目標檔的提案不應參與此文件比對: %v", got)
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

// 禁止字串 → 抓到;正常提案 → 合格。整組判定(正常/檔案被改/原文不逐字)三種輸入。
func TestEvalJudgeCase(t *testing.T) {
	lc := &evalCase{
		Name: "潤飾", DocPath: "manuscript/第一章.md", RequireProposal: true,
		ForbiddenInReplacement: []string{"女兒"},
	}
	doc := "# 第一章\n阿海摸了摸腰間的舊羅盤。\n"
	before := map[string][32]byte{"m": {1}}
	after := map[string][32]byte{"m": {1}}
	ps := []proposal.Proposal{{ID: "p1", Target: lc.DocPath, Original: "阿海摸了摸腰間的舊羅盤。", Replacement: "阿海指尖摩挲著腰間的舊羅盤。"}}

	if ok, checks := judgeCase(lc, doc, before, after, []string{"propose_patch"}, ps, "好", nil); !ok {
		t.Errorf("正常提案應合格: %+v", checks)
	}
	// 破壞驗證 1:檔案被改 → 不合格
	if ok, checks := judgeCase(lc, doc, before, map[string][32]byte{"m": {2}}, nil, ps, "好", nil); ok {
		t.Errorf("檔案被改應不合格: %+v", checks)
	}
	// 破壞驗證 2:原文不逐字 → 不合格
	badPS := []proposal.Proposal{{ID: "p2", Target: lc.DocPath, Original: "阿海摸了摸舊羅盤", Replacement: "x"}}
	if ok, checks := judgeCase(lc, doc, before, after, nil, badPS, "好", nil); ok {
		t.Errorf("原文不逐字應不合格: %+v", checks)
	}
	// 破壞驗證 3:改寫寫出伏筆 → 不合格
	reveal := []proposal.Proposal{{ID: "p3", Target: lc.DocPath, Original: "阿海摸了摸腰間的舊羅盤。", Replacement: "羅盤裡藏著失蹤女兒的名字。"}}
	if ok, checks := judgeCase(lc, doc, before, after, nil, reveal, "好", nil); ok {
		t.Errorf("改寫寫出伏筆應不合格: %+v", checks)
	}
	// 破壞驗證 4:需要提案但模型只回文字 → 不合格
	if ok, checks := judgeCase(lc, doc, before, after, nil, nil, "我覺得不用改", nil); ok {
		t.Errorf("需要提案而沒有提案應不合格: %+v", checks)
	}
	// Ask 本身失敗 → 不合格
	if ok, checks := judgeCase(lc, doc, before, after, nil, nil, "", fmt.Errorf("connection refused")); ok {
		t.Errorf("Ask 失敗應不合格: %+v", checks)
	}
}

// 用假 LLM 走完整 Ask 流程驗證判定:正常提案 → 合格;不存在的原文 → 不合格。
func TestEvalJudgeWithScriptedLLM(t *testing.T) {
	lc := &evalCase{
		Name: "潤飾", DocPath: "manuscript/第一章.md", RequireProposal: true,
		Params: AskParams{Question: "潤飾第一句", Doc: "manuscript/第一章.md"},
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
	ok, checks := judgeCase(lc, mustDoc(t, a, lc.DocPath), before, snapshot(t, dir), []string{"propose_patch"}, ps, reply, err)
	if !ok {
		t.Errorf("假 LLM 的正常提案應合格: %+v", checks)
	}
	// 破壞:模型給了不存在的原文 → 提案建立失敗 → 需要提案的情境不合格
	a2, s2, _ := setup(t)
	s2.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{{ID: "1", Name: "propose_patch",
			Arguments: `{"path":"manuscript/第一章.md","original":"小明慢慢走入森林深處","replacement":"x","rationale":"r"}`}}},
		{Role: "assistant", Content: "已提案。"},
	}
	reply2, err2 := a2.Ask(context.Background(), lc.Params, func(Event) {})
	ok2, checks2 := judgeCase(lc, mustDoc(t, a2, lc.DocPath), snapshot(t, dir), snapshot(t, dir), nil, deref(a2.Proposals), reply2, err2)
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

// 報告至少要能呈現通過/不通過與提案內容,供不同版本比對。
func TestEvalReportMarkdown(t *testing.T) {
	lc := evalCase{Name: "角色口吻", Manual: "口吻是否貼合設定"}
	rep := reportData{
		Model: "test-model", Time: time.Date(2026, 10, 8, 12, 0, 0, 0, time.Local),
		Cases: []evalCaseResult{
			{Case: lc, Pass: true, Checks: []evalCheck{{Name: "檔案未被改動", Pass: true}},
				Proposals: []proposal.Proposal{{ID: "p1", Target: "manuscript/第一章.md", Original: "A", Replacement: "B", Rationale: "r"}}, Reply: "已提案"},
			{Case: evalCase{Name: "伏筆"}, Pass: false, Checks: []evalCheck{{Name: "提案改寫不含禁止字串", Pass: false, Detail: "女兒"}}},
		},
	}
	md := evalReportMarkdown(rep)
	for _, want := range []string{"test-model", "✅ 通過 角色口吻", "❌ 不通過 伏筆", "女兒", "口吻是否貼合設定", "原文:A", "改寫:B"} {
		if !strings.Contains(md, want) {
			t.Errorf("報告缺少 %q:\n%s", want, md)
		}
	}
}
