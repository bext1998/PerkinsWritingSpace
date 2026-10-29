import path from 'path'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {'@': path.resolve(import.meta.dirname, './src')},
  },
  build: {
    // Vite 8 預設目標是 baseline-widely-available(chrome111/edge111/firefox114/safari16.4),
    // 產物會留 ES2021 語法:class static block(Chromium 94)與 logical assignment
    // ??=、&&=、||=(Chromium 85)。舊 WebView2 解析失敗會開出白視窗(#191 升級審查發現)。
    // 這裡明寫目標,維持升級前的語法底線(不代表最低可用的 WebView2:相依套件另用到 Array.prototype.at 等 Chromium 92+ 的 API),
    // es2020 是語言目標(升級前 Vite 5 的 modules 目標即 es2020 + chrome87 的組合),
    // 單用 chrome87 不會降掉 logical assignment,所以兩個都要列。
    target: ['chrome87', 'es2020'],
  },
})
