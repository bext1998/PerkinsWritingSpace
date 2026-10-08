package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// 事件建構輔助:組一行 JSON 的欄位字典。
type fields map[string]any

func line(t *testing.T, name, session string, d fields) string {
	t.Helper()
	// 直接組 JSON 字串,detail 內嵌
	var sb strings.Builder
	sb.WriteString(`{"ts":"2026-10-08T10:00:00.000+08:00","session":"` + session + `","event":"` + name + `","detail":`)
	b, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	sb.Write(b)
	sb.WriteString("}")
	return sb.String()
}

// askReq 組一個 purpose=ask 的請求,總字元數為 n(每則訊息 content 長度相加)。
func askReq(n int) fields {
	// 一則 user 訊息,content 為 n 個字元
	return fields{"purpose": "ask", "messages": []fields{{"role": "user", "content": strings.Repeat("字", n)}}}
}

func compactReq(transcriptChars int, ok bool) fields {
	return fields{"purpose": "compact", "ok": ok, "messages": []fields{
		{"role": "system", "content": "壓縮"},
		{"role": "user", "content": strings.Repeat("字", transcriptChars)},
	}}
}

// compactReqLegacy 組一個舊版(無 ok 欄位)的 compact 請求。
func compactReqLegacy(transcriptChars int) fields {
	return fields{"purpose": "compact", "messages": []fields{
		{"role": "system", "content": "壓縮"},
		{"role": "user", "content": strings.Repeat("字", transcriptChars)},
	}}
}

// fixture:涵蓋各指標的虛構記錄。
// session s1:
//   ask#1 無快速指令,1 個 ask 請求(100 字)
//   ask#2 quickId=analyze,未改問題,2 個 ask 請求(回合 2)
//   ask#3 quickId=canon,改過問題,requests = [compact(逐字稿 500 字, ok=true), ask(30 字)]
//     → 送出前壓縮:依 requests 順序,同事件內配對(500, 30)
//   ask#4 quickId=analyze,改過問題,1 個 ask 請求(60 字)→ 不再配對(壓縮已在 #3 內配完)
//   proposal_accept p1(authorEdited=false)、p2(authorEdited=true)、proposal_reject p3
// session s2:
//   ask#5 前置失敗(requests 空、無 quickId)
func fixture(t *testing.T) []string {
	return []string{
		line(t, "ask", "s1", fields{"model": "m", "sent": true, "requests": []fields{askReq(100)}}),
		line(t, "ask", "s1", fields{"quickId": "analyze", "quickEdited": false, "sent": true,
			"requests": []fields{askReq(10), askReq(10)}}),
		line(t, "ask", "s1", fields{"quickId": "canon", "quickEdited": true, "sent": true,
			"requests": []fields{compactReq(500, true), askReq(30)}}),
		line(t, "ask", "s1", fields{"quickId": "analyze", "quickEdited": true, "sent": true,
			"requests": []fields{askReq(60)}}),
		line(t, "proposal_accept", "s1", fields{"id": "p1", "target": "manuscript/c1.md", "authorEdited": false}),
		line(t, "proposal_accept", "s1", fields{"id": "p2", "target": "manuscript/c1.md", "authorEdited": true}),
		line(t, "proposal_reject", "s1", fields{"id": "p3", "target": "manuscript/c1.md"}),
		line(t, "ask", "s2", fields{"sent": false, "result": "error", "requests": []any{}}),
	}
}

