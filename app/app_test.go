package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/agent"
	"perkins/internal/project"
	"perkins/internal/research"
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

// 意圖:未選模型時提問 → 恰好一筆 ask(error, sent=false, requests 空);不 panic、不經 Agent。
func TestAskAIPrematureFailureRecordsOnce(t *testing.T) {
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
	err = a.AskAI(agent.AskParams{Question: "q"})
	if err == nil {
		t.Fatal("未選模型應失敗")
	}
	evs := askResearchEvents(t, dir)
	if len(evs) != 1 {
		t.Fatalf("前置失敗應恰好一筆 ask, got %d", len(evs))
	}
	if evs[0]["sent"] != false || evs[0]["result"] != "error" {
		t.Fatalf("應標 sent=false/error: %v", evs[0])
	}
	if r, ok := evs[0]["requests"].([]any); !ok || len(r) != 0 {
		t.Fatalf("requests 應為空: %v", evs[0]["requests"])
	}
}
