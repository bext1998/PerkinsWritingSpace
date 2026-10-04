import {useEffect, useState} from 'react';
import {Camera, RotateCcw} from 'lucide-react';
import {ListSnapshots, RestoreSnapshot, SnapshotDiff, TakeSnapshot} from '../wailsjs/go/main/App';
import {snapshot} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/basic';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/overlay';
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

const titleOf = (p: string) => p.split('/').pop()?.replace(/\.md$/, '') ?? p;

export default function VersionDialog({open, onOpenChange, current, saveFirst, onRestored}: Props) {
    const [list, setList] = useState<snapshot.Meta[]>([]);
    const [label, setLabel] = useState('');
    const [sel, setSel] = useState<snapshot.Meta | null>(null);
    const [file, setFile] = useState<string | null>(null);
    const [diff, setDiff] = useState<snapshot.DiffLine[] | null>(null);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState<{files: string[]} | null>(null); // 還原前的原地確認(§16 第 1 項 03)

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
        setConfirm(null);
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
                                <div className="truncate text-xs text-muted-foreground">{reasonText[m.reason] ?? m.reason}{m.label ? ` · ${m.label}` : ''}</div>
                            </li>
                        ))}
                    </ul>
                    <div className="flex min-w-0 flex-1 flex-col">
                        {sel ? (
                            <>
                                <div className="mb-2 flex flex-wrap gap-1">
                                    {sel.files?.map(f => (
                                        <button key={f} onClick={() => showDiff(sel, f)}
                                                className={cn('rounded border px-2 py-0.5 text-xs', f === file ? 'border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}>
                                            {titleOf(f)}
                                        </button>
                                    ))}
                                </div>
                                {file && diff && (
                                    <>
                                        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="flex-1">{changed ? '紅色 = 快照中有、目前沒有;綠色 = 目前新增' : '此檔與快照相同'}</span>
                                            {/* 還原此檔 = 主要;整批還原 = 次要「更多」下拉(§16 第 1 項 03) */}
                                            <Button size="sm" className="h-7" disabled={!changed}
                                                    data-testid="restore-file" onClick={() => setConfirm({files: [file]})}><RotateCcw/>還原此檔</Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" data-testid="restore-more">更多…</Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => setConfirm({files: []})}>還原快照內全部檔案({sel.files?.length ?? 0} 個)</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                        {confirm && (
                                            /* 原地確認:範圍、時間、備份說明 */
                                            <div className="mb-2 rounded-md border p-3 text-xs" data-testid="restore-confirm">
                                                <p className="font-medium">確定要還原?</p>
                                                <p className="mt-1 text-muted-foreground">
                                                    快照:{new Date(sel.time).toLocaleString()}({reasonText[sel.reason] ?? sel.reason}{sel.label ? ` · ${sel.label}` : ''})
                                                </p>
                                                <p className="text-muted-foreground">
                                                    {confirm.files.length === 0
                                                        ? `將還原快照內全部 ${sel.files?.length ?? 0} 個檔案`
                                                        : `將還原:${confirm.files.map(titleOf).join('、')}`}
                                                </p>
                                                <p className="mt-1 text-warning">目前內容會先自動備份成一個快照,需要時可以再還原回來。</p>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <Button size="sm" className="h-7" data-testid="restore-confirm-go" onClick={() => { const f = confirm.files; setConfirm(null); restore(f); }}>確定還原</Button>
                                                    <Button size="sm" variant="ghost" className="h-7" data-testid="restore-confirm-cancel" onClick={() => setConfirm(null)}>取消</Button>
                                                </div>
                                            </div>
                                        )}
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
