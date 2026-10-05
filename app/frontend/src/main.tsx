import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'
import {RootBoundary, requestCrash, setEmergencySaveFail} from './components/ErrorBoundary'
import TitleBar from './components/TitleBar'
import {CLOSE_REQUEST_EVENT, installQuitGuard} from './lib/quitGuard'

// 開發模式專用:E2E 用 window.__perkinsCrash 刻意讓某區下一次 render 拋錯、
// window.__perkinsSaveFail 模擬緊急存檔失敗;正式建置時 DEV 為 false,此段不會存在
if (import.meta.env.DEV) {
    (window as any).__perkinsCrash = (area: 'chat' | 'inspector' | 'sidebar' | 'root') => requestCrash(area);
    (window as any).__perkinsSaveFail = () => setEmergencySaveFail(true);
    // 模擬「收到關閉事件」:走真正的 EventsOn 註冊(不經 Go,否則 wails dev 的視窗也會一起關掉)
    (window as any).__perkinsCloseRequest = () =>
        (window as any).wails.EventsNotify(JSON.stringify({name: CLOSE_REQUEST_EVENT, data: []}));
}

// 關閉保護要在 React 之外安裝:RootBoundary 顯示錯誤畫面時仍必須運作
installQuitGuard();

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        {/* 標題欄在 RootBoundary 之外:任何畫面(含錯誤畫面)都看得到、關得掉視窗 */}
        <div className="flex h-full flex-col">
            <TitleBar/>
            <div className="min-h-0 flex-1">
                <RootBoundary>
                    <App/>
                </RootBoundary>
            </div>
        </div>
    </React.StrictMode>
)
