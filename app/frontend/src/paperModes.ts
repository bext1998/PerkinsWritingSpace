// 打字機捲動與專注模式(Issue #44 第二階段(一),規則見 SPEC §17.3)。只改呈現:
// 檔案內容、存檔、匯出全部不變;兩者各自獨立開關,由 Editor.tsx 以 Compartment 開關,
// 狀態只存在記憶體(Workspace,與禪模式相同)。
//
// 一、打字機捲動:作者輸入或移動游標後,游標所在行維持在編輯區上方約 40% 的固定位置
//     (內容捲動,而不是游標往下跑)。文件開頭不足以捲動時由 scrollTop 下界夾住(開頭照常顯示);
//     文件結尾需要額外的下方空間才到得了固定位置,由 Editor.tsx 的 `.cm-typewriter` 樣式提供。
//     作者用滾輪/捲軸主動捲動閱讀時不搶回位置(單純捲動只有 viewportChanged,不在定位條件裡),
//     直到下一次輸入或移動游標。IME 組字中不捲動(捲動會打斷組字),延到 compositionend 再定位。
// 二、專注模式:游標所在段落以外的文字淡化(降低不透明度)。段落定義沿用第一階段
//     「每個非空白的一般行是一段」;有選取跨多段時,選取涵蓋的段落都不淡化。
//     標題、場景分隔、程式碼區塊一樣依是否在游標所在段落淡化;游標行從不淡化
//     (IME 組字中不動到組字的那個行)。行 decoration 只算可見範圍前後各 MARGIN 行(同 paper.ts)。

import {Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate} from '@codemirror/view';
import {Extension, Range} from '@codemirror/state';

// 游標行在編輯區上方的固定位置(約 40% 處)
const TYPEWRITER_RATIO = 0.4;
// 與 paper.ts 同一個作法:可見範圍外再多算的行數
const MARGIN = 60;

// ---- 打字機捲動 ----
class TypewriterView {
    private raf = 0;
    private pending = false; // 組字中記下「要定位」,compositionend 後補做
    private readonly onCompositionEnd = () => {
        if (!this.pending) return;
        this.pending = false;
        this.schedule();
    };

    constructor(private readonly view: EditorView) {
        view.contentDOM.addEventListener('compositionend', this.onCompositionEnd);
        // 開啟(或掛載)時就把游標行對到固定位置;之後維持在該位置
        this.schedule();
    }

    update(u: ViewUpdate) {
        // 只在輸入/移動游標後定位;作者主動捲動(viewportChanged)不搶回位置
        if (!(u.docChanged || u.selectionSet)) return;
        if (this.view.composing || this.view.compositionStarted) {
            this.pending = true; // 組字中不捲動:延到 compositionend
            return;
        }
        this.schedule();
    }

    destroy() {
        cancelAnimationFrame(this.raf);
        this.view.contentDOM.removeEventListener('compositionend', this.onCompositionEnd);
    }

    // 以 rAF 定位:plugin 的 update 還在排版前,等這一幀的佈局完成再量
    private schedule() {
        if (this.raf) return;
        this.raf = requestAnimationFrame(() => {
            this.raf = 0;
            this.place();
        });
    }

    private place() {
        const v = this.view;
        if (v.composing || v.compositionStarted) {
            this.pending = true;
            return;
        }
        const c = v.coordsAtPos(v.state.selection.main.head);
        const sc = v.scrollDOM;
        if (!c) return;
        const target = sc.getBoundingClientRect().top + sc.clientHeight * TYPEWRITER_RATIO;
        const dy = c.top - target;
        if (Math.abs(dy) < 1) return;
        // 上下界夾住:文件開頭不足以捲動時不硬拉(開頭照常顯示),結尾同理
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        sc.scrollTop = Math.min(max, Math.max(0, sc.scrollTop + dy));
    }
}

const typewriterPlugin = ViewPlugin.fromClass(TypewriterView);

// ---- 專注模式 ----
const BLANK = (t: string) => t.trim() === '';
// 同一個實例重複使用,CM 才能比對後只更新變動的行(與 paper.ts 同理)
const dimDeco = Decoration.line({class: 'cm-paper-dim'});

// 只算可見範圍(與游標所在範圍)前後各 MARGIN 行;游標或選取碰到的行不淡化
const computeFocus = (view: EditorView): DecorationSet => {
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
    // 與 paper.ts 的 touching 同一個判準:選取涵蓋的段落(含多段)都不淡化
    const active = (a: number, b: number) => selection.ranges.some(r => r.from <= b && r.to >= a);
    const list: Range<Decoration>[] = [];
    for (let i = from; i <= to; i++) {
        const line = doc.line(i);
        if (BLANK(line.text)) continue; // 空行沒有文字(分隔空行另由 paper.ts 折起)
        if (active(line.from, line.to)) continue; // 游標所在段落(與選取涵蓋的段落):不淡化
        list.push(dimDeco.range(line.from));
    }
    return Decoration.set(list, true);
};

class FocusView {
    deco: DecorationSet = Decoration.none;

    constructor(private readonly view: EditorView) {
        this.deco = computeFocus(view);
    }

    update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) this.deco = computeFocus(this.view);
    }
}

const focusPlugin = ViewPlugin.fromClass(FocusView, {decorations: v => v.deco});

const focusTheme = EditorView.theme({
    '.cm-paper-dim': {opacity: '0.35'},
    // 段落淡化時透明度漸變(#120);只有透明度,不位移。減少動態效果時由 .reduce-motion 歸零
    '.cm-line': {transition: 'opacity .2s ease-out'},
});

export const typewriterExtensions = (): Extension => typewriterPlugin;

export const focusExtensions = (): Extension => [focusPlugin, focusTheme];
