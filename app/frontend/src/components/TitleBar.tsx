// 自畫標題欄(SPEC §17.1)。Wails 以 Frameless 執行時沒有原生標題欄,由這裡提供:
// 應用程式選單(左上 logo)、側欄開關、作品名稱、最小化、最大化/還原、關閉,以及視窗拖曳與雙擊最大化。
// 作品畫面時與圖示列同色、不畫底線,連成 L 形外框;logo 欄寬與圖示列同為 60px,上下對齊。
//
// 這個元件掛在 RootBoundary 之外(見 main.tsx),錯誤畫面出現時仍看得到、關得掉視窗。
// Radix 對話框開著時 body 會被設成 pointer-events:none,因此這裡要自己把 pointer-events 拉回來,
// 否則標題欄按鈕會在對話框開著時點不到。
import * as React from 'react';
import {useEffect, useState} from 'react';
import {Copy, Library, Maximize2, Minimize2, Minus, PanelLeftClose, PanelLeftOpen, Save, Settings, Square, X} from 'lucide-react';
import {Quit, WindowIsMaximised, WindowMinimise, WindowToggleMaximise} from '../../wailsjs/runtime/runtime';
import {TITLEBAR_HEIGHT} from '@/lib/layout';
import {getProjectName, getShellActions, isFrameVisible, subscribeShellState} from '@/lib/shellState';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger} from '@/components/ui/overlay';
import {cn} from '@/lib/utils';
import logo from '../assets/images/perkins-logo.svg';

const drag: React.CSSProperties = {'--wails-draggable': 'drag'} as React.CSSProperties;
const noDrag: React.CSSProperties = {'--wails-draggable': 'no-drag'} as React.CSSProperties;

const btn = 'flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

export default function TitleBar() {
    const [project, setProject] = useState<string | null>(getProjectName());
    const [frame, setFrame] = useState(isFrameVisible());
    const [actions, setActions] = useState(getShellActions());
    const [maximised, setMaximised] = useState(false);

    useEffect(() => subscribeShellState(() => {
        setProject(getProjectName());
        setFrame(isFrameVisible());
        setActions(getShellActions());
    }), []);

    // 最大化狀態:進入時問一次,之後靠視窗大小改變更新(Wails 沒有狀態變更事件)
    useEffect(() => {
        let alive = true;
        const sync = () => {
            WindowIsMaximised().then(v => { if (alive) setMaximised(v); }).catch(() => {});
        };
        sync();
        window.addEventListener('resize', sync);
        return () => { alive = false; window.removeEventListener('resize', sync); };
    }, []);

    // 作品相關項目只在作品外框看得到時提供(設定頁開著時不從選單直接跳回書櫃)
    const save = frame ? actions.save : undefined;
    const bookshelf = frame ? actions.bookshelf : undefined;
    const zen = frame ? actions.zen : undefined;
    // 禪模式時圖示列藏起,標題欄不再與它連成 L 形外框,也不提供側欄開關
    const sidebar = frame && !zen?.on ? actions.sidebar : undefined;
    const lFrame = frame && !zen?.on;

    return (
        <header data-testid="titlebar" style={{...drag, height: TITLEBAR_HEIGHT}}
                className={cn('pointer-events-auto relative z-[60] flex shrink-0 select-none items-center bg-rail text-xs', !lFrame && 'border-b')}
                onDoubleClick={() => WindowToggleMaximise()}>
            <div className="flex h-full items-center" style={noDrag} onDoubleClick={e => e.stopPropagation()}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button data-testid="app-menu" title="Perkins WritingSpace 選單" aria-label="Perkins WritingSpace 選單"
                                className="flex h-full w-[60px] items-center justify-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                            <img src={logo} alt="" className="h-5 w-5"/>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="z-[70] min-w-[13rem]" data-testid="app-menu-content">
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Perkins WritingSpace</div>
                        {(save || bookshelf || zen || actions.settings) && <DropdownMenuSeparator/>}
                        {save && (
                            <DropdownMenuItem data-testid="menu-save" onSelect={save}>
                                <Save/>儲存<span className="ml-auto pl-4 text-xs text-muted-foreground">Ctrl+S</span>
                            </DropdownMenuItem>
                        )}
                        {zen && (
                            <DropdownMenuItem data-testid="menu-zen" onSelect={zen.toggle}>
                                {zen.on ? <Minimize2/> : <Maximize2/>}{zen.on ? '離開禪模式' : '禪模式'}
                                <span className="ml-auto pl-4 text-xs text-muted-foreground">Ctrl+Shift+F</span>
                            </DropdownMenuItem>
                        )}
                        {bookshelf && <DropdownMenuItem data-testid="menu-bookshelf" onSelect={bookshelf}><Library/>回到書櫃</DropdownMenuItem>}
                        {actions.settings && <DropdownMenuItem data-testid="menu-settings" onSelect={actions.settings}><Settings/>設定</DropdownMenuItem>}
                    </DropdownMenuContent>
                </DropdownMenu>
                {sidebar && (
                    <button data-testid="titlebar-sidebar" title={sidebar.open ? '收合側欄' : '展開側欄'}
                            aria-label={sidebar.open ? '收合側欄' : '展開側欄'}
                            className="flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            onClick={sidebar.toggle}>
                        {sidebar.open ? <PanelLeftClose className="h-4 w-4"/> : <PanelLeftOpen className="h-4 w-4"/>}
                    </button>
                )}
            </div>
            <span data-testid="titlebar-title" className="ml-2 truncate text-muted-foreground">{project ?? 'Perkins WritingSpace'}</span>
            <div className="ml-auto flex h-full" style={noDrag} onDoubleClick={e => e.stopPropagation()}>
                <button data-testid="win-min" title="最小化" className={btn} onClick={() => WindowMinimise()}>
                    <Minus className="h-4 w-4"/>
                </button>
                <button data-testid="win-max" title={maximised ? '還原' : '最大化'} className={btn}
                        onClick={() => WindowToggleMaximise()}>
                    {maximised ? <Copy className="h-3.5 w-3.5"/> : <Square className="h-3.5 w-3.5"/>}
                </button>
                {/* 關閉走原生路徑:runtime.Quit → OnBeforeClose → 前端流程 → ConfirmQuit,與 Alt+F4 完全相同 */}
                <button data-testid="win-close" title="關閉" className={`${btn} hover:bg-destructive hover:text-destructive-foreground`}
                        onClick={() => Quit()}>
                    <X className="h-4 w-4"/>
                </button>
            </div>
        </header>
    );
}
