import {useState} from 'react';
import {ChevronDown, ChevronRight, FileArchive, FolderOpen, Import, Loader2, Undo2} from 'lucide-react';
import {NotionApply, NotionScan, NotionUndo, PickNotionExport} from '../wailsjs/go/main/App';
import {notion} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/overlay';
import {errText} from '@/lib/utils';
import {TYPE_ORDER} from './panels/types';

const TARGETS = [...TYPE_ORDER, '大綱', '筆記', '略過'];

/** Notion 一次性匯入(SPEC §12.5):選來源 → 指定每組去處(可在資料夾之下逐頁覆寫)→ 匯入 → 可整批撤銷。 */
export default function NotionImport({onDone}: {onDone: () => void}) {
    const [src, setSrc] = useState('');
    const [plan, setPlan] = useState<notion.Plan | null>(null);
    const [choices, setChoices] = useState<Record<string, string>>({});
    const [pages, setPages] = useState<Record<string, string>>({});
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [result, setResult] = useState<notion.Result | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [undone, setUndone] = useState(false);

    const pick = async (zip: boolean) => {
        try {
            const s = await PickNotionExport(zip);
            if (!s) return;
            setBusy(true);
            setSrc(s);
            setResult(null);
            setUndone(false);
            setOpen({});
            setPages({});
            const p = await NotionScan(s);
            setPlan(p);
            // 預設:資料夾名稱看起來像角色/地點…就直接對應,其餘先匯入為筆記
            const guess: Record<string, string> = {};
            for (const g of p.groups) {
                const hit = TYPE_ORDER.find(t => g.label.includes(t));
                guess[g.key] = hit ?? (/人物|登場/.test(g.label) ? '角色' : /大綱|劇情/.test(g.label) ? '大綱' : '筆記');
            }
            setChoices(guess);
            setError('');
        } catch (e) { setError(errText(e)); setPlan(null); }
        setBusy(false);
    };

    const apply = async () => {
        setBusy(true);
        try {
            setResult(await NotionApply(src, choices, pages));
            setPlan(null);
            onDone();
        } catch (e) { setError(errText(e)); }
        setBusy(false);
    };

    const undo = async () => {
        if (!result) return;
        try {
            await NotionUndo(result.id);
            setUndone(true);
            onDone();
        } catch (e) { setError(errText(e)); }
    };

    // 匯入頁數按逐頁結果計算:略過的不算
    const total = plan?.groups.reduce((n, g) => n + g.files.filter(f => {
        const t = pages[f.src] ?? choices[g.key];
        return t !== '略過' && t !== '';
    }).length, 0) ?? 0;

    return (
        <section className="rounded-lg border p-5">
            <h3 className="mb-1 flex items-center gap-2 font-semibold"><Import className="h-4 w-4"/>從 Notion 匯入設定</h3>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                在 Notion 選擇「匯出 → Markdown &amp; CSV」,再選擇下載的 zip 或解壓後的資料夾。每個資料夾(資料庫)可以指定要匯入成哪一類設定,
                也可展開後單獨覆寫某一頁的去處或略過。
                已有的同名檔案不會被覆蓋;匯入前會自動快照,也可以一鍵撤銷。這是一次性搬家,之後不會與 Notion 同步。
            </p>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => pick(true)} disabled={busy}><FileArchive/>選擇 zip</Button>
                <Button variant="outline" onClick={() => pick(false)} disabled={busy}><FolderOpen/>選擇資料夾</Button>
                {busy && <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground"/>}
            </div>
            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

            {plan && (
                <div className="mt-5">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs text-muted-foreground">
                        <tr><th className="pb-2 font-medium">Notion 資料夾</th><th className="pb-2 font-medium">頁數</th><th className="pb-2 font-medium">匯入為</th></tr>
                        </thead>
                        <tbody>
                        {plan.groups.map(g => {
                            const overridden = g.files.filter(f => pages[f.src] !== undefined).length;
                            const expanded = open[g.key];
                            return (
                                <tr key={g.key} className="border-t">
                                    <td className="py-2 pr-3">
                                        <button type="button" className="flex items-center gap-1 text-left"
                                                data-testid={`expand-${g.key || 'root'}`}
                                                onClick={() => setOpen(o => ({...o, [g.key]: !o[g.key]}))}>
                                            {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0"/> : <ChevronRight className="h-3.5 w-3.5 shrink-0"/>}
                                            <span>{g.label}</span>
                                        </button>
                                        <div className="truncate text-[11px] text-muted-foreground">
                                            {g.files.slice(0, 5).map(f => f.name).join('、')}{g.files.length > 5 ? '…' : ''}
                                            {overridden > 0 && <span data-testid={`override-count-${g.key || 'root'}`}> · {overridden} 頁另行指定</span>}
                                        </div>
                                    </td>
                                    <td className="py-2 text-muted-foreground">{g.files.length}</td>
                                    <td className="w-40 py-2">
                                        <Select value={choices[g.key]} onValueChange={v => setChoices(c => ({...c, [g.key]: v}))}>
                                            <SelectTrigger className="h-8"><SelectValue/></SelectTrigger>
                                            <SelectContent>{TARGETS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                        </Select>
                                        {expanded && (
                                            <div className="mt-2 max-h-56 overflow-y-auto rounded-md border p-2" data-testid={`pages-${g.key || 'root'}`}>
                                                {g.files.map(f => (
                                                    <div key={f.src} className="mb-1.5 flex items-center gap-2 last:mb-0">
                                                        <span className="min-w-0 flex-1 truncate text-xs" title={f.name}>{f.name}</span>
                                                        <Select value={pages[f.src] ?? ''}
                                                                onValueChange={v => setPages(pg => {
                                                                    const next = {...pg};
                                                                    if (v === '') delete next[f.src]; else next[f.src] = v;
                                                                    return next;
                                                                })}>
                                                            <SelectTrigger className="h-7 w-44 shrink-0 text-xs">
                                                                {/* 閉合時也明示目前跟隨的去處,隨群組選擇即時更新 */}
                                                                <SelectValue placeholder={`跟隨資料夾(目前:${choices[g.key]})`}/>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="" data-testid={`page-follow-${f.name}`}>
                                                                    跟隨資料夾(目前:{choices[g.key]})
                                                                </SelectItem>
                                                                {TARGETS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                    {plan.images > 0 && <p className="mt-2 text-xs text-muted-foreground">匯出中有 {plan.images} 張圖片,目前不會匯入。</p>}
                    <Button className="mt-4" onClick={apply} disabled={busy || total === 0}><Import/>匯入 {total} 頁</Button>
                </div>
            )}

            {result && (
                <div className="mt-5 rounded-md bg-muted p-3 text-sm">
                    {undone ? <p>已撤銷這次匯入,檔案移到了 .perkins/trash。</p> : (
                        <>
                            <p>已匯入 {result.created.length} 個檔案。{result.skipped.length > 0 && `略過 ${result.skipped.length} 個:`}</p>
                            {result.skipped.length > 0 && (
                                <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-muted-foreground">
                                    {result.skipped.map(s => <li key={s}>{s}</li>)}
                                </ul>
                            )}
                            <Button size="sm" variant="outline" className="mt-3" onClick={undo}><Undo2/>撤銷這次匯入</Button>
                        </>
                    )}
                </div>
            )}
        </section>
    );
}
