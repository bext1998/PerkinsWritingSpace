package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/agent"
	"perkins/internal/llm"
	"perkins/internal/project"
	"perkins/internal/research"
	"perkins/internal/settings"

	"github.com/zalando/go-keyring"
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

// 意圖(review-round3 第 1 點):前置失敗要走到真正的錯誤路徑並斷言錯誤原因。
// 兩個情境,各恰好一筆 ask:
//
//	A. 尚未選擇模型(agent 非空、store 用隔離 temp dir 無模型)→ prepare 成功、begin 拒絕 →
//	   App 前置失敗記一筆(sent=false、requests 空、error 含「尚未選擇模型」)。
//	B. 端點錯誤:prepare 不會失敗(clientFor 恆可取得 profile),端點錯誤發生在交給 Agent 後的
//	   LLM.Chat(不可達端點),由 Agent 的 defer 記恰好一筆(sent=true、requests 含失敗請求),
//	   App 層不得重複。以隔離 store 指向封閉埠,不讀寫作者設定、不呼叫真模型。
func TestAskAIPrematureFailureRecordsOnce(t *testing.T) {
	keyring.MockInit() // 隔離憑證庫(review-round4 D3):clientFor 會經 ProfileAPIKey 讀 keyring,不得碰作者的原生憑證庫
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
	a.agent = &agent.Agent{Proj: p, Research: a.research} // 非空:避開 errNoProject,走到真正的錯誤路徑
	a.ctx = context.Background()                          // begin() 需要非 nil 的 parent context(startup 才會設定)
	// 隔離 store:temp dir 無 settings.json → 載入預設 profile(default/localhost:1234)且無模型
	tmpCfg := t.TempDir()
	a.store = &settings.Store{Dir: tmpCfg}

	// 情境 A:尚未選擇模型
	err = a.AskAI(agent.AskParams{Question: "q"})
	if err == nil || !strings.Contains(err.Error(), "尚未選擇模型") {
		t.Fatalf("應因尚未選擇模型失敗, got %v", err)
	}
	evs := askResearchEvents(t, dir)
	if len(evs) != 1 {
		t.Fatalf("前置失敗應恰好一筆 ask, got %d", len(evs))
	}
	if evs[0]["sent"] != false || evs[0]["result"] != "error" {
		t.Fatalf("應標 sent=false/error: %v", evs[0])
	}
	if em, ok := evs[0]["error"].(string); !ok || !strings.Contains(em, "尚未選擇模型") {
		t.Fatalf("error 應含尚未選擇模型: %v", evs[0]["error"])
	}
	if r, ok := evs[0]["requests"].([]any); !ok || len(r) != 0 {
		t.Fatalf("requests 應為空: %v", evs[0]["requests"])
	}

	// 情境 B:端點錯誤 — 模型已選但端點不可達,交給 Agent 後在 LLM.Chat 失敗;恰好一筆、不重複。
	// 說明:現行程式的 clientFor("") 在 prepare 不會失敗(ActiveProfile 恆可取得),端點錯誤
	// 發生在交給 Agent 之後;App.AskAI 的 goroutine 會呼叫 wails runtime(測試程序無法提供
	// wails context,EventsEmit 會直接終止程序),因此以 prepare 套上同一套端點/模型後直接
	// 呼叫 Agent.Ask 驗證 — 記錄路徑與 goroutine 內相同(rlogAsk 的 defer),App 層前置記錄
	// 不介入,不得重複。
	s := a.store.Load()
	s.Profiles[0].Model = "m"
	s.Profiles[0].BaseURL = "http://127.0.0.1:1/v1" // 封閉埠:連線被拒
	s.Active = "default"
	if err := a.store.Save(s); err != nil {
		t.Fatal(err)
	}
	a.mu.Lock()
	ag, _, perr := a.prepare()
	a.mu.Unlock()
	if perr != nil {
		t.Fatalf("prepare 不應失敗: %v", perr)
	}
	if _, aerr := ag.Ask(context.Background(), agent.AskParams{Question: "q2"}, func(agent.Event) {}); aerr == nil {
		t.Fatal("封閉埠端點應失敗")
	}
	evs = askResearchEvents(t, dir)
	if len(evs) != 2 {
		t.Fatalf("端點錯誤應記恰好一筆(共 2 筆), got %d", len(evs))
	}
	ev := evs[1]
	if ev["result"] != "error" || ev["model"] != "m" {
		t.Fatalf("第二筆應由 Agent 記錄端點錯誤: %v", ev)
	}
	if ev["sent"] != true {
		t.Fatalf("送出的請求應標 sent=true: %v", ev)
	}
	if r, ok := ev["requests"].([]any); !ok || len(r) != 1 {
		t.Fatalf("失敗的請求應保存: %v", ev["requests"])
	}
	if em, ok := ev["error"].(string); !ok || !strings.Contains(em, "dial") {
		t.Fatalf("error 應為端點連線錯誤: %v", ev["error"])
	}
}

