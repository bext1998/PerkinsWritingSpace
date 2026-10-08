// error-guard — 錯誤防護 E1/E2/E2b/E4/E4a
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'error-guard',
    desc: '錯誤防護 E1/E2/E2b/E4/E4a',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // 錯誤防護(SPEC §16 第 0 項):需在開發模式(wails dev)下執行,__perkinsCrash/__perkinsSaveFail 只存在於 DEV 建置
        if (await page.evaluate(() => typeof window.__perkinsCrash === 'function' && typeof window.__perkinsSaveFail === 'function')) {
            // 情境 1:sidebar/inspector/chat 各自崩潰 → 編輯器寬度不變、仍可輸入,該區顯示錯誤與重試
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('boundaryE1');
            await settle(80, 800); // 等 UI 更新(原固定等 400ms)
            const editorWidth = () => page.$eval('.cm-editor', el => el.getBoundingClientRect().width);
            for (const [area, marker] of [['sidebar', 'E1sb'], ['inspector', 'E1in'], ['chat', 'E1ch']]) {
                // 半螢幕互斥(SPEC §16 第 7 項)可能在前面設定頁的寬度切換中收掉資訊欄,這裡補開;
                // 只在窄寬度(≤960)需要先收側欄,寬視窗直接開。補開後重置 w0 基準(開欄本身會變寬度,不算崩潰的影響)
                if (area === 'inspector' && !(await page.$('[data-testid=inspector]')) && (await page.$('[data-testid=toggle-inspector]'))) {
                    if (await page.$('aside') && await page.evaluate(() => window.innerWidth <= 960)) await page.click('[data-testid=rail-manuscript]');
                    await page.click('[data-testid=toggle-inspector]');
                    await page.waitForSelector('[data-testid=inspector]');
                }
                const w0 = await editorWidth();
                await page.evaluate(a => window.__perkinsCrash(a), area);
                await page.waitForSelector(`[data-testid=area-error-${area}]`, {timeout: 5000});
                const w1 = await editorWidth();
                check(`E1 ${area} 區崩潰後編輯器寬度不變(±3px)`, Math.abs(w1 - w0) < 3, `${w0} → ${w1}`);
                const areaErr = await page.textContent(`[data-testid=area-error-${area}]`);
                check(`E1 ${area} 區顯示錯誤與重試`, areaErr.includes('錯誤') && !!(await page.$(`[data-testid=area-error-${area}] button:has-text("重試")`)));
                await page.click('.cm-content');
                await page.keyboard.press('Control+End');
                await page.keyboard.type(marker);
                await settle(80, 700); // 等 UI 更新(原固定等 300ms)
                check(`E1 ${area} 區崩潰後編輯器仍可輸入`, (await page.textContent('.cm-content')).includes(marker));
                if (area === 'chat') await shot('14-area-error-chat');
                await page.click(`[data-testid=area-error-${area}] button:has-text("重試")`);
                await settle(80, 700); // 等 UI 更新(原固定等 300ms)
                check(`E1 ${area} 區重試後恢復`, !(await page.$(`[data-testid=area-error-${area}]`)));
            }

            // 情境 2:root 崩潰 → 未存的字先緊急存檔,等 data-save-state=saved 再驗證
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('crashSaveE2');
            await settle(80, 800); // 等 UI 更新(原固定等 400ms)
            await page.evaluate(() => window.__perkinsCrash('root'));
            await page.waitForSelector('[data-testid=root-error]', {timeout: 5000});
            await page.waitForSelector('[data-testid=emergency-save][data-save-state=saved]', {timeout: 10000});
            const saveMsg = await page.textContent('[data-testid=emergency-save]');
            check('E2 root 崩潰顯示錯誤畫面', (await page.textContent('[data-testid=root-error]')).includes('介面發生錯誤'));
            check('E2 顯示「未儲存的內容已存檔」', saveMsg.includes('已存檔'), saveMsg);
            check('E2 已存檔後重新載入可用', !(await page.$('[data-testid=reload-app][disabled]')));
            const diskE2 = read(ch1);
            check('E2 未存的字已寫入檔案', diskE2.includes('boundaryE1') && diskE2.includes('E1sb') && diskE2.includes('E1in') && diskE2.includes('E1ch') && diskE2.includes('crashSaveE2'), JSON.stringify(diskE2.slice(-80)));
            await shot('15-root-error');
            await page.click('[data-testid=reload-app]');
            await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            check('E2 重新載入後稿件保留', (await page.textContent('.cm-content')).includes('crashSaveE2'));

            // 情境 2b(review-merge):在途存檔保持 pending 時 root 崩潰 → saving 狀態下原文仍可取回與複製、重載停用;解除後 saved 且磁碟為最新
            // 此分支需有 __perkinsSaveDelay(合併自 PR #5)
            if (await page.evaluate(() => typeof window.__perkinsSaveDelay === 'function')) {
                await page.click('.cm-content');
                await page.keyboard.press('Control+End');
                await page.keyboard.type('pendingSaveText');
                await settle(80, 700); // 等 UI 更新(原固定等 300ms)
                await page.evaluate(() => window.__perkinsSaveDelay(10000)); // 在途存檔保持 pending
                await page.click('[data-testid=save-button]');
                await page.waitForSelector('[data-testid=save-button][disabled]:has-text("儲存中…")');
                await page.evaluate(() => window.__perkinsCrash('root'));
                await page.waitForSelector('[data-testid=emergency-save][data-save-state=saving]', {timeout: 10000});
                const beforePending = read(ch1); // 存檔前磁碟(不含 pendingSaveText)
                check('E2b saving 狀態顯示 rescue textarea 且內容等於最新原文',
                    (await page.inputValue('[data-testid=rescue-text]')) === beforePending + 'pendingSaveText', `len=${(await page.inputValue('[data-testid=rescue-text]')).length}`);
                check('E2b saving 狀態重載停用', !!(await page.$('[data-testid=reload-app][disabled]')));
                // 可複製:點「複製全文」→ 已複製
                await page.click('[data-copy-main]');
                await page.waitForSelector('text=已複製', {timeout: 5000});
                check('E2b saving 狀態可複製原文', true);
                // 解除 → saved 且磁碟為最新文字(沒有較舊寫入再覆蓋)
                await page.evaluate(() => window.__perkinsSaveDelay(0));
                await page.waitForSelector('[data-testid=emergency-save][data-save-state=saved]', {timeout: 15000});
                check('E2b 解除後進 saved 且磁碟含最新文字', read(ch1).includes('pendingSaveText'), JSON.stringify(read(ch1).slice(-40)));
                await page.click('[data-testid=reload-app]');
                await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
                await page.click('[data-testid=chapter-row]:has-text("第一章")');
                await page.waitForSelector('.cm-content');
                check('E2b 重載後稿件保留最新文字', (await page.textContent('.cm-content')).includes('pendingSaveText'));
            } else {
                check('E2b 在途存檔情境', false, 'window.__perkinsSaveDelay 不存在');
            }

            // 情境 4:緊急存檔失敗 → 救援 textarea 顯示未存原文與目標路徑,重新載入按鈕改為「放棄未存內容」
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            const beforeFail = read(ch1);
            await page.keyboard.type('rescueFailText');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            await page.evaluate(() => window.__perkinsSaveFail());
            await page.evaluate(() => window.__perkinsCrash('root'));
            await page.waitForSelector('[data-testid=emergency-save][data-save-state=failed]', {timeout: 10000});
            const failMsg = await page.textContent('[data-testid=emergency-save]');
            check('E4 存檔失敗顯示目標路徑與原因', failMsg.includes('manuscript/第一章.md') && failMsg.includes('存檔失敗'), failMsg);
            const rescueText = await page.inputValue('[data-testid=rescue-text]');
            check('E4 救援 textarea 內容等於未存原文', rescueText === beforeFail + 'rescueFailText', `len=${rescueText.length}`);
            check('E4 救援 textarea 為唯讀', !!(await page.$('[data-testid=rescue-text][readonly]')));
            await page.click('button:has-text("複製全文")');
            await page.waitForSelector('text=已複製', {timeout: 5000});
            check('E4 複製全文顯示完成', true);
            const clip = await page.evaluate(() => navigator.clipboard.readText());
            // Windows 系統剪貼簿會把換行正規化成 CRLF(實測 9 個 \n → \r\n),比對前先還原
            const clipNorm = clip.replace(/\r\n/g, '\n');
            check('E4 剪貼簿內容等於未存原文', clipNorm === rescueText, `clipLen=${clip.length} rescueLen=${rescueText.length}`);
            const relTxt = await page.textContent('[data-testid=reload-app]');
            check('E4 存檔失敗時放棄按鈕為次要樣式', relTxt.includes('放棄未存內容'), relTxt);
            check('E4 複製全文為主要按鈕(default)', await page.$eval('button:has-text("複製全文")', el => el.classList.contains('bg-primary')));
            check('E4 放棄按鈕為次要樣式(ghost+destructive 色)', await page.$eval('[data-testid=reload-app]', el => el.classList.contains('text-destructive') && !el.classList.contains('bg-primary')));
            await shot('16-rescue');

            // 受控剪貼簿:覆寫 writeText 為可控制的 Promise(替身:記錄呼叫次數與捕捉到的文字,不寫真剪貼簿);
            // 釋放時才以原始 writeText 寫入真剪貼簿
            await page.evaluate(() => {
                const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
                window.__clipStubs = {calls: 0, texts: [], gate: null, orig};
                navigator.clipboard.writeText = t => {
                    const s = window.__clipStubs;
                    s.calls++;
                    s.texts.push(t);
                    return new Promise(res => { s.gate = res; });
                };
                window.__clipRelease = () => { const s = window.__clipStubs; const r = s.gate; s.gate = null; if (r) { s.calls--; return s.orig(s.texts[0]).then(r); } };
            });
            // 進入確認段後才複製:確認段的「確定放棄並重新載入」也應停用
            await page.click('[data-testid=reload-app]');
            await page.waitForSelector('[data-testid=confirm-abandon]');
            await page.click('button:has-text("複製全文")');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            check('E4a 複製進行中確認段停用', !!(await page.$('[data-testid=confirm-abandon][disabled]')));
            // 確認段的確認按鈕在複製中停用,handler 也擋;點擊(含繞過 disabled)不得重載
            await page.evaluate(() => document.querySelector('[data-testid=confirm-abandon]').click());
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            check('E4a 複製進行中確認按鈕點擊不重載', !!(await page.$('[data-testid=root-error]')));
            check('E4a 複製進行中複製按鈕停用', !!(await page.$('button:has-text("複製全文")[disabled]')));
            // 連按複製:防重入 — 兩層驗證:
            // (1) handler 層:繞過 disabled 的 click 事件仍被 copying() 擋住(無防重入時 writeText 會被呼叫第二次)
            await page.evaluate(() => { document.querySelector('button[data-copy-main]').disabled = false; });
            await page.click('button[data-copy-main]').catch(() => {}); // 軟等待保留:預期可能被擋(防重入測試的探針點擊),由 writeText 計數斷言把關
            await page.evaluate(() => { document.querySelector('button[data-copy-main]').disabled = false; });
            await page.evaluate(() => { document.querySelector('button[data-copy-main]').dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true})); });
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const calls = await page.evaluate(() => window.__clipStubs.calls);
            const copyCalls = await page.evaluate(() => window.__perkinsCopyCalls ?? 0);
            check('E4a 複製防重入:handler 層(繞過 disabled 的點擊也被擋)', calls === 1, `writeText=${calls} handlerCalls=${copyCalls}`);
            // (2) 方法層:直接呼叫 copyAll 兩次(DEV 鉤),防重入存在時 stub 只收一筆
            const stubCalls2 = await page.evaluate(() => { window.__perkinsBoundary.copyAll(); window.__perkinsBoundary.copyAll(); return window.__clipStubs.calls; });
            check('E4a 複製防重入:直接呼叫 copyAll 兩次,writeText 仍只一筆', stubCalls2 === 1, `calls=${stubCalls2}`);
            // 等待未解除時放棄按鈕(兩段)皆不可用
            check('E4a 等待中第一段放棄不可用', !(await page.$('[data-testid=reload-app]')));
            check('E4a 等待中確認段停用', !!(await page.$('[data-testid=confirm-abandon][disabled]')));
            // 釋放 → 以原始 writeText 寫入真剪貼簿並解開等待
            await page.evaluate(() => window.__clipRelease());
            await page.waitForSelector('text=已複製', {timeout: 5000});
            // 受控內容比對:用替身捕捉到的文字
            const stubText = await page.evaluate(() => window.__clipStubs.texts[0]);
            check('E4a 受控複製內容等於未存原文(替身捕捉)', stubText.replace(/\r\n/g, '\n') === rescueText, `len=${stubText.length}`);
            // 釋放後放棄恢復可用
            await page.click('[data-testid=cancel-abandon]');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            check('E4a 釋放後放棄按鈕恢復可用', !(await page.$('[data-testid=reload-app][disabled]')));
            await page.click('[data-testid=reload-app]');
            await page.waitForSelector('[data-testid=confirm-abandon]');
            await page.click('[data-testid=cancel-abandon]');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            // 回到正常兩段式放棄測試
            await page.click('[data-testid=reload-app]');
            await page.waitForSelector('[data-testid=confirm-abandon]', {timeout: 5000});
            check('E4 第一次點擊放棄只顯示確認,頁面未重載', !!(await page.$('[data-testid=root-error]')) && !!(await page.$('[data-testid=confirm-abandon]')));
            await page.click('[data-testid=cancel-abandon]');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            check('E4 取消後回到救援畫面', !!(await page.$('[data-testid=reload-app]')) && !(await page.$('[data-testid=confirm-abandon]')));
            await page.click('[data-testid=reload-app]');
            await page.click('[data-testid=confirm-abandon]');
            await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            check('E4 放棄重載後檔案與編輯器皆無未存字', !read(ch1).includes('rescueFailText') && !(await page.textContent('.cm-content')).includes('rescueFailText'));
        } else {
            check('E1 開發模式拋錯點存在', false, 'window.__perkinsCrash / __perkinsSaveFail 不存在(需以 wails dev 開發模式執行)');
        }
    },
};
