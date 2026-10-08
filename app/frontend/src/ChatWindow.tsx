import {useEffect, useMemo, useRef, useState} from 'react';
import {
    AlertTriangle, Bot, Check, ChevronDown, Eye, FileText, GripHorizontal, Loader2, MessageCircle, Minus, Paperclip, Plus, RefreshCw,
    RotateCcw, ScrollText, SendHorizontal, Square, SquarePen, TextSelect, X,
} from 'lucide-react';
import {
    AcceptProposal, AskAI, CancelAsk, ListModels, ListProposals, PreviewContext, RejectProposal, ResetChat, SetActiveModel,
    SuggestAttachments,
} from '../wailsjs/go/main/App';
import {EventsOn} from '../wailsjs/runtime/runtime';
import {agent, main, project, proposal} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Badge, Checkbox, Input, Textarea} from '@/components/ui/basic';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Popover, PopoverContent, PopoverTrigger, Select, SelectContent,
    SelectItem, SelectTrigger, SelectValue, Tip,
} from '@/components/ui/overlay';
import {baseName, cn, errText} from '@/lib/utils';
import {TITLEBAR_HEIGHT} from '@/lib/layout';
import {MdLite} from '@/lib/md-lite';
import type {Toast} from './Workspace';

export interface ChatRequest {
    question?: string;
    mode?: 'report';
    selection?: string;
    attach?: string[];
    priorSummaries?: boolean;
    quickId?: string;  // 快速指令 id(§16 第 21 項);從快速指令帶入問題時才有
    nonce: number;
}

interface Props {
    open: boolean;
    setOpen: (o: boolean) => void;
    request: ChatRequest | null;
    tree: project.Tree;
    doc: string | null;
    docText: string;
    selection: unknown;
    cfg: main.SettingsView | null;
    setCfg: (c: main.SettingsView) => void;
    remoteOk: Record<string, boolean>;
    setRemoteOk: (f: (r: Record<string, boolean>) => Record<string, boolean>) => void;
    beforeAsk: () => Promise<void>;          // 送出提問/接受提案前先存檔,讓 AI 與後端看到的與磁碟一致
    onAccepted: (p: proposal.Proposal) => Promise<void>;   // 提案套用後,編輯器需重新載入該檔(並短暫標示改動範圍)
    lockEdits: () => () => void;   // 接受期間(存檔→套用→重載)鎖住編輯器,避免新輸入被重載覆蓋(#56);回傳解鎖函式
    onPending: (n: number) => void;
    pending: number;
    notify: (t: Toast) => void;
    onPickSelection?: () => void; // 開啟對話框前讀取編輯器當下的選取(§16 第 1 項 04)
    lastSel?: {sel: {text: string}; from: string | null} | null; // 最後一次的非空選取與來源(02)
    onClearLastSel?: () => void; // 作者移除選取標籤時取消回填資格(review-1a 第 1 點)
}

interface ChatEvent {
    kind: 'delta' | 'tool' | 'notice';
    text?: string;
    tool?: string;
    args?: string;
    allowed?: boolean;
}

interface Turn {
    role: 'user' | 'assistant' | 'tool' | 'notice';
    text: string;
    meta?: string;
}

const KIND_LABEL: Record<string, string> = {canon: '設定', outline: '大綱', notes: '筆記', manuscript: '章節'};

function Chip({children, onRemove, dashed, onClick, className, title, warning, shrinkText}: {
    children: React.ReactNode; onRemove?: () => void; dashed?: boolean; onClick?: () => void; className?: string; title?: string; warning?: boolean;
    shrinkText?: string; // 有值時:只截短這段文字,children(操作按鈕)放不收縮區域(review-1a 第 2 點)
}) {
    return (
        <span title={title} onClick={onClick}
              className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs',
                  warning ? 'max-w-[22rem]' : 'max-w-[12rem]',
                  warning ? 'border-warning/50 bg-warning/10 text-warning' :
                  dashed ? 'cursor-pointer border-dashed text-muted-foreground hover:border-primary hover:text-primary' : 'bg-secondary',
                  className)}>
            <span className="truncate">{shrinkText ?? children}</span>
            {shrinkText != null && <span className="shrink-0">{children}</span>}
            {onRemove && (
                <button className="shrink-0 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); onRemove(); }}>
                    <X className="h-3 w-3"/>
                </button>
            )}
        </span>
    );
}

