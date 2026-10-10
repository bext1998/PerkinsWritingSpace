// 稿紙化(Issue #44 第一階段,規則見 SPEC §17.3)。只改編輯器的呈現與 Enter 行為:
// 檔案內容、格式、存檔、平台輸出全部不變,既有稿件不重寫也不正規化。
//
// 一、一個 Enter 一段(方案 C):段落之間是「\n\n」,作者按一次 Enter 就補好,游標到新段開頭;
//     Shift+Enter 仍是單一換行。程式碼區塊與 frontmatter 內照舊(單一換行),IME 組字中不動。
// 二、段落間那一個空行在畫面上不顯示(改用段距):用 block replace 折掉整行,
//     游標移動與點擊交給 EditorView.atomicRanges(CM 的 skipAtoms:字元、垂直移動、點擊都會跳過),
//     段首 Backspace 與段尾 Delete 另外做成「合併兩段」(連同分隔一起刪掉)。
//     連續兩個以上的空行只藏掉分隔那一個,作者刻意多留的照實顯示。
// 三、游標不在該行時隱藏 Markdown 標記(標題前綴、粗體/斜體記號),場景分隔行畫成置中 ◇◇◇、
//     註解弱化(內容不隱藏);游標或選取碰到該行就顯示原始文字。程式碼區塊與 frontmatter 內完全不套用。
//
// 分工(CM 的限制):block decoration 不能由 ViewPlugin 提供(會改變高度對應,只能由 state 提供),
// 所以「藏空行」放在 StateField、整份文件都算(空行本來就少);行內與行樣式仍然只算可見範圍前後各 60 行。

import {EditorSelection, Extension, Range, RangeSet, StateField, Text} from '@codemirror/state';
import {Decoration, DecorationSet, EditorView, keymap, ViewPlugin, ViewUpdate, WidgetType} from '@codemirror/view';
import {insertNewline, isolateHistory} from '@codemirror/commands';

