// 介面轉場(#120,UI_GUIDE §15):只做進場動畫,200ms ease-out,沿用 tailwindcss-animate。
// 元件掛載(或從 display:none 變回顯示)時播放一次;html.reduce-motion 時由 style.css 歸零。
const base = 'animate-in fade-in-0 duration-200 ease-out';
export const enter = {
    fade: base,
    rise: `${base} slide-in-from-bottom-2`,
    fromLeft: `${base} slide-in-from-left-3`,
    fromRight: `${base} slide-in-from-right-3`,
};
