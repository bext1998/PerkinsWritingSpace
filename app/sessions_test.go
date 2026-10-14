package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/llm"
	"perkins/internal/project"
	"perkins/internal/sessions"
	"perkins/internal/settings"
)

// sessionApp 以隔離的設定目錄(t.TempDir)建立 App,不碰真實 %APPDATA%。
func sessionApp(t *testing.T) *App {
	t.Helper()
	dir := t.TempDir()
	p, err := project.Create(dir, "n")
	if err != nil {
		t.Fatal(err)
	}
	a := NewApp()
	a.ctx = context.Background()
	a.store = &settings.Store{Dir: t.TempDir()}
	a.setProject(p)
	return a
}

// 意圖(#33):保存與接續的往返——History、拒絕原因(#40)、前端顯示用的 turns 都要能存能讀;
// 接續時目前會話先存好再切換,History 與拒絕原因載回 Agent(下一次送給模型的訊息因此含舊對話與拒絕原因,
// agent 層的斷言在 internal/agent/session_test.go)。
// 破壞驗證:SaveSession 漏存任一塊、ResumeSession 沒載回、沒先存目前會話,本測試會失敗。
func TestSessionSaveResumeRoundTrip(t *testing.T) {
	a := sessionApp(t)
	a.agent.RestoreSession([]llm.Message{
		{Role: "user", Content: "舊問題"},
		{Role: "assistant", Content: "舊回答"},
	}, []string{"拒絕原因 A"})
	turns := []sessions.Turn{
		{Role: "user", Text: "舊問題"},
		{Role: "tool", Text: "· 提出修改提案 第一章.md", ProposalIDs: []string{"20261015-010000-abc123"}},
		{Role: "assistant", Text: "舊回答"},
	}

	m, err := a.SaveSession(turns)
	if err != nil {
		t.Fatal(err)
	}
	if m.ID == "" || m.Title != "舊問題" || m.Turns != 1 || !m.Current {
		t.Fatalf("保存後的摘要不符: %+v", m)
	}
	list, err := a.ListSessions()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != m.ID || !list[0].Current {
		t.Fatalf("清單應只有目前會話: %+v", list)
	}

	// 「新對話」開始新的會話 id;之後的回合屬於新的一份
	a.ResetChat()
	if _, err := a.SaveSession([]sessions.Turn{{Role: "user", Text: "另一個問題"}, {Role: "assistant", Text: "另一個回答"}}); err != nil {
		t.Fatal(err)
	}
	list, _ = a.ListSessions()
	if len(list) != 2 {
		t.Fatalf("新對話應另存一份: %+v", list)
	}

	// 接續:目前會話先存好再切換(上面已存),舊的 History、拒絕原因與 turns 原樣載回
	resumed, err := a.ResumeSession(m.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(resumed.Turns) != 3 || resumed.Turns[0].Text != "舊問題" || resumed.Turns[2].Text != "舊回答" {
		t.Fatalf("接續應載回 turns: %+v", resumed.Turns)
	}
	// #124:回合上建立的提案 id 要隨會話存檔與接續(已處理的提案卡靠它留在原對話的原位)
	if len(resumed.Turns[1].ProposalIDs) != 1 || resumed.Turns[1].ProposalIDs[0] != "20261015-010000-abc123" {
		t.Fatalf("接續應載回回合建立的提案 id: %+v", resumed.Turns[1])
	}
	if len(resumed.History) != 2 || resumed.History[1].Content != "舊回答" || len(resumed.Rejections) != 1 || resumed.Rejections[0] != "拒絕原因 A" {
		t.Fatalf("接續應載回 History 與拒絕原因: %+v / %+v", resumed.History, resumed.Rejections)
	}
	hist, rej := a.agent.Snapshot()
	if len(hist) != 2 || len(rej) != 1 {
		t.Fatalf("History 與拒絕原因應載回 Agent: %+v / %+v", hist, rej)
	}
	list, _ = a.ListSessions()
	var cur string
	for _, it := range list {
		if it.Current {
			cur = it.ID
		}
	}
	if cur != m.ID {
		t.Fatalf("接續後目前會話標示應是 %s: %+v", m.ID, list)
	}
}

// 意圖(#33):接續前要把目前的對話先存好——還沒保存過的目前對話不能因為切換而消失。
// 破壞驗證:ResumeSession 不先存目前會話(currentTurns),本測試會失敗。
func TestResumeSavesCurrentSessionFirst(t *testing.T) {
	a := sessionApp(t)
	old, err := a.SaveSession([]sessions.Turn{{Role: "user", Text: "舊問題"}, {Role: "assistant", Text: "舊回答"}})
	if err != nil {
		t.Fatal(err)
	}
	a.ResetChat()
	cur := []sessions.Turn{{Role: "user", Text: "未保存的問題"}, {Role: "assistant", Text: "未保存的回答"}}
	if _, err := a.ResumeSession(old.ID, cur); err != nil {
		t.Fatal(err)
	}
	list, err := a.ListSessions()
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, it := range list {
		if it.Title == "未保存的問題" && it.ID != old.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("切換前應先把目前對話存成一份: %+v", list)
	}
}

// 意圖(#33):空會話(沒有任何回合)不存檔。
// 破壞驗證:SaveSession 對空 turns 也寫檔,本測試會失敗。
func TestEmptySessionNotSaved(t *testing.T) {
	a := sessionApp(t)
	m, err := a.SaveSession(nil)
	if err != nil {
		t.Fatal(err)
	}
	if m.ID != "" {
		t.Fatalf("空會話不應建立 id: %+v", m)
	}
	list, err := a.ListSessions()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 0 {
		t.Fatalf("空會話不應出現在清單(也就不該存檔): %+v", list)
	}
}

// 意圖(#33):寫檔失敗要回錯誤給前端顯示(錯誤列),不靜默。
// 破壞驗證:SaveSession 吞掉存檔層的錯誤,本測試會失敗。
func TestSaveSessionWriteFailureReturnsError(t *testing.T) {
	a := sessionApp(t)
	blocker := filepath.Join(t.TempDir(), "cfg")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.store = &settings.Store{Dir: blocker} // 設定目錄是檔案 → sessions/ 建不出來
	_, err := a.SaveSession([]sessions.Turn{{Role: "user", Text: "q"}})
	if err == nil {
		t.Fatal("寫檔失敗應回傳錯誤")
	}
	if !strings.Contains(err.Error(), "對話記錄") {
		t.Fatalf("錯誤應說明是對話記錄失敗: %v", err)
	}
}

// 意圖(#33):請求進行中時拒絕切換會話(切換會改到執行中 Agent 的對話歷史)。
// 破壞驗證:ResumeSession 不檢查 a.cancel,本測試會失敗。
func TestResumeRejectedWhileRequestInFlight(t *testing.T) {
	a := sessionApp(t)
	m, err := a.SaveSession([]sessions.Turn{{Role: "user", Text: "q"}, {Role: "assistant", Text: "a"}})
	if err != nil {
		t.Fatal(err)
	}
	a.mu.Lock()
	a.cancel = func() {} // 模擬請求進行中
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		a.cancel = nil
		a.mu.Unlock()
	}()
	if _, err := a.ResumeSession(m.ID, nil); err == nil || !strings.Contains(err.Error(), "請求進行中") {
		t.Fatalf("請求進行中應拒絕切換: %v", err)
	}
}

