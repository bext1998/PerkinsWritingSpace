// Package health 檢查作品資料的一致性(SPEC §0 第 4 條:能由程式確定的事不交給模型)。
// 只讀作品檔案、只回報不修改,也不呼叫模型;每一項都由作者自己決定怎麼處理。
// 第一批檢查:frontmatter 無法解析、摘要對應的章節已不存在、摘要可能過期、連結指向不存在的檔案、
// perkins.json 卷中列出但不存在的章節(名稱/別名重複等依賴設定集結構的檢查等 #31)。
package health

import (
	"fmt"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"perkins/internal/bible"
	"perkins/internal/project"
	"perkins/internal/summary"
)

// 問題類型。前端依這個值分組;字串是介面與測試的識別,改了要一起改。
const (
	CheckFrontmatter    = "frontmatter"     // frontmatter 無法解析
	CheckOrphanSummary  = "orphan-summary"  // 摘要對應的章節已不存在
	CheckStaleSummary   = "stale-summary"   // 摘要可能過期
	CheckBrokenLink     = "broken-link"     // 連結指向不存在的檔案
	CheckMissingChapter = "missing-chapter" // 卷中列出但不存在的章節
)

// checkOrder 是回報與介面上的固定分組順序。
var checkOrder = []string{CheckFrontmatter, CheckOrphanSummary, CheckStaleSummary, CheckBrokenLink, CheckMissingChapter}

// Issue 是一個問題:Path 是問題所在的檔案(介面點擊開啟它;missing-chapter 是那個不存在的章節路徑)。
type Issue struct {
	Check   string `json:"check"`
	Path    string `json:"path"`
	Message string `json:"message"`
}

type Report struct {
	Issues    []Issue `json:"issues"`
	CheckedAt string  `json:"checkedAt"` // RFC3339;介面顯示檢查時間
}

// Check 讀過整個作品後回報問題(依類型分組順序、同類型依路徑排序)。
// 任何一個檔案讀不到(被其他程式鎖住、沒有權限)就整體失敗並帶出路徑:沒讀到的檔案不能冒充「沒有問題」。
func Check(p *project.Project) (Report, error) {
	files, err := p.AllFiles()
	if err != nil {
		return Report{}, err
	}
	rep := Report{Issues: []Issue{}, CheckedAt: time.Now().Format(time.RFC3339)}
	whole := make([]string, 0, len(files)) // 全書檔案的內容,連結檢查用(連結可能指向別的資料夾)
	texts := map[string]string{}
	for _, rel := range files {
		text, err := p.ReadFile(rel)
		if err != nil {
			return Report{}, fmt.Errorf("無法讀取 %s,檢查未完成:%w", rel, err)
		}
		texts[rel] = text
		whole = append(whole, rel)
		rep.Issues = append(rep.Issues, frontmatterIssues(rel, text)...)
	}
	rep.Issues = append(rep.Issues, linkIssues(p, whole, texts)...)
	rep.Issues = append(rep.Issues, summaryIssues(p, whole, texts)...)
	rep.Issues = append(rep.Issues, missingChapterIssues(p)...)
	sortIssues(rep.Issues)
	return rep, nil
}

func sortIssues(issues []Issue) {
	rank := map[string]int{}
	for i, c := range checkOrder {
		rank[c] = i
	}
	sort.SliceStable(issues, func(i, j int) bool {
		if rank[issues[i].Check] != rank[issues[j].Check] {
			return rank[issues[i].Check] < rank[issues[j].Check]
		}
		return issues[i].Path < issues[j].Path
	})
}

// ---- frontmatter ----

// frontmatterIssues 回報「有 frontmatter 區塊但解析不了」的檔案。
// bible.Parse 解析失敗時會靜默退回 type=其他、name=檔名(SPEC §12.2),這裡把它顯示出來,
// 但不改變 Parse 的行為。沒有 frontmatter、或沒有結尾 ---(SplitFrontmatter 視為沒有)不算。
func frontmatterIssues(rel, text string) []Issue {
	y, _ := bible.SplitFrontmatter(text)
	if y == "" {
		return nil
	}
	var fm map[string]any
	if err := yaml.Unmarshal([]byte(y), &fm); err != nil {
		return []Issue{{Check: CheckFrontmatter, Path: rel, Message: "frontmatter 無法解析:" + strings.TrimSpace(err.Error())}}
	}
	return nil
}

