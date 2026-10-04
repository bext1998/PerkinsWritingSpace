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

/** 依書名產生的書封:同一書名永遠同一配色。單色底 + 一條書脊線(設計審查 17):
 *  移除漸層、金線、字影與複合內陰影;書名水平顯示、允許兩行,不做直排旋轉。 */
export function GeneratedCover({name, className}: {name: string; className?: string}) {
    const h = hueOf(name);
    return (
        <div className={cn('relative h-full w-full overflow-hidden', className)}
             style={{background: `hsl(${h} 38% 26%)`}}>
            {/* 書脊線:靠左一條淡線 */}
            <div className="absolute inset-y-0 left-3 w-px bg-white/20"/>
            <div className="absolute inset-0 flex items-center justify-center p-3">
                <span className="line-clamp-2 font-serif text-[13px] font-bold leading-snug tracking-wide text-[hsl(40_55%_85%)]">
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
        <div className="flex h-full flex-col overflow-y-auto">
            {/* 左對齊小標題列:主動作(開作品)與按鈕同列,最近作品在首屏上方(設計審查 16) */}
            <header className="flex shrink-0 items-center gap-3 border-b px-8 py-4">
                <h1 className="font-serif text-xl font-semibold" data-testid="bookshelf-title">我的書櫃</h1>
                <div className="ml-auto flex gap-2">
                    <Button variant="outline" onClick={() => open(PickAndOpenProject())}><FolderOpen/>開啟資料夾</Button>
                    <Button onClick={() => setCreating(true)} data-testid="new-project"><BookPlus/>建立作品</Button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
            </header>

            <section className="mx-auto w-full max-w-5xl flex-1 px-10 pb-16 pt-8">
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
                                        className={cn('relative block h-[176px] w-[124px] overflow-hidden rounded-r-md rounded-l-sm transition-transform duration-200',
                                            r.missing ? 'opacity-40 grayscale' : 'hover:-translate-y-2')}
                                        title={r.path}
                                        disabled={r.missing}
                                        onClick={() => open(OpenProjectAt(r.path))}>
                                        {r.cover
                                            ? <img src={r.cover} alt={r.name} className="h-full w-full object-cover"/>
                                            : <GeneratedCover name={r.name || '未命名'}/>}
                                        {r.missing && (
                                            <span className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1 text-xs text-white">
                                                <TriangleAlert className="h-3 w-3"/>找不到資料夾
                                            </span>
                                        )}
                                    </button>
                                    <p className="mt-2 line-clamp-2 w-[124px] text-center text-xs text-muted-foreground">{r.name}</p>
                                    <Tip label="從書櫃移除(不會刪除檔案)" side="top">
                                        <button className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground group-hover:flex hover:text-destructive"
                                                onClick={() => RemoveRecent(r.path).then(refresh)}>
                                            <Trash2 className="h-3 w-3"/>
                                        </button>
                                    </Tip>
                                </div>
                            ))}
                        </div>
                        {/* 書架層板:低對比分隔線(設計審查 17),不用漸層木板 */}
                        <div className="mx-6 mt-2 border-b border-border"/>
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