func TestComputeFixture(t *testing.T) {
	s := compute(fixture(t))
	if s.Lines != 8 || s.BadLines != 0 {
		t.Fatalf("Lines=%d BadLines=%d, 應為 8/0", s.Lines, s.BadLines)
	}
	if s.AskEvents != 5 {
		t.Fatalf("AskEvents=%d, 應為 5", s.AskEvents)
	}
	if s.Sessions != 2 {
		t.Fatalf("Sessions=%d, 應為 2(s1、s2)", s.Sessions)
	}
	// 提案:接受 2(其中修改後 1)、拒絕 1 → 分母 3
	if s.Accepts != 2 || s.AcceptEdited != 1 || s.Rejects != 1 {
		t.Fatalf("Accepts=%d AcceptEdited=%d Rejects=%d, 應為 2/1/1", s.Accepts, s.AcceptEdited, s.Rejects)
	}
	// 快速指令:analyze 2 次(改過 1 次)、canon 1 次(改過 1 次)
	want := map[string]quickStat{
		"analyze": {Asks: 2, Edited: 1, EditedRatio: 0.5},
		"canon":   {Asks: 1, Edited: 1, EditedRatio: 1},
	}
	if !reflect.DeepEqual(s.Quick, want) {
		t.Fatalf("Quick=%+v, 應為 %+v", s.Quick, want)
	}
	// 對話長度:5 個 ask / 2 個 session = 2.5;回合 1+2+1+1+0 = 5 / 5 = 1
	if s.AvgAsksPerSession != 2.5 {
		t.Fatalf("AvgAsksPerSession=%v, 應為 2.5", s.AvgAsksPerSession)
	}
	if s.AvgRoundsPerAsk != 1 {
		t.Fatalf("AvgRoundsPerAsk=%v, 應為 1", s.AvgRoundsPerAsk)
	}
	// 壓縮配對 1 次:依 requests 順序,ask#3 內 compact(500, ok=true)之後的第一個 ask 請求(30 字)
	if s.Compactions != 1 {
		t.Fatalf("Compactions=%d, 應為 1", s.Compactions)
	}
	if s.CompactionsUnknown != 0 {
		t.Fatalf("CompactionsUnknown=%d, 應為 0", s.CompactionsUnknown)
	}
	if s.ContextBeforeAvg == nil || *s.ContextBeforeAvg != 500 {
		t.Fatalf("ContextBeforeAvg=%v, 應為 500", s.ContextBeforeAvg)
	}
	if s.ContextAfterAvg == nil || *s.ContextAfterAvg != 30 {
		t.Fatalf("ContextAfterAvg=%v, 應為 30", s.ContextAfterAvg)
	}
}

// 送出後壓縮(compact 在事件尾)仍跨事件配對:下一筆 ask 事件的第一個 ask 請求是壓縮後上下文。
func TestComputeCompactCrossEvent(t *testing.T) {
	lines := []string{
		line(t, "ask", "s1", fields{"sent": true, "requests": []fields{askReq(100), compactReq(400, true)}}),
		line(t, "ask", "s1", fields{"sent": true, "requests": []fields{askReq(150)}}),
	}
	s := compute(lines)
	if s.Compactions != 1 || s.CompactionsUnknown != 0 {
		t.Fatalf("Compactions=%d Unknown=%d, 應為 1/0", s.Compactions, s.CompactionsUnknown)
	}
	if s.ContextBeforeAvg == nil || *s.ContextBeforeAvg != 400 || s.ContextAfterAvg == nil || *s.ContextAfterAvg != 150 {
		t.Fatalf("前後=%v/%v, 應為 400/150", s.ContextBeforeAvg, s.ContextAfterAvg)
	}
}

// 最後一筆事件即可完成配對:送出前壓縮(compact → ask 同事件)不需要下一筆事件。
func TestComputeCompactPairsWithinLastEvent(t *testing.T) {
	lines := []string{
		line(t, "ask", "s1", fields{"sent": true, "requests": []fields{compactReq(400, true), askReq(120)}}),
	}
	s := compute(lines)
	if s.Compactions != 1 || s.CompactionsUnknown != 0 {
		t.Fatalf("Compactions=%d Unknown=%d, 應為 1/0", s.Compactions, s.CompactionsUnknown)
	}
	if s.ContextBeforeAvg == nil || *s.ContextBeforeAvg != 400 || s.ContextAfterAvg == nil || *s.ContextAfterAvg != 120 {
		t.Fatalf("前後=%v/%v, 應為 400/120", s.ContextBeforeAvg, s.ContextAfterAvg)
	}
}

// 失敗的壓縮(ok=false)未套用,不得配對。
func TestComputeFailedCompactNotPaired(t *testing.T) {
	lines := []string{
		line(t, "ask", "s1", fields{"sent": true, "result": "error", "requests": []fields{compactReq(500, false), askReq(30)}}),
		line(t, "ask", "s1", fields{"sent": true, "requests": []fields{askReq(70)}}),
	}
	s := compute(lines)
	if s.Compactions != 0 || s.CompactionsUnknown != 0 {
		t.Fatalf("失敗壓縮不應配對: Compactions=%d Unknown=%d", s.Compactions, s.CompactionsUnknown)
	}
	if s.ContextBeforeAvg != nil || s.ContextAfterAvg != nil {
		t.Fatalf("失敗壓縮不應產生統計值: %v/%v", s.ContextBeforeAvg, s.ContextAfterAvg)
	}
}