// 場景分隔行:判準照 internal/publish/publish.go 的 reBreak(***、---、___、◇◇◇ 等)
const SCENE_BREAK = /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|[◇◆＊※☆★○●]{3,})$/;
const HEADING = /^(#{1,6})[ \t]+/;
const BLANK = (t: string) => t.trim() === '';
const isHeadingOrBreak = (t: string) => HEADING.test(t) || SCENE_BREAK.test(t.trim());
// 可見範圍外再多算的行數:游標常被移到畫面外一格,原子範圍要先備好才不會停在隱藏空行上
const MARGIN = 60;

type Span = {from: number; to: number};

// ---- 共用 decoration 實例(同一個實例重複使用,CM 才能比對後只更新變動的 DOM)----
// 隱藏的空行:block replace 蓋掉整行(含換行),再放一個 0 高度的 widget 佔位。
// inclusive: false 讓游標不會被畫在這個範圍的兩側。
class GapWidget extends WidgetType {
    toDOM() {
        const d = document.createElement('div');
        d.className = 'cm-paper-gap';
        return d;
    }
    eq() {
        return true;
    }
    ignoreEvent() {
        return true;
    }
}

class BreakWidget extends WidgetType {
    toDOM() {
        const s = document.createElement('span');
        s.className = 'cm-paper-break-mark';
        s.textContent = '◇◇◇';
        return s;
    }
    eq() {
        return true;
    }
    ignoreEvent() {
        return true;
    }
}

const hiddenBlankDeco = Decoration.replace({block: true, inclusive: false, widget: new GapWidget()});
const paraDeco = Decoration.line({class: 'cm-paper-para'});
const h1Deco = Decoration.line({class: 'cm-paper-h1'});
const h2Deco = Decoration.line({class: 'cm-paper-h2'});
const h3Deco = Decoration.line({class: 'cm-paper-h3'});
const breakLineDeco = Decoration.line({class: 'cm-paper-break'});
const dimDeco = Decoration.mark({class: 'cm-paper-comment'});
// 標記符號用 mark + display:none,不用 replace:語法高亮會在同樣的字上產生 mark,
// 兩者重疊時 CM 不會建立 replace 的 widget(畫面會照樣出現原始符號,實測 2026-10-10)。
const markerDeco = Decoration.mark({class: 'cm-paper-hide'});
const blankLineDeco = Decoration.line({class: 'cm-paper-blank'}); // 藏起來的空行:整行高度收成 0
const breakMarkDeco = Decoration.widget({widget: new BreakWidget(), side: 1}); // 場景分隔行畫成 ◇◇◇

// ---- 行狀態:程式碼區塊(fence)、frontmatter、註解範圍、上一個非空白行 ----
// fence 判準與 internal/project.ParseScenes 一致(整行 trim 後以 ``` 開頭就切換)。
interface LineFlags {
    blocked: Uint8Array; // 程式碼區塊內、fence 行本身、frontmatter 內:不套用任何紙張效果
    prevNonBlank: Int32Array; // 上一個非空白行的行號(0 = 沒有)
    comments: Map<number, Span[]>; // 這一行落在 <!-- --> 裡的範圍(絕對位置;可跨行)
}

// frontmatter 的收尾行號(0 = 不是 frontmatter:第一行不是 --- 或找不到收尾;
// 找不到收尾就不當 frontmatter,免得整份文件都不套用)
const frontmatterEnd = (doc: Text): number => {
    if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return 0;
    for (let i = 2; i <= Math.min(doc.lines, 400); i++) {
        const t = doc.line(i).text.trim();
        if (t === '---' || t === '...') return i;
    }
    return 0;
};

// 從第 1 行掃到 upto 行:fence 與註解狀態都必須從頭累積(註解可能開在可見範圍之前)。
// 用 iterLines 串流取得行字串,避免每一行都各做一次樹狀查找。
const scanLines = (doc: Text, upto: number): LineFlags => {
    const n = Math.min(upto, doc.lines);
    const blocked = new Uint8Array(n + 2);
    const prevNonBlank = new Int32Array(n + 2);
    const comments = new Map<number, Span[]>();
    const fmEnd = frontmatterEnd(doc);
    let fence = false;
    let commentFrom = -1; // 未結束註解的起點(絕對位置);-1 = 不在註解裡
    let start = 0; // 目前這一行的起點
    let prevNB = 0;
    let i = 0;
    for (const text of doc.iterLines(1, n + 1)) {
        i++;
        const end = start + text.length;
        if (i <= fmEnd) blocked[i] = 1;
        if (text.trim().startsWith('```')) {
            blocked[i] = 1;
            fence = !fence;
        } else if (fence) {
            blocked[i] = 1;
        }
        if (!blocked[i]) {
            // <!-- --> 註解(可跨行);程式碼區塊與 frontmatter 內不當成註解
            let pos = 0;
            const spans: Span[] = [];
            while (pos <= text.length) {
                if (commentFrom >= 0) {
                    const close = text.indexOf('-->', pos);
                    if (close < 0) {
                        spans.push({from: Math.max(commentFrom, start), to: end});
                        break;
                    }
                    spans.push({from: Math.max(commentFrom, start), to: start + close + 3});
                    commentFrom = -1;
                    pos = close + 3;
                } else {
                    const open = text.indexOf('<!--', pos);
                    if (open < 0) break;
                    commentFrom = start + open;
                    pos = open + 4;
                }
            }
            if (spans.length) comments.set(i, spans);
            if (!BLANK(text)) prevNB = i;
        }
        prevNonBlank[i] = prevNB === i ? prevNonBlank[i - 1] : prevNB;
        start = end + 1; // +1 = 換行
    }
    return {blocked, prevNonBlank, comments};
};

// 行內標記符號(**粗**、__粗__、*斜*、_斜_):回傳要藏起來的絕對範圍(不含反引號內的程式碼)
const inlineMarkers = (text: string, base: number): Span[] => {
    const hide: Span[] = [];
    const taken: Span[] = [];
    const busy = (a: number, b: number) => taken.some(s => a < s.to && b > s.from);
    const codeSpans: Span[] = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '`') continue;
        const close = text.indexOf('`', i + 1);
        const to = close < 0 ? text.length : close + 1;
        codeSpans.push({from: i, to});
        i = to - 1;
    }
    const inCode = (a: number, b: number) => codeSpans.some(s => a < s.to && b > s.from);
    // 粗體:前後各 2 個記號字元
    for (const m of text.matchAll(/\*\*([^\s*](?:[^*]*[^\s*])?)\*\*|__([^\s_](?:[^_]*[^\s_])?)__/g)) {
        const a = m.index!;
        const b = a + m[0].length;
        if (inCode(a, b) || busy(a, b)) continue;
        taken.push({from: a, to: b});
        hide.push({from: base + a, to: base + a + 2}, {from: base + b - 2, to: base + b});
    }
    // 斜體:前後各 1 個記號字元(前後不接英數字,避免把 2*3*4 這種算式當成斜體)
    for (const m of text.matchAll(/(?:^|[^\w*])\*([^\s*](?:[^*]*[^\s*])?)\*(?![\w*])|(?:^|[^\w_])_([^\s_](?:[^_]*[^\s_])?)_(?![\w_])/g)) {
        const a = m.index!;
        const b = a + m[0].length;
        if (inCode(a, b) || busy(a, b)) continue;
        const open = a + m[0].indexOf(m[1] ? '*' : '_');
        const close = b - 1;
        if (close <= open) continue;
        taken.push({from: a, to: b});
        hide.push({from: base + open, to: base + open + 1}, {from: base + close, to: base + close + 1});
    }
    return hide;
};

