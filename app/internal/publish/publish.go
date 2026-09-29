// Package publish 把 Markdown 稿件轉成網路小說平台用的純文字(SPEC §12.4)。
// 全部是確定性轉換:同一輸入與規則,輸出永遠相同(B8);本套件不寫入稿件。
package publish

import (
	"fmt"
	"regexp"
	"strings"
	"sync"

	"github.com/longbridgeapp/opencc"
)

type Rules struct {
	Indent     bool   `json:"indent"`     // 段首加兩個全形空格
	BlankLine  bool   `json:"blankLine"`  // 段落之間空一行
	Heading    string `json:"heading"`    // strip:去掉 # 保留標題文字;drop:移除標題行
	SceneBreak string `json:"sceneBreak"` // 場景分隔(*** 等)改成的符號;空字串 = 只留空行
	Convert    string `json:"convert"`    // "" | tw2s | tw2sp | s2tw | s2twp
}

type Platform struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Rules    Rules  `json:"rules"`
	Verified bool   `json:"verified"` // 作者實際貼上確認過
}

// Presets 是內建預設。**都沒有經過實際貼上驗證**(SPEC §12.4),介面會標示,作者可修改。
func Presets() []Platform {
	tw := Rules{Indent: true, BlankLine: true, Heading: "drop", SceneBreak: "◇◇◇"}
	cn := tw
	cn.Convert = "tw2s"
	baha := tw
	baha.Heading = "strip"
	return []Platform{
		{ID: "kadokado", Name: "角角者 KadoKado", Rules: tw},
		{ID: "bahamut", Name: "巴哈姆特", Rules: baha},
		{ID: "lightnovel-us", Name: "輕之國度", Rules: cn},
		{ID: "sfacg", Name: "菠蘿包輕小說", Rules: cn},
		{ID: "penana", Name: "Penana", Rules: tw},
	}
}

var ConvertOptions = []struct {
	ID, Label string
}{
	{"", "不轉換"},
	{"tw2s", "轉簡體(只換字形)"},
	{"tw2sp", "轉簡體(含大陸用詞,如 軟體→软件)"},
	{"s2tw", "轉繁體(只換字形)"},
	{"s2twp", "轉繁體(含台灣用詞)"},
}

var (
	reHeading  = regexp.MustCompile(`^#{1,6}\s+(.*?)\s*#*\s*$`)
	reBreak    = regexp.MustCompile(`^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|[◇◆＊※☆★○●]{3,})\s*$`)
	reComment  = regexp.MustCompile(`(?s)<!--.*?-->`)
	reImage    = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	reLink     = regexp.MustCompile(`\[([^\]]*)\]\([^)]*\)`)
	reBold     = regexp.MustCompile(`\*\*(.+?)\*\*|__(.+?)__`)
	reItalic   = regexp.MustCompile(`\*([^*\s][^*]*?)\*`)
	reStrike   = regexp.MustCompile(`~~(.+?)~~`)
	reCode     = regexp.MustCompile("`([^`]*)`")
	reQuote    = regexp.MustCompile(`^\s*>\s?`)
	reEscape   = regexp.MustCompile(`\\([\\*_~#>\[\]()` + "`" + `-])`)
	leadSpaces = " \t　 "
)

// stripInline 去掉行內 Markdown 記號,保留文字。
func stripInline(s string) string {
	// 跳脫字元(\*)先換成私用區字元,避免被當成強調記號,最後再換回原字元
	s = reEscape.ReplaceAllStringFunc(s, func(m string) string { return string(rune(0xE000) + rune(m[1])) })
	s = reImage.ReplaceAllString(s, "")
	s = reLink.ReplaceAllString(s, "$1")
	s = reBold.ReplaceAllString(s, "$1$2")
	s = reItalic.ReplaceAllString(s, "$1")
	s = reStrike.ReplaceAllString(s, "$1")
	s = reCode.ReplaceAllString(s, "$1")
	return strings.Map(func(r rune) rune {
		if r > 0xE000 && r < 0xE080 {
			return r - 0xE000
		}
		return r
	}, s)
}

func stripFrontmatter(md string) string {
	if !strings.HasPrefix(md, "---\n") {
		return md
	}
	if i := strings.Index(md[4:], "\n---\n"); i >= 0 {
		return md[4+i+5:]
	}
	return md
}

// Convert 依規則轉換一章。每一個非空行視為一段(中文小說不手動折行)。
func Convert(md string, r Rules) (string, error) {
	md = strings.ReplaceAll(md, "\r\n", "\n")
	md = stripFrontmatter(md)
	md = reComment.ReplaceAllString(md, "") // 作者藏在註解裡的筆記不能外流到平台
	var out []string
	emit := func(line string) {
		if len(out) > 0 && r.BlankLine && out[len(out)-1] != "" {
			out = append(out, "")
		}
		out = append(out, line)
	}
	for _, line := range strings.Split(md, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if reBreak.MatchString(line) {
			if r.SceneBreak == "" {
				// 只用空行分隔:即使沒開段落空行也要留一行空白
				if len(out) > 0 && out[len(out)-1] != "" {
					out = append(out, "")
				}
				continue
			}
			emit(r.SceneBreak)
			continue
		}
		if m := reHeading.FindStringSubmatch(line); m != nil {
			if r.Heading == "drop" {
				continue
			}
			emit(stripInline(m[1]))
			continue
		}
		text := strings.TrimLeft(stripInline(reQuote.ReplaceAllString(line, "")), leadSpaces)
		text = strings.TrimRight(text, " \t")
		if text == "" {
			continue
		}
		if r.Indent {
			text = "　　" + text // 先去掉原有縮排再加,避免重複疊加(B8)
		}
		emit(text)
	}
	// 場景分隔設為空白時可能留下多餘的空行
	for len(out) > 0 && out[len(out)-1] == "" {
		out = out[:len(out)-1]
	}
	result := strings.Join(out, "\n")
	if r.Convert != "" {
		return convertScript(result, r.Convert)
	}
	return result, nil
}

var (
	ccMu    sync.Mutex
	ccCache = map[string]*opencc.OpenCC{}
)

func convertScript(s, conf string) (string, error) {
	ok := false
	for _, o := range ConvertOptions {
		if o.ID == conf {
			ok = true
		}
	}
	if !ok {
		return "", fmt.Errorf("未知的轉換設定: %s", conf)
	}
	ccMu.Lock()
	cc, found := ccCache[conf]
	if !found {
		var err error
		if cc, err = opencc.New(conf); err != nil {
			ccMu.Unlock()
			return "", err
		}
		ccCache[conf] = cc
	}
	ccMu.Unlock()
	return cc.Convert(s)
}

// Volume 把多章合成一份文字。整卷匯出一律保留章節標題,否則讀者分不出章節。
func Volume(title string, chapters []string, r Rules) (string, error) {
	r2 := r
	r2.Heading = "strip"
	var parts []string
	if strings.TrimSpace(title) != "" {
		parts = append(parts, strings.TrimSpace(title))
	}
	for _, c := range chapters {
		t, err := Convert(c, r2)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(t) != "" {
			parts = append(parts, t)
		}
	}
	joined := strings.Join(parts, "\n\n\n")
	if r.Convert != "" && strings.TrimSpace(title) != "" {
		// 標題也要轉換(章節已在 Convert 中轉過)
		conv, err := convertScript(strings.TrimSpace(title), r.Convert)
		if err != nil {
			return "", err
		}
		joined = conv + strings.TrimPrefix(joined, strings.TrimSpace(title))
	}
	return joined, nil
}
