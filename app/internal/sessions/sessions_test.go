package sessions

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/llm"
)

func newStore(t *testing.T) *Store {
	t.Helper()
	return NewStore(t.TempDir())
}

func sample() *Session {
	return &Session{
		ID:     "20261011-120000-abcd1234",
		Title:  "幫我把開頭改得更緊湊",
		Status: StatusActive,
		History: []llm.Message{
			{Role: "user", Content: "幫我把開頭改得更緊湊"},
			{Role: "assistant", Content: "我建議把背景移到後面。"},
		},
		Rejections: []string{"canon/characters.md 的提案:不要改動敘事視角"},
		Turns: []Turn{
			{Role: "user", Text: "幫我把開頭改得更緊湊"},
			{Role: "assistant", Text: "我建議把背景移到後面。"},
			{Role: "tool", Text: "讀取 manuscript/01.md", Args: `{"path":"manuscript/01.md"}`, Result: "# 第一章"},
			{Role: "notice", Text: "較早的對話已濃縮成摘要"},
		},
	}
}

// 意圖(#33):存讀往返不能掉內容——History(送給模型的回合)、拒絕原因(#40)、
// 前端顯示用的 turns(含工具列與通知)都要原樣回來,接續時才有完整對話。
// 破壞驗證:任一欄位漏存或名稱改錯(例如 turns 寫成 displayTurns),本測試會失敗。
func TestSaveReadRoundTrip(t *testing.T) {
	st := newStore(t)
	in := sample()
	if err := st.Save("C:/proj/novel", in); err != nil {
		t.Fatal(err)
	}
	out, err := st.Get("C:/proj/novel", in.ID)
	if err != nil {
		t.Fatal(err)
	}
	if out.Title != in.Title || out.Status != in.Status || out.CreatedAt == "" || out.UpdatedAt == "" {
		t.Fatalf("基本欄位不符: %+v", out)
	}
	if len(out.History) != 2 || out.History[0].Content != in.History[0].Content || out.History[1].Role != "assistant" {
		t.Fatalf("History 往返不符: %+v", out.History)
	}
	if len(out.Rejections) != 1 || out.Rejections[0] != in.Rejections[0] {
		t.Fatalf("Rejections 往返不符: %+v", out.Rejections)
	}
	if len(out.Turns) != 4 || out.Turns[2].Role != "tool" || out.Turns[2].Args != `{"path":"manuscript/01.md"}` ||
		out.Turns[3].Role != "notice" || out.Turns[0].Text != in.Turns[0].Text {
		t.Fatalf("Turns 往返不符: %+v", out.Turns)
	}
	m := MetaOf(out)
	if m.Turns != 1 { // 回合數 = 使用者提問次數(工具列與通知不算)
		t.Fatalf("回合數應為 1, got %d", m.Turns)
	}
}

