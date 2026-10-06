import {bible, main, project} from '../../wailsjs/go/models';
import {useEffect, useState} from 'react';
import {EntityTypes} from '../../wailsjs/go/main/App';
import type {Toast} from '../Workspace';
import type {ChatRequest} from '../ChatWindow';

export interface PanelProps {
    tree: project.Tree;
    current: string | null;
    counts: Record<string, number>;
    index: bible.Index | null;
    cfg: main.SettingsView | null;
    openFile: (rel: string, line?: number) => Promise<void>;
    refreshTree: () => Promise<void>;
    refreshIndex: () => void;
    notify: (t: Toast) => void;
    fail: (e: unknown) => void;
    ask: (req: ChatRequest) => void;
    save: () => Promise<void>;
}

// 內建分類與其順序(SPEC §12.2);執行期清單 = 內建 + 自訂,一律用 useCategories 從後端取得。
export const BUILTIN_TYPES = ['角色', '地點', '勢力', '道具', '名詞', '其他'];

/** 取得分類清單(內建+自訂)。回傳 [清單, 重新讀取];管理分類新增/刪除後呼叫後者刷新。 */
export function useCategories(): [string[], () => void] {
    const [cats, setCats] = useState<string[]>(BUILTIN_TYPES);
    const [tick, setTick] = useState(0);
    useEffect(() => { EntityTypes().then(setCats).catch(() => {}); }, [tick]);
    return [cats, () => setTick(t => t + 1)];
}
