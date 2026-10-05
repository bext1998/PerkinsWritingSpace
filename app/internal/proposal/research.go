// 研究記錄(§12.8)掛鉤:在套用/拒絕提案時記錄 proposal_accept / proposal_reject。
// 放在 proposal 套件內,因為耗時要從 Proposal.CreatedAt 算,且套用細節(Final)只在這裡看得到。
package proposal

import (
	"time"

	"perkins/internal/research"
)

// decisionElapsedMs 從建立到決定的耗時;解析失敗回傳 0。
func decisionElapsedMs(p *Proposal) int64 {
	t, err := time.Parse(time.RFC3339, p.CreatedAt)
	if err != nil {
		return 0
	}
	return time.Since(t).Milliseconds()
}

// LogAccept 在 Accept 成功後呼叫:proposal id、target、是否作者修改、原/最終文字、耗時。
func LogAccept(r *research.Recorder, p *Proposal) {
	if r == nil {
		return
	}
	d := map[string]any{
		"id": p.ID, "target": p.Target, "authorEdited": p.AuthorEdited,
		"replacement": p.Replacement, "elapsedMs": decisionElapsedMs(p),
	}
	if p.AuthorEdited {
		d["final"] = p.Final
	}
	_ = r.Log("proposal_accept", d)
}

// LogReject 在 Reject 成功後呼叫。
func LogReject(r *research.Recorder, p *Proposal) {
	if r == nil {
		return
	}
	_ = r.Log("proposal_reject", map[string]any{
		"id": p.ID, "target": p.Target, "elapsedMs": decisionElapsedMs(p),
	})
}
