// 錯誤防護(SPEC §16 第 0 項):未捕捉的 render 錯誤不再讓整個視窗全白。
// - RootBoundary:最外層防護,接到錯誤時先執行 emergencySave 保住未存的稿件,再顯示錯誤畫面。
// - AreaBoundary:區域防護(ChatWindow / Inspector / 側欄),單一區塊出錯時顯示簡短錯誤與「重試」,編輯器照常運作。
// - 開發模式拋錯點:main.tsx 在 DEV 下掛 window.__perkinsCrash,E2E 用它刻意讓某區下一次 render 拋錯。
import * as React from 'react';
import {Button} from '@/components/ui/button';
import {cn, errText} from '@/lib/utils';

// 模組層級緊急存檔:Workspace 把讀 latest ref 的 save 註冊進來。
// React 卸載後 ref 仍可讀,但不可依賴卸載後的 setState,所以這裡只做 SaveFile 本身。
let emergencySave: (() => Promise<void>) | null = null;

export function registerEmergencySave(fn: (() => Promise<void>) | null) {
    emergencySave = fn;
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
    className?: string;
    children: React.ReactNode;
}

type AreaState = {error: Error | null};

// 區域防護:該區顯示簡短錯誤與「重試」,重設 boundary 狀態後重新嘗試 render
export class AreaBoundary extends React.Component<AreaBoundaryProps, AreaState> {
    state: AreaState = {error: null};

    static getDerivedStateFromError(error: Error): AreaState {
        return {error};
    }

    componentDidCatch(error: Error) {
        // 旗標用過就清掉,否則「重試」會立刻再拋一次
        if (import.meta.env.DEV) clearCrash(this.props.area);
    }

    retry = () => this.setState({error: null});

    render() {
        if (this.state.error) {
            return (
                <div data-testid={`area-error-${this.props.area}`}
                     className={cn('flex flex-col items-center justify-center gap-3 p-6 text-center', this.props.className)}>
                    <p className="text-sm text-destructive">此區塊發生錯誤,其他區域不受影響:{errText(this.state.error)}</p>
                    <Button size="sm" variant="outline" onClick={this.retry}>重試</Button>
                </div>
            );
        }
        return this.props.children;
    }
}

type RootState = {error: Error | null; save: 'saving' | 'saved' | 'failed' | null; saveMsg: string};

// 最外層防護:先緊急存檔再顯示錯誤畫面,存檔成功/失敗都寫在畫面上
export class RootBoundary extends React.Component<{children: React.ReactNode}, RootState> {
    state: RootState = {error: null, save: null, saveMsg: ''};

    static getDerivedStateFromError(error: Error): RootState {
        return {error, save: null, saveMsg: ''};
    }

    componentDidCatch(error: Error) {
        const fn = emergencySave;
        if (!fn) return;
        this.setState({save: 'saving'});
        fn().then(
            () => this.setState({save: 'saved'}),
            (e: unknown) => this.setState({save: 'failed', saveMsg: errText(e)}),
        );
    }

    render() {
        const {error, save, saveMsg} = this.state;
        if (!error) return this.props.children;
        return (
            <div data-testid="root-error" className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
                <h1 className="font-serif text-xl font-semibold">介面發生錯誤</h1>
                <p className="max-w-xl text-sm text-destructive">{errText(error)}</p>
                {save === 'saving' && <p data-testid="emergency-save" className="text-sm text-muted-foreground">正在儲存未寫入的內容…</p>}
                {save === 'saved' && <p data-testid="emergency-save" className="text-sm text-success">未儲存的內容已存檔。</p>}
                {save === 'failed' && (
                    <p data-testid="emergency-save" className="max-w-xl text-sm text-destructive">
                        存檔失敗:{saveMsg}。請勿關閉視窗,畫面上仍有內容時請手動複製。
                    </p>
                )}
                {save === null && <p className="text-sm text-muted-foreground">沒有需要緊急存檔的未存內容。</p>}
                <Button onClick={() => window.location.reload()} data-testid="reload-app">重新載入</Button>
            </div>
        );
    }
}
