import {useState} from 'react';
import {Lock, NotebookPen, Plus, Trash2, Waypoints} from 'lucide-react';
import {NewDoc, TrashFile} from '../../wailsjs/go/main/App';
import {project} from '../../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/basic';
import {Tip} from '@/components/ui/overlay';
import {cn} from '@/lib/utils';
import {PanelProps} from './types';

type Dir = 'outline' | 'notes';

export default function DocsPanel({tree, current, openFile, refreshTree, notify, fail}: PanelProps) {
    const [adding, setAdding] = useState<Dir | null>(null);
    const [input, setInput] = useState('');

    const create = async (dir: Dir) => {
        const t = input.trim();
        setAdding(null);
        setInput('');
        if (!t) return;
        try {
            const rel = await NewDoc(dir, t, '');
            await refreshTree();
            await openFile(rel);
        } catch (e) { fail(e); }
    };

    const trash = async (rel: string) => {
        try {
            await TrashFile(rel);
            await refreshTree();
            notify({text: '已移到回收區(.perkins/trash)', kind: 'info'});
        } catch (e) { fail(e); }
    };

    const section = (dir: Dir, title: string, Icon: typeof Waypoints, items: project.Entry[], hint: string) => (
        <div className="mb-5">
            <div className="group mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wider text-muted-foreground">
                <Icon className="h-3.5 w-3.5"/>{title}
                <Tip label="只有在對話框附加後 AI 才看得到" side="top"><Lock className="h-3 w-3 opacity-60"/></Tip>
                <div className="flex-1"/>
                <Button variant="ghost" size="iconSm" onClick={() => { setAdding(dir); setInput(''); }}><Plus/></Button>
            </div>
            {adding === dir && (
                <form className="mb-1" onSubmit={e => { e.preventDefault(); create(dir); }}>
                    <Input autoFocus className="h-8 text-sm" placeholder="名稱,Enter 建立" value={input}
                           onChange={e => setInput(e.target.value)}
                           onBlur={() => { if (!input.trim()) setAdding(null); }}
                           onKeyDown={e => { if (e.key === 'Escape') setAdding(null); }}/>
                </form>
            )}
            {items.length === 0 && adding !== dir && <p className="px-1 text-xs text-muted-foreground/70">{hint}</p>}
            <ul>
                {items.map(e => (
                    <li key={e.path}
                        className={cn('group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                            e.path === current ? 'bg-accent' : 'hover:bg-accent/60')}
                        onClick={() => openFile(e.path)}>
                        <span className="flex-1 truncate">{e.title}</span>
                        <button className="hidden text-muted-foreground hover:text-destructive group-hover:block"
                                onClick={ev => { ev.stopPropagation(); trash(e.path); }}>
                            <Trash2 className="h-3.5 w-3.5"/>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );

    return (
        <div className="p-3">
            {section('outline', '大綱', Waypoints, tree.outline, '全書概要、各卷大綱都可以放這裡。大綱可能包含還沒寫到的劇情,所以預設不給 AI 看。')}
            {section('notes', '筆記', NotebookPen, tree.notes, '靈感、資料、待辦。筆記是私人的,只有你附加時 AI 才看得到。')}
        </div>
    );
}
