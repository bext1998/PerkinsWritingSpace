package publish

import (
	"strings"
	"testing"
)

const chapter = "# 第一章 出發\n\n　　清晨的**王都**很安靜。\n「走吧。」*艾莉絲*說。\n\n***\n\n<!-- 作者筆記:這裡之後要埋伏筆 -->\n他們[出發](http://x)了。\n"

// 意圖(B8):作者自己已經打了全形縮排時,輸出不能變成四格;每段恰好兩格。
func TestIndentNeverDoubles(t *testing.T) {
	out, err := Convert(chapter, Rules{Indent: true, Heading: "drop", SceneBreak: "◇◇◇"})
	if err != nil {
		t.Fatal(err)
	}
	want := "　　清晨的王都很安靜。\n　　「走吧。」艾莉絲說。\n◇◇◇\n　　他們出發了。"
	if out != want {
		t.Fatalf("got\n%q\nwant\n%q", out, want)
	}
	again, _ := Convert(out, Rules{Indent: true, Heading: "drop", SceneBreak: "◇◇◇"})
	if again != want {
		t.Fatalf("轉換結果再轉一次應不變(縮排不疊加): %q", again)
	}
}

// 意圖:藏在 HTML 註解裡的作者筆記絕不能跟著貼到平台上。
func TestCommentsNeverLeak(t *testing.T) {
	out, _ := Convert(chapter, Rules{})
	if strings.Contains(out, "伏筆") || strings.Contains(out, "<!--") {
		t.Fatalf("筆記外流: %q", out)
	}
	multi, _ := Convert("甲\n<!-- 第一行\n第二行 -->\n乙", Rules{})
	if multi != "甲\n乙" {
		t.Fatalf("多行註解未移除: %q", multi)
	}
}

func TestBlankLineAndHeadingStrip(t *testing.T) {
	out, _ := Convert(chapter, Rules{BlankLine: true, Heading: "strip", SceneBreak: ""})
	want := "第一章 出發\n\n清晨的王都很安靜。\n\n「走吧。」艾莉絲說。\n\n他們出發了。"
	if out != want {
		t.Fatalf("got\n%q\nwant\n%q", out, want)
	}
}

// 意圖:場景分隔設成「只留空行」且段落不空行時,場景之間仍要看得出斷開。
func TestSceneBreakAsBlankKeepsSeparation(t *testing.T) {
	out, _ := Convert("甲\n\n---\n\n乙", Rules{SceneBreak: ""})
	if out != "甲\n\n乙" {
		t.Fatalf("got %q", out)
	}
}

// 意圖:預設只換字形,不擅自改作者的用詞;詞彙轉換要作者主動選擇。
func TestScriptConversion(t *testing.T) {
	in := "他打開軟體。"
	chars, err := Convert(in, Rules{Convert: "tw2s"})
	if err != nil {
		t.Fatal(err)
	}
	if chars != "他打开软体。" {
		t.Fatalf("字形轉換: %q", chars)
	}
	words, _ := Convert(in, Rules{Convert: "tw2sp"})
	if words != "他打开软件。" {
		t.Fatalf("詞彙轉換: %q", words)
	}
	if _, err := Convert(in, Rules{Convert: "bogus"}); err == nil {
		t.Fatal("未知轉換應報錯")
	}
}

func TestDeterministic(t *testing.T) {
	r := Presets()[2].Rules
	a, _ := Convert(chapter, r)
	b, _ := Convert(chapter, r)
	if a != b {
		t.Fatal("同輸入同規則的輸出應相同")
	}
}

// 意圖:整卷匯出即使平台預設丟掉標題,也要保留章節標題,讀者才分得出章節。
func TestVolumeKeepsChapterTitles(t *testing.T) {
	out, err := Volume("第一卷", []string{"# 第一章\n甲", "# 第二章\n乙"}, Rules{Heading: "drop", Convert: "tw2s"})
	if err != nil {
		t.Fatal(err)
	}
	if out != "第一卷\n\n\n第一章\n甲\n\n\n第二章\n乙" {
		t.Fatalf("got %q", out)
	}
	conv, _ := Volume("龍與劍", []string{"# 第一章\n甲"}, Rules{Convert: "tw2s"})
	if !strings.HasPrefix(conv, "龙与剑") {
		t.Fatalf("卷名也應轉換: %q", conv)
	}
}

func TestEscapesAndFrontmatter(t *testing.T) {
	out, _ := Convert("---\ntype: x\n---\n星號\\*不是強調\\*", Rules{})
	if out != "星號*不是強調*" {
		t.Fatalf("got %q", out)
	}
}
