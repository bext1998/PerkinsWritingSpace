import {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {Compartment, EditorSelection, EditorState, StateEffect, StateField} from '@codemirror/state';
import {Command, Decoration, DecorationSet, EditorView, keymap, drawSelection, Panel, ViewUpdate} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {search, searchKeymap, openSearchPanel, closeSearchPanel, setSearchQuery, SearchQuery,
        getSearchQuery, findNext, findPrevious, replaceNext, replaceAll} from '@codemirror/search';
import {markdown} from '@codemirror/lang-markdown';
import {yamlFrontmatter} from '@codemirror/lang-yaml';
import {syntaxHighlighting, HighlightStyle} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {Bot, ChevronRight, ClipboardPaste, Copy, Scissors, TextSelect} from 'lucide-react';
import {QUICK_ACTIONS, Quick} from './quick';

export interface Selection {
    text: string;
    from: number;
    to: number;
}

export interface EditorHandle {
    scrollToLine: (line: number) => void;
    selection: () => Selection | null;
    focus: () => void;
    // 開啟搜尋面板;replace=true 時展開並聚焦「取代為」欄(全域 Ctrl+F/Ctrl+H 用,§16 第 24 項第一層)
    openSearch: (replace?: boolean) => void;
}

// 唯讀(#56):readOnly 只擋作者直接輸入;changeFilter 連程式送出的修改(右鍵剪下/貼上)一起擋下
const lockExt = (on: boolean) => on ? [EditorState.readOnly.of(true), EditorState.changeFilter.of(() => false)] : [];

// AI 改動標示(#45 a):只是暫時的裝飾,不改文件內容;數秒後移除,查歷史到「版本」
const AI_FLASH_MS = 3000;
const setAiFlash = StateEffect.define<{from: number; to: number} | null>();
const aiFlashMark = Decoration.mark({class: 'cm-ai-flash'});
const aiFlashField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
        deco = deco.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(setAiFlash)) deco = e.value ? Decoration.set([aiFlashMark.range(e.value.from, e.value.to)]) : Decoration.none;
        }
        return deco;
    },
    provide: f => EditorView.decorations.from(f),
});

// 游標與捲動位置(§16 第 24 項第一層:切章後回到上次位置;只存記憶體,不寫檔)
export interface EditorPos {
    anchor: number;
    head: number;
    scrollTop: number;
}

interface Props {
    initialText: string;
    onChange: (text: string) => void;
    onAskAI: (sel: Selection, quick?: Quick) => void;
    onSelect?: (sel: Selection | null) => void;
    // 位置記憶:posKey 是檔案路徑(與元件 key 同步,一個實例只屬於一個檔案);
    // posStore 由父層持有,掛載時讀取還原、編輯/捲動時持續寫回
    posKey?: string | null;
    posStore?: Map<string, EditorPos>;
    // 接受提案後重掛時短暫標示的範圍(#45 a);只在掛載時讀取
    flash?: {from: number; to: number} | null;
    // 唯讀(接受提案、版本還原期間,#56):可捲動、選取,不能修改;程式直接送出的修改(右鍵剪下/貼上)也擋下
    readOnly?: boolean;
}

const theme = EditorView.theme({
    '&': {height: '100%', color: 'hsl(var(--foreground))', backgroundColor: 'transparent'},
    '&.cm-focused': {outline: 'none'},
    // 優先權需不低於 CodeMirror 內建 &dark.cm-focused > .cm-scroller > .cm-selectionLayer 規則,否則選取色會被蓋掉
    '& > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {backgroundColor: 'hsl(var(--selection) / .28)'},
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {backgroundColor: 'hsl(var(--selection) / .42)'},
});

// 搜尋面板介面中文化(§16 第 24 項第一層)。placeholder 的單一 $ 代表第一個參數。
const phrases = EditorState.phrases.of({
    'Find': '搜尋',
    'Replace': '取代為',
    'next': '下一個',
    'previous': '上一個',
    'all': '全選',
    'match case': '區分大小寫',
    'regexp': '正規',
    'by word': '整詞',
    'replace': '取代',
    'replace all': '全部取代',
    'close': '關閉',
    'current match': '目前比對',
    'replaced $ matches': '已取代 $ 處',
    'replaced match on line $': '已取代第 $ 行的比對',
    'on line': '於第',
    'Go to line': '跳到行',
    'go': '前往',
});

