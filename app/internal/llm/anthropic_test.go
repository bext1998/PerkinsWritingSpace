package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var anthropicStreamOK = strings.Join([]string{
	`data: {"type":"message_start","message":{"id":"msg_1"}}`,
	`data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}`,
	`data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"先想想"}}`,
	`data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-abc"}}`,
	`data: {"type":"content_block_stop","index":0}`,
	`data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}`,
	`data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"好"}}`,
	`data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"的"}}`,
	`data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_document","input":{}}}`,
	`data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"pa"}}`,
	`data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"th\":\"canon/a.md\"}"}}`,
	`data: {"type":"content_block_stop","index":2}`,
	`data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}`,
	`data: {"type":"message_stop"}`,
}, "\n\n")

// captureAnthropic 回傳測試用伺服器與它收到的請求 body/標頭(串流回應固定)。
func captureAnthropic(t *testing.T, reply string) (*httptest.Server, *[]byte, *http.Header) {
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

func decodeBody(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(body, &m); err != nil {
		t.Fatalf("請求 body 不是 JSON: %v\n%s", err, body)
	}
	return m
}

// 意圖:Messages API 的請求格式與 OpenAI 相容層完全不同(system 在頂層、工具用 input_schema、
// tool 角色轉 tool_result);組錯官方會直接回 400。
func TestAnthropicChatRequestShape(t *testing.T) {
	srv, body, hdr := captureAnthropic(t, "data: {\"type\":\"message_stop\"}\n\n")
	c := &Anthropic{BaseURL: srv.URL + "/v1", APIKey: "sk-x", ReasoningEffort: "high"}
	req := Request{
		Model: "claude-x",
		Messages: []Message{
			{Role: "system", Content: "你是寫作助手"},
			{Role: "user", Content: "幫我改這段"},
			{Role: "assistant",
				Thinking: json.RawMessage(`[{"type":"thinking","thinking":"先想想","signature":"sig-1"}]`),
				ToolCalls: []ToolCall{
					{ID: "toolu_1", Name: "read_document", Arguments: `{"path":"a.md"}`},
					{ID: "toolu_2", Name: "search_project", Arguments: "not-json"},
				}},
			{Role: "tool", ToolCallID: "toolu_1", Content: "檔案內容"},
			{Role: "tool", ToolCallID: "toolu_2", Content: "搜尋結果"},
		},
		Tools: []ToolDef{{Name: "read_document", Description: "讀檔案", Parameters: json.RawMessage(`{"type":"object"}`)}},
	}
	if _, err := c.Chat(context.Background(), req, nil); err != nil {
		t.Fatal(err)
	}

	if got := hdr.Get("x-api-key"); got != "sk-x" {
		t.Fatalf("x-api-key = %q", got)
	}
	if got := hdr.Get("anthropic-version"); got != "2023-06-01" {
		t.Fatalf("anthropic-version = %q", got)
	}
	if got := hdr.Get("Content-Type"); got != "application/json" {
		t.Fatalf("content-type = %q", got)
	}

	b := decodeBody(t, *body)
	if b["model"] != "claude-x" || b["stream"] != true {
		t.Fatalf("model/stream = %v %v", b["model"], b["stream"])
	}
	if b["max_tokens"] != float64(32000) {
		t.Fatalf("max_tokens = %v(必填且固定)", b["max_tokens"])
	}
	if b["system"] != "你是寫作助手" {
		t.Fatalf("system = %v", b["system"])
	}
	cache, _ := b["cache_control"].(map[string]any)
	if cache["type"] != "ephemeral" {
		t.Fatalf("cache_control = %v", b["cache_control"])
	}
	out, _ := b["output_config"].(map[string]any)
	if out["effort"] != "high" {
		t.Fatalf("output_config = %v", b["output_config"])
	}

	msgs, _ := b["messages"].([]any)
	if len(msgs) != 3 {
		t.Fatalf("messages = %d 條(system 應在頂層、連續 tool 結果合併一條): %v", len(msgs), msgs)
	}
	m0, _ := msgs[0].(map[string]any)
	if m0["role"] != "user" {
		t.Fatalf("messages[0] = %v", m0)
	}
	m1, _ := msgs[1].(map[string]any)
	blocks, _ := m1["content"].([]any)
	if m1["role"] != "assistant" || len(blocks) != 3 {
		t.Fatalf("messages[1] = %v", m1)
	}
	thinking, _ := blocks[0].(map[string]any)
	if thinking["type"] != "thinking" || thinking["thinking"] != "先想想" || thinking["signature"] != "sig-1" {
		t.Fatalf("thinking 區塊應原樣放在最前面: %v", blocks[0])
	}
	use1, _ := blocks[1].(map[string]any)
	input1, _ := use1["input"].(map[string]any)
	if use1["type"] != "tool_use" || use1["id"] != "toolu_1" || use1["name"] != "read_document" || input1["path"] != "a.md" {
		t.Fatalf("tool_use = %v", blocks[1])
	}
	use2, _ := blocks[2].(map[string]any)
	if _, ok := use2["input"].(map[string]any); !ok {
		t.Fatalf("無法解析的參數應送空物件: %v", blocks[2])
	}
	m2, _ := msgs[2].(map[string]any)
	results, _ := m2["content"].([]any)
	if m2["role"] != "user" || len(results) != 2 {
		t.Fatalf("連續 tool 結果應合併成一個 user 訊息: %v", m2)
	}
	res, _ := results[0].(map[string]any)
	if res["type"] != "tool_result" || res["tool_use_id"] != "toolu_1" || res["content"] != "檔案內容" {
		t.Fatalf("tool_result = %v", results[0])
	}

	tools, _ := b["tools"].([]any)
	tool, _ := tools[0].(map[string]any)
	if tool["name"] != "read_document" || tool["input_schema"] == nil || tool["schema"] != nil {
		t.Fatalf("工具定義應使用 input_schema: %v", tool)
	}
}

// 意圖:思考強度各自驗證——Anthropic 收 xhigh/max,但不合法值不送;空值不送任何思考欄位。
func TestAnthropicEffortValidation(t *testing.T) {
	for _, tc := range []struct {
		effort string
		want   bool
	}{
		{"", false}, {"low", true}, {"high", true}, {"xhigh", true}, {"max", true}, {"ultra", false}, {"Low", false},
	} {
		srv, body, _ := captureAnthropic(t, "data: {\"type\":\"message_stop\"}\n\n")
		c := &Anthropic{BaseURL: srv.URL + "/v1", ReasoningEffort: tc.effort}
		if _, err := c.Chat(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil); err != nil {
			t.Fatal(err)
		}
		b := decodeBody(t, *body)
		_, ok := b["output_config"]
		if ok != tc.want {
			t.Fatalf("effort=%q output_config 有無 = %v(應為 %v)", tc.effort, ok, tc.want)
		}
		if _, bad := b["thinking"]; bad {
			t.Fatalf("不應送 thinking 欄位: %s", *body)
		}
	}
}

// 意圖:串流解析——文字分片送 onDelta、工具參數分片要拼回、thinking 與 signature 要累積保存。
func TestAnthropicStreamParsesTextToolsThinking(t *testing.T) {
	var deltas []string
	msg, err := parseAnthropicStream(strings.NewReader(anthropicStreamOK), func(s string) { deltas = append(deltas, s) })
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "好的" || len(deltas) != 2 {
		t.Fatalf("content=%q deltas=%v", msg.Content, deltas)
	}
	if len(msg.ToolCalls) != 1 || msg.ToolCalls[0].ID != "toolu_1" || msg.ToolCalls[0].Name != "read_document" ||
		msg.ToolCalls[0].Arguments != `{"path":"canon/a.md"}` {
		t.Fatalf("tool calls = %+v", msg.ToolCalls)
	}
	var thinking []map[string]any
	if err := json.Unmarshal(msg.Thinking, &thinking); err != nil {
		t.Fatalf("thinking 不是 JSON 陣列: %v / %s", err, msg.Thinking)
	}
	if len(thinking) != 1 || thinking[0]["type"] != "thinking" || thinking[0]["thinking"] != "先想想" || thinking[0]["signature"] != "sig-abc" {
		t.Fatalf("thinking = %s", msg.Thinking)
	}
}

// 意圖:官方規定工具迴圈要把 assistant 的 thinking 區塊(含 signature)完整、不修改地傳回下一次請求,
// 否則後續請求會被拒;驗證第二次請求把區塊原樣帶回且放在 text/tool_use 之前。
func TestAnthropicThinkingBlocksReturnedInToolLoop(t *testing.T) {
	reply, err := parseAnthropicStream(strings.NewReader(anthropicStreamOK), nil)
	if err != nil {
		t.Fatal(err)
	}
	srv, body, _ := captureAnthropic(t, "data: {\"type\":\"message_stop\"}\n\n")
	c := &Anthropic{BaseURL: srv.URL + "/v1"}
	next := Request{Model: "m", Messages: []Message{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "幫我改這段"},
		reply,
		{Role: "tool", ToolCallID: "toolu_1", Content: "檔案內容"},
	}}
	if _, err := c.Chat(context.Background(), next, nil); err != nil {
		t.Fatal(err)
	}
	b := decodeBody(t, *body)
	msgs, _ := b["messages"].([]any)
	asst, _ := msgs[1].(map[string]any)
	blocks, _ := asst["content"].([]any)
	const want = `{"type":"thinking","thinking":"先想想","signature":"sig-abc"}`
	// 原樣傳回:請求 body 裡的 thinking 區塊必須與串流解析結果逐位元組相同
	if !strings.Contains(string(*body), want) {
		t.Fatalf("thinking 區塊應原樣傳回, body = %s", *body)
	}
	first, _ := blocks[0].(map[string]any)
	if first["type"] != "thinking" || first["thinking"] != "先想想" || first["signature"] != "sig-abc" {
		t.Fatalf("thinking 區塊應放在最前面: %v", blocks[0])
	}
	if blocks[1].(map[string]any)["type"] != "text" || blocks[2].(map[string]any)["type"] != "tool_use" {
		t.Fatalf("thinking 之後應是 text 與 tool_use: %v", blocks)
	}
}

