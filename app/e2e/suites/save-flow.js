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

        // ---- 定時自動存檔(#36,SPEC §17.3) ----
        // E2E 預設關掉自動存檔(lib.launch 的 init script,理由見該處註解),這一節明確打開來驗。
        // 開發模式的間隔掛鉤讓 30 秒上限不必真的等 30 秒;本節結束時把掛鉤與設定還原。
        if (!(await page.evaluate(() => typeof window.__perkinsAutosaveTiming === 'function'))) {
            check('#36 自動存檔開發模式間隔掛鉤存在', false, 'window.__perkinsAutosaveTiming 不存在(需以 wails dev 開發模式執行)');
        } else {
            const ch2 = 'manuscript/第二章.md';
            const ch3 = 'manuscript/第三章.md';
            const autoTiming = (idle, max) => page.evaluate(([i, m]) => window.__perkinsAutosaveTiming(i, m), [idle, max]);
            const savedState = () => page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 10000}).then(() => true).catch(() => false);
            const typeAtEnd = async text => {
                await page.click('.cm-content');
                await page.keyboard.press('Control+End');
                await page.keyboard.type(text);
            };
            // 手動存檔的提示框(3.5 秒)是上一段留下的,等它消失才不會誤判自動存檔跳了提示
            const waitNoToast = () => page.waitForFunction(() => !document.querySelector('[data-testid=toast]'), null, {timeout: 8000});
            // 設定頁的「自動存檔」開關:設成指定狀態(不假設目前是哪一邊),後端寫入完成才返回
            const toggleAutosave = async want => {
                await page.click('[data-testid=open-settings]');
                await page.waitForSelector('[data-testid=settings-page]');
                await page.click('[data-testid=tab-project]');
                await page.waitForSelector('[data-testid=autosave-switch]');
                if (await page.getAttribute('[data-testid=autosave-switch]', 'aria-checked') !== want) {
                    await page.click('[data-testid=autosave-switch]');
                }
                await page.waitForFunction(w => document.querySelector('[data-testid=autosave-switch]')?.getAttribute('aria-checked') === w, want, {timeout: 5000});
                await page.click('[data-testid=close-settings]');
                await page.waitForSelector('[data-testid=settings-page]', {state: 'detached'});
                // Workspace 在設定頁關閉時才重讀設定;等 UI 靜下來再打字,不然設定還沒真的生效
                await settle(80, 700);
            };

            // 前提:自動存檔是開的(settings.json 的預設值);之前的手動測試若把它關掉也要拉回來
            await toggleAutosave('true');
            // (a) 停止輸入約 2 秒後存檔;成功只更新工具列/狀態列,不跳「已儲存」提示框
            await autoTiming(2000, 30000);
            await ensureProject('第二章', 'manuscript');
            await waitNoToast();
            await typeAtEnd('autoIdleMark');
            const idleT0 = Date.now();
            await page.waitForTimeout(800); // 遠小於 2 秒
            check('自動存檔 (a) 停止輸入不到 2 秒時尚未寫入磁碟(不是立即存)', !read(ch2).includes('autoIdleMark'));
            const idleSaved = await savedState();
            const idleMs = Date.now() - idleT0;
            check('自動存檔 (a) 未按存檔,磁碟已自動寫入新字', idleSaved && read(ch2).includes('autoIdleMark'), JSON.stringify(read(ch2).slice(-40)));
            check('自動存檔 (a) 工具列與狀態列顯示已儲存', (await page.textContent('footer')).includes('已儲存'));
            check('自動存檔 (a) 停止輸入後約 2 秒才存', idleSaved && idleMs >= 1500 && idleMs <= 6000, `${idleMs}ms`);
            check('自動存檔 (a) 不跳「已儲存」提示框', !(await page.$('[data-testid=toast]')));
            await shot('16-autosave-idle');

            // (b) 持續打字不停:距第一個未存變更最多 30 秒也存一次。
            // 開發模式縮成 idle 20 秒 / 上限 0.8 秒:每次輸入間隔遠小於 idle,只有上限能觸發,
            // 不必真的等 30 秒;驗證時距也在 20 秒內,證明存檔不是「停止輸入」觸發的
            await autoTiming(20000, 800);
            const capT0 = Date.now();
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            for (let i = 0; i < 12; i++) {
                await page.keyboard.type(`capMark${i}`);
                await page.waitForTimeout(150);
            }
            let capElapsed = -1;
            for (let i = 0; i < 20; i++) {
                if (read(ch2).includes('capMark0')) { capElapsed = Date.now() - capT0; break; }
                await page.waitForTimeout(150);
            }
            check('自動存檔 (b) 持續打字不停時仍會存檔(上限觸發,非停止輸入)', capElapsed >= 0 && capElapsed < 20000, `elapsed=${capElapsed}ms(idle 20000ms)`);
            // 手動存完讓 (c) 從已儲存開始(idle 還是 20 秒,不能用等待)
            await page.click('.cm-content');
            await page.keyboard.press('Control+s');
            await savedState();
            await autoTiming(2000, 30000);

            // (c) IME 組字中不存:合成 compositionstart(無頭環境無真實 IME,與 #46 既有做法相同),
            // 組字中打字超過 2 秒仍不存,compositionend 後才存
            const imeBefore = read(ch2);
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.evaluate(() => {
                document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: ''}));
            });
            await page.keyboard.type('imeMark');
            await page.waitForTimeout(2600);
            check('自動存檔 (c) 組字中不存檔', read(ch2) === imeBefore && !read(ch2).includes('imeMark'));
            check('自動存檔 (c) 組字中維持未儲存', (await page.textContent('footer')).includes('未儲存'));
            await page.evaluate(() => {
                document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: 'imeMark'}));
            });
            const imeSaved = await savedState();
            check('自動存檔 (c) 組字結束後會存檔', imeSaved && read(ch2).includes('imeMark'), JSON.stringify(read(ch2).slice(-40)));

            // (d) 打字後 2 秒內切到另一章:舊章的字存進舊章檔案,新章不被寫入舊章內容
            await ensureProject('第二章', 'manuscript');
            const ch3Before = read(ch3);
            await typeAtEnd('switchMark');
            await page.click('[data-testid=chapter-row]:has-text("第三章")');
            await page.waitForFunction(() => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('第三章'), null, {timeout: 15000});
            // 等超過自動存檔的 2 秒:計時器沒有隨切檔清掉的話,這段時間就會把舊章的文字寫到新章
            await page.waitForTimeout(2600);
            check('自動存檔 (d) 切章後舊章的字存進舊章檔案', read(ch2).includes('switchMark'), JSON.stringify(read(ch2).slice(-40)));
            check('自動存檔 (d) 新章沒有被寫入舊章內容', read(ch3) === ch3Before && !read(ch3).includes('switchMark'));

            // (e) 設定頁關掉「自動存檔」:關掉後打字不會自動存,手動 Ctrl+S 照舊(含提示框)
            await toggleAutosave('false');
            await waitNoToast();
            const offBefore = read(ch3);
            await typeAtEnd('autoOffMark');
            await page.waitForTimeout(2600); // 超過 2 秒
            check('自動存檔 (e) 設定關閉後打字不會自動存檔', read(ch3) === offBefore && !read(ch3).includes('autoOffMark'));
            check('自動存檔 (e) 設定關閉後維持未儲存', (await page.textContent('footer')).includes('未儲存'));
            await page.keyboard.press('Control+s');
            const offSaved = await savedState();
            check('自動存檔 (e) 手動 Ctrl+S 仍可存檔', offSaved && read(ch3).includes('autoOffMark'), JSON.stringify(read(ch3).slice(-40)));
            // 提示框在存檔 Promise 解析後才跳,等到它出現再看(前面已確認畫面上沒有舊的提示)
            const manualToast = await page.waitForSelector('[data-testid=toast]', {timeout: 5000}).then(() => true).catch(() => false);
            check('自動存檔 (e) 手動存檔仍跳「已儲存」提示框', manualToast);
            await toggleAutosave('true'); // 測完還原設定
            // 後續測試組回到預設(自動存檔關):本節已在 (b)(c) 手動存完,沒有待存內容
            await page.evaluate(() => window.__perkinsAutosaveOff());
        }
    },
};
