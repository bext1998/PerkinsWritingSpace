// Issue #118(SPEC §17.2 外觀頁):自訂主題的工具函式。
// deriveTokens(bg, fg, accent, isDark) 是純函式:給背景/前景/強調色,
// 以 HSL 微調推算 sidebar、rail、paper、card、popover、muted、border 等 token;
// style.css 的 :root 與 .dark/.theme-* 提供預設值,前端只覆寫自訂色的部分 token。
// CSS 自訂屬性值是「H S% L%」(與 :root/.dark 內既有的格式一致),不是完整 hsl(),
// 否則 tailwind 的 hsl(var(--xxx)) 套不出來。

export type AccentName = 'amber' | 'blue' | 'green' | 'red' | 'purple' | 'cyan';
export const ACCENT_PRESETS: {id: AccentName; label: string; hex: string}[] = [
    {id: 'amber', label: '琥珀', hex: '#d99749'},
    {id: 'blue', label: '藍', hex: '#4f8bcb'},
    {id: 'green', label: '綠', hex: '#5fa86b'},
    {id: 'red', label: '紅', hex: '#c75a5a'},
    {id: 'purple', label: '紫', hex: '#9a78c4'},
    {id: 'cyan', label: '青', hex: '#4ea0a0'},
];

// HEX(#rrggbb)→HSL(H S% L%);L 限制 0~1,S 限制 0~1。HSL 用空間平均調整亮度,
export interface HSL {h: number; s: number; l: number}

