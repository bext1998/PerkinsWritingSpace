// save-flow — 存檔按鈕 E3、序列化存檔 E5、重開同章 E6、過期導覽 E7
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'save-flow',
    desc: '存檔按鈕 E3、序列化存檔 E5、重開同章 E6、過期導覽 E7',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第二章', 'manuscript');
        // 存檔按鈕(SPEC §16 第 5 項):開一章、打字、點按鈕存檔
        await page.click('[data-testid=chapter-row]:has-text("第二章")');
        await page.waitForSelector('.cm-content');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('saveBtnTest');
        // 以按鈕進入「儲存」狀態為完成訊號,不用固定等待
        await page.waitForFunction(() => document.querySelector('[data-testid=save-button]')?.textContent?.trim() === '儲存', null, {timeout: 5000});
        const btn = await page.textContent('[data-testid=save-button]');
        check('E3 未儲存時按鈕顯示「儲存」且可按', btn.trim() === '儲存' && !(await page.$('[data-testid=save-button][disabled]')), btn.trim());
        check('E3 點擊前磁碟尚未寫入標記字', !read('manuscript/第二章.md').includes('saveBtnTest'));
        await shot('13-save-button-dirty');
        await page.click('[data-testid=save-button]');
        // 等按鈕明確進入「已儲存」且停用,再驗證磁碟
        await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 10000});
        const diskE3 = read('manuscript/第二章.md');
        check('E3 點按鈕後檔案已寫入新字', diskE3.includes('saveBtnTest'), JSON.stringify(diskE3.slice(-40)));
        const btn2 = await page.textContent('[data-testid=save-button]');
        check('E3 存檔後按鈕變為「已儲存」且停用', btn2.includes('已儲存') && !!(await page.$('[data-testid=save-button][disabled]')), btn2.trim());
        await shot('14-save-button');

        // 情境 5(回歸):序列化存檔迴圈 — 存檔途中輸入並重複觸發,全部文字最終落盤,SaveFile 不並行
        // 需在開發模式(wails dev)下執行,__perkinsSaveDelay/__perkinsSaveStats 只存在於 DEV 建置
        if (await page.evaluate(() => typeof window.__perkinsSaveDelay === 'function' && typeof window.__perkinsSaveStats === 'object')) {
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('delayA');
            await page.waitForFunction(() => document.querySelector('[data-testid=save-button]')?.textContent?.trim() === '儲存', null, {timeout: 5000});
            await page.evaluate(() => window.__perkinsSaveDelay(500));
            await page.click('[data-testid=save-button]');
            await page.waitForSelector('[data-testid=save-button][disabled]:has-text("儲存中…")', {timeout: 5000});
            // 存檔途中輸入 B,並連按 Ctrl+S 兩次以上(重複觸發應等同一個序列化 Promise)
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('delayB');
            await page.keyboard.press('Control+s');
            await page.keyboard.press('Control+s');
            await page.keyboard.press('Control+s');
            // 迴圈會把新版本也存完,等按鈕進入「已儲存」停用
            await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 15000});
            const diskE5a = read('manuscript/第一章.md');
            check('E5 存檔途中輸入並連按 Ctrl+S 後磁碟含全部文字', diskE5a.includes('delayA') && diskE5a.includes('delayB'), JSON.stringify(diskE5a.slice(-50)));
            check('E5 最終按鈕為「已儲存」', true);
            const stats = await page.evaluate(() => ({...window.__perkinsSaveStats}));
            check('E5 SaveFile 最大並行數為 1', stats.maxInFlight === 1, JSON.stringify(stats));
            check('E5 最終狀態列顯示已儲存', (await page.textContent('footer')).includes('已儲存'));
            await page.evaluate(() => window.__perkinsSaveDelay(0)); // 解除延遲

            // 存檔延遲中點另一章:切換前在原章輸入的字最後都在原章檔案,目標章不混入
            await page.keyboard.type('cutLateWord');
            await page.waitForFunction(() => document.querySelector('[data-testid=save-button]')?.textContent?.trim() === '儲存', null, {timeout: 5000});
            const ch2Before = read('manuscript/第二章.md');
            await page.evaluate(() => window.__perkinsSaveDelay(1200));
            await page.click('[data-testid=save-button]');
            await page.waitForSelector('[data-testid=save-button][disabled]:has-text("儲存中…")', {timeout: 5000});
            await page.click('.cm-content'); // 回編輯器,在存檔途中再補一個字
            await page.keyboard.press('Control+End');
            await page.keyboard.type('X');
            await page.click('[data-testid=chapter-row]:has-text("第二章")'); // openFile 等存檔迴圈結束才切換
            await page.waitForSelector('.cm-line:has-text("天亮了")', {timeout: 15000});
            await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 15000});
            const ch1After = read('manuscript/第一章.md');
            check('E5 切章前原章輸入的字都在原章檔案', ch1After.includes('delayA') && ch1After.includes('delayB') && ch1After.includes('cutLateWordX'), JSON.stringify(ch1After.slice(-60)));
            check('E5 目標章未混入原章文字', read('manuscript/第二章.md') === ch2Before);
            check('E5 切章後 SaveFile 最大並行數仍為 1', (await page.evaluate(() => window.__perkinsSaveStats.maxInFlight)) === 1);
            await page.evaluate(() => window.__perkinsSaveDelay(0));
        } else {
            check('E5 開發模式延遲掛鉤存在', false, 'window.__perkinsSaveDelay / __perkinsSaveStats 不存在(需以 wails dev 開發模式執行)');
        }

        // 情境 6(回歸):重開目前章(章節列/場景列)不會把未存的字替換回舊稿
        // 當前在第二章(上一段切過來);開第一章、打字(不存)、再點同一章的章節列與場景列
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('reopenNewText');
        // 點同一章的章節列 → 編輯器內容應保留
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        check('E6 點同章章節列後新字仍在編輯器', (await page.textContent('.cm-content')).includes('reopenNewText'));
        check('E6 點同章章節列未存檔(磁碟無新字)', !read(ch1).includes('reopenNewText'));
        // 展開場景列並點「森林」場景 → 同檔案 openFile,只定位不重讀
        await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('aside li:has-text("森林")');
        const editorBefore = await page.textContent('.cm-content'); // 點場景前存下完整文字
        await page.click('aside li:has-text("森林")');
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        check('E6 點場景列後新字仍在編輯器', (await page.textContent('.cm-content')).includes('reopenNewText'));
        check('E6 場景列點擊後編輯器內容逐字不變', (await page.textContent('.cm-content')) === editorBefore);
        check('E6 場景列點擊後仍為未儲存', (await page.textContent('footer')).includes('未儲存'));
        // 存檔後磁碟保有新字
        await page.click('[data-testid=save-button]');
        await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 10000});
        check('E6 存檔後磁碟保有新字', read(ch1).includes('reopenNewText'), JSON.stringify(read(ch1).slice(-40)));

        // 情境 7(回歸):重疊導覽 — 過期導覽不得套用讀檔結果
        if (await page.evaluate(() => typeof window.__perkinsReadDelay === 'function')) {
            // 場景定位後側欄可能仍開著;先確保側欄開啟(章節列可見)
            if (!(await page.$('[data-testid=chapter-row]:has-text("第一章")'))) await page.click('[data-testid=rail-manuscript]');
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');
            await page.evaluate(() => window.__perkinsReadDelay(400));
            await page.click('[data-testid=chapter-row]:has-text("第二章")');
            await settle(80, 450); // 等 UI 更新(原固定等 50ms)
            await page.click('[data-testid=chapter-row]:has-text("第三章")');
            await page.waitForSelector('.cm-line:has-text("風停了")', {timeout: 10000});
            await page.waitForTimeout(1000); // 讓過期導覽回來
            check('E7 A→B→C 快速切換最後停在 C', (await page.textContent('.cm-content')).includes('風停了'));
            // 第二段:B 進入在途後輸入新字,再點第三章觸發過期導覽,新字不得被舊稿蓋掉
            await page.click('[data-testid=chapter-row]:has-text("第二章")');
            await page.waitForSelector('.cm-line:has-text("天亮了")');
            await page.evaluate(() => window.__perkinsReadDelay(2500));
            // 點第一章(讀 A 在途,2.5s);期間補點第二章的請求已過期;等第一章讀回後打字
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            // 修正做法:點第二章(在途)→ 回第一章(第一章過期第二章變最新)→ 在途的第二章回來不得套用
            await page.click('[data-testid=chapter-row]:has-text("第二章")');
            await settle(80, 500); // 等 UI 更新(原固定等 100ms)
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")', {timeout: 10000});
            // 等待期間打字(不存);第二章的在途導覽回來不得覆蓋第一章的內容
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('staleGuard');
            await page.waitForTimeout(3000); // 第二章的在途導覽(2.5s)回來
            check('E7 過期導覽回來後編輯器仍是第一章', (await page.textContent('.cm-content')).includes('艾莉絲走進森林'));
            check('E7 過期導覽未套用,新字仍在', (await page.textContent('.cm-content')).includes('staleGuard'));
            check('E7 仍為未儲存', (await page.textContent('footer')).includes('未儲存'));
            // 存檔後磁碟不丟字
            await page.click('[data-testid=save-button]');
            await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 10000});
            check('E7 存檔後磁碟不丟字', read(ch1).includes('staleGuard'), JSON.stringify(read(ch1).slice(-40)));
            await page.evaluate(() => window.__perkinsReadDelay(0));
        } else {
            check('E7 開發模式讀檔延遲掛鉤存在', false, 'window.__perkinsReadDelay 不存在(需以 wails dev 開發模式執行)');
        }
    },
};
