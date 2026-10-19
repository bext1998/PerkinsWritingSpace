import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {ChevronDown, ChevronRight, Folder, Plus, Search, Trash2} from 'lucide-react';
import {NewDoc, TrashFile} from '../../wailsjs/go/main/App';
import {Button} from '@/components/ui/button';
import {Input, Label} from '@/components/ui/basic';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/overlay';
import {cn} from '@/lib/utils';
import {PanelProps} from './types';

// 設定集側欄的資料夾檔案樹(SPEC §12.2 #31):依 tree.canon 的實際路徑組成(canon/... 遞迴)。
// 同層「資料夾在前、檔案在後」,各自依名稱排序(zh-Hant)。
interface FileNode { path: string; name: string; }
interface DirNode { name: string; path: string; dirs: DirNode[]; files: FileNode[]; }

function buildTree(files: FileNode[]): DirNode {
    const root: DirNode = {name: '', path: 'canon', dirs: [], files: []};
    const dirs = new Map<string, DirNode>([[root.path, root]]);
    for (const f of files) {
        const parts = f.path.split('/');
        let node = root;
        for (let i = 1; i < parts.length - 1; i++) {
            const key = parts.slice(0, i + 1).join('/');
            let d = dirs.get(key);
            if (!d) {
                d = {name: parts[i], path: key, dirs: [], files: []};
                dirs.set(key, d);
                node.dirs.push(d);
            }
            node = d;
        }
        node.files.push(f);
    }
    const byName = (a: {name: string}, b: {name: string}) => a.name.localeCompare(b.name, 'zh-Hant');
    const sort = (d: DirNode) => {
        d.dirs.sort(byName);
        d.files.sort(byName);
        d.dirs.forEach(sort);
    };
    sort(root);
    return root;
}

