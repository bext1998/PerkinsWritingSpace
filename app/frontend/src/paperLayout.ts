// 稿紙化第二階段(二)(Issue #44,SPEC §17.3):編輯區的版心寬度、字級、段距可調。
// 作者的全域偏好(與主題同一處設定、同一種保存方式),不是作品設定;只改呈現,不改檔案內容。
// 只有少數幾個預設檔,不做任意數值輸入;預設值等於稿紙化第一階段的畫面(作者沒動設定時外觀完全相同)。
// 允許值與 Go 端 app/internal/settings/settings.go 的 PaperWidths/PaperFontSizes/PaperParaGaps 一致。

export interface PaperLayout {
    width: string; // 版心寬度:正文欄(cm-content)的最大寬度,視窗比較窄時照常填滿可用寬度
    fontSize: string; // 字級:正文(cm-scroller)字體大小,標題與場景分隔行以 em 等比縮放
    gap: string; // 段距:段落之間的距離(cm-paper-para 的 padding-top)
}

export const PAPER_WIDTHS = [
    {value: '36rem', label: '窄'},
    {value: '44rem', label: '標準'},
    {value: '52rem', label: '寬'},
];
export const PAPER_FONT_SIZES = [
    {value: '0.95rem', label: '小'},
    {value: '1.08rem', label: '標準'},
    {value: '1.25rem', label: '大'},
    {value: '1.45rem', label: '特大'},
];
export const PAPER_PARA_GAPS = [
    {value: '0.35em', label: '緊'},
    {value: '0.7em', label: '標準'},
    {value: '1.15em', label: '寬'},
];

export const paperDefaults: PaperLayout = {width: '44rem', fontSize: '1.08rem', gap: '0.7em'};

// 以 CSS 變數套用(style.css 與 paper.ts 用 var() 取用):變更立即生效,開著的編輯器不用重開
export function applyPaperLayout(l: PaperLayout) {
    const root = document.documentElement;
    root.style.setProperty('--paper-width', l.width);
    root.style.setProperty('--paper-font-size', l.fontSize);
    root.style.setProperty('--paper-gap', l.gap);
}
