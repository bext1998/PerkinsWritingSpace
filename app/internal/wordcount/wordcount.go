// Package wordcount 提供全專案共用的字數計算(SPEC §15:標點算字;不計空白、
// Markdown 記號(`# * _ ~ > | \“)、清單記號與 `<!-- -->` 註解)。
// 狀態列、各章字數與 Perkins Bot 的 list_files 都用同一套規則。
package wordcount

import (
	"strings"
	"unicode"
)

// CountText 計算字數:不含空白、Markdown 記號(標題 #、強調 *_~、引用 >、程式碼 `)與 HTML 註解(作者筆記)。
// 以程式計算,讓狀態列與各章字數用同一套規則。
func CountText(s string) int {
	for {
		i := strings.Index(s, "<!--")
		if i < 0 {
			break
		}
		j := strings.Index(s[i:], "-->")
		if j < 0 {
			s = s[:i]
			break
		}
		s = s[:i] + s[i+j+3:]
	}
	n := 0
	for _, line := range strings.Split(s, "\n") {
		if t := strings.TrimLeft(line, " \t"); strings.HasPrefix(t, "- ") || strings.HasPrefix(t, "+ ") {
			line = t[2:] // 清單記號
		}
		for _, r := range line {
			if unicode.IsSpace(r) || strings.ContainsRune("*_~`#>|", r) {
				continue
			}
			n++
		}
	}
	return n
}
