// 外殼狀態(React 樹外):標題欄掛在 RootBoundary 之外,錯誤畫面出現時仍要正確顯示。
// - 作品名稱:App 開啟/切換作品時寫入。
// - 作品外框是否看得到:作品畫面的圖示列與標題欄連成同色 L 形外框(SPEC §17.1);
//   設定頁蓋住它、書櫃與崩潰畫面沒有它。標題欄據此決定底線、側欄開關與作品相關選單項,
//   不要只看「有沒有開作品」。
// - 動作:App/Workspace 掛載時登記標題欄選單與側欄開關要呼叫的函式,卸載時清掉;
//   沒登記的項目標題欄就不顯示。
export interface ShellActions {
    settings?: () => void;
    bookshelf?: () => void;
    save?: () => void;
    sidebar?: {open: boolean; toggle: () => void};
    zen?: {on: boolean; toggle: () => void};
}

let projectName: string | null = null;
let frameVisible = false;
let actions: ShellActions = {};
const listeners = new Set<() => void>();

export function getProjectName(): string | null {
    return projectName;
}

export function isFrameVisible(): boolean {
    return frameVisible;
}

export function getShellActions(): ShellActions {
    return actions;
}

export function setProjectName(name: string | null) {
    if (projectName === name) return;
    projectName = name;
    emit();
}

export function setFrameVisible(visible: boolean) {
    if (frameVisible === visible) return;
    frameVisible = visible;
    emit();
}

export function setShellActions(next: Partial<ShellActions>) {
    actions = {...actions, ...next};
    emit();
}

function emit() {
    for (const l of listeners) l();
}

export function subscribeShellState(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}
