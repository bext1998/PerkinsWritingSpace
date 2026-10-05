import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    BookOpen, CircleCheck, CircleDashed, FileText, History, Home, ListChecks, NotebookPen, PanelLeftClose, PanelRightClose,
    PanelRightOpen, Save, ScrollText, Settings, Share2, Users,
} from 'lucide-react';
import {
    ApplyEntityHeader, BibleIndex, ChapterWordCounts, CloseProject, CopyChapter, GetSettings, GetTree, ParseEntity, ReadFile,
    ResearchOpenFile, SaveFile, SetChapterStatus, WordCount,
} from '../wailsjs/go/main/App';
import {bible, main, project} from '../wailsjs/go/models';
import Editor, {EditorHandle, Selection} from './Editor';
import ChatWindow, {ChatRequest} from './ChatWindow';
import VersionDialog from './VersionDialog';
import SummaryDialog from './SummaryDialog';
import ManuscriptPanel from './panels/ManuscriptPanel';
import BiblePanel from './panels/BiblePanel';
import DocsPanel from './panels/DocsPanel';
import ChecksPanel from './panels/ChecksPanel';
import Inspector from './panels/Inspector';
import EntityHeader from './EntityHeader';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/basic';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Tip,
} from '@/components/ui/overlay';
import {baseName, cn, errText} from '@/lib/utils';
import {Quick} from './quick';
import perkinsLogo from './assets/images/perkins-logo.svg';
import {AreaBoundary, CrashPoint, registerEmergencySave} from '@/components/ErrorBoundary';

type Panel = 'manuscript' | 'bible' | 'docs' | 'checks';

// 開發模式專用:E2E 用 window.__perkinsSaveDelay(ms) 讓 SaveFile 延遲、__perkinsReadDelay(ms)
// 讓 ReadFile 延遲(重疊導覽回歸用);正式建置時 DEV 為 false,此段與延遲檢查都會被刪除
const devSaveDelay = {ms: 0};
const devReadDelay = {ms: 0};

if (import.meta.env.DEV) {
    (window as any).__perkinsSaveDelay = (ms: number) => { devSaveDelay.ms = ms; };
    (window as any).__perkinsReadDelay = (ms: number) => { devReadDelay.ms = ms; };
    (window as any).__perkinsSaveStats = {inFlight: 0, maxInFlight: 0}; // E2E 驗證 SaveFile 不並行
}

// (DEV)SaveFile 包一層並行計數;正式建置時直接呼叫 SaveFile
async function trackedSaveFile(path: string, text: string) {
    if (!import.meta.env.DEV) return SaveFile(path, text);
    const s = (window as any).__perkinsSaveStats;
    s.inFlight++;
    s.maxInFlight = Math.max(s.maxInFlight, s.inFlight);
    try {
        return await SaveFile(path, text);
    } finally {
        s.inFlight--;
    }
}

interface Props {
    tree: project.Tree;
    setTree: (t: project.Tree) => void;
    onClose: () => void;
    onSettings: () => void;
    settingsVersion: number; // 設定頁儲存後遞增,讓對話框重新讀取端點
}

export interface Toast {
    text: string;
    kind?: 'ok' | 'error' | 'info';
}

