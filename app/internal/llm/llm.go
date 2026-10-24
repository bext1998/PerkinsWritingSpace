// Package llm 是模型端點的最小串流客戶端:OpenAI 相容 /chat/completions 與 Anthropic 原生 Messages API
// (#30)。涵蓋 LM Studio 等本機端點與雲端端點。
package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
)

type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON 字串
}

type Message struct {
	Role       string     `json:"role"` // system | user | assistant | tool
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"toolCalls,omitempty"`
	ToolCallID string     `json:"toolCallId,omitempty"`
	// Thinking 保存 Anthropic 原生 API 的 thinking 區塊(JSON 陣列,含 signature)。
	// 官方規定工具迴圈中要把 assistant 的 thinking 區塊完整、不修改地傳回下一次請求(#30),
	// 所以它只在同一個請求的記憶體中隨 Message 往返;不進對話歷史、不進研究記錄、不給前端。
	Thinking json.RawMessage `json:"-"`
}

type ToolDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"` // JSON Schema
}

type Request struct {
	Model    string
	Messages []Message
	Tools    []ToolDef
}

// Client 讓 agent 迴圈可以用假實作測試。
type Client interface {
	Chat(ctx context.Context, req Request, onDelta func(string)) (Message, error)
}

// ModelLister 另有列出模型的端點(設定頁選模型用)。
type ModelLister interface {
	ListModels(ctx context.Context) ([]string, error)
}

// Service 是 App 需要的客戶端能力:Agent 對話 + 列模型;OpenAI 相容與 Anthropic 原生客戶端都實作。
type Service interface {
	Client
	ModelLister
}

type OpenAI struct {
	BaseURL string // 例如 http://localhost:1234/v1
	APIKey  string
	HTTP    *http.Client
	// ReasoningEffort 是思考強度(#30):空字串 = 不送任何思考參數。
	// 允許值 low/medium/high;xhigh/max 只有 Anthropic 原生支援,設在 OpenAI 相容端點視為不指定。
	ReasoningEffort string
}

// openAIEfforts 是 OpenAI 相容端點的 reasoning_effort 允許值。
var openAIEfforts = []string{"low", "medium", "high"}

// sendableEffort 回傳實際要送出的思考強度;不在允許值內(含 Anthropic 專有的 xhigh/max)視為不指定。
func sendableEffort(v string, allowed []string) string {
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	return ""
}

// isOpenRouter 判斷端點是否為 OpenRouter(思考參數用 reasoning.effort,不是 reasoning_effort)。
func isOpenRouter(baseURL string) bool {
	u, err := url.Parse(strings.TrimRight(baseURL, "/"))
	return err == nil && u.Hostname() == "openrouter.ai"
}

// ErrOffOriginRedirect 是跨來源重新導向的哨兵錯誤(#132),呼叫端可用 errors.Is 辨識。
var ErrOffOriginRedirect = errors.New("跨來源重新導向已停止")

// CheckRedirect 是模型請求的重新導向政策(#132):只允許同來源(scheme + host,含 port)的重新導向。
// 端點用 307/308 把整份請求(含稿件)重送到別台主機時,內容會送往設定中未確認的位置,
// 繞過 #99 的外流確認(確認的只是設定中的網址),一律中止。同來源照常跟隨,
// 上限沿用 Go 預設的 10 次。
func CheckRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 10 {
		return errors.New("重新導向次數過多,已停止")
	}
	orig := via[0].URL
	if req.URL.Scheme != orig.Scheme || req.URL.Host != orig.Host {
		return fmt.Errorf("%w:模型端點要求重新導向到 %s://%s,為避免稿件送往未確認的位置已停止;請確認設定中的端點網址",
			ErrOffOriginRedirect, req.URL.Scheme, req.URL.Host)
	}
	return nil
}

// httpClient 是未注入 HTTP 時共用的客戶端:套用 CheckRedirect,不每次 new。
var httpClient = &http.Client{CheckRedirect: CheckRedirect}

// redirectErr 把 *url.Error 包住的 CheckRedirect 錯誤解開,讓作者直接看到中止原因,
// 而不是被包成 Get "…": 一長串(#132)。
func redirectErr(err error) error {
	var uerr *url.Error
	if errors.As(err, &uerr) && errors.Is(uerr.Err, ErrOffOriginRedirect) {
		return uerr.Err
	}
	return err
}

func (c *OpenAI) client() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return httpClient
}

