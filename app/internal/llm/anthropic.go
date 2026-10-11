package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// Anthropic 是 Anthropic 原生 Messages API 的最小串流客戶端(#30)。
// 與 OpenAI 相容客戶端實作同一個 Client 介面。差異(官方文件,見 docs/SPEC.md §12.3):
//   - 認證用 x-api-key + anthropic-version,不是 Authorization: Bearer;
//   - system 訊息放頂層 system,工具用 input_schema,tool 角色轉 tool_result;
//   - 工具迴圈要把 assistant 的 thinking 區塊(含 signature)原樣傳回,存放在 Message.Thinking;
//   - 思考強度用頂層 output_config.effort(low/medium/high/xhigh/max),不送 thinking 欄位;
//   - prompt caching 用頂層 cache_control(官方自動快取),max_tokens 必填。
type Anthropic struct {
	BaseURL string // 預設 https://api.anthropic.com/v1
	APIKey  string
	HTTP    *http.Client
	// ReasoningEffort 是思考強度(#30):空字串 = 不送任何思考參數。
	// 允許值 low/medium/high/xhigh/max(官方 effort 參數)。
	ReasoningEffort string
}

const (
	anthropicBaseURL   = "https://api.anthropic.com/v1"
	anthropicVersion   = "2023-06-01"
	anthropicMaxTokens = 32000
)

// anthropicEfforts 是 Anthropic 原生 API 的 output_config.effort 允許值。
var anthropicEfforts = []string{"low", "medium", "high", "xhigh", "max"}

func (c *Anthropic) client() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return http.DefaultClient
}