// 自訂搜尋/取代面板(§16 第 24 項第一層,返工版):安靜精簡的兩列介面。
// 搜尋列:輸入框、上一個/下一個(圖示鈕)、比對數(目前第幾個/共幾個)、取代開關、關閉。
// 取代列只在按 Ctrl+H 或點「取代」時展開:取代輸入框、取代、全部取代。
// 不做區分大小寫/正規/整詞(整詞對中文無意義,其餘非小說作者常用);取代走一般編輯流程(onChange → dirty → 存檔)。

let activeSearchPanel: PerkinsSearchPanel | null = null;

const MAX_MATCHES = 10000;
const CHEVRON_UP = '<path d="m18 15-6-6-6 6"/>';
const CHEVRON_DOWN = '<path d="m6 9 6 6 6-6"/>';
const X_ICON = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';

const h = (tag: string, attrs: Record<string, unknown>, ...children: (Node | string)[]): HTMLElement => {
    const el = document.createElement(tag);
    for (const k in attrs) {
        const v = attrs[k];
        if (v == null) continue;
        if (k === 'class' || k.includes('-')) el.setAttribute(k, String(v));
        else (el as unknown as Record<string, unknown>)[k] = v;
    }
    for (const c of children) el.append(c);
    return el;
};

const searchBtn = (name: string, label: string, onClick: () => void, svg?: string): HTMLButtonElement => {
    const b = h('button', {
        type: 'button', name, title: label, 'aria-label': label, class: 'perkins-search-btn',
        onclick: onClick,
        onmousedown: (e: Event) => e.preventDefault(), // 不攝走輸入框焦點
    }) as HTMLButtonElement;
    if (svg) b.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg}</svg>`;
    else b.textContent = label;
    return b;
};

class PerkinsSearchPanel implements Panel {
    dom: HTMLElement;
    searchInput: HTMLInputElement;
    replaceInput: HTMLInputElement;
    countEl: HTMLElement;
    replaceRow: HTMLElement;
    toggleBtn: HTMLButtonElement;
    query: SearchQuery;
    replaceOpen = false;
    composing = false;

    constructor(private view: EditorView) {
        this.query = getSearchQuery(view.state);
        const mkInput = (name: string, label: string) => {
            const el = h('input', {
                class: 'perkins-search-input', name, placeholder: label, 'aria-label': label,
                value: name === 'search' ? this.query.search : this.query.replace,
                spellcheck: false, 'main-field': name === 'search' ? 'true' : null,
            }) as HTMLInputElement;
            // 組字/輸入事件用 addEventListener:composition 事件在某些環境(如 CDP 模擬輸入)不會觸發 on* 屬性 handler
            el.addEventListener('input', e => {
                // 組字中途不提交:組字旗標 + 事件的 isComposing(雙重防護)
                if (this.composing || (e as InputEvent).isComposing) return;
                this.commit();
            });
            el.addEventListener('compositionstart', () => { this.composing = true; });
            el.addEventListener('compositionend', () => { this.composing = false; this.commit(); });
            return el;
        };
        this.searchInput = mkInput('search', '搜尋');
        this.replaceInput = mkInput('replace', '取代為');
        this.countEl = h('span', {class: 'perkins-search-count', 'aria-live': 'polite'});
        this.toggleBtn = searchBtn('toggle-replace', '取代', () => this.toggleReplace(!this.replaceOpen));
        this.toggleBtn.setAttribute('aria-expanded', 'false');
        const row1 = h('div', {class: 'perkins-search-row'},
            this.searchInput,
            searchBtn('prev', '上一個', () => findPrevious(this.view), CHEVRON_UP),
            searchBtn('next', '下一個', () => findNext(this.view), CHEVRON_DOWN),
            this.countEl,
            this.toggleBtn,
            searchBtn('close', '關閉搜尋', () => closeSearchPanel(this.view), X_ICON),
        );
        this.replaceRow = h('div', {class: 'perkins-search-row perkins-replace-row'},
            this.replaceInput,
            searchBtn('replace', '取代', () => replaceNext(this.view)),
            searchBtn('replaceAll', '全部取代', () => replaceAll(this.view)),
        );
        this.replaceRow.style.display = 'none';
        this.dom = h('div', {
            class: 'perkins-search', role: 'search',
            onkeydown: (e: KeyboardEvent) => this.keydown(e),
        }, row1, this.replaceRow);
        this.updateCount();
    }

    toggleReplace(open: boolean, focus = true) {
        this.replaceOpen = open;
        this.replaceRow.style.display = open ? 'flex' : 'none';
        this.toggleBtn.setAttribute('aria-expanded', String(open));
        if (focus) (open ? this.replaceInput : this.searchInput).focus();
    }

    commit() {
        const q = new SearchQuery({search: this.searchInput.value, replace: this.replaceInput.value});
        if (!q.eq(this.query)) {
            this.query = q;
            this.view.dispatch({effects: setSearchQuery.of(q)});
        }
        this.updateCount();
    }

    // 目前第幾個/比對總數:用公開的 SearchQuery.getCursor 掃全文(章節長度下夠快)
    updateCount() {
        const selFrom = this.view.state.selection.main.from;
        let total = 0, current = 0;
        if (this.query.valid) {
            const cursor = this.query.getCursor(this.view.state);
            for (;;) {
                const step = cursor.next();
                if (step.done) break;
                total++;
                if (total > MAX_MATCHES) { total = MAX_MATCHES; break; }
                if (!current && step.value.from >= selFrom) current = total;
            }
        }
        const cur = current || total;
        this.countEl.textContent = total ? `${cur}/${total}` : '0';
        this.countEl.title = total ? `比對:第 ${cur} 個,共 ${total} 個` : '沒有比對';
    }

    keydown(e: KeyboardEvent) {
        // 組字中的按鍵不觸發面板動作(搜尋跳下一筆/誤取代/關閉):
        // 事件的 isComposing、組字旗標、keyCode 229(IME 轉送邊界)三種都要擋;
        // 直接 return 不 preventDefault,正常 IME 輸入不受影響
        if (e.isComposing || this.composing || e.keyCode === 229) return;
        const target = e.target as HTMLElement;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeSearchPanel(this.view);
        } else if (e.key === 'Enter' && target === this.searchInput) {
            e.preventDefault();
            (e.shiftKey ? findPrevious : findNext)(this.view);
        } else if (e.key === 'Enter' && target === this.replaceInput) {
            e.preventDefault();
            replaceNext(this.view);
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            this.toggleReplace(!this.replaceOpen);
        }
    }

    // 面板顯示要與實際 query 同步:openSearchPanel 等內建流程會用 setSearchQuery effect 帶入新條件
    // (例如以編輯器選取字當搜尋字、取代清空);不同步會顯示舊條件,實際取代卻用新條件,作者會改錯
    update(u: ViewUpdate) {
        for (const tr of u.transactions) for (const effect of tr.effects)
            if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) this.setQuery(effect.value);
        if (u.docChanged || u.selectionSet) this.updateCount();
    }

    setQuery(query: SearchQuery) {
        this.query = query;
        this.searchInput.value = query.search;
        this.replaceInput.value = query.replace;
        this.updateCount();
    }

    mount() {
        this.searchInput.select();
    }

    destroy() {
        if (activeSearchPanel === this) activeSearchPanel = null;
    }

    get top() { return true; }
}

// 搜尋/取代面板樣式:安靜、小巧,用既有主題 token;640 寬時搜尋列一排、展開取代最多兩排,不出水平捲軸
const searchTheme = EditorView.theme({
    '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--popover))',
        color: 'hsl(var(--popover-foreground))',
        zIndex: '15',
    },
    '.perkins-search': {
        padding: '0.25rem 0.4rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        fontFamily: 'inherit',
    },
    '.perkins-search .perkins-search-row': {
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        minWidth: 0,
        whiteSpace: 'nowrap',
    },
    '.perkins-search input.perkins-search-input': {
        flex: '1 1 3.5rem',
        minWidth: '3.5rem',
        maxWidth: '15rem',
        boxSizing: 'border-box',
        padding: '0.1rem 0.35rem',
        fontSize: '13px',
        border: '1px solid hsl(var(--input))',
        borderRadius: '0.3rem',
        backgroundColor: 'hsl(var(--background))',
        color: 'inherit',
        outline: 'none',
        '&:focus': {borderColor: 'hsl(var(--ring))'},
    },
    '.perkins-search button.perkins-search-btn': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.15rem',
        flexShrink: 0,
        padding: '0.1rem 0.35rem',
        fontSize: '12px',
        lineHeight: '1.3',
        border: 'none',
        borderRadius: '0.3rem',
        backgroundImage: 'none',
        backgroundColor: 'transparent',
        color: 'hsl(var(--muted-foreground))',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        '&:hover': {backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))'},
    },
    '.perkins-search button[name=toggle-replace]': {
        backgroundColor: 'hsl(var(--secondary))',
        color: 'hsl(var(--secondary-foreground))',
    },
    '.perkins-search .perkins-search-count': {
        flexShrink: 0,
        minWidth: '1.5rem',
        padding: '0 0.1rem',
        fontSize: '11.5px',
        textAlign: 'center',
        color: 'hsl(var(--muted-foreground))',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
    },
    // 比對標示:沿用主題 selection token,替代 CodeMirror 內建的黃/藍底
    '.cm-searchMatch': {backgroundColor: 'hsl(var(--selection) / .30)'},
    '.cm-searchMatch-selected': {backgroundColor: 'hsl(var(--selection) / .55)'},
});

const highlight = HighlightStyle.define([
    {tag: tags.heading1, fontWeight: '700', fontSize: '1.5em'},
    {tag: tags.heading2, fontWeight: '700', fontSize: '1.2em', color: 'hsl(var(--primary))'},
    {tag: tags.heading3, fontWeight: '700'},
    {tag: tags.strong, fontWeight: '700'},
    {tag: tags.emphasis, fontStyle: 'italic'},
    {tag: tags.comment, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic'},
    {tag: tags.processingInstruction, color: 'hsl(var(--muted-foreground))'},
    {tag: tags.meta, color: 'hsl(var(--muted-foreground))'},
    // frontmatter(YAML)用低調的等寬樣式,與本文區隔
    {tag: [tags.propertyName, tags.definition(tags.propertyName)], color: 'hsl(var(--primary))', fontFamily: 'Consolas, monospace', fontSize: '0.85em'},
    {tag: [tags.string, tags.content, tags.separator, tags.squareBracket, tags.brace], fontFamily: 'inherit'},
]);


// searchKeymap 沒有取代的快捷鍵:Ctrl+H 開啟面板、展開取代列並聚焦「取代為」欄(Windows 慣例)
const openReplace: Command = view => {
    openSearchPanel(view);
    activeSearchPanel?.toggleReplace(true, true);
    return true;
};

// 內容由父層以 key={檔案路徑} 重新掛載來切換;此元件只負責單一文件的編輯。
const Editor = forwardRef<EditorHandle, Props>(function Editor({initialText, onChange, onAskAI, onSelect, posKey, posStore, flash, readOnly = false}, ref) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | null>(null);
    const readOnlyComp = useRef(new Compartment());
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const [menu, setMenu] = useState<{x: number; y: number; sel: Selection | null} | null>(null);
    const [sub, setSub] = useState(false);
    const [current, setCurrent] = useState<Selection | null>(null); // 最新選取(浮動列用)
    const [subBar, setSubBar] = useState(false); // 浮動列的段落指令子選單

    const currentSelection = (): Selection | null => {
        const v = view.current;
        if (!v) return null;
        const {from, to} = v.state.selection.main;
        if (from === to) return null;
        return {text: v.state.sliceDoc(from, to), from, to};
    };

    useImperativeHandle(ref, () => ({
        openSearch: (replace = false) => {
            const v = view.current;
            if (!v) return;
            cancelRestore(); // 明確定位:取消進行中的位置還原
            openSearchPanel(v);
            if (replace) activeSearchPanel?.toggleReplace(true, true);
            else activeSearchPanel?.mount(); // 聚焦搜尋欄(全域 Ctrl+F)
        },
        scrollToLine: (line: number) => {
            const v = view.current;
            if (!v) return;
            cancelRestore(); // 明確定位:取消進行中的位置還原,否則稍後被拉回舊位置
            const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines));
            v.dispatch({
                selection: EditorSelection.cursor(l.from),
                effects: EditorView.scrollIntoView(l.from, {y: 'start', yMargin: 80}),
            });
            v.focus();
            // 短暫高亮該行,讓作者知道跳到哪裡
            const el = v.domAtPos(l.from).node as HTMLElement;
            const row = (el.nodeType === 3 ? el.parentElement : el)?.closest(".cm-line");
            row?.classList.add("cm-flash");
            setTimeout(() => row?.classList.remove("cm-flash"), 1300);
        },
        selection: currentSelection,
        focus: () => view.current?.focus(),
    }));

    // 位置記憶與還原(§16 第 24 項第一層):選取/捲動變動時寫入 posStore(只存記憶體),
    // 掛載時讀回並還原;外部重載後內容可能變短,錨點超出文件長度要夾住(不報錯)。
    // 還原是 rAF 重試(等 CM 排版),作者操作或明確定位(scrollToLine、搜尋)時要取消,
    // 否則還原視窗內的定位會被拉回舊位置。
    const restoringRef = useRef(false); // 還原期間不寫回(掛載還原自己的 selection/scroll 會觸發 savePos,不覆蓋記住的值)
    const restoreRafRef = useRef(0);
    const cancelRestore = useCallback(() => {
        if (restoreRafRef.current) { cancelAnimationFrame(restoreRafRef.current); restoreRafRef.current = 0; }
        restoringRef.current = false;
    }, []);
    const savePos = () => {
        const v = view.current;
        if (!v || restoringRef.current || !posKey || !posStore) return;
        const {anchor, head} = v.state.selection.main;
        posStore.set(posKey, {anchor, head, scrollTop: v.scrollDOM.scrollTop});
    };
    // 縮放保護只針對縮放「前」可見的游標:作者把游標捲出畫面(閱讀中)時,縮放不得把畫面拉回游標
    const cursorVisibleRef = useRef(true);
    const noteCursorVisible = () => {
        const v = view.current;
        if (!v) return;
        const c = v.coordsAtPos(v.state.selection.main.head);
        if (!c) return;
        const r = v.scrollDOM.getBoundingClientRect();
        cursorVisibleRef.current = c.top >= r.top - 1 && c.bottom <= r.bottom + 1;
    };

    useEffect(() => {
        const v = new EditorView({
            parent: host.current!,
            state: EditorState.create({
                doc: initialText,
                extensions: [
                    phrases,
                    // Ctrl+F 搜尋、Ctrl+H 切換取代(§16 第 24 項第一層);自訂面板見 PerkinsSearchPanel
                    search({top: true, createPanel: view => (activeSearchPanel = new PerkinsSearchPanel(view))}),
                    history(),
                    drawSelection(),
                    keymap.of([...defaultKeymap, ...historyKeymap, {key: 'Mod-h', run: openReplace}, ...searchKeymap]),
                    searchTheme,
                    yamlFrontmatter({content: markdown()}), // 設定檔的 frontmatter 不被誤判成 setext 標題
                    syntaxHighlighting(highlight),
                    aiFlashField,
                    readOnlyComp.current.of(lockExt(readOnly)),
                    EditorView.lineWrapping,
                    theme,
                    EditorView.updateListener.of(u => {
                        if (u.docChanged) onChangeRef.current(u.state.doc.toString());
                        if (u.selectionSet) {
                            savePos(); // 位置記憶:選取變動時持續寫回
                            noteCursorVisible(); // 記錄縮放前游標可見性(縮放保護用)
                            const {from, to} = u.state.selection.main;
                            const s = from === to ? null : {text: u.state.sliceDoc(from, to), from, to};
                            setCurrent(s); // 浮動列顯示/隱藏
                            onSelectRef.current?.(s);
                        }
                    }),
                ],
            }),
        });
        view.current = v;

        // 掛載還原上次位置:夾住錨點與捲動(外部重載後文件可能變短;EditorSelection 超界會拋錯)
        const saved = posKey && posStore ? posStore.get(posKey) : undefined;
        if (saved) {
            const len = v.state.doc.length;
            const anchor = Math.min(saved.anchor, len);
            const head = Math.min(saved.head, len);
            restoringRef.current = true;
            v.dispatch({selection: EditorSelection.range(anchor, head)});
            // 捲動還原要等 CM 把視埠排出來(首次排版捲動高度會逐步長大),
            // 等不到目標高度就重試幾個 frame,最多約 40 frame 後以當下最大值夾住;
            // 以捲動位置為準,不額外 scrollIntoView(游標在可視範圍外時會把捲動位置拉走);
            // 作者操作/明確定位/卸載時取消(見 cancelRestore)
            let tries = 0;
            const restoreScroll = () => {
                restoreRafRef.current = 0;
                const max = Math.max(0, v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight);
                if (saved.scrollTop > 0 && max < saved.scrollTop && tries++ < 40) {
                    restoreRafRef.current = requestAnimationFrame(restoreScroll);
                    return;
                }
                v.scrollDOM.scrollTop = Math.min(saved.scrollTop, max);
                restoringRef.current = false;
            };
            restoreRafRef.current = requestAnimationFrame(restoreScroll);
        }

        // 捲動位置持續寫回(rAF 節流)
        let scrollRaf = 0;
        const onScroll = () => {
            if (scrollRaf) return;
            scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; savePos(); noteCursorVisible(); });
        };
        v.scrollDOM.addEventListener('scroll', onScroll);
        // 作者操作(點擊/滾動/打字)時取消位置還原:還原只負責「回到上次位置」,作者一動手就以作者為準
        const onUserAction = () => cancelRestore();
        v.dom.addEventListener('pointerdown', onUserAction);
        v.dom.addEventListener('wheel', onUserAction, {passive: true});
        v.dom.addEventListener('keydown', onUserAction);

        // 視窗縮放(含 ≤960 側欄/資訊欄互斥自動收合)後游標穩定:游標行落在可視範圍外
        // 才以最小捲動帶回(不跳到頂端,也不干擾本來就看得到的情況)
        let resizeRaf = 0;
        const ro = new ResizeObserver(() => {
            if (resizeRaf) return;
            resizeRaf = requestAnimationFrame(() => {
                resizeRaf = 0;
                // 只保護縮放「前」可見的游標:作者把游標捲出畫面閱讀時,縮放保留閱讀位置不拉回
                if (!cursorVisibleRef.current) return;
                const head = v.state.selection.main.head;
                const c = v.coordsAtPos(head);
                if (!c) return;
                const r = v.scrollDOM.getBoundingClientRect();
                if (c.top < r.top || c.bottom > r.bottom)
                    v.dispatch({effects: EditorView.scrollIntoView(head, {y: 'nearest'})});
            });
        });
        ro.observe(host.current!);

        // (DEV)E2E 檢視位置與游標可見性用
        if (import.meta.env.DEV) {
            (window as any).__perkinsEditor = {
                pos: () => ({anchor: v.state.selection.main.anchor, head: v.state.selection.main.head, lines: v.state.doc.lines,
                             scrollTop: v.scrollDOM.scrollTop, maxScroll: Math.max(0, v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight)}),
                cursorVisible: () => {
                    const c = v.coordsAtPos(v.state.selection.main.head);
                    if (!c) return null;
                    const r = v.scrollDOM.getBoundingClientRect();
                    return c.top >= r.top - 1 && c.bottom <= r.bottom + 1;
                },
                posAll: () => [...(posStore || new Map()).entries()],
            };
        }

        // 掛載時套用 AI 改動標示(#45 a);StrictMode 重建編輯器時會再套一次,所以不放在父層的一次性 effect
        let flashTimer = 0;
        if (flash) {
            const len = v.state.doc.length;
            v.dispatch({effects: setAiFlash.of({from: Math.min(flash.from, len), to: Math.min(flash.to, len)})});
            flashTimer = window.setTimeout(() => v.dispatch({effects: setAiFlash.of(null)}), AI_FLASH_MS);
        }

        return () => {
            clearTimeout(flashTimer);
            cancelRestore(); // 卸載時終止還原 rAF
            ro.disconnect();
            cancelAnimationFrame(scrollRaf);
            cancelAnimationFrame(resizeRaf);
            v.scrollDOM.removeEventListener('scroll', onScroll);
            v.dom.removeEventListener('pointerdown', onUserAction);
            v.dom.removeEventListener('wheel', onUserAction);
            v.dom.removeEventListener('keydown', onUserAction);
            v.destroy();
            view.current = null;
            if (import.meta.env.DEV) delete (window as any).__perkinsEditor;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 唯讀切換(#56):掛載後隨 prop 重新設定
    useEffect(() => {
        view.current?.dispatch({effects: readOnlyComp.current.reconfigure(lockExt(readOnly))});
    }, [readOnly]);

    const onContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setSub(false);
        setMenu({x: e.clientX, y: e.clientY, sel: currentSelection()});
    };

    useEffect(() => {
        if (!menu) return;
        const close = () => setMenu(null);
        window.addEventListener('click', close);
        window.addEventListener('keydown', close);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('keydown', close);
        };
    }, [menu]);

    const copy = async (cut: boolean) => {
        const sel = menu?.sel;
        const v = view.current;
        if (!sel || !v) return;
        await navigator.clipboard.writeText(sel.text);
        if (cut) v.dispatch({changes: {from: sel.from, to: sel.to}});
        v.focus();
    };

    const paste = async () => {
        const v = view.current;
        if (!v) return;
        try {
            // Windows 剪貼簿常帶 \r\n:統一成 \n(§16 第 24 項第一層;只正規化換行,不做其他改寫)
            const text = (await navigator.clipboard.readText()).replace(/\r\n?/g, '\n');
            v.dispatch(v.state.replaceSelection(text));
            v.focus();
        } catch (e) {
            console.error('貼上失敗:', e);
            if (import.meta.env.DEV) (window as any).__perkinsPasteErr = String(e);
        }
    };

    const item = 'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent';
    const disabled = 'pointer-events-none opacity-40';
    // 選單靠近視窗右緣時,子選單改往左開
    const flip = menu ? menu.x > window.innerWidth - 420 : false;

    return (
        <div className="cm-host relative" ref={host} onContextMenu={onContextMenu}>
            {/* 選取浮動列(§16 第 1 項 04):有選取時出現在編輯器頂部右側;帶入當下選取,右鍵選單保留 */}
            {current && (
                <div data-testid="selection-bar"
                     className="absolute right-3 top-2 z-20 flex items-center gap-1 rounded-md border bg-popover p-1 shadow-lg">
                    <button className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent" data-testid="selection-ask"
                            onClick={() => { const s = currentSelection(); if (s) onAskAI(s); }}>
                        <Bot className="h-3.5 w-3.5 text-primary"/>詢問這段
                    </button>
                    <div className="relative">
                        <button className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent" data-testid="selection-quick"
                                onClick={() => setSubBar(v => !v)}>
                            <TextSelect className="h-3.5 w-3.5"/>段落指令<ChevronRight className="h-3 w-3"/>
                        </button>
                        {subBar && (
                            <div className="absolute right-0 top-full z-30 mt-1 min-w-[13rem] rounded-md border bg-popover p-1 shadow-md">
                                {QUICK_ACTIONS.map(q => (
                                    <div key={q.id} className={item}
                                         onClick={() => { const s = currentSelection(); if (s) { onAskAI(s, q); setSubBar(false); } }}>
                                        {q.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {menu && (
                <div className="ctxmenu fixed z-50 min-w-[11rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                     style={{left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 220)}}
                     onClick={e => e.stopPropagation()}>
                    <div className={`${item} ${menu.sel ? '' : disabled}`} data-testid="ask-ai"
                         onClick={() => { if (menu.sel) { onAskAI(menu.sel); setMenu(null); } }}>
                        <Bot className="h-4 w-4 text-primary"/>詢問 Perkins Bot…
                    </div>
                    <div className={`relative ${item} ${menu.sel ? '' : disabled}`}
                         onMouseEnter={() => setSub(true)} onMouseLeave={() => setSub(false)}>
                        <span className="w-4"/>快速指令<ChevronRight className="ml-auto h-4 w-4"/>
                        {sub && menu.sel && (
                            <div className={`absolute top-0 min-w-[13rem] rounded-md border bg-popover p-1 shadow-md ${flip ? 'right-full mr-1' : 'left-full ml-1'}`}>
                                {QUICK_ACTIONS.map(q => (
                                    <div key={q.id} className={item} onClick={() => { onAskAI(menu.sel!, q); setMenu(null); }}>
                                        {q.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="-mx-1 my-1 h-px bg-border"/>
                    <div className={`${item} ${menu.sel ? '' : disabled}`} onClick={() => { copy(true); setMenu(null); }}><Scissors className="h-4 w-4"/>剪下</div>
                    <div className={`${item} ${menu.sel ? '' : disabled}`} onClick={() => { copy(false); setMenu(null); }}><Copy className="h-4 w-4"/>複製</div>
                    <div className={item} onClick={() => { paste(); setMenu(null); }}><ClipboardPaste className="h-4 w-4"/>貼上</div>
                </div>
            )}
        </div>
    );
});

export default Editor;