// 意圖:官方 error 事件代表請求失敗,吞掉會讓作者看到「成功但沒有回覆」。
func TestAnthropicErrorEventReturnsError(t *testing.T) {
	stream := "data: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"過載,請稍後\"}}\n\n"
	if _, err := parseAnthropicStream(strings.NewReader(stream), nil); err == nil || !strings.Contains(err.Error(), "過載") {
		t.Fatalf("error 事件應回傳錯誤, got %v", err)
	}
}

func TestAnthropicListModels(t *testing.T) {
	var gotAuth, gotVersion string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotVersion = r.Header.Get("x-api-key"), r.Header.Get("anthropic-version")
		if r.URL.Path != "/v1/models" {
			t.Errorf("path = %s", r.URL.Path)
		}
		fmt.Fprint(w, `{"data":[{"type":"model","id":"claude-5.5"},{"type":"model","id":"claude-5.5-haiku"}]}`)
	}))
	defer srv.Close()
	c := &Anthropic{BaseURL: srv.URL + "/v1", APIKey: "sk-x"}
	ids, err := c.ListModels(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 || ids[0] != "claude-5.5" || gotAuth != "sk-x" || gotVersion != "2023-06-01" {
		t.Fatalf("ids=%v auth=%q version=%q", ids, gotAuth, gotVersion)
	}
}

func TestAnthropicSurfacesHTTPErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "invalid x-api-key", http.StatusUnauthorized)
	}))
	defer srv.Close()
	c := &Anthropic{BaseURL: srv.URL + "/v1", APIKey: "bad"}
	if _, err := c.Chat(context.Background(), Request{Model: "m"}, nil); err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("應回報 401, got %v", err)
	}
}

// 意圖:連線在 message_stop 之前中斷時,半截文字或工具參數不能當成正常回覆交給 Agent(PR #90 審查)。
func TestAnthropicStreamWithoutMessageStopFails(t *testing.T) {
	stream := strings.Join([]string{
		`data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"unfinished"}}`,
	}, "\n\n")
	if _, err := parseAnthropicStream(strings.NewReader(stream), nil); err == nil {
		t.Fatal("沒有 message_stop 的串流應回錯")
	}
}

// 意圖:達到輸出上限(stop_reason=max_tokens)時工具參數可能只有一半,不能執行工具或當成完整答案(PR #90 審查)。
func TestAnthropicMaxTokensStopFails(t *testing.T) {
	stream := strings.Join([]string{
		`data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"propose_patch","input":{}}}`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"path\":"}}`,
		`data: {"type":"content_block_stop","index":0}`,
		`data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}`,
		`data: {"type":"message_stop"}`,
	}, "\n\n")
	if _, err := parseAnthropicStream(strings.NewReader(stream), nil); err == nil || !strings.Contains(err.Error(), "截斷") {
		t.Fatalf("max_tokens 應回截斷錯誤, got %v", err)
	}
}
