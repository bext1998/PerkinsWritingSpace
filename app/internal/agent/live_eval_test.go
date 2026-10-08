package agent

// Perkins Bot 實機評測案例(SPEC §16 第 22 項)。
// 以 PERKINS_LIVE_MODEL=<模型id> 啟用(指向本機 LM Studio http://localhost:1234/v1),平常全部 skip。
// 每次大改系統提示、工具流程或上下文組裝時跑一次,比較不同版本的「寫作品味」。
// 執行方式與報告解讀見 docs/LIVE_EVAL.md。
//
// 情境資料全部是為本評測撰寫的小型虛構作品(海邊小鎮),
// 不使用作者稿件或 docs/user_research/ 的內容。

import (
	"context"
	"os"
	"testing"
	"time"

	"perkins/internal/llm"
)

const liveBaseURL = "http://localhost:1234/v1"

const liveEvalTimeout = 5 * time.Minute

func TestLiveEvalCases(t *testing.T) {
	model := os.Getenv("PERKINS_LIVE_MODEL")
	if model == "" {
		t.Skip("未設定 PERKINS_LIVE_MODEL,略過實機評測")
	}
	rep := reportData{Model: model, Time: time.Now()}
	for _, lc := range liveEvalCases() {
		lc := lc
		t.Run(lc.Name, func(t *testing.T) {
			res := runEvalCase(t, model, lc)
			rep.Cases = append(rep.Cases, res)
			t.Logf("工具呼叫:%v", res.Tools)
			for _, n := range res.Notes {
				t.Logf("提示:%s", n)
			}
			t.Logf("回覆:%s", res.Reply)
			for _, c := range res.Checks {
				if !c.Pass {
					t.Errorf("%s:%s", c.Name, c.Detail)
				}
			}
		})
	}
	writeEvalReport(t, rep)
}

// runEvalCase 在獨立的臨時專案上執行一個情境,並做程式判定。
// 判定失敗不會 Fatal:失敗記錄在結果裡,讓報告保留所有情境的輸出。
func runEvalCase(t *testing.T, model string, lc evalCase) evalCaseResult {
	t.Helper()
	res := evalCaseResult{Case: lc}
	a, _, dir := setup(t)
	if lc.Fixture != nil {
		if err := lc.Fixture(a); err != nil {
			res.Checks = append(res.Checks, evalCheck{Name: "準備測試資料", Pass: false, Detail: err.Error()})
			return res
		}
	}
	a.LLM = &llm.OpenAI{BaseURL: liveBaseURL}
	a.Model = model
	before := snapshot(t, dir)
	var tools []string
	ctx, cancel := context.WithTimeout(context.Background(), liveEvalTimeout)
	defer cancel()
	reply, err := a.Ask(ctx, lc.Params, func(e Event) {
		if e.Kind != "tool" {
			return
		}
		if e.Allowed {
			tools = append(tools, e.Tool)
		} else {
			tools = append(tools, e.Tool+"(被拒)")
		}
	})
	res.Reply, res.Tools, res.Proposals = reply, tools, deref(a.Proposals)
	if err != nil {
		res.AskErr = err.Error()
	}
	// 原文比對照各提案實際的目標檔驗,不是只看 DocPath
	docTexts := map[string]string{}
	for _, path := range append(proposalTargets(res.Proposals), lc.DocPath) {
		if path == "" {
			continue
		}
		if _, ok := docTexts[path]; ok {
			continue
		}
		if text, derr := a.Proj.ReadFile(path); derr == nil {
			docTexts[path] = text
		}
	}
	res.Pass, res.Checks, res.Notes = judgeCase(&lc, docTexts, before, snapshot(t, dir), tools, res.Proposals, reply, err)
	return res
}

