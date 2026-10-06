import {bible, main, project} from '../../wailsjs/go/models';
import {useEffect, useReducer} from 'react';
import {EntityTypes} from '../../wailsjs/go/main/App';
import {errText} from '@/lib/utils';
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
    // 刪除分類:由 Workspace 協調(先存檔再快照+改歸其他,並重載受影響的開啟中檔案)
    deleteCategory: (name: string) => Promise<void>;
}

// 內建分類與其順序(SPEC §12.2);執行期清單 = 內建 + 自訂,一律用 useCategories 從後端取得。
export const BUILTIN_TYPES = ['角色', '地點', '勢力', '道具', '名詞', '其他'];

// 模組層級共用狀態(返工#4):所有 useCategories 消費者讀同一份清單,
// 任一處重新讀取(新增/刪除分類後)會通知全部重讀——已開啟的 EntityHeader 立即更新。
let sharedCats: string[] = BUILTIN_TYPES;
let sharedError: string | null = null;
let loaded = false;
let loading = false;
let projectId: string | null = null;
let generation = 0; // 作品世代:切作品後忽略上一作品的在途結果(第二輪返工 #2)
const listeners = new Set<() => void>();

async function refreshCategories() {
    if (loading) return;
    const gen = generation;
    loading = true;
    try {
        const cats = await EntityTypes();
        if (gen !== generation) return; // 上一作品的在途結果,忽略
        sharedCats = cats;
        sharedError = null;
        loaded = true;
    } catch (e) {
        if (gen !== generation) return;
        sharedError = errText(e); // 清單損毀:保留既有清單並顯示錯誤,不得覆寫原檔(SPEC §12.2)
    } finally {
        loading = false;
        if (gen === generation) listeners.forEach(l => l());
    }
}

/** 切換作品時綁定/清空分類快照(SPEC §12.2):同路徑不重複處理;null/空字串 = 未開作品。 */
export function setCategoriesProject(id: string | null) {
    if (id === projectId) return;
    projectId = id;
    generation++;
    sharedCats = BUILTIN_TYPES;
    sharedError = null;
    loaded = false;
    loading = false; // 舊作品可能還有在途查詢:放行新查詢,舊結果由世代計數忽略
    listeners.forEach(l => l());
    if (id) void refreshCategories();
}

/** 取得分類清單(內建+自訂)。回傳 [清單, 重新讀取, 錯誤];共用狀態,新增/刪除後全部同步。 */
export function useCategories(): [string[], () => void, string | null] {
    const [, force] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        listeners.add(force);
        if (!loaded && !loading) void refreshCategories();
        return () => { listeners.delete(force); };
    }, []);
    return [sharedCats, () => { void refreshCategories(); }, sharedError];
}
