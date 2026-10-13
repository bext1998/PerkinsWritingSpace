import {useEffect, useState} from 'react';
import {Check} from 'lucide-react';
import {bible} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/basic';

interface Props {
    entity: bible.Entity;
    onApply: (aliases: string[]) => void;
}

const splitAliases = (s: string) => s.split(/[,，、]/).map(x => x.trim()).filter(Boolean);

/** 設定檔上方的別名欄:名稱就是檔名,別名是 Perkins 唯一會寫進設定檔的欄位(SPEC §12.2)。
 *  用於登場索引、寫法檢查與「本段提到的設定」;留空就不寫。套用後需存檔。 */
export default function EntityHeader({entity, onApply}: Props) {
    const [aliases, setAliases] = useState((entity.aliases ?? []).join('、'));

    // 作者直接改 frontmatter 時同步表單
    useEffect(() => {
        setAliases((entity.aliases ?? []).join('、'));
    }, [(entity.aliases ?? []).join('、')]);

    const changed = splitAliases(aliases).join('、') !== (entity.aliases ?? []).join('、');

    return (
        <form className="flex shrink-0 items-center gap-2 border-b bg-sidebar/60 px-4 py-2"
              onSubmit={e => { e.preventDefault(); onApply(splitAliases(aliases)); }}>
            <span className="shrink-0 text-xs text-muted-foreground">別名</span>
            <Input className="h-8 flex-1 text-sm" value={aliases} onChange={e => setAliases(e.target.value)}
                   placeholder={`選填:稿件裡對「${entity.name}」的其他叫法,用頓號分隔`}
                   data-testid="entity-aliases"/>
            {changed && <Button size="sm" className="h-8" type="submit" data-testid="entity-apply"><Check/>套用</Button>}
        </form>
    );
}