func (c *Anthropic) do(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	base := strings.TrimRight(c.BaseURL, "/")
	if base == "" {
		base = anthropicBaseURL
	}
	req, err := http.NewRequestWithContext(ctx, method, base+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.APIKey)
	req.Header.Set("anthropic-version", anthropicVersion)
	resp, err := c.client().Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode/100 != 2 {
		defer resp.Body.Close()
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("模型端點回應 %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return resp, nil
}

// ListModels 回傳 GET /models 的 data[].id。
func (c *Anthropic) ListModels(ctx context.Context) ([]string, error) {
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

// ---- 請求組裝 ----

type anthropicMsg struct {
	Role    string            `json:"role"`
	Content []json.RawMessage `json:"content"`
}

type anthropicTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema"`
}

type anthropicCacheControl struct {
	Type string `json:"type"`
}

type anthropicOutputConfig struct {
	Effort string `json:"effort"`
}

type anthropicRequest struct {
	Model        string                 `json:"model"`
	MaxTokens    int                    `json:"max_tokens"`
	System       string                 `json:"system,omitempty"`
	Messages     []anthropicMsg         `json:"messages"`
	Tools        []anthropicTool        `json:"tools,omitempty"`
	Stream       bool                   `json:"stream"`
	CacheControl anthropicCacheControl  `json:"cache_control"`
	OutputConfig *anthropicOutputConfig `json:"output_config,omitempty"`
}

type anthropicTextBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type anthropicToolUseBlock struct {
	Type  string          `json:"type"`
	ID    string          `json:"id"`
	Name  string          `json:"name"`
	Input json.RawMessage `json:"input"`
}

type anthropicToolResultBlock struct {
	Type      string `json:"type"`
	ToolUseID string `json:"tool_use_id"`
	Content   string `json:"content"`
}

func rawBlock(v any) (json.RawMessage, error) {
	b, err := json.Marshal(v)
	return json.RawMessage(b), err
}

// toAnthropicMessages 把內部 Message 轉成 Messages API 的格式:
// system 收斂成頂層字串;tool 角色轉 user 的 tool_result(連續的結果合併同一個 user 訊息);
// assistant 的 thinking 區塊原樣放在 text/tool_use 之前。
func toAnthropicMessages(msgs []Message) (string, []anthropicMsg, error) {
	var system string
	out := []anthropicMsg{}
	for i := 0; i < len(msgs); i++ {
		m := msgs[i]
		switch m.Role {
		case "system":
			if m.Content != "" {
				if system != "" {
					system += "\n\n"
				}
				system += m.Content
			}
		case "assistant":
			blocks := []json.RawMessage{}
			if len(m.Thinking) > 0 {
				var thinking []json.RawMessage
				if err := json.Unmarshal(m.Thinking, &thinking); err != nil {
					return "", nil, fmt.Errorf("思考區塊格式無效: %w", err)
				}
				blocks = append(blocks, thinking...)
			}
			if m.Content != "" {
				b, err := rawBlock(anthropicTextBlock{Type: "text", Text: m.Content})
				if err != nil {
					return "", nil, err
				}
				blocks = append(blocks, b)
			}
			for _, tc := range m.ToolCalls {
				input := json.RawMessage(tc.Arguments)
				if !json.Valid(input) {
					input = json.RawMessage("{}")
				}
				b, err := rawBlock(anthropicToolUseBlock{Type: "tool_use", ID: tc.ID, Name: tc.Name, Input: input})
				if err != nil {
					return "", nil, err
				}
				blocks = append(blocks, b)
			}
			if len(blocks) > 0 {
				out = append(out, anthropicMsg{Role: "assistant", Content: blocks})
			}
		case "tool":
			blocks := []json.RawMessage{}
			for i < len(msgs) && msgs[i].Role == "tool" {
				b, err := rawBlock(anthropicToolResultBlock{Type: "tool_result", ToolUseID: msgs[i].ToolCallID, Content: msgs[i].Content})
				if err != nil {
					return "", nil, err
				}
				blocks = append(blocks, b)
				i++
			}
			i--
			out = append(out, anthropicMsg{Role: "user", Content: blocks})
		default:
			if m.Content != "" {
				b, err := rawBlock(anthropicTextBlock{Type: "text", Text: m.Content})
				if err != nil {
					return "", nil, err
				}
				out = append(out, anthropicMsg{Role: "user", Content: []json.RawMessage{b}})
			}
		}
	}
	return system, out, nil
}

// Chat 組出 Messages API 請求並解析串流回應。
func (c *Anthropic) Chat(ctx context.Context, req Request, onDelta func(string)) (Message, error) {
	system, messages, err := toAnthropicMessages(req.Messages)
	if err != nil {
		return Message{}, err
	}
	body := anthropicRequest{
		Model:        req.Model,
		MaxTokens:    anthropicMaxTokens,
		System:       system,
		Messages:     messages,
		Stream:       true,
		CacheControl: anthropicCacheControl{Type: "ephemeral"},
	}
	if eff := sendableEffort(c.ReasoningEffort, anthropicEfforts); eff != "" {
		body.OutputConfig = &anthropicOutputConfig{Effort: eff}
	}
	for _, t := range req.Tools {
		schema := t.Parameters
		if len(schema) == 0 {
			schema = json.RawMessage(`{"type":"object"}`)
		}
		body.Tools = append(body.Tools, anthropicTool{Name: t.Name, Description: t.Description, InputSchema: schema})
	}
	b, err := json.Marshal(body)
	if err != nil {
		return Message{}, err
	}
	resp, err := c.do(ctx, http.MethodPost, "/messages", b)
	if err != nil {
		return Message{}, err
	}
	defer resp.Body.Close()
	return parseAnthropicStream(resp.Body, onDelta)
}

// ---- 串流解析 ----

type anthropicBlockState struct {
	kind      string // text | tool_use | thinking | redacted_thinking
	text      strings.Builder
	args      strings.Builder
	thinking  strings.Builder
	signature strings.Builder
	data      string
	id        string
	name      string
}

// parseAnthropicStream 解析 SSE:文字分片送 onDelta;input_json_delta 累積成工具參數;
// thinking_delta 與 signature_delta 累積成必須原樣傳回的 thinking 區塊;error 事件回傳錯誤。
func parseAnthropicStream(r io.Reader, onDelta func(string)) (Message, error) {
	msg := Message{Role: "assistant"}
	blocks := map[int]*anthropicBlockState{}
	// stopped:收到 message_stop(官方串流的最後事件);stopReason 來自 message_delta
	var stopped bool
	var stopReason string
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		var ev struct {
			Type         string `json:"type"`
			Index        int    `json:"index"`
			ContentBlock struct {
				Type      string `json:"type"`
				ID        string `json:"id"`
				Name      string `json:"name"`
				Text      string `json:"text"`
				Thinking  string `json:"thinking"`
				Signature string `json:"signature"`
				Data      string `json:"data"`
			} `json:"content_block"`
			Delta struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				PartialJSON string `json:"partial_json"`
				Thinking    string `json:"thinking"`
				Signature   string `json:"signature"`
				StopReason  string `json:"stop_reason"`
			} `json:"delta"`
			Error *struct {
				Type    string `json:"type"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &ev); err != nil {
			return msg, fmt.Errorf("無法解析串流資料: %w", err)
		}
		if ev.Error != nil {
			return msg, fmt.Errorf("模型錯誤: %s", ev.Error.Message)
		}
		switch ev.Type {
		case "content_block_start":
			st := &anthropicBlockState{
				kind: ev.ContentBlock.Type,
				id:   ev.ContentBlock.ID,
				name: ev.ContentBlock.Name,
				data: ev.ContentBlock.Data,
			}
			st.text.WriteString(ev.ContentBlock.Text)
			st.thinking.WriteString(ev.ContentBlock.Thinking)
			st.signature.WriteString(ev.ContentBlock.Signature)
			blocks[ev.Index] = st
		case "content_block_delta":
			st := blocks[ev.Index]
			if st == nil {
				st = &anthropicBlockState{}
				blocks[ev.Index] = st
			}
			switch ev.Delta.Type {
			case "text_delta":
				st.text.WriteString(ev.Delta.Text)
				if onDelta != nil {
					onDelta(ev.Delta.Text)
				}
			case "input_json_delta":
				st.args.WriteString(ev.Delta.PartialJSON)
			case "thinking_delta":
				st.thinking.WriteString(ev.Delta.Thinking)
			case "signature_delta":
				st.signature.WriteString(ev.Delta.Signature)
			}
		case "message_delta":
			if ev.Delta.StopReason != "" {
				stopReason = ev.Delta.StopReason
			}
		case "message_stop":
			stopped = true
		case "error":
			// 防止沒有 error 欄位的 error 事件被吞掉
			return msg, fmt.Errorf("模型錯誤: %s", strings.TrimSpace(data))
		}
	}
	if err := sc.Err(); err != nil {
		return msg, err
	}
	// 連線提早結束(沒有 message_stop)或生成被截斷:回錯,不把不完整的文字或工具參數當成正常回覆
	if !stopped {
		return msg, fmt.Errorf("模型串流未正常結束(連線中斷)")
	}
	switch stopReason {
	case "max_tokens":
		return msg, fmt.Errorf("模型回覆被截斷:達到輸出上限 %d tokens", anthropicMaxTokens)
	case "model_context_window_exceeded":
		return msg, fmt.Errorf("模型回覆被截斷:超過模型上下文長度")
	}

	idx := make([]int, 0, len(blocks))
	for i := range blocks {
		idx = append(idx, i)
	}
	sort.Ints(idx)

	// thinking 區塊(含 signature)原樣保存,放在 text/tool_use 之前傳回下一次請求
	thinking := []json.RawMessage{}
	for _, i := range idx {
		st := blocks[i]
		switch st.kind {
		case "thinking":
			b, err := rawBlock(struct {
				Type      string `json:"type"`
				Thinking  string `json:"thinking"`
				Signature string `json:"signature"`
			}{Type: "thinking", Thinking: st.thinking.String(), Signature: st.signature.String()})
			if err != nil {
				return msg, err
			}
			thinking = append(thinking, b)
		case "redacted_thinking":
			b, err := rawBlock(struct {
				Type string `json:"type"`
				Data string `json:"data"`
			}{Type: "redacted_thinking", Data: st.data})
			if err != nil {
				return msg, err
			}
			thinking = append(thinking, b)
		}
	}
	if len(thinking) > 0 {
		arr, err := json.Marshal(thinking)
		if err != nil {
			return msg, err
		}
		msg.Thinking = arr
	}

	for n, i := range idx {
		st := blocks[i]
		switch st.kind {
		case "text":
			msg.Content += st.text.String()
		case "tool_use":
			tc := ToolCall{ID: st.id, Name: st.name, Arguments: st.args.String()}
			if tc.ID == "" {
				tc.ID = fmt.Sprintf("toolu_%d", n)
			}
			if tc.Arguments == "" {
				tc.Arguments = "{}"
			}
			msg.ToolCalls = append(msg.ToolCalls, tc)
		}
	}
	return msg, nil
}
