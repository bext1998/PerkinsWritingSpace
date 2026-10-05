// 外殼狀態(React 樹外):標題欄掛在 RootBoundary 之外,錯誤畫面出現時仍要正確顯示。
// - 作品名稱:App 開啟/切換作品時寫入。
// - 側欄 logo 是否看得到:由目前畫面決定(作品畫面才看得到側欄 logo;設定頁蓋住它、崩潰畫面沒有它)。
//   標題欄據此決定要不要放小 logo,不要只看「有沒有開作品」。
let projectName: string | null = null;
let railLogoVisible = false;
const listeners = new Set<() => void>();

export function getProjectName(): string | null {
    return projectName;
}

export function isRailLogoVisible(): boolean {
    return railLogoVisible;
}

export function setProjectName(name: string | null) {
    if (projectName === name) return;
    projectName = name;
    emit();
}

export function setRailLogoVisible(visible: boolean) {
    if (railLogoVisible === visible) return;
    railLogoVisible = visible;
    emit();
}

function emit() {
    for (const l of listeners) l();
}

export function subscribeShellState(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}