// ---- 摘要 ----

// summaryIssues 回報孤兒摘要(source 指向不存在的章節)與可能過期的摘要。
func summaryIssues(p *project.Project, files []string, texts map[string]string) []Issue {
	var out []Issue
	for _, rel := range files {
		if project.KindOf(rel) != project.SummariesDir {
			continue
		}
		src := summarySource(texts[rel])
		if src == "" || p.Exists(src) {
			continue
		}
		out = append(out, Issue{Check: CheckOrphanSummary, Path: rel, Message: "摘要對應的章節已不存在:" + src})
	}
	// 摘要可能過期:沿用 summary 套件的 Stale(章節在摘要儲存後被改過、沒有 sourceHash),不另寫一套雜湊規則。
	chapters, err := p.Chapters()
	if err != nil {
		return out
	}
	for _, c := range chapters {
		s, err := summary.Load(p, c)
		if err != nil || !s.Exists || !s.Stale {
			continue
		}
		out = append(out, Issue{Check: CheckStaleSummary, Path: s.Path, Message: "摘要可能過期:章節在摘要儲存後改過,請重新產生(" + c + ")"})
	}
	return out
}

// summarySource 讀摘要 frontmatter 的 source;解析不了時回空字串(該檔的 frontmatter 問題已由 frontmatterIssues 回報)。
func summarySource(text string) string {
	y, _ := bible.SplitFrontmatter(text)
	if y == "" {
		return ""
	}
	var fm struct {
		Source string `yaml:"source"`
	}
	if yaml.Unmarshal([]byte(y), &fm) != nil {
		return ""
	}
	return filepath.ToSlash(strings.TrimSpace(fm.Source))
}

// ---- 連結 ----

// linkOpenRe 找 Markdown 行內連結與圖片的開頭 [文字](、![說明](;目標由 linkDest 讀出
// (括號可成對出現在目標內、可用 \( \) 跳脫)。參考式連結([文字][id])不在範圍內。
var linkOpenRe = regexp.MustCompile(`!?\[[^\]]*\]\(`)

// schemeRe 判斷帶 scheme 的目標(http:、https:、mailto:、data:…):不是作品內的檔案。
var schemeRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.\-]*:`)

// linkIssues 回報指向作品內不存在檔案的連結。目標相對於該檔所在資料夾,需 URL 解碼;
// 外部連結、mailto、純錨點、專案外的路徑(#、?、.. 逃出作品根)不檢查。
// 程式碼區塊(```)內的不算,與側欄場景清單同一套判準(project.ParseScenes)。
func linkIssues(p *project.Project, files []string, texts map[string]string) []Issue {
	var out []Issue
	for _, rel := range files {
		for _, target := range linkTargets(texts[rel]) {
			dest, ok := resolveLink(rel, target)
			if !ok || fileExists(p.Root, dest) {
				continue
			}
			out = append(out, Issue{Check: CheckBrokenLink, Path: rel, Message: "連結指向不存在的檔案:" + dest})
		}
	}
	return out
}

func linkTargets(text string) []string {
	var out []string
	fence := false
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			fence = !fence
			continue
		}
		if fence {
			continue
		}
		line = stripCodeSpans(line)
		for _, m := range linkOpenRe.FindAllStringIndex(line, -1) {
			if t := linkDest(line[m[1]:]); t != "" {
				out = append(out, t)
			}
		}
	}
	return out
}

// stripCodeSpans 拿掉行內程式碼(`…`、“…“):裡面的 [x](y) 只是文字範例,不是連結。
// 開頭的反引號串要有等長的反引號串收尾才算;沒有收尾就照原樣保留。
func stripCodeSpans(line string) string {
	run := func(i int) int {
		j := i
		for j < len(line) && line[j] == '`' {
			j++
		}
		return j - i
	}
	var b strings.Builder
	for i := 0; i < len(line); {
		if line[i] != '`' {
			b.WriteByte(line[i])
			i++
			continue
		}
		n, end := run(i), -1
		for j := i + n; j < len(line); {
			if line[j] != '`' {
				j++
				continue
			}
			m := run(j)
			if m == n {
				end = j + m
				break
			}
			j += m
		}
		if end < 0 {
			b.WriteString(line[i : i+n])
			i += n
			continue
		}
		i = end
	}
	return b.String()
}

