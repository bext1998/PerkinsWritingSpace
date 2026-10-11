import {useState} from 'react';
import {Bot, EyeOff, HeartPulse, Loader2, SpellCheck} from 'lucide-react';
import {FindVariants, HealthCheck, IgnoreVariant, ReadFile, SuggestAttachments} from '../../wailsjs/go/main/App';
import {bible, health} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {baseName} from '@/lib/utils';
import {CHECKS} from '../quick';
import {PanelProps} from './types';

interface Props extends PanelProps {
    chapter: string | null;
}

// 作品健康檢查(SPEC §0 第 4 條):後端回報的類型 → 介面分組標題。
const HEALTH_LABEL: Record<string, string> = {
    'frontmatter': 'frontmatter 無法解析',
    'orphan-summary': '摘要對應的章節已不存在',
    'stale-summary': '摘要可能過期',
    'broken-link': '連結指向不存在的檔案',
    'missing-chapter': '卷中列出但不存在的章節',
};
// missing-chapter 的路徑是「不存在的章節」,沒有檔案可以開;其餘都是問題所在的檔案。
const HEALTH_OPENABLE: Record<string, boolean> = {'missing-chapter': false};

const checkedText = (at: string) => {
    const d = new Date(at);
    return isNaN(d.getTime()) ? at : d.toLocaleTimeString('zh-TW', {hour12: false});
};

export default function ChecksPanel({index, openFile, fail, ask, save, chapter}: Props) {
    const [variants, setVariants] = useState<bible.Variant[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<health.Report | null>(null);

    const run = async () => {
        setBusy(true);
        try {
            await save();
            setVariants(await FindVariants());
        } catch (e) { fail(e); }
        setBusy(false);
    };

    // 作品健康檢查:只在作者按下時跑。先存檔(檢查的是磁碟上的內容),錯誤照既有提示顯示。
    const runHealth = async () => {
        setBusy(true);
        try {
            await save();
            setReport(await HealthCheck());
        } catch (e) { fail(e); }
        setBusy(false);
    };

    // 後端的問題清單已依類型排好,連續同類型的一起呈現
    const groups: {check: string; items: health.Issue[]}[] = [];
    for (const is of report?.issues ?? []) {
        const last = groups[groups.length - 1];
        if (last && last.check === is.check) last.items.push(is);
        else groups.push({check: is.check, items: [is]});
    }

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
            ask({question: c.question, mode: c.mode, quickId: c.id, attach, priorSummaries: true, nonce: 0});
        } catch (e) { fail(e); }
    };

    return (
        <div className="space-y-6 p-3">
            <section>
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground">
                    <HeartPulse className="h-3.5 w-3.5"/>作品健康檢查
                </h3>
                <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                    由程式檢查作品檔案(設定、摘要、連結),只列出問題、不自動修改,也不經過 AI。檢查前會先存檔。
                </p>
                <Button size="sm" variant="secondary" className="w-full" onClick={runHealth} disabled={busy} data-testid="run-health">
                    {busy ? <Loader2 className="animate-spin"/> : <HeartPulse/>}開始檢查
                </Button>
                {report && (
                    <div className="mt-3 space-y-2" data-testid="health-report">
                        {report.issues.length === 0 && <p className="text-xs text-success">沒有發現問題。</p>}
                        {groups.map(g => (
                            <div key={g.check} data-testid="health-group" data-check={g.check} className="rounded-md border bg-card p-2">
                                <p className="text-xs font-medium text-warning">{HEALTH_LABEL[g.check] ?? g.check}({g.items.length})</p>
                                <div className="mt-1 space-y-1">
                                    {g.items.map((is, i) => {
                                        const body = (
                                            <>
                                                <span className="block truncate" title={is.path}>{is.path}</span>
                                                <span className="mt-0.5 block break-words text-muted-foreground">{is.message}</span>
                                            </>
                                        );
                                        return HEALTH_OPENABLE[is.check] === false
                                            ? <div key={i} data-testid="health-issue" className="text-xs">{body}</div>
                                            : <button key={i} data-testid="health-issue" className="block w-full text-left text-xs hover:text-foreground"
                                                      onClick={() => openFile(is.path)}>{body}</button>;
                                    })}
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground" data-testid="health-time">檢查時間 {checkedText(report.checkedAt)}</p>
                    </div>
                )}
            </section>

            <section>
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground">
                    <SpellCheck className="h-3.5 w-3.5"/>名稱寫法檢查
                </h3>
                <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                    找出與設定名稱只差一個字的寫法。由程式比對,不經過 AI,也不會自動修改。
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
                                    <span className="text-xs text-muted-foreground">設定:{nameOf(v.entity)}</span>
                                    <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => ignore(v)}>
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
                <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                    開啟對話框帶入問題、本章提及的設定與前情摘要,你確認後再送出;檢查模式下 AI 只寫報告。
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
