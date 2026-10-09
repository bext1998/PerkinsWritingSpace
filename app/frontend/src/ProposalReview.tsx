import {useEffect, useRef, useState} from 'react';
import {Check, ChevronLeft, ChevronRight, FileText, RotateCcw, X} from 'lucide-react';
import {proposal} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/basic';
import {Tip} from '@/components/ui/overlay';
import {cn} from '@/lib/utils';
import {TITLEBAR_HEIGHT} from '@/lib/layout';

// 提案審查視窗(#35):在較大空間比對原文與 AI 修改並做決定。
// 只是同一批提案的另一個入口——編輯內容與聊天卡片共用同一份 edited 狀態,
// 接受/拒絕走同一組函式(G1/G3:接受永遠要作者明確點擊,這裡不新增任何自動接受路徑)。
// 唯讀鎖、快照與 Provenance 由後端與 Workspace 的既有流程負責,這個視窗不碰。
const STACK_BELOW = 720; // 視窗本身寬度小於這個值就上下堆疊(看視窗寬度,不是螢幕寬度)

interface Props {
    items: proposal.Proposal[];   // 目前所有待審提案(審查視窗在這幾張之間切換)
    id: string;                   // 目前顯示的提案
    onStep: (dir: -1 | 1) => void; // 上一個/下一個;已在兩端就不動作
    edited: Record<string, string>;
    setEdited: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    titleOf: (path: string) => string;
    onAccept: (p: proposal.Proposal) => void;
    onReject: (p: proposal.Proposal) => void;
    onClose: () => void;
}

