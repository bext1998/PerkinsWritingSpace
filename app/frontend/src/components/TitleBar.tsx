// 自畫標題欄(SPEC §17.1)。Wails 以 Frameless 執行時沒有原生標題欄,由這裡提供:
// 應用程式/作品名稱、最小化、最大化/還原、關閉,以及視窗拖曳與雙擊最大化。
//
// 這個元件掛在 RootBoundary 之外(見 main.tsx),錯誤畫面出現時仍看得到、關得掉視窗。
import * as React from 'react';
import {useEffect, useState} from 'react';
import {Copy, Minus, Square, X} from 'lucide-react';
import {Quit, WindowIsMaximised, WindowMinimise, WindowToggleMaximise} from '../../wailsjs/runtime/runtime';
import {getProjectName, onProjectNameChange} from '@/lib/windowTitle';
import logo from '../assets/images/perkins-logo.svg';

const drag: React.CSSProperties = {'--wails-draggable': 'drag'} as React.CSSProperties;
const noDrag: React.CSSProperties = {'--wails-draggable': 'no-drag'} as React.CSSProperties;

const btn = 'flex h-8 w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

export default function TitleBar() {
    const [project, setProject] = useState<string | null>(getProjectName());
    const [maximised, setMaximised] = useState(false);

    useEffect(() => onProjectNameChange(setProject), []);

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

    const title = project ? `${project} — Perkins WritingSpace` : 'Perkins WritingSpace';

    return (
        <header data-testid="titlebar" style={drag}
                className="relative z-[60] flex h-8 shrink-0 select-none items-center border-b bg-rail text-xs"
                onDoubleClick={() => WindowToggleMaximise()}>
            {!project && <img src={logo} alt="Perkins WritingSpace" data-testid="titlebar-logo" className="ml-2 h-5 w-5"/>}
            <span data-testid="titlebar-title" className="ml-2 truncate text-muted-foreground">{title}</span>
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
