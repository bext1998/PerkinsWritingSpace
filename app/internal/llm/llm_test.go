package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
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

// ---- 思考強度(#30) ----

// captureBodyServer 回傳測試用伺服器與它收到的請求 body/標頭。
func captureBodyServer(t *testing.T, reply string) (*httptest.Server, *[]byte, *http.Header) {
	t.Helper()
	var body []byte
	var hdr http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ = io.ReadAll(r.Body)
		hdr = r.Header.Clone()
		fmt.Fprint(w, reply)
	}))
	t.Cleanup(srv.Close)
	return srv, &body, &hdr
}

const streamOK = "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n"

// 意圖:思考強度空值時送出的 JSON 必須與不支援思考強度前逐位元組相同(本機小模型不能因多送欄位而壞掉)。
func TestChatBodyUnchangedWhenEffortEmpty(t *testing.T) {
	srv, body, _ := captureBodyServer(t, streamOK)
	c := &OpenAI{BaseURL: srv.URL + "/v1"}
	if _, err := c.Chat(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil); err != nil {
		t.Fatal(err)
	}
	const want = `{"model":"m","messages":[{"role":"user","content":"hi"}],"stream":true}`
	if string(*body) != want {
		t.Fatalf("body = %s\nwant = %s", *body, want)
	}
	// 不合法值(含 Anthropic 專有的 xhigh/max)同樣視為不指定
	for _, eff := range []string{"ultra", "xhigh", "max", "Low"} {
		c.ReasoningEffort = eff
		if _, err := c.Chat(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil); err != nil {
			t.Fatal(err)
		}
		if string(*body) != want {
			t.Fatalf("effort=%q 應視為不指定, body = %s", eff, *body)
		}
	}
}

// 意圖:OpenRouter 與其他端點的思考參數欄位不同;送錯欄位服務商會忽略或報錯。
func TestChatSendsEffortPerProvider(t *testing.T) {
	srv, body, _ := captureBodyServer(t, streamOK)
	// 一般端點:reasoning_effort
	c := &OpenAI{BaseURL: srv.URL + "/v1", ReasoningEffort: "high"}
	if _, err := c.Chat(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil); err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(*body, &got); err != nil {
		t.Fatal(err)
	}
	if got["reasoning_effort"] != "high" {
		t.Fatalf("reasoning_effort = %v", got["reasoning_effort"])
	}
	if _, ok := got["reasoning"]; ok {
		t.Fatalf("非 OpenRouter 不應送 reasoning 欄位: %s", *body)
	}
	// OpenRouter:reasoning.effort(把請求導回測試伺服器,保留 openrouter.ai 的 host 判定)
	u, _ := url.Parse(srv.URL)
	or := &OpenAI{BaseURL: "https://openrouter.ai/api/v1", ReasoningEffort: "low",
		HTTP: &http.Client{Transport: rewriteHost{base: u}}}
	if _, err := or.Chat(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil); err != nil {
		t.Fatal(err)
	}
	got = map[string]any{}
	if err := json.Unmarshal(*body, &got); err != nil {
		t.Fatal(err)
	}
	reasoning, _ := got["reasoning"].(map[string]any)
	if reasoning["effort"] != "low" {
		t.Fatalf("OpenRouter 應送 reasoning.effort, body = %s", *body)
	}
	if _, ok := got["reasoning_effort"]; ok {
		t.Fatalf("OpenRouter 不應送 reasoning_effort: %s", *body)
	}
}

// rewriteHost 把請求改送到測試伺服器,但保留原始 host(用來測 openrouter.ai 的判定)。
type rewriteHost struct{ base *url.URL }

func (h rewriteHost) RoundTrip(r *http.Request) (*http.Response, error) {
	r2 := r.Clone(r.Context())
	r2.URL.Scheme = h.base.Scheme
	r2.URL.Host = h.base.Host
	return http.DefaultTransport.RoundTrip(r2)
}