export default function ChatWindow(props: Props) {
    const {open, setOpen, request, tree, doc, docText, selection, cfg, setCfg, remoteOk, setRemoteOk, beforeAsk, onAccepted, lockEdits, onPending, pending, notify, onPickSelection, lastSel, onClearLastSel} = props;
    const [turns, setTurns] = useState<Turn[]>([]);
    const [question, setQuestion] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [attach, setAttach] = useState<string[]>([]);
    // 附加來源(§16 第 16 項):作者手動附加(迴紋針/點選)= manual;採用建議附加(點建議標籤、檢查面板帶入)= suggested。
    // 只影響送出預覽的來源標示,不改變送出內容本身。
    const [attachSrc, setAttachSrc] = useState<Record<string, 'manual' | 'suggested'>>({});
    const [withDoc, setWithDoc] = useState(true);
    const [sel, setSel] = useState<string | null>(null);
    // 選取來源(§16 第 1 項 02):記住選取來自哪個檔案;切章後來源≠目前文件時警示,送出預設不附加
    const [selFrom, setSelFrom] = useState<string | null>(null);
    const [keepSel, setKeepSel] = useState(false); // 作者明確點「仍要附加」後為 true
    const [mode, setMode] = useState<'' | 'report'>('');
    const [prior, setPrior] = useState(false);
    const [suggest, setSuggest] = useState<string[]>([]);
    const [proposals, setProposals] = useState<proposal.Proposal[]>([]);
    const [edited, setEdited] = useState<Record<string, string>>({});
    const [preview, setPreview] = useState<agent.Preview | null>(null);
    const [models, setModels] = useState<string[]>([]);
    const [pickQ, setPickQ] = useState('');
    // 快速指令來源(§16 第 21 項):記住本次問題來自哪個快速指令與原始問題文字,
    // 送出時比對是否被改過(quickEdited 只記布林,不記改前全文)
    const [quickId, setQuickId] = useState<string | undefined>();
    const [quickQ, setQuickQ] = useState('');
    const [pos, setPos] = useState<{x: number; y: number} | null>(null);
    const usageSeq = useRef(0); // 用量重算的世代計數(PR #54 返工):過期回應不得覆蓋較新用量
    // 上下文用量(§16 第 16 項):「目前對話若現在送出」佔可用上下文的百分比。
    // 數字與程式判斷一致:直接用後端 PreviewContext 回傳的 tokens 與 limit(= ContextTokens − replyReserve,與 Ask 超預算判斷同一套),
    // 前端不重算公式;limit=0(端點未設定上下文長度)時不顯示。
    const [usage, setUsage] = useState<{tokens: number; limit: number} | null>(null);
    const [usageTick, setUsageTick] = useState(0); // 後端 History 變了但前端狀態沒變時(chat:done、新對話)手動觸發重算
    const bottom = useRef<HTMLDivElement>(null);
    const box = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);

    const profile = cfg?.profiles.find(p => p.id === cfg.active);
    const needsConfirm = !!profile?.remote && !remoteOk[profile.id];
    const isChapter = !!doc?.startsWith('manuscript/');

    const refreshProposals = () => ListProposals().then(list => {
        setProposals(list);
        onPending(list.filter(p => p.status === 'pending' || p.status === 'conflict').length);
    }).catch(() => {});
    useEffect(() => { refreshProposals(); }, []);

    // 外部請求(右鍵詢問、快速指令、檢查面板)
    useEffect(() => {
        if (!request) return;
        if (request.question !== undefined) setQuestion(request.question);
        if (request.quickId) {
            setQuickId(request.quickId);
            setQuickQ(request.question ?? '');
        } else {
            setQuickId(undefined); // 非快速指令來源,不帶快速指令欄位
            setQuickQ('');
        }
        setMode(request.mode ?? '');
        if (request.selection !== undefined) {
            setSel(request.selection);
            setSelFrom(doc); // 帶入選取時記下來源(此時的 doc 就是選取來源)
            setKeepSel(false);
        }
        if (request.attach?.length) {
            setAttach(a => [...new Set([...a, ...request.attach!])]);
            setAttachSrc(m => {
                const n = {...m};
                for (const p of request.attach!) if (!(p in n)) n[p] = 'suggested'; // 檢查面板帶入 = 建議附加;已手動附加的不覆蓋
                return n;
            });
        }
        if (request.priorSummaries) setPrior(true);
        setTimeout(() => input.current?.focus(), 50);
    }, [request?.nonce]);

    // 開發模式專用:E2E/截圖用 window.__perkinsChatInject(turns) 注入對話(不呼叫模型);
    // 正式建置不存在。
    useEffect(() => {
        if (import.meta.env.DEV) {
            (window as any).__perkinsChatInject = (arr: Turn[]) => setTurns(arr);
            (window as any).__perkinsRefreshProposals = () => refreshProposals();
            return () => { delete (window as any).__perkinsChatInject; delete (window as any).__perkinsRefreshProposals; };
        }
    }, []);

    useEffect(() => {
        const offEvent = EventsOn('chat:event', (e: ChatEvent) => {
            if (e.kind === 'delta') {
                setTurns(t => {
                    const last = t[t.length - 1];
                    if (last?.role === 'assistant') return [...t.slice(0, -1), {...last, text: last.text + (e.text ?? '')}];
                    return [...t, {role: 'assistant', text: e.text ?? ''}];
                });
            } else if (e.kind === 'tool') {
                if (e.tool === 'propose_patch') refreshProposals();
                const label = {read_document: '讀取', search_project: '搜尋', propose_patch: '提出修改提案'}[e.tool ?? ''] ?? e.tool;
                let arg = '';
                try { const a = JSON.parse(e.args ?? '{}'); arg = a.path ?? a.query ?? ''; } catch { /* 參數不是 JSON 時不顯示 */ }
                setTurns(t => [...t, {role: 'tool', text: `${e.allowed ? '' : '【已拒絕】'}${label} ${arg}`}]);
            } else if (e.kind === 'notice') {
                setTurns(t => [...t, {role: 'notice', text: e.text ?? ''}]);
            }
        });
        const offDone = EventsOn('chat:done', (d: {reply: string; error?: string}) => {
            setBusy(false);
            refreshProposals();
            setUsageTick(t => t + 1); // 對話(含壓縮後)寫回後端 History,用量要重算
            if (d.error) setError(d.error);
        });
        return () => { offEvent(); offDone(); };
    }, []);

    useEffect(() => { bottom.current?.scrollIntoView({block: 'end'}); }, [turns, proposals.length]);

    // 開啟對話框時,把編輯器當下的選取帶入(§16 第 1 項 04;chat-fab 已透過 onPickSelection 讀取);
    // 選取來自哪個檔案由帶入當下的 doc 記錄。
    useEffect(() => {
        if (!open) return;
        const s = selection as {text?: string} | null;
        if (s?.text) {
            setSel(s.text);
            setSelFrom(doc); // 當下選取來自目前文件
            setKeepSel(false);
        } else if (!sel && lastSel?.sel?.text) {
            // 編輯器當下沒有選取,但之前選過(可能已在別章):帶入並記來源
            setSel(lastSel.sel.text);
            setSelFrom(lastSel.from);
            setKeepSel(false);
        }
        // 只在 open 變化時帶入;之後由使用者清除或右鍵重新帶入
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // 移除選取標籤:同時取消「重開時回填」的資格(review-1a 第 1 點)
    const clearSel = () => {
        setSel(null);
        setSelFrom(null);
        setKeepSel(false);
        onClearLastSel?.();
    };

    // 建議附加:選取段落(沒有選取時為目前章節)中出現的設定實體。只是建議,作者點選才附加。
    useEffect(() => {
        if (!open) return;
        const text = sel ?? (withDoc && isChapter ? docText : '');
        if (!text) { setSuggest([]); return; }
        const id = setTimeout(() => SuggestAttachments(text).then(r => setSuggest(r ?? [])).catch(() => setSuggest([])), 400);
        return () => clearTimeout(id);
    }, [open, sel, docText, withDoc, isChapter]);

    // 上下文用量:開啟浮窗、問題/選取/附加/目前文件/選取附加資格(keepSel)等組成改變時重算
    // (debounce 400ms,同 SuggestAttachments);usageTick 由 chat:done 與「新對話」觸發
    // (後端 History 變了但這些狀態沒變);請求進行中不重算(chat:done 後再算,PR #54 返工)。
    useEffect(() => {
        // 世代計數:較早發出、較晚回來的回應不得覆蓋較新的用量;關閉或忙碌時也先遞增,讓在途的舊回應失效
        const seq = ++usageSeq.current;
        if (!open) { setUsage(null); return; }
        if (busy) return; // 送出後的背景重算不介入執行中的請求;chat:done(busy=false)會再觸發
        const id = setTimeout(() => {
            PreviewContext(params()).then(pv => {
                if (seq !== usageSeq.current) return;
                setUsage(pv.limit > 0 ? {tokens: pv.tokens, limit: pv.limit} : null); // limit=0:端點未設定上下文長度,不顯示
            }).catch(() => { if (seq === usageSeq.current) setUsage(null); }); // 無可用端點等錯誤:不顯示
        }, 400);
        return () => clearTimeout(id);
        // params 由下列狀態組成;cfg/profile 變了(切換模型、上下文長度)也要重算
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, question, sel, attach, withDoc, doc, docText, prior, mode, keepSel, usageTick, busy, cfg?.active, profile?.model, profile?.contextTokens]);

    // 送出的選取:來源不是目前文件時,除非作者明確點「仍要附加」,預設不送出
    const selStale = !!sel && !!selFrom && selFrom !== doc;
    const selSent = sel && !selStale ? sel : sel && keepSel ? sel : null;

    const params = () => new agent.AskParams({
        question,
        doc: withDoc && doc ? doc : '',
        selection: selSent ?? '',
        attachments: attach,
        mode,
        priorSummaries: prior && withDoc && isChapter,
        quickId: quickId ?? '',
        quickEdited: !!quickId && question !== quickQ,
        // 編輯器目前草稿(PR #54 返工):背景用量預覽在未存檔時也以草稿估算;
        // 只有預覽使用,Ask 送出前已存檔(後端會清掉這個欄位)
        docDraft: withDoc && doc ? docText : undefined, // 空字串是作者清空全文,與未提供不同
    });

    const send = async () => {
        if (!question.trim() || busy) return;
        if (needsConfirm) { setError('目前的端點在本機之外:送出前請先勾選確認。'); return; }
        try {
            await beforeAsk();
            await AskAI(params());
            const meta = [
                selSent ? `選取 ${selSent.length} 字${selStale && keepSel ? '(仍要附加)' : ''}` : '',
                attach.length ? `附加 ${attach.length} 個檔案` : '',
                mode === 'report' ? '檢查報告模式' : '',
            ].filter(Boolean).join(' · ');
            setTurns(t => [...t, {role: 'user', text: question, meta}]);
            setQuestion('');
            setQuickId(undefined); // 送出後歸零,下次非快速指令的提問不會被誤記來源
            setQuickQ('');
            setBusy(true);
            setError('');
        } catch (e) { setError(errText(e)); }
    };

    const showPreview = async () => {
        try {
            await beforeAsk();
            setPreview(await PreviewContext(params()));
        } catch (e) { setError(errText(e)); }
    };

    const accept = async (p: proposal.Proposal) => {
        const unlock = lockEdits();
        try {
            await beforeAsk(); // 先存檔:後端以磁碟內容比對,未存的文字也不能在重新載入時遺失
            const mine = edited[p.id];
            const r = await AcceptProposal(p.id, mine !== undefined && mine !== p.replacement ? mine : null as any);
            await onAccepted(r);
            notify({text: r.authorEdited ? '已接受(以你修改後的版本寫入)。可在「版本」還原。' : '已接受提案。可在「版本」還原。', kind: 'ok'});
            setError('');
        } catch (e) { setError(errText(e)); }
        finally { unlock(); }
        refreshProposals();
    };

    const reject = async (p: proposal.Proposal) => {
        try { await RejectProposal(p.id); } catch (e) { setError(errText(e)); }
        refreshProposals();
    };

    const reset = () => {
        ResetChat();
        setTurns([]);
        setError('');
        setMode('');
        setSel(null);
        setAttach([]);
        setAttachSrc({});
        setPrior(false);
        setQuickId(undefined);
        setQuickQ('');
        setUsageTick(t => t + 1); // 後端 History 已清空,重算用量
    };

    const loadModels = async (profileID: string) => {
        try { setModels(await ListModels(profileID)); setError(''); } catch (e) { setModels([]); setError(errText(e)); }
    };

    const switchModel = async (profileID: string, model: string) => {
        try { setCfg(await SetActiveModel(profileID, model)); } catch (e) { setError(errText(e)); }
    };

    // 拖曳視窗:上界是標題欄底緣(不能拖到標題欄底下,否則拖曳列被蓋住就再也拿不回來)
    const startDrag = (e: React.MouseEvent) => {
        const rect = box.current!.getBoundingClientRect();
        const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
        const move = (ev: MouseEvent) => setPos({
            x: Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 120),
            y: Math.min(Math.max(TITLEBAR_HEIGHT, ev.clientY - dy), window.innerHeight - 60),
        });
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    };

    const openProposals = proposals.filter(p => p.status === 'pending' || p.status === 'conflict');

    const pickable = useMemo(() => {
        const groups: {label: string; items: project.Entry[]}[] = [
            {label: '設定集', items: tree.canon},
            {label: '大綱', items: tree.outline},
            {label: '筆記', items: tree.notes},
            {label: '其他章節', items: tree.manuscript.filter(c => c.path !== doc)},
        ];
        return groups.map(g => ({...g, items: g.items.filter(i => !pickQ || i.title.includes(pickQ))})).filter(g => g.items.length);
    }, [tree, doc, pickQ]);

    const toggleAttach = (p: string, src: 'manual' | 'suggested' = 'manual') => {
        const has = attach.includes(p);
        setAttach(a => has ? a.filter(x => x !== p) : [...a, p]);
        setAttachSrc(m => {
            const n = {...m};
            if (has) delete n[p]; else n[p] = src;
            return n;
        });
    };
    const suggested = suggest.filter(s => !attach.includes(s) && s !== doc).slice(0, 6);
    const titleOf = (p: string) => [...tree.canon, ...tree.outline, ...tree.notes, ...tree.manuscript].find(e => e.path === p)?.title ?? baseName(p);

    const style: React.CSSProperties = pos
        ? {left: pos.x, top: pos.y}
        : {right: 20, bottom: 44};

    return (
        <>
            {!open && (
                <button data-testid="chat-fab"
                        className="fixed bottom-11 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105"
                        onClick={() => { onPickSelection?.(); setOpen(true); }} title="Perkins Bot">
                    <MessageCircle className="h-6 w-6"/>
                    {(pending > 0 || busy) && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-white">
                            {busy ? <Loader2 className="h-3 w-3 animate-spin"/> : pending}
                        </span>
                    )}
                </button>
            )}

            <div ref={box} data-testid="chat-window"
                 className={cn('fixed z-40 flex flex-col overflow-hidden rounded-xl border bg-card shadow-lg', !open && 'hidden')}
                 style={{...style, width: 440, height: 620, minWidth: 340, minHeight: 360, maxWidth: '90vw', maxHeight: '90vh', resize: 'both'}}>
                {/* 標題列(可拖曳) */}
                <div className="flex h-11 shrink-0 cursor-move select-none items-center gap-2 border-b px-3" onMouseDown={startDrag}>
                    <Bot className="h-4 w-4 text-primary"/>
                    <span data-testid="chat-title" className="text-sm font-semibold">Perkins Bot</span>
                    {mode === 'report' && <Badge variant="warning" className="text-xs">檢查報告模式</Badge>}
                    {usage && (
                        <Tip label="目前對話若現在送出,佔可用上下文的比例" side="bottom">
                            <span data-testid="context-usage"
                                  className={cn('text-xs', usage.tokens > usage.limit ? 'font-semibold text-warning' : 'text-muted-foreground')}>
                                上下文 {Math.round(usage.tokens / usage.limit * 100)}%
                            </span>
                        </Tip>
                    )}
                    <GripHorizontal className="mx-auto h-4 w-4 text-muted-foreground/40"/>
                    <Tip label="新對話" side="bottom">
                        <Button variant="ghost" size="iconSm" onMouseDown={e => e.stopPropagation()} onClick={reset}><SquarePen/></Button>
                    </Tip>
                    <Tip label="縮小" side="bottom">
                        <Button variant="ghost" size="iconSm" onMouseDown={e => e.stopPropagation()} onClick={() => setOpen(false)}><Minus/></Button>
                    </Tip>
                </div>

                {needsConfirm && profile && (
                    <label className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                        <Checkbox className="mt-0.5 border-warning" checked={false}
                                  onCheckedChange={() => setRemoteOk(r => ({...r, [profile.id]: true}))} data-testid="remote-ok"/>
                        <span>「{profile.name}」不在這台電腦上。你附加的稿件與設定會傳到該服務。我了解(本次啟動有效)。</span>
                    </label>
                )}

                {/* 對話 */}
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" data-testid="turns">
                    {turns.length === 0 && openProposals.length === 0 && (
                        <div className="mt-6 space-y-2 px-2 text-center text-xs leading-relaxed text-muted-foreground">
                            <Bot className="mx-auto h-8 w-8 opacity-40"/>
                            <p>選取文字後按右鍵「詢問 Perkins Bot」或「快速指令」,或直接在下方提問。</p>
                            <p>AI 只能閱讀你附加的內容並提出建議;任何修改都要你接受才會寫入。</p>
                        </div>
                    )}
                    {turns.map((t, i) => (
                        <div key={i} className={cn('my-2', t.role === 'user' && 'flex flex-col items-end')}>
                            {t.role === 'user' && (
                                <>
                                    <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-primary/15 px-3 py-2 text-sm">{t.text}</div>
                                    {t.meta && <span className="mt-0.5 text-xs text-muted-foreground">{t.meta}</span>}
                                </>
                            )}
                            {/* assistant 回覆:不以整塊背景包框,以留白與分隔線建立層級(review-1b 第 3 點) */}
                            {t.role === 'assistant' && (
                                <div className="border-l-2 border-border py-1 pl-3 text-sm leading-relaxed" data-testid="assistant-turn">
                                    <MdLite text={t.text}/>
                                </div>
                            )}
                            {t.role === 'tool' && <div className="px-1 text-xs text-muted-foreground">· {t.text}</div>}
                            {t.role === 'notice' && (
                                <div className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning" data-testid="notice">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{t.text}
                                </div>
                            )}
                        </div>
                    ))}
                    {busy && <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin"/>思考中…</div>}

                    {openProposals.length > 0 && (
                        <div className="mt-3 space-y-2" data-testid="proposals">
                            <div className="text-xs font-semibold text-muted-foreground">待審提案({openProposals.length})</div>
                            {openProposals.map(p => {
                                const mine = edited[p.id] ?? p.replacement;
                                const changed = mine !== p.replacement;
                                return (
                                    <div key={p.id} data-testid="proposal"
                                         className={cn('border-t border-border pt-2 text-sm', p.status === 'conflict' && 'border-warning')}>
                                        <div className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                                            <FileText className="h-3 w-3"/>{titleOf(p.target)}
                                            <span className="ml-auto">{p.model}</span>
                                        </div>
                                        <div className="diff-del whitespace-pre-wrap rounded px-2 py-1 font-serif text-[13px]">{p.original}</div>
                                        <Textarea className="diff-add mt-1 min-h-[3.5rem] resize-y rounded-md border border-border bg-transparent font-serif text-[13px] focus-visible:ring-primary"
                                                  value={mine} data-testid="proposal-edit"
                                                  disabled={p.status === 'conflict'}
                                                  onChange={e => setEdited(m => ({...m, [p.id]: e.target.value}))}/>
                                        {changed && (
                                            <div className="mt-1 flex items-center gap-2 text-xs text-primary">
                                                已修改 · 接受時會寫入你的版本
                                                <button className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                                                        onClick={() => setEdited(m => { const n = {...m}; delete n[p.id]; return n; })}>
                                                    <RotateCcw className="h-3 w-3"/>還原 AI 版本
                                                </button>
                                            </div>
                                        )}
                                        {p.rationale && <p className="mt-1.5 text-xs text-muted-foreground">理由:{p.rationale}</p>}
                                        {p.assumptions?.length > 0 && <p className="text-xs text-muted-foreground">假設:{p.assumptions.join('；')}</p>}
                                        {p.status === 'conflict' && <p className="mt-1 text-xs text-warning">這段原文在提案後已被修改,無法套用。</p>}
                                        <div className="mt-2 flex justify-end gap-1.5">
                                            <Button size="sm" variant="ghost" className="h-7" onClick={() => reject(p)}>
                                                {p.status === 'conflict' ? '捨棄' : '拒絕'}
                                            </Button>
                                            {p.status !== 'conflict' && (
                                                <Button size="sm" className="h-7" onClick={() => accept(p)} data-testid="accept"><Check/>接受</Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div ref={bottom}/>
                </div>

                {/* 輸入區 */}
                <div className="shrink-0 border-t p-2.5">
                    <div className="mb-1.5 flex flex-wrap gap-1" data-testid="chips">
                        {doc && (withDoc
                            ? <Chip onRemove={() => setWithDoc(false)} title={doc}><FileText className="mr-0.5 inline h-3 w-3"/>目前:{baseName(doc)}</Chip>
                            : <Chip dashed onClick={() => setWithDoc(true)}><Plus className="inline h-3 w-3"/>目前文件</Chip>)}
                        {sel && (selStale ? (
                            // 來源不是目前文件:警示色 + 來源名 + 移除;預設不送出,點「仍要附加」才送
                            // Chip 內文只截短來源段;「仍要附加」與移除在不收縮的區域(review-1a 第 2 點)
                            <Chip warning onRemove={() => { clearSel(); }}
                                  title={`這段選取來自「${titleOf(selFrom!)}」,不是目前開啟的檔案;送出時預設不附加`}
                                  shrinkText={`選取 ${sel.length} 字(來自〈${titleOf(selFrom!)}〉)`}>
                                {keepSel
                                    ? <span className="shrink-0 text-warning">仍要附加</span>
                                    : <button className="shrink-0 underline underline-offset-2 hover:text-foreground" data-testid="keep-sel"
                                              onMouseDown={e => e.stopPropagation()}
                                              onClick={e => { e.stopPropagation(); setKeepSel(true); }}>仍要附加</button>}
                            </Chip>
                        ) : <Chip onRemove={() => clearSel()}><TextSelect className="mr-0.5 inline h-3 w-3"/>選取 {sel.length} 字</Chip>)}
                        {isChapter && withDoc && (prior
                            ? <Chip onRemove={() => setPrior(false)}><ScrollText className="mr-0.5 inline h-3 w-3"/>前情摘要</Chip>
                            : <Chip dashed onClick={() => setPrior(true)}><Plus className="inline h-3 w-3"/>前情摘要</Chip>)}
                        {attach.map(a => (
                            <Chip key={a} onRemove={() => toggleAttach(a)} title={a}>
                                <span className="text-muted-foreground">{KIND_LABEL[a.split('/')[0]]}·</span>{titleOf(a)}
                            </Chip>
                        ))}
                        {mode === 'report' && <Chip onRemove={() => setMode('')} className="border-warning/40 text-warning">檢查報告</Chip>}
                        {suggested.map(s => (
                            <Chip key={s} dashed onClick={() => toggleAttach(s, 'suggested')} title="稿件中出現了這個設定,點選附加">
                                <Plus className="inline h-3 w-3"/>{titleOf(s)}
                            </Chip>
                        ))}
                    </div>
                    <Textarea ref={input} value={question} data-testid="question"
                              placeholder={mode === 'report' ? '要檢查什麼?(Ctrl+Enter 送出)' : '問問看…(Ctrl+Enter 送出)'}
                              className="max-h-40 min-h-[4.5rem] resize-none text-sm"
                              onChange={e => setQuestion(e.target.value)}
                              onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') send(); }}/>
                    <div className="mt-1.5 flex items-center gap-1">
                        <Popover onOpenChange={o => o && setPickQ('')}>
                            <Tip label="附加檔案" side="top">
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="iconSm" data-testid="attach-btn"><Paperclip/></Button>
                                </PopoverTrigger>
                            </Tip>
                            <PopoverContent side="top" align="start" className="w-72 p-2">
                                <Input autoFocus className="mb-2 h-8 text-sm" placeholder="搜尋檔案" value={pickQ} onChange={e => setPickQ(e.target.value)}/>
                                <div className="max-h-72 overflow-y-auto">
                                    {pickable.length === 0 && <p className="p-2 text-xs text-muted-foreground">沒有可附加的檔案。</p>}
                                    {pickable.map(g => (
                                        <div key={g.label} className="mb-2">
                                            <div className="px-1 text-xs font-semibold text-muted-foreground">{g.label}</div>
                                            {g.items.map(i => (
                                                <label key={i.path} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent">
                                                    <Checkbox checked={attach.includes(i.path)} onCheckedChange={() => toggleAttach(i.path)}/>
                                                    <span className="truncate">{i.title}</span>
                                                </label>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        <Popover onOpenChange={o => o && profile && loadModels(profile.id)}>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 max-w-[11rem] px-2 text-xs text-muted-foreground" data-testid="model-btn">
                                    <span className="truncate">{profile?.model || '選擇模型'}</span><ChevronDown className="!size-3"/>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent side="top" align="start" className="w-80 space-y-2">
                                <div className="text-xs font-semibold text-muted-foreground">端點</div>
                                <Select value={cfg?.active} onValueChange={id => { switchModel(id, cfg?.profiles.find(p => p.id === id)?.model ?? ''); loadModels(id); }}>
                                    <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {cfg?.profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.remote ? '(雲端)' : '(本機)'}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                                    模型
                                    <button className="flex items-center gap-1 font-normal hover:text-foreground" onClick={() => profile && loadModels(profile.id)}>
                                        <RefreshCw className="h-3 w-3"/>重新載入
                                    </button>
                                </div>
                                <div className="max-h-52 overflow-y-auto rounded-md border">
                                    {models.length === 0 && <p className="p-2 text-xs text-muted-foreground">無法取得模型清單。請確認端點已啟動,或到設定頁手動輸入。</p>}
                                    {models.map(m => (
                                        <button key={m} className={cn('flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent', m === profile?.model && 'text-primary')}
                                                onClick={() => profile && switchModel(profile.id, m)}>
                                            <Check className={cn('h-3.5 w-3.5', m !== profile?.model && 'invisible')}/>
                                            <span className="truncate">{m}</span>
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        <div className="flex-1"/>
                        {/* 送出內容預覽(§16 第 1 項 07):可見文字按鈕,不用眼睛圖示 */}
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={showPreview}
                                data-testid="preview-btn"><Eye/>送出內容</Button>
                        {busy
                            ? <Button size="sm" variant="secondary" className="h-8" onClick={() => CancelAsk()}><Square className="!size-3"/>停止</Button>
                            : <Button size="sm" className="h-8" onClick={send} disabled={!question.trim()} data-testid="send"><SendHorizontal/>送出</Button>}
                    </div>
                    {error && <p className="mt-1.5 text-xs text-destructive" data-testid="chat-error">{error}</p>}
                </div>
            </div>

            <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
                <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
                    <DialogHeader>
                        <DialogTitle>送出內容</DialogTitle>
                        <DialogDescription>
                            估計約 {preview?.tokens.toLocaleString()} tokens{preview?.budget ? `,模型上限 ${preview.budget.toLocaleString()}` : ''}。
                            端點:{profile ? (profile.remote ? '雲端(內容會離開這台電腦)' : '本機') : '未選擇'}。
                        </DialogDescription>
                    </DialogHeader>
                    {preview?.over && (
                        <p className="rounded-md bg-warning/10 p-2 text-xs text-warning" data-testid="preview-over">
                            超過模型可用的上下文。送出時會先濃縮較早的對話;如果仍然太長會拒絕送出,請減少附加的檔案。
                        </p>
                    )}
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto" data-testid="preview">
                        {/* 兩區分列(§16 第 1 項 07):本次直接送出 vs AI 工具可讀取範圍 */}
                        <div className="rounded-md border" data-testid="preview-direct">
                            <div className="border-b bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">本次直接送出</div>
                            <div className="space-y-1 p-2 text-xs">
                                {withDoc && doc && <p>· 目前文件:{titleOf(doc)}(全文)</p>}
                                {selSent && <p>· 選取 {selSent.length} 字{selStale && keepSel ? `(來自〈${titleOf(selFrom!)}〉,你選擇仍要附加)` : ''}:{selSent.length <= 40 ? selSent : selSent.slice(0, 40) + '…'}</p>}
                                {!withDoc && <p className="text-muted-foreground">· 目前文件:未附加</p>}
                                {!selSent && sel && <p className="text-warning">· 選取:未附加(來自〈{titleOf(selFrom!)}〉,與目前文件不同)</p>}
                                {attach.map(a => <p key={a}>· 附加設定/檔案:{titleOf(a)}(全文,{attachSrc[a] === 'suggested' ? '採用建議附加' : '手動附加'})</p>)}
                                {prior && withDoc && isChapter && <p>· 前情摘要:本章之前的章節摘要</p>}
                                <p>· 你的問題:{question || '(尚未輸入)'}</p>
                                {mode === 'report' && <p>· 檢查報告模式:本次不含提案工具</p>}
                            </div>
                        </div>
                        <div className="rounded-md border" data-testid="preview-tools">
                            <div className="border-b bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">AI 工具可讀取範圍(唯讀,不會自動送出)</div>
                            <div className="p-2 text-xs text-muted-foreground">
                                · manuscript/ 全部章節、summaries/ 已確認的章節摘要(唯讀)
                                · canon/、outline/、notes/:只有你本次送出的目前文件或明確點選附加的檔案
                            </div>
                        </div>
                        {/* 完整原始訊息放在可展開區 */}
                        <details className="rounded-md border">
                            <summary className="cursor-pointer px-2 py-1 text-xs font-semibold text-muted-foreground">原始訊息(完整)</summary>
                            {/* 內層不再包框:以分隔線與留白分層(設計審查 15) */}
                            <div className="p-2 pt-0">
                                {preview?.messages.map((m, i) => {
                                    const msgs = preview.messages;
                                    // 來源標籤(§16 第 16 項):依訊息本身判斷,不改訊息內容。
                                    // role=tool 的工具名稱從前一則 assistant 的 toolCalls 以 toolCallId 對回來(訊息本身不帶工具名)。
                                    const toolName = m.role === 'tool' && i > 0
                                        ? msgs[i - 1].toolCalls?.find(tc => tc.id === m.toolCallId)?.name
                                        : undefined;
                                    const src = m.role === 'system' ? '系統指示'
                                        : m.role === 'tool' ? 'Agent 工具讀取或搜尋結果'
                                        : m.role === 'assistant' ? '先前對話(AI)'
                                        : m.content.startsWith('【較早對話的摘要】') ? '較早對話的摘要'
                                        : i === msgs.length - 1 ? '本次提問'
                                        : '先前對話(使用者)';
                                    return (
                                        <div key={i} className={cn('py-2', i > 0 && 'border-t border-border/60')}>
                                            <div className="text-xs font-semibold text-muted-foreground" data-testid="preview-msg-src">
                                                {src}{toolName ? `(${toolName})` : ''}
                                            </div>
                                            <pre className="whitespace-pre-wrap pt-1 font-sans text-xs leading-relaxed">{m.content}</pre>
                                        </div>
                                    );
                                })}
                            </div>
                        </details>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
