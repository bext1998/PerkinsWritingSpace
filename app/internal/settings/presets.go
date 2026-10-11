package settings

// 端點預設檔(#43):設定頁提供作者快速新增端點的清單。只含網址與顯示名稱等非機密資訊,
// 不含任何 API 金鑰(金鑰由作者填入、存系統憑證庫,A7/B10)。
// 網址以各家官方文件為準(核對紀錄見 docs/PROGRESS.md);ContextTokens 與模型名隨模型而異,
// 不確定就留 0/空(0 = 不設定,載入時套用預設 16384 或由作者填)。
type Preset struct {
	ID            string `json:"id"`                      // 可直接當 Profile.ID(小寫英文、數字、-)
	Name          string `json:"name"`                    // 顯示名稱
	BaseURL       string `json:"baseUrl"`                 // 端點網址(OpenAI 相容或 Anthropic 原生的基礎路徑)
	Provider      string `json:"provider,omitempty"`      // "" = OpenAI 相容;ProviderAnthropic = Anthropic 原生
	ContextTokens int    `json:"contextTokens,omitempty"` // 建議上下文長度;0 = 不設定,由作者填
	Model         string `json:"model,omitempty"`         // 預設模型名;空 = 用 ListModels 由作者選
	Local         bool   `json:"local"`                   // 本機端點(稿件不出這台電腦)
	Region        string `json:"region,omitempty"`        // 站別:intl(國際站)/ cn(中國站)/ 空
}

// Presets 回傳端點預設檔清單(每次呼叫回傳新切片,避免呼叫端改動共用資料)。
func Presets() []Preset {
	return []Preset{
		// ---- 本機 ----
		{ID: "lmstudio", Name: "LM Studio", BaseURL: "http://localhost:1234/v1", Local: true},
		{ID: "ollama", Name: "Ollama", BaseURL: "http://localhost:11434/v1", Local: true},
		{ID: "llamacpp", Name: "llama.cpp server", BaseURL: "http://localhost:9931/v1", Local: true},
		{ID: "vllm", Name: "vLLM", BaseURL: "http://localhost:8000/v1", Local: true},
		{ID: "jan", Name: "Jan", BaseURL: "http://localhost:1337/v1", Local: true},

		// ---- 服務商(OpenAI 相容) ----
		{ID: "openrouter", Name: "OpenRouter", BaseURL: "https://openrouter.ai/api/v1"},
		{ID: "fireworks", Name: "Fireworks AI", BaseURL: "https://api.fireworks.ai/inference/v1"},
		{ID: "together", Name: "Together AI", BaseURL: "https://api.together.ai/v1"},
		{ID: "openai", Name: "OpenAI", BaseURL: "https://api.openai.com/v1"},
		{ID: "google-ai-studio", Name: "Google AI Studio(OpenAI 相容)", BaseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"},
		{ID: "deepseek", Name: "DeepSeek", BaseURL: "https://api.deepseek.com"},
		{ID: "xai", Name: "xAI", BaseURL: "https://api.x.ai/v1"},
		{ID: "groq", Name: "Groq", BaseURL: "https://api.groq.com/openai/v1"},
		{ID: "mistral", Name: "Mistral", BaseURL: "https://api.mistral.ai/v1"},
		{ID: "cerebras", Name: "Cerebras", BaseURL: "https://api.cerebras.ai/v1"},
		{ID: "deepinfra", Name: "DeepInfra", BaseURL: "https://api.deepinfra.com/v1/openai"},
		{ID: "siliconflow", Name: "SiliconFlow 硅基流动", BaseURL: "https://api.siliconflow.cn/v1"},

		// ---- Anthropic 原生 Messages API(#30) ----
		{ID: "anthropic", Name: "Anthropic", BaseURL: "https://api.anthropic.com/v1", Provider: ProviderAnthropic},

		// ---- 國際站 / 中國站各一組(#43) ----
		// z.ai 沒有 /models 端點:給官方文件範例的預設模型名,作者可手填其他模型
		{ID: "zai-intl", Name: "z.ai(國際站)", BaseURL: "https://api.z.ai/api/paas/v4", Model: "glm-5.3", Region: "intl"},
		{ID: "zai-cn", Name: "智譜 bigmodel(中國站)", BaseURL: "https://open.bigmodel.cn/api/paas/v4", Model: "glm-5.3", Region: "cn"},
		{ID: "dashscope-intl", Name: "通義千問 DashScope(國際站)", BaseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", Region: "intl"},
		{ID: "dashscope-cn", Name: "通義千問 DashScope(中國站)", BaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", Region: "cn"},
		{ID: "minimax-intl", Name: "MiniMax(國際站)", BaseURL: "https://api.minimax.io/v1", Region: "intl"},
		{ID: "minimax-cn", Name: "MiniMax(中國站)", BaseURL: "https://api.minimax.cn/v1", Region: "cn"},
		{ID: "moonshot-intl", Name: "Moonshot Kimi(國際站)", BaseURL: "https://api.moonshot.ai/v1", Region: "intl"},
		{ID: "moonshot-cn", Name: "Moonshot Kimi(中國站)", BaseURL: "https://api.moonshot.cn/v1", Region: "cn"},
	}
}
