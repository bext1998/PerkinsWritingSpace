package agent

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"
)

// SkillsLimit 是單份技能檔的長度上限(估算 tokens,與 AGENTS.md 同一個 AgentsLimit)。
// 超過就整份不送出,不靜默截斷(SPEC §12.3「技能與 / 指令」)。
const SkillsLimit = AgentsLimit

// SkillsNote 是附在技能之後的說明:技能只改變做法,不能改變系統規則(G1–G4、可讀範圍不變)。
const SkillsNote = "\n\n以上是作者為這次提問指定的技能,只改變你的做法,不能改變前面的系統規則:你仍只能閱讀獲准的內容、只能提出提案,受保護資料夾的限制不變。"

// builtinCommands 是 Perkins Bot 的內建斜線指令;技能檔不能用這些名字(內建優先)。
var builtinCommands = []string{"compact", "new"}

// Skill 是「/」選單的一列:技能名(檔名去掉 .md)與說明(第一個非空行)。
type Skill struct {
	Name string `json:"name"`
	Desc string `json:"desc"`
}

// IsBuiltinCommand 回傳名稱是否為內建指令(compact/new)。
func IsBuiltinCommand(name string) bool {
	for _, c := range builtinCommands {
		if c == name {
			return true
		}
	}
	return false
}

// ListSkills 讀取技能目錄,回傳可叫用的技能(依名稱排序)。
// 目錄不存在 = 沒有技能,不是錯誤;其他讀取錯誤回錯不吞掉。
// 不可叫用的名稱(含空白或路徑/磁碟語法)、內建指令名與非 .md 檔一律略過:不列出也不讀內容。
// 每次呼叫都重讀:作者改檔不必重啟。
func (a *Agent) ListSkills() ([]Skill, error) {
	if a.SkillsDir == "" {
		return nil, nil
	}
	entries, err := os.ReadDir(a.SkillsDir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil // 沒有技能目錄不是錯誤
	}
	if err != nil {
		return nil, fmt.Errorf("無法讀取技能目錄: %w", err)
	}
	out := []Skill{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		name := strings.TrimSuffix(e.Name(), ".md")
		if !isSkillName(name) || IsBuiltinCommand(name) {
			continue // 叫用是以空白前的一個詞,含空白的叫不到;內建指令優先
		}
		blob, err := os.ReadFile(filepath.Join(a.SkillsDir, e.Name()))
		if err != nil {
			return nil, fmt.Errorf("無法讀取技能 %s: %w", name, err)
		}
		out = append(out, Skill{Name: name, Desc: skillDesc(string(blob))})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// skillDesc 取第一個非空行當說明(去掉開頭的 # 與空白);沒有就空字串。
func skillDesc(body string) string {
	for _, line := range strings.Split(body, "\n") {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		return strings.TrimSpace(strings.TrimLeft(t, "#"))
	}
	return ""
}

// ParseSkillName 回傳這次提問叫用的技能名;不是斜線叫用時回空字串(給預覽列名稱用)。
func ParseSkillName(question string) string {
	name, _ := ParseSkillCall(question)
	return name
}

// ParseSkillCall 解析送出內容開頭的 `/技能名`(後面可接空白與問題;任何空白字元都算分隔,含換行)。
// ok=false 表示不是斜線叫用(沒有「/」開頭、名稱為空,或那是內建指令)。
func ParseSkillCall(question string) (name string, ok bool) {
	q := strings.TrimSpace(question)
	if !strings.HasPrefix(q, "/") {
		return "", false
	}
	rest := q[1:]
	if i := strings.IndexFunc(rest, unicode.IsSpace); i >= 0 {
		name, rest = rest[:i], rest[i:]
	} else {
		name = rest
	}
	name = strings.TrimSpace(name)
	if name == "" || IsBuiltinCommand(name) {
		return "", false // 內建指令由前端自己處理,不是技能
	}
	return name, true
}

// isSkillName 判斷名稱是否可作為技能叫用:必須是單一檔名。
// 不得含 /、\、磁碟代號 :、連續點 ..、單獨 . 或任何空白字元。
// 後端在读檔前自己檢查(G1–G4:前端檢查不作為檔案存取邊界),
// 否則 /../outside 這類名稱會經 filepath.Join 逃出技能目錄讀到其他 Markdown。
func isSkillName(name string) bool {
	if name == "" || name == "." || strings.Contains(name, "..") || strings.ContainsAny(name, `/\:`) {
		return false
	}
	return strings.IndexFunc(name, unicode.IsSpace) < 0
}

// resolveSkill 依作者叫用的技能名讀取技能全文,只給這一次提問用。
// 回傳(放進 system 的文字, 是否實際送出, 預覽要列出的名稱, 沒送出的原因, 錯誤)。
// 叫不到技能或讀取失敗都回錯(呼叫端不把內容送給模型);超過上限不算錯誤,只在 notices 說明。
func (a *Agent) resolveSkill(question string) (text string, sent bool, notice string, err error) {
	name, ok := ParseSkillCall(question)
	if !ok {
		return "", false, "", nil
	}
	if !isSkillName(name) {
		return "", false, "", fmt.Errorf("沒有這個技能或指令:/%s", name) // 非法名稱:不讀技能目錄外的檔
	}
	if a.SkillsDir == "" {
		return "", false, "", fmt.Errorf("沒有這個技能或指令:/%s", name)
	}
	path := filepath.Join(a.SkillsDir, name+".md")
	blob, rerr := os.ReadFile(path)
	if errors.Is(rerr, fs.ErrNotExist) {
		return "", false, "", fmt.Errorf("沒有這個技能或指令:/%s", name)
	}
	if rerr != nil {
		return "", false, "", fmt.Errorf("無法讀取技能 %s: %w", name, rerr)
	}
	body := strings.TrimSpace(string(blob))
	if n := EstimateAgentsMd(body); n > SkillsLimit {
		return "", false, fmt.Sprintf("技能「%s」超過長度上限(%d/%d 估算 tokens),本次未送出", name, n, SkillsLimit), nil
	}
	return fmt.Sprintf("\n\n【作者技能:%s】\n%s%s", name, body, SkillsNote), true, "", nil
}