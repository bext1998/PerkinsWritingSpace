// Package bible 把 canon/ 的設定檔當成「實體」(角色、地點…),並以純文字比對建立登場索引與
// 寫法不一致檢查(SPEC §12.2)。本套件完全不呼叫模型,結果只取決於檔案內容(B3),也不寫入任何設定或稿件。
package bible

import (
	"bytes"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"gopkg.in/yaml.v3"

	"perkins/internal/project"
)

// Types 是介面提供的實體類型;檔案裡寫其他值也接受,歸入原值。
var Types = []string{"角色", "地點", "勢力", "道具", "名詞", "其他"}

const TypeOther = "其他"

type Entity struct {
	Path    string   `json:"path"`
	Type    string   `json:"type"`
	Name    string   `json:"name"`
	Aliases []string `json:"aliases"`
}

// Terms 回傳用於比對的名稱(名稱 + 別名),去除空白與過短(1 字)的詞以免大量誤判。
func (e Entity) Terms() []string {
	seen := map[string]bool{}
	var out []string
	for _, t := range append([]string{e.Name}, e.Aliases...) {
		t = strings.TrimSpace(t)
		if utf8.RuneCountInString(t) < 2 || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

// SplitFrontmatter 回傳 frontmatter 的 YAML 與本文。沒有 frontmatter 時 yamlPart 為空。
func SplitFrontmatter(content string) (yamlPart, body string) {
	c := strings.TrimPrefix(content, string(rune(0xFEFF)))
	if !strings.HasPrefix(c, "---\n") && !strings.HasPrefix(c, "---\r\n") {
		return "", content
	}
	rest := c[strings.Index(c, "\n")+1:]
	for i := 0; i < len(rest); {
		j := strings.IndexByte(rest[i:], '\n')
		line := rest[i:]
		if j >= 0 {
			line = rest[i : i+j]
		}
		if strings.TrimRight(line, "\r") == "---" {
			if j < 0 {
				return rest[:i], ""
			}
			return rest[:i], rest[i+j+1:]
		}
		if j < 0 {
			break
		}
		i += j + 1
	}
	return "", content // 沒有結尾的 ---:視為沒有 frontmatter,不猜
}

// Parse 讀出實體欄位。沒有 frontmatter 或格式錯誤時:type=其他、name=檔名(SPEC §12.2)。
func Parse(path, content string) Entity {
	e := Entity{Path: path, Type: TypeOther, Name: baseName(path), Aliases: []string{}}
	y, _ := SplitFrontmatter(content)
	if y == "" {
		return e
	}
	var fm struct {
		Type    string      `yaml:"type"`
		Name    string      `yaml:"name"`
		Aliases interface{} `yaml:"aliases"`
	}
	if yaml.Unmarshal([]byte(y), &fm) != nil {
		return e
	}
	if t := strings.TrimSpace(fm.Type); t != "" {
		e.Type = t
	}
	if n := strings.TrimSpace(fm.Name); n != "" {
		e.Name = n
	}
	switch a := fm.Aliases.(type) {
	case []interface{}:
		for _, v := range a {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				e.Aliases = append(e.Aliases, strings.TrimSpace(s))
			}
		}
	case string: // 容許 aliases: 艾莉、小艾(逗號或頓號分隔)
		for _, s := range strings.FieldsFunc(a, func(r rune) bool { return r == ',' || r == '、' || r == '，' }) {
			if s = strings.TrimSpace(s); s != "" {
				e.Aliases = append(e.Aliases, s)
			}
		}
	}
	return e
}

// SetHeader 更新 type/name/aliases,保留 frontmatter 其他欄位與本文不變。
func SetHeader(content, typ, name string, aliases []string) (string, error) {
	y, body := SplitFrontmatter(content)
	var doc yaml.Node
	if y != "" {
		if err := yaml.Unmarshal([]byte(y), &doc); err != nil {
			return "", err
		}
	}
	if len(doc.Content) == 0 {
		doc = yaml.Node{Kind: yaml.DocumentNode, Content: []*yaml.Node{{Kind: yaml.MappingNode}}}
	}
	m := doc.Content[0]
	if m.Kind != yaml.MappingNode {
		m.Kind, m.Content, m.Tag, m.Value = yaml.MappingNode, nil, "", ""
	}
	set := func(key string, val *yaml.Node) {
		for i := 0; i+1 < len(m.Content); i += 2 {
			if m.Content[i].Value == key {
				m.Content[i+1] = val
				return
			}
		}
		m.Content = append(m.Content, &yaml.Node{Kind: yaml.ScalarNode, Value: key}, val)
	}
	str := func(s string) *yaml.Node { return &yaml.Node{Kind: yaml.ScalarNode, Value: s} }
	seq := &yaml.Node{Kind: yaml.SequenceNode, Style: yaml.FlowStyle}
	for _, a := range aliases {
		if a = strings.TrimSpace(a); a != "" {
			seq.Content = append(seq.Content, str(a))
		}
	}
	set("type", str(strings.TrimSpace(typ)))
	set("name", str(strings.TrimSpace(name)))
	set("aliases", seq)
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(&doc); err != nil {
		return "", err
	}
	if y == "" && !strings.HasPrefix(body, "\n") {
		body = "\n" + body
	}
	return "---\n" + buf.String() + "---\n" + body, nil
}

// Template 產生新實體檔的初始內容。
func Template(typ, name string) string {
	head, _ := SetHeader("", typ, name, nil)
	var fields []string
	switch typ {
	case "角色":
		fields = []string{"外貌", "個性", "第一人稱／口癖", "對他人的稱呼", "背景"}
	case "地點":
		fields = []string{"位置", "特徵", "相關人物"}
	case "勢力":
		fields = []string{"目的", "成員", "與其他勢力的關係"}
	case "道具":
		fields = []string{"外觀", "能力／用途", "持有者"}
	case "名詞":
		fields = []string{"定義", "使用情境"}
	}
	var b strings.Builder
	b.WriteString("\n# " + strings.TrimSpace(name) + "\n\n")
	for _, f := range fields {
		b.WriteString("- " + f + ":\n")
	}
	return head + b.String()
}

func baseName(p string) string {
	p = p[strings.LastIndex(p, "/")+1:]
	return strings.TrimSuffix(p, ".md")
}

// ---- 讀取整個專案 ----

// Load 解析 canon/ 下所有實體。
func Load(p *project.Project) ([]Entity, error) {
	t, err := p.Tree()
	if err != nil {
		return nil, err
	}
	out := []Entity{}
	for _, e := range t.Canon {
		c, err := p.ReadFile(e.Path)
		if err != nil {
			continue
		}
		out = append(out, Parse(e.Path, c))
	}
	return out, nil
}

// ---- 登場索引 ----

type Count struct {
	Path  string `json:"path"` // 另一端的路徑(章節或實體)
	Count int    `json:"count"`
}

type Index struct {
	Entities    []Entity           `json:"entities"`
	Appearances map[string][]Count `json:"appearances"` // 實體 → 各章次數(依章節順序)
	ByChapter   map[string][]Count `json:"byChapter"`   // 章節 → 各實體次數(依次數多到少)
}

type matcher struct {
	terms []string // 依長度由長到短,讓「艾莉絲」優先於「艾莉」
	owner map[string]string
}

func newMatcher(ents []Entity) *matcher {
	m := &matcher{owner: map[string]string{}}
	for _, e := range ents {
		for _, t := range e.Terms() {
			if _, dup := m.owner[t]; dup {
				continue // 兩個實體同名:歸第一個,避免重複計數
			}
			m.owner[t] = e.Path
			m.terms = append(m.terms, t)
		}
	}
	sort.SliceStable(m.terms, func(i, j int) bool {
		return utf8.RuneCountInString(m.terms[i]) > utf8.RuneCountInString(m.terms[j])
	})
	return m
}

// count 回傳文字中各實體出現次數;較長的詞先佔位,短詞不重複計算同一段文字。
func (m *matcher) count(text string) map[string]int {
	out := map[string]int{}
	used := make([]bool, len(text))
	for _, t := range m.terms {
		for i := 0; ; {
			j := strings.Index(text[i:], t)
			if j < 0 {
				break
			}
			s, e := i+j, i+j+len(t)
			free := true
			for k := s; k < e; k++ {
				if used[k] {
					free = false
					break
				}
			}
			if free {
				for k := s; k < e; k++ {
					used[k] = true
				}
				out[m.owner[t]]++
			}
			i = e
		}
	}
	return out
}

// Mentions 回傳 text 中提到的實體路徑,依次數多到少。用於「建議附加」。
func Mentions(ents []Entity, text string) []string {
	c := newMatcher(ents).count(text)
	out := []string{} // 沒有命中時要序列化成 [] 而不是 null,前端直接對結果 .filter
	for p := range c {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool {
		if c[out[i]] != c[out[j]] {
			return c[out[i]] > c[out[j]]
		}
		return out[i] < out[j]
	})
	return out
}

// BuildIndex 掃描所有章節建立登場索引。
func BuildIndex(p *project.Project) (*Index, error) {
	ents, err := Load(p)
	if err != nil {
		return nil, err
	}
	chapters, err := p.Chapters()
	if err != nil {
		return nil, err
	}
	m := newMatcher(ents)
	idx := &Index{Entities: ents, Appearances: map[string][]Count{}, ByChapter: map[string][]Count{}}
	for _, ch := range chapters {
		text, err := p.ReadFile(ch)
		if err != nil {
			continue
		}
		counts := m.count(text)
		var list []Count
		for ent, n := range counts {
			idx.Appearances[ent] = append(idx.Appearances[ent], Count{Path: ch, Count: n})
			list = append(list, Count{Path: ent, Count: n})
		}
		sort.Slice(list, func(i, j int) bool {
			if list[i].Count != list[j].Count {
				return list[i].Count > list[j].Count
			}
			return list[i].Path < list[j].Path
		})
		if len(list) > 0 {
			idx.ByChapter[ch] = list
		}
	}
	return idx, nil
}

// ---- 寫法不一致檢查 ----

type Variant struct {
	Entity  string `json:"entity"`  // 實體路徑
	Known   string `json:"known"`   // 已知寫法
	Variant string `json:"variant"` // 疑似錯寫
	Count   int    `json:"count"`
	Chapter string `json:"chapter"` // 第一次出現的章節
	Snippet string `json:"snippet"` // 第一次出現的上下文
}

// FindVariants 找出與已知名稱(3 字以上)只差一個漢字、且本身不含任何已知名稱的寫法。
// 只回報,不修改;ignored 為作者標記「不是錯字」的寫法。
func FindVariants(ents []Entity, chapters []string, read func(string) (string, error), ignored map[string]bool) []Variant {
	m := newMatcher(ents)
	known := map[string]bool{}
	for _, t := range m.terms {
		known[t] = true
	}
	type key struct{ ent, known, variant string }
	found := map[key]*Variant{}
	var order []key
	for _, ch := range chapters {
		text, err := read(ch)
		if err != nil {
			continue
		}
		rs := []rune(text)
		for _, term := range m.terms {
			tr := []rune(term)
			n := len(tr)
			if n < 3 {
				continue
			}
			for i := 0; i+n <= len(rs); i++ {
				diff, pos := 0, -1
				for k := 0; k < n && diff < 2; k++ {
					if rs[i+k] != tr[k] {
						diff++
						pos = k
					}
				}
				if diff != 1 || !unicode.Is(unicode.Han, rs[i+pos]) {
					continue
				}
				w := string(rs[i : i+n])
				if known[w] || ignored[w] || containsKnown(w, m.terms) {
					continue
				}
				k := key{m.owner[term], term, w}
				if v, ok := found[k]; ok {
					v.Count++
					continue
				}
				lo, hi := max(0, i-12), min(len(rs), i+n+12)
				found[k] = &Variant{Entity: k.ent, Known: term, Variant: w, Count: 1, Chapter: ch,
					Snippet: strings.ReplaceAll(string(rs[lo:hi]), "\n", " ")}
				order = append(order, k)
			}
		}
	}
	out := make([]Variant, 0, len(order))
	for _, k := range order {
		out = append(out, *found[k])
	}
	return out
}

func containsKnown(w string, terms []string) bool {
	for _, t := range terms {
		if strings.Contains(w, t) {
			return true
		}
	}
	return false
}
