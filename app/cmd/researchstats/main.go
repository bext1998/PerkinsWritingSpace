// researchstats 是開發用小程式(SPEC §16 第 21 項(b)),不是 App 功能、沒有 Wails 綁定。
// 讀單一作品的 .perkins/research.jsonl(§12.8),在 stdout 輸出研究指標:
//   - 提案接受率、作者修改後接受比例、拒絕率(分母標明在輸出中)
//   - 各快速指令使用次數與「送出前改過問題」的比例
//   - 平均對話長度(每個 session 的 ask 次數與回合數)
//   - 壓縮前後的上下文用量(以字元數估計;記錄裡沒有 token 欄位)
//
// 只讀指定的檔案或資料夾,不讀其他位置、不上傳、不寫檔。
// 用法:
//
//	researchstats <作品資料夾或 research.jsonl 路徑> [--json]
//
// <路徑>是資料夾時讀 <資料夾>/.perkins/research.jsonl;是檔案時直接讀該檔。
// 資料來源說明:提案的接受/拒絕/修改後接受就在 research.jsonl 的 proposal_accept
// (authorEdited 欄位)/ proposal_reject 事件裡,因此不需要 provenance.jsonl。
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// event 對應 §12.8 的共同欄位;Detail 以內嵌物件解析。
type event struct {
	TS      string `json:"ts"`
	Session string `json:"session"`
	Name    string `json:"event"`
	Detail  detail `json:"detail"`
}

// detail 只取指標需要的欄位;舊版記錄缺欄位時為零值,各指標自行處理。
type detail struct {
	QuickID      string          `json:"quickId"`
	QuickEdited  bool            `json:"quickEdited"`
	ProposalID   string          `json:"id"`
	AuthorEdited bool            `json:"authorEdited"`
	Requests     []requestDetail `json:"requests"`
}

type requestDetail struct {
	Purpose  string    `json:"purpose"` // ask | compact
	Messages []message `json:"messages"`
	Ok       *bool     `json:"ok"` // compact 請求:壓縮是否成功套用;nil = 舊版記錄無此欄,無法確認
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// stats 是全部計算結果;JSON 與人讀輸出共用。
type stats struct {
	// 記錄檔概況
	Lines     int `json:"lines"`     // 非空行數
	BadLines  int `json:"badLines"`  // 跳過的壞行(JSON 解析失敗)
	AskEvents int `json:"askEvents"` // ask 事件數
	Sessions  int `json:"sessions"`  // 出現過 ask 事件的 session 數

	// 提案決定(分母:research.jsonl 中有決定的提案 = 接受+拒絕;待審中的提案沒有事件,無法計入)
	Accepts      int `json:"accepts"`
	AcceptEdited int `json:"acceptEdited"` // 作者修改後接受(authorEdited=true)
	Rejects      int `json:"rejects"`

	// 快速指令(分母:該指令的 ask 事件數;舊版記錄沒有 quickId,不計入)
	Quick map[string]quickStat `json:"quick"`

	// 平均對話長度(分母:有 ask 事件的 session / ask 事件)
	AvgAsksPerSession float64 `json:"avgAsksPerSession"`
	AvgRoundsPerAsk   float64 `json:"avgRoundsPerAsk"` // 回合 = 一個 ask 事件中 purpose=ask 的請求數(工具迭代算多回合)

	// 壓縮前後上下文用量(字元數;記錄沒有 token 欄位,詳見 README 與輸出說明)。
	// 依 requests 順序配對:成功的壓縮(ok=true)之後的第一個 ask 請求就是壓縮後的上下文
	//(通常在同一事件內;送出後壓縮則在下一筆事件)。失敗的壓縮(ok=false)未套用,不配對。
	// 「前」= compact 請求中被濃縮的對話逐字稿字元數;「後」= 該壓縮後第一個 ask 請求的訊息字元數。
	Compactions        int      `json:"compactions"`
	CompactionsUnknown int      `json:"compactionsUnknown"` // 舊版記錄無 ok 欄位,無法確認是否套用
	ContextBeforeAvg   *float64 `json:"contextBeforeAvg,omitempty"`
	ContextAfterAvg    *float64 `json:"contextAfterAvg,omitempty"`
}

type quickStat struct {
	Asks        int     `json:"asks"`   // 使用次數
	Edited      int     `json:"edited"` // 送出前改過問題的次數
	EditedRatio float64 `json:"editedRatio"`
}

func main() {
	jsonOut := false
	pathArg := ""
	for _, a := range os.Args[1:] {
		if a == "--json" || a == "-json" { // 參數順序不拘
			jsonOut = true
		} else if pathArg == "" {
			pathArg = a
		}
	}
	if pathArg == "" {
		fmt.Fprintln(os.Stderr, "用法: researchstats <作品資料夾或 research.jsonl 路徑> [--json]")
		os.Exit(2)
	}
	path, err := resolve(pathArg)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, "讀取失敗:", err)
		os.Exit(1)
	}
	s := compute(splitLines(b))
	if jsonOut {
		out, _ := json.MarshalIndent(s, "", "  ")
		fmt.Println(string(out))
		return
	}
	printHuman(path, s)
}

