// 關閉前存檔保護(SPEC §17.1)。
//
// 為什麼放在 React 樹之外:收到關閉事件時,RootBoundary 可能正在顯示錯誤畫面(整個 App 已卸載),
// 存檔提示仍必須能運作。因此監聽在模組層安裝,失敗提示用獨立的 React root 掛到 document.body。
//
// 兩條存檔路徑分工(不要互相打架):
// - 崩潰救援(ErrorBoundary.startCrashSave):Workspace 卸載後只能用單次寫入,狀態記在模組層(crashSave)。
// - 關閉存檔:App 還掛著時走 Workspace 的序列化存檔迴圈(saveAll),確保最新 editVersion 落盤才放行。
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {ConfirmQuit} from '../../wailsjs/go/main/App';
import {EventsOn} from '../../wailsjs/runtime/runtime';
import {getCrashSave, getEmergencySave, runSaveStep, waitCrashSave} from '@/components/ErrorBoundary';
import {Button} from '@/components/ui/button';
import {errText} from '@/lib/utils';

export const CLOSE_REQUEST_EVENT = 'perkins:close-request';

// 流程進行中(存檔中或提示開著)不再啟動第二個流程。提示關掉、或流程結束沒跳提示時才解鎖;
// 不靠外部 reset(取消後直接再按關閉必須能重跑一次流程)。
let running = false;

export function installQuitGuard() {
    EventsOn(CLOSE_REQUEST_EVENT, () => { void handleCloseRequest(); });
}

export async function handleCloseRequest(): Promise<void> {
    if (running) return;
    running = true;
    const prompted = await runCloseFlow();
    if (!prompted) running = false; // 提示開著時維持鎖住,由提示的按鈕解鎖
}

// 回傳是否顯示了「存檔失敗」提示。
async function runCloseFlow(): Promise<boolean> {
    // (1) 崩潰後的緊急存檔正在進行:等它結束再決定放行或提示(不能搶在它前面關掉)
    if (getCrashSave().state === 'saving') await waitCrashSave();

    // (2) 崩潰且緊急存檔失敗:磁碟已知寫不進去,直接顯示同一份救援提示
    const crash = getCrashSave();
    if (crash.state === 'failed' && crash.rescue) {
        showQuitPrompt(crash.rescue.path, crash.message, crash.rescue.text);
        return true;
    }

    // (3) 正常路徑:沒有未存內容就放行;有就存完(序列化迴圈)才 ConfirmQuit
    const reg = getEmergencySave();
    const rescue = reg?.rescue?.() ?? null;
    if (!reg || !rescue) {
        await confirmQuit();
        return false;
    }
    try {
        // 用共用入口才吃得到存檔失敗模擬(與崩潰救援同一套)
        await runSaveStep(() => reg.saveAll());
        await confirmQuit();
    } catch (e) {
        showQuitPrompt(rescue.path, errText(e), rescue.text);
        return true;
    }
    return false;
}

async function confirmQuit() {
    await ConfirmQuit();
}

type CopyState = 'none' | 'ok' | 'failed';

function QuitPrompt({path, message, text, onForce, onCancel}: {
    path: string; message: string; text: string; onForce: () => void; onCancel: () => void;
}) {
    const [copied, setCopied] = React.useState<CopyState>('none');
    const box = React.useRef<HTMLDivElement>(null);
    // 焦點移到提示:Radix 對話框開著時焦點被鎖在對話框內,不搶過來的話作者按不到提示
    React.useEffect(() => { box.current?.focus(); }, []);
    const copy = () => {
        navigator.clipboard.writeText(text).then(() => setCopied('ok'), () => setCopied('failed'));
    };
    return (
        <div data-testid="quit-prompt"
             className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6">
            <div ref={box} tabIndex={-1} data-testid="quit-prompt-box"
                 className="w-full max-w-xl rounded-lg border bg-card p-5 text-card-foreground shadow-lg outline-none">
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
                    onForce={() => { dispose(); void confirmQuit().finally(() => { running = false; }); }}
                    onCancel={() => { dispose(); running = false; }}/>,
    );
}
