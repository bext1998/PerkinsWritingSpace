// 關閉前存檔保護(SPEC §17.1)。
//
// 為什麼放在 React 樹之外:收到關閉事件時,RootBoundary 可能正在顯示錯誤畫面(整個 App 已卸載),
// 存檔提示仍必須能運作。因此監聽在模組層安裝,失敗提示用獨立的 React root 掛到 document.body。
//
// 流程:收到 Go 的 perkins:close-request → 呼叫已註冊的緊急存檔(ErrorBoundary 的 emergencySave,
// 不另寫一套)→ 成功或沒有未存內容就 ConfirmQuit();失敗則顯示提示,作者明確選擇才關閉。
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {ConfirmQuit} from '../../wailsjs/go/main/App';
import {EventsOn} from '../../wailsjs/runtime/runtime';
import {getEmergencySave, runEmergencySave} from '@/components/ErrorBoundary';
import {Button} from '@/components/ui/button';
import {errText} from '@/lib/utils';

export const CLOSE_REQUEST_EVENT = 'perkins:close-request';

// 進行中或提示已開啟時不再啟動第二個流程(存檔中連按關閉也只跑一次)
let running = false;

export function installQuitGuard() {
    EventsOn(CLOSE_REQUEST_EVENT, () => { void handleCloseRequest(); });
}

export async function handleCloseRequest(): Promise<void> {
    if (running) return;
    running = true;

    const em = getEmergencySave();
    const rescue = em?.rescue?.() ?? null; // 沒開作品或沒有未存內容 → null
    if (!em || !rescue) {
        await confirmQuit();
        return;
    }
    try {
        await runEmergencySave(em);
        await confirmQuit();
    } catch (e) {
        showQuitPrompt(rescue.path, errText(e), rescue.text);
    }
}

async function confirmQuit() {
    await ConfirmQuit();
}

// (DEV)E2E 每個情境都要從乾淨狀態開始;正式建置不會呼叫。
export function resetQuitGuard() {
    running = false;
}

type CopyState = 'none' | 'ok' | 'failed';

function QuitPrompt({path, message, text, onForce, onCancel}: {
    path: string; message: string; text: string; onForce: () => void; onCancel: () => void;
}) {
    const [copied, setCopied] = React.useState<CopyState>('none');
    const copy = () => {
        navigator.clipboard.writeText(text).then(() => setCopied('ok'), () => setCopied('failed'));
    };
    return (
        <div data-testid="quit-prompt" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6">
            <div className="w-full max-w-xl rounded-lg border bg-card p-5 text-card-foreground shadow-lg">
                <h2 className="text-sm font-semibold">關閉前存檔失敗</h2>
                <p data-testid="quit-failed-msg" className="mt-2 break-words text-xs text-destructive">
                    存檔失敗:{path}({message})。直接關閉會遺失尚未儲存的內容。
                </p>
                <textarea data-testid="quit-rescue-text" readOnly value={text} onFocus={e => e.currentTarget.select()}
                          className="mt-3 h-40 w-full whitespace-pre-wrap break-words rounded-md border bg-background p-2 font-mono text-xs"/>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" data-testid="quit-copy" onClick={copy}>複製全文</Button>
                    {copied === 'ok' && <span className="text-xs text-success">已複製</span>}
                    {copied === 'failed' && <span className="text-xs text-destructive">複製失敗,請手動全選複製</span>}
                    <div className="ml-auto flex gap-2">
                        <Button size="sm" variant="ghost" data-testid="quit-cancel" onClick={onCancel}>取消</Button>
                        <Button size="sm" variant="outline" className="text-destructive" data-testid="quit-force"
                                onClick={onForce}>仍要關閉(未存內容會遺失)</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function showQuitPrompt(path: string, message: string, text: string) {
    const host = document.createElement('div');
    host.dataset.testid = 'quit-prompt-host';
    document.body.appendChild(host);
    const root = createRoot(host);
    // 不在 React 事件中同步 unmount(會警告),下一個 tick 再收掉
    const dispose = () => setTimeout(() => { root.unmount(); host.remove(); }, 0);
    root.render(
        <QuitPrompt path={path} message={message} text={text}
                    onForce={() => { dispose(); void confirmQuit(); }}
                    onCancel={() => { dispose(); running = false; }}/>,
    );
}
