// 介面轉場(#120,UI_GUIDE §15):只做進場動畫,200ms ease-out,沿用 tailwindcss-animate。
// 元件掛載(或從 display:none 變回顯示)時播放一次;html.reduce-motion 時由 style.css 歸零。
// 時長用 [animation-duration:200ms] 而非 duration-200:後者同時設定 transition-duration,
// 而 transition-property 預設是 all,會讓元素的 left/top/寬度等變化都跟著漸變(浮窗拖曳、回到畫面內會慢半拍)
const base = 'animate-in fade-in-0 [animation-duration:200ms] [animation-timing-function:cubic-bezier(0,0,0.2,1)]';
export const enter = {
    fade: base,
    rise: `${base} slide-in-from-bottom-2`,
    fromLeft: `${base} slide-in-from-left-3`,
    fromRight: `${base} slide-in-from-right-3`,
};
