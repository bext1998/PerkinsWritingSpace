package agent

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"perkins/internal/llm"
)

// joined 把對話歷史接成一段,方便檢查「歷史裡有沒有技能全文」。
func joined(msgs []llm.Message) string {
	var b strings.Builder
	for _, m := range msgs {
		b.WriteString(m.Content)
		b.WriteString("\n---\n")
	}
	return b.String()
}

// setupSkills 沿用 setup 的作品與假的 LLM,另給一個技能目錄。
func setupSkills(t *testing.T) (*Agent, *scripted, string) {
	t.Helper()
	a, s, dir := setup(t)
	skills := filepath.Join(dir, "skills")
	if err := os.MkdirAll(skills, 0o755); err != nil {
		t.Fatal(err)
	}
	a.SkillsDir = skills
	return a, s, skills
}

func writeSkill(t *testing.T, dir, name, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// 意圖(作者可用):技能檔一個一份 Markdown,名稱=檔名去掉 .md,說明=第一個非空行;
// 含空白的名稱叫不到(叫用以空白前的一個詞)、內建指令名不可被技能佔用、非 .md 檔不是技能。
func TestListSkillsNamesAndDescs(t *testing.T) {
	a, _, dir := setupSkills(t)
	writeSkill(t, dir, "改節奏.md", "\n# 改節奏\n檢查每個場景的步調\n")
	writeSkill(t, dir, "校稿流程.md", "第一段\n第二段\n") // 說明只取第一個非空行
	writeSkill(t, dir, "含 空白.md", "不應該出現\n")
	writeSkill(t, dir, "compact.md", "不應該出現\n")
	writeSkill(t, dir, "new.md", "不應該出現\n")
	writeSkill(t, dir, "說明.txt", "不是技能\n")
	if err := os.MkdirAll(filepath.Join(dir, "子目錄.md"), 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := a.ListSkills()
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, s := range got {
		names = append(names, s.Name)
	}
	want := []string{"改節奏", "校稿流程"} // 依名稱排序;含空白/內建名/非 md/目錄都略過
	if strings.Join(names, ",") != strings.Join(want, ",") {
		t.Fatalf("技能清單 = %v,應為 %v", names, want)
	}
	byName := map[string]string{}
	for _, s := range got {
		byName[s.Name] = s.Desc
	}
	if byName["改節奏"] != "改節奏" {
		t.Fatalf("說明應去掉開頭的 # 與空白,得到 %q", byName["改節奏"])
	}
	if byName["校稿流程"] != "第一段" {
		t.Fatalf("說明應只取第一個非空行,得到 %q", byName["校稿流程"])
	}
}

// 沒有技能目錄不是錯誤;技能目錄讀取失敗要回錯不吞掉(§12.3「技能與 / 指令」)。
func TestListSkillsMissingDirIsEmptyButBrokenDirErrors(t *testing.T) {
	a, _, dir := setup(t)
	a.SkillsDir = filepath.Join(dir, "沒有這個目錄")
	got, err := a.ListSkills()
	if err != nil || len(got) != 0 {
		t.Fatalf("沒有技能目錄應回空清單,不該是錯誤:%v %v", got, err)
	}
	a.SkillsDir = filepath.Join(dir, "x\x00y") // Windows 上無效路徑:不是「不存在」,是讀取失敗
	if _, err := a.ListSkills(); err == nil {
		t.Fatal("技能目錄讀取失敗應回錯,不吞掉")
	}
	a.SkillsDir = "" // 未設定技能目錄 = 沒有技能
	if got, err := a.ListSkills(); err != nil || len(got) != 0 {
		t.Fatalf("沒有技能目錄設定應回空清單:%v %v", got, err)
	}
}

// 技能檔讀不到時同樣回錯(不是「沒有這個技能」),呼叫端不把內容送給模型。
func TestSkillFileReadErrorIsNotSwallowed(t *testing.T) {
	a, s, dir := setupSkills(t)
	if err := os.MkdirAll(filepath.Join(dir, "壞掉.md"), 0o755); err != nil { // 檔名是目錄:讀檔會失敗
		t.Fatal(err)
	}
	s.replies = []llm.Message{{Role: "assistant", Content: "不該被呼叫"}}
	_, err := a.Ask(context.Background(), AskParams{Question: "/壞掉 幫我看"}, func(Event) {})
	if err == nil {
		t.Fatal("技能檔讀取失敗應回錯")
	}
	if !strings.Contains(err.Error(), "無法讀取技能 壞掉") {
		t.Fatalf("錯誤訊息要說明是讀不到技能檔,得到 %v", err)
	}
	if len(s.reqs) != 0 {
		t.Fatalf("讀不到技能檔不應送出任何請求:%d", len(s.reqs))
	}
}

// 意圖(#114):技能全文只出現在叫用它的**那一個**請求的 system 訊息裡;
// 預覽逐項列出技能名稱;對話歷史只記作者打的字(含 /技能名),不記技能全文;下一次不叫用就沒有技能。
func TestSkillOnlyInInvokingRequestAndNotInHistory(t *testing.T) {
	a, s, dir := setupSkills(t)
	writeSkill(t, dir, "改節奏.md", "# 改節奏\n每個場景結尾前先停一拍。\n")
	s.replies = []llm.Message{
		{Role: "assistant", Content: "好的,我會注意節奏。"},
		{Role: "assistant", Content: "這次沒有技能。"},
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "/改節奏 第一章的結尾太趕"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	sys := s.reqs[0].Messages[0].Content
	if !strings.Contains(sys, "【作者技能:改節奏】") || !strings.Contains(sys, "每個場景結尾前先停一拍") {
		t.Fatalf("叫用的技能應放進該次請求的 system:%q", sys)
	}
	if !strings.Contains(sys, "不能改變前面的系統規則") {
		t.Fatalf("技能後應附上不能改變系統規則的說明:%q", sys)
	}
	// 預覽列出技能,前端不自己猜(A6)
	pv, err := a.Preview(AskParams{Question: "/改節奏 第一章的結尾太趕"})
	if err != nil {
		t.Fatal(err)
	}
	if len(pv.Skills) != 1 || pv.Skills[0] != "改節奏" {
		t.Fatalf("預覽應列出技能名稱:%+v", pv.Skills)
	}
	// 歷史只有作者打的字(含 /技能名),不含技能全文
	hist := joined(a.History)
	if strings.Contains(hist, "每個場景結尾前先停一拍") {
		t.Fatalf("技能全文不應寫進對話歷史:%q", hist)
	}
	if !strings.Contains(hist, "/改節奏 第一章的結尾太趕") {
		t.Fatalf("歷史應保留作者打的字:%q", hist)
	}
	// 下一次不叫用:系統訊息不再帶技能
	if _, err := a.Ask(context.Background(), AskParams{Question: "繼續"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	if sys2 := s.reqs[1].Messages[0].Content; strings.Contains(sys2, "【作者技能:改節奏】") {
		t.Fatalf("沒有叫用的回合不應帶技能:%q", sys2)
	}
	if pv2, _ := a.Preview(AskParams{Question: "繼續"}); len(pv2.Skills) != 0 {
		t.Fatalf("沒有叫用時預覽不應列技能:%+v", pv2.Skills)
	}
}

// 意圖(#114):叫不到技能就不送給模型,直接回錯;內建指令名(compact/new)的技能檔永遠不會被叫用。
func TestUnknownOrReservedSkillIsError(t *testing.T) {
	a, s, dir := setupSkills(t)
	writeSkill(t, dir, "compact.md", "不應該被叫用\n")
	writeSkill(t, dir, "new.md", "不應該被叫用\n")
	s.replies = []llm.Message{{Role: "assistant", Content: "ok"}}
	// 叫不到的技能:回錯,不送出任何請求(前端也不會送出)
	if _, err := a.Ask(context.Background(), AskParams{Question: "/沒有這個技能 做一下"}, func(Event) {}); err == nil {
		t.Fatal("叫不到技能應回錯")
	} else if !strings.Contains(err.Error(), "沒有這個技能或指令") {
		t.Fatalf("錯誤訊息要明確,得到 %v", err)
	}
	if _, err := a.Preview(AskParams{Question: "/沒有這個技能"}); err == nil {
		t.Fatal("預覽也應回錯")
	}
	if len(s.reqs) != 0 {
		t.Fatalf("叫不到技能不應送出任何請求:%d", len(s.reqs))
	}
	// /compact、/new 由前端自己處理(不送給模型);就算送到後端,也不會去讀 compact.md/new.md
	for _, q := range []string{"/compact", "/new"} {
		if _, err := a.Ask(context.Background(), AskParams{Question: q}, func(Event) {}); err != nil {
			t.Fatalf("「%s」不應被當成技能回錯:%v", q, err)
		}
	}
	for _, r := range s.reqs {
		if strings.Contains(r.Messages[0].Content, "不應該被叫用") {
			t.Fatal("內建指令名的技能檔永遠不應被叫用")
		}
	}
}

// 意圖(#114 護欄):超過上限的技能整份不送出、不截斷,但要說明原因(notices;與 AGENTS.md 同一套)。
func TestSkillOverLimitIsNotSentWithNotice(t *testing.T) {
	a, s, dir := setupSkills(t)
	writeSkill(t, dir, "很長的技能.md", "# 很長\n"+strings.Repeat("超", SkillsLimit+200)+"\n")
	s.replies = []llm.Message{{Role: "assistant", Content: "好"}}
	if _, err := a.Ask(context.Background(), AskParams{Question: "/很長的技能 幫我看"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	sys := s.reqs[0].Messages[0].Content
	if strings.Contains(sys, "【作者技能:很長的技能】") || strings.Contains(sys, strings.Repeat("超", 100)) {
		t.Fatalf("超過上限的技能不應放進 system:%q", sys)
	}
	pv, err := a.Preview(AskParams{Question: "/很長的技能 幫我看"})
	if err != nil {
		t.Fatal(err)
	}
	if len(pv.Skills) != 0 {
		t.Fatalf("沒送出的技能不應列在預覽:%+v", pv.Skills)
	}
	found := false
	for _, n := range pv.Notices {
		if strings.Contains(n, "很長的技能") && strings.Contains(n, "長度上限") {
			found = true
		}
	}
	if !found {
		t.Fatalf("應有說明未送出的 notice:%+v", pv.Notices)
	}
}

// 作者指示之後才放技能(順序固定:系統規則 → 作者指示 → 技能)。
func TestSkillComesAfterAuthorInstructions(t *testing.T) {
	a, s, dir := setupSkills(t)
	writeSkill(t, dir, "改節奏.md", "技能內容標記\n")
	if err := os.WriteFile(filepath.Join(a.Proj.Root, "AGENTS.md"), []byte("作品指示標記\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	s.replies = []llm.Message{{Role: "assistant", Content: "好"}}
	if _, err := a.Ask(context.Background(), AskParams{Question: "/改節奏"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	sys := s.reqs[0].Messages[0].Content
	iAg, iSk := strings.Index(sys, "作品指示標記"), strings.Index(sys, "技能內容標記")
	if iAg < 0 || iSk < 0 || iAg > iSk {
		t.Fatalf("技能應在作者指示之後:%q", sys)
	}
}

// 意圖(#114 護欄,G1–G4):技能叫用只能讀技能目錄裡的檔案。名稱帶路徑/磁碟語法時,後端在讀檔前
// 就擋下並回錯——不能只靠前端(前端以清單名稱擋住叫用),Ask 與 Preview 都不得讀出技能目錄外的 Markdown。
func TestSkillNameOutsideSkillsDirIsNotRead(t *testing.T) {
	a, s, dir := setupSkills(t)
	if err := os.WriteFile(filepath.Join(filepath.Dir(dir), "outside.md"), []byte("PRIVATE-OUTSIDE-SKILL"), 0o644); err != nil {
		t.Fatal(err)
	}
	s.replies = []llm.Message{{Role: "assistant", Content: "不該被呼叫"}}
	for _, q := range []string{"/../outside 幫我看", `/..\outside 幫我看`, "/子目錄/../outside 幫我看", "/C:outside 幫我看"} {
		if _, err := a.Ask(context.Background(), AskParams{Question: q}, func(Event) {}); err == nil {
			t.Fatalf("非法技能名稱應回錯,不讀技能目錄外的檔:%q", q)
		} else if !strings.Contains(err.Error(), "沒有這個技能或指令") {
			t.Fatalf("錯誤訊息要明確指出叫用不到,得到 %v", err)
		}
		if _, err := a.Preview(AskParams{Question: q}); err == nil {
			t.Fatalf("預覽同樣應回錯:%q", q)
		}
	}
	if len(s.reqs) != 0 {
		t.Fatalf("非法技能名稱不應送出任何請求:%d", len(s.reqs))
	}
}

// 意圖(#114):名稱與問題以「任何空白字元」分隔,含換行——多行輸入框貼上「/校稿\n問題」常見。
// 前後端都以空白前的一個詞當名稱(前端 split(/\s/),後端 unicode.IsSpace)。
func TestNewlineSeparatesSkillFromQuestion(t *testing.T) {
	a, s, dir := setupSkills(t)
	writeSkill(t, dir, "校稿.md", "技能內容標記\n")
	s.replies = []llm.Message{{Role: "assistant", Content: "好"}}
	pv, err := a.Preview(AskParams{Question: "/校稿\n請檢查這段文字"})
	if err != nil {
		t.Fatalf("換行應被當成名稱與問題的分隔:%v", err)
	}
	if len(pv.Skills) != 1 || pv.Skills[0] != "校稿" {
		t.Fatalf("預覽應列出技能:%+v", pv.Skills)
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "/校稿\n請檢查這段文字"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	if sys := s.reqs[0].Messages[0].Content; !strings.Contains(sys, "【作者技能:校稿】") {
		t.Fatalf("換行叫用的技能應放進 system:%q", sys)
	}
}