// 段落間的空行:上一個非空白行與下一個非空白行之間,整段空行只藏最前面那一個(多留的照實顯示)
const hiddenBlankLines = (doc: Text, flags: LineFlags, from: number, to: number): number[] => {
    const out: number[] = [];
    for (let i = from; i <= to; i++) {
        const prev = flags.prevNonBlank[i];
        const first = prev + 1;
        if (prev > 0 && i > first && first >= from && !flags.blocked[first]) out.push(first);
    }
    return out;
};

// 藏空行只能由 state 提供(block decoration 不能由 plugin 提供);整份文件都算,空行本來就少。
// 原子範圍比 decoration 各寬一格(含前一行與下一行之間的換行):CM 的 skipAtomicRanges 只移動
// 「嚴格落在範圍內」的位置,只蓋一個換行的範圍會讓左右方向鍵停在它的邊界上。
const atomDeco = Decoration.replace({});
interface HiddenState {
    deco: DecorationSet;
    atoms: RangeSet<Decoration>;
}

const hiddenBlanks = (doc: Text): HiddenState => {
    const flags = scanLines(doc, doc.lines);
    const ranges: Range<Decoration>[] = [];
    const atoms: Range<Decoration>[] = [];
    for (const i of hiddenBlankLines(doc, flags, 1, doc.lines)) {
        const line = doc.line(i);
        // 折掉整行(含換行),再用行樣式把殘留的行盒收成 0 高度
        ranges.push(hiddenBlankDeco.range(line.from, Math.min(line.from + 1, doc.length)));
        ranges.push(blankLineDeco.range(line.from));
        atoms.push(atomDeco.range(Math.max(0, line.from - 1), Math.min(line.from + 1, doc.length)));
    }
    return {deco: Decoration.set(ranges, true), atoms: RangeSet.of(atoms, true)};
};

const hiddenBlanksField = StateField.define<HiddenState>({
    create: state => hiddenBlanks(state.doc),
    update: (value, tr) => (tr.docChanged ? hiddenBlanks(tr.state.doc) : value),
    provide: f => EditorView.decorations.from(f, v => v.deco),
});

