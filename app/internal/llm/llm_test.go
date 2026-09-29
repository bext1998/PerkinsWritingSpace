package llm

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// 意圖:tool call 的參數在串流中是分片到達的;拼錯會讓工具白名單檢查看到錯的工具名/參數。
func TestParseStreamAssemblesFragmentedToolCalls(t *testing.T) {
	stream := strings.Join([]string{
		`data: {"choices":[{"delta":{"content":"好"}}]}`,
		`data: {"choices":[{"delta":{"content":"的"}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read_document","arguments":"{\"pa"}}]}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\":\"canon/a.md\"}"}}]}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"c2","function":{"name":"search_project","arguments":"{}"}}]}}]}`,
		`data: [DONE]`,
	}, "\n\n")
	var deltas []string
	msg, err := parseStream(strings.NewReader(stream), func(s string) { deltas = append(deltas, s) })
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "好的" || len(deltas) != 2 {
		t.Fatalf("content=%q deltas=%v", msg.Content, deltas)
	}
	if len(msg.ToolCalls) != 2 || msg.ToolCalls[0].Name != "read_document" ||
		msg.ToolCalls[0].Arguments != `{"path":"canon/a.md"}` || msg.ToolCalls[1].ID != "c2" {
		t.Fatalf("tool calls = %+v", msg.ToolCalls)
	}
}

func TestChatSendsAuthAndSurfacesHTTPErrors(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if r.URL.Path == "/v1/chat/completions" && gotAuth == "Bearer bad" {
			http.Error(w, "invalid key", http.StatusUnauthorized)
			return
		}
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n")
	}))
	defer srv.Close()

	c := &OpenAI{BaseURL: srv.URL + "/v1", APIKey: "k"}
	msg, err := c.Chat(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil)
	if err != nil || msg.Content != "ok" || gotAuth != "Bearer k" {
		t.Fatalf("msg=%+v err=%v auth=%q", msg, err, gotAuth)
	}
	c.APIKey = "bad"
	if _, err := c.Chat(context.Background(), Request{Model: "m"}, nil); err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("應回報 401, got %v", err)
	}
	// 本機端點不需要金鑰:不得送出空的 Bearer
	c.APIKey = ""
	gotAuth = "unset"
	if _, err := c.Chat(context.Background(), Request{Model: "m"}, nil); err != nil || gotAuth != "" {
		t.Fatalf("err=%v auth=%q", err, gotAuth)
	}
}