export default function ProposalReview({items, id, onStep, edited, setEdited, titleOf, onAccept, onReject, onClose}: Props) {
    const box = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{x: number; y: number} | null>(null);
    const [stacked, setStacked] = useState(false);
    const idx = items.findIndex(p => p.id === id);
    // 目前這張剛離開待審、父層還沒切到下一張的那一次 render,沿用上一張的內容,視窗不會卸成空殼(PR #64 審查)
    const shown = useRef<proposal.Proposal | null>(null);
    if (idx >= 0) shown.current = items[idx];
    const p = shown.current;
    const mine = p ? edited[p.id] ?? p.replacement : '';
    const changed = !!p && mine !== p.replacement;
    const conflict = p?.status === 'conflict';

    // 開啟時置中:預設尺寸由 style 的 min() 決定,量到實際尺寸後才定位
    useEffect(() => {
        const r = box.current?.getBoundingClientRect();
        if (!r) return;
        setStacked(r.width < STACK_BELOW);
        setPos({
            x: Math.max(0, Math.round((window.innerWidth - r.width) / 2)),
            y: Math.max(TITLEBAR_HEIGHT, Math.round((window.innerHeight - r.height) / 2)),
        });
    }, []);

    // 作者調整視窗大小時改版面:用視窗自己的寬度,不是螢幕寬度
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setStacked(el.getBoundingClientRect().width < STACK_BELOW));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // 視窗縮窄時限制回可見範圍(照 chat 浮窗 #55 的寫法):拖到右側後縮成半螢幕,標題列會落在畫面外
    useEffect(() => {
        if (!pos) return;
        const fit = () => {
            const r = box.current!.getBoundingClientRect();
            const x = Math.min(Math.max(0, pos.x), Math.max(0, window.innerWidth - r.width));
            const y = Math.min(Math.max(TITLEBAR_HEIGHT, pos.y), Math.max(TITLEBAR_HEIGHT, window.innerHeight - r.height));
            if (x !== pos.x || y !== pos.y) setPos({x, y});
        };
        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [pos]);

    // Esc 只關閉視窗,不改變提案狀態;用 capture 攔下,不讓底下的面板/編輯器也處理同一個按鍵
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    // 標題列可拖曳;整扇窗保持在可見範圍內(標題列不會被拖到畫面外拿不回來)
    const startDrag = (e: React.MouseEvent) => {
        const r = box.current!.getBoundingClientRect();
        const dx = e.clientX - r.left, dy = e.clientY - r.top;
        const move = (ev: MouseEvent) => {
            const rr = box.current!.getBoundingClientRect();
            setPos({
                x: Math.min(Math.max(0, ev.clientX - dx), Math.max(0, window.innerWidth - rr.width)),
                y: Math.min(Math.max(TITLEBAR_HEIGHT, ev.clientY - dy), Math.max(TITLEBAR_HEIGHT, window.innerHeight - rr.height)),
            });
        };
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    };
    const noDrag = (e: React.MouseEvent) => e.stopPropagation(); // 標題列的按鈕不要觸發拖曳

    if (!p) return null;
    return (
        <div ref={box} data-testid="proposal-review"
             className="fixed z-50 flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl"
             style={{left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden',
                     width: 'min(900px, 92vw)', height: 'min(640px, 85vh)', minWidth: 420, minHeight: 280, resize: 'both',
                     // 作者手動放大後視窗縮窄:尺寸上限跟著可見範圍縮小(上方保留標題欄),頁尾按鈕不會落到畫面外(PR #64 審查)
                     maxWidth: '100vw', maxHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)`}}>
            {/* 標題列(可拖曳) */}
            <div className="flex h-11 shrink-0 cursor-move select-none items-center gap-2 border-b px-3" data-testid="review-titlebar"
                 onMouseDown={startDrag}>
                <FileText className="h-4 w-4 shrink-0 text-primary"/>
                <span className="truncate text-sm font-semibold" data-testid="review-target">{titleOf(p.target)}</span>
                <span className="shrink-0 text-xs text-muted-foreground" data-testid="review-count">第 {idx + 1} / {items.length} 個</span>
                <Tip label="上一個待審提案" side="bottom">
                    <Button variant="ghost" size="iconSm" data-testid="review-prev" className="shrink-0"
                            onMouseDown={noDrag} disabled={idx <= 0} onClick={() => onStep(-1)}><ChevronLeft/></Button>
                </Tip>
                <Tip label="下一個待審提案" side="bottom">
                    <Button variant="ghost" size="iconSm" data-testid="review-next" className="shrink-0"
                            onMouseDown={noDrag} disabled={idx >= items.length - 1} onClick={() => onStep(1)}><ChevronRight/></Button>
                </Tip>
                <span className="ml-auto truncate text-xs text-muted-foreground" data-testid="review-model">{p.model}</span>
                <Tip label="關閉(Esc;提案維持待審)" side="bottom">
                    <Button variant="ghost" size="iconSm" data-testid="review-close" className="shrink-0"
                            onMouseDown={noDrag} onClick={onClose}><X/></Button>
                </Tip>
            </div>

            {/* 內容:原文唯讀、修改後可編輯;視窗窄時上下堆疊 */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="review-body">
                <div className={cn('grid min-h-0 flex-1 gap-2 p-3', stacked ? 'grid-rows-2' : 'grid-cols-2')}>
                    <div className={cn('flex min-h-0 flex-col', !stacked && 'min-w-0')}>
                        <div className="mb-1 shrink-0 text-xs font-semibold text-muted-foreground">原文(唯讀)</div>
                        <div className="diff-del min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded px-2 py-1 font-serif text-[13px]"
                             data-testid="review-original">{p.original}</div>
                    </div>
                    <div className={cn('flex min-h-0 flex-col', !stacked && 'min-w-0')}>
                        <div className="mb-1 shrink-0 text-xs font-semibold text-muted-foreground">修改後{changed ? '(已修改)' : ''}</div>
                        <Textarea className="diff-add min-h-0 flex-1 resize-none rounded-md border border-border bg-transparent font-serif text-[13px] focus-visible:ring-primary"
                                  value={mine} data-testid="review-edit" disabled={conflict}
                                  onChange={e => setEdited(m => ({...m, [p.id]: e.target.value}))}/>
                    </div>
                </div>
                {(p.rationale || p.assumptions?.length > 0 || conflict) && (
                    <div className="shrink-0 space-y-0.5 border-t px-3 py-2 text-xs text-muted-foreground">
                        {p.rationale && <p>理由:{p.rationale}</p>}
                        {p.assumptions?.length > 0 && <p>假設:{p.assumptions.join('；')}</p>}
                        {conflict && <p className="text-warning">這段原文在提案後已被修改,無法套用。</p>}
                    </div>
                )}
            </div>

            {/* 頁尾:還原 AI 版本、拒絕/捨棄、接受 */}
            <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
                {changed && (
                    <button className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground" data-testid="review-reset"
                            onClick={() => setEdited(m => { const n = {...m}; delete n[p.id]; return n; })}>
                        <RotateCcw className="h-3 w-3"/>還原 AI 版本
                    </button>
                )}
                <span className="flex-1"/>
                {changed && <span className="shrink-0 text-xs text-primary">已修改 · 接受時會寫入你的版本</span>}
                <Button size="sm" variant="ghost" onClick={() => onReject(p)} data-testid="review-reject">{conflict ? '捨棄' : '拒絕'}</Button>
                {!conflict && <Button size="sm" onClick={() => onAccept(p)} data-testid="review-accept"><Check/>接受</Button>}
            </div>
        </div>
    );
}