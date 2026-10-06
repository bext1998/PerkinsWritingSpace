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
let loadingGen = -1; // 正在進行的查詢所屬世代;只有目前世代且仍持有該請求者能清(第三輪返工 #2)
let pending = false; // 在途期間收到的刷新要求:完成後補查,不直接丟棄
let projectId: string | null = null;
let generation = 0; // 作品世代:切作品後忽略上一作品的在途結果(第二輪返工 #2)
const listeners = new Set<() => void>();

async function refreshCategories() {
    if (loadingGen >= 0) {
        pending = true; // 有人在查:記下,完成後再查一次(不丟棄)
        return;
    }
    const gen = generation;
    loadingGen = gen;
    try {
        const cats = await EntityTypes();
        if (gen === generation) {
            sharedCats = cats;
            sharedError = null;
            loaded = true;
        }
    } catch (e) {
        if (gen === generation) sharedError = errText(e); // 清單損毀:保留既有清單並顯示錯誤(SPEC §12.2)
    } finally {
        // 只有「目前世代且仍擁有這份在途請求」才能清 loading 與補查;
        // 舊世代的 finally 不得動新世代的狀態(例如 A 在途、切 B 後 A 才返回)。
        const owner = loadingGen === gen;
        let rerun = false;
        if (owner) {
            loadingGen = -1;
            rerun = pending && gen === generation;
            pending = false;
        }
        if (gen === generation) listeners.forEach(l => l());
        if (rerun) void refreshCategories();
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
    loadingGen = -1; // 舊作品在途查詢由世代忽略;持有權一併重置,讓新作品立即可查
    pending = false;
    listeners.forEach(l => l());
    if (id) void refreshCategories();
}

/** 取得分類清單(內建+自訂)。回傳 [清單, 重新讀取, 錯誤];共用狀態,新增/刪除後全部同步。 */
export function useCategories(): [string[], () => void, string | null] {
    const [, force] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        listeners.add(force);
        if (!loaded) void refreshCategories(); // 在途時 refresh 自己會記 pending 補查,不丟棄
        return () => { listeners.delete(force); };
    }, []);
    return [sharedCats, () => { void refreshCategories(); }, sharedError];
}
