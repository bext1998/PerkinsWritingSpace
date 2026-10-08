import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    BookOpen, CircleCheck, CircleDashed, FileText, History, Home, ListChecks, MoreHorizontal, NotebookPen, PanelRightClose,
    PanelRightOpen, Save, ScrollText, Settings, Share2, Users,
} from 'lucide-react';
import {
    ApplyEntityHeader, BibleIndex, ChapterWordCounts, CloseProject, CopyChapter, DeleteCategory, GetSettings, GetTree, ParseEntity, ReadFile,
    ResearchOpenFile, SaveFile, SetChapterStatus, WordCount,
} from '../wailsjs/go/main/App';
import {bible, main, project} from '../wailsjs/go/models';
import Editor, {EditorHandle, EditorPos, Selection} from './Editor';
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
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tip,
} from '@/components/ui/overlay';
import {baseName, cn, errText} from '@/lib/utils';
import {Quick} from './quick';
import {setShellActions} from '@/lib/shellState';
import {AreaBoundary, CrashPoint, registerEmergencySave} from '@/components/ErrorBoundary';

type Panel = 'manuscript' | 'bible' | 'docs' | 'checks';
const PANEL_LABEL: Record<Panel, string> = {manuscript: '稿件', bible: '設定集', docs: '大綱與筆記', checks: '檢查'};

// 開發模式專用:E2E 用 window.__perkinsSaveDelay(ms) 讓 SaveFile 延遲、__perkinsReadDelay(ms)
// 讓 ReadFile 延遲(重疊導覽回歸用)、__perkinsSaveFailOnce() 讓下一次實際寫入失敗
// (驗證在途存檔失敗不會被吞掉);正式建置時 DEV 為 false,此段與延遲檢查都會被刪除
const devSaveDelay = {ms: 0};
const devReadDelay = {ms: 0};
const devSaveFailOnce = {once: false};

if (import.meta.env.DEV) {
    (window as any).__perkinsSaveDelay = (ms: number) => { devSaveDelay.ms = ms; };
    (window as any).__perkinsReadDelay = (ms: number) => { devReadDelay.ms = ms; };
    (window as any).__perkinsSaveFailOnce = () => { devSaveFailOnce.once = true; };
    (window as any).__perkinsSaveStats = {inFlight: 0, maxInFlight: 0}; // E2E 驗證 SaveFile 不並行
}


