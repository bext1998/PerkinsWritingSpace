package agent

import (
	"context"
	"strings"
	"testing"

	"perkins/internal/llm"
)

// 意圖(#33):接續對話記錄後,下一次送給模型的訊息要包含保存的對話歷史與拒絕提案的原因——
// 舊對話當上下文參考,作者拒絕過的理由要繼續影響之後的提案(#40)。
// 破壞驗證:RestoreSession 不載入 History 或 rejections(或 buildMessages 不送出它們),本測試會失敗。
func TestRestoredSessionFeedsNextRequest(t *testing.T) {
	a, s, _ := setup(t)
	a.RestoreSession([]llm.Message{
		{Role: "user", Content: "舊問題:幫我把開頭改得更緊湊"},
		{Role: "assistant", Content: "舊回答:我建議把背景移到後面。"},
	}, []string{"canon/characters.md 的提案(原文「小明走進森林。」):不要改動敘事視角"}, nil)

	s.replies = []llm.Message{{Role: "assistant", Content: "新的回答"}}
	if _, err := a.Ask(context.Background(), AskParams{Question: "那第二段呢?"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	if len(s.reqs) == 0 {
		t.Fatal("應送出一次請求")
	}
	msgs := s.reqs[0].Messages
	var all strings.Builder
	for _, m := range msgs {
		all.WriteString(m.Content)
	}
	for _, want := range []string{"舊問題:幫我把開頭改得更緊湊", "舊回答:我建議把背景移到後面。"} {
		if !strings.Contains(all.String(), want) {
			t.Fatalf("送給模型的訊息應含保存的對話歷史(%q): %s", want, all.String())
		}
	}
	if msgs[0].Role != "system" {
		t.Fatalf("第一則應是系統訊息: %+v", msgs[0])
	}
	if !strings.Contains(msgs[0].Content, "不要改動敘事視角") {
		t.Fatalf("系統訊息應含本次會話的拒絕提案原因(Issue #40): %q", msgs[0].Content)
	}
}

// 意圖(#33):保存與載回是對稱的——Snapshot 存什麼,RestoreSession 就載回什麼;
// 載回的是副本,之後的對話不應改到保存的內容。
// 破壞驗證:Snapshot 回傳共用 slice(呼叫端改動會污染保存內容),本測試會失敗。
func TestSnapshotRestoreSymmetry(t *testing.T) {
	a, _, _ := setup(t)
	a.RestoreSession([]llm.Message{{Role: "user", Content: "q1"}, {Role: "assistant", Content: "a1"}}, []string{"r1"}, []string{"p1"})
	hist, rej, ids := a.Snapshot()
	if len(hist) != 2 || hist[0].Content != "q1" || len(rej) != 1 || rej[0] != "r1" || len(ids) != 1 || ids[0] != "p1" {
		t.Fatalf("Snapshot 應回傳載回的內容: %+v / %+v / %+v", hist, rej, ids)
	}
	hist[0].Content = "被改掉"
	rej[0] = "被改掉"
	ids[0] = "被改掉"
	hist2, rej2, ids2 := a.Snapshot()
	if hist2[0].Content != "q1" || rej2[0] != "r1" || ids2[0] != "p1" {
		t.Fatal("Snapshot 應回傳副本,呼叫端的修改不得影響保存內容")
	}
}