// 意圖:關閉前的存檔保護不能被繞過(SPEC §17.1)。第一次關閉必須被阻止並通知前端,
// 前端確認(ConfirmQuit 設旗標)之後才放行;每次都必須通知,前端才不會漏掉存檔視窗。
func TestBeforeCloseBlocksUntilConfirmed(t *testing.T) {
	app := NewApp()
	var emits int
	app.emitClose = func(context.Context) { emits++ }
	ctx := context.Background()

	if !app.beforeClose(ctx) {
		t.Fatal("尚未確認時,第一次關閉應被阻止")
	}
	if !app.beforeClose(ctx) {
		t.Fatal("尚未確認時,重複關閉仍應被阻止")
	}
	if emits != 2 {
		t.Fatalf("每次關閉都應通知前端,got %d", emits)
	}
	app.allowQuit() // ConfirmQuit 會再呼叫 runtime.Quit,需真實 frontend context,測試只驗旗標轉換
	if app.beforeClose(ctx) {
		t.Fatal("已確認後應放行關閉")
	}
}

// previewLLMStub 是唯一指標的 llm.Client 替身:用它比對 Agent.LLM 是否被換掉。
type previewLLMStub struct{ tag string }

func (previewLLMStub) Chat(context.Context, llm.Request, func(string)) (llm.Message, error) {
	return llm.Message{}, nil
}

// 意圖(PR #54 返工,G2 相關):請求進行中時,背景的 PreviewContext 不得改寫執行中 Agent 的
// 端點設定(LLM/Model/ContextTokens/Remote);否則請求中切到雲端端點,背景重算會讓後續
// 工具回合送往雲端,繞過送出確認。閒置時仍應把目前端點套上(既有行為)。
func TestPreviewContextDoesNotTouchRunningAgent(t *testing.T) {
	keyring.MockInit() // 隔離憑證庫:clientFor 會經 ProfileAPIKey 讀 keyring
	dir := t.TempDir()
	p, err := project.Create(dir, "n")
	if err != nil {
		t.Fatal(err)
	}
	a := NewApp()
	a.proj = p
	a.agent = &agent.Agent{Proj: p, LLM: previewLLMStub{tag: "running"}, Model: "m", Remote: false}
	a.ctx = context.Background() // prepare 需要非 nil 的 parent context
	tmpCfg := t.TempDir()
	a.store = &settings.Store{Dir: tmpCfg} // 隔離設定:預設 profile(default/localhost:1234)
	s := a.store.Load()
	s.Profiles[0].Model = "m"
	s.Profiles[0].ContextTokens = 999
	s.Active = "default"
	if err := a.store.Save(s); err != nil {
		t.Fatal(err)
	}

	// 情境 A:請求進行中 — PreviewContext 不得改寫 Agent 端點設定
	a.mu.Lock()
	a.cancel = func() {} // 模擬 begin() 已取得執行權
	a.mu.Unlock()
	if _, err := a.PreviewContext(agent.AskParams{Question: "q"}); err != nil {
		t.Fatalf("忙碌時 PreviewContext 應沿用目前值估算: %v", err)
	}
	a.mu.Lock()
	running := a.agent
	a.mu.Unlock()
	if _, ok := running.LLM.(previewLLMStub); !ok {
		t.Fatalf("忙碌時 LLM 被換掉: %T", running.LLM)
	}
	if running.Model != "m" || running.ContextTokens != 0 || running.Remote {
		t.Fatalf("忙碌時端點設定被改寫: model=%s tokens=%d remote=%v", running.Model, running.ContextTokens, running.Remote)
	}

	// 情境 B:閒置 — PreviewContext 會把目前端點套上(既有行為,確認沒被一起拿掉)
	a.mu.Lock()
	a.cancel = nil
	a.mu.Unlock()
	if _, err := a.PreviewContext(agent.AskParams{Question: "q"}); err != nil {
		t.Fatalf("閒置時 PreviewContext 不應失敗: %v", err)
	}
	a.mu.Lock()
	idle := a.agent
	a.mu.Unlock()
	if _, ok := idle.LLM.(previewLLMStub); ok {
		t.Fatal("閒置時應套上目前端點(LLM 已換成真實 client)")
	}
	if idle.ContextTokens != 999 {
		t.Fatalf("閒置時 ContextTokens 應為設定的 999, got %d", idle.ContextTokens)
	}
}

