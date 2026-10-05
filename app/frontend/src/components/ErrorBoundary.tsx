// 錯誤防護(SPEC §16 第 0 項):未捕捉的 render 錯誤不再讓整個視窗全白。
// - RootBoundary:最外層防護,接到錯誤時先執行 emergencySave 保住未存的稿件,再顯示錯誤畫面。
//   存檔失敗時,錯誤畫面提供唯讀 textarea 放原文與「複製全文」,作者必須能取回未存的字。
// - AreaBoundary:區域防護(ChatWindow / Inspector / 側欄),單一區塊出錯時顯示簡短錯誤與「重試」,
//   fallback 版面比照原容器(chat 為 fixed 小卡片、inspector/側欄保留原欄寬),不擠壓編輯器。
// - 開發模式拋錯點:main.tsx 在 DEV 下掛 window.__perkinsCrash 與 window.__perkinsSaveFail,
//   E2E 用它們刻意讓某區下一次 render 拋錯、或模擬緊急存檔失敗。正式建置不存在。
import * as React from 'react';
import {Button} from '@/components/ui/button';
import {cn, errText} from '@/lib/utils';

// 緊急存檔的救援資料:在呼叫 SaveFile 前就取好,存檔失敗時錯誤畫面靠它還原原文。
// 不可寫入 log 或任何檔案(私人稿件)。
export type RescueData = {path: string; text: string} | null;

export interface EmergencySave {
    save: () => Promise<void>;
    rescue: () => RescueData;
}

let emergencySave: EmergencySave | null = null;

export function registerEmergencySave(fn: EmergencySave | null) {
    emergencySave = fn;
}

// 開發模式專用:下一次緊急存檔模擬失敗(E2E 用)
let failNextSave = false;

export function setEmergencySaveFail(v: boolean) {
    failNextSave = v;
}

// 開發模式專用的拋錯旗標:E2E 透過 window.__perkinsCrash 設定,下一次 render 生效
const crashFlags: Record<string, boolean> = {};
const crashListeners: (() => void)[] = [];

export function requestCrash(area: string) {
    crashFlags[area] = true;
    for (const l of crashListeners) l(); // 通知 App 內的監聽元件強制重繪,讓拋錯點有機會執行
}

export function onCrashRequest(cb: () => void): () => void {
    crashListeners.push(cb);
    return () => { const i = crashListeners.indexOf(cb); if (i >= 0) crashListeners.splice(i, 1); };
}

function clearCrash(area: string) { delete crashFlags[area]; }

// 拋錯點:掛在各 AreaBoundary 的子樹內。正式建置(import.meta.env.DEV 為 false)時永遠回傳 null。
export function CrashPoint({area}: {area: string}) {
    if (import.meta.env.DEV && crashFlags[area]) throw new Error(`開發模式刻意拋錯(${area})`);
    return null;
}

interface AreaBoundaryProps {
    area: 'chat' | 'inspector' | 'sidebar';
    // fallback 的版面:chat 用 fixed 小卡片、inspector/側欄比照原欄寬,避免擠壓編輯器
    fallbackClassName?: string;
    children: React.ReactNode;
}

type AreaState = {error: Error | null};

// 區域防護:該區顯示簡短錯誤與「重試」,重設 boundary 狀態後重新嘗試 render
export class AreaBoundary extends React.Component<AreaBoundaryProps, AreaState> {
    state: AreaState = {error: null};

    static getDerivedStateFromError(error: Error): AreaState {
        return {error};
    }

    componentDidCatch() {
        // 旗標用過就清掉,否則「重試」會立刻再拋一次
        if (import.meta.env.DEV) clearCrash(this.props.area);
    }

    retry = () => this.setState({error: null});

    render() {
        if (this.state.error) {
            return (
                <div data-testid={`area-error-${this.props.area}`}
                     className={cn('flex min-w-0 flex-col gap-3 p-4 text-center', this.props.fallbackClassName)}>
                    <p className="break-words text-sm text-destructive">
                        此區塊發生錯誤,其他區域不受影響:{errText(this.state.error)}
                    </p>
                    <Button size="sm" variant="outline" onClick={this.retry}>重試</Button>
                </div>
            );
        }
        return this.props.children;
    }
}

type SaveState = 'saving' | 'saved' | 'failed' | null;
type CopyState = 'none' | 'copying' | 'ok' | 'failed';
type RootState = {error: Error | null; save: SaveState; saveMsg: string; rescue: RescueData; copied: CopyState; confirming: boolean};

// 最外層防護:先緊急存檔再顯示錯誤畫面;存檔中不可重新載入,失敗時提供原文救援。
// 放棄未存內容需兩段式確認(不用 window.confirm);「複製全文」為主要按鈕。
export class RootBoundary extends React.Component<{children: React.ReactNode}, RootState> {
    state: RootState = {error: null, save: null, saveMsg: '', rescue: null, copied: 'none', confirming: false};

    constructor(props: {children: React.ReactNode}) {
        super(props);
        // 開發模式:E2E 破壞驗證用 — 直接呼叫本元件方法(繞過 disabled 屬性仍被 handler 擋住的路徑)
        if (import.meta.env.DEV) (window as any).__perkinsBoundary = this;
    }

    static getDerivedStateFromError(error: Error): RootState {
        return {error, save: null, saveMsg: '', rescue: null, copied: 'none', confirming: false};
    }

