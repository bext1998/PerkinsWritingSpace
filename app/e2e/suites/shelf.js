// shelf — 摘要與前情、複製到平台、新增卷拖曳、設定頁標題欄與主題、書櫃
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'shelf',
    desc: '摘要與前情、複製到平台、新增卷拖曳、設定頁標題欄與主題、書櫃',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'checks');
        // (跨組 helper:titlebar-zen 段定義的 logoState;淺色主題品牌檢查用)
        const logoState = () => page.evaluate(() => {
            const el = document.querySelector('[data-testid=app-menu] img');
            return el ? {tag: el.tagName, naturalWidth: el.naturalWidth, w: el.offsetWidth, h: el.offsetHeight} : null;
        });
        // 章節摘要 → 前情
        await page.click('[data-testid=rail-manuscript]');
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.click('button:has-text("摘要")');
        await page.waitForSelector('[data-testid=summary-text]');
        await page.fill('[data-testid=summary-text]', '艾莉絲在夜晚的森林裡遇見雷恩,兩人在營火旁休息。');
        await page.click('[data-testid=save-summary]');
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        check('B6 摘要儲存到 summaries/', fs.existsSync(P('summaries/第一章.md')) && read('summaries/第一章.md').includes('營火旁休息'));
        await page.click('[data-testid=chapter-row]:has-text("第二章")');
        await page.waitForSelector('.cm-line:has-text("天亮了")');
        await page.click('[data-testid=chat-fab]');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-square-pen)');
        await page.fill('[data-testid=question]', '測試');
        await page.click('[data-testid=chips] >> text=前情摘要');
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview]');
        pv = await page.textContent('[data-testid=preview]');
        check('前情摘要出現在第二章的上下文', pv.includes('營火旁休息') && pv.includes('前情摘要'));
        await page.keyboard.press('Escape');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // 複製到平台(會寫入系統剪貼簿)
        const h2 = hash('manuscript/第二章.md');
        await page.click('[data-testid=copy-platform]');
        await page.click('[role=menuitem]:has-text("角角者")');
        // 上一步「摘要已儲存」的通知可能還在畫面上:等到複製結果的通知出現再讀,逾時就讀當下內容讓檢查失敗
        await page.waitForSelector('[data-testid=toast]:has-text("已複製")', {timeout: 5000});
        const toastText = (await page.$$eval('[data-testid=toast]', els => els.map(e => e.textContent))).join(' | ');
        check('複製到平台顯示結果', toastText.includes('已複製'), toastText);
        check('B8 複製不改動稿件', hash('manuscript/第二章.md') === h2);

        // 新增卷並拖曳章節
        const hashes = [hash(ch1), hash('manuscript/第二章.md')];
        await page.click('button:has-text("新增卷")');
        await page.waitForSelector('text=第2卷');
        await page.dragAndDrop('[data-testid=chapter-row]:has-text("第二章")', 'span:has-text("第2卷")');
        await page.waitForTimeout(800);
        const cfg = JSON.parse(read('perkins.json'));
        check('B1 拖曳章節到新卷只改 perkins.json', cfg.volumes?.[1]?.chapters?.includes('manuscript/第二章.md') && !cfg.order, JSON.stringify(cfg.volumes));
        check('B1 稿件雜湊不變', hash(ch1) === hashes[0] && hash('manuscript/第二章.md') === hashes[1]);
        await shot('09-volumes');

        // 設定頁
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        // 設定頁不應蓋住標題欄
        const tbBox = await page.locator('[data-testid=titlebar]').boundingBox();
        const spBox = await page.locator('[data-testid=settings-page]').boundingBox();
        check('標題欄 設定頁仍可見且未被蓋住', !!tbBox && !!spBox && tbBox.height > 0 && spBox.y >= tbBox.y + tbBox.height - 1,
            JSON.stringify({titlebarBottom: tbBox && tbBox.y + tbBox.height, settingsTop: spBox && spBox.y}));
        // 設定頁蓋住作品外框 → 標題欄畫底線、不提供側欄開關與作品項目(不是只看「有沒有開作品」)
        check('標題欄 設定頁時有底線且無側欄開關',
            await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=titlebar]')).borderBottomWidth !== '0px')
            && !(await page.$('[data-testid=titlebar-sidebar]')));
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        check('應用程式選單 設定頁時不提供回到書櫃/儲存/設定',
            !(await page.$('[data-testid=menu-bookshelf]')) && !(await page.$('[data-testid=menu-save]')) && !(await page.$('[data-testid=menu-settings]')));
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=app-menu-content]', {state: 'detached'});
        await shot('56-titlebar-settings-logo');
        await shot('52-titlebar-settings');
        await shot('10-settings-models');
        await page.click('[data-testid=tab-platforms]');
        await page.waitForSelector('[data-testid=platform-preview]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const out = await page.textContent('[data-testid=platform-preview]');
        check('平台預覽:兩格縮排、筆記不外流', out.includes('\u3000\u3000清晨的王都很安靜') && !out.includes('伏筆'), JSON.stringify(out));
        await shot('11-settings-platforms');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        await shot('12-light-theme');
        check('標題欄 離開設定頁回到作品畫面後恢復側欄開關', !!(await page.$('[data-testid=titlebar-sidebar]')));

        // 淺色主題下的標題欄
        check('標題欄 淺色主題仍存在', await page.isVisible('[data-testid=titlebar]'));
        await shot('51-titlebar-workspace-light');

        // 淺色主題下的品牌 logo 與 AI 視窗標題(白色底也要清楚)
        const logoLight = await logoState();
        check('品牌 淺色主題側欄 logo 仍已載入', !!logoLight && logoLight.tag === 'IMG' && logoLight.naturalWidth > 0, JSON.stringify(logoLight));
        await shot('41-brand-rail-light');
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const chatTitleLight = (await page.textContent('[data-testid=chat-title]')).trim();
        check('品牌 淺色主題 AI 視窗標題為 Perkins Bot', chatTitleLight === 'Perkins Bot', chatTitleLight);
        await shot('43-brand-chat-title-light');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await page.click('[data-testid=open-settings]');
        await page.click('button:has-text("夜間書房")');
        await page.click('[data-testid=close-settings]');

        // 回書櫃
        await page.click('nav button:has(svg.lucide-house)');
        await page.waitForSelector('[data-testid=bookshelf-title]');
        // 書櫃沒有側欄 logo → 標題欄左側放小 logo,標題回到應用程式名稱
        // 標題欄在 React 樹之外(模組層狀態),名稱更新落在 App 的 effect 之後,
        // 因此先有限度等它更新再斷言(沒更新照樣 FAIL),不是放寬檢查
        await page.waitForFunction(() =>
            (document.querySelector('[data-testid=titlebar-title]')?.textContent || '').trim() === 'Perkins WritingSpace',
            null, {timeout: 3000}).catch(() => {}); // 軟等待保留:標題欄為 React 樹外模組層狀態,更新落在 App effect 之後(原始碼註明),等不到由斷言把關
        check('標題欄 書櫃顯示應用程式名稱', (await page.textContent('[data-testid=titlebar-title]')).trim() === 'Perkins WritingSpace');
        check('標題欄 書櫃有 logo 選單', !!(await page.$('[data-testid=app-menu] img')));
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        check('應用程式選單 書櫃只有設定', !!(await page.$('[data-testid=menu-settings]'))
            && !(await page.$('[data-testid=menu-bookshelf]')) && !(await page.$('[data-testid=menu-save]')));
        await page.click('[data-testid=menu-settings]');
        await page.waitForSelector('[data-testid=settings-page]', {timeout: 3000});
        check('應用程式選單 設定項可開啟設定頁', !!(await page.$('[data-testid=settings-page]')));
        await page.click('[data-testid=close-settings]');
        await page.waitForSelector('[data-testid=bookshelf-title]');
        // 既有檢查的 flaky race(已知問題,原因未明,見 docs/PROGRESS.md):先等列 render 再斷言,不弱化檢查
        await page.waitForSelector('p:has-text("E2E測試")', {timeout: 5000}).catch(() => {}); // 軟等待保留:既有 flaky race(原因未明),等不到由下一行斷言把關
        check('書櫃顯示最近的作品', !!(await page.$('p:has-text("E2E測試")')));
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        await shot('13-bookshelf');
        await shot('53-titlebar-bookshelf');
        // 1B 視覺驗收(設計審查 16/17):書櫃首頁(深色)
        await shot('31-1b-bookshelf-dark');
    },
};
