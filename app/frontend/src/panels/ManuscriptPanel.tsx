import {useState} from 'react';
import {
    ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleCheck, CircleDashed, Download, MoreHorizontal, Pencil, Plus, ScrollText,
    Share2, Trash2,
} from 'lucide-react';
import {ExportVolume, NewChapter, SetVolumes, TrashFile} from '../../wailsjs/go/main/App';
import {project} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/basic';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, Tip,
} from '@/components/ui/overlay';
import {cn} from '@/lib/utils';
import {PanelProps} from './types';

interface Props extends PanelProps {
    onCopy: (rel: string, platformID: string, name: string) => void;
    onStatus: (rel: string, status: string) => void;
    onSummary: (rel: string) => void;
}

const toVolumes = (tree: project.Tree): project.Volume[] =>
    tree.volumes.map(v => ({title: v.title, chapters: v.chapters.map(c => c.path)}));

export default function ManuscriptPanel({tree, current, counts, cfg, openFile, refreshTree, notify, fail, onCopy, onStatus, onSummary}: Props) {
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
    const [adding, setAdding] = useState<number | null>(null);
    const [renaming, setRenaming] = useState<number | null>(null);
    const [input, setInput] = useState('');
    const [drag, setDrag] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const [trash, setTrash] = useState<string | null>(null);

    const apply = async (vols: project.Volume[]) => {
        try {
            await SetVolumes(vols);
            await refreshTree();
        } catch (e) { fail(e); }
    };

    const addChapter = async (vol: number) => {
        const title = input.trim();
        setAdding(null);
        setInput('');
        if (!title) return;
        try {
            const rel = await NewChapter(title, vol);
            await refreshTree();
            await openFile(rel);
        } catch (e) { fail(e); }
    };

    const renameVolume = (vol: number) => {
        const vols = toVolumes(tree);
        vols[vol].title = input.trim();
        setRenaming(null);
        setInput('');
        apply(vols);
    };

    const moveVolume = (vol: number, dir: -1 | 1) => {
        const vols = toVolumes(tree);
        const to = vol + dir;
        if (to < 0 || to >= vols.length) return;
        [vols[vol], vols[to]] = [vols[to], vols[vol]];
        apply(vols);
    };

    const addVolume = () => {
        const vols = toVolumes(tree);
        vols.push({title: `第${vols.length + 1}卷`, chapters: []});
        apply(vols);
    };

    const deleteVolume = (vol: number) => {
        const vols = toVolumes(tree);
        if (vols[vol].chapters.length > 0 || vols.length <= 1) return;
        vols.splice(vol, 1);
        apply(vols);
    };

    // 拖曳:放到章節上 = 插在它前面;放到卷標題上 = 加到該卷尾端。只改 perkins.json(B1)。
    const drop = (target: {vol: number; before?: string}) => {
        if (!drag) return;
        const vols = toVolumes(tree);
        for (const v of vols) v.chapters = v.chapters.filter(c => c !== drag);
        const list = vols[target.vol].chapters;
        const at = target.before ? list.indexOf(target.before) : -1;
        if (at >= 0) list.splice(at, 0, drag); else list.push(drag);
        setDrag(null);
        setOver(null);
        apply(vols);
    };

    const exportVolume = async (vol: number, platformID: string) => {
        try {
            const path = await ExportVolume(vol, platformID);
            if (path) notify({text: `已匯出:${path}`, kind: 'ok'});
        } catch (e) { fail(e); }
    };

    const doTrash = async () => {
        if (!trash) return;
        try {
            await TrashFile(trash);
            await refreshTree();
            notify({text: '已移到回收區(.perkins/trash),需要時可從資料夾搬回。', kind: 'info'});
        } catch (e) { fail(e); }
        setTrash(null);
    };

    const platformsMenu = (onPick: (id: string, name: string) => void) => cfg?.platforms.map(p => (
        <DropdownMenuItem key={p.id} onSelect={() => onPick(p.id, p.name)}>
            {p.name}{!p.verified && <span className="ml-auto pl-3 text-xs text-muted-foreground">未驗證</span>}
        </DropdownMenuItem>
    ));

    return (
        <div className="py-2">
            {tree.volumes.map((v, vi) => {
                const words = v.chapters.reduce((n, c) => n + (counts[c.path] ?? 0), 0);
                const done = v.chapters.filter(c => c.status === 'done').length;
                return (
                    <div key={vi} className="mb-1">
                        <div className={cn('group flex items-center gap-1 px-2 py-1', over === `vol:${vi}` && 'bg-primary/10')}
                             onDragOver={e => { e.preventDefault(); setOver(`vol:${vi}`); }}
                             onDragLeave={() => setOver(null)}
                             onDrop={() => drop({vol: vi})}>
                            <button className="flex h-6 w-6 items-center justify-center text-muted-foreground"
                                    onClick={() => setCollapsed(c => ({...c, [vi]: !c[vi]}))}>
                                {collapsed[vi] ? <ChevronRight className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                            </button>
                            {renaming === vi ? (
                                <form className="flex-1" onSubmit={e => { e.preventDefault(); renameVolume(vi); }}>
                                    <Input autoFocus className="h-7 text-sm" value={input} onChange={e => setInput(e.target.value)}
                                           onBlur={() => renameVolume(vi)}/>
                                </form>
                            ) : (
                                <span className="flex-1 min-w-0" onDoubleClick={() => { setRenaming(vi); setInput(v.title); }}>
                                    {/* 卷名獨立一行,統計移到次行(設計審查 14) */}
                                    <span className="block truncate text-[13px] font-semibold tracking-wide text-foreground/85">{v.title || '未命名卷'}</span>
                                    <span className="block text-xs text-muted-foreground">{done}/{v.chapters.length} 章 · {words.toLocaleString()} 字</span>
                                </span>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="iconSm" className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal/></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => { setAdding(vi); setInput(''); }}><Plus/>新增章節</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => { setRenaming(vi); setInput(v.title); }}><Pencil/>重新命名</DropdownMenuItem>
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger><Download/>匯出整卷 .txt</DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>{platformsMenu(id => exportVolume(vi, id))}</DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuSeparator/>
                                    <DropdownMenuItem disabled={vi === 0} onSelect={() => moveVolume(vi, -1)}><ArrowUp/>上移</DropdownMenuItem>
                                    <DropdownMenuItem disabled={vi === tree.volumes.length - 1} onSelect={() => moveVolume(vi, 1)}><ArrowDown/>下移</DropdownMenuItem>
                                    <DropdownMenuItem disabled={v.chapters.length > 0 || tree.volumes.length <= 1} onSelect={() => deleteVolume(vi)}>
                                        <Trash2/>刪除空卷
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {!collapsed[vi] && (
                            <ul>
                                {v.chapters.map(c => {
                                    const active = c.path === current;
                                    return (
                                        <li key={c.path}>
                                            <div draggable
                                                 onDragStart={() => setDrag(c.path)}
                                                 onDragEnd={() => { setDrag(null); setOver(null); }}
                                                 onDragOver={e => { e.preventDefault(); setOver(c.path); }}
                                                 onDrop={e => { e.stopPropagation(); drop({vol: vi, before: c.path}); }}
                                                 onClick={() => openFile(c.path)}
                                                 data-testid="chapter-row"
                                                 className={cn('group mx-2 flex cursor-pointer items-center gap-2 rounded-md py-1.5 pl-7 pr-1 text-sm',
                                                     active ? 'bg-accent text-foreground' : 'text-foreground/85 hover:bg-accent/60',
                                                     over === c.path && drag && drag !== c.path && 'border-t-2 border-primary')}>
                                                {c.status === 'done'
                                                    ? <CircleCheck className="h-3.5 w-3.5 shrink-0 text-success"/>
                                                    : <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"/>}
                                                <span className="flex-1 truncate">{c.title}</span>
                                                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground group-hover:hidden">{(counts[c.path] ?? 0).toLocaleString()}</span>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                                        <button className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background group-hover:flex data-[state=open]:flex">
                                                            <MoreHorizontal className="h-4 w-4"/>
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
                                                        <DropdownMenuItem onSelect={() => onStatus(c.path, c.status === 'done' ? 'draft' : 'done')}>
                                                            {c.status === 'done' ? <><CircleDashed/>改回草稿</> : <><CircleCheck/>標為完成</>}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onSelect={() => onSummary(c.path)}><ScrollText/>章節摘要</DropdownMenuItem>
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger><Share2/>複製到平台</DropdownMenuSubTrigger>
                                                            <DropdownMenuSubContent>{platformsMenu((id, name) => onCopy(c.path, id, name))}</DropdownMenuSubContent>
                                                        </DropdownMenuSub>
                                                        <DropdownMenuSeparator/>
                                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setTrash(c.path)}>
                                                            <Trash2/>移到回收區
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                            {active && (c.scenes?.length ?? 0) > 0 && (
                                                <ul className="mb-1 ml-12 border-l pl-2">
                                                    {c.scenes!.map(s => (
                                                        <li key={s.line}
                                                            className="cursor-pointer truncate py-0.5 text-xs text-muted-foreground hover:text-foreground"
                                                            onClick={() => openFile(c.path, s.line)}>
                                                            {s.title}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                                {v.chapters.length === 0 && adding !== vi && (
                                    <li className="mx-2 py-1 pl-7 text-xs text-muted-foreground/70">(空的卷,可把章節拖進來)</li>
                                )}
                            </ul>
                        )}
                        {adding === vi ? (
                            <form className="mx-2 mb-1 flex items-center gap-1 pl-7" onSubmit={e => { e.preventDefault(); addChapter(vi); }}>
                                <Input autoFocus className="h-8 text-sm" placeholder="章節名稱,Enter 建立" value={input} data-testid="chapter-name"
                                       onChange={e => setInput(e.target.value)}
                                       onKeyDown={e => { if (e.key === 'Escape') { setAdding(null); setInput(''); } }}/>
                                <Button size="sm" className="h-8 shrink-0" data-testid="chapter-create" disabled={!input.trim()}>建立</Button>
                                <Button size="sm" variant="ghost" className="h-8 shrink-0" data-testid="chapter-cancel"
                                        type="button" onClick={() => { setAdding(null); setInput(''); }}>取消</Button>
                            </form>
                        ) : (
                            /* 常駐的新章入口(不需 hover);卷選單內仍保留「新增章節」 */
                            <button className="mx-2 mt-0.5 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md py-1.5 pl-7 text-[13px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                    data-testid={`add-chapter-${vi}`}
                                    onClick={() => { setAdding(vi); setInput(''); setCollapsed(c => ({...c, [vi]: false})); }}>
                                <Plus className="h-3.5 w-3.5"/>新增章節
                            </button>
                        )}
                    </div>
                );
            })}
            <div className="px-3 pt-2">
                <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={addVolume}>
                    <Plus/>新增卷
                </Button>
            </div>

            <Dialog open={!!trash} onOpenChange={o => !o && setTrash(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>移到回收區?</DialogTitle>
                        <DialogDescription>
                            「{trash?.split('/').pop()?.replace(/\.md$/, '')}」會移到專案的 .perkins/trash 資料夾,不會真的刪除;需要時可以自己搬回 manuscript/。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setTrash(null)}>取消</Button>
                        <Button variant="destructive" onClick={doTrash}>移到回收區</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
