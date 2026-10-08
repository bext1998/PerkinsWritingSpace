// settings-layout — 設定頁導覽版面 900/640/1280
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'settings-layout',
    desc: '設定頁導覽版面 900/640/1280',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // ===== 設定頁左側導覽版面(SPEC §17.2):900×600 與 1280×800 三頁 =====
        // 量測:根節點是否滾動(捲軸該在內容區)、內容水平捲軸、元素右緣、研究記錄間距、
        // 內容置中、封面與欄位不重疊;導覽欄與主題切換屬新設計(現況 FAIL 為預期破壞證據)。
        const geoSettings = () => page.evaluate(() => {
            const sp = document.querySelector('[data-testid=settings-page]');
            if (!sp) return null;
            const isScroller = el => { const o = getComputedStyle(el).overflowY; return o === 'auto' || o === 'scroll'; };
            const sc = [sp, ...sp.querySelectorAll('*')].find(isScroller) || sp;
            const scr = sc.getBoundingClientRect();
            const out = {
                rootScrollable: sp.scrollHeight > sp.clientHeight + 1,
                rootScrollH: sp.scrollHeight, rootClientH: sp.clientHeight,
                scrollerIsRoot: sc === sp,
                hScroll: sc.scrollWidth > sc.clientWidth + 1,
                scScrollW: sc.scrollWidth, scClientW: sc.clientWidth,
                hasNav: !!sp.querySelector('[data-testid=settings-nav]'),
                hasContent: !!sp.querySelector('[data-testid=settings-content]'),
                overflowing: [], researchGap: null, centerDiff: null, coverOverlap: null,
            };
            const scope = sp.querySelector('[data-testid=settings-content]') || sp;
            out.overflowing = [...scope.querySelectorAll('input,button,pre,img,label')]
                .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > scr.right + 1 || r.left < scr.left - 1); })
                .map(el => ((el.textContent || el.tagName).trim()).slice(0, 16));
            const rr = sp.querySelector('[data-testid=research-row]');
            if (rr && rr.parentElement) {
                const prev = rr.previousElementSibling;
                out.researchGap = prev ? Math.round(rr.getBoundingClientRect().top - prev.getBoundingClientRect().bottom) : null;
                const wr = rr.parentElement.getBoundingClientRect();
                out.centerDiff = Math.round(Math.abs((wr.left - scr.left) - (scr.right - wr.right)));
                const cover = rr.parentElement.querySelector('[class*="220px"]');
                const fields = cover && cover.nextElementSibling;
                if (cover && fields) {
                    const a = cover.getBoundingClientRect(), b = fields.getBoundingClientRect();
                    out.coverOverlap = a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1;
                }
            }
            return out;
        });
        const waitSel = sel => page.waitForSelector(sel, {timeout: 5000}).then(() => true).catch(() => false);

        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.setViewportSize({width: 900, height: 600});
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)

        let g = await geoSettings();
        check('設定頁 900×600 AI 模型頁 捲軸在內容區(根節點不滾動)', !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`, scrollerIsRoot: g.scrollerIsRoot}));
        check('設定頁 900×600 AI 模型頁 內容無水平捲軸', !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));

        await page.click('[data-testid=tab-platforms]');
        const plat900 = await waitSel('[data-testid=platform-preview]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        g = await geoSettings();
        check('設定頁 900×600 平台輸出頁 捲軸在內容區(根節點不滾動)', plat900 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 900×600 平台輸出頁 內容無水平捲軸', plat900 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));

        await page.click('[data-testid=tab-project]');
        const proj900 = await waitSel('[data-testid=research-row]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        g = await geoSettings();
        check('設定頁 900×600 作品頁 捲軸在內容區(根節點不滾動)', proj900 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 900×600 作品頁 內容無水平捲軸', proj900 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        check('作品頁 900×600 元素右緣不超出內容區', proj900 && !!g && g.overflowing.length === 0, JSON.stringify(g && g.overflowing));
        check('作品頁 900×600 研究記錄上方間距不重複疊加(≤40px)', proj900 && !!g && g.researchGap != null && g.researchGap <= 40,
            `gap=${g && g.researchGap}`);
        check('設定頁 900×600 內容置中(左右間距差 ≤16px)', proj900 && !!g && g.centerDiff != null && g.centerDiff <= 16,
            `diff=${g && g.centerDiff}`);
        check('作品頁 900×600 封面與欄位區不重疊', proj900 && !!g && g.coverOverlap === false, `overlap=${g && g.coverOverlap}`);

        // 左側導覽欄(新設計才有;現況 FAIL 屬預期破壞證據)
        const hasNav = !!(await page.$('[data-testid=settings-nav]'));
        let navSwitch = false;
        if (hasNav) {
            await page.click('[data-testid=tab-models]');
            const n1 = await waitSel('[data-testid=profile-url]');
            await page.click('[data-testid=tab-platforms]');
            const n2 = await waitSel('[data-testid=platform-preview]');
            await page.click('[data-testid=tab-project]');
            const n3 = await waitSel('[data-testid=research-row]');
            navSwitch = n1 && n2 && n3;
        }
        check('設定頁 900×600 左側導覽欄存在且切換三頁正常', hasNav && navSwitch, `nav=${hasNav} switch=${navSwitch}`);

        // 主題切換:導覽欄底部、任何頁面可用,且立即保存到設定(SetTheme)
        const themeVisible = await page.isVisible('button:has-text("白紙")');
        let themeOk = false;
        if (themeVisible) {
            await page.click('button:has-text("白紙")');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const lightHtml = await page.evaluate(() => document.documentElement.classList.contains('light'));
            const savedLight = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.theme).catch(() => null));
            await page.click('button:has-text("夜間書房")');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const darkHtml = await page.evaluate(() => document.documentElement.classList.contains('dark'));
            const savedDark = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.theme).catch(() => null));
            themeOk = lightHtml && savedLight === 'light' && darkHtml && savedDark === 'dark';
            check('設定頁 主題切換在任何頁面可用且會保存(白紙→夜間書房)', themeOk,
                JSON.stringify({lightHtml, savedLight, darkHtml, savedDark}));
        } else {
            check('設定頁 主題切換在任何頁面可用且會保存(白紙→夜間書房)', false, '作品頁看不到「白紙」按鈕');
        }

        // 截圖:900×600 三頁(現況圖另由一次性腳本拍攝;這裡只在新版面下拍)
        if (hasNav) {
            await shot('70-settings-project-900');
            await page.click('[data-testid=tab-models]');
            await waitSel('[data-testid=profile-url]');
            await shot('72-settings-models-900');
            await page.click('[data-testid=tab-platforms]');
            await waitSel('[data-testid=platform-preview]');
            await shot('74-settings-platforms-900');
        }

        // ===== 設定頁 640×672(半螢幕,SPEC §16 第 7 項 (c) + 返工):堆疊版面 =====
        // 三欄並排(導覽+清單+表單)會把表單壓到約 148px、模型輸入框剩 24px——
        // 無水平捲軸 ≠ 可用;lg 以下清單與表單必須上下堆疊,表單控制項可用寬度 ≥ 200px
        await page.setViewportSize({width: 640, height: 672});
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        await page.click('[data-testid=tab-models]');
        await waitSel('[data-testid=profile-url]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const stacked640 = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            const url = document.querySelector('[data-testid=profile-url]');
            // 可見的 input 與 select 觸發器(排除 Switch 之類的小控制項)
            const controls = [...c.querySelectorAll('input, button[role=combobox]')]
                .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                .map(el => { const r = el.getBoundingClientRect(); return {w: Math.round(r.width), t: (el.getAttribute('data-testid') || el.tagName)}; });
            // 堆疊驗證:找到含 lg:grid-cols 的外層 grid(清單+表單容器),lg 以下必須單欄(上下堆疊);
            // 注意 url.closest('div.grid') 會抓到 Field 的內層 grid(永遠 1 欄),必須往上找 lg:grid-cols
            let outer = url.parentElement;
            while (outer && !(outer.className || '').includes('lg:grid-cols')) outer = outer.parentElement;
            const cols = outer ? getComputedStyle(outer).gridTemplateColumns.split(' ').length : 0;
            return {sw: c.scrollWidth, cw: c.clientWidth, urlW: Math.round(url.getBoundingClientRect().width),
                    urlClientW: url.clientWidth, minControl: Math.min(...controls.map(x => x.w)), controls,
                    gridCols: cols};
        });
        check('設定頁 640×672 模型輸入框可用寬度 ≥ 200', stacked640.urlClientW >= 200, JSON.stringify(stacked640.urlClientW));
        check('設定頁 640×672 所有表單控制項可用寬度 ≥ 200', stacked640.minControl >= 200,
            JSON.stringify(stacked640.controls));
        check('設定頁 640×672 清單與表單上下堆疊(非三欄並排)', stacked640.gridCols === 1, `gridCols=${stacked640.gridCols}`);
        check('設定頁 640×672 AI 模型頁無水平捲軸', stacked640.sw <= stacked640.cw + 1, JSON.stringify(stacked640.sw));
        await shot('76-settings-models-640');
        await page.click('[data-testid=tab-platforms]');
        await waitSel('[data-testid=platform-preview]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const stacked640p = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            const controls = [...c.querySelectorAll('input, button[role=combobox]')]
                .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                .map(el => Math.round(el.getBoundingClientRect().width));
            // 下拉選單的值不被截斷到看不見:比較值文字自身 scrollWidth 與 clientWidth。
            // (返工:Hemingway — 此檢查原本停在 AI 模型頁,那頁沒有 button[role=combobox],
            //  truncSel 恆 0、永遠通過;下拉在平台輸出頁。值 span 是 inline,clientWidth 恆 0,
            //  暫時轉 inline-block 才量得到,量完還原)
            const sels = [...c.querySelectorAll('button[role=combobox]')].filter(el => el.getBoundingClientRect().width > 0);
            const truncSel = sels.filter(el => {
                const v = el.querySelector('span');
                if (!v) return false;
                const d = v.style.display;
                v.style.display = 'inline-block';
                const trunc = v.scrollWidth > v.clientWidth + 1;
                v.style.display = d;
                return trunc;
            }).length;
            return {sw: c.scrollWidth, cw: c.clientWidth, minControl: controls.length ? Math.min(...controls) : null,
                    selCount: sels.length, truncSel};
        });
        check('設定頁 640×672 平台輸出頁表單控制項可用寬度 ≥ 200', stacked640p.minControl >= 200, JSON.stringify(stacked640p));
        check('設定頁 640×672 平台輸出頁找得到下拉控制項(檢查不是空轉)', stacked640p.selCount >= 1, `selCount=${stacked640p.selCount}`);
        check('設定頁 640×672 平台輸出頁下拉選單值不被截斷', stacked640p.selCount >= 1 && stacked640p.truncSel === 0,
            `sel=${stacked640p.selCount} truncated=${stacked640p.truncSel}`);
        check('設定頁 640×672 平台輸出頁無水平捲軸', stacked640p.sw <= stacked640p.cw + 1, JSON.stringify(stacked640p));
        await shot('77-settings-platforms-640');

        // 1280×800:先回作品頁量測(兩種版面都用得上),再量模型/平台頁;1280(lg 以上)清單與表單回到並排
        await page.setViewportSize({width: 1280, height: 800});
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        await page.click('[data-testid=tab-project]');
        const proj1280 = await waitSel('[data-testid=research-row]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        g = await geoSettings();
        check('設定頁 1280×800 作品頁 捲軸在內容區(根節點不滾動)', proj1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 作品頁 內容無水平捲軸', proj1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        check('設定頁 1280×800 內容置中(左右間距差 ≤16px)', proj1280 && !!g && g.centerDiff != null && g.centerDiff <= 16,
            `diff=${g && g.centerDiff}`);
        if (hasNav) await shot('71-settings-project-1280');

        await page.click('[data-testid=tab-models], button:has-text("模型端點")'); // 現況無 tab-models,用文字
        const mod1280 = await waitSel('[data-testid=profile-url]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        g = await geoSettings();
        check('設定頁 1280×800 AI 模型頁 捲軸在內容區(根節點不滾動)', mod1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 AI 模型頁 內容無水平捲軸', mod1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        if (hasNav) await shot('73-settings-models-1280');

        await page.click('[data-testid=tab-platforms]');
        const plt1280 = await waitSel('[data-testid=platform-preview]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        g = await geoSettings();
        check('設定頁 1280×800 平台輸出頁 捲軸在內容區(根節點不滾動)', plt1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 平台輸出頁 內容無水平捲軸', plt1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        if (hasNav) await shot('75-settings-platforms-1280');

        // 還原:視窗與設定頁關閉(後續測試在 1440×900 進行)
        await page.setViewportSize({width: 1440, height: 900});
        await page.click('[data-testid=close-settings]');
    },
};
