import {useEffect, useState} from 'react';
import {GetSettings, GetTree, ProjectPath} from '../wailsjs/go/main/App';
import {project} from '../wailsjs/go/models';
import {TooltipProvider} from '@/components/ui/overlay';
import {CrashPoint, onCrashRequest} from '@/components/ErrorBoundary';
import {setFrameVisible, setProjectName, setShellActions} from '@/lib/shellState';
import {setCategoriesProject} from './panels/types';
import Bookshelf from './Bookshelf';
import Workspace from './Workspace';
import SettingsPage from './SettingsPage';
import {applyPaperLayout, paperDefaults, PaperLayout} from './paperLayout';

function App() {
    const [tree, setTree] = useState<project.Tree | null>(null);
    const [settings, setSettings] = useState(false);
    const [settingsVersion, setSettingsVersion] = useState(0);
    const [theme, setTheme] = useState('dark');
    const [paper, setPaper] = useState<PaperLayout>(paperDefaults);
    const [, setTick] = useState(0);

    // 後端已開啟專案時(例如以 PERKINS_OPEN 啟動)直接載入
    useEffect(() => {
        GetTree().then(setTree).catch(() => {});
        GetSettings().then(s => {
            setTheme(s.theme || 'dark');
            // 稿紙版面(版心寬度、字級、段距):舊設定檔沒有欄位時用預設值(= 第一階段的畫面)
            setPaper({width: s.paperWidth || paperDefaults.width, fontSize: s.paperFontSize || paperDefaults.fontSize, gap: s.paperParaGap || paperDefaults.gap});
        }).catch(() => {});
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.classList.toggle('light', theme !== 'dark');
    }, [theme]);

    // 稿紙版面以 CSS 變數套用到編輯器(style.css、paper.ts 以 var() 取用),變更立即生效
    useEffect(() => { applyPaperLayout(paper); }, [paper]);

    // 標題欄(在 RootBoundary 之外)靠這個模組層狀態取得作品名稱與「目前畫面看不看得到作品外框」與選單動作
    useEffect(() => { setProjectName(tree?.name ?? null); }, [tree]);
    useEffect(() => { setFrameVisible(!!tree && !settings); }, [tree, settings]);
    useEffect(() => {
        setShellActions({settings: settings ? undefined : () => setSettings(true)});
        return () => setShellActions({settings: undefined});
    }, [settings]);

    // 分類快照綁定作品(SPEC §12.2 第二輪):以作品路徑為識別,切作品時清空並重查,
    // 世代計數忽略上一作品的在途結果;同作品的 tree 刷新(同路徑)不重置。
    useEffect(() => {
        let alive = true;
        ProjectPath().then(p => { if (alive) setCategoriesProject(p || null); }).catch(() => {});
        return () => { alive = false; };
    }, [tree]);

    // 開發模式:window.__perkinsCrash 設定拋錯旗標後,靠這裡強制重繪讓拋錯點生效
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        return onCrashRequest(() => setTick(t => t + 1));
    }, []);

    const closeSettings = () => {
        setSettings(false);
        setSettingsVersion(v => v + 1);
    };

    return (
        <TooltipProvider delayDuration={300}>
            <CrashPoint area="root"/>
            {tree
                ? <Workspace tree={tree} setTree={setTree} onClose={() => setTree(null)} onSettings={() => setSettings(true)}
                             settingsVersion={settingsVersion}/>
                : <Bookshelf onOpen={setTree} onSettings={() => setSettings(true)}/>}
            {settings && <SettingsPage tree={tree} setTree={setTree} theme={theme} setTheme={setTheme} paper={paper} setPaper={setPaper} onClose={closeSettings}/>}
        </TooltipProvider>
    );
}

export default App