// 意圖(#114 返工,G2 相關):「/」選單只讀技能,不能改寫執行中請求的端點設定。
// 請求進行中時若 ListSkills 呼叫 prepare,而作者剛在聊天模型選單選了尚未確認的雲端端點,
// Agent.Ask 的下一個工具回合就會改用那個端點,把原本只授權送本機的上下文送往雲端,繞過 begin() 的外流確認。
func TestListSkillsDoesNotTouchRunningAgent(t *testing.T) {
	keyring.MockInit() // 隔離憑證庫:prepare 會經 ProfileAPIKey 讀 keyring
	a := sessionApp(t)
	a.agent.LLM = previewLLMStub{tag: "running-local"}
	a.agent.Model = "running-local-model"
	a.agent.Remote = false
	a.mu.Lock()
	a.cancel = func() {} // 模擬 begin() 已取得執行權(請求進行中)
	a.mu.Unlock()
	cfg := a.store.Load()
	cfg.Profiles[0].BaseURL = "https://example.invalid/v1" // 雲端且未經作者確認:prepare 會換掉 LLM 與 Remote
	cfg.Profiles[0].Model = "unconfirmed-cloud-model"
	cfg.Active = cfg.Profiles[0].ID
	if err := a.store.Save(cfg); err != nil {
		t.Fatal(err)
	}
	if got, err := a.ListSkills(); err != nil || len(got) != 0 {
		t.Fatalf("沒有技能目錄應回空清單,不該是錯誤:%v %v", got, err)
	}
	a.mu.Lock()
	ag := a.agent
	a.mu.Unlock()
	if _, ok := ag.LLM.(previewLLMStub); !ok {
		t.Fatalf("ListSkills 換掉了執行中請求的 LLM:%T", ag.LLM)
	}
	if ag.Model != "running-local-model" || ag.Remote {
		t.Fatalf("ListSkills 改寫了執行中的端點:model=%s remote=%v", ag.Model, ag.Remote)
	}
	if _, err := (&App{}).ListSkills(); err != errNoProject { // 沒有開作品:照現有慣例回錯
		t.Fatalf("未開作品應回 errNoProject, got %v", err)
	}
}

// 意圖(#32):App.CompactChat 綁定接到 Agent.Compact(手動 /compact):對話太短沒有可壓縮
// 內容時把明確錯誤原樣回給前端(不靜默不做),結束後釋放執行權,忙碌時照 begin() 拒絕;
// prepare 要把端點的 disableAutoCompact 套到 Agent。成功路徑會發 chat:event(runtime.EventsEmit),
// 測試程序沒有 wails runtime 不能直接呼叫(EventsEmit 會終止程序,同上註),
// 壓縮與通知行為由 internal/agent 的 TestManualCompact* 覆蓋。
func TestCompactChatWiringAndPreparePassesSwitch(t *testing.T) {
	keyring.MockInit() // 隔離憑證庫:prepare 會經 ProfileAPIKey 讀 keyring
	dir := t.TempDir()
	p, err := project.Create(dir, "n")
	if err != nil {
		t.Fatal(err)
	}
	a := NewApp()
	a.proj = p
	a.agent = &agent.Agent{Proj: p}
	a.agent.History = []llm.Message{{Role: "user", Content: "q"}, {Role: "assistant", Content: "a"}} // compactKeep 以下:沒有可壓縮的較早對話
	a.ctx = context.Background()
	a.store = &settings.Store{Dir: t.TempDir()}
	s := a.store.Load()
	s.Profiles[0].Model = "m"
	s.Profiles[0].DisableAutoCompact = true
	if err := a.store.Save(s); err != nil {
		t.Fatal(err)
	}

	// 情境 A:沒有可壓縮的對話 — 明確錯誤回給前端,且執行權已釋放(第二次呼叫不再報「尚未結束」)
	err = a.CompactChat()
	if err == nil || !strings.Contains(err.Error(), "沒有可濃縮") {
		t.Fatalf("應回「沒有可濃縮的較早對話」: %v", err)
	}
	if err := a.CompactChat(); err == nil || strings.Contains(err.Error(), "尚未結束") {
		t.Fatalf("壓縮結束後應釋放執行權: %v", err)
	}

	// 情境 B:忙碌(請求進行中)照 begin() 拒絕
	a.mu.Lock()
	a.cancel = func() {}
	a.mu.Unlock()
	if err := a.CompactChat(); err == nil || !strings.Contains(err.Error(), "尚未結束") {
		t.Fatalf("忙碌時應拒絕: %v", err)
	}

	// prepare 把端點的開關套到 Agent(情境 A 的呼叫已跑過 prepare,這裡直接驗欄位)
	a.mu.Lock()
	a.cancel = nil
	ag, _, perr := a.prepare()
	a.mu.Unlock()
	if perr != nil {
		t.Fatal(perr)
	}
	if !ag.DisableAutoCompact {
		t.Fatal("prepare 應把端點的 disableAutoCompact 套到 Agent")
	}
}

