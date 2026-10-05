package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/agent"
	"perkins/internal/project"
	"perkins/internal/research"
	"perkins/internal/settings"

	"github.com/zalando/go-keyring"
)

// 意圖:平台常有字數門檻,字數不能把 Markdown 記號、空白或藏在註解裡的作者筆記算進去。
func TestCountText(t *testing.T) {
	cases := map[string]int{
		"# 第一章\n\n　　她說:「**走吧**。」\n": 11, // 第一章(3)+ 她說:「走吧。」(8,標點算字)
		"甲乙<!-- 筆記\n很多字 -->丙":       3,
		"> 引用文字\n- 清單":              6,
		"abc def":                   6,
		"未結束的註解<!-- 之後都不算":          6,
	}
	for in, want := range cases {
		if got := CountText(in); got != want {
			t.Errorf("CountText(%q) = %d, want %d", in, got, want)
		}
	}
}

// ---- 研究記錄:App.AskAI 前置失敗恰好一筆(review-3 第 1 點) ----

// askResearchEvents 讀回研究記錄中 event=ask 的 detail map。
func askResearchEvents(t *testing.T, dir string) []map[string]any {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, ".perkins", "research.jsonl"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		t.Fatal(err)
	}
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(b)), "\n") {
		var ev map[string]any
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			t.Fatal(err)
		}
		if ev["event"] == "ask" {
			out = append(out, ev["detail"].(map[string]any))
		}
	}
	return out
}

// 意圖(review-round3 第 1 點):前置失敗要走到真正的錯誤路徑並斷言錯誤原因。
// 兩個情境,各恰好一筆 ask:
//
//	A. 尚未選擇模型(agent 非空、store 用隔離 temp dir 無模型)→ prepare 成功、begin 拒絕 →
//	   App 前置失敗記一筆(sent=false、requests 空、error 含「尚未選擇模型」)。
//	B. 端點錯誤:prepare 不會失敗(clientFor 恆可取得 profile),端點錯誤發生在交給 Agent 後的
//	   LLM.Chat(不可達端點),由 Agent 的 defer 記恰好一筆(sent=true、requests 含失敗請求),
//	   App 層不得重複。以隔離 store 指向封閉埠,不讀寫作者設定、不呼叫真模型。
func TestAskAIPrematureFailureRecordsOnce(t *testing.T) {
	keyring.MockInit() // 隔離憑證庫(review-round4 D3):clientFor 會經 ProfileAPIKey 讀 keyring,不得碰作者的原生憑證庫
	dir := t.TempDir()
	p, err := project.Create(dir, "n")
	if err != nil {
		t.Fatal(err)
	}
	if err := p.SetResearch(true); err != nil {
		t.Fatal(err)
	}
	a := NewApp()
	a.proj = p
	a.research = research.New(p, "sess-1")
	a.agent = &agent.Agent{Proj: p, Research: a.research} // 非空:避開 errNoProject,走到真正的錯誤路徑
	a.ctx = context.Background()                          // begin() 需要非 nil 的 parent context(startup 才會設定)
	// 隔離 store:temp dir 無 settings.json → 載入預設 profile(default/localhost:1234)且無模型
	tmpCfg := t.TempDir()
	a.store = &settings.Store{Dir: tmpCfg}

	// 情境 A:尚未選擇模型
	err = a.AskAI(agent.AskParams{Question: "q"})
	if err == nil || !strings.Contains(err.Error(), "尚未選擇模型") {
		t.Fatalf("應因尚未選擇模型失敗, got %v", err)
	}
	evs := askResearchEvents(t, dir)
	if len(evs) != 1 {
		t.Fatalf("前置失敗應恰好一筆 ask, got %d", len(evs))
	}
	if evs[0]["sent"] != false || evs[0]["result"] != "error" {
		t.Fatalf("應標 sent=false/error: %v", evs[0])
	}
	if em, ok := evs[0]["error"].(string); !ok || !strings.Contains(em, "尚未選擇模型") {
		t.Fatalf("error 應含尚未選擇模型: %v", evs[0]["error"])
	}
	if r, ok := evs[0]["requests"].([]any); !ok || len(r) != 0 {
		t.Fatalf("requests 應為空: %v", evs[0]["requests"])
	}

	// 情境 B:端點錯誤 — 模型已選但端點不可達,交給 Agent 後在 LLM.Chat 失敗;恰好一筆、不重複。
	// 說明:現行程式的 clientFor("") 在 prepare 不會失敗(ActiveProfile 恆可取得),端點錯誤
	// 發生在交給 Agent 之後;App.AskAI 的 goroutine 會呼叫 wails runtime(測試程序無法提供
	// wails context,EventsEmit 會直接終止程序),因此以 prepare 套上同一套端點/模型後直接
	// 呼叫 Agent.Ask 驗證 — 記錄路徑與 goroutine 內相同(rlogAsk 的 defer),App 層前置記錄
	// 不介入,不得重複。
	s := a.store.Load()
	s.Profiles[0].Model = "m"
	s.Profiles[0].BaseURL = "http://127.0.0.1:1/v1" // 封閉埠:連線被拒
	s.Active = "default"
	if err := a.store.Save(s); err != nil {
		t.Fatal(err)
	}
	a.mu.Lock()
	ag, perr := a.prepare()
	a.mu.Unlock()
	if perr != nil {
		t.Fatalf("prepare 不應失敗: %v", perr)
	}
	if _, aerr := ag.Ask(context.Background(), agent.AskParams{Question: "q2"}, func(agent.Event) {}); aerr == nil {
		t.Fatal("封閉埠端點應失敗")
	}
	evs = askResearchEvents(t, dir)
	if len(evs) != 2 {
		t.Fatalf("端點錯誤應記恰好一筆(共 2 筆), got %d", len(evs))
	}
	ev := evs[1]
	if ev["result"] != "error" || ev["model"] != "m" {
		t.Fatalf("第二筆應由 Agent 記錄端點錯誤: %v", ev)
	}
	if ev["sent"] != true {
		t.Fatalf("送出的請求應標 sent=true: %v", ev)
	}
	if r, ok := ev["requests"].([]any); !ok || len(r) != 1 {
		t.Fatalf("失敗的請求應保存: %v", ev["requests"])
	}
	if em, ok := ev["error"].(string); !ok || !strings.Contains(em, "dial") {
		t.Fatalf("error 應為端點連線錯誤: %v", ev["error"])
	}
}
