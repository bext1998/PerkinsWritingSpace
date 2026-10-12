import {bible, main, project} from '../../wailsjs/go/models';
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

// 內建分類與其順序(SPEC §12.2)。自訂分類與「管理分類」已移除(#100):
// frontmatter 裡既有的非內建 type 照常保留與顯示,只是不再出現在新增時的選單裡。
export const BUILTIN_TYPES = ['角色', '地點', '勢力', '道具', '名詞', '其他'];