// 意圖(#33):三種狀態的移動——封存/取消封存、刪除(移到回收區)、還原、永久刪除——
// 狀態與檔案位置(回收區 trash/)要一致,刪除可還原,永久刪除才真的消失。
// 破壞驗證:刪除不搬進 trash(無法還原)、還原後狀態不回一般、永久刪除不刪檔,都會失敗。
func TestStatusTransitions(t *testing.T) {
	st := newStore(t)
	root := "C:/proj/novel"
	s := sample()
	if err := st.Save(root, s); err != nil {
		t.Fatal(err)
	}
	live := filepath.Join(st.dirFor(root), s.ID+".json")
	trash := filepath.Join(st.trashFor(root), s.ID+".json")

	// 封存 / 取消封存
	if err := st.Archive(root, s.ID, true); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.Get(root, s.ID); got == nil || got.Status != StatusArchived {
		t.Fatalf("封存後狀態應為 archived: %+v", got)
	}
	if _, err := os.Stat(live); err != nil {
		t.Fatalf("封存不搬檔案: %v", err)
	}
	if err := st.Archive(root, s.ID, false); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.Get(root, s.ID); got == nil || got.Status != StatusActive {
		t.Fatalf("取消封存後狀態應為 active: %+v", got)
	}

	// 刪除 → 回收區,可還原
	if err := st.Delete(root, s.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(trash); err != nil {
		t.Fatalf("刪除後檔案應在回收區 trash/: %v", err)
	}
	if _, err := os.Stat(live); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("刪除後原位置不應留檔: %v", err)
	}
	if got, _ := st.Get(root, s.ID); got == nil || got.Status != StatusDeleted {
		t.Fatalf("刪除後狀態應為 deleted: %+v", got)
	}
	if err := st.Restore(root, s.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.Get(root, s.ID); got == nil || got.Status != StatusActive {
		t.Fatalf("還原後狀態應為 active: %+v", got)
	}
	if _, err := os.Stat(live); err != nil {
		t.Fatalf("還原後檔案應回到原位置: %v", err)
	}

	// 永久刪除:只限回收區,刪了就真的沒有
	if err := st.Purge(root, s.ID); err == nil {
		t.Fatal("一般狀態的會話不應可永久刪除")
	}
	if err := st.Delete(root, s.ID); err != nil {
		t.Fatal(err)
	}
	if err := st.Purge(root, s.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Get(root, s.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("永久刪除後應找不到: %v", err)
	}
	if _, err := os.Stat(trash); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("永久刪除後回收區不應留檔: %v", err)
	}

	// 還原/封存不存在的會話要回錯,不靜默
	if err := st.Restore(root, s.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("還原不存在的會話應回 ErrNotFound: %v", err)
	}
	if err := st.Archive(root, "nope", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("封存不存在的會話應回 ErrNotFound: %v", err)
	}
}

// 意圖(#33):刪除 → 還原後不能永久刪除錯對象;已刪除的會話不能直接封存(要先還原)。
func TestDeletedSessionGuards(t *testing.T) {
	st := newStore(t)
	root := "C:/proj/novel"
	s := sample()
	if err := st.Save(root, s); err != nil {
		t.Fatal(err)
	}
	if err := st.Delete(root, s.ID); err != nil {
		t.Fatal(err)
	}
	if err := st.Archive(root, s.ID, true); err == nil {
		t.Fatal("已刪除的會話不應可直接封存")
	}
	if err := st.Restore(root, s.ID); err != nil {
		t.Fatal(err)
	}
	if err := st.Restore(root, s.ID); err == nil {
		t.Fatal("一般狀態的會話不應可還原(不在回收區)")
	}
}

// 意圖(#33):不同作品的記錄互不相見(作品鍵 = 根目錄路徑雜湊)。
// 破壞驗證:dirFor 不依 root 分目錄(全部寫進同一個資料夾)時,本測試會失敗。
func TestProjectsAreIsolated(t *testing.T) {
	st := newStore(t)
	a, b := sample(), sample()
	a.ID, a.Title = "s-a", "A 作品的問題"
	b.ID, b.Title = "s-b", "B 作品的問題"
	if err := st.Save("C:/proj/novelA", a); err != nil {
		t.Fatal(err)
	}
	if err := st.Save("C:/proj/novelB", b); err != nil {
		t.Fatal(err)
	}
	la, err := st.List("C:/proj/novelA")
	if err != nil {
		t.Fatal(err)
	}
	if len(la) != 1 || la[0].ID != "s-a" {
		t.Fatalf("A 作品只應看到自己的記錄: %+v", la)
	}
	lb, err := st.List("C:/proj/novelB")
	if err != nil {
		t.Fatal(err)
	}
	if len(lb) != 1 || lb[0].ID != "s-b" {
		t.Fatalf("B 作品只應看到自己的記錄: %+v", lb)
	}
	// 鍵用絕對路徑:同一個作品以不同寫法開啟仍是同一個鍵;不同作品一定不同鍵
	if Key(`C:\proj\novelA`) != Key("c:/proj/novelA/") {
		t.Fatal("同一個作品的不同路徑寫法應有相同的鍵")
	}
	if Key("C:/proj/novelA") == Key("C:/proj/novelB") {
		t.Fatal("不同作品不應有相同的鍵")
	}
}

// 意圖(#33):清單列出狀態與已刪除(回收區)的會話,依更新時間排序;損毀的記錄檔要回錯,
// 不當成空清單(沿用 §12.2「清單損毀不當空清單」原則),作者才有機會修復。
func TestListIncludesTrashAndFailsOnCorrupt(t *testing.T) {
	st := newStore(t)
	root := "C:/proj/novel"
	s := sample()
	if err := st.Save(root, s); err != nil {
		t.Fatal(err)
	}
	if err := st.Delete(root, s.ID); err != nil {
		t.Fatal(err)
	}
	list, err := st.List(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Status != StatusDeleted {
		t.Fatalf("清單應含回收區中的會話: %+v", list)
	}
	// 寫一個讀不懂的記錄檔:List 要回錯
	if err := os.MkdirAll(st.dirFor(root), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(st.dirFor(root), "bad.json"), []byte("{不是 json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := st.List(root); err == nil {
		t.Fatal("損毀的記錄檔不應被略過成空清單")
	}
}

// 意圖(#33):寫檔失敗要回錯(前端顯示錯誤列),不靜默。儲存層的根目錄被檔案佔住時無法建立目錄。
// 破壞驗證:Save 吞掉 MkdirAll/WriteFile 的錯誤時,本測試會失敗。
func TestWriteFailureReturnsError(t *testing.T) {
	base := t.TempDir()
	blocker := filepath.Join(base, "sessions")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	st := &Store{Dir: blocker}
	err := st.Save("C:/proj/novel", sample())
	if err == nil {
		t.Fatal("寫入失敗應回傳錯誤")
	}
	if !strings.Contains(err.Error(), "對話記錄") {
		t.Fatalf("錯誤訊息應說明是對話記錄寫入失敗: %v", err)
	}
}

// 意圖(#33):標題取第一個使用者問題並截短;沒有使用者回合時標題為空。
func TestTitleFor(t *testing.T) {
	long := strings.Repeat("問", 60)
	got := TitleFor([]Turn{{Role: "assistant", Text: "先說別的"}, {Role: "user", Text: long}})
	if !strings.HasPrefix(got, strings.Repeat("問", 40)) || !strings.HasSuffix(got, "…") {
		t.Fatalf("標題應截短並加刪節號: %q", got)
	}
	if TitleFor([]Turn{{Role: "assistant", Text: "只有回覆"}}) != "" {
		t.Fatal("沒有使用者問題時標題應為空")
	}
}
