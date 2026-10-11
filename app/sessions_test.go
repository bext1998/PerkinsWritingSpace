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
	turns := []sessions.Turn{{Role: "user", Text: "舊問題"}, {Role: "assistant", Text: "舊回答"}}

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
	if len(resumed.Turns) != 2 || resumed.Turns[0].Text != "舊問題" || resumed.Turns[1].Text != "舊回答" {
		t.Fatalf("接續應載回 turns: %+v", resumed.Turns)
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