// ---- 行樣式與行內標記:只算可見範圍(與游標所在範圍)前後各 MARGIN 行 ----
const computePaper = (view: EditorView): DecorationSet => {
    const {doc, selection} = view.state;
    const visible = view.visibleRanges.length ? view.visibleRanges : [{from: selection.main.head, to: selection.main.head}];
    let lo = doc.length;
    let hi = 0;
    for (const r of visible) {
        lo = Math.min(lo, r.from);
        hi = Math.max(hi, r.to);
    }
    const from = Math.max(1, doc.lineAt(lo).number - MARGIN);
    const to = Math.min(doc.lines, doc.lineAt(hi).number + MARGIN);
    const flags = scanLines(doc, to);
    const hidden = new Set(hiddenBlankLines(doc, flags, from, to));
    const list: Range<Decoration>[] = [];
    // 游標或選取碰到該行時顯示原始文字
    const onCursor = (a: number, b: number) => selection.ranges.some(r => r.from <= b && r.to >= a);
    for (let i = from; i <= to; i++) {
        const line = doc.line(i);
        if (hidden.has(i)) continue; // 藏空行由 hiddenBlanksField 負責(plugin 不能提供 block decoration)
        if (flags.blocked[i]) continue; // 程式碼區塊、fence 行、frontmatter:原樣顯示
        const text = line.text;
        const touching = onCursor(line.from, line.to);
        const heading = HEADING.exec(text);
        const isBreak = SCENE_BREAK.test(text.trim());
        // 段落樣式:每一個非空白的一般行都是一段——與「複製為平台格式」(publish.Convert 每個非空行一段)一致,
        // 作者以單一換行分段的既有稿件看起來才和發文結果相同(PR #69 審查)
        if (!BLANK(text) && !heading && !isBreak) list.push(paraDeco.range(line.from));
        if (heading) {
            const level = heading[1].length;
            list.push((level === 1 ? h1Deco : level === 2 ? h2Deco : h3Deco).range(line.from));
            // 標題前綴(# 到空白)在游標不在該行時藏起來
            if (!touching) list.push(markerDeco.range(line.from, line.from + heading[0].length));
        }
        if (isBreak) {
            list.push(breakLineDeco.range(line.from));
            if (!touching) {
                list.push(markerDeco.range(line.from, line.to)); // 原始分隔符號藏掉
                list.push(breakMarkDeco.range(line.from)); // 同一行起點畫 ◇◇◇
            }
        }
        const comments = flags.comments.get(i) || [];
        for (const s of comments) {
            const a = Math.max(s.from, line.from);
            const b = Math.min(s.to, line.to);
            if (b > a && !onCursor(a, b)) list.push(dimDeco.range(a, b));
        }
        if (!touching && !isBreak && !heading) {
            for (const h of inlineMarkers(text, line.from)) {
                if (comments.some(s => h.from >= s.from && h.from < s.to)) continue; // 註解裡不套用標記規則
                list.push(markerDeco.range(h.from, h.to));
            }
        }
    }
    return Decoration.set(list, true);
};

// ---- Enter / Backspace / Delete ----
const imeActive = (v: EditorView) => v.composing || v.compositionStarted;

// 游標所在行是不是在程式碼區塊或 frontmatter 裡(掃到該行為止)
const blockedLineAt = (v: EditorView, lineNumber: number): boolean => {
    const doc = v.state.doc;
    const fmEnd = frontmatterEnd(doc);
    if (fmEnd > 0 && lineNumber <= fmEnd) return true; // frontmatter 內(含前後兩條 ---)
    let fence = false;
    for (let i = 1; i <= lineNumber; i++) {
        const t = doc.line(i).text.trim();
        if (t.startsWith('```')) {
            if (i === lineNumber) return true;
            fence = !fence;
            continue;
        }
        if (i === lineNumber) return fence;
    }
    return false;
};

const insertAt = (v: EditorView, pos: number, text: string, caret: number) => {
    v.dispatch({
        changes: {from: pos, to: pos, insert: text},
        selection: EditorSelection.cursor(caret),
        annotations: isolateHistory.of('full'),
    });
    v.focus();
};

// Enter:補出段落分隔(方案 C)。段尾與軟換行只把游標移到新段開頭,不插入多餘空行。
const paragraphEnter = (v: EditorView): boolean => {
    if (imeActive(v)) return true; // 組字中:Enter 是確認選字,不動作,也不讓它落到預設行為
    const doc = v.state.doc;
    const sel = v.state.selection.main;
    if (!sel.empty) return false; // 有選取:交給預設行為
    const pos = sel.head;
    const line = doc.lineAt(pos);
    if (blockedLineAt(v, line.number)) return false; // 程式碼區塊/frontmatter:預設行為(單一換行)
    if (doc.sliceString(pos, pos + 2) === '\n\n') {
        // 游標後面已經是段落分隔:只把游標移到下一段開頭,不再插入(否則會多出空行)
        v.dispatch({selection: EditorSelection.cursor(pos + 2), effects: EditorView.scrollIntoView(pos + 2, {y: 'nearest'})});
        v.focus();
        return true;
    }
    if (doc.sliceString(pos, pos + 1) === '\n') {
        // 游標後面是單一換行(Shift+Enter 的軟換行):補成段落分隔,游標到下一段開頭
        insertAt(v, pos, '\n', pos + 2);
        return true;
    }
    if (BLANK(line.text)) {
        // 作者刻意留白的空行:再開一個空行(照實顯示,不製造段落分隔)
        insertAt(v, pos, '\n', pos + 1);
        return true;
    }
    insertAt(v, pos, '\n\n', pos + 2); // 行中或檔案結尾:補出段落分隔
    return true;
};