// resolve 把參數轉成 research.jsonl 的實際路徑。
func resolve(arg string) (string, error) {
	info, err := os.Stat(arg)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return arg, nil
	}
	return filepath.Join(arg, ".perkins", "research.jsonl"), nil
}

// sessionState 記住一個 session 跨事件的狀態。
type sessionState struct {
	asks    int
	rounds  int
	pending *float64 // 剛成功套用的壓縮(ok=true)、還沒配對到壓縮後上下文的「前」值
}

func compute(lines []string) *stats {
	s := &stats{Quick: map[string]quickStat{}}
	var beforeSum, afterSum float64
	bySession := map[string]*sessionState{}
	var order []string // session 首次出現順序(只為算 session 數)
	var pairs [][2]float64

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		s.Lines++
		var ev event
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			s.BadLines++
			continue
		}
		switch ev.Name {
		case "ask":
			s.AskEvents++
			st := bySession[ev.Session]
			if st == nil {
				st = &sessionState{}
				bySession[ev.Session] = st
				order = append(order, ev.Session)
			}
			// 依 requests 順序掃描:成功的壓縮之後的第一個 ask 請求,就是壓縮後的上下文。
			// 多在同一事件內完成配對(送出前壓縮);送出後壓縮則由下一筆事件的 ask 配對。
			var pendingChars float64
			hadPending := st.pending != nil
			if st.pending != nil { // 上一筆事件留下的成功壓縮(送出後壓縮),同事件內的 ask 可直接配對
				pendingChars = *st.pending
			}
			for _, r := range ev.Detail.Requests {
				switch r.Purpose {
				case "compact":
					if r.Ok == nil { // 舊版記錄無法確認是否套用
						s.CompactionsUnknown++
						continue
					}
					if !*r.Ok { // 失敗的壓縮未套用,不改變 History,不配對
						continue
					}
					n := 0
					for _, m := range r.Messages {
						if m.Role == "user" {
							n += len([]rune(m.Content))
						}
					}
					if n > 0 {
						pendingChars = float64(n)
						hadPending = true
					}
				case "ask":
					if hadPending && pendingChars > 0 {
						n := 0
						for _, m := range r.Messages {
							n += len([]rune(m.Content))
						}
						pairs = append(pairs, [2]float64{pendingChars, float64(n)})
						pendingChars = 0
						hadPending = false
						st.pending = nil
					}
				}
			}
			st.asks++
			st.rounds += countAsks(ev.Detail.Requests)
			// 事件內沒配對完的成功壓縮:留到同 session 下一筆 ask 事件
			if hadPending && pendingChars > 0 {
				v := pendingChars
				st.pending = &v
			}
			if ev.Detail.QuickID != "" {
				q := s.Quick[ev.Detail.QuickID]
				q.Asks++
				if ev.Detail.QuickEdited {
					q.Edited++
				}
				s.Quick[ev.Detail.QuickID] = q
			}
		case "proposal_accept":
			s.Accepts++
			if ev.Detail.AuthorEdited {
				s.AcceptEdited++
			}
		case "proposal_reject":
			s.Rejects++
		}
	}

	s.Sessions = len(order)
	if s.Sessions > 0 {
		totalAsks, totalRounds := 0, 0
		for _, st := range bySession {
			totalAsks += st.asks
			totalRounds += st.rounds
		}
		s.AvgAsksPerSession = float64(totalAsks) / float64(s.Sessions)
		s.AvgRoundsPerAsk = float64(totalRounds) / float64(totalAsks)
	}
	s.Compactions = len(pairs)
	for _, p := range pairs {
		beforeSum += p[0]
		afterSum += p[1]
	}
	if len(pairs) > 0 {
		v := beforeSum / float64(len(pairs))
		s.ContextBeforeAvg = &v
		w := afterSum / float64(len(pairs))
		s.ContextAfterAvg = &w
	}
	for id, q := range s.Quick {
		q.EditedRatio = float64(q.Edited) / float64(q.Asks)
		s.Quick[id] = q
	}
	return s
}

