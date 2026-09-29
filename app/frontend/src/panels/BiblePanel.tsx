import {useMemo, useState} from 'react';
import {Box, Flag, MapPin, Plus, Search, Tag, User, Sparkles} from 'lucide-react';
import {NewDoc} from '../../wailsjs/go/main/App';
import {Button} from '@/components/ui/button';
import {Input, Label} from '@/components/ui/basic';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Select, SelectContent, SelectItem, SelectTrigger,
    SelectValue,
} from '@/components/ui/overlay';
import {cn} from '@/lib/utils';
import {PanelProps, TYPE_ORDER} from './types';

export const TYPE_ICON: Record<string, typeof User> = {角色: User, 地點: MapPin, 勢力: Flag, 道具: Box, 名詞: Tag, 其他: Sparkles};

export default function BiblePanel({tree, current, index, openFile, refreshTree, refreshIndex, fail}: PanelProps) {
    const [q, setQ] = useState('');
    const [creating, setCreating] = useState(false);
    const [type, setType] = useState('角色');
    const [name, setName] = useState('');

    const groups = useMemo(() => {
        const ents = index?.entities ?? [];
        const byType: Record<string, typeof ents> = {};
        for (const e of ents) {
            const hay = [e.name, ...(e.aliases ?? [])].join(' ');
            if (q && !hay.includes(q)) continue;
            (byType[e.type] ??= []).push(e);
        }
        const types = [...TYPE_ORDER.filter(t => byType[t]), ...Object.keys(byType).filter(t => !TYPE_ORDER.includes(t))];
        return types.map(t => ({type: t, items: byType[t].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))}));
    }, [index, q]);

    const appearances = (path: string) => index?.appearances?.[path]?.reduce((n, c) => n + c.count, 0) ?? 0;

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

    return (
        <div className="p-3">
            <div className="mb-3 flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground"/>
                    <Input className="h-8 pl-8 text-sm" placeholder="搜尋名稱或別名" value={q} onChange={e => setQ(e.target.value)}/>
                </div>
                <Button size="sm" className="h-8" onClick={() => setCreating(true)} data-testid="new-entity"><Plus/>新增</Button>
            </div>
            {tree.canon.length === 0 && (
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                    還沒有設定。新增角色、地點、名詞後,稿件中出現這些名稱時就能自動建立登場索引,並在詢問 AI 時建議附加。
                    也可以到「設定 › 作品」從 Notion 匯入。
                </p>
            )}
            {groups.map(g => {
                const Icon = TYPE_ICON[g.type] ?? Sparkles;
                return (
                    <div key={g.type} className="mb-3">
                        <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wider text-muted-foreground">
                            <Icon className="h-3.5 w-3.5"/>{g.type}<span className="font-normal opacity-60">{g.items.length}</span>
                        </div>
                        <ul>
                            {g.items.map(e => (
                                <li key={e.path} data-testid="entity-row"
                                    className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                                        e.path === current ? 'bg-accent' : 'hover:bg-accent/60')}
                                    onClick={() => openFile(e.path)}>
                                    <span className="flex-1 truncate">
                                        {e.name}
                                        {e.aliases?.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{e.aliases.join('、')}</span>}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground" title="在稿件中出現的次數">{appearances(e.path) || ''}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
            <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted-foreground/80">
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
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>{TYPE_ORDER.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
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
        </div>
    );
}
