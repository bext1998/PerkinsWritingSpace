// Issue #118(SPEC §17.2 外觀頁):自訂主題的工具函式。
// deriveTokens(bg, fg, accent, isDark) 是純函式:給背景/前景/強調色,
// 以 HSL 微調推算 sidebar、rail、paper、card、popover、muted、border 等 token。
// CSS 自訂屬性值是「H S% L%」(與 :root/.dark 內既有的格式一致),不是完整 hsl(),
// 否則 tailwind 的 hsl(var(--xxx)) 套不出來。
//
// (#118 重工)背景或文字自訂時推算整組 token;只改強調色時只覆寫 primary 系屬性,
// 其他保留主題預設檔原值 — 不能再用寫死的 fallback(會覆蓋深灰/米白)。

export type AccentName = 'amber' | 'blue' | 'green' | 'red' | 'purple' | 'cyan';
export const ACCENT_PRESETS: {id: AccentName; label: string; hex: string}[] = [
    {id: 'amber', label: '琥珀', hex: '#d99749'},
    {id: 'blue', label: '藍', hex: '#4f8bcb'},
    {id: 'green', label: '綠', hex: '#5fa86b'},
    {id: 'red', label: '紅', hex: '#c75a5a'},
    {id: 'purple', label: '紫', hex: '#9a78c4'},
    {id: 'cyan', label: '青', hex: '#4ea0a0'},
];

// Hex 正則:7 字元小寫 #rrggbb(輸入允許大寫,存進設定檔一律小寫)。
export const HEX_RE = /^#[0-9a-f]{6}$/;

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

// HSL→Hex:以 sRGB 線性近似,不要求高精度(只是要讀主題原色作 fallback,後面會 round-trip)。
export function hslToHex({h, s, l}: HSL): string {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) {r = c; g = x;} else if (hp < 2) {r = x; g = c;}
    else if (hp < 3) {g = c; b = x;} else if (hp < 4) {g = x; b = c;}
    else if (hp < 5) {r = x; b = c;} else {r = c; b = x;}
    const m = l - c / 2;
    const to255 = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
    return '#' + [to255(r), to255(g), to255(b)].map(n => n.toString(16).padStart(2, '0')).join('');
}

// 「對比前景」:依 luminance 選黑或白,給 primary-foreground 與強調色按鈕的文字用。
// 依實際對比選較清楚的一個(PR #121 審查:只看 HSL 亮度時綠、青會選到白字,對比不到 3:1)
function contrastFG(hsl: HSL): string {
    const dark = '#181818', light = '#f8f5ee';
    return contrastRatio(hsl, hexToHSL(dark)) >= contrastRatio(hsl, hexToHSL(light)) ? dark : light;
}

// 相對亮度(0~1),WCAG 用。
function relLuminance({h, s, l}: HSL): number {
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
    const sidebarL = bgHSL.l + d * 0.025;
    const railL = bgHSL.l + d * 0.045;
    const paperL = bgHSL.l + d * 0.018;
    const cardL = bgHSL.l + d * 0.012;
    const popoverL = bgHSL.l + d * 0.022;
    const secondaryL = bgHSL.l + d * 0.06;
    const accentL = bgHSL.l + d * 0.06;
    const mutedL = bgHSL.l + d * 0.04;
    const mutedFgL = fgHSL.l;
    const borderL = bgHSL.l + d * 0.08;
    const inputL = bgHSL.l + d * 0.10;
    const destructiveL = isDark ? 0.55 : 0.50;

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
export function applyDerivedTokens(tokens: Record<string, string>) {
    const root = document.documentElement;
    // deriveTokens 的鍵是 camelCase(cardForeground),CSS 變數是 kebab-case(--card-foreground)
    for (const [k, v] of Object.entries(tokens)) root.style.setProperty('--' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), v);
}

// 還原 inline style 的所有 token(讓 class 重新生效)。
const TOKEN_KEYS = ['background', 'foreground', 'sidebar', 'rail', 'paper', 'card', 'card-foreground',
    'popover', 'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
    'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
    'border', 'input', 'ring', 'selection'];
export function clearDerivedTokens() {
    const root = document.documentElement;
    for (const k of TOKEN_KEYS) root.style.removeProperty('--' + k);
}

// 從目前 html 的 class(.dark/.light + .theme-*)讀主題預設檔實際生效的 token 值。
// 主題預設檔是 style.css 寫死的;作者沒自訂某個屬性時,這個值就是「主題原值」,
// 讓我們推算其他屬性時可以拿到準確的色調與亮度,不會把深灰/米白蓋掉。
export function readThemeToken(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
}

// HSL 物件的 toHex 方法,給 readThemeToken 回傳的 "H S% L%" 字串做 fallback 用。
function hslFromString(s: string): HSL {
    const parts = s.trim().split(/\s+/);
    if (parts.length !== 3) return {h: 0, s: 0, l: 0};
    return {h: parseFloat(parts[0]) || 0, s: (parseFloat(parts[1]) || 0) / 100, l: (parseFloat(parts[2]) || 0) / 100};
}

// 給定一側的自訂色設定,套到 html(背景/文字自訂 → 整組 token;只改強調色 → 只覆寫 primary 系)。
// 沒自訂 → 清掉所有 inline style,讓 class 的預設值重新生效。
export function applyCustomSide(sideCfg: {accent?: string; background?: string; foreground?: string}, isDark: boolean) {
    const accent = sideCfg.accent || '';
    const background = sideCfg.background || '';
    const foreground = sideCfg.foreground || '';
    // 先清掉上一次的覆寫,下面讀到的才是主題預設檔原值,而不是自己之前蓋上去的自訂色
    clearDerivedTokens();
    if (!(background || foreground || accent)) return;

    // 沒自訂的欄位:讀主題預設檔的實際值(不寫死,才不會把深灰/米白蓋掉)。
    const fallbackBgHex = background || hslToHex(hslFromString(readThemeToken('background')));
    const fallbackFgHex = foreground || hslToHex(hslFromString(readThemeToken('foreground')));
    const fallbackAccentHex = accent || hslToHex(hslFromString(readThemeToken('primary')));

    const tokens = deriveTokens(fallbackBgHex, fallbackFgHex, fallbackAccentHex, isDark);

    if (!background && !foreground) {
        // 只改強調色:只覆寫 primary/primary-foreground/ring/selection,
        // 其他屬性保留主題預設檔原值(深灰、米白的色調不會被蓋掉)。
        const root = document.documentElement;
        root.style.setProperty('--primary', tokens.primary);
        root.style.setProperty('--primary-foreground', tokens.primaryForeground);
        root.style.setProperty('--ring', tokens.ring);
        root.style.setProperty('--selection', tokens.selection);
    } else {
        // 背景或文字自訂:推算整組覆蓋掉主題預設檔。
        applyDerivedTokens(tokens);
    }
}