func countAsks(rs []requestDetail) int {
	n := 0
	for _, r := range rs {
		if r.Purpose == "ask" {
			n++
		}
	}
	return n
}

func printHuman(path string, s *stats) {
	fmt.Printf("研究記錄: %s\n", path)
	fmt.Printf("非空行 %d(壞行跳過 %d)、ask 事件 %d、session %d\n\n", s.Lines, s.BadLines, s.AskEvents, s.Sessions)

	decided := s.Accepts + s.Rejects
	fmt.Printf("== 提案(分母:記錄中有決定的提案,接受+拒絕 = %d;待審中的提案沒有事件,不計) ==\n", decided)
	fmt.Printf("提案接受率      %d/%d = %.1f%%\n", s.Accepts, decided, pct(s.Accepts, decided))
	fmt.Printf("作者修改後接受  %d/%d(佔接受的 %.1f%%)\n", s.AcceptEdited, s.Accepts, pct(s.AcceptEdited, s.Accepts))
	fmt.Printf("拒絕率          %d/%d = %.1f%%\n\n", s.Rejects, decided, pct(s.Rejects, decided))

	fmt.Println("== 快速指令(分母:該指令的 ask 事件數;舊版記錄無 quickId 不計) ==")
	if len(s.Quick) == 0 {
		fmt.Println("(記錄中沒有帶 quickId 的 ask 事件)")
	} else {
		ids := make([]string, 0, len(s.Quick))
		for id := range s.Quick {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			q := s.Quick[id]
			fmt.Printf("%-12s 使用 %3d 次,送出前改過問題 %d 次(%.1f%%)\n", id, q.Asks, q.Edited, pct(q.Edited, q.Asks))
		}
	}

	fmt.Printf("\n== 對話長度(分母:出現 ask 的 %d 個 session / %d 個 ask 事件) ==\n", s.Sessions, s.AskEvents)
	if s.Sessions == 0 {
		fmt.Println("(記錄中沒有 ask 事件)")
	} else {
		fmt.Printf("平均每 session ask %.1f 次;平均每個 ask %.2f 回合(purpose=ask 的請求數)\n", s.AvgAsksPerSession, s.AvgRoundsPerAsk)
	}

	fmt.Println("\n== 壓縮前後上下文用量(字元數估計;記錄沒有 token 欄位) ==")
	fmt.Println("「前」= compact 請求中被濃縮的對話逐字稿字元數;「後」= 依 requests 順序、成功壓縮(ok=true)之後的第一個 ask 請求訊息字元數。")
	if s.CompactionsUnknown > 0 {
		fmt.Printf("另外有 %d 次壓縮無法確認是否套用(舊版記錄的 compact 請求沒有 ok 欄位),不計入統計。\n", s.CompactionsUnknown)
	}
	if s.Compactions == 0 {
		fmt.Println(insufficientCompactNote)
	} else {
		if s.ContextBeforeAvg != nil {
			fmt.Printf("壓縮前平均 %.0f 字元\n", *s.ContextBeforeAvg)
		}
		if s.ContextAfterAvg != nil {
			fmt.Printf("壓縮後平均 %.0f 字元(配對 %d 次)\n", *s.ContextAfterAvg, s.Compactions)
		}
	}
}

// 新舊記錄可能混在一起(例如一筆舊版 compact 加一筆成功但還沒有後續 ask 的新版 compact),
// 所以不推斷是哪一種原因;無法確認的次數已在上一行另外列出。
const insufficientCompactNote = "資料不足:沒有可確認成功且完成配對的壓縮(成功的 compact 請求之後,需在同一事件或同 session 的後續事件中有 ask 請求)。"

func pct(a, b int) float64 {
	if b == 0 {
		return 0
	}
	return 100 * float64(a) / float64(b)
}

func splitLines(b []byte) []string {
	return strings.Split(string(b), "\n")
}
