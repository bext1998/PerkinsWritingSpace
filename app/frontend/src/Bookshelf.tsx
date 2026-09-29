import {useEffect, useState} from 'react';
import {BookPlus, FolderOpen, Settings, Trash2, TriangleAlert} from 'lucide-react';
import {ListRecent, OpenProjectAt, PickAndCreateProject, PickAndOpenProject, RemoveRecent} from '../wailsjs/go/main/App';
import {main, project} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input, Label} from '@/components/ui/basic';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Tip} from '@/components/ui/overlay';
import {cn, errText} from '@/lib/utils';

interface Props {
    onOpen: (t: project.Tree) => void;
    onSettings: () => void;
}

function hueOf(s: string) {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) % 360;
    return h;
}

/** 依書名產生的書封:同一書名永遠同一配色;書名直排。 */
export function GeneratedCover({name, className}: {name: string; className?: string}) {
    const h = hueOf(name);
    return (
        <div className={cn('relative h-full w-full overflow-hidden', className)}
             style={{background: `linear-gradient(160deg, hsl(${h} 45% 34%), hsl(${(h + 40) % 360} 50% 18%))`}}>
            <div className="absolute inset-y-3 left-2 w-px bg-white/15"/>
            <div className="absolute inset-x-3 top-3 h-px bg-[hsl(40_70%_70%/.35)]"/>
            <div className="absolute inset-x-3 bottom-3 h-px bg-[hsl(40_70%_70%/.35)]"/>
            <div className="absolute inset-0 flex items-center justify-center p-3">
                <span className="font-serif text-[15px] font-bold leading-snug tracking-[0.2em] text-[hsl(40_60%_88%)] drop-shadow"
                      style={{writingMode: 'vertical-rl', maxHeight: '100%'}}>
                    {name}
                </span>
            </div>
        </div>
    );
}

export default function Bookshelf({onOpen, onSettings}: Props) {
    const [recent, setRecent] = useState<main.RecentView[]>([]);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    const refresh = () => ListRecent().then(setRecent).catch(e => setError(errText(e)));
    useEffect(() => { refresh(); }, []);

    const open = async (p: Promise<project.Tree>) => {
        try {
            const t = await p;
            if (t) onOpen(t);
        } catch (e) { setError(errText(e)); }
    };

    const create = async () => {
        const n = name.trim();
        if (!n) return;
        setCreating(false);
        setName('');
        await open(PickAndCreateProject(n));
    };

    // 每層書架 6 本
    const rows: main.RecentView[][] = [];
    for (let i = 0; i < recent.length; i += 6) rows.push(recent.slice(i, i + 6));

    return (
        <div className="relative flex h-full flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/.08),transparent_60%)]">
            <header className="flex flex-col items-center px-8 pb-10 pt-20 text-center">
                <p className="mb-3 text-xs uppercase tracking-[0.5em] text-primary/80">Agentic Writing</p>
                <h1 className="font-serif text-5xl font-bold tracking-wide">Perkins WritingSpace</h1>
                <p className="mt-4 text-sm text-muted-foreground">由你主導的輕小說寫作空間 · AI 只提案,不代筆</p>
                <div className="mt-8 flex gap-3">
                    <Button size="lg" onClick={() => setCreating(true)} data-testid="new-project"><BookPlus/>建立新作品</Button>
                    <Button size="lg" variant="outline" onClick={() => open(PickAndOpenProject())}><FolderOpen/>開啟專案資料夾</Button>
                </div>
                {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            </header>

            <section className="mx-auto w-full max-w-5xl flex-1 px-10 pb-16">
                <h2 className="mb-6 text-sm font-medium tracking-widest text-muted-foreground">我的書櫃</h2>
                {recent.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                        書櫃還是空的。建立或開啟一部作品後,它會出現在這裡。
                    </div>
                ) : rows.map((row, i) => (
                    <div key={i} className="mb-10">
                        <div className="flex items-end gap-6 px-6">
                            {row.map(r => (
                                <div key={r.path} className="group relative">
                                    <button
                                        className={cn('book-spine-shadow relative block h-[176px] w-[124px] overflow-hidden rounded-r-md rounded-l-sm transition-transform duration-200',
                                            r.missing ? 'opacity-40 grayscale' : 'hover:-translate-y-2')}
                                        title={r.path}
                                        disabled={r.missing}
                                        onClick={() => open(OpenProjectAt(r.path))}>
                                        {r.cover
                                            ? <img src={r.cover} alt={r.name} className="h-full w-full object-cover"/>
                                            : <GeneratedCover name={r.name || '未命名'}/>}
                                        {r.missing && (
                                            <span className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1 text-[11px] text-white">
                                                <TriangleAlert className="h-3 w-3"/>找不到資料夾
                                            </span>
                                        )}
                                    </button>
                                    <p className="mt-2 w-[124px] truncate text-center text-xs text-muted-foreground">{r.name}</p>
                                    <Tip label="從書櫃移除(不會刪除檔案)" side="top">
                                        <button className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow group-hover:flex hover:text-destructive"
                                                onClick={() => RemoveRecent(r.path).then(refresh)}>
                                            <Trash2 className="h-3 w-3"/>
                                        </button>
                                    </Tip>
                                </div>
                            ))}
                        </div>
                        <div className="shelf-plank -mt-[30px] h-3 rounded-sm"/>
                    </div>
                ))}
            </section>

            <div className="fixed bottom-4 left-4">
                <Tip label="設定" side="right">
                    <Button variant="ghost" size="icon" onClick={onSettings} data-testid="open-settings"><Settings className="!size-5"/></Button>
                </Tip>
            </div>

            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>建立新作品</DialogTitle>
                        <DialogDescription>接著會請你選擇(或新建)一個資料夾來存放這部作品。</DialogDescription>
                    </DialogHeader>
                    <form className="grid gap-2" onSubmit={e => { e.preventDefault(); create(); }}>
                        <Label htmlFor="pname">作品名稱</Label>
                        <Input id="pname" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="例如:最後的奔馳"/>
                        <DialogFooter className="mt-3">
                            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>取消</Button>
                            <Button type="submit" disabled={!name.trim()}>選擇資料夾並建立</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