export default function Workspace({tree, setTree, onClose, onSettings, settingsVersion}: Props) {
    const [current, setCurrent] = useState<string | null>(null);
    const [text, setText] = useState('');
    const [dirty, setDirty] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [panel, setPanel] = useState<Panel | null>('manuscript');
    const [inspector, setInspector] = useState(true);
    const [toast, setToast] = useState<Toast | null>(null);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [liveCount, setLiveCount] = useState(0);
    const [index, setIndex] = useState<bible.Index | null>(null);
    const [cfg, setCfg] = useState<main.SettingsView | null>(null);
    const [versions, setVersions] = useState(false);
    const [summaryFor, setSummaryFor] = useState<string | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatReq, setChatReq] = useState<ChatRequest | null>(null);
    const [selection, setSelection] = useState<Selection | null>(null);
    // 最後一次的非空選取及其來源(§16 第 1 項 02):切章不清除;AI 視窗開啟時由 ChatWindow 判斷是否沿用
    const [lastSel, setLastSel] = useState<{sel: Selection; from: string} | null>(null);
    const [remoteOk, setRemoteOk] = useState<Record<string, boolean>>({});
    const [pending, setPending] = useState(0);
    const [entity, setEntity] = useState<bible.Entity | null>(null);
    const [summaryTick, setSummaryTick] = useState(0);
    const editor = useRef<EditorHandle>(null);
    const loaded = useRef<string | null>(null);

    const notify = useCallback((t: Toast) => setToast(t), []);
    const fail = useCallback((e: unknown) => setToast({text: errText(e), kind: 'error'}), []);

    useEffect(() => {
        if (!toast) return;
        const id = setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 3500);
        return () => clearTimeout(id);
    }, [toast]);

    const refreshTree = useCallback(async () => setTree(await GetTree()), [setTree]);
    const refreshCounts = useCallback(() => ChapterWordCounts().then(setCounts).catch(() => {}), []);
    const refreshIndex = useCallback(() => BibleIndex().then(setIndex).catch(() => {}), []);
    useEffect(() => { refreshCounts(); refreshIndex(); }, [refreshCounts, refreshIndex]);
    useEffect(() => {
        GetSettings().then(setCfg).catch(() => {});
        // 設定頁可能匯入了 Notion 設定或改了作品名稱
        if (settingsVersion > 0) { refreshTree(); refreshIndex(); }
    }, [settingsVersion]);

    // 目前開啟的檔案被移到回收區(或被撤銷匯入)後關閉編輯器,避免存檔時又把它寫回來
    useEffect(() => {
        if (!current) return;
        const all = [...tree.manuscript, ...tree.canon, ...tree.outline, ...tree.notes];
        if (!all.some(e => e.path === current)) {
            loaded.current = null;
            setCurrent(null);
            setText('');
            setDirty(false);
        }
    }, [tree]);

    // 存檔一律讀最新狀態:避免快捷鍵或其他回呼拿到舊的閉包,造成「顯示已儲存卻沒存」
    const latest = useRef({current, text, dirty});
    latest.current = {current, text, dirty};
    // 編輯版本計數:每次 onChange/applyHeader 加 1;存檔完成時版本沒變才清 dirty,
    // 存檔途中繼續打字不會被誤標為已儲存
    const editVersion = useRef(0);
    // 單一序列化寫入迴圈:同時最多一個 SaveFile;重複觸發(Ctrl+S/按鈕/自動存檔)回傳同一個
    // Promise,所有呼叫者等到畫面上的字全部落盤才 resolve,「已儲存」通知自然正確。
    // 迴圈每輪記下當輪的 current+text 配對,切檔後以新的 latest 判斷,不會寫錯檔。
    const saveInFlight = useRef<Promise<void> | null>(null);
    const [saving, setSaving] = useState(false);
    const save = useCallback((): Promise<void> => {
        if (saveInFlight.current) return saveInFlight.current; // 已在存:回傳同一個 Promise
        // 無事可存時不建立 Promise:若此時建立,IIFE 會同步跑完,finally 先清 null、外層又把已結束的
        // Promise 指回 ref,之後每次 save() 都回傳這個過期 Promise,永遠不再寫入(實測踩過)
        if (!(latest.current.current && latest.current.dirty)) return Promise.resolve();
        let run!: Promise<void>; // 閉包 finally 要比對自身;前置檢查保證 IIFE 先在 await 掛起,賦值必在 finally 前
        run = (async () => {
            setSaving(true);
            try {
                while (latest.current.current && latest.current.dirty) {
                    const {current, text} = latest.current;
                    const ver = editVersion.current;
                    if (import.meta.env.DEV && devSaveDelay.ms > 0) await new Promise(r => setTimeout(r, devSaveDelay.ms));
                    await trackedSaveFile(current, text);
                    // 期間又有編輯(版本變了)或已切換檔案時,保留 dirty 讓下一輪存新版本
                    if (latest.current.current === current && editVersion.current === ver) {
                        latest.current = {...latest.current, dirty: false};
                        setDirty(false);
                    }
                    refreshCounts();
                    refreshIndex();
                    if (current.startsWith('manuscript/')) refreshTree(); // 場景標題可能改變
                }
            } finally {
                if (saveInFlight.current === run) saveInFlight.current = null;
                setSaving(false);
            }
        })();
        saveInFlight.current = run;
        return run;
    }, [refreshCounts, refreshIndex, refreshTree]);

    // 緊急存檔:最外層 ErrorBoundary 在 componentDidCatch 時先取救援資料(path+原文)再呼叫 save。
    // 用讀 latest ref 的同一套邏輯,但不依賴卸載後的 setState,只做 SaveFile 本身。
    useEffect(() => {
        registerEmergencySave({
            save: async () => {
                // 若正在存檔,先等它結束,避免較舊的在途寫入晚於緊急存檔落盤而蓋掉最新內容
                if (saveInFlight.current) await saveInFlight.current.catch(() => {});
                const {current, text, dirty} = latest.current;
                if (current && dirty) await SaveFile(current, text);
            },
            rescue: () => {
                const {current, text, dirty} = latest.current;
                return current && dirty ? {path: current, text} : null;
            },
        });
        return () => registerEmergencySave(null);
    }, []);

    // 導覽序號:每個在途 openFile 記下自己的 seq;await 後 seq 已不是最新就直接返回,
    // 不得套用讀檔結果(過期導覽會把作者在等待期間輸入的字替換成舊稿)
    const navSeq = useRef(0);
    const openFile = useCallback(async (rel: string, line?: number) => {
        const seq = ++navSeq.current;
        const stale = () => seq !== navSeq.current;
        try {
            // 重開目前檔案:不重新讀檔,保留編輯器內容(含未存的字),只做定位
            if (rel === latest.current.current) {
                if (line) editor.current?.scrollToLine(line);
                return;
            }
            await save(); // 切換前自動存檔,避免遺失
            if (stale()) return;
            if (import.meta.env.DEV && devReadDelay.ms > 0) await new Promise(r => setTimeout(r, devReadDelay.ms));
            const content = await ReadFile(rel);
            if (stale()) return;
            // ReadFile 等待期間若又有打字(dirty 變 true),先存完才切換,避免丟字
            if (latest.current.dirty) await save();
            if (stale()) return;
            loaded.current = rel;
            setCurrent(rel);
            setText(content);
            setDirty(false);
            setSelection(null);
            setReloadKey(k => k + 1);
            ResearchOpenFile(rel); // 研究記錄(§12.8):open_file 事件,後端只接受專案內既有路徑
            if (line) setTimeout(() => editor.current?.scrollToLine(line), 60);
        } catch (e) { fail(e); }
    }, [save, fail]);

    // 磁碟上的檔案被系統改動(接受提案、還原)後,重新載入編輯器
    const reloadCurrent = useCallback(async (files?: string[]) => {
        if (!current || (files && !files.includes(current))) return;
        setText(await ReadFile(current));
        setDirty(false);
        setReloadKey(k => k + 1);
        refreshCounts();
        refreshIndex();
    }, [current, refreshCounts, refreshIndex]);

    // Ctrl+S 與存檔按鈕共用;saving 由 save 層的 in-flight ref 推導,這裡只轉發結果通知
    const saveNow = useCallback(() => {
        save().then(() => notify({text: '已儲存', kind: 'ok'})).catch(fail);
    }, [save, notify, fail]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveNow();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [saveNow]);

    // 本章字數(與後端同一套計算規則)
    useEffect(() => {
        const id = setTimeout(() => WordCount(text).then(setLiveCount).catch(() => {}), 250);
        return () => clearTimeout(id);
    }, [text]);

    // 設定檔:解析 frontmatter 供表單顯示
    useEffect(() => {
        if (!current?.startsWith('canon/')) { setEntity(null); return; }
        const id = setTimeout(() => ParseEntity(current, text).then(setEntity).catch(() => {}), 200);
        return () => clearTimeout(id);
    }, [current, text]);

    const chapter = current?.startsWith('manuscript/') ? tree.manuscript.find(e => e.path === current) : undefined;
    const volIndex = chapter ? tree.volumes.findIndex(v => v.chapters.some(c => c.path === current)) : -1;
    const volume = volIndex >= 0 ? tree.volumes[volIndex] : undefined;
    const volumeCount = useMemo(() => volume?.chapters.reduce((n, c) => n + (c.path === current ? liveCount : counts[c.path] ?? 0), 0) ?? 0,
        [volume, counts, current, liveCount]);
    const totalCount = useMemo(() => tree.manuscript.reduce((n, c) => n + (c.path === current ? liveCount : counts[c.path] ?? 0), 0),
        [tree, counts, current, liveCount]);

    const activeProfile = cfg?.profiles.find(p => p.id === cfg.active);

    const ask = (req: ChatRequest) => {
        setChatReq({...req, nonce: Date.now()});
        setChatOpen(true);
    };

    const onAskAI = (sel: Selection, quick?: Quick) => {
        ask({selection: sel.text, question: quick?.question, mode: quick?.mode, nonce: 0});
    };

    // AI 圓鈕開啟對話框時讀取編輯器當下的選取(若有)(§16 第 1 項 04)
    const pickSelection = () => {
        const s = editor.current?.selection();
        if (s) setSelection(s);
    };

    const copyTo = async (rel: string, platformID: string, name: string) => {
        try {
            if (rel === current) await save();
            const out = await CopyChapter(rel, platformID);
            const n = await WordCount(out);
            const pl = cfg?.platforms.find(p => p.id === platformID);
            notify({text: `已複製「${baseName(rel)}」為${name}格式(${n} 字)${pl?.verified ? '' : ' · 此平台規則尚未驗證,貼上後請確認版面'}`, kind: 'ok'});
        } catch (e) { fail(e); }
    };

    const setStatus = async (rel: string, status: string) => {
        try {
            await SetChapterStatus(rel, status);
            await refreshTree();
        } catch (e) { fail(e); }
    };

    const applyHeader = async (typ: string, name: string, aliases: string[]) => {
        if (!current) return;
        try {
            const next = await ApplyEntityHeader(latest.current.text, typ, name, aliases);
            editVersion.current++;
            latest.current = {...latest.current, text: next, dirty: true};
            setText(next);
            setDirty(true);
            setReloadKey(k => k + 1);
        } catch (e) { fail(e); }
    };

    const railBtn = (id: Panel, label: string, Icon: typeof BookOpen) => (
        <Tip label={label}>
            <button data-testid={`rail-${id}`}
                    className={cn('relative flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                        panel === id && 'bg-accent text-primary')}
                    onClick={() => setPanel(p => p === id ? null : id)}>
                {panel === id && <span className="absolute -left-[7px] h-6 w-[3px] rounded-r bg-primary"/>}
                <Icon className="h-5 w-5"/>
            </button>
        </Tip>
    );

    const panelProps = {tree, current, counts, index, cfg, openFile, refreshTree, refreshIndex, notify, fail, ask, save};

    const crumbs = chapter
        ? [volume?.title || '未命名卷', chapter.title]
        : current ? [({canon: '設定集', outline: '大綱', notes: '筆記'} as Record<string, string>)[current.split('/')[0]] ?? '', baseName(current)] : [];

    return (
        <div className="flex h-full">
            {/* 圖示列:齒輪固定在左下角 */}
            <nav className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-r bg-rail py-3">
                <img src={perkinsLogo} alt="Perkins WritingSpace" data-testid="rail-logo" className="mb-3 h-9 w-9"/>
                {railBtn('manuscript', '稿件', BookOpen)}
                {railBtn('bible', '設定集', Users)}
                {railBtn('docs', '大綱與筆記', NotebookPen)}
                {railBtn('checks', '檢查', ListChecks)}
                <div className="flex-1"/>
                <Tip label="回到書櫃">
                    <button className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={async () => { try { await save(); CloseProject(); onClose(); } catch (e) { fail(e); } }}>
                        <Home className="h-5 w-5"/>
                    </button>
                </Tip>
                <Tip label="設定">
                    <button data-testid="open-settings"
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={onSettings}>
                        <Settings className="h-5 w-5"/>
                    </button>
                </Tip>
            </nav>

            {/* 可收合的側欄 */}
            {panel && (
                <AreaBoundary area="sidebar" fallbackClassName="w-[272px] shrink-0 justify-center overflow-y-auto border-r bg-sidebar">
                <aside className="flex w-[272px] shrink-0 flex-col border-r bg-sidebar">
                    <div className="flex h-12 items-center justify-between border-b px-4">
                        <span className="truncate font-serif text-[15px] font-semibold" title={tree.name}>{tree.name}</span>
                        <Tip label="收合側欄" side="bottom">
                            <Button variant="ghost" size="iconSm" onClick={() => setPanel(null)}><PanelLeftClose/></Button>
                        </Tip>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {panel === 'manuscript' && <ManuscriptPanel {...panelProps} onCopy={copyTo} onStatus={setStatus} onSummary={setSummaryFor}/>}
                        {panel === 'bible' && <BiblePanel {...panelProps}/>}
                        {panel === 'docs' && <DocsPanel {...panelProps}/>}
                        {panel === 'checks' && <ChecksPanel {...panelProps} chapter={chapter?.path ?? null}/>}
                    </div>
                    {tree.warnings?.length > 0 && (
                        <div className="max-h-24 overflow-y-auto border-t p-2 text-xs text-warning">
                            {tree.warnings.map(w => <p key={w}>{w}</p>)}
                        </div>
                    )}
                </aside>
                <CrashPoint area="sidebar"/>
                </AreaBoundary>
            )}

            {/* 主編輯區 */}
            <main className="flex min-w-0 flex-1 flex-col bg-paper">
                <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                    {current ? (
                        <>
                            <div className="flex min-w-0 items-center gap-1.5 text-sm">
                                {chapter ? <FileText className="h-4 w-4 text-muted-foreground"/> : <ScrollText className="h-4 w-4 text-muted-foreground"/>}
                                {crumbs.map((c, i) => (
                                    <span key={i} className={cn('truncate', i === crumbs.length - 1 ? 'font-medium' : 'text-muted-foreground')}>
                                        {i > 0 && <span className="mx-1.5 text-muted-foreground/60">›</span>}{c}
                                    </span>
                                ))}
                                {dirty && <span className="ml-1 h-2 w-2 rounded-full bg-primary" title="尚未儲存"/>}
                            </div>
                            {chapter && (
                                <button onClick={() => setStatus(chapter.path, chapter.status === 'done' ? 'draft' : 'done')}>
                                    {chapter.status === 'done'
                                        ? <Badge variant="success"><CircleCheck className="h-3 w-3"/>完成</Badge>
                                        : <Badge variant="secondary"><CircleDashed className="h-3 w-3"/>草稿</Badge>}
                                </button>
                            )}
                            <div className="flex-1"/>
                            {chapter && (
                                <>
                                    <Button variant="ghost" size="sm" onClick={() => setSummaryFor(chapter.path)}><ScrollText/>摘要</Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" data-testid="copy-platform"><Share2/>複製到平台</Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>複製本章為…</DropdownMenuLabel>
                                            {cfg?.platforms.map(p => (
                                                <DropdownMenuItem key={p.id} onSelect={() => copyTo(chapter.path, p.id, p.name)}>
                                                    {p.name}{!p.verified && <span className="ml-auto text-xs text-muted-foreground">未驗證</span>}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </>
                            )}
                            {/* 存檔按鈕:章節檔與設定集檔都要有,與 Ctrl+S 同一個處理函式 */}
                            <Button size="sm"
                                    data-testid="save-button"
                                    variant={dirty ? 'default' : 'ghost'}
                                    disabled={saving || !dirty}
                                    onClick={saveNow}
                                    title="儲存(Ctrl+S)">
                                <Save/>{saving ? '儲存中…' : dirty ? '儲存' : '已儲存'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setVersions(true)} data-testid="open-versions"><History/>版本</Button>
                            <Tip label={inspector ? '收合資訊欄' : '展開資訊欄'} side="bottom">
                                <Button variant="ghost" size="iconSm" onClick={() => setInspector(v => !v)}>
                                    {inspector ? <PanelRightClose/> : <PanelRightOpen/>}
                                </Button>
                            </Tip>
                        </>
                    ) : <span className="text-sm text-muted-foreground">{tree.name}</span>}
                </div>
                {current && current.startsWith('canon/') && entity && (
                    <EntityHeader key={current} entity={entity} onApply={applyHeader}/>
                )}
                {current ? (
                    <Editor ref={editor} key={`${current}:${reloadKey}`} initialText={text}
                            onChange={t => { editVersion.current++; latest.current = {...latest.current, text: t, dirty: true}; setText(t); setDirty(true); }}
                            onAskAI={onAskAI} onSelect={sv => {
                                setSelection(sv);
                                // 選取時記回填候選;取消選取(null)時一併清除(review-round4 E1):
                                // 已取消的選取不得在開啟 AI 視窗時復活
                                if (sv && latest.current.current) setLastSel({sel: sv, from: latest.current.current});
                                else if (!sv) setLastSel(null);
                            }}/>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                        <BookOpen className="h-10 w-10 opacity-40"/>
                        <p className="text-sm">從左側選一章開始寫作,或新增章節。</p>
                    </div>
                )}
                {/* 狀態列 */}
                <footer className="flex h-7 shrink-0 items-center gap-4 border-t px-4 text-xs text-muted-foreground">
                    {chapter && <span data-testid="count-chapter">本章 {liveCount.toLocaleString()} 字</span>}
                    {volume && <span>本卷 {volumeCount.toLocaleString()} 字</span>}
                    <span>全書 {totalCount.toLocaleString()} 字</span>
                    {current && !chapter && <span>{liveCount.toLocaleString()} 字</span>}
                    <div className="flex-1"/>
                    {current && <span>{dirty ? '未儲存' : '已儲存'}</span>}
                    {activeProfile && <span>AI:{activeProfile.model || '未選擇模型'}{activeProfile.remote ? '(雲端)' : '(本機)'}</span>}
                </footer>
            </main>

            {inspector && current && (
                <AreaBoundary area="inspector" fallbackClassName="w-[280px] shrink-0 justify-center overflow-y-auto border-l bg-sidebar">
                    <Inspector {...panelProps} chapter={chapter ?? null} onSummary={setSummaryFor}
                               scrollToLine={l => editor.current?.scrollToLine(l)} summaryTick={summaryTick}/>
                    <CrashPoint area="inspector"/>
                </AreaBoundary>
            )}

            {/* chat fallback 為 fixed 小卡片,浮在右下圓鈕附近,不佔版面流 */}
            <AreaBoundary area="chat"
                          fallbackClassName="fixed bottom-16 right-4 z-40 w-64 items-center justify-center rounded-xl border bg-card shadow-2xl">
                <ChatWindow open={chatOpen} setOpen={setChatOpen} request={chatReq} tree={tree} doc={current}
                            docText={text} selection={selection} cfg={cfg} setCfg={setCfg}
                            remoteOk={remoteOk} setRemoteOk={setRemoteOk}
                            beforeAsk={save} onAccepted={t => reloadCurrent([t])} onPending={setPending}
                            pending={pending} notify={notify} onPickSelection={pickSelection}
                            lastSel={lastSel}
                            onClearLastSel={() => setLastSel(null)}/>
                <CrashPoint area="chat"/>
            </AreaBoundary>

            <VersionDialog open={versions} onOpenChange={setVersions} current={current} saveFirst={save}
                           onRestored={files => { reloadCurrent(files); refreshTree(); }}/>

            <SummaryDialog chapter={summaryFor} onClose={() => { setSummaryFor(null); setSummaryTick(t => t + 1); }} cfg={cfg}
                           remoteOk={remoteOk} setRemoteOk={setRemoteOk} saveFirst={save} notify={notify}/>

            {toast && (
                <div data-testid="toast"
                     className={cn('fixed bottom-10 left-1/2 z-[80] max-w-xl -translate-x-1/2 rounded-lg border px-4 py-2.5 text-sm shadow-md',
                         toast.kind === 'error' ? 'border-destructive/50 bg-card text-destructive' : 'bg-card')}>
                    {toast.text}
                </div>
            )}
        </div>
    );
}
