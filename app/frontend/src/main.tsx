import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'
import {RootBoundary, requestCrash} from './components/ErrorBoundary'

// 開發模式專用:E2E 用 window.__perkinsCrash 刻意讓某區下一次 render 拋錯;正式建置時 DEV 為 false,此段不會存在
if (import.meta.env.DEV) {
    (window as any).__perkinsCrash = (area: 'chat' | 'inspector' | 'sidebar' | 'root') => requestCrash(area);
}

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <RootBoundary>
            <App/>
        </RootBoundary>
    </React.StrictMode>
)
