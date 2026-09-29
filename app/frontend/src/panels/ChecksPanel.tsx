import {useState} from 'react';
import {Bot, EyeOff, Loader2, SpellCheck} from 'lucide-react';
import {FindVariants, IgnoreVariant, ReadFile, SuggestAttachments} from '../../wailsjs/go/main/App';
import {bible} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {baseName} from '@/lib/utils';
import {CHECKS} from '../quick';
import {PanelProps} from './types';

interface Props extends PanelProps {
    chapter: string | null;
}

export default function ChecksPanel({index, openFile, fail, ask, save, chapter}: Props) {
    const [variants, setVariants] = useState<bible.Variant[] | null>(null);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        try {
            await save();
            setVariants(await FindVariants());
        } catch (e) { fail(e); }
        setBusy(false);
    };

    const ignore = async (v: bible.Variant) => {
        try {
            await IgnoreVariant(v.variant);
            setVariants(list => list?.filter(x => x.variant !== v.variant) ?? null);
        } catch (e) { fail(e); }
    };

    // 跳到疑似錯寫第一次出現的那一行
    const locate = async (v: bible.Variant) => {
        try {
            const text = await ReadFile(v.chapter);
            const at = text.indexOf(v.variant);
            const line = at < 0 ? 1 : text.slice(0, at).split('\n').length;
            await openFile(v.chapter, line);
        } catch (e) { fail(e); }
    };

    const nameOf = (path: string) => index?.entities.find(e => e.path === path)?.name ?? baseName(path);

    const aiCheck = async (i: number) => {
        if (!chapter) return;
        try {
            await save();
            const text = await ReadFile(chapter);
            const attach = await SuggestAttachments(text);
            const c = CHECKS[i];
            ask({question: c.question, mode: c.mode, attach, priorSummaries: true, nonce: 0});
        } catch (e) { fail(e); }
    };

    return (
        <div className="space-y-6 p-3">
            <section>
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground">
                    <SpellCheck className="h-3.5 w-3.5"/>名稱寫法檢查
                </h3>
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                    找出與設定中的名稱只差一個字的寫法(例如「艾麗絲」與「艾莉絲」)。由程式比對,不經過 AI,也不會自動修改。
                </p>
                <Button size="sm" variant="secondary" className="w-full" onClick={run} disabled={busy} data-testid="run-variants">
                    {busy ? <Loader2 className="animate-spin"/> : <SpellCheck/>}檢查全書
                </Button>
                {variants && (
                    <div className="mt-3 space-y-2">
                        {variants.length === 0 && <p className="text-xs text-success">沒有發現寫法不一致。</p>}
                        {variants.map(v => (
                            <div key={v.entity + v.variant} className="rounded-md border bg-card p-2 text-xs" data-testid="variant">
                                <div className="flex items-center gap-1">
                                    <span className="font-medium text-warning">{v.variant}</span>
                                    <span className="text-muted-foreground">→ {v.known}?</span>
                                    <span className="ml-auto text-muted-foreground">×{v.count}</span>
                                </div>
                                <p className="mt-1 line-clamp-2 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => locate(v)}>
                                    {baseName(v.chapter)}:…{v.snippet}…
                                </p>
                                <div className="mt-1 flex justify-between">
                                    <span className="text-[10px] text-muted-foreground">設定:{nameOf(v.entity)}</span>
                                    <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => ignore(v)}>
                                        <EyeOff className="h-3 w-3"/>不是錯字
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground">
                    <Bot className="h-3.5 w-3.5"/>AI 一致性檢查(本章)
                </h3>
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                    會開啟對話框並帶入問題、本章登場的設定與前情摘要,你確認後再送出。檢查模式下 AI 只能寫報告,不能提出修改。
                </p>
                {!chapter && <p className="text-xs text-muted-foreground/70">先開啟一章。</p>}
                <div className="grid gap-1.5">
                    {CHECKS.map((c, i) => (
                        <Button key={c.id} size="sm" variant="outline" className="justify-start" disabled={!chapter} onClick={() => aiCheck(i)}>
                            {c.label}
                        </Button>
                    ))}
                </div>
            </section>
        </div>
    );
}
