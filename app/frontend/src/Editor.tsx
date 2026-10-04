import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {EditorSelection, EditorState} from '@codemirror/state';
import {EditorView, keymap, drawSelection} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
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
}

interface Props {
    initialText: string;
    onChange: (text: string) => void;
    onAskAI: (sel: Selection, quick?: Quick) => void;
    onSelect?: (sel: Selection | null) => void;
}

const theme = EditorView.theme({
    '&': {height: '100%', color: 'hsl(var(--foreground))', backgroundColor: 'transparent'},
    '&.cm-focused': {outline: 'none'},
    // 優先權需不低於 CodeMirror 內建 &dark.cm-focused > .cm-scroller > .cm-selectionLayer 規則,否則選取色會被蓋掉
    '& > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {backgroundColor: 'hsl(var(--selection) / .28)'},
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {backgroundColor: 'hsl(var(--selection) / .42)'},
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


// 內容由父層以 key={檔案路徑} 重新掛載來切換;此元件只負責單一文件的編輯。
const Editor = forwardRef<EditorHandle, Props>(function Editor({initialText, onChange, onAskAI, onSelect}, ref) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | null>(null);
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
        scrollToLine: (line: number) => {
            const v = view.current;
            if (!v) return;
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

    useEffect(() => {
        const v = new EditorView({
            parent: host.current!,
            state: EditorState.create({
                doc: initialText,
                extensions: [
                    history(),
                    drawSelection(),
                    keymap.of([...defaultKeymap, ...historyKeymap]),
                    yamlFrontmatter({content: markdown()}), // 設定檔的 frontmatter 不被誤判成 setext 標題
                    syntaxHighlighting(highlight),
                    EditorView.lineWrapping,
                    theme,
                    EditorView.updateListener.of(u => {
                        if (u.docChanged) onChangeRef.current(u.state.doc.toString());
                        if (u.selectionSet) {
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
        return () => { v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        const text = await navigator.clipboard.readText();
        v.dispatch(v.state.replaceSelection(text));
        v.focus();
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
                            <div className="absolute right-0 top-full z-30 mt-1 min-w-[13rem] rounded-md border bg-popover p-1 shadow-xl">
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
                <div className="ctxmenu fixed z-50 min-w-[11rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-xl"
                     style={{left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 220)}}
                     onClick={e => e.stopPropagation()}>
                    <div className={`${item} ${menu.sel ? '' : disabled}`} data-testid="ask-ai"
                         onClick={() => { if (menu.sel) { onAskAI(menu.sel); setMenu(null); } }}>
                        <Bot className="h-4 w-4 text-primary"/>詢問 AI…
                    </div>
                    <div className={`relative ${item} ${menu.sel ? '' : disabled}`}
                         onMouseEnter={() => setSub(true)} onMouseLeave={() => setSub(false)}>
                        <span className="w-4"/>快速指令<ChevronRight className="ml-auto h-4 w-4"/>
                        {sub && menu.sel && (
                            <div className={`absolute top-0 min-w-[13rem] rounded-md border bg-popover p-1 shadow-xl ${flip ? 'right-full mr-1' : 'left-full ml-1'}`}>
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
