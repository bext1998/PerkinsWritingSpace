package snapshot

import "strings"

type DiffLine struct {
	Op   string `json:"op"` // " " 相同 | "-" 只在舊版 | "+" 只在新版
	Text string `json:"text"`
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
		out = append(out, DiffLine{" ", l})
	}
	ma, mb := a[pre:len(a)-suf], b[pre:len(b)-suf]
	if len(ma)*len(mb) > 4_000_000 {
		for _, l := range ma {
			out = append(out, DiffLine{"-", l})
		}
		for _, l := range mb {
			out = append(out, DiffLine{"+", l})
		}
	} else {
		out = append(out, lcs(ma, mb)...)
	}
	for _, l := range a[len(a)-suf:] {
		out = append(out, DiffLine{" ", l})
	}
	return out
}

func lcs(a, b []string) []DiffLine {
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
	var out []DiffLine
	i, j := 0, 0
	for i < n && j < m {
		switch {
		case a[i] == b[j]:
			out = append(out, DiffLine{" ", a[i]})
			i++
			j++
		case dp[i+1][j] >= dp[i][j+1]:
			out = append(out, DiffLine{"-", a[i]})
			i++
		default:
			out = append(out, DiffLine{"+", b[j]})
			j++
		}
	}
	for ; i < n; i++ {
		out = append(out, DiffLine{"-", a[i]})
	}
	for ; j < m; j++ {
		out = append(out, DiffLine{"+", b[j]})
	}
	return out
}
