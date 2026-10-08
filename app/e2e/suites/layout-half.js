// layout-half — 標題欄 640、半螢幕 640 互斥、窄寬度工具列與更多選單
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'layout-half',
    desc: '標題欄 640、半螢幕 640 互斥、窄寬度工具列與更多選單',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
// 最小視窗尺寸(640×672,半螢幕並排 SPEC §16 第 7 項)下標題欄與主要版面仍在
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-content');
        // 先確認 1440(>960)下兩欄都開著,縮窄才驗得到「兩個都開→自動收資訊欄」
        if (!(await page.$('aside'))) await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('aside');
        if (!(await page.$('[data-testid=inspector]'))) await page.click('[data-testid=toggle-inspector]');
        await page.waitForSelector('[data-testid=inspector]');
        await page.setViewportSize({width: 640, height: 672});
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        check('標題欄 640×672 下仍在', await page.isVisible('[data-testid=titlebar]'));
        check('標題欄 640×672 三顆視窗鈕完整在視窗內', await page.evaluate(() =>
            ['win-min', 'win-max', 'win-close'].every(id => {
                const r = document.querySelector(`[data-testid=${id}]`)?.getBoundingClientRect();
                return r && r.width > 0 && r.height > 0 && r.right <= window.innerWidth + 1;
            })));
        check('標題欄 640×672 下有 logo 選單、側欄開關與編輯器', !!(await page.$('[data-testid=app-menu]'))
            && !!(await page.$('[data-testid=titlebar-sidebar]')) && !!(await page.$('.cm-content')));
        await shot('54-titlebar-min-640x672');

        // ===== 半螢幕並排(SPEC §16 第 7 項):640×672 =====
        // 前提:進到這裡時側欄與資訊欄都開著(前面章節的狀態);由 >960 縮窄到 ≤960 觸發互斥,
        // 兩個都開就自動收資訊欄。門檻 960 = 1920×1080 縮放 100% 的半邊(驗收尺寸上限)。
        // 側欄的 aside 沒有 testid;Inspector 根元素也是 aside(testid=inspector),選擇器要排除
        const exclusiveOK = () => page.evaluate(() =>
            !(!!document.querySelector('aside:not([data-testid=inspector])') && !!document.querySelector('[data-testid=inspector]')));
        check('半螢幕 縮窄到 640 後資訊欄自動收起', !(await page.$('[data-testid=inspector]')));
        check('半螢幕 縮窄到 640 後側欄仍在', !!(await page.$('aside:not([data-testid=inspector])')));
        check('半螢幕 640×672 側欄與資訊欄不同時存在', await exclusiveOK());
        const mainW640 = await page.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width));
        check('半螢幕 640×672 主編輯區寬度 ≥ 300(可寫作)', mainW640 >= 300, `mainW=${mainW640}(圖示列 60+側欄 272=332,640-332=308)`);
        check('半螢幕 640×672 整頁無水平捲軸', await page.evaluate(() =>
            document.documentElement.scrollWidth <= document.documentElement.clientWidth));
        await shot('55-halfscreen-640');

        // ===== Perkins Bot 浮窗 640 寬可讀性(Issue #37 部分):context-usage 可見、不擠壞標題列與輸入區 =====
        // close-guard 把浮窗拖到寬視窗的位置;640 下事件點會落在視窗外拖不回來,
        // 所以暫時放大到 1440 把浮窗拖回左上,再縮回 640 量測(暫時避開 #55 的既有產品問題,
        // #55 修好後移除這段變通)
        await page.setViewportSize({width: 1440, height: 900});
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const dragBar = await page.locator('[data-testid=chat-window] .cursor-move').first().boundingBox();
        if (dragBar.x + 440 > 640 || dragBar.y + 200 > 672) {
            await page.mouse.move(dragBar.x + 60, dragBar.y + 8);
            await page.mouse.down();
            await page.mouse.move(220, 40, {steps: 8}); // 拖到左上:640×672 內可完整容納 620 高的浮窗
            await page.mouse.up();
            await settle(80, 700);
        }
        await page.setViewportSize({width: 640, height: 672});
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        await page.waitForSelector('[data-testid=context-usage]', {timeout: 5000});
        const cu640 = await page.evaluate(() => {
            const el = document.querySelector('[data-testid=context-usage]');
            const r = el.getBoundingClientRect();
            const box = document.querySelector('[data-testid=chat-window]').getBoundingClientRect();
            const title = document.querySelector('[data-testid=chat-title]').getBoundingClientRect();
            const q = document.querySelector('[data-testid=question]').getBoundingClientRect();
            return {text: el.textContent.trim(), w: r.width, h: r.height,
                inBox: r.right <= box.right + 1 && r.left >= box.left - 1,
                inViewport: r.top >= 0 && r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
                titleW: title.width, qW: q.width};
        });
        check('半螢幕 640 context-usage 可見、在浮窗內且在視窗範圍內',
            cu640.w > 0 && cu640.h > 0 && cu640.inBox && cu640.inViewport && /上下文/.test(cu640.text), JSON.stringify(cu640));
        check('半螢幕 640 浮窗標題列的 Perkins Bot 標題未被擠壞', cu640.titleW >= 60, `titleW=${cu640.titleW}`);
        check('半螢幕 640 浮窗輸入區仍可用(寬度 ≥ 200)', cu640.qW >= 200, `qW=${cu640.qW}`);
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // ===== 窄寬度編輯區工具列(SPEC §17.1):640×672、側欄開(資訊欄已收)、長章名 =====
        // 量測重點:工具列「內容右緣」(所有可見後代的最大 right)不得超過 main 右緣——
        // 溢出的按鈕即使被 overflow-hidden 視覺裁掉,幾何上仍會超過,檢查才驗得到。
        if (!(await page.$('[data-testid=chapter-row]'))) await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('[data-testid=chapter-row]');
        await page.click('[data-testid=chapter-row]:has-text("第十二章")');
        await page.waitForSelector('.cm-content');
        await page.waitForFunction(() =>
            (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('第十二章森林深處'),
            null, {timeout: 10000});
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const measureToolbar = () => page.evaluate(() => {
            const tb = document.querySelector('[data-testid=editor-toolbar]');
            if (!tb) return {missing: 'editor-toolbar'};
            const insp = document.querySelector('[data-testid=inspector]');
            const badge = document.querySelector('[data-testid=status-badge]');
            const crumbs = document.querySelector('[data-testid=crumbs]');
            const crumbSpans = crumbs ? [...crumbs.querySelectorAll('span.truncate')] : [];
            const last = crumbSpans[crumbSpans.length - 1] || null;
            const tbR = tb.getBoundingClientRect();
            const inspR = insp ? insp.getBoundingClientRect() : null;
            let contentRight = -Infinity;
            for (const el of tb.querySelectorAll('*')) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) contentRight = Math.max(contentRight, r.right);
            }
            const btn = sel => {
                const el = tb.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return {w: r.width, right: r.right, aria: el.getAttribute('aria-label'), title: el.getAttribute('title')};
            };
            const lr = last ? last.getBoundingClientRect() : null;
            return {
                tbH: tbR.height, tbRight: tbR.right, contentRight,
                inspLeft: inspR ? inspR.left : null,
                badgeH: badge ? badge.getBoundingClientRect().height : null,
                crumb: last ? {text: last.textContent, w: last.clientWidth, scrollW: last.scrollWidth, h: lr.height} : null,
                text: (tb.innerText || '').replace(/\s+/g, ' '),
                summary: btn('button[aria-label="章節摘要"]'),
                copy: btn('[data-testid=copy-platform]'),
                versions: btn('[data-testid=open-versions]'),
                save: btn('[data-testid=save-button]'),
                toggle: btn('[data-testid=toggle-inspector]'),
            };
        });

        const m640 = await measureToolbar();
        check('工具列 640×672 高度維持 48(不換行)', m640.tbH === 48, `tbH=${m640.tbH}`);
        check('工具列 640×672 內容不超出 main 右緣',
            m640.contentRight <= m640.tbRight + 1,
            JSON.stringify({contentRight: m640.contentRight, tbRight: m640.tbRight}));
        check('工具列 640×672 狀態徽章單行(未被擠成直排)',
            !!m640.badgeH && m640.badgeH <= 30, `badgeH=${m640.badgeH}`);
        check('工具列 640×672 麵包屑省略號截斷且看得到章名開頭',
            !!m640.crumb && m640.crumb.text.includes('第十二章') && m640.crumb.w >= 40
                && m640.crumb.scrollW > m640.crumb.w && m640.crumb.h <= 22,
            JSON.stringify(m640.crumb));
        check('工具列 640×672 次要按鈕收進「更多」(直列不放摘要/複製到平台/版本)',
            !/摘要|複製到平台|版本/.test(m640.text), m640.text);
        check('工具列 640×672 「儲存」與資訊欄開關仍可見且在工具列內',
            !!m640.save && !!m640.toggle && m640.save.w > 0 && m640.toggle.w > 0
                && m640.save.right <= m640.tbRight + 1 && m640.toggle.right <= m640.tbRight + 1,
            JSON.stringify({save: m640.save, toggle: m640.toggle}));
        await shot('60-toolbar-640x672');

        // 狀態列(SPEC §17.1):640 寬下不換行、每一項不超出 main 右緣;模型名以省略號截斷
        const sb640 = await page.evaluate(() => {
            const f = document.querySelector('footer');
            const main = document.querySelector('main');
            if (!f || !main) return null;
            const mainRight = main.getBoundingClientRect().right;
            const items = [...f.children].map(el => {
                const r = el.getBoundingClientRect();
                return {t: (el.textContent || '').trim().slice(0, 16), w: r.width, h: r.height, right: r.right};
            }).filter(i => i.w > 0 && i.h > 0);
            const ai = [...f.children].find(el => (el.textContent || '').startsWith('AI:'));
            const ar = ai ? ai.getBoundingClientRect() : null;
            return {
                text: (f.innerText || '').replace(/\s+/g, ' '),
                mainRight,
                items,
                ai: ai ? {scrollW: ai.scrollWidth, clientW: ai.clientWidth, right: ar.right, h: ar.height} : null,
            };
        });
        check('狀態列 640×672 每一項單行且不超出 main 右緣(不換行、不溢出)',
            !!sb640 && sb640.items.every(i => i.h <= 20 && i.right <= sb640.mainRight + 1),
            JSON.stringify(sb640 && {mainRight: sb640.mainRight, items: sb640.items}));
        check('狀態列 640×672 保留本章與已儲存、模型名省略號截斷且在 main 內',
            !!sb640 && /本章/.test(sb640.text) && /已儲存/.test(sb640.text)
                && !!sb640.ai && sb640.ai.scrollW > sb640.ai.clientW
                && sb640.ai.right <= sb640.mainRight + 1 && sb640.ai.h <= 20,
            JSON.stringify(sb640 && sb640.ai));

        // 「更多」下拉:最窄段把次要功能收進下拉,功能一個都不能少(SPEC §17.1)
        const hasMore = !!(await page.$('[data-testid=toolbar-more]'));
        check('工具列 640×672 有「更多」按鈕(次要功能收進下拉)', hasMore);
        if (hasMore) {
            await page.click('[data-testid=toolbar-more]');
            const menuOpen = await page.waitForSelector('[role=menu]', {timeout: 3000}).then(() => true).catch(() => false);
            const moreTxt = menuOpen ? await page.textContent('[role=menu]').catch(() => '') : '';
            const menuHasAll = menuOpen && moreTxt.includes('摘要') && moreTxt.includes('版本') && moreTxt.includes('複製到平台');
            check('更多 選單含摘要/版本/複製到平台', menuHasAll, moreTxt.slice(0, 120));
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            if (menuHasAll) {
                // 摘要
                await page.click('[role=menuitem]:has-text("摘要")').catch(() => {}); // 軟等待保留:選單沒開時由 else 分支的失敗檢查回報
                const sumOpen = await page.waitForSelector('[data-testid=summary-text]', {timeout: 4000}).then(() => true).catch(() => false);
                check('更多 可從選單開啟摘要', sumOpen);
                if (sumOpen) {
                    await page.keyboard.press('Escape');
                    await page.waitForSelector('[data-testid=summary-text]', {state: 'detached', timeout: 4000});
                }
                // 版本
                await page.click('[data-testid=toolbar-more]').catch(() => {}); // 軟等待保留:選單沒開時由 else 分支的失敗檢查回報
                await page.waitForSelector('[role=menu]', {timeout: 3000});
                await page.click('[role=menuitem]:has-text("版本")').catch(() => {}); // 軟等待保留:選單沒開時由 else 分支的失敗檢查回報
                const verOpen = await page.waitForSelector('text=建立快照', {timeout: 4000}).then(() => true).catch(() => false);
                check('更多 可從選單開啟版本', verOpen);
                if (verOpen) {
                    await page.keyboard.press('Escape');
                    await page.waitForSelector('text=建立快照', {state: 'detached', timeout: 4000});
                }
                // 複製到平台(平台清單以展開項目呈現;點擊會寫入系統剪貼簿)
                await page.click('[data-testid=toolbar-more]').catch(() => {}); // 軟等待保留:選單沒開時由 else 分支的失敗檢查回報
                await page.waitForSelector('[role=menu]', {timeout: 3000});
                await page.click('[role=menuitem]:has-text("角角者")').catch(() => {}); // 軟等待保留:選單沒開時由 else 分支的失敗檢查回報
                const copied = await page.waitForSelector('[data-testid=toast]', {timeout: 5000})
                    .then(async () => (await page.textContent('[data-testid=toast]').catch(() => '')).includes('已複製')).catch(() => false);
                check('更多 可從選單觸發複製到平台', copied);
            } else {
                check('更多 可從選單開啟摘要', false, '選單未如期開啟或缺項目');
                check('更多 可從選單開啟版本', false, '選單未如期開啟或缺項目');
                check('更多 可從選單觸發複製到平台', false, '選單未如期開啟或缺項目');
            }
        } else {
            check('更多 選單含摘要/版本/複製到平台', false, 'toolbar-more 不存在');
            check('更多 可從選單開啟摘要', false, 'toolbar-more 不存在');
            check('更多 可從選單開啟版本', false, 'toolbar-more 不存在');
            check('更多 可從選單觸發複製到平台', false, 'toolbar-more 不存在');
        }
        await page.keyboard.press('Escape').catch(() => {}); // 收掉可能還開著的選單 // 軟等待保留:收掉可能開著的選單
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)

        // 窄寬度下作者手動開關仍有效:開資訊欄自動收側欄,再開側欄自動收資訊欄(SPEC §16 第 7 項 b)
        await page.click('[data-testid=toggle-inspector]');
        await page.waitForSelector('[data-testid=inspector]');
        const inspW640 = await page.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width));
        check('半螢幕 640 手動開資訊欄自動收側欄且主編輯區 ≥ 300',
            !(await page.$('aside:not([data-testid=inspector])')) && inspW640 >= 300, `mainW=${inspW640}`);
        await shot('56-halfscreen-640-inspector');
        await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('aside');
        check('半螢幕 640 手動開側欄自動收資訊欄', !(await page.$('[data-testid=inspector]')));
        check('半螢幕 640 手動開側欄後仍互斥', await exclusiveOK());

        // 900×600(舊最小尺寸):側欄開時工具列退化成只剩圖示,互斥仍成立,不溢出
        await page.setViewportSize({width: 900, height: 600});
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        const m900 = await measureToolbar();
        check('工具列 900×600 退化成只剩圖示(文字收起,按鈕保留 aria-label 與 title)',
            !!m900.summary && m900.summary.w > 0 && m900.summary.aria === '章節摘要' && !!m900.summary.title
                && !/摘要|複製到平台|版本/.test(m900.text),
            JSON.stringify({text: m900.text, summary: m900.summary}));
        check('工具列 900×600 內容不超出 main 右緣',
            m900.contentRight <= m900.tbRight + 1,
            JSON.stringify({contentRight: m900.contentRight, tbRight: m900.tbRight}));
        check('半螢幕 900×600 側欄與資訊欄不同時存在', await exclusiveOK());
        await shot('54b-toolbar-900x600');

        // 1280×800(預設視窗):恢復完整文字標籤;變寬後不自動重開資訊欄(不強迫改變作者的選擇)
        await page.setViewportSize({width: 1280, height: 800});
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        const m1280 = await measureToolbar();
        check('工具列 1280×800 顯示完整文字標籤',
            /摘要/.test(m1280.text) && /複製到平台/.test(m1280.text) && /版本/.test(m1280.text),
            m1280.text);
        check('工具列 1280×800 內容不超出 main 右緣',
            m1280.contentRight <= m1280.tbRight + 1,
            JSON.stringify({contentRight: m1280.contentRight, tbRight: m1280.tbRight}));
        check('半螢幕 變寬到 1280 後不自動重開資訊欄', !(await page.$('[data-testid=inspector]')));
        await shot('61-toolbar-1280x800');
    },
};