func (c *OpenAI) do(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	resp, err := c.client().Do(req)
	if err != nil {
		return nil, redirectErr(err)
	}
	if resp.StatusCode/100 != 2 {
		defer resp.Body.Close()
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("模型端點回應 %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return resp, nil
}

func (c *OpenAI) ListModels(ctx context.Context) ([]string, error) {
	resp, err := c.do(ctx, http.MethodGet, "/models", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(out.Data))
	for _, m := range out.Data {
		ids = append(ids, m.ID)
	}
	return ids, nil
}

type wireMsg struct {
	Role       string         `json:"role"`
	Content    string         `json:"content"`
	ToolCalls  []wireToolCall `json:"tool_calls,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
}

type wireReasoning struct {
	Effort string `json:"effort"`
}

type wireToolCall struct {
	Index    int    `json:"index"`
	ID       string `json:"id,omitempty"`
	Type     string `json:"type,omitempty"`
	Function struct {
		Name      string `json:"name,omitempty"`
		Arguments string `json:"arguments,omitempty"`
	} `json:"function"`
}

func (c *OpenAI) Chat(ctx context.Context, req Request, onDelta func(string)) (Message, error) {
	type wireTool struct {
		Type     string  `json:"type"`
		Function ToolDef `json:"function"`
	}
	body := struct {
		Model           string         `json:"model"`
		Messages        []wireMsg      `json:"messages"`
		Tools           []wireTool     `json:"tools,omitempty"`
		Stream          bool           `json:"stream"`
		Reasoning       *wireReasoning `json:"reasoning,omitempty"`
		ReasoningEffort string         `json:"reasoning_effort,omitempty"`
	}{Model: req.Model, Stream: true}
	// 思考強度(#30):空值或不合法時不送任何欄位,請求 JSON 與未支援思考強度前逐位元組相同。
	if eff := sendableEffort(c.ReasoningEffort, openAIEfforts); eff != "" {
		if isOpenRouter(c.BaseURL) {
			body.Reasoning = &wireReasoning{Effort: eff}
		} else {
			body.ReasoningEffort = eff
		}
	}
	for _, m := range req.Messages {
		w := wireMsg{Role: m.Role, Content: m.Content, ToolCallID: m.ToolCallID}
		for i, tc := range m.ToolCalls {
			wt := wireToolCall{Index: i, ID: tc.ID, Type: "function"}
			wt.Function.Name, wt.Function.Arguments = tc.Name, tc.Arguments
			w.ToolCalls = append(w.ToolCalls, wt)
		}
		body.Messages = append(body.Messages, w)
	}
	for _, t := range req.Tools {
		body.Tools = append(body.Tools, wireTool{Type: "function", Function: t})
	}
	b, err := json.Marshal(body)
	if err != nil {
		return Message{}, err
	}
	resp, err := c.do(ctx, http.MethodPost, "/chat/completions", b)
	if err != nil {
		return Message{}, err
	}
	defer resp.Body.Close()
	return parseStream(resp.Body, onDelta)
}

// parseStream 解析 SSE,把分片的 content 與 tool_calls 組回完整訊息。
func parseStream(r io.Reader, onDelta func(string)) (Message, error) {
	msg := Message{Role: "assistant"}
	calls := map[int]*ToolCall{}
	var finishReason string
	done := false
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			done = true
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string         `json:"content"`
					ToolCalls []wireToolCall `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return msg, fmt.Errorf("無法解析串流資料: %w", err)
		}
		if chunk.Error != nil {
			return msg, fmt.Errorf("模型錯誤: %s", chunk.Error.Message)
		}
		for _, ch := range chunk.Choices {
			if ch.FinishReason != "" {
				finishReason = ch.FinishReason
			}
			if ch.Delta.Content != "" {
				msg.Content += ch.Delta.Content
				if onDelta != nil {
					onDelta(ch.Delta.Content)
				}
			}
			for _, tc := range ch.Delta.ToolCalls {
				cur := calls[tc.Index]
				if cur == nil {
					cur = &ToolCall{}
					calls[tc.Index] = cur
				}
				if tc.ID != "" {
					cur.ID = tc.ID
				}
				if tc.Function.Name != "" {
					cur.Name = tc.Function.Name
				}
				cur.Arguments += tc.Function.Arguments
			}
		}
	}
	if err := sc.Err(); err != nil {
		return msg, err
	}
	// 連線提早結束(沒有 [DONE] 也沒有 finish_reason)或生成被截斷:回錯,
	// 不把不完整的文字或工具參數當成正常回覆(工具呼叫因此不會被執行,#133)。
	if !done && finishReason == "" {
		return msg, fmt.Errorf("模型串流未正常結束(連線中斷)")
	}
	if finishReason == "length" {
		return msg, fmt.Errorf("模型回覆被截斷:達到輸出上限")
	}
	idx := make([]int, 0, len(calls))
	for i := range calls {
		idx = append(idx, i)
	}
	sort.Ints(idx)
	for _, i := range idx {
		tc := *calls[i]
		if tc.ID == "" {
			tc.ID = fmt.Sprintf("call_%d", i)
		}
		msg.ToolCalls = append(msg.ToolCalls, tc)
	}
	return msg, nil
}
