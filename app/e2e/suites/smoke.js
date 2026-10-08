// 冒煙組 — 約 2 分鐘的關鍵路徑:開檔、打字存檔、提案預覽不外流、關閉保護主流程、標題欄/禪模式基本進出、搜尋開關。
// 不列入 --all(--all 由各功能組組成)。
// 所有寫入都在專用「冒煙章」:fixture 可能被前輪測試改過,冒煙組不得依賴原始內容,
// 也要可重複執行(斷言只用自帶標記字)。冒煙章以 fs 建立後,靠「弄髒→存檔→refreshTree」讓側欄出現
// (wails dev 的檔案監看器會在 fs 寫入時重啟後端,不能用 UI 建章觸發)。
module.exports = {
    name: '__smoke',
    desc: '冒煙組:開檔/存檔/提案預覽不外流/關閉保護/標題欄禪模式/搜尋',
    run: async ctx => {
        const {page, check, shot, read, P, ch1} = ctx;
        const fs = require('fs');
        const path = require('path');
        const smoke = 'smokeMark';
        const smokeChapter = 'manuscript/冒煙章.md';
        const smokeFile = () => { try { return fs.readFileSync(P(smokeChapter), 'utf8'); } catch { return ''; } };

        // 冒煙章:fs 建立(內含場景供側欄顯示),靠第一章的存檔觸發 refreshTree 後開啟
        fs.mkdirSync(path.dirname(P(smokeChapter)), {recursive: true});
        fs.writeFileSync(P(smokeChapter), '# 冒煙章\n\n## 冒煙場景\n\n' + smoke + '\n');
        await ctx.ensureProject('第一章', 'manuscript');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' ');
        await page.keyboard.press('Backspace'); // 內容不變但變髒,讓存檔迴圈啟動 refreshTree
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=chapter-row]:has-text("冒煙章")', {timeout: 15000});
        await page.click('[data-testid=chapter-row]:has-text("冒煙章")');
        await page.waitForSelector('.cm-content:has-text("冒煙章")', {timeout: 15000});
        check('冒煙 標題欄顯示作品名', (await page.textContent('[data-testid=titlebar-title]')).trim() === 'E2E測試');
        check('冒煙 開檔:編輯器顯示冒煙章', (await page.textContent('.cm-content')).includes(smoke));

        // 禪模式基本進出(由選單進入,退出後圖示列回來)
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        await page.click('[data-testid=menu-zen]');
        await page.waitForSelector('[data-testid=zen-exit]');
        check('冒煙 禪模式進入(圖示列隱藏)', !(await page.isVisible('[data-testid=rail]')));
        await page.keyboard.press('Control+Shift+F');
        await page.waitForSelector('[data-testid=rail]:visible', {timeout: 3000}).catch(() => {});
        check('冒煙 禪模式離開(圖示列恢復)', await page.isVisible('[data-testid=rail]'));

        // 搜尋開關:Ctrl+F 開面板、Escape 關閉
        await page.click('.cm-content');
        await page.keyboard.press('Control+f');
        await page.waitForSelector('.perkins-search', {timeout: 5000});
        check('冒煙 搜尋面板開啟', !!(await page.$('.perkins-search')));
        await page.keyboard.press('Escape');
        // 搜尋面板該關閉:等不到就讓此組 FAIL(不再用空 catch 吞掉)
        await page.waitForSelector('.perkins-search', {state: 'detached', timeout: 5000});

        // 打字存檔:打初始內容沒有的新標記(第 19 行只寫入 smokeMark),
        // 斷言磁碟完整內容等於編輯器內容 — 只查 includes 會被初始寫入假通過
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type(smoke + 'Saved2');
        await page.waitForSelector('[data-testid=statusbar] >> text=未儲存');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")', {timeout: 10000});
        const editorAfterSave = await page.evaluate(() =>
            [...document.querySelectorAll('.cm-content .cm-line')].map(e => e.textContent).join('\n'));
        check('冒煙 打字後存檔落盤(磁碟完整內容等於編輯器)',
            smokeFile() === editorAfterSave && smokeFile().includes(smoke + 'Saved2'),
            `len=${smokeFile().length}/${editorAfterSave.length}`);

        // 提案預覽不外流:移除「目前文件」標籤後,預覽不含私人筆記內文
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        await page.fill('[data-testid=question]', '冒煙測試');
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        const pv = await page.textContent('[data-testid=preview-direct]');
        check('冒煙 提案預覽不外流(不含私人筆記)', !pv.includes('反派是雷恩的哥哥'));
        await page.keyboard.press('Escape');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // 關閉保護主流程:未存標記 → root 崩潰 → 緊急存檔 → 重載後保留
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type(smoke + 'Crash');
        if (await page.evaluate(() => typeof window.__perkinsCrash === 'function')) {
            await page.evaluate(() => window.__perkinsCrash('root'));
            await page.waitForSelector('[data-testid=root-error]', {timeout: 5000});
            await page.waitForSelector('[data-testid=emergency-save][data-save-state=saved]', {timeout: 10000});
            await page.click('[data-testid=reload-app]');
            await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
            check('冒煙 關閉保護:崩潰後未存字已存檔且重載保留', smokeFile().includes(smoke + 'Crash'));
            await ctx.ensureProject('冒煙章' === '' ? null : '第一章', 'manuscript');
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
        } else {
            check('冒煙 關閉保護:開發模式崩潰點存在', false, 'window.__perkinsCrash 不存在(需 wails dev)');
        }
        await shot('00-smoke');
    },
};
