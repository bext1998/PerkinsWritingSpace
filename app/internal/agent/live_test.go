package agent

import (
	"context"
	"os"
	"strings"
	"testing"

	"perkins/internal/llm"
)

// 實機冒煙測試:需要本機 LM Studio。以 PERKINS_LIVE_MODEL=<模型id> 啟用,平常不執行。
func TestLiveLMStudioToolCalling(t *testing.T) {
	model := os.Getenv("PERKINS_LIVE_MODEL")
	if model == "" {
		t.Skip("未設定 PERKINS_LIVE_MODEL,略過實機測試")
	}
	a, _, dir := setup(t)
	a.LLM = &llm.OpenAI{BaseURL: "http://localhost:1234/v1"}
	a.Model = model
	before := snapshot(t, dir)

	var tools []string
	reply, err := a.Ask(context.Background(),
		AskParams{Question: "請用工具搜尋專案裡提到『怕黑』的地方,告訴我是哪個角色、在哪個檔案。", Attachments: []string{"canon/characters.md"}},
		func(e Event) {
			if e.Kind == "tool" {
				tools = append(tools, e.Tool)
			}
		})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("工具呼叫: %v\n回覆: %s", tools, reply)
	if len(tools) == 0 {
		t.Error("模型沒有呼叫任何工具(本地模型 tool-calling 不可靠,見 SPEC §8-1)")
	}
	if !strings.Contains(reply, "小明") {
		t.Error("回覆未提到小明")
	}
	for k, v := range snapshot(t, dir) {
		if before[k] != v {
			t.Errorf("檔案被改動: %s", k)
		}
	}
}

func TestLiveLMStudioProposePatch(t *testing.T) {
	model := os.Getenv("PERKINS_LIVE_MODEL")
	if model == "" {
		t.Skip("未設定 PERKINS_LIVE_MODEL,略過實機測試")
	}
	a, _, dir := setup(t)
	a.LLM = &llm.OpenAI{BaseURL: "http://localhost:1234/v1"}
	a.Model = model
	before := snapshot(t, dir)

	reply, err := a.Ask(context.Background(),
		AskParams{Question: "請潤飾『小明走進森林。』這句,讓它更有氛圍。用 propose_patch 提案,不要直接回答改寫結果。", Doc: "manuscript/第一章.md"},
		func(Event) {})
	if err != nil {
		t.Fatal(err)
	}
	list, _ := a.Proposals.List()
	t.Logf("回覆: %s\n提案數: %d", reply, len(list))
	if len(list) == 0 {
		t.Fatal("模型沒有成功建立提案")
	}
	t.Logf("提案: %q -> %q (理由:%s)", list[0].Original, list[0].Replacement, list[0].Rationale)
	for k, v := range snapshot(t, dir) {
		if before[k] != v {
			t.Errorf("檔案被改動: %s", k)
		}
	}
}
