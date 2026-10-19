package agent

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"perkins/internal/llm"
)

// makeDirLink 建立資料夾連結(Windows 用 junction,不需要管理員;其他平台用符號連結)。
// #132 的前提:作品資料夾裡已經有這種連結(模型沒有建立連結的工具)。
func makeDirLink(t *testing.T, link, target string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput()
		if err != nil {
			t.Fatalf("mklink /J %s: %v: %s", link, err, out)
		}
		return
	}
	if err := os.Symlink(target, link); err != nil {
		t.Fatalf("symlink %s: %v", link, err)
	}
}

// linkResults 把一次 Ask 中回給模型的工具結果收集起來(key = ToolCallID)。
func linkResults(t *testing.T, reqs []llm.Request, i int) map[string]string {
	t.Helper()
	res := map[string]string{}
	for _, m := range reqs[i].Messages {
		if m.Role == "tool" {
			res[m.ToolCallID] = m.Content
		}
	}
	return res
}

// 意圖(#132、SPEC §12.3「Bot 可讀範圍」、G2):作品內若有資料夾連結指向作者排除的 canon/
// 或作品外資料夾,Bot 不能經由連結讀到內容、搜到內容、列出內容,也不能對連結路徑建立提案;
// 一般路徑照常可讀。
func TestBotCannotUseFolderLinksToReachExcludedContent(t *testing.T) {
	a, s, dir := setup(t) // manuscript/第一章.md、canon/characters.md、canon/secret.md
	p := a.Proj
	a.Readable = []string{} // 作者排除 canon/、outline/、notes/(Bot 可讀範圍)
	if err := p.WriteFile("canon/hidden.md", "機密設定:未寫到劇情的伏筆。\n"); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.md"), []byte("機密外流:作品外的內容。\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	makeDirLink(t, filepath.Join(dir, "manuscript", "link"), filepath.Join(dir, "canon")) // (a) 未開放的 canon/
	makeDirLink(t, filepath.Join(dir, "manuscript", "outside"), outside)                  // (b) 作品外資料夾
	makeDirLink(t, filepath.Join(dir, "manuscript", "linkdir.md"), outside)               // 名稱像 .md 的連結

	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{
			{ID: "1", Name: "read_document", Arguments: `{"path":"manuscript/link/hidden.md"}`},
			{ID: "2", Name: "read_document", Arguments: `{"path":"manuscript/outside/secret.md"}`},
			{ID: "3", Name: "read_document", Arguments: `{"path":"manuscript/linkdir.md"}`},
			{ID: "4", Name: "read_document", Arguments: `{"path":"manuscript/第一章.md"}`},
			{ID: "5", Name: "search_project", Arguments: `{"query":"機密"}`},
			{ID: "6", Name: "list_files", Arguments: "{}"},
			{ID: "7", Name: "propose_patch", Arguments: `{"path":"manuscript/link/hidden.md","original":"機密設定:未寫到劇情的伏筆。","replacement":"改寫","rationale":"r"}`},
		}},
		{Role: "assistant", Content: "好"},
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "幫我看檔案"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	res := linkResults(t, s.reqs, 1)

	for id, path := range map[string]string{
		"1": "manuscript/link/hidden.md",
		"2": "manuscript/outside/secret.md",
		"3": "manuscript/linkdir.md",
		"7": "manuscript/link/hidden.md(提案)",
	} {
		if !strings.Contains(res[id], "連結") || !strings.Contains(res[id], "錯誤") {
			t.Errorf("read/propose %s 應以連結為由拒絕: %q", path, res[id])
		}
		for _, leaked := range []string{"機密設定", "機密外流"} {
			if strings.Contains(res[id], leaked) {
				t.Errorf("%s 不得讀到 %q: %q", path, leaked, res[id])
			}
		}
	}
	if !strings.Contains(res["4"], "小明走進森林") {
		t.Errorf("一般路徑應照常可讀: %q", res["4"])
	}
	for id := range map[string]int{"5": 0, "6": 0} {
		for _, leaked := range []string{"機密設定", "機密外流", "link", "outside", "leak.md"} {
			if strings.Contains(res[id], leaked) {
				t.Errorf("search/list 不得出現連結或其內容(%q): %q", leaked, res[id])
			}
		}
	}
	if !strings.Contains(res["5"], "沒有找到符合的內容") {
		t.Errorf("被排除與作品外的內容應搜不到: %q", res["5"])
	}
	if !strings.Contains(res["6"], "manuscript/第一章.md") {
		t.Errorf("list_files 應照常列出一般檔案: %q", res["6"])
	}
}

// 意圖(#132):search_project 會讀每個檔案找關鍵字;經由 .md 連結檔讀到的內容,
// 不得回給模型(連結檔指向作品外檔案時尤其等於把作品外內容送進對話)。
func TestBotSearchDoesNotLeakThroughFileLink(t *testing.T) {
	a, s, dir := setup(t)
	outside := t.TempDir()
	secret := filepath.Join(outside, "secret.md")
	if err := os.WriteFile(secret, []byte("機密外流:作品外的內容。\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, filepath.Join(dir, "manuscript", "leak.md")); err != nil {
		t.Skipf("此環境無法建立檔案符號連結: %v", err)
	}
	s.replies = []llm.Message{
		{Role: "assistant", ToolCalls: []llm.ToolCall{
			{ID: "1", Name: "search_project", Arguments: `{"query":"機密外流"}`},
			{ID: "2", Name: "list_files", Arguments: "{}"},
			{ID: "3", Name: "read_document", Arguments: `{"path":"manuscript/leak.md"}`},
		}},
		{Role: "assistant", Content: "好"},
	}
	if _, err := a.Ask(context.Background(), AskParams{Question: "找找機密"}, func(Event) {}); err != nil {
		t.Fatal(err)
	}
	res := linkResults(t, s.reqs, 1)
	for _, id := range []string{"1", "2", "3"} {
		for _, leaked := range []string{"機密外流", "leak.md", "secret.md"} {
			if strings.Contains(res[id], leaked) {
				t.Errorf("工具結果 %s 不得含連結或其內容(%q): %q", id, leaked, res[id])
			}
		}
	}
}
