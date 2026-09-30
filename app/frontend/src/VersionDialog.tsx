import {useEffect, useState} from 'react';
import {Camera, RotateCcw} from 'lucide-react';
import {ListSnapshots, RestoreSnapshot, SnapshotDiff, TakeSnapshot} from '../wailsjs/go/main/App';
import {snapshot} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/basic';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/overlay';
import {cn, errText} from '@/lib/utils';

interface Props {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    current: string | null;
    saveFirst: () => Promise<void>;      // 快照/還原前先存檔,避免未存的文字被忽略或被覆蓋
    onRestored: (files: string[]) => void;
}

const reasonText: Record<string, string> = {
    'manual': '手動',
    'before-accept': '接受提案前',
    'before-restore': '還原前備份',
    'before-import': 'Notion 匯入前',
};

export default function VersionDialog({open, onOpenChange, current, saveFirst, onRestored}: Props) {
    const [list, setList] = useState<snapshot.Meta[]>([]);
    const [label, setLabel] = useState('');
    const [sel, setSel] = useState<snapshot.Meta | null>(null);
    const [file, setFile] = useState<string | null>(null);
    const [diff, setDiff] = useState<snapshot.DiffLine[] | null>(null);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');

    const fail = (e: unknown) => setError(errText(e));
    const refresh = () => ListSnapshots().then(setList).catch(fail);
    useEffect(() => {
        if (open) { refresh(); setMsg(''); setError(''); }
    }, [open]);

    const take = async () => {
        try {
            await saveFirst();
            const m = await TakeSnapshot(label.trim());
            setLabel('');
            setMsg(`已建立快照(${m.files?.length ?? 0} 個檔案)`);
            refresh();
        } catch (e) { fail(e); }
    };

    const showDiff = async (m: snapshot.Meta, f: string) => {
        try {
            await saveFirst();
            setFile(f);
            setDiff(await SnapshotDiff(m.id, f));
            setError('');
        } catch (e) { fail(e); }
    };

    const pick = (m: snapshot.Meta) => {
        setSel(m);
        setDiff(null);
        const f = m.files?.includes(current ?? '') ? current : m.files?.[0] ?? null;
        setFile(f);
        if (f) showDiff(m, f);
    };

    const restore = async (files: string[]) => {
        if (!sel) return;
        try {
            await saveFirst();
            await RestoreSnapshot(sel.id, files);
            setMsg('已還原。還原前的內容也自動備份成一個快照,需要時可以再還原回來。');
            onRestored(files.length ? files : sel.files ?? []);
            refresh();
            if (file) setDiff(await SnapshotDiff(sel.id, file));
        } catch (e) { fail(e); }
    };

    const changed = diff?.some(l => l.op !== ' ');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[80vh] max-w-5xl flex-col">
                <DialogHeader>
                    <DialogTitle>版本</DialogTitle>
                    <DialogDescription>每次接受 AI 提案前都會自動快照。你也可以隨時手動建立快照。</DialogDescription>
                </DialogHeader>
                <div className="flex gap-2">
                    <Input className="h-8" value={label} placeholder="快照說明(可空),例如「第三章初稿」" onChange={e => setLabel(e.target.value)}/>
                    <Button size="sm" onClick={take}><Camera/>建立快照</Button>
                </div>
                {msg && <p className="text-xs text-success">{msg}</p>}
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex min-h-0 flex-1 gap-3">
                    <ul className="w-56 shrink-0 overflow-y-auto rounded-md border p-1 text-sm">
                        {list.length === 0 && <li className="p-3 text-xs text-muted-foreground">尚無快照</li>}
                        {list.map(m => (
                            <li key={m.id} onClick={() => pick(m)}
                                className={cn('cursor-pointer rounded px-2 py-1.5', sel?.id === m.id ? 'bg-accent' : 'hover:bg-accent/60')}>
                                <div className="text-[13px]">{new Date(m.time).toLocaleString()}</div>
                                <div className="truncate text-[11px] text-muted-foreground">{reasonText[m.reason] ?? m.reason}{m.label ? ` · ${m.label}` : ''}</div>
                            </li>
                        ))}
                    </ul>
                    <div className="flex min-w-0 flex-1 flex-col">
                        {sel ? (
                            <>
                                <div className="mb-2 flex flex-wrap gap-1">
                                    {sel.files?.map(f => (
                                        <button key={f} onClick={() => showDiff(sel, f)}
                                                className={cn('rounded border px-2 py-0.5 text-[11px]', f === file ? 'border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}>
                                            {f.split('/').pop()?.replace(/\.md$/, '')}
                                        </button>
                                    ))}
                                </div>
                                {file && diff && (
                                    <>
                                        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="flex-1">{changed ? '紅色 = 快照中有、目前沒有;綠色 = 目前新增' : '此檔與快照相同'}</span>
                                            <Button size="sm" variant="outline" className="h-7" disabled={!changed} onClick={() => restore([file])}><RotateCcw/>還原此檔</Button>
                                            <Button size="sm" variant="outline" className="h-7" onClick={() => restore([])}>還原快照內全部檔案</Button>
                                        </div>
                                        <pre className="min-h-0 flex-1 overflow-auto rounded-md border p-2 font-serif text-[13px] leading-relaxed">
                                            {diff.map((l, i) => (
                                                l.segs ? (
                                                    // 修改的行:整行淡色,實際變動的字加深
                                                    <div key={i} className={cn('whitespace-pre-wrap px-1', l.op === '-' ? 'diff-del-line' : 'diff-add-line')}>
                                                        {l.op} {l.segs.map((s, k) => s.changed
                                                            ? <span key={k} className={l.op === '-' ? 'diff-del-seg' : 'diff-add-seg'}>{s.text}</span>
                                                            : s.text)}
                                                    </div>
                                                ) : (
                                                    <div key={i} className={cn('whitespace-pre-wrap px-1', l.op === '-' && 'diff-del', l.op === '+' && 'diff-add')}>
                                                        {l.op === ' ' ? ' ' : l.op} {l.text}
                                                    </div>
                                                )
                                            ))}
                                        </pre>
                                    </>
                                )}
                            </>
                        ) : <p className="p-6 text-sm text-muted-foreground">選一個快照查看差異。</p>}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
