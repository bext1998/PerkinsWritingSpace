import {useEffect, useState} from 'react';
import {GetSettings, GetTree, ProjectPath} from '../wailsjs/go/main/App';
import {project} from '../wailsjs/go/models';
import {TooltipProvider} from '@/components/ui/overlay';
import {CrashPoint, onCrashRequest} from '@/components/ErrorBoundary';
import {setProjectName, setRailLogoVisible} from '@/lib/shellState';
import {setCategoriesProject} from './panels/types';
import Bookshelf from './Bookshelf';
import Workspace from './Workspace';
import SettingsPage from './SettingsPage';

function App() {
    const [tree, setTree] = useState<project.Tree | null>(null);
    const [settings, setSettings] = useState(false);
    const [settingsVersion, setSettingsVersion] = useState(0);
    const [theme, setTheme] = useState('dark');
    const [, setTick] = useState(0);

    // 後端已開啟專案時(例如以 PERKINS_OPEN 啟動)直接載入
    useEffect(() => {
        GetTree().then(setTree).catch(() => {});
        GetSettings().then(s => setTheme(s.theme || 'dark')).catch(() => {});
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.classList.toggle('light', theme !== 'dark');
    }, [theme]);

    // 標題欄(在 RootBoundary 之外)靠這個模組層狀態取得作品名稱與「目前畫面看不看得到側欄 logo」
    useEffect(() => { setProjectName(tree?.name ?? null); }, [tree]);
    useEffect(() => { setRailLogoVisible(!!tree && !settings); }, [tree, settings]);

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
            {settings && <SettingsPage tree={tree} setTree={setTree} theme={theme} setTheme={setTheme} onClose={closeSettings}/>}
        </TooltipProvider>
    );
}

export default App
