import {useEffect, useState} from 'react';
import {Check} from 'lucide-react';
import {bible} from '../wailsjs/go/models';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/basic';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/overlay';
import {BUILTIN_TYPES} from './panels/types';

interface Props {
    entity: bible.Entity;
    onApply: (type: string, name: string, aliases: string[]) => void;
}

const splitAliases = (s: string) => s.split(/[,，、]/).map(x => x.trim()).filter(Boolean);

/** 設定檔上方的欄位表單:只編輯程式需要的 type/name/aliases,其他內容留在本文。套用後需存檔。 */
export default function EntityHeader({entity, onApply}: Props) {
    const [type, setType] = useState(entity.type);
    const [name, setName] = useState(entity.name);
    const [aliases, setAliases] = useState((entity.aliases ?? []).join('、'));

    // 作者直接改 frontmatter 時同步表單
    useEffect(() => {
        setType(entity.type);
        setName(entity.name);
        setAliases((entity.aliases ?? []).join('、'));
    }, [entity.type, entity.name, (entity.aliases ?? []).join('、')]);

    const changed = type !== entity.type || name !== entity.name || splitAliases(aliases).join('、') !== (entity.aliases ?? []).join('、');
    // 內建分類;檔案原有的非內建 type(例如舊的自訂分類)照樣列出並保留,不改寫(#100)
    const types = BUILTIN_TYPES.includes(type) ? BUILTIN_TYPES : [...BUILTIN_TYPES, type];

    return (
        <form className="flex shrink-0 items-center gap-2 border-b bg-sidebar/60 px-4 py-2"
              onSubmit={e => { e.preventDefault(); onApply(type, name.trim(), splitAliases(aliases)); }}>
            <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-8 w-24 text-sm" data-testid="entity-header-type"><SelectValue/></SelectTrigger>
                <SelectContent>{types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-8 w-40 text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="名稱" data-testid="entity-name"/>
            <Input className="h-8 flex-1 text-sm" value={aliases} onChange={e => setAliases(e.target.value)}
                   placeholder="別名/暱稱,用頓號分隔(例如:艾莉、小艾)" data-testid="entity-aliases"/>
            {changed && <Button size="sm" className="h-8" type="submit" data-testid="entity-apply"><Check/>套用</Button>}
        </form>
    );
}
