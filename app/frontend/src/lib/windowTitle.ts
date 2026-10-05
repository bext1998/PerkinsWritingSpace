// 標題欄(SPEC §17.1)要顯示的作品名稱。
// 放在 React 之外的模組層狀態:標題欄掛在 RootBoundary 之外,錯誤畫面出現時仍拿得到最後一次的名稱。
let projectName: string | null = null;
const listeners = new Set<(n: string | null) => void>();

export function getProjectName(): string | null {
    return projectName;
}

export function setProjectName(name: string | null) {
    if (projectName === name) return;
    projectName = name;
    for (const l of listeners) l(name);
}

export function onProjectNameChange(cb: (n: string | null) => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}