// 意圖(#38 設定頁編輯作者指示):全域與作品兩層各自讀寫;檔案不存在時讀為空(不是錯誤),
// 儲存即建立;內容清空並儲存 = 寫入空檔(不刪檔);寫檔失敗回錯;範圍不對回錯。
func TestAgentsMdReadWrite(t *testing.T) {
	// 設定目錄尚不存在 = 全新使用者首次儲存全域指示(PR #92 審查)
	cfg := filepath.Join(t.TempDir(), "Perkins")
	a := NewApp()
	a.store = &settings.Store{Dir: cfg}

	// 全域層:不存在 → 讀為空,路徑在設定目錄
	v, err := a.ReadAgentsMd("global")
	if err != nil {
		t.Fatal(err)
	}
	if v.Text != "" || v.Path != filepath.Join(cfg, "AGENTS.md") || v.Limit != agent.AgentsLimit {
		t.Fatalf("檔案不存在應讀為空並帶路徑與上限: %+v", v)
	}
	// 儲存才寫檔;寫入後讀回同一份,估算長度與上限同一組
	if _, err := a.WriteAgentsMd("global", "全域指示"); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(cfg, "AGENTS.md"))
	if err != nil || string(b) != "全域指示" {
		t.Fatalf("儲存後檔案應存在且內容一致: %q %v", b, err)
	}
	v, err = a.ReadAgentsMd("global")
	if err != nil || v.Text != "全域指示" || v.Tokens != agent.EstimateAgentsMd("全域指示") {
		t.Fatalf("讀回內容與估算長度應一致: %+v %v", v, err)
	}

	// 作品層:沒有開作品 → 回錯;開啟後讀寫在作品資料夾根目錄
	if _, err := a.ReadAgentsMd("project"); err == nil {
		t.Fatal("沒有開作品時讀作品層應回錯")
	}
	dir := t.TempDir()
	p, err := project.Create(dir, "n")
	if err != nil {
		t.Fatal(err)
	}
	a.proj = p
	pf := filepath.Join(dir, "AGENTS.md")
	if v, err := a.ReadAgentsMd("project"); err != nil || v.Text != "" || v.Path != pf {
		t.Fatalf("作品層不存在應讀為空: %+v %v", v, err)
	}
	if _, err := a.WriteAgentsMd("project", "作品指示"); err != nil {
		t.Fatal(err)
	}
	if b, err := os.ReadFile(pf); err != nil || string(b) != "作品指示" {
		t.Fatalf("作品層應寫在作品資料夾根目錄: %q %v", b, err)
	}

	// 內容清空並儲存 = 寫入空檔(不刪檔)
	if _, err := a.WriteAgentsMd("project", ""); err != nil {
		t.Fatal(err)
	}
	if b, err := os.ReadFile(pf); err != nil || len(b) != 0 {
		t.Fatalf("清空儲存應寫入空檔而不是刪檔: %q %v", b, err)
	}
	if v, err := a.ReadAgentsMd("project"); err != nil || v.Text != "" || v.Tokens != 0 {
		t.Fatalf("空檔讀回應為空: %+v %v", v, err)
	}

	// 寫檔失敗回錯(路徑是目錄,寫入必然失敗)
	bad := filepath.Join(t.TempDir(), "AGENTS.md")
	if err := os.MkdirAll(bad, 0o755); err != nil {
		t.Fatal(err)
	}
	a.store = &settings.Store{Dir: filepath.Dir(bad)}
	if _, err := a.WriteAgentsMd("global", "x"); err == nil || !strings.Contains(err.Error(), "無法寫入") {
		t.Fatalf("寫檔失敗應回錯並說明原因, got %v", err)
	}

	// 範圍不對回錯
	if _, err := a.ReadAgentsMd("nope"); err == nil {
		t.Fatal("未知範圍應回錯")
	}
}