// linkDest 讀出連結目標(s 從「](」之後開始):<路徑 有空白> 取尖括號內;否則讀到空白(後面是標題)
// 或沒有成對的「)」為止,目標內成對的括號保留,\( \) 取括號字面。其餘的 \ 不當跳脫:
// 作者在 Windows 上寫的 ..\章節.md 是路徑分隔(由 resolveLink 處理),照 CommonMark 把 \. 當跳脫會把路徑讀壞。
// 沒有收尾的「)」就不是連結,回空字串。
func linkDest(s string) string {
	s = strings.TrimLeft(s, " \t")
	if strings.HasPrefix(s, "<") {
		if i := strings.IndexByte(s, '>'); i > 0 {
			return strings.TrimSpace(s[1:i])
		}
		return ""
	}
	var b strings.Builder
	depth := 0
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '\\' && i+1 < len(s) && (s[i+1] == '(' || s[i+1] == ')'):
			i++
			b.WriteByte(s[i])
		case c == ' ' || c == '\t':
			return b.String()
		case c == '(':
			depth++
			b.WriteByte(c)
		case c == ')':
			if depth == 0 {
				return b.String()
			}
			depth--
			b.WriteByte(c)
		default:
			b.WriteByte(c)
		}
	}
	return ""
}

// resolveLink 把連結目標換成作品內的相對路徑;不是作品內的檔案時回 ok=false。
// 開頭的 / 視為作品根目錄相對路徑(專案內的檔案路徑一律相對於作品根)。
func resolveLink(rel, target string) (string, bool) {
	if target == "" || strings.HasPrefix(target, "#") || schemeRe.MatchString(target) {
		return "", false
	}
	if i := strings.IndexAny(target, "?#"); i >= 0 { // 去掉錨點與查詢
		target = target[:i]
		if target == "" {
			return "", false
		}
	}
	dec, err := url.PathUnescape(target)
	if err != nil {
		return "", false // 解不開的百分比序列:不猜
	}
	// Windows 把 \ 當路徑分隔(含 %5C 解碼出的):先換成 /,下面的 .. 邊界判斷才看得到它
	dec = strings.ReplaceAll(dec, `\`, "/")
	var dest string
	if strings.HasPrefix(dec, "/") {
		dest = path.Clean(strings.TrimPrefix(dec, "/"))
	} else {
		dest = path.Clean(path.Join(path.Dir(rel), dec))
	}
	if dest == "." || dest == ".." || strings.HasPrefix(dest, "../") || strings.Contains(dest, ":") {
		return "", false // 專案外(含磁碟機路徑):不是作品的檔案
	}
	return dest, true
}

// fileExists 看作品資料夾裡有沒有這個檔案:只認路徑,不限制 .md(作者可能把圖片放在作品裡)。
func fileExists(root, rel string) bool {
	_, err := os.Stat(filepath.Join(root, filepath.FromSlash(rel)))
	return err == nil
}

// ---- perkins.json ----

// missingChapterIssues 回報卷中列出、磁碟上卻不存在的章節:沿用 project.ResolveVolumes 的判斷
// (同一個函式產生的警告,只是把它變成可點的清單;不修改 perkins.json)。
func missingChapterIssues(p *project.Project) []Issue {
	chapters, err := p.Chapters() // 磁碟上實際存在的章節(ResolveVolumes 已把未列出的補進最後一卷)
	if err != nil {
		return nil
	}
	_, warns := project.ResolveVolumes(p.Config.Volumes, chapters)
	var out []Issue
	for _, w := range warns {
		rel, ok := strings.CutPrefix(w, project.WarnMissingChapter)
		if !ok {
			continue
		}
		out = append(out, Issue{Check: CheckMissingChapter, Path: filepath.ToSlash(rel), Message: "perkins.json 的卷中列出這個章節,但檔案不存在"})
	}
	return out
}
