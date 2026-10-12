package agent

import (
	"strings"
	"testing"
)

// 意圖(#104 第 3 項,取代作者手動點選的「建議附加」):選取段落提到的設定,由程式只把名稱與路徑附給 Bot,
// 不送內容、不要作者挑;Bot 讀不到的(作者排除的資料夾)連名稱都不列(B2),已附加的不重列,送出預覽看得到。
func TestMentionedEntitiesSentAsNamesOnly(t *testing.T) {
	a, _, _ := setup(t)
	p := a.Proj
	for path, body := range map[string]string{
		"canon/艾莉絲.md": "---\ntype: 角色\nname: 艾莉絲\n---\n十七歲的劍士。\n",
		"canon/雷恩.md":  "---\ntype: 角色\nname: 雷恩\n---\n沉默的弓手。\n",
		"notes/影子會.md": "---\ntype: 勢力\nname: 影子會\n---\n未公開的黑幕。\n",
	} {
		if err := p.WriteFile(path, body); err != nil {
			t.Fatal(err)
		}
	}
	a.Readable = []string{"canon"} // 作者排除了 notes/
	pv, err := a.Preview(AskParams{Question: "q", Selection: "艾莉絲和雷恩走進影子會的據點。", Attachments: []string{"canon/雷恩.md"}})
	if err != nil {
		t.Fatal(err)
	}
	user := pv.Messages[len(pv.Messages)-1].Content
	if !strings.Contains(user, "【本段提到的設定】") || !strings.Contains(user, "艾莉絲(canon/艾莉絲.md)") {
		t.Fatalf("應附上本段提到的設定名稱與路徑:\n%s", user)
	}
	if strings.Contains(user, "十七歲") {
		t.Fatalf("只送名稱,不得送出設定內容:\n%s", user)
	}
	if strings.Contains(user, "影子會(") || strings.Contains(user, "notes/影子會.md") {
		t.Fatalf("作者排除的資料夾中的設定不得列出名稱:\n%s", user)
	}
	if strings.Count(user, "雷恩(canon/雷恩.md)") != 0 {
		t.Fatalf("已附加的設定不重列:\n%s", user)
	}
	if len(pv.Mentioned) != 1 || pv.Mentioned[0] != "艾莉絲(canon/艾莉絲.md)" {
		t.Fatalf("送出預覽應列出本次附上的名稱: %v", pv.Mentioned)
	}
}
