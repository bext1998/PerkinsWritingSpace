// titlebar-zen — 開檔基本(B1 需新 fixture)、標題欄、品牌、應用程式選單、禪模式、白屏回歸
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'titlebar-zen',
    desc: '開檔基本(B1 需新 fixture)、標題欄、品牌、應用程式選單、禪模式、白屏回歸',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await page.goto('http://localhost:34115');
        await page.waitForSelector('text=E2E測試', {timeout: 30000});
        await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
        await page.waitForFunction(() => document.querySelectorAll('[data-testid=chapter-row]').length === 3, {timeout: 30000});
        const rows = await page.$$('[data-testid=chapter-row]');
        check('B1 舊版 order 專案開啟後章節順序保留', rows.length === 3 && (await rows[0].textContent()).includes('第一章'));
        check('B1 只是開啟不改寫 perkins.json', hash('perkins.json') === cfgHash);

        await rows[0].click();
        await page.waitForSelector('.cm-content');
        check('開啟章節顯示內容', (await page.textContent('.cm-content')).includes('艾莉絲走進森林'));
        await page.waitForTimeout(600);
        check('狀態列顯示本章字數', /本章 \d+ 字/.test(await page.textContent('[data-testid=count-chapter]')));
        check('場景出現在側欄', !!(await page.$('aside li:has-text("營火")')));
        await page.waitForSelector('[data-testid=cast]', {timeout: 5000}).catch(() => {}); // 軟等待保留:cast 區塊可能不渲染,由下一行 inspector 文字斷言把關
        const cast = await page.textContent('[data-testid=inspector]');
        check('資訊欄列出本章提及的設定(含無 frontmatter 的舊設定)', cast.includes('艾莉絲') && cast.includes('雷恩'));
        await shot('01-workspace');

        // 標題欄(SPEC §17.1):作品畫面看得到三顆視窗鈕,標題含作品名,且不重複放 logo
        check('標題欄 作品畫面存在', await page.isVisible('[data-testid=titlebar]'));
        check('標題欄 三顆視窗鈕存在', !!(await page.$('[data-testid=win-min]')) && !!(await page.$('[data-testid=win-max]')) && !!(await page.$('[data-testid=win-close]')));
        const wsTitle = (await page.textContent('[data-testid=titlebar-title]')).trim();
        check('標題欄 作品畫面標題為作品名(不再重複應用程式名稱)', wsTitle === 'E2E測試', wsTitle);
        check('標題欄 作品名只出現在標題欄(側欄標頭改顯示面板名稱)',
            (await page.textContent('[data-testid=sidebar-title]')).trim() === '稿件');
        // L 形外框(SPEC §17.1):作品畫面標題欄與圖示列同色、標題欄不畫底線、logo 欄與圖示列等寬
        const lFrame = await page.evaluate(() => {
            const tb = document.querySelector('[data-testid=titlebar]');
            const rail = document.querySelector('[data-testid=rail]');
            const menu = document.querySelector('[data-testid=app-menu]');
            return {tbBg: getComputedStyle(tb).backgroundColor, railBg: getComputedStyle(rail).backgroundColor,
                tbBorder: getComputedStyle(tb).borderBottomWidth, menuW: menu.getBoundingClientRect().width,
                railW: rail.getBoundingClientRect().width, railLogo: !!document.querySelector('[data-testid=rail-logo]')};
        });
        check('標題欄 作品畫面與圖示列同色、無底線,logo 欄與圖示列等寬',
            lFrame.tbBg === lFrame.railBg && lFrame.tbBorder === '0px' && lFrame.menuW === lFrame.railW, JSON.stringify(lFrame));
        check('品牌 圖示列不再放 logo', !lFrame.railLogo);
        await shot('50-titlebar-workspace-dark');

        // 品牌(SPEC §17):標題欄 logo 是應用程式選單
        const logoState = () => page.evaluate(() => {
            const el = document.querySelector('[data-testid=app-menu] img');
            return el ? {tag: el.tagName, naturalWidth: el.naturalWidth, w: el.offsetWidth, h: el.offsetHeight} : null;
        });
        const logoDark = await logoState();
        check('品牌 標題欄 logo 是已載入的圖片', !!logoDark && logoDark.tag === 'IMG' && logoDark.naturalWidth > 0, JSON.stringify(logoDark));
        check('品牌 標題欄 logo 尺寸 20×20', !!logoDark && logoDark.w === 20 && logoDark.h === 20, JSON.stringify(logoDark));
        // 應用程式選單:作品畫面有儲存、回到書櫃、設定
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        check('應用程式選單 作品畫面有儲存/回到書櫃/設定',
            !!(await page.$('[data-testid=menu-save]')) && !!(await page.$('[data-testid=menu-bookshelf]')) && !!(await page.$('[data-testid=menu-settings]')));
        await settle(80, 650); // 等 UI 更新(原固定等 250ms)
        await shot('57-app-menu-workspace');
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=app-menu-content]', {state: 'detached'});
        // 選單「儲存」走與 Ctrl+S 相同的存檔流程:打字變未儲存 → 選單儲存 → 已儲存
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('選');
        await page.waitForSelector('[data-testid=statusbar] >> text=未儲存');
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        await page.click('[data-testid=menu-save]');
        await page.waitForSelector('[data-testid=app-menu-content]', {state: 'detached'});
        await page.waitForSelector('[data-testid=statusbar] >> text=已儲存', {timeout: 5000});
        check('應用程式選單 儲存會存檔', (await page.textContent('[data-testid=statusbar]')).includes('已儲存'));
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=statusbar] >> text=已儲存', {timeout: 5000});
        // 側欄開關在標題欄:收合後再展開,回到原本的面板
        await page.click('[data-testid=rail-bible]');
        await page.waitForSelector('[data-testid=sidebar-title] >> text=設定集');
        await page.click('[data-testid=titlebar-sidebar]');
        await settle(80, 550); // 等 UI 更新(原固定等 150ms)
        const collapsed = !(await page.$('[data-testid=sidebar-title]'));
        await page.click('[data-testid=titlebar-sidebar]');
        await page.waitForSelector('[data-testid=sidebar-title]');
        check('標題欄 側欄開關可收合並展開回原面板', collapsed && (await page.textContent('[data-testid=sidebar-title]')).trim() === '設定集');
        await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('[data-testid=sidebar-title] >> text=稿件');

        // 禪模式(SPEC §16 第 6 項):只留編輯器;周邊只藏不卸載,退出後版面與 Perkins Bot 草稿原樣恢復
        if (!(await page.$('[data-testid=inspector]'))) await page.click('[data-testid=toggle-inspector]');
        await page.waitForSelector('[data-testid=inspector]');
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        await page.fill('[data-testid=question]', '禪模式前的草稿');
        const zenVisible = () => page.evaluate(() => {
            const vis = sel => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
            return {rail: vis('[data-testid=rail]'), sidebar: vis('[data-testid=sidebar-title]'), inspector: vis('[data-testid=inspector]'),
                fab: vis('[data-testid=chat-fab]'), chat: vis('[data-testid=chat-window]'), toolbar: vis('[data-testid=editor-toolbar]'),
                editor: vis('.cm-content'), exit: vis('[data-testid=zen-exit]'), tbSidebar: vis('[data-testid=titlebar-sidebar]')};
        });
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        await page.click('[data-testid=menu-zen]');
        await page.waitForSelector('[data-testid=app-menu-content]', {state: 'detached'});
        await page.waitForSelector('[data-testid=zen-exit]');
        const zIn = await zenVisible();
        check('禪模式 選單進入後只留編輯器(圖示列、側欄、資訊欄、Bot 圓鈕與視窗、工具列、標題欄側欄開關都藏起)',
            !zIn.rail && !zIn.sidebar && !zIn.inspector && !zIn.fab && !zIn.chat && !zIn.toolbar && !zIn.tbSidebar && zIn.editor && zIn.exit,
            JSON.stringify(zIn));
        await shot('58-zen-mode');
        // 禪模式中照常寫作:打字變未儲存,Ctrl+S 存檔
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('禪記');
        await page.waitForSelector('[data-testid=statusbar] >> text=未儲存');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=statusbar] >> text=已儲存', {timeout: 5000});
        check('禪模式 中可打字並存檔(內容確實落盤)', (await page.textContent('[data-testid=statusbar]')).includes('已儲存')
            && read(ch1).includes('禪記'));
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await page.waitForFunction(() => document.querySelector('[data-testid=statusbar]')?.textContent.includes('已儲存'), null, {timeout: 5000});
        await page.click('[data-testid=zen-exit]');
        await page.waitForSelector('[data-testid=rail]:visible');
        const zOut = await zenVisible();
        check('禪模式 退出後版面原樣恢復(側欄仍是稿件、資訊欄與 Bot 視窗仍開著)',
            zOut.rail && zOut.sidebar && zOut.inspector && zOut.chat && zOut.toolbar && zOut.tbSidebar && !zOut.exit
            && (await page.textContent('[data-testid=sidebar-title]')).trim() === '稿件', JSON.stringify(zOut));
        check('禪模式 退出後 Perkins Bot 草稿仍在(未卸載)', (await page.inputValue('[data-testid=question]')) === '禪模式前的草稿');
        await page.fill('[data-testid=question]', '');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        // 快捷鍵 Ctrl+Shift+F 進出
        await page.click('.cm-content');
        await page.keyboard.press('Control+Shift+F');
        await page.waitForSelector('[data-testid=zen-exit]', {timeout: 3000});
        const kIn = await zenVisible();
        await page.keyboard.press('Control+Shift+F');
        await page.waitForSelector('[data-testid=rail]:visible', {timeout: 3000});
        const kOut = await zenVisible();
        check('禪模式 Ctrl+Shift+F 可進入與離開', !kIn.rail && kIn.exit && kOut.rail && !kOut.exit, JSON.stringify({kIn, kOut}));
        // 從編輯器叫出 Perkins Bot 時自動離開禪模式,對話窗不會被藏起來
        await page.keyboard.press('Control+Shift+F');
        await page.waitForSelector('[data-testid=zen-exit]');
        await page.click('.cm-content');
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Shift+End');
        await page.waitForSelector('[data-testid=selection-ask]');
        await page.click('[data-testid=selection-ask]');
        await page.waitForSelector('[data-testid=chat-window]:visible', {timeout: 3000});
        const aOut = await zenVisible();
        check('禪模式 選取後詢問 Perkins Bot 會離開禪模式並顯示對話窗', aOut.chat && aOut.rail && !aOut.exit, JSON.stringify(aOut));
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        // 設定集文件:欄位表單也要隱藏,且未套用的輸入在退出後保留
        await page.click('[data-testid=rail-bible]');
        await page.click('[data-testid=entity-row] >> nth=0');
        await page.waitForSelector('[data-testid=entity-name]');
        const nameBefore = await page.inputValue('[data-testid=entity-name]');
        await page.fill('[data-testid=entity-name]', nameBefore + '禪');
        await page.keyboard.press('Control+Shift+F');
        await page.waitForSelector('[data-testid=zen-exit]');
        const nameHidden = await page.evaluate(() => document.querySelector('[data-testid=entity-name]')?.getClientRects().length === 0);
        await page.keyboard.press('Control+Shift+F');
        await page.waitForSelector('[data-testid=rail]:visible');
        check('禪模式 設定集欄位表單一併隱藏,退出後未套用的輸入仍在',
            nameHidden && (await page.inputValue('[data-testid=entity-name]')) === nameBefore + '禪');
        await page.fill('[data-testid=entity-name]', nameBefore);
        await page.click('[data-testid=rail-manuscript]');
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');

        const fabTitle = await page.getAttribute('[data-testid=chat-fab]', 'title');
        check('品牌 開啟按鈕標題為 Perkins Bot', fabTitle === 'Perkins Bot', String(fabTitle));
        await shot('40-brand-rail-dark');
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const chatTitleDark = (await page.textContent('[data-testid=chat-title]')).trim();
        check('品牌 AI 視窗標題為 Perkins Bot', chatTitleDark === 'Perkins Bot', chatTitleDark);
        check('品牌 頁面不再出現「AI 助手」', !(await page.textContent('body')).includes('AI 助手'));
        await shot('42-brand-chat-title-dark');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // 回歸:章節裡沒有任何設定實體 + 收合側欄 → 開啟 AI 視窗不能整個白屏。
        // 成因是 SuggestAttachments 回傳 null(Go nil slice)而前端對它 .filter,見 docs/PITFALLS.md。
        const errs0 = errors.length;
        await page.click('[data-testid=chapter-row]:has-text("第三章")');
        await page.waitForSelector('.cm-line:has-text("風停了")');
        await page.click('[data-testid=titlebar-sidebar]');
        await page.click('[data-testid=chat-fab]');
        await page.waitForTimeout(1000);
        check('收合側欄後在無設定的章節開啟 AI 視窗', await page.isVisible('[data-testid=chat-window]').catch(() => false) && errors.length === errs0,
            errors.slice(errs0).join(' | '));
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await page.click('[data-testid=rail-manuscript]');
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');

    },
};
