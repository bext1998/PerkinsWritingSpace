// 受限的 AI 回覆 Markdown 顯示(設計審查 10):只支援粗體、斜體、行內代碼、
// 段落與簡單清單(- / * 開頭)。不允許原始 HTML:所有輸入先當純文字,再從
// 已脫敏的文字中解析標記,輸出全部是 React 元素,不經 innerHTML。自寫小型
// 轉換,不加新依賴。
import * as React from 'react';

/** 把一段純文字拆成「標記片段」:回傳 {kind, text},kind: text | strong | em | code。
 *  邊界規則:`**` 不跨行、不成對時退回字面文字;`*斜體*`/`*code*` 只在單行內。 */
function inlineParts(line: string): {kind: 'text' | 'strong' | 'em' | 'code'; text: string}[] {
    type Part = {kind: 'text' | 'strong' | 'em' | 'code'; text: string};
    const parts: Part[] = [];
    let rest = line;
    const push = (kind: Part['kind'], text: string) => { if (text) parts.push({kind, text}); };
    // 標記候選:`**粗體**` > `` `代碼` `` > `*斜體*`;掃描時取最早開始者,同位置 strong(`**`)優先
    const candidates: {kind: Part['kind']; open: string; close: string}[] = [
        {kind: 'strong', open: '**', close: '**'},
        {kind: 'code', open: '`', close: '`'},
        {kind: 'em', open: '*', close: '*'},
    ];
    while (rest) {
        let pick: {kind: Part['kind']; start: number; end: number; inner: string} | null = null;
        for (const c of candidates) {
            const start = rest.indexOf(c.open);
            if (start === -1) continue;
            const end = rest.indexOf(c.close, start + c.open.length);
            if (end === -1) continue;
            const inner = rest.slice(start + c.open.length, end);
            if (!inner) continue; // 空標記(** 直接相鄰)視為字面文字,不當標記
            if (!pick || start < pick.start || (start === pick.start && c.kind === 'strong')) {
                pick = {kind: c.kind, start, end, inner};
            }
        }
        if (!pick) { push('text', rest); break; }
        push('text', rest.slice(0, pick.start));
        parts.push({kind: pick.kind, text: pick.inner});
        rest = rest.slice(pick.end + (pick.kind === 'strong' ? 2 : 1));
    }
    return parts;
}


function Inline({text}: {text: string}) {
    const parts = inlineParts(text);
    return (
        <>
            {parts.map((p, i) =>
                p.kind === 'strong' ? <strong key={i}>{p.text}</strong> :
                p.kind === 'em' ? <em key={i}>{p.text}</em> :
                p.kind === 'code' ? <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em]">{p.text}</code> :
                <React.Fragment key={i}>{p.text}</React.Fragment>
            )}
        </>
    );
}

/** 段落級:依空行分段;連續的 `- `/`* ` 開頭行組成清單;其他行為一段(行內 \n 以空白連接)。 */
export function MdLite({text}: {text: string}) {
    const blocks: React.ReactNode[] = [];
    const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => {
        if (para.length) {
            blocks.push(<p key={blocks.length}><Inline text={para.join(' ')}/></p>);
            para = [];
        }
    };
    const flushList = () => {
        if (list.length) {
            blocks.push(<ul key={blocks.length} className="list-disc pl-5">{list.map((it, i) => <li key={i}><Inline text={it}/></li>)}</ul>);
            list = [];
        }
    };
    for (const raw of lines) {
        const line = raw.trimEnd();
        const m = line.match(/^\s*[-*]\s+(.*)$/);
        if (m) { flushPara(); list.push(m[1]); continue; }
        if (line.trim() === '') { flushPara(); flushList(); continue; }
        para.push(line.trim());
    }
    flushPara(); flushList();
    return <div className="space-y-1.5">{blocks}</div>;
}
