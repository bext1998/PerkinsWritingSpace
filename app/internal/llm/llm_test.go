package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
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

// ---- 重新導向政策(#132)----

// 意圖(#132):端點用 307/308 把整份請求(含稿件)重送到別台主機時,內容會送往設定中未確認的位置,
// 繞過 #99 的外流確認。跨來源重新導向必須中止,另一台主機不得收到任何請求;
// OpenAI 相容與 Anthropic 兩條路徑都要。測試走不設 HTTP 的 client() 路徑,才測得到修補。
func TestCrossOriginRedirectStopped(t *testing.T) {
	var hitsB int32
	b := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hitsB, 1)
		fmt.Fprint(w, streamOK)
	}))
	t.Cleanup(b.Close)
	a := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", b.URL+r.URL.Path) // 跨來源:不同 host(含 port)
		w.WriteHeader(http.StatusTemporaryRedirect)
	}))
	t.Cleanup(a.Close)

	for _, c := range []Service{
		&OpenAI{BaseURL: a.URL + "/v1"},
		&Anthropic{BaseURL: a.URL + "/v1", APIKey: "sk-x"},
	} {
		_, err := c.Chat(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil)
		if err == nil {
			t.Fatalf("%T 應拒絕跨來源重新導向", c)
		}
		if !errors.Is(err, ErrOffOriginRedirect) {
			t.Fatalf("%T 錯誤應可辨識為跨來源重新導向: %v", c, err)
		}
		if msg := err.Error(); !strings.Contains(msg, "已停止") || !strings.Contains(msg, "請確認設定中的端點網址") {
			t.Fatalf("%T 錯誤訊息應說明原因與處理方式: %q", c, msg)
		} else if strings.Contains(msg, `Post "`) || strings.Contains(msg, `Get "`) {
			t.Fatalf("%T 錯誤不得被包成 url.Error 的一長串,要讓作者直接看到原因: %q", c, msg)
		}
	}
	if n := atomic.LoadInt32(&hitsB); n != 0 {
		t.Fatalf("另一台主機收到 %d 個請求,稿件不得被送出", n)
	}
}

// 意圖(#132):同來源的重新導向是端點內部的正常行為(例如 /v1 轉址),照常跟隨,不能因此擋掉可用的端點。
func TestSameOriginRedirectFollowed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/chat/completions":
			w.Header().Set("Location", "/v2/chat/completions")
			w.WriteHeader(http.StatusTemporaryRedirect)
		case "/v2/chat/completions":
			fmt.Fprint(w, streamOK)
		case "/v1/messages":
			w.Header().Set("Location", "/v2/messages")
			w.WriteHeader(http.StatusTemporaryRedirect)
		case "/v2/messages":
			fmt.Fprint(w, anthropicStreamOK)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)

	msg, err := (&OpenAI{BaseURL: srv.URL + "/v1"}).Chat(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil)
	if err != nil || msg.Content != "ok" {
		t.Fatalf("同來源 307 應照常跟隨: msg=%+v err=%v", msg, err)
	}
	if _, err := (&Anthropic{BaseURL: srv.URL + "/v1", APIKey: "sk-x"}).Chat(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "hi"}}}, nil); err != nil {
		t.Fatalf("Anthropic 同來源 307 應照常跟隨: %v", err)
	}
}
