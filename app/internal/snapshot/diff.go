package snapshot

import "strings"

type DiffLine struct {
	Op   string `json:"op"` // " " 相同 | "-" 只在舊版 | "+" 只在新版
	Text string `json:"text"`
	// Segs 只出現在「修改」的行:同一處被刪的行與新增的行一對一配對後,標出行內實際變動的字。
	// 兩行差太多(標出來只是雜訊)或太長時省略,前端整行標色。
	Segs []Seg `json:"segs,omitempty"`
}

type Seg struct {
	Changed bool   `json:"changed"`
	Text    string `json:"text"`
}

// LineDiff 以 LCS 比較兩段文字的行。長篇章節通常數百到數千行,O(n*m) 在 MVP 可接受;
// 超過上限時退化為「整段刪除 + 整段新增」,避免卡住介面。
func LineDiff(oldText, newText string) []DiffLine {
	a, b := strings.Split(oldText, "\n"), strings.Split(newText, "\n")
	// 去掉共同前後綴,縮小 LCS 範圍
	pre := 0
	for pre < len(a) && pre < len(b) && a[pre] == b[pre] {
		pre++
	}
	suf := 0
	for suf < len(a)-pre && suf < len(b)-pre && a[len(a)-1-suf] == b[len(b)-1-suf] {
		suf++
	}
	out := make([]DiffLine, 0, len(a)+len(b))
	for _, l := range a[:pre] {
		out = append(out, DiffLine{Op: " ", Text: l})
	}
	ma, mb := a[pre:len(a)-suf], b[pre:len(b)-suf]
	if len(ma)*len(mb) > 4_000_000 {
		for _, l := range ma {
			out = append(out, DiffLine{Op: "-", Text: l})
		}
		for _, l := range mb {
			out = append(out, DiffLine{Op: "+", Text: l})
		}
	} else {
		for _, o := range lcs(ma, mb) {
			if o.op == "+" {
				out = append(out, DiffLine{Op: o.op, Text: mb[o.j]})
			} else {
				out = append(out, DiffLine{Op: o.op, Text: ma[o.i]})
			}
		}
	}
	for _, l := range a[len(a)-suf:] {
		out = append(out, DiffLine{Op: " ", Text: l})
	}
	markInline(out)
	return out
}

// markInline 找出每段連續的「-」行緊接「+」行,依序一對一配對,為配對的兩行補上字元層級的 Segs。
// 中文一段通常就是一行,只改一個字時整段標色很難看出改了哪裡。
func markInline(lines []DiffLine) {
	for i := 0; i < len(lines); {
		d := i
		for d < len(lines) && lines[d].Op == "-" {
			d++
		}
		p := d
		for p < len(lines) && lines[p].Op == "+" {
			p++
		}
		for k := 0; k < d-i && k < p-d; k++ {
			lines[i+k].Segs, lines[d+k].Segs = runeSegs(lines[i+k].Text, lines[d+k].Text)
		}
		if p == i {
			p++
		}
		i = p
	}
}

func runeSegs(oldLine, newLine string) (del, add []Seg) {
	a, b := []rune(oldLine), []rune(newLine)
	if len(a) == 0 || len(b) == 0 || len(a)*len(b) > 1_000_000 {
		return nil, nil
	}
	ops := lcs(a, b)
	same := 0
	for _, o := range ops {
		if o.op == " " {
			same++
		}
	}
	// 共同字不到較長一行的一半,視為改寫整段,逐字標示只會是雜訊
	if same*2 < max(len(a), len(b)) {
		return nil, nil
	}
	push := func(segs []Seg, changed bool, r rune) []Seg {
		if n := len(segs); n > 0 && segs[n-1].Changed == changed {
			segs[n-1].Text += string(r)
			return segs
		}
		return append(segs, Seg{Changed: changed, Text: string(r)})
	}
	for _, o := range ops {
		switch o.op {
		case " ":
			del = push(del, false, a[o.i])
			add = push(add, false, b[o.j])
		case "-":
			del = push(del, true, a[o.i])
		default:
			add = push(add, true, b[o.j])
		}
	}
	return del, add
}

type lcsOp struct {
	op   string // 同 DiffLine.Op
	i, j int    // 在 a、b 中的索引;"-" 只用 i,"+" 只用 j
}

func lcs[T comparable](a, b []T) []lcsOp {
	n, m := len(a), len(b)
	dp := make([][]int, n+1)
	for i := range dp {
		dp[i] = make([]int, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if a[i] == b[j] {
				dp[i][j] = dp[i+1][j+1] + 1
			} else if dp[i+1][j] >= dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}
	var out []lcsOp
	i, j := 0, 0
	for i < n && j < m {
		switch {
		case a[i] == b[j]:
			out = append(out, lcsOp{" ", i, j})
			i++
			j++
		case dp[i+1][j] >= dp[i][j+1]:
			out = append(out, lcsOp{"-", i, j})
			i++
		default:
			out = append(out, lcsOp{"+", i, j})
			j++
		}
	}
	for ; i < n; i++ {
		out = append(out, lcsOp{"-", i, j})
	}
	for ; j < m; j++ {
		out = append(out, lcsOp{"+", i, j})
	}
	return out
}