// 意圖(#98):設定頁改的可讀範圍,下一次組裝請求就由後端從 perkins.json 套上(預覽回報的就是實際範圍)。
func TestBotReadSettingAppliesToNextRequest(t *testing.T) {
	keyring.MockInit()
	dir := t.TempDir()
	p, err := project.Create(dir, "n")
	if err != nil {
		t.Fatal(err)
	}
	a := NewApp()
	a.proj = p
	a.agent = &agent.Agent{Proj: p}
	a.ctx = context.Background()
	a.store = &settings.Store{Dir: t.TempDir()}
	pv, err := a.PreviewContext(agent.AskParams{Question: "q"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(pv.Readable, ",") != "canon,outline,notes" {
		t.Fatalf("預設可讀 = %v, want [canon outline notes]", pv.Readable)
	}
	if err := a.SetBotRead("canon", false); err != nil {
		t.Fatal(err)
	}
	if err := a.SetBotRead("notes", false); err != nil {
		t.Fatal(err)
	}
	pv, err = a.PreviewContext(agent.AskParams{Question: "q"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(pv.Readable, ",") != "outline" {
		t.Fatalf("改設定後可讀 = %v, want [outline]", pv.Readable)
	}
	v, err := a.GetBotRead()
	if err != nil || len(v) != 3 || v[0].On || !v[1].On || v[2].On {
		t.Fatalf("GetBotRead = %+v, %v", v, err)
	}
}

// 意圖(#99):雲端端點確認一次後保存在設定檔(重開作品或應用程式都不再問);網址改變時要重新確認;
// 未確認時後端拒絕送出(對話、/compact、章節摘要共用 begin)。前端不能用 SaveProfile 偷帶確認。
func TestRemoteAckPersistsUntilURLChanges(t *testing.T) {
	keyring.MockInit()
	dir := t.TempDir()
	p, err := project.Create(dir, "n")
	if err != nil {
		t.Fatal(err)
	}
	cfgDir := t.TempDir()
	a := NewApp()
	a.proj = p
	a.agent = &agent.Agent{Proj: p}
	a.ctx = context.Background()
	a.store = &settings.Store{Dir: cfgDir}
	cloud := settings.Profile{ID: "cloud", Name: "雲端", BaseURL: "https://api.example.com/v1", Model: "m", RemoteAckURL: "https://api.example.com/v1"}
	if _, err := a.SaveProfile(cloud, nil); err != nil {
		t.Fatal(err)
	}
	s := a.store.Load()
	s.Active = "cloud"
	a.store.Save(s)
	view := func(st *settings.Store) ProfileView {
		b := &App{store: st}
		for _, v := range b.GetSettings().Profiles {
			if v.ID == "cloud" {
				return v
			}
		}
		t.Fatal("找不到端點")
		return ProfileView{}
	}
	if v := view(a.store); v.RemoteOk {
		t.Fatal("SaveProfile 不得接受前端帶來的確認")
	}
	if _, _, _, err := a.begin(); err == nil || !strings.Contains(err.Error(), "本機之外") {
		t.Fatalf("未確認的雲端端點應拒絕送出: %v", err)
	}
	if _, err := a.AckRemote("cloud"); err != nil {
		t.Fatal(err)
	}
	// 另一個 Store 實例讀同一個設定目錄 = 重新啟動應用程式
	if v := view(&settings.Store{Dir: cfgDir}); !v.RemoteOk {
		t.Fatal("確認應保存在設定檔")
	}
	_, _, cancel, err := a.begin()
	if err != nil {
		t.Fatalf("確認後應可送出: %v", err)
	}
	a.end(cancel)
	// 改其他欄位(網址不變)不需重新確認
	cloud.Model = "m2"
	if _, err := a.SaveProfile(cloud, nil); err != nil {
		t.Fatal(err)
	}
	if !view(a.store).RemoteOk {
		t.Fatal("網址沒變時確認應保留")
	}
	// 網址改變要重新確認
	cloud.BaseURL = "https://other.example.com/v1"
	if _, err := a.SaveProfile(cloud, nil); err != nil {
		t.Fatal(err)
	}
	if view(a.store).RemoteOk {
		t.Fatal("網址改變後應重新確認")
	}
}