// (DEV)SaveFile 包一層並行計數;正式建置時直接呼叫 SaveFile
async function trackedSaveFile(path: string, text: string) {
    if (!import.meta.env.DEV) return SaveFile(path, text);
    const s = (window as any).__perkinsSaveStats;
    s.inFlight++;
    s.maxInFlight = Math.max(s.maxInFlight, s.inFlight);
    try {
        // E2E:模擬一次實際寫入失敗(驗證在途存檔的失敗不會被默默吞掉)
        if (devSaveFailOnce.once) {
            devSaveFailOnce.once = false;
            throw new Error('開發模式模擬寫入失敗');
        }
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
    // 禪模式(SPEC §16 第 6 項):只用 CSS 隱藏周邊(display:none),不卸載——
    // 側欄、資訊欄、Perkins Bot 的狀態(含對話內容)都保留,退出後版面原樣恢復。
    const [zen, setZen] = useState(false);
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
    // 切章位置記憶(§16 第 24 項第一層):檔案路徑 → 上次游標(選取)與捲動位置;
    // 只存在記憶體(本次執行期間),不寫檔。Editor 掛載時讀取還原、編輯/捲動時寫回,
    // 因此外部重載(reloadCurrent、接受提案)重掛後也回到原位置,超出文件長度由 Editor 夾住。
    const posMemo = useRef(new Map<string, EditorPos>());
    if (import.meta.env.DEV) (window as any).__perkinsPosMemo = posMemo; // (DEV)E2E 讀取位置記憶
    // 工具列寬度退化(SPEC §17.1):用 ResizeObserver 量工具列自身寬度(contentRect 不含 px-4 內距),
    // 依寬度把按鈕從「完整文字」→「只剩圖示(保留 title/aria-label)」→「隱藏次要按鈕」三段退化。
    // 588/408 是實測門檻:900×600、側欄+資訊欄都開時主編輯區約 288px(content 256)落最窄段;
    // 1280×800(主編輯區約 668,content 636)回到完整標籤。Tailwind 3.4 未裝 container-queries,不為此加依賴。
    const [tbW, setTbW] = useState(Number.MAX_SAFE_INTEGER);
    const tbRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const el = tbRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => setTbW(entries[0].contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const iconOnly = tbW < 588;
    const tight = tbW < 408;

    // 半螢幕並排(SPEC §16 第 7 項):視窗寬 ≤960px(1920×1080 縮放 100% 的半邊)時,
    // 側欄(272)與資訊欄(280)不得同時佔位——兩者加上圖示列 612px,640 寬同時展開
    // 主編輯區只剩 28px,無法寫作。開一個就自動收另一個;視窗縮窄時若兩個都開著,
    // 收掉資訊欄(側欄是主要導覽,先保住);變寬後不自動重開,不強迫改變作者的選擇。
    // 作者手動開關一律有效:窄時手動開資訊欄會自動收側欄,反之亦然。
    const [vpW, setVpW] = useState(() => window.innerWidth);
    const prevVpW = useRef<number | null>(null);
    useEffect(() => {
        const onResize = () => setVpW(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    useEffect(() => {
        const prev = prevVpW.current;
        prevVpW.current = vpW;
        // 首次 render 就處於窄寬度(prev 為 null)或由寬變窄(prev > 960)時,兩個都開著就收資訊欄
        if (vpW <= 960 && (prev === null || prev > 960) && panel && inspector) setInspector(false);
    }, [vpW]); // 只在視窗寬度變化時跑;panel/inspector 的互斥由下面的開關處理器負責

    const openSidebar = useCallback((id: Panel) => {
        // 不把 setState 包進另一個 setState 的 updater(不保證執行):直接依當下狀態判斷
        if (panel === id) { setPanel(null); return; }
        if (window.innerWidth <= 960) setInspector(false); // 窄時開側欄自動收資訊欄
        setPanel(id);
    }, [panel]);

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

    // 目前開啟的檔案被移到回收區(或被撤銷匯入)後關閉編輯器,避免存檔時又把它寫回來;
    // 位置記憶只留還存在的檔案:刪除後建立同名檔案要從預設位置開始,不能套用已刪文件的位置
    useEffect(() => {
        const all = [...tree.manuscript, ...tree.canon, ...tree.outline, ...tree.notes];
        for (const k of [...posMemo.current.keys()]) if (!all.some(e => e.path === k)) posMemo.current.delete(k);
        if (!current) return;
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

    // 關閉流程要拿到「最新一次 render 的 save」:閉包捕捉的是第一次 render 的版本,
    // refreshCounts/refreshIndex/refreshTree 換掉後 save 會重建,用 ref 才不會存到過期的那份。
    const saveRef = useRef(save);
    saveRef.current = save;

    // 刪除分類(SPEC §12.2 返工#1):由 Workspace 協調——先走序列化存檔迴圈保存未存內容
    // (存檔失敗就中止,不動任何檔案,快照才含作者最新內容),後端完成快照+改歸「其他」後,
    // 若目前開啟的檔案受影響就從磁碟重載(此時無未存內容,不丟字),
    // 避免之後存檔把已被刪除的舊 type 寫回。確認對話框開著時編輯器被擋,無需另加鎖。
    const deleteCategory = useCallback(async (name: string) => {
        await save();
        const affected = await DeleteCategory(name);
        const cur = latest.current.current;
        refreshIndex();
        if (!cur || !affected.includes(cur)) return;
        let content: string;
        try {
            content = await ReadFile(cur);
        } catch (e) {
            // 刪除成功但重讀失敗:關掉目前檔案(回到未選檔狀態),舊 buffer 不得再存回已刪除的
            // type(SPEC §12.2 第二輪);此時沒有未存內容(刪除前已存檔),提示作者重新開啟。
            loaded.current = null;
            setCurrent(null);
            setText('');
            setDirty(false);
            latest.current = {...latest.current, current: null, text: '', dirty: false};
            throw new Error(`「${cur}」已改歸其他,但重新讀取失敗:${errText(e)}。請重新開啟該檔案繼續編輯。`);
        }
        if (latest.current.current !== cur) return; // 期間已切到別的檔案:不套用重讀內容
        loaded.current = cur;
        setText(content);
        latest.current = {...latest.current, text: content, dirty: false};
        setDirty(false);
        editVersion.current++;
        setReloadKey(k => k + 1);
    }, [save, refreshIndex]);

    // 緊急存檔:最外層 ErrorBoundary 在 componentDidCatch 時先取救援資料(path+原文)再呼叫 save。
    // 用讀 latest ref 的同一套邏輯,但不依賴卸載後的 setState,只做 SaveFile 本身。
    // 關閉流程走 saveAll(序列化存檔迴圈):崩潰救援只能單次寫入,關閉時 App 還掛著,要用同一條迴圈。
    useEffect(() => {
        registerEmergencySave({
            save: async () => {
                // 若正在存檔,先等它結束,避免較舊的在途寫入晚於緊急存檔落盤而蓋掉最新內容
                if (saveInFlight.current) await saveInFlight.current.catch(() => {});
                const {current, text, dirty} = latest.current;
                if (current && dirty) await SaveFile(current, text);
            },
            saveAll: () => saveRef.current(),
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
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setZen(z => !z);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [saveNow]);

    // 全域 Ctrl+F / Ctrl+H(§16 第 24 項第一層):編輯器未聚焦時(作品畫面任何地方)按也開啟
    // 搜尋/取代面板並聚焦輸入框。編輯器聚焦時不會走到這裡(cm-content 是 contenteditable,
    // 由 Editor 的 searchKeymap 處理);輸入框、對話框、選單、Radix Select 浮層、Perkins Bot
    // 浮窗、設定頁內不攔截;沒有開檔時不做任何事。
    // 不攔 Shift/Alt 組合(CapsLock 下 Ctrl+Shift+F 的 key 是小寫 f,禪模式的快捷鍵不能被搜尋搶走);
    // 已被處理(defaultPrevented)與 IME 組字中(isComposing/keyCode 229)的按鍵也不攔。
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
            if (e.shiftKey || e.altKey) return;
            if (!(e.ctrlKey || e.metaKey) || (e.key.toLowerCase() !== 'f' && e.key.toLowerCase() !== 'h')) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest?.('input, textarea, select, [contenteditable="true"], [role=dialog], [role=menu], [role=listbox], [data-radix-popper-content-wrapper], [data-testid=chat-window], [data-testid=settings-page]')) return;
            // 焦點可能在 body 或 Select 觸發鈕上(不在覆蓋層元素內):以覆蓋層「開著」為準,開著就不攔截。
            // popper wrapper 是所有 Radix 浮層(含 Tooltip)共用的 portal wrapper,不能單獨拿來擋:
            // Tooltip 只是提示,作者滑鼠停在按鈕上時 Ctrl+F 仍要能開搜尋;Select 選單看 [role=listbox]。
            if (document.querySelector('[data-testid=settings-page], [role=dialog], [role=menu], [role=listbox]')) return;
            if (!latest.current.current) return; // 沒有開檔:不做任何事
            e.preventDefault();
            editor.current?.openSearch(e.key.toLowerCase() === 'h');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const goBookshelf = useCallback(async () => {
        try { await save(); CloseProject(); onClose(); } catch (e) { fail(e); }
    }, [save, onClose, fail]);

    // 標題欄(React 樹外)的應用程式選單與側欄開關(SPEC §17.1)
    useEffect(() => {
        setShellActions({save: saveNow, bookshelf: goBookshelf});
        return () => setShellActions({save: undefined, bookshelf: undefined});
    }, [saveNow, goBookshelf]);
    useEffect(() => {
        setShellActions({zen: {on: zen, toggle: () => setZen(z => !z)}});
    }, [zen]);
    useEffect(() => () => setShellActions({zen: undefined}), []);
    // 展開時回到上次收合前的面板
    const lastPanel = useRef<Panel>('manuscript');
    if (panel) lastPanel.current = panel;
    useEffect(() => {
        setShellActions({sidebar: {open: !!panel, toggle: () => panel ? setPanel(null) : openSidebar(lastPanel.current)}});
    }, [panel, openSidebar]);
    useEffect(() => () => setShellActions({sidebar: undefined}), []);

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
        setZen(false); // 叫出 Perkins Bot 時離開禪模式,否則對話窗被藏起來
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
                    onClick={() => openSidebar(id)}>
                {panel === id && <span className="absolute -left-[7px] h-6 w-[3px] rounded-r bg-primary"/>}
                <Icon className="h-5 w-5"/>
            </button>
        </Tip>
    );

    const panelProps = {tree, current, counts, index, cfg, openFile, refreshTree, refreshIndex, notify, fail, ask, save, deleteCategory};

    const crumbs = chapter
        ? [volume?.title || '未命名卷', chapter.title]
        : current ? [({canon: '設定集', outline: '大綱', notes: '筆記'} as Record<string, string>)[current.split('/')[0]] ?? '', baseName(current)] : [];

    return (
        <div className="flex h-full">
            {/* 圖示列:與標題欄同色連成 L 形外框(SPEC §17.1);齒輪固定在左下角 */}
            <nav data-testid="rail" className={cn('flex w-[60px] shrink-0 flex-col items-center gap-1 bg-rail py-2', zen && 'hidden')}>
                {railBtn('manuscript', '稿件', BookOpen)}
                {railBtn('bible', '設定集', Users)}
                {railBtn('docs', '大綱與筆記', NotebookPen)}
                {railBtn('checks', '檢查', ListChecks)}
                <div className="flex-1"/>
                <Tip label="回到書櫃">
                    <button className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={goBookshelf}>
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

            {/* 內容區嵌在外框內:左上圓角;邊緣用不佔版面的陰影線畫,半螢幕 640 寬的主編輯區寬度不受影響 */}
            <div data-testid="workspace-content" className={cn('flex min-w-0 flex-1 overflow-hidden', !zen && 'rounded-tl-lg shadow-[-1px_-1px_0_hsl(var(--border))]')}>
            {/* 可收合的側欄(開關在標題欄) */}
            <div className={zen ? 'hidden' : 'contents'}>
            {panel && (
                <AreaBoundary area="sidebar" fallbackClassName="w-[272px] shrink-0 justify-center overflow-y-auto border-r bg-sidebar">
                <aside className="flex w-[272px] shrink-0 flex-col border-r bg-sidebar">
                    {/* 作品名稱已在標題欄,這裡標示目前面板 */}
                    <div className="flex h-12 items-center border-b px-4">
                        <span data-testid="sidebar-title" className="truncate font-serif text-[15px] font-semibold">{PANEL_LABEL[panel]}</span>
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
            </div>

            {/* 主編輯區 */}
            <main className="flex min-w-0 flex-1 flex-col bg-paper">
                <div ref={tbRef} data-testid="editor-toolbar" className={cn('flex h-12 shrink-0 items-center gap-2 overflow-hidden border-b px-4', zen && 'hidden')}>
                    {current ? (
                        <>
                            <div data-testid="crumbs" className="flex min-w-0 items-center gap-1.5 overflow-hidden text-sm">
                                {chapter
                                    ? <FileText className={cn('h-4 w-4 shrink-0 text-muted-foreground', tight && 'hidden')}/>
                                    : <ScrollText className={cn('h-4 w-4 shrink-0 text-muted-foreground', tight && 'hidden')}/>} 
                                {crumbs.map((c, i) => (
                                    <span key={i}
                                          className={cn('min-w-0 truncate', i === crumbs.length - 1 ? 'font-medium' : 'text-muted-foreground',
                                              i < crumbs.length - 1 && tight && 'hidden')}>
                                        {i > 0 && !tight && <span className="mx-1.5 text-muted-foreground/60">›</span>}{c}
                                    </span>
                                ))}
                                {dirty && <span className="ml-1 h-2 w-2 shrink-0 rounded-full bg-primary" title="尚未儲存"/>}
                            </div>
                            {chapter && (
                                <button data-testid="status-badge" className="shrink-0" onClick={() => setStatus(chapter.path, chapter.status === 'done' ? 'draft' : 'done')}>
                                    {chapter.status === 'done'
                                        ? <Badge variant="success" className="shrink-0 whitespace-nowrap"><CircleCheck className="h-3 w-3"/>完成</Badge>
                                        : <Badge variant="secondary" className="shrink-0 whitespace-nowrap"><CircleDashed className="h-3 w-3"/>草稿</Badge>}
                                </button>
                            )}
                            <div className="flex-1"/>
                            {chapter && (
                                <>
                                    <Button variant="ghost" size="sm" className={cn('shrink-0', tight && 'hidden')}
                                            aria-label="章節摘要" title="章節摘要"
                                            onClick={() => setSummaryFor(chapter.path)}><ScrollText/>{!iconOnly && '摘要'}</Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" data-testid="copy-platform"
                                                    className={cn('shrink-0', tight && 'hidden')}
                                                    aria-label="複製到平台" title="複製到平台"><Share2/>{!iconOnly && '複製到平台'}</Button>
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
                                    className="shrink-0"
                                    variant={dirty ? 'default' : 'ghost'}
                                    disabled={saving || !dirty}
                                    onClick={saveNow}
                                    title="儲存(Ctrl+S)"
                                    aria-label={saving ? '儲存中…' : dirty ? '儲存' : '已儲存'}>
                                <Save/>{!iconOnly && (saving ? '儲存中…' : dirty ? '儲存' : '已儲存')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setVersions(true)} data-testid="open-versions"
                                    className={cn('shrink-0', tight && 'hidden')}
                                    aria-label="版本" title="版本"><History/>{!iconOnly && '版本'}</Button>
                            {/* 最窄段:次要功能收進「更多」下拉,功能一個都不能少(SPEC §17.1 窄寬度不得讓功能無法觸及) */}
                            {tight && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="iconSm" data-testid="toolbar-more" className="shrink-0"
                                                aria-label="更多操作" title="更多操作">
                                            <MoreHorizontal/>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem disabled={!chapter}
                                            onSelect={() => chapter && setSummaryFor(chapter.path)}>
                                            <ScrollText/>章節摘要
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => setVersions(true)}>
                                            <History/>版本
                                        </DropdownMenuItem>
                                        {chapter && !!cfg?.platforms?.length && (
                                            <>
                                                <DropdownMenuSeparator/>
                                                <DropdownMenuLabel>複製到平台為…</DropdownMenuLabel>
                                                {cfg.platforms.map(p => (
                                                    <DropdownMenuItem key={p.id} onSelect={() => copyTo(chapter.path, p.id, p.name)}>
                                                        {p.name}{!p.verified && <span className="ml-auto text-xs text-muted-foreground">未驗證</span>}
                                                    </DropdownMenuItem>
                                                ))}
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                            <Tip label={inspector ? '收合資訊欄' : '展開資訊欄'} side="bottom">
                                <Button variant="ghost" size="iconSm" data-testid="toggle-inspector" className="shrink-0"
                                        aria-label={inspector ? '收合資訊欄' : '展開資訊欄'}
                                        onClick={() => {
                                            if (!inspector && window.innerWidth <= 960) setPanel(null); // 窄時開資訊欄自動收側欄
                                            setInspector(v => !v);
                                        }}>
                                    {inspector ? <PanelRightClose/> : <PanelRightOpen/>}
                                </Button>
                            </Tip>
                        </>
                    ) : null}
                </div>
                {current && current.startsWith('canon/') && entity && (
                    <div className={zen ? 'hidden' : 'contents'}>
                        <EntityHeader key={current} entity={entity} onApply={applyHeader}/>
                    </div>
                )}
                {current ? (
                    <Editor ref={editor} key={`${current}:${reloadKey}`} initialText={text} posKey={current} posStore={posMemo.current}
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
                {/* 狀態列:不換行、不溢出;最窄段省略「本卷」「全書」,模型名以省略號截斷(SPEC §17.1) */}
                <footer data-testid="statusbar" className="flex h-7 shrink-0 items-center gap-4 overflow-hidden border-t px-4 text-xs text-muted-foreground">
                    {chapter && <span data-testid="count-chapter" className="shrink-0 whitespace-nowrap">本章 {liveCount.toLocaleString()} 字</span>}
                    {volume && !tight && <span className="shrink-0 whitespace-nowrap">本卷 {volumeCount.toLocaleString()} 字</span>}
                    <span className={cn('shrink-0 whitespace-nowrap', tight && 'hidden')}>全書 {totalCount.toLocaleString()} 字</span>
                    {current && !chapter && <span className="shrink-0 whitespace-nowrap">{liveCount.toLocaleString()} 字</span>}
                    <div className="flex-1"/>
                    {current && <span className="shrink-0 whitespace-nowrap">{dirty ? '未儲存' : '已儲存'}</span>}
                    {activeProfile && !zen && <span className="min-w-0 truncate">AI:{activeProfile.model || '未選擇模型'}{activeProfile.remote ? '(雲端)' : '(本機)'}</span>}
                    {zen && (
                        <button data-testid="zen-exit" title="離開禪模式(Ctrl+Shift+F)"
                                className="shrink-0 whitespace-nowrap rounded px-1.5 hover:bg-accent hover:text-foreground"
                                onClick={() => setZen(false)}>
                            離開禪模式
                        </button>
                    )}
                </footer>
            </main>

            {inspector && current && (
                <div className={zen ? 'hidden' : 'contents'}>
                <AreaBoundary area="inspector" fallbackClassName="w-[280px] shrink-0 justify-center overflow-y-auto border-l bg-sidebar">
                    <Inspector {...panelProps} chapter={chapter ?? null} onSummary={setSummaryFor}
                               scrollToLine={l => editor.current?.scrollToLine(l)} summaryTick={summaryTick}/>
                    <CrashPoint area="inspector"/>
                </AreaBoundary>
                </div>
            )}
            </div>

            {/* chat fallback 為 fixed 小卡片,浮在右下圓鈕附近,不佔版面流;禪模式時藏起但不卸載(保留對話) */}
            <div className={zen ? 'hidden' : 'contents'}>
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
            </div>

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
