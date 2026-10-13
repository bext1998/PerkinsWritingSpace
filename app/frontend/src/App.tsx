import {useEffect, useState} from 'react';
import {GetSettings, GetTree} from '../wailsjs/go/main/App';
import {project, settings as settingsModel} from '../wailsjs/go/models';
import {TooltipProvider} from '@/components/ui/overlay';
import {CrashPoint, onCrashRequest} from '@/components/ErrorBoundary';
import {setFrameVisible, setProjectName, setShellActions} from '@/lib/shellState';
import Bookshelf from './Bookshelf';
import Workspace from './Workspace';
import SettingsPage from './SettingsPage';
import {applyPaperLayout, paperDefaults, PaperLayout} from './paperLayout';
import {applyDerivedTokens, clearDerivedTokens, deriveTokens} from './appearance';

// 外觀設定(Issue #118):預設值以中央設定為準,載入後由外觀頁即按即存取代。
const DEFAULT_APPEARANCE: settingsModel.Appearance = settingsModel.Appearance.createFrom({
    mode: 'dark', uiFontSize: 'standard', reduceMotion: 'system',
    dark: {preset: 'study'}, light: {preset: 'paper'},
});

const systemPrefersDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

// 當前生效側(mode + 系統偏好):告訴前端要套用 dark.* 或 light.* 的設定。
const effectiveSide = (mode: string): 'dark' | 'light' => {
    if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
    return mode === 'light' ? 'light' : 'dark';
};

// 主題預設檔的 CSS class(.dark.theme-graphite / .light.theme-cream);
function themeClass(side: 'dark' | 'light', preset: string): string {
    if (side === 'dark' && preset === 'graphite') return 'theme-graphite';
    if (side === 'light' && preset === 'cream') return 'theme-cream';
    return ''; // study / paper 是 .dark / :root 的預設值,不需要再加 class
}

function App() {
    const [tree, setTree] = useState<project.Tree | null>(null);
    const [settings, setSettings] = useState(false);
    const [settingsVersion, setSettingsVersion] = useState(0);
    const [appearance, setAppearance] = useState<settingsModel.Appearance>(DEFAULT_APPEARANCE);
    const [paper, setPaper] = useState<PaperLayout>(paperDefaults);
    const [, setTick] = useState(0);

    // 後端已開啟專案時(例如以 PERKINS_OPEN 啟動)直接載入
    useEffect(() => {
        GetTree().then(setTree).catch(() => {});
        GetSettings().then(s => {
            if (s.appearance && s.appearance.mode) setAppearance(s.appearance);
            // 稿紙版面(版心寬度、字級、段距):舊設定檔沒有欄位時用預設值(= 第一階段的畫面)
            setPaper({width: s.paperWidth || paperDefaults.width, fontSize: s.paperFontSize || paperDefaults.fontSize, gap: s.paperParaGap || paperDefaults.gap});
        }).catch(() => {});
    }, []);

    // 跟隨系統:matchMedia 變更時,如果是 system 模式要重新套用(避免手動切 OS 主題不生效)
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => { if (appearance.mode === 'system') setTick(t => t + 1); };
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, [appearance.mode]);

    // 套用主題 class(深/淺 + 主題預設檔)、介面字級、減少動態效果、自訂色推算
    useEffect(() => {
        const html = document.documentElement;
        const side = effectiveSide(appearance.mode);
        const sideCfg = side === 'dark' ? appearance.dark : appearance.light;
        // class:dark / light 決定走哪組 token;theme-graphite / theme-cream 蓋掉那組預設值
        html.classList.toggle('dark', side === 'dark');
        html.classList.toggle('light', side === 'light');
        for (const c of ['theme-graphite', 'theme-cream']) html.classList.remove(c);
        const tc = themeClass(side, sideCfg.preset);
        if (tc) html.classList.add(tc);
        // 介面字級
        html.classList.remove('ui-font-small', 'ui-font-large');
        if (appearance.uiFontSize === 'small') html.classList.add('ui-font-small');
        else if (appearance.uiFontSize === 'large') html.classList.add('ui-font-large');
        // 減少動態效果:on 一律;off 從不;system 跟 media query
        html.classList.remove('reduce-motion');
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (appearance.reduceMotion === 'on' || (appearance.reduceMotion === 'system' && mq.matches)) html.classList.add('reduce-motion');
        // 自訂色推算:背景或文字或強調色 任一不為空 → 用 deriveTokens 覆寫
        const hasCustom = !!(sideCfg.background || sideCfg.foreground || sideCfg.accent);
        if (hasCustom) {
            const bg = sideCfg.background || (side === 'dark' ? '#161b22' : '#fdfaf3');
            const fg = sideCfg.foreground || (side === 'dark' ? '#e7e2d4' : '#1f1d18');
            const accent = sideCfg.accent || (side === 'dark' ? '#d99749' : '#8a5a2c');
            applyDerivedTokens(deriveTokens(bg, fg, accent, side === 'dark'));
        } else {
            clearDerivedTokens();
        }
    }, [appearance]);

    // 稿紙版面以 CSS 變數套用到編輯器(style.css、paper.ts 以 var() 取用),變更立即生效
    useEffect(() => { applyPaperLayout(paper); }, [paper]);

    // 標題欄(在 RootBoundary 之外)靠這個模組層狀態取得作品名稱與「目前畫面看不看得到作品外框」與選單動作
    useEffect(() => { setProjectName(tree?.name ?? null); }, [tree]);
    useEffect(() => { setFrameVisible(!!tree && !settings); }, [tree, settings]);
    useEffect(() => {
        setShellActions({settings: settings ? undefined : () => setSettings(true)});
        return () => setShellActions({settings: undefined});
    }, [settings]);

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
            {settings && <SettingsPage tree={tree} setTree={setTree}
                                        appearance={appearance} setAppearance={setAppearance}
                                        paper={paper} setPaper={setPaper}
                                        onClose={closeSettings}/>}
        </TooltipProvider>
    );
}

export default App