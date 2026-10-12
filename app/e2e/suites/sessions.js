// sessions — 對話記錄(#33):保存、清單、接續、封存、刪除、還原、永久刪除、640 寬清單
// 不呼叫模型:以 __perkinsChatInject 注入一個回合,再以綁定 SaveSession 保存。
// 副作用:%USERPROFILE%\.perkins\sessions\<fixture 作品的鍵>\ 會被建立;開跑與結束都只清這個鍵,不碰其他作品的記錄。
module.exports = {
    name: 'sessions',
    desc: '對話記錄(#33):保存、清單、接續、封存、刪除、還原、永久刪除、640 寬清單',
    run: async ctx => {
        const {page, check, shot, PROJ, ensureProject, settle} = ctx;
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');
        const os = require('os');

        // 作品鍵與 Go 的 sessions.Key 一致:絕對路徑(正斜線、小寫)的 SHA-256 前 32 位 hex
        const sessDir = path.join(os.homedir(), '.perkins', 'sessions',
            crypto.createHash('sha256').update(path.resolve(PROJ).replace(/\\/g, '/').toLowerCase()).digest('hex').slice(0, 32));
        const clean = () => { if (fs.existsSync(sessDir)) fs.rmSync(sessDir, {recursive: true, force: true}); };
        const files = () => fs.existsSync(sessDir)
            ? fs.readdirSync(sessDir).filter(f => f.endsWith('.json')).length
            : 0;
        clean(); // 前輪殘留先清掉,避免污染本輪的清單
        const inspLabel = () => page.getAttribute('[data-testid=toggle-inspector]', 'aria-label').catch(() => null);
        const TURNS = [
            {role: 'user', text: 'E2E 對話記錄測試:第一個問題'},
            {role: 'assistant', text: '這是注入的回覆內容。'},
        ];

        try {
            await ensureProject('第一章', 'manuscript');
            // 資訊欄開合狀態:640 寬會自動收資訊欄(§17.1 互斥),視窗變寬後不自動重開,結束前要補回來
            const inspWasOpen = await inspLabel() === '收合資訊欄';
            if (!(await page.isVisible('[data-testid=chat-window]'))) await page.click('[data-testid=chat-fab]');
            await page.waitForSelector('[data-testid=chat-window]:visible');

            // 產生一個回合後存檔(注入,不呼叫模型)
            await page.evaluate(t => window.__perkinsChatInject(t), TURNS);
            await page.evaluate(t => window.go.main.App.SaveSession(t), TURNS);
            check('回合後存檔寫入磁碟', files() === 1, `${sessDir} 內 ${files()} 份`);

            // 清單:標題(第一個問題)、更新時間、回合數、目前會話標示
            await page.click('[data-testid=sessions-btn]');
            await page.waitForSelector('[data-testid=sessions-dialog]');
            await page.waitForSelector('[data-testid=session-row]');
            await settle(250, 2500); // 等對話框開啟動畫結束再看版面/截圖(動畫期間 transform 蓋掉置中位移)
            const rowText = await page.textContent('[data-testid=session-row]');
            check('清單顯示標題(第一個問題)', rowText.includes('E2E 對話記錄測試:第一個問題'), rowText.slice(0, 60));
            check('清單顯示回合數', rowText.includes('1 回合'));
            check('目前會話在清單中標示', !!(await page.$('[data-testid=session-current]')));
            await shot('sessions-list-1280');

            // 新對話 → 從清單接續看到舊 turns
            await page.keyboard.press('Escape');
            await page.click('[data-testid=chat-window] button:has(svg.lucide-square-pen)');
            check('新對話清空對話', (await page.$$('[data-testid=assistant-turn]')).length === 0);
            await page.click('[data-testid=sessions-btn]');
            await page.waitForSelector('[data-testid=session-row]');
            await page.click('[data-testid=session-resume]');
            await page.waitForSelector('[data-testid=sessions-dialog]', {state: 'detached'});
            await settle(150, 2000);
            const shown = await page.textContent('[data-testid=turns]');
            check('接續後看到舊 turns', shown.includes('這是注入的回覆內容。') && shown.includes('E2E 對話記錄測試:第一個問題'));
            check('接續不另存一份', files() === 1, `${files()} 份`);

            // 封存 / 取消封存
            await page.click('[data-testid=sessions-btn]');
            await page.waitForSelector('[data-testid=session-row]');
            await page.click('[data-testid=session-archive]');
            await page.click('[data-testid=session-tab-archived]');
            await page.waitForSelector('[data-testid=session-row]');
            check('封存後在「封存」分頁', (await page.textContent('[data-testid=session-row]')).includes('E2E 對話記錄測試'));
            await page.click('[data-testid=session-archive]'); // 取消封存
            await page.click('[data-testid=session-tab-active]');
            await page.waitForSelector('[data-testid=session-row]');
            check('取消封存後回到「最近」', !!(await page.$('[data-testid=session-row]')));

            // 刪除 → 還原
            await page.click('[data-testid=session-delete]');
            await page.click('[data-testid=session-tab-deleted]');
            await page.waitForSelector('[data-testid=session-row]');
            check('刪除後在「已刪除」分頁(回收區)', (await page.textContent('[data-testid=session-row]')).includes('E2E 對話記錄測試'));
            // 刪的是目前會話:畫面要清空,否則之後接續別份時會把被刪的對話當新會話重存回「最近」
            check('刪除目前會話後對話清空', (await page.$$('[data-testid=assistant-turn]')).length === 0);
            await page.click('[data-testid=session-restore]');
            await page.click('[data-testid=session-tab-active]');
            await page.waitForSelector('[data-testid=session-row]');
            check('還原後回到「最近」', !!(await page.$('[data-testid=session-row]')));

            // 永久刪除:先確認才能刪
            await page.click('[data-testid=session-delete]');
            await page.click('[data-testid=session-tab-deleted]');
            await page.waitForSelector('[data-testid=session-row]');
            await page.click('[data-testid=session-purge]');
            check('永久刪除前要作者確認', !!(await page.$('[data-testid=session-purge-confirm]')));
            await page.click('[data-testid=session-purge-cancel]');
            check('取消確認後仍在清單', !!(await page.$('[data-testid=session-row]')));
            await page.click('[data-testid=session-purge]');
            await page.click('[data-testid=session-purge-confirm]');
            await page.waitForSelector('[data-testid=session-row]', {state: 'detached', timeout: 5000});
            check('永久刪除後清單為空', (await page.$$('[data-testid=session-row]')).length === 0);
            check('永久刪除後磁碟無殘留', files() === 0, `${files()} 份`);

            // 640 寬:清單在視窗內、無水平捲軸(另存一筆讓截圖有內容)
            await page.keyboard.press('Escape');
            await page.evaluate(t => window.__perkinsChatInject(t), TURNS);
            await page.evaluate(t => window.go.main.App.SaveSession(t), TURNS);
            await page.setViewportSize({width: 640, height: 672});
            await page.click('[data-testid=sessions-btn]');
            await page.waitForSelector('[data-testid=sessions-dialog]');
            await page.waitForSelector('[data-testid=session-row]');
            await settle(250, 2500); // 同上:動畫結束後才量測與截圖
            const fit = await page.evaluate(() => {
                const d = document.querySelector('[data-testid=sessions-dialog]');
                const r = d.getBoundingClientRect();
                const list = document.querySelector('[data-testid=session-list]');
                const btns = [...d.querySelectorAll('button')].map(b => b.getBoundingClientRect());
                return {
                    page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
                    win: r.left >= 0 && r.right <= window.innerWidth,
                    list: list.scrollWidth <= list.clientWidth,
                    btns: btns.every(b => b.left >= 0 && b.right <= window.innerWidth),
                    rect: `${Math.round(r.left)}..${Math.round(r.right)} / ${window.innerWidth}`,
                };
            });
            check('640 寬清單在視窗內', fit.win && fit.btns, JSON.stringify(fit));
            check('640 寬無水平捲軸', fit.page && fit.list, JSON.stringify(fit));
            await shot('sessions-list-640');
            await page.keyboard.press('Escape'); // 先關清單:Radix overlay 會擋住其他點擊
            await page.setViewportSize({width: 1440, height: 900});
            if (inspWasOpen && await inspLabel() === '展開資訊欄') await page.click('[data-testid=toggle-inspector]');
            await page.click('[data-testid=chat-window] button:has(svg.lucide-square-pen)'); // 結束前回到乾淨狀態(同 bot-chat 組的慣例)
        } finally {
            clean(); // 只清 fixture 作品對應的鍵,不碰其他作品的記錄
        }
    },
};
