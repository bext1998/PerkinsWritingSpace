package main

import "testing"

// 意圖:平台常有字數門檻,字數不能把 Markdown 記號、空白或藏在註解裡的作者筆記算進去。
func TestCountText(t *testing.T) {
	cases := map[string]int{
		"# 第一章\n\n　　她說:「**走吧**。」\n": 11, // 第一章(3)+ 她說:「走吧。」(8,標點算字)
		"甲乙<!-- 筆記\n很多字 -->丙":       3,
		"> 引用文字\n- 清單":              6,
		"abc def":                   6,
		"未結束的註解<!-- 之後都不算":          6,
	}
	for in, want := range cases {
		if got := CountText(in); got != want {
			t.Errorf("CountText(%q) = %d, want %d", in, got, want)
		}
	}
}
