import {useEffect, useState} from 'react';
import {Bot, Hash, ScrollText, TriangleAlert, Users} from 'lucide-react';
import {GetSummary} from '../../wailsjs/go/main/App';
import {project, summary} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/basic';
import {Tip} from '@/components/ui/overlay';
import {baseName} from '@/lib/utils';
import {PanelProps} from './types';
import {TYPE_ICON} from './BiblePanel';

interface Props extends PanelProps {
    chapter: project.Entry | null;
    onSummary: (rel: string) => void;
    scrollToLine: (line: number) => void;
    summaryTick: number;
}

function Section({title, icon: Icon, children}: {title: string; icon: typeof Hash; children: React.ReactNode}) {
    return (
        <section className="border-b px-4 py-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground">
                <Icon className="h-3.5 w-3.5"/>{title}
            </h3>
            {children}
        </section>
    );
}

export default function Inspector({tree, current, index, chapter, openFile, ask, onSummary, scrollToLine, summaryTick}: Props) {
    const [sum, setSum] = useState<summary.Summary | null>(null);

    useEffect(() => {
        setSum(null);
        if (chapter) GetSummary(chapter.path).then(setSum).catch(() => {});
    }, [chapter?.path, summaryTick]);

    const entityOf = (path: string) => index?.entities.find(e => e.path === path);
    const titleOf = (path: string) => tree.manuscript.find(c => c.path === path)?.title ?? baseName(path);

    const cast = chapter ? index?.byChapter?.[chapter.path] ?? [] : [];
    const appearances = current?.startsWith('canon/') ? index?.appearances?.[current] ?? [] : [];

    return (
        <aside className="w-[280px] shrink-0 overflow-y-auto border-l bg-sidebar" data-testid="inspector">
            {chapter && (
                <>
                    <Section title="章節摘要" icon={ScrollText}>
                        {sum?.exists ? (
                            <>
                                {sum.stale && (
                                    <Badge variant="warning" className="mb-2"><TriangleAlert className="h-3 w-3"/>章節已修改,摘要可能過期</Badge>
                                )}
                                <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">{sum.text}</p>
                                <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => onSummary(chapter.path)}>編輯摘要</Button>
                            </>
                        ) : (
                            <>
                                <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                                    還沒有摘要。確認過的摘要會在之後的章節中作為「前情」提供給 AI,節省上下文。
                                </p>
                                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => onSummary(chapter.path)}>建立摘要</Button>
                            </>
                        )}
                    </Section>

                    {(chapter.scenes?.length ?? 0) > 0 && (
                        <Section title="場景" icon={Hash}>
                            <ul className="space-y-0.5">
                                {chapter.scenes!.map(s => (
                                    <li key={s.line} className="cursor-pointer truncate rounded px-1 py-0.5 text-sm hover:bg-accent"
                                        onClick={() => scrollToLine(s.line)}>{s.title}</li>
                                ))}
                            </ul>
                        </Section>
                    )}

                    <Section title="本章登場" icon={Users}>
                        {cast.length === 0 ? (
                            <p className="text-xs text-muted-foreground">沒有偵測到設定集裡的名稱。(存檔後更新)</p>
                        ) : (
                            <ul className="space-y-0.5" data-testid="cast">
                                {cast.map(c => {
                                    const e = entityOf(c.path);
                                    const Icon = TYPE_ICON[e?.type ?? '其他'] ?? Users;
                                    return (
                                        <li key={c.path} className="group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                                            <Icon className="h-3.5 w-3.5 text-muted-foreground"/>
                                            <span className="flex-1 cursor-pointer truncate" onClick={() => openFile(c.path)}>{e?.name ?? baseName(c.path)}</span>
                                            <span className="text-[10px] text-muted-foreground">×{c.count}</span>
                                            <Tip label="附加到對話" side="left">
                                                <button className="hidden text-muted-foreground hover:text-primary group-hover:block"
                                                        onClick={() => ask({attach: [c.path], nonce: 0})}>
                                                    <Bot className="h-3.5 w-3.5"/>
                                                </button>
                                            </Tip>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Section>
                </>
            )}

            {current?.startsWith('canon/') && (
                <Section title="登場索引" icon={Users}>
                    {appearances.length === 0 ? (
                        <p className="text-xs text-muted-foreground">稿件中還沒有出現這個名稱或別名。</p>
                    ) : (
                        <ul className="space-y-0.5" data-testid="appearances">
                            {appearances.map(a => (
                                <li key={a.path} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
                                    onClick={() => openFile(a.path)}>
                                    <span className="flex-1 truncate">{titleOf(a.path)}</span>
                                    <span className="text-[10px] text-muted-foreground">×{a.count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>
            )}

            {!chapter && !current?.startsWith('canon/') && (
                <p className="p-4 text-xs text-muted-foreground">這裡會顯示章節摘要、場景、登場人物與設定的登場索引。</p>
            )}
        </aside>
    );
}