const nonBlankLine = (doc: Text, from: number, dir: 1 | -1): number | null => {
    for (let i = from + dir; i >= 1 && i <= doc.lines; i += dir) if (!BLANK(doc.line(i).text)) return i;
    return null;
};

// 段首 Backspace:兩段合併(連同作者沒看見的那個空行一起刪);單一換行、標題與分隔行沿用預設行為
const mergeBackward = (v: EditorView): boolean => {
    if (imeActive(v)) return true;
    const doc = v.state.doc;
    const sel = v.state.selection.main;
    if (!sel.empty) return false;
    const line = doc.lineAt(sel.head);
    if (sel.head !== line.from || BLANK(line.text)) return false;
    const prev = nonBlankLine(doc, line.number, -1);
    if (prev === null) return false;
    // 程式碼區塊/frontmatter 的空行照原文顯示,不是段落分隔:預設行為(只刪一個換行),不跨區塊合併(PR #69 審查)
    if (blockedLineAt(v, line.number) || blockedLineAt(v, prev)) return false;
    const at = doc.line(prev).to;
    if (at === sel.head - 1) return false; // 只隔一個換行:預設行為即可
    if (isHeadingOrBreak(doc.line(prev).text)) return false; // 不把段落黏進標題或分隔行
    v.dispatch({changes: {from: at, to: sel.head, insert: ''}, selection: EditorSelection.cursor(at), annotations: isolateHistory.of('full')});
    v.focus();
    return true;
};

// 段尾 Delete:與段首 Backspace 對稱
const mergeForward = (v: EditorView): boolean => {
    if (imeActive(v)) return true;
    const doc = v.state.doc;
    const sel = v.state.selection.main;
    if (!sel.empty) return false;
    const line = doc.lineAt(sel.head);
    if (sel.head !== line.to || BLANK(line.text)) return false;
    const next = nonBlankLine(doc, line.number, 1);
    if (next === null) return false;
    if (blockedLineAt(v, line.number) || blockedLineAt(v, next)) return false;
    const at = doc.line(next).from;
    if (at === sel.head + 1) return false;
    if (isHeadingOrBreak(doc.line(next).text)) return false;
    v.dispatch({changes: {from: sel.head, to: at, insert: ''}, selection: EditorSelection.cursor(sel.head), annotations: isolateHistory.of('full')});
    v.focus();
    return true;
};

// ---- plugin 與擴充 ----
class PaperView {
    deco: DecorationSet = Decoration.none;

    constructor(private view: EditorView) {
        this.deco = computePaper(view);
    }

    update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) this.deco = computePaper(this.view);
    }
}

const paperPlugin = ViewPlugin.fromClass(PaperView, {decorations: v => v.deco});

const paperTheme = EditorView.theme({
    '.cm-paper-para': {paddingTop: '0.7em', textIndent: '2em'},
    // 字級與顏色由既有的 markdown HighlightStyle 提供,這裡只補段落間距(避免字級被放大兩次)
    '.cm-paper-h1': {paddingTop: '0.35em'},
    '.cm-paper-h2': {paddingTop: '0.3em'},
    '.cm-paper-hide': {display: 'none'},
    '.cm-paper-blank': {height: '0', lineHeight: '0'},
    '.cm-paper-break': {textAlign: 'center', paddingTop: '0.4em', paddingBottom: '0.4em'},
    '.cm-paper-break-mark': {color: 'hsl(var(--muted-foreground))', letterSpacing: '0.35em'},
    '.cm-paper-comment': {color: 'hsl(var(--muted-foreground))', fontSize: '0.85em'},
    '.cm-paper-gap': {height: '0', lineHeight: '0'},
});

// 隱藏的空行是原子範圍:方向鍵與點擊都不會停在它上面(CM 的 skipAtoms 會用它)
const paperAtomic = EditorView.atomicRanges.of(view => view.state.field(hiddenBlanksField, false)?.atoms || RangeSet.empty);

export const paperExtensions = (): Extension => [
    hiddenBlanksField,
    paperAtomic,
    paperPlugin,
    paperTheme,
    // 放在 Editor.tsx 的 defaultKeymap 前:Enter 變成一個 Enter 一段,Backspace/Delete 在段首段尾合併兩段
    keymap.of([
        {key: 'Enter', run: paragraphEnter, shift: insertNewline},
        {key: 'Backspace', run: mergeBackward},
        {key: 'Delete', run: mergeForward},
    ]),
];