export default function BiblePanel({tree, current, index, openFile, refreshTree, refreshIndex, notify, fail, save}: PanelProps) {
    const [q, setQ] = useState('');
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');

    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // 收合狀態只存記憶體(預設展開)
    const entityByPath = useMemo(() => new Map((index?.entities ?? []).map(e => [e.path, e])), [index]);
    // 檔名列顯示檔名(去 .md);有 frontmatter 的檔以索引裡的別名淡色補在後面
    const files = useMemo(() => {
        const all: FileNode[] = tree.canon.map(e => ({path: e.path, name: e.title}));
        if (!q) return all;
        return all.filter(f => {
            const ent = entityByPath.get(f.path);
            return [f.name, ent?.name ?? '', ...(ent?.aliases ?? [])].some(s => s.includes(q));
        });
    }, [tree, q, entityByPath]);
    const root = useMemo(() => buildTree(files), [files]);

    const appearances = (path: string) => index?.appearances?.[path]?.reduce((n, c) => n + c.count, 0) ?? 0;

    // 刪除要按兩次(#117):第一次只進入確認狀態,滑鼠離開該列或幾秒內沒再按就取消
    const [confirming, setConfirming] = useState<string | null>(null);
    useEffect(() => {
        if (!confirming) return;
        const id = setTimeout(() => setConfirming(null), 4000);
        return () => clearTimeout(id);
    }, [confirming]);
    const trash = async (rel: string) => {
        setConfirming(null);
        try {
            // 刪的是目前檔案:先存檔,回收區才有作者最新的字;存檔失敗就不刪(#119 審查)
            if (rel === current) await save();
            await TrashFile(rel);
            await refreshTree();
            refreshIndex();
            notify({text: '已移到回收區(.perkins/trash)', kind: 'info'});
        } catch (e) { fail(e); }
    };

    const fileRow = (f: FileNode, depth: number) => {
        const aliases = entityByPath.get(f.path)?.aliases ?? [];
        const asking = confirming === f.path;
        return (
            <li key={f.path} data-testid="entity-row" data-file={f.path}
                className={cn('group flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-sm',
                    f.path === current ? 'bg-accent' : 'hover:bg-accent/60')}
                style={{paddingLeft: 8 + depth * 12}}
                onClick={() => openFile(f.path)}
                onMouseLeave={() => { if (asking) setConfirming(null); }}>
                <span className="min-w-0 flex-1 truncate">
                    {f.name}
                    {aliases.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{aliases.join('、')}</span>}
                </span>
                {asking ? (
                    <button type="button" data-testid="entity-delete-confirm"
                            className="shrink-0 rounded px-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                            onClick={ev => { ev.stopPropagation(); trash(f.path); }}>
                        確認刪除?
                    </button>
                ) : (
                    <>
                        <span className="text-xs text-muted-foreground group-hover:hidden" title="在稿件中出現的次數">{appearances(f.path) || ''}</span>
                        <button type="button" data-testid="entity-delete" title="刪除(移到回收區)" aria-label={`刪除 ${f.name}`}
                                className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
                                onClick={ev => { ev.stopPropagation(); setConfirming(f.path); }}>
                            <Trash2 className="h-3.5 w-3.5"/>
                        </button>
                    </>
                )}
            </li>
        );
    };

    // 資料夾列可點擊展開/收合(預設展開);有搜尋字時強制展開,只顯示符合的檔案與其上層資料夾
    const dirBlock = (d: DirNode, depth: number): ReactNode => {
        const open = !!q || !collapsed[d.path];
        return (
            <div key={d.path}>
                <button type="button" data-testid="canon-folder" data-folder={d.path}
                        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm text-muted-foreground hover:bg-accent/60"
                        style={{paddingLeft: 8 + depth * 12}}
                        onClick={() => setCollapsed(c => ({...c, [d.path]: !c[d.path]}))}>
                    {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0"/> : <ChevronRight className="h-3.5 w-3.5 shrink-0"/>}
                    <Folder className="h-3.5 w-3.5 shrink-0"/>
                    <span className="min-w-0 flex-1 truncate text-left">{d.name}</span>
                </button>
                {open && d.dirs.map(sub => dirBlock(sub, depth + 1))}
                {open && d.files.length > 0 && <ul>{d.files.map(f => fileRow(f, depth + 1))}</ul>}
            </div>
        );
    };

    const create = async () => {
        const n = name.trim();
        if (!n) return;
        setCreating(false);
        setName('');
        try {
            const rel = await NewDoc('canon', n);
            await refreshTree();
            refreshIndex();
            await openFile(rel);
        } catch (e) { fail(e); }
    };


    return (
        <div className="p-3">
            <div className="relative mb-2">
                <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground"/>
                <Input className="h-8 pl-8 text-sm" data-testid="canon-search" placeholder="搜尋檔名、名稱或別名" value={q} onChange={e => setQ(e.target.value)}/>
            </div>
            <div className="mb-3 flex gap-2">
                <Button size="sm" className="h-8" onClick={() => setCreating(true)} data-testid="new-entity"><Plus/>新增</Button>
            </div>
            {tree.canon.length === 0 && (
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                    還沒有設定。新增設定後會自動建立登場索引;也可到「設定 › 作品」從 Notion 匯入。
                </p>
            )}
            <div data-testid="canon-tree">
                {root.dirs.map(d => dirBlock(d, 0))}
                {root.files.length > 0 && <ul>{root.files.map(f => fileRow(f, 0))}</ul>}
            </div>
            <p className="mt-4 px-1 text-xs leading-relaxed text-muted-foreground/80">
                Bot 能否自行讀取設定集,可在「設定 › Perkins Bot › Bot 可讀範圍」調整;AI 只能提案、不能直接修改。
            </p>

            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>新增設定</DialogTitle>
                        <DialogDescription>名稱就是檔名,建立後是一份只有標題的文件,內容自由撰寫。</DialogDescription>
                    </DialogHeader>
                    <form className="grid gap-3" onSubmit={e => { e.preventDefault(); create(); }}>
                        <div className="grid gap-1.5">
                            <Label htmlFor="ename">名稱</Label>
                            <Input id="ename" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="例如:艾莉絲"/>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>取消</Button>
                            <Button type="submit" disabled={!name.trim()}>建立</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