// liveEvalCases 是固定情境清單:同一組情境用來比較不同版本與模型。
func liveEvalCases() []evalCase {
	return []evalCase{
		{
			Name: "角色口吻",
			Fixture: func(a *Agent) error {
				if err := a.Proj.WriteFile("canon/characters.md", "# 角色\n\n## 阿海\n六十歲的老漁夫。說話簡短、直接,常用海和船做比喻,不用文雅詞。\n"); err != nil {
					return err
				}
				return a.Proj.WriteFile("manuscript/第一章.md", "# 第一章\n阿海說:「今天的風浪相當危險,各位務必要提高警覺。」\n")
			},
			Params: AskParams{
				Question:    "請依設定集裡阿海的說話方式改寫他這句台詞,用 propose_patch 提案,不要直接把改寫結果打在回覆裡。",
				Doc:         "manuscript/第一章.md",
				Attachments: []string{"canon/characters.md"},
			},
			DocPath:         "manuscript/第一章.md",
			RequireProposal: true,
			Manual:          "改寫是否變成阿海的口吻(簡短、直接、海的比喻、不用文雅詞),且沒有變成別的角色或旁白的口吻。",
		},
		{
			Name: "設定衝突",
			Fixture: func(a *Agent) error {
				if err := a.Proj.WriteFile("canon/characters.md", "# 角色\n\n## 小雨\n十六歲的少女。不會游泳,怕水。\n"); err != nil {
					return err
				}
				return a.Proj.WriteFile("manuscript/第一章.md", "# 第一章\n小雨站在碼頭上看著海。\n")
			},
			Params: AskParams{
				Question:    "請把「小雨站在碼頭上看著海。」改成「小雨跳進海裡,自在地游了起來。」,用 propose_patch 提案。",
				Doc:         "manuscript/第一章.md",
				Attachments: []string{"canon/characters.md"},
			},
			DocPath: "manuscript/第一章.md",
			Manual:  "回覆是否指出要求的改寫與 Canon(小雨不會游泳、怕水)矛盾,而不是照改;若有提案,提案是否仍照改。",
		},
		{
			Name: "伏筆不可擅自補完",
			Fixture: func(a *Agent) error {
				if err := a.Proj.WriteFile("outline/第一卷.md", "# 第一卷大綱\n- 阿海夜裡常擦拭腰間的舊羅盤(伏筆,尚未揭露:羅盤裡藏著他失蹤女兒的名字)。\n- 暴風雨夜的救援,讓鎮民開始信任阿海。\n"); err != nil {
					return err
				}
				return a.Proj.WriteFile("manuscript/第一章.md", "# 第一章\n阿海摸了摸腰間的舊羅盤,望向霧裡的海面。\n")
			},
			Params: AskParams{
				Question:    "請潤飾【作者選取的段落】這一句,讓氛圍更濃,用 propose_patch 提案。",
				Doc:         "manuscript/第一章.md",
				Selection:   "阿海摸了摸腰間的舊羅盤,望向霧裡的海面。",
				Attachments: []string{"outline/第一卷.md"},
			},
			DocPath:         "manuscript/第一章.md",
			RequireProposal: true,
			// 字串無法對應語意(例如「宛如舊時代的遺物」的比喻沒有洩漏,換個說法的洩漏也抓不到),
			// 只作為提示記錄在報告供人工檢索,不影響判定。
			ScanHints: []string{"女兒", "失蹤", "遺物"},
			Manual:    "請人工確認改寫是否只加強氛圍,沒有把大綱裡尚未揭露的伏筆(羅盤與女兒的關聯)寫進正文;字串提示僅供檢索,不能證明沒有洩漏。",
		},
		{
			Name: "改寫不改變敘事意圖",
			Fixture: func(a *Agent) error {
				return a.Proj.WriteFile("manuscript/第一章.md", "# 第一章\n小嵐把傘留在門邊,走進了巷口的書店。\n")
			},
			Params: AskParams{
				Question: "請讓這句更有畫面感,用 propose_patch 提案;不得改變敘事視角與誰做了什麼。",
				Doc:      "manuscript/第一章.md",
			},
			DocPath:         "manuscript/第一章.md",
			RequireProposal: true,
			// 視角與意圖是語意判斷,字串(人名、第一人稱代詞)抓不到換說法的改寫,
			// 只作為提示記錄在報告供人工檢索,不影響判定。
			ScanHints: []string{"小嵐", "我把", "我走進"},
			Manual:    "請人工確認視角(第三人稱)、動作主體與時間順序未變(誰留傘、誰進書店);字串提示不能證明意圖未變。",
		},
		{
			Name: "提案原文逐字複製",
			Fixture: func(a *Agent) error {
				// 全形標點與刪節號容易被模型「順手改寫」,用來驗證 original 是否逐字複製。
				return a.Proj.WriteFile("manuscript/第一章.md", "# 第一章\n他在門外站了很久……終於,門開了。\n")
			},
			Params: AskParams{
				Question: "請改善這句的節奏,用 propose_patch 提案;original 務必逐字複製文件裡的原文,一個標點都不能改。",
				Doc:      "manuscript/第一章.md",
			},
			DocPath:         "manuscript/第一章.md",
			RequireProposal: true,
			Manual:          "改寫品質供人工比對;逐字複製已由程式判定。",
		},
		{
			Name: "報告模式不提案",
			Fixture: func(a *Agent) error {
				if err := a.Proj.WriteFile("canon/characters.md", "# 角色\n\n## 阿海\n六十歲的老漁夫,獨自住在港口邊的小屋。\n"); err != nil {
					return err
				}
				return a.Proj.WriteFile("manuscript/第一章.md", "# 第一章\n阿海把船纜繞上木樁,天還沒亮。\n")
			},
			Params: AskParams{
				Question:    "請檢查目前文件的這一句有沒有問題(語法、與設定矛盾),輸出檢查報告。",
				Doc:         "manuscript/第一章.md",
				Mode:        ModeReport,
				Attachments: []string{"canon/characters.md"},
			},
			DocPath:            "manuscript/第一章.md",
			ForbidProposalTool: true,
			Manual:             "報告內容是否有依據、有無把推測當事實(推測應標示「推測」)。",
		},
	}
}