    componentDidCatch() {
        const fn = emergencySave;
        // 先取救援資料(卸載後 latest ref 仍可讀,但不可依賴卸載後的 setState),再嘗試存檔
        const rescue = fn?.rescue?.() ?? null;
        if (!fn || !rescue) {
            this.setState({save: null, rescue: null, copied: 'none'});
            return;
        }
        const failNow = failNextSave; // 開發模式專用,用過即清
        failNextSave = false;
        this.setState({save: 'saving', rescue, copied: 'none'});
        const p: Promise<void> = failNow ? Promise.reject(new Error('開發模式模擬存檔失敗')) : fn.save();
        p.then(
            () => this.setState({save: 'saved'}),
            (e: unknown) => this.setState({save: 'failed', saveMsg: errText(e)}),
        );
    }

    // 複製進行中(Promise 未結束):停用複製與放棄;結束前不可重載
    copying = () => this.state.copied === 'copying';

    copyAll = () => {
        const {rescue} = this.state;
        if (import.meta.env.DEV) (window as any).__perkinsCopyCalls = ((window as any).__perkinsCopyCalls ?? 0) + 1;
        if (!rescue) return;
        if (this.copying()) return; // 防重入:連按不啟動第二個 Promise
        this.setState({copied: 'copying'});
        navigator.clipboard.writeText(rescue.text).then(
            () => this.setState({copied: 'ok'}),
            () => this.setState({copied: 'failed'}),
        );
    };

    abandon = () => {
        if (this.copying()) return; // 複製未完成不可重載
        this.setState({confirming: true});
    };

    confirmAbandon = () => {
        if (this.copying()) return; // 複製未完成不可重載
        window.location.reload();
    };

    render() {
        const {error, save, saveMsg, rescue, copied, confirming} = this.state;
        if (!error) return this.props.children;
        return (
            <div data-testid="root-error" className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
                <h1 className="font-serif text-xl font-semibold">介面發生錯誤</h1>
                <p className="max-w-xl text-sm text-destructive">{errText(error)}</p>
                {save === 'saving' && (
                    <p data-testid="emergency-save" data-save-state="saving" className="text-sm text-muted-foreground">
                        正在儲存未寫入的內容…(儲存完成前無法重新載入;下方原文可先複製)
                    </p>
                )}
                {/* saving 期間也提供已捕獲原文的唯讀 textarea 與「複製全文」(review-merge:
                    在途存檔一直 pending 時,作者仍要能取回原文);放棄/重載仍只在 failed 提供 */}
                {save === 'saving' && rescue && (
                    <div className="flex w-full max-w-xl flex-col items-center gap-3">
                        <textarea data-testid="rescue-text" readOnly value={rescue.text}
                                  onFocus={e => e.currentTarget.select()}
                                  className="h-56 w-full whitespace-pre-wrap break-words rounded-md border bg-background p-2 font-mono text-sm"/>
                        <div className="flex items-center gap-3">
                            <Button size="sm" data-copy-main disabled={this.copying()} onClick={this.copyAll}>複製全文</Button>
                            {copied === 'ok' && <span className="text-sm text-success">已複製</span>}
                            {copied === 'failed' && <span className="text-sm text-destructive">複製失敗,請手動全選複製</span>}
                        </div>
                    </div>
                )}
                {save === 'saved' && (
                    <p data-testid="emergency-save" data-save-state="saved" className="text-sm text-success">
                        未儲存的內容已存檔。
                    </p>
                )}
                {save === 'failed' && rescue && (
                    <div className="flex w-full max-w-xl flex-col items-center gap-3">
                        <p data-testid="emergency-save" data-save-state="failed" className="text-sm text-destructive">
                            存檔失敗:{rescue.path}({saveMsg})。下方是尚未儲存的原文,請先複製保存。
                        </p>
                        <textarea data-testid="rescue-text" readOnly value={rescue.text}
                                  onFocus={e => e.currentTarget.select()}
                                  className="h-56 w-full whitespace-pre-wrap break-words rounded-md border bg-background p-2 font-mono text-sm"/>
                        <div className="flex items-center gap-3">
                            <Button size="sm" data-copy-main disabled={this.copying()} onClick={this.copyAll}>複製全文</Button>
                            {copied === 'ok' && <span className="text-sm text-success">已複製</span>}
                            {copied === 'failed' && <span className="text-sm text-destructive">複製失敗,請手動全選複製</span>}
                        </div>
                        {confirming ? (
                            <div className="flex flex-col items-center gap-2">
                                <p className="text-sm text-warning">尚未儲存的原文將無法取回,確定要放棄?</p>
                                <div className="flex items-center gap-3">
                                    <Button size="sm" variant="outline" className="text-destructive" data-testid="confirm-abandon"
                                            disabled={this.copying()}
                                            onClick={this.confirmAbandon}>確定放棄並重新載入</Button>
                                    <Button size="sm" variant="outline" data-testid="cancel-abandon" onClick={() => this.setState({confirming: false})}>取消</Button>
                                </div>
                            </div>
                        ) : (
                            <Button size="sm" variant="ghost" className="text-destructive" data-testid="reload-app"
                                    disabled={this.copying()} // 複製進行中停用放棄
                                    onClick={this.abandon}>放棄未存內容並重新載入</Button>
                        )}
                    </div>
                )}
                {save === null && <p className="text-sm text-muted-foreground">沒有需要緊急存檔的未存內容。</p>}
                {save !== 'failed' && (
                    <Button data-testid="reload-app" disabled={save === 'saving'}
                            onClick={() => window.location.reload()}>重新載入</Button>
                )}
            </div>
        );
    }
}
