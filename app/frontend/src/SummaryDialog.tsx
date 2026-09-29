import {useEffect, useState} from 'react';
import {Loader2, Save, Sparkles, Square, TriangleAlert} from 'lucide-react';
import {CancelAsk, DraftSummary, GetSummary, SaveSummary} from '../wailsjs/go/main/App';
import {EventsOn} from '../wailsjs/runtime/runtime';
import {main, summary} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Badge, Checkbox, Textarea} from '@/components/ui/basic';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/overlay';
import {baseName, errText} from '@/lib/utils';
import type {Toast} from './Workspace';

interface Props {
    chapter: string | null;
    onClose: () => void;
    cfg: main.SettingsView | null;
    remoteOk: Record<string, boolean>;
    setRemoteOk: (f: (r: Record<string, boolean>) => Record<string, boolean>) => void;
    saveFirst: () => Promise<void>;
    notify: (t: Toast) => void;
}

/** 章節摘要:AI 草擬只放在這個對話框裡,作者按「儲存」才成為前情摘要(B6)。 */
export default function SummaryDialog({chapter, onClose, cfg, remoteOk, setRemoteOk, saveFirst, notify}: Props) {
    const [sum, setSum] = useState<summary.Summary | null>(null);
    const [text, setText] = useState('');
    const [drafting, setDrafting] = useState(false);
    const [error, setError] = useState('');
    const profile = cfg?.profiles.find(p => p.id === cfg.active);
    const needsConfirm = !!profile?.remote && !remoteOk[profile.id];

    useEffect(() => {
        setSum(null);
        setText('');
        setError('');
        if (chapter) GetSummary(chapter).then(s => { setSum(s); setText(s.text); }).catch(e => setError(errText(e)));
    }, [chapter]);

    const draft = async () => {
        if (!chapter) return;
        if (needsConfirm) { setError('目前的端點在本機之外:請先勾選確認。'); return; }
        setDrafting(true);
        setError('');
        setText('');
        const off = EventsOn('summary:delta', (d: string) => setText(t => t + d));
        try {
            await saveFirst();
            setText(await DraftSummary(chapter));
        } catch (e) { setError(errText(e)); }
        off();
        setDrafting(false);
    };

    const save = async () => {
        if (!chapter) return;
        try {
            await SaveSummary(chapter, text);
            notify({text: '摘要已儲存,之後的章節可以把它當作前情提供給 AI。', kind: 'ok'});
            onClose();
        } catch (e) { setError(errText(e)); }
    };

    const unsaved = text.trim() !== (sum?.text ?? '').trim();

    return (
        <Dialog open={!!chapter} onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>章節摘要 · {chapter ? baseName(chapter) : ''}</DialogTitle>
                    <DialogDescription>
                        儲存後,寫後面章節時可以勾選「前情摘要」把它提供給 AI,不必送出整章全文。
                        AI 草擬的內容只是草稿,在你按下儲存之前不會被任何請求使用。
                    </DialogDescription>
                </DialogHeader>
                {sum?.exists && sum.stale && (
                    <Badge variant="warning" className="w-fit"><TriangleAlert className="h-3 w-3"/>章節在摘要儲存後被修改過,摘要可能過期</Badge>
                )}
                {needsConfirm && profile && (
                    <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                        <Checkbox className="mt-0.5 border-warning" checked={false} onCheckedChange={() => setRemoteOk(r => ({...r, [profile.id]: true}))}/>
                        「{profile.name}」不在這台電腦上,草擬摘要會把本章全文傳到該服務。我了解。
                    </label>
                )}
                <Textarea className="min-h-[16rem] font-serif text-sm leading-relaxed" value={text} data-testid="summary-text"
                          onChange={e => setText(e.target.value)}
                          placeholder="自己寫,或按「AI 草擬」後再修改。建議條列:主要事件、人物變化、新揭露的設定、伏筆。"/>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <DialogFooter className="items-center">
                    {unsaved && <span className="mr-auto text-xs text-primary">尚未儲存</span>}
                    {drafting
                        ? <Button variant="secondary" onClick={() => CancelAsk()}><Square className="!size-3"/>停止</Button>
                        : <Button variant="secondary" onClick={draft} data-testid="draft-summary"><Sparkles/>AI 草擬</Button>}
                    <Button onClick={save} disabled={!text.trim() || drafting} data-testid="save-summary">
                        {drafting ? <Loader2 className="animate-spin"/> : <Save/>}儲存摘要
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
