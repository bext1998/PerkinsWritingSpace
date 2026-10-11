import {useMemo, useState, type ReactNode} from 'react';
import {ChevronDown, ChevronRight, Folder, Plus, Search} from 'lucide-react';
import {AddCategory, CategoryUsage, NewDoc} from '../../wailsjs/go/main/App';
import {Button} from '@/components/ui/button';
import {Input, Label} from '@/components/ui/basic';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Select, SelectContent, SelectItem, SelectTrigger,
    SelectValue,
} from '@/components/ui/overlay';
import {cn, errText} from '@/lib/utils';
import {BUILTIN_TYPES, PanelProps, useCategories} from './types';

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

export default function BiblePanel({tree, current, index, openFile, refreshTree, refreshIndex, fail, deleteCategory}: PanelProps) {
    const [q, setQ] = useState('');
    const [creating, setCreating] = useState(false);
    const [type, setType] = useState('角色');
    const [name, setName] = useState('');
    const [cats, reloadCats, catsError] = useCategories();
    // 管理分類(SPEC §12.2/§16-9):新增、刪除(有設定檔先確認+快照)
    const [managing, setManaging] = useState(false);
    const [catName, setCatName] = useState('');
    const [catErr, setCatErr] = useState('');
    const [confirmDel, setConfirmDel] = useState<{name: string; usage: number} | null>(null);
    const [deleting, setDeleting] = useState(false); // 刪除在途(SPEC §12.2 第二輪):對話框不可關閉、確認鈕停用

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

    const fileRow = (f: FileNode, depth: number) => {
        const aliases = entityByPath.get(f.path)?.aliases ?? [];
        return (
            <li key={f.path} data-testid="entity-row" data-file={f.path}
                className={cn('flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-sm',
                    f.path === current ? 'bg-accent' : 'hover:bg-accent/60')}
                style={{paddingLeft: 8 + depth * 12}}
                onClick={() => openFile(f.path)}>
                <span className="min-w-0 flex-1 truncate">
                    {f.name}
                    {aliases.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{aliases.join('、')}</span>}
                </span>
                <span className="text-xs text-muted-foreground" title="在稿件中出現的次數">{appearances(f.path) || ''}</span>
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
            const rel = await NewDoc('canon', n, type);
            await refreshTree();
            refreshIndex();
            await openFile(rel);
        } catch (e) { fail(e); }
    };

    const addCategory = async () => {
        const n = catName.trim();
        if (!n) return;
        try {
            await AddCategory(n);
            setCatName('');
            setCatErr('');
            reloadCats();
        } catch (e) { setCatErr(errText(e)); }
    };

    const askDelete = async (n: string) => {
        try {
            setConfirmDel({name: n, usage: await CategoryUsage(n)});
        } catch (e) { fail(e); }
    };

    const doDelete = async () => {
        if (!confirmDel || deleting) return;
        setDeleting(true);
        try {
            await deleteCategory(confirmDel.name); // Workspace 協調:先存檔,再快照+改歸其他+重載
            setConfirmDel(null);
            reloadCats();
        } catch (e) {
            // 失敗分支:重讀分類與索引,畫面反映實際狀態(SPEC §12.2)
            setConfirmDel(null);
            reloadCats();
            refreshIndex();
            fail(e);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="p-3">
            <div className="relative mb-2">
                <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground"/>
                <Input className="h-8 pl-8 text-sm" data-testid="canon-search" placeholder="搜尋檔名、名稱或別名" value={q} onChange={e => setQ(e.target.value)}/>
            </div>
            <div className="mb-3 flex gap-2">
                <Button size="sm" className="h-8" onClick={() => setCreating(true)} data-testid="new-entity"><Plus/>新增</Button>
                <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-xs"
                        data-testid="manage-categories"
                        onClick={() => { setCatErr(''); setConfirmDel(null); setManaging(true); }}>管理分類</Button>
            </div>
            {tree.canon.length === 0 && (
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                    還沒有設定。新增角色、地點、名詞後會自動建立登場索引;也可到「設定 › 作品」從 Notion 匯入。
                </p>
            )}
            <div data-testid="canon-tree">
                {root.dirs.map(d => dirBlock(d, 0))}
                {root.files.length > 0 && <ul>{root.files.map(f => fileRow(f, 0))}</ul>}
            </div>
            <p className="mt-4 px-1 text-xs leading-relaxed text-muted-foreground/80">
                設定只有在對話框附加後 AI 才看得到,而且 AI 只能提案、不能直接修改。
            </p>

            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>新增設定</DialogTitle>
                        <DialogDescription>名稱與別名用於登場索引與寫法檢查;其他描述可以在本文自由撰寫。</DialogDescription>
                    </DialogHeader>
                    <form className="grid gap-3" onSubmit={e => { e.preventDefault(); create(); }}>
                        <div className="grid gap-1.5">
                            <Label>類型</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger data-testid="entity-type"><SelectValue/></SelectTrigger>
                                <SelectContent>{cats.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
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

            {/* 管理分類(SPEC §12.2):內建不可刪;刪除有設定檔的分類先確認 → 快照 → 改歸其他 */}
            <Dialog open={managing} onOpenChange={o => {
                if (!o && deleting) return; // 刪除在途中:Esc/外點/關閉鈕都無效(對話框是 modal,擋住編輯與切檔)
                setManaging(o);
                if (!o) { setCatErr(''); setConfirmDel(null); }
            }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>管理分類</DialogTitle>
                        <DialogDescription>
                            內建分類不可刪除。刪除仍有設定檔的分類時會先自動建立快照,再把那些檔案改歸「其他」(檔案不刪)。
                        </DialogDescription>
                    </DialogHeader>
                    {/* 清單損毀時顯示錯誤並阻止新增(SPEC §12.2:不得覆寫原檔) */}
                    {catsError && (
                        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
                           data-testid="category-load-error">
                            分類清單無法讀取,新增與刪除已停用:{catsError}
                        </p>
                    )}
                    <div data-testid="category-list" className="grid max-h-64 gap-1.5 overflow-y-auto">
                        {cats.map(c => {
                            const builtin = BUILTIN_TYPES.includes(c);
                            return (
                                <div key={c} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                                    <span className="flex-1 truncate">{c}</span>
                                    {builtin
                                        ? <span className="text-xs text-muted-foreground">內建</span>
                                        : <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive"
                                                  data-testid={`del-cat-${c}`} onClick={() => askDelete(c)}>刪除</Button>}
                                </div>
                            );
                        })}
                    </div>
                    {confirmDel && (
                        <div data-testid="category-confirm" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                            <p>
                                刪除「{confirmDel.name}」?{' '}
                                {confirmDel.usage > 0
                                    ? <>有 <b>{confirmDel.usage}</b> 個設定檔會改歸「其他」(先自動建立快照,檔案不刪)。</>
                                    : <>此分類下沒有設定檔,直接刪除。</>}
                            </p>
                            <div className="mt-2 flex gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>取消</Button>
                                <Button size="sm" variant="destructive" data-testid="category-confirm-go"
                                        disabled={deleting} onClick={doDelete}>
                                    {deleting ? '刪除中…' : '確認刪除'}
                                </Button>
                            </div>
                        </div>
                    )}
                    <div className="grid gap-1.5 border-t pt-3">
                        <Label htmlFor="newcat">新增分類</Label>
                        <div className="flex gap-2">
                            <Input id="newcat" data-testid="category-name" value={catName}
                                   onChange={e => setCatName(e.target.value)} placeholder="例如:組織"/>
                            <Button size="sm" data-testid="category-add" disabled={!catName.trim() || !!catsError} onClick={addCategory}>新增</Button>
                        </div>
                        {catErr && <p className="text-xs text-destructive" data-testid="category-error">{catErr}</p>}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