// 意圖(#33):刪除/永久刪除目前會話後,下一次保存開的是新會話(不寫回回收區的舊記錄);
// 封存與還原的狀態移動在 App 層也要一致。
// 破壞驗證:dropCurrent 沒清掉 curSess 時,本測試會失敗。
func TestDeleteCurrentSessionStartsNew(t *testing.T) {
	a := sessionApp(t)
	turns := []sessions.Turn{{Role: "user", Text: "q"}, {Role: "assistant", Text: "a"}}
	m, err := a.SaveSession(turns)
	if err != nil {
		t.Fatal(err)
	}
	if err := a.ArchiveSession(m.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := a.DeleteSession(m.ID); err != nil {
		t.Fatal(err)
	}
	m2, err := a.SaveSession(turns)
	if err != nil {
		t.Fatal(err)
	}
	if m2.ID == m.ID {
		t.Fatalf("已刪除的會話不應繼續被寫入: %+v", m2)
	}
	list, _ := a.ListSessions()
	status := map[string]sessions.Status{}
	for _, it := range list {
		status[it.ID] = it.Status
	}
	if status[m.ID] != sessions.StatusDeleted || status[m2.ID] != sessions.StatusActive {
		t.Fatalf("狀態不符: %+v", status)
	}
	if err := a.RestoreSession(m.ID); err != nil {
		t.Fatal(err)
	}
	if err := a.PurgeSession(m.ID); err == nil {
		t.Fatal("不在回收區的會話不應可永久刪除")
	}
	if err := a.DeleteSession(m.ID); err != nil {
		t.Fatal(err)
	}
	if err := a.PurgeSession(m.ID); err != nil {
		t.Fatal(err)
	}
	list, _ = a.ListSessions()
	for _, it := range list {
		if it.ID == m.ID {
			t.Fatalf("永久刪除後不應還在清單: %+v", list)
		}
	}
}

// 接續期間不能開始新請求:否則接續完成時會把執行中請求的 History 換成舊會話(PR #89 審查)。
func TestResumeHoldsRunSlotUntilDone(t *testing.T) {
	a := sessionApp(t)
	a.agent.RestoreSession([]llm.Message{{Role: "user", Content: "old"}, {Role: "assistant", Content: "old answer"}}, nil)
	m, err := a.SaveSession([]sessions.Turn{{Role: "user", Text: "old"}})
	if err != nil {
		t.Fatal(err)
	}
	a.ResetChat()
	entered, release := make(chan struct{}), make(chan struct{})
	resumeHook = func() { close(entered); <-release }
	defer func() { resumeHook = nil }()
	done := make(chan error, 1)
	go func() { _, err := a.ResumeSession(m.ID, nil); done <- err }()
	<-entered
	if _, _, _, err := a.begin(); err == nil || !strings.Contains(err.Error(), "上一個請求尚未結束") {
		t.Fatalf("接續途中不該能開始新請求,得到 %v", err)
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	a.mu.Lock()
	busy := a.cancel != nil
	a.mu.Unlock()
	if busy {
		t.Fatal("接續結束後要釋放執行權")
	}
}

// 回合存檔之後才拒絕提案(實際常見順序),接著開新對話再接續,拒絕原因仍要在(PR #89 審查)。
func TestRejectionAfterSaveSurvivesNewChat(t *testing.T) {
	a := sessionApp(t)
	rel := "manuscript/test.md"
	if err := a.proj.WriteFile(rel, "original"); err != nil {
		t.Fatal(err)
	}
	p, err := a.agent.Proposals.Create("m", rel, "original", "replacement", "why", nil)
	if err != nil {
		t.Fatal(err)
	}
	a.agent.RestoreSession([]llm.Message{{Role: "user", Content: "q"}, {Role: "assistant", Content: "a"}}, nil)
	m, err := a.SaveSession([]sessions.Turn{{Role: "user", Text: "q"}, {Role: "assistant", Text: "a"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.RejectProposal(p.ID, "保持敘事口吻"); err != nil {
		t.Fatal(err)
	}
	a.ResetChat()
	s, err := a.ResumeSession(m.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Rejections) != 1 || !strings.Contains(s.Rejections[0], "保持敘事口吻") {
		t.Fatalf("拒絕原因應隨會話保存,得到 %q", s.Rejections)
	}
	if _, rej := a.agent.Snapshot(); len(rej) != 1 {
		t.Fatalf("接續後 Agent 應載回拒絕原因,得到 %q", rej)
	}
}

// #124 意圖:接受與拒絕都會改動對話歷史(提案狀態通知)。回合存檔之後才處理提案時,
// 這些狀態也要跟著會話存檔與接續——否則換了一段對話,模型會以為被拒的提案還在待審。
func TestProposalStatusHistorySurvivesResume(t *testing.T) {
	a := sessionApp(t)
	rel := "manuscript/test.md"
	if err := a.proj.WriteFile(rel, "original second"); err != nil {
		t.Fatal(err)
	}
	rejected, err := a.agent.Proposals.Create("m", rel, "original", "第一版", "why", nil)
	if err != nil {
		t.Fatal(err)
	}
	accepted, err := a.agent.Proposals.Create("m", rel, "second", "第二版", "why", nil)
	if err != nil {
		t.Fatal(err)
	}
	a.agent.RestoreSession([]llm.Message{{Role: "user", Content: "q"}, {Role: "assistant", Content: "a"}}, nil)
	m, err := a.SaveSession([]sessions.Turn{{Role: "user", Text: "q"}, {Role: "assistant", Text: "a"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.RejectProposal(rejected.ID, "太口語"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.AcceptProposal(accepted.ID, 0, nil); err != nil {
		t.Fatal(err)
	}
	a.ResetChat()
	s, err := a.ResumeSession(m.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	var joined strings.Builder
	for _, h := range s.History {
		joined.WriteString(h.Content)
	}
	hist := joined.String()
	if !strings.Contains(hist, rejected.ID) || !strings.Contains(hist, "重新提出") {
		t.Fatalf("接續後的 History 應仍記得哪個提案被拒、請重新提案:%q", hist)
	}
	if !strings.Contains(hist, accepted.ID) || !strings.Contains(hist, "不再是待審") {
		t.Fatalf("接續後的 History 應仍記得哪個提案已接受:%q", hist)
	}
}