// 舊版記錄(compact 無 ok 欄位)無法確認是否套用 → 記 unknown,不配對。
func TestComputeLegacyCompactUnknown(t *testing.T) {
	lines := []string{
		line(t, "ask", "s1", fields{"sent": true, "requests": []fields{compactReqLegacy(500), askReq(30)}}),
	}
	s := compute(lines)
	if s.Compactions != 0 || s.CompactionsUnknown != 1 {
		t.Fatalf("Compactions=%d Unknown=%d, 應為 0/1", s.Compactions, s.CompactionsUnknown)
	}
	if s.ContextBeforeAvg != nil || s.ContextAfterAvg != nil {
		t.Fatalf("無法確認時不應產生統計值: %v/%v", s.ContextBeforeAvg, s.ContextAfterAvg)
	}
}

func TestResolve(t *testing.T) {
	// 資料夾:接 .perkins/research.jsonl
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".perkins"), 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := resolve(dir)
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(dir, ".perkins", "research.jsonl"); got != want {
		t.Fatalf("resolve(dir)=%s, 應為 %s", got, want)
	}
	// 檔案:原樣回傳
	f := filepath.Join(dir, ".perkins", "research.jsonl")
	if err := os.WriteFile(f, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err = resolve(f)
	if err != nil || got != f {
		t.Fatalf("resolve(file)=%s err=%v, 應為原樣 %s", got, err, f)
	}
	// 不存在的路徑:回傳錯誤
	if _, err := resolve(filepath.Join(dir, "nope")); err == nil {
		t.Fatal("不存在的路徑應回傳錯誤")
	}
}

func TestComputeEmpty(t *testing.T) {
	s := compute(nil)
	if s.Lines != 0 || s.AskEvents != 0 || s.Sessions != 0 || s.Compactions != 0 {
		t.Fatalf("空檔指標應全為 0,得 %+v", s)
	}
	if len(s.Quick) != 0 {
		t.Fatalf("空檔不應有快速指令統計")
	}
}

func TestComputeBadLines(t *testing.T) {
	lines := []string{
		"{不是 JSON",
		line(t, "proposal_accept", "s1", fields{"id": "p1", "authorEdited": true}),
		"", // 空行:不計行數也不算壞行
		`{"ts":"x","session":"s1","event":"ask"`, // 截斷的行
	}
	s := compute(lines)
	if s.Lines != 3 {
		t.Fatalf("Lines=%d, 應為 3(非空行,含壞行;空行不算)", s.Lines)
	}
	if s.BadLines != 2 {
		t.Fatalf("BadLines=%d, 應為 2", s.BadLines)
	}
	if s.Accepts != 1 || s.AcceptEdited != 1 {
		t.Fatalf("壞行不應中斷後續解析:Accepts=%d AcceptEdited=%d", s.Accepts, s.AcceptEdited)
	}
}

// 舊版記錄缺欄位:無 quickId(不計快速指令)、無 requests(回合 0、不配對壓縮)、
// proposal_accept 無 authorEdited(不算修改後接受)。
func TestComputeLegacyRecords(t *testing.T) {
	lines := []string{
		`{"ts":"x","session":"s1","event":"ask","detail":{"model":"m","sent":true,"reply":"好"}}`,
		`{"ts":"x","session":"s1","event":"proposal_accept","detail":{"id":"p1","target":"manuscript/c1.md"}}`,
	}
	s := compute(lines)
	if s.AskEvents != 1 || s.Sessions != 1 {
		t.Fatalf("AskEvents=%d Sessions=%d, 應為 1/1", s.AskEvents, s.Sessions)
	}
	if len(s.Quick) != 0 {
		t.Fatalf("無 quickId 不應有快速指令統計:%+v", s.Quick)
	}
	if s.AvgRoundsPerAsk != 0 {
		t.Fatalf("無 requests 時回合應為 0,得 %v", s.AvgRoundsPerAsk)
	}
	if s.Accepts != 1 || s.AcceptEdited != 0 {
		t.Fatalf("Accepts=%d AcceptEdited=%d, 應為 1/0", s.Accepts, s.AcceptEdited)
	}
}

// 壓縮無法配對的情境:送出後壓縮(compact 在事件尾),之後同 session 再無帶 ask 請求的事件。
func TestComputeCompactUnpaired(t *testing.T) {
	lines := []string{
		line(t, "ask", "s1", fields{"sent": true, "requests": []fields{askReq(100), compactReq(400, true)}}),
	}
	s := compute(lines)
	if s.Compactions != 0 || s.ContextBeforeAvg != nil || s.ContextAfterAvg != nil {
		t.Fatalf("無法配對時應為 0/nil,得 Compactions=%d", s.Compactions)
	}
}