export function hexToHSL(hex: string): HSL {
    const v = hex.replace('#', '');
    const r = parseInt(v.slice(0, 2), 16) / 255;
    const g = parseInt(v.slice(2, 4), 16) / 255;
    const b = parseInt(v.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return {h, s, l};
}

// 「同一色相,亮度偏移 δ」:L 上下浮動、保留原色調與飽和度。
function shift(hsl: HSL, dL: number, dS = 0): HSL {
    return {h: hsl.h, s: Math.max(0, Math.min(1, hsl.s + dS)), l: Math.max(0, Math.min(1, hsl.l + dL))};
}

// 「中性化」:降低飽和度,深色面常用於 sidebar/rail(不想偏色)。
function desaturate(hsl: HSL, factor: number): HSL {
    return {h: hsl.h, s: hsl.s * factor, l: hsl.l};
}

// 「對比前景」:依 luminance 選黑或白,給 primary-foreground 與強調色按鈕的文字用。
function contrastFG(hsl: HSL): string {
    return hsl.l > 0.55 ? '#181818' : '#f8f5ee';
}

// 相對亮度(0~1),WCAG 用。
function relLuminance({h, s, l}: HSL): number {
    // 簡化版 HSL→RGB(用 sRGB 線性近似):不需要絕對精確,只要能比較誰深誰淺。
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) {r = c; g = x;} else if (hp < 2) {r = x; g = c;}
    else if (hp < 3) {g = c; b = x;} else if (hp < 4) {g = x; b = c;}
    else if (hp < 5) {r = x; b = c;} else {r = c; b = x;}
    const m = l - c / 2;
    const lin = (v: number) => { v = (v + m); return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// 對比 4.5:1(背景與文字)是 WCAG AA 的正文門檻;低於此值在介面上警告作者。
export function contrastRatio(a: HSL, b: HSL): number {
    const la = relLuminance(a), lb = relLuminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

// deriveTokens 給定背景/前景/強調色,推算整組 token,回傳 CSS 自訂屬性字串清單。
// isDark = true 時,sidebar/rail/paper 是比背景更深的色;反之亦然。
// 強調色(primary/ring/selection)直接採用 accent;primary-foreground 依 luminance 自動選。
export function deriveTokens(bg: string, fg: string, accent: string, isDark: boolean) {
    const bgHSL = hexToHSL(bg);
    const fgHSL = hexToHSL(fg);
    const accHSL = hexToHSL(accent);

    // 深色:往更暗;淺色:往更亮。位移幅度取決於 token 的「凹陷」程度。
    const d = isDark ? -1 : 1;
    const sidebarL = bgHSL.l + d * 0.025; // 比背景再深/淺 2.5%
    const railL = bgHSL.l + d * 0.045;    // 比背景再深/淺 4.5%
    const paperL = bgHSL.l + d * 0.018;   // 比背景再淺/深一點,正文區
    const cardL = bgHSL.l + d * 0.012;
    const popoverL = bgHSL.l + d * 0.022;
    const secondaryL = bgHSL.l + d * 0.06;
    const accentL = bgHSL.l + d * 0.06;
    const mutedL = bgHSL.l + d * 0.04;
    const mutedFgL = fgHSL.l;             // 與前景同色調,只降飽和度
    const borderL = bgHSL.l + d * 0.08;
    const inputL = bgHSL.l + d * 0.10;
    const destructiveL = isDark ? 0.55 : 0.50; // 紅色在深淺底都用同一飽和度,只調亮度

    return {
        background: `${bgHSL.h} ${Math.round(bgHSL.s * 100)}% ${Math.round(bgHSL.l * 100)}%`,
        foreground: `${fgHSL.h} ${Math.round(fgHSL.s * 100)}% ${Math.round(fgHSL.l * 100)}%`,
        sidebar: `${bgHSL.h} ${Math.round(bgHSL.s * 80)}% ${Math.round(sidebarL * 100)}%`,
        rail: `${bgHSL.h} ${Math.round(bgHSL.s * 70)}% ${Math.round(railL * 100)}%`,
        paper: `${bgHSL.h} ${Math.round(bgHSL.s * 70)}% ${Math.round(paperL * 100)}%`,
        card: `${bgHSL.h} ${Math.round(bgHSL.s * 80)}% ${Math.round(cardL * 100)}%`,
        cardForeground: `${fgHSL.h} ${Math.round(fgHSL.s * 100)}% ${Math.round(fgHSL.l * 100)}%`,
        popover: `${bgHSL.h} ${Math.round(bgHSL.s * 80)}% ${Math.round(popoverL * 100)}%`,
        popoverForeground: `${fgHSL.h} ${Math.round(fgHSL.s * 100)}% ${Math.round(fgHSL.l * 100)}%`,
        // primary / ring / selection 直接用強調色;accent 是 hover/focus 用的低調背景。
        primary: `${accHSL.h} ${Math.round(accHSL.s * 100)}% ${Math.round(accHSL.l * 100)}%`,
        primaryForeground: `${hexToHSL(contrastFG(accHSL)).h} ${Math.round(hexToHSL(contrastFG(accHSL)).s * 100)}% ${Math.round(hexToHSL(contrastFG(accHSL)).l * 100)}%`,
        secondary: `${bgHSL.h} ${Math.round(bgHSL.s * 60)}% ${Math.round(secondaryL * 100)}%`,
        secondaryForeground: `${fgHSL.h} ${Math.round(fgHSL.s * 100)}% ${Math.round(fgHSL.l * 100)}%`,
        muted: `${bgHSL.h} ${Math.round(bgHSL.s * 50)}% ${Math.round(mutedL * 100)}%`,
        mutedForeground: `${fgHSL.h} ${Math.round(fgHSL.s * 40)}% ${Math.round(mutedFgL * 100)}%`,
        accent: `${bgHSL.h} ${Math.round(bgHSL.s * 70)}% ${Math.round(accentL * 100)}%`,
        accentForeground: `${fgHSL.h} ${Math.round(fgHSL.s * 100)}% ${Math.round(fgHSL.l * 100)}%`,
        destructive: `${0} 70% ${Math.round(destructiveL * 100)}%`,
        destructiveForeground: '0 0% 98%',
        border: `${bgHSL.h} ${Math.round(bgHSL.s * 60)}% ${Math.round(borderL * 100)}%`,
        input: `${bgHSL.h} ${Math.round(bgHSL.s * 60)}% ${Math.round(inputL * 100)}%`,
        ring: `${accHSL.h} ${Math.round(accHSL.s * 100)}% ${Math.round(accHSL.l * 100)}%`,
        selection: `${accHSL.h} 80% ${Math.round(accHSL.l * 100)}%`,
    } as Record<string, string>;
}

// 把 deriveTokens 的結果套到 document.documentElement 的 CSS 自訂屬性上(inline style)。
// style.css 已用 var(--background) 等;只要覆寫有變動的屬性就好,沒給的就 fallback 到 class。
export function applyDerivedTokens(tokens: Record<string, string>) {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(tokens)) {
        root.style.setProperty('--' + k, v);
    }
}

// 還原 inline style 的所有 token(讓 class 重新生效)
export function clearDerivedTokens() {
    const root = document.documentElement;
    const keys = ['background', 'foreground', 'sidebar', 'rail', 'paper', 'card', 'card-foreground',
        'popover', 'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
        'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
        'border', 'input', 'ring', 'selection'];
    for (const k of keys) root.style.removeProperty('--' + k);
}