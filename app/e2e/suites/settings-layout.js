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
        // 關於頁(#175,SPEC §17.2):對外連結的倉庫位址與版本斷言
        const REPO_BASE = 'https://github.com/bext1998/PerkinsWritingSpace';
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
        const plat900 = await waitSel('[data-testid=platform-list]');
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

        // 左側導覽欄(新設計才有;現況 FAIL 屬預期破壞證據):四頁 — 作品/Perkins Bot/平台輸出/外觀
        const hasNav = !!(await page.$('[data-testid=settings-nav]'));
        let navSwitch = false;
        if (hasNav) {
            await page.click('[data-testid=tab-models]');
            const n1 = await waitSel('[data-testid=profile-list]');
            await page.click('[data-testid=tab-platforms]');
            const n2 = await waitSel('[data-testid=platform-list]');
            await page.click('[data-testid=tab-project]');
            const n3 = await waitSel('[data-testid=research-row]');
            await page.click('[data-testid=tab-appearance]');
            const n4 = await waitSel('[data-testid=appearance-visual]');
            navSwitch = n1 && n2 && n3 && n4;
        }
        check('設定頁 900×600 左側導覽欄存在且切換四頁正常', hasNav && navSwitch, `nav=${hasNav} switch=${navSwitch}`);

        // 主題與稿紙版面搬到位於「外觀」頁(Issue #88):導覽欄底部不再放主題與稿紙版面
        await page.click('[data-testid=tab-project]');
        await waitSel('[data-testid=research-row]');
        const navNoTheme = !(await page.isVisible('[data-testid=appearance-mode-system]')) && !(await page.isVisible('[data-testid=paper-width]'));
        check('設定頁 導覽欄底部不再放主題與稿紙版面(作品頁看不到了)', navNoTheme);
        // 換頁回到頂端(#28):作品頁捲到底再換頁,新頁不能沿用前一頁的捲動位置(標題會被切掉)
        const scrolledProject = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            c.scrollTop = c.scrollHeight;
            return c.scrollTop;
        });
        await page.click('[data-testid=tab-appearance]');
        await waitSel('[data-testid=appearance-visual]');
        const appearanceTop = await page.evaluate(() => document.querySelector('[data-testid=settings-content]').scrollTop);
        check('設定頁 換頁後內容回到頂端(不沿用前一頁的捲動位置)',
            scrolledProject > 0 && appearanceTop === 0, JSON.stringify({scrolledProject, appearanceTop}));
        // 切換模式 (Issue #118):分段按鈕切換,html class 跟著改,設定檔寫進 Appearance.Mode
        await page.click('[data-testid=appearance-mode-light]');
        await settle(80, 500);
        const lightHtml = await page.evaluate(() => document.documentElement.classList.contains('light'));
        const savedLight = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.appearance && s.appearance.mode).catch(() => null));
        await page.click('[data-testid=appearance-mode-dark]');
        await settle(80, 500);
        const darkHtml = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        const savedDark = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.appearance && s.appearance.mode).catch(() => null));
        const modeOk = lightHtml && savedLight === 'light' && darkHtml && savedDark === 'dark';
        check('設定頁 外觀頁模式切換會保存(淺色→深色)', modeOk,
            JSON.stringify({lightHtml, savedLight, darkHtml, savedDark}));

        // 切換主題預設檔(#118):主題下拉只列當前生效那一邊;切換會寫進 dark.preset / light.preset
        await page.click('[data-testid=appearance-preset-select]');
        await waitSel('[data-testid=appearance-preset-opt-graphite]');
        await page.click('[data-testid=appearance-preset-opt-graphite]');
        await settle(80, 500);
        const graphiteClass = await page.evaluate(() => document.documentElement.classList.contains('theme-graphite'));
        const savedGraphite = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.appearance && s.appearance.dark && s.appearance.dark.preset).catch(() => null));
        check('設定頁 外觀頁切換深色主題到深灰會寫入設定與套用 class', graphiteClass && savedGraphite === 'graphite',
            JSON.stringify({graphiteClass, savedGraphite}));
        // 換回深色夜間書房(進階的「重置為預設值」會更快):先進階展開 details,才能點到 reset
        await page.evaluate(() => { document.querySelector('[data-testid=appearance-advanced]')?.setAttribute('open', ''); });
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset-confirm]');
        await settle(80, 500);

        // 截圖:900×600 四頁(現況圖另由一次性腳本拍攝;這裡只在新版面下拍)
        if (hasNav) {
            await shot('70-settings-project-900');
            await page.click('[data-testid=tab-models]');
            await waitSel('[data-testid=profile-list]');
            await shot('72-settings-models-900');
            await page.click('[data-testid=tab-platforms]');
            await waitSel('[data-testid=platform-list]');
            await shot('74-settings-platforms-900');
            await page.click('[data-testid=tab-appearance]');
            await waitSel('[data-testid=appearance-visual]');
            await shot('78-settings-appearance-900');
        }

        // ===== 外觀頁(Issue #118):視覺風格/進階/稿紙版面 =====
        await page.click('[data-testid=tab-appearance]');
        const app900 = await waitSel('[data-testid=appearance-visual]');
        await settle(80, 700);
        g = await geoSettings();
        check('設定頁 900×600 外觀頁 捲軸在內容區(根節點不滾動)', app900 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 900×600 外觀頁 內容無水平捲軸', app900 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        const paperControls = await page.evaluate(() => ['paper-width', 'paper-font-size', 'paper-gap']
            .map(t => { const el = document.querySelector(`[data-testid=${t}]`); return !!el; }));
        check('外觀頁 稿紙版面三項控制項齊全', paperControls.every(Boolean), JSON.stringify(paperControls));
        // 視覺風格區塊的所有控制項在位
        const visualControls = await page.evaluate(() => ['appearance-mode-dark', 'appearance-mode-light', 'appearance-mode-system',
            'appearance-preset-select', 'appearance-accent-select',
            'appearance-background-picker', 'appearance-background-hex', 'appearance-foreground-picker', 'appearance-foreground-hex']
            .map(t => !!document.querySelector(`[data-testid=${t}]`)));
        check('外觀頁 視覺風格區塊九個控制項齊全', visualControls.every(Boolean), JSON.stringify(visualControls));
        // 淺色側:切到 light 模式、選「米白」主題、拍截圖,拍完還原
        await page.click('[data-testid=appearance-mode-light]');
        await settle(80, 500);
        await page.click('[data-testid=appearance-preset-select]');
        await waitSel('[data-testid=appearance-preset-opt-cream]');
        await page.click('[data-testid=appearance-preset-opt-cream]');
        await settle(80, 500);
        const creamClass = await page.evaluate(() => document.documentElement.classList.contains('theme-cream'));
        check('設定頁 淺色側切到米白主題(theme-cream class)', creamClass);
        await shot('79-settings-appearance-900-light');
        // 順手加一張米白+自訂背景(#118 重工截圖需求)
        await page.fill('[data-testid=appearance-background-hex]', '#f4e4bc');
        await page.keyboard.press('Tab');
        await settle(80, 500);
        await shot('82-appearance-cream-custom-bg');
        await page.click('[data-testid=appearance-background-clear]');
        await settle(80, 500);
        // 重置外觀回預設後回到深色夜間書房,後續步驟不受影響
        await page.evaluate(() => { document.querySelector('[data-testid=appearance-advanced]')?.setAttribute('open', ''); });
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset-confirm]');
        await settle(80, 500);

        // 自訂背景色(#118):html 的 --background 變數會跟著改變
        const bgBefore = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
        await page.fill('[data-testid=appearance-background-hex]', '#123456');
        // ColorField 用本地 draft,輸入後要失焦(Enter 或 Tab)才會提交到設定
        await page.keyboard.press('Tab');
        await settle(80, 500);
        const bgAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
        const savedBg = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.appearance && s.appearance.dark && s.appearance.dark.background).catch(() => null));
        check('設定頁 自訂背景色會改變 --background 並寫進設定', bgBefore !== bgAfter && savedBg === '#123456',
            JSON.stringify({bgBefore, bgAfter, savedBg}));
        // 清除按鈕回主題值
        await page.click('[data-testid=appearance-background-clear]');
        await settle(80, 500);
        const bgCleared = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
        // Go 用 omitempty,空值會被從 JSON 拿掉 → 前端讀到 undefined
        const savedCleared = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.appearance && s.appearance.dark && s.appearance.dark.background).catch(() => null));
        check('設定頁 自訂背景色清除後回到主題值', bgCleared === bgBefore && (savedCleared === '' || savedCleared == null),
            JSON.stringify({bgCleared, savedCleared}));

        // 重置為預設值的兩步確認(#118):先進階展開 details
        await page.evaluate(() => { document.querySelector('[data-testid=appearance-advanced]')?.setAttribute('open', ''); });
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset]');
        await settle(80, 300);
        const confirmVisible = await page.isVisible('[data-testid=appearance-reset-confirm]');
        check('設定頁 重置為預設值第一次按下顯示確認鈕', confirmVisible);
        await page.click('[data-testid=appearance-reset-confirm]');
        await settle(80, 500);
        const afterReset = await page.evaluate(async () => {
            const s = await window.go.main.App.GetSettings();
            const a = s.appearance;
            return {
                mode: a.mode, darkPreset: a.dark.preset, lightPreset: a.light.preset,
                darkBg: a.dark.background, lightBg: a.light.background,
                font: a.uiFontSize, motion: a.reduceMotion,
            };
        });
        // Go 用 omitempty,空值不寫進 JSON → 前端讀到 undefined 也算「重置」成功
        const resetOk = afterReset.mode === 'dark' && afterReset.darkPreset === 'study' && afterReset.lightPreset === 'paper'
            && (afterReset.darkBg === '' || afterReset.darkBg == null)
            && (afterReset.lightBg === '' || afterReset.lightBg == null)
            && afterReset.font === 'standard' && afterReset.motion === 'system';
        check('設定頁 重置為預設值後所有外觀項回到預設', resetOk, JSON.stringify(afterReset));

        // 重開設定頁後保留(#118):這次關掉再打開,設定不丟
        await page.click('[data-testid=appearance-mode-light]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-preset-select]');
        await waitSel('[data-testid=appearance-preset-opt-cream]');
        await page.click('[data-testid=appearance-preset-opt-cream]');
        await settle(80, 500);
        await page.click('[data-testid=close-settings]');
        await settle(80, 500);
        await page.click('[data-testid=open-settings]');
        await waitSel('[data-testid=settings-page]');
        await page.click('[data-testid=tab-appearance]');
        await waitSel('[data-testid=appearance-visual]');
        // 預期:mode=light、淺色側 preset=cream
        const reopened = await page.evaluate(async () => {
            const s = await window.go.main.App.GetSettings();
            return {mode: s.appearance.mode, lightPreset: s.appearance.light.preset};
        });
        const persisted = reopened.mode === 'light' && reopened.lightPreset === 'cream';
        check('設定頁 重開設定後外觀保留', persisted, JSON.stringify(reopened));
        // 還原預設,避免影響後面測試
        await page.evaluate(() => { document.querySelector('[data-testid=appearance-advanced]')?.setAttribute('open', ''); });
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset-confirm]');
        await settle(80, 500);

        // ===== #118 重工(第 1 輪):只改強調色不蓋掉深灰背景、手動逐字輸入 hex、系統模式隨 emulateMedia 切換、不合法值回錯 =====

        // 重工#1:深灰主題下,只改強調色為藍,背景仍是 theme-graphite 的「H S% L%」(不是夜間書房的)。
        await page.click('[data-testid=appearance-mode-dark]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-preset-select]');
        await waitSel('[data-testid=appearance-preset-opt-graphite]');
        await page.click('[data-testid=appearance-preset-opt-graphite]');
        await settle(80, 500);
        const bgGraphite = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
        const fgGraphite = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim());
        // 設強調色為藍(選第三個「藍」預設 = #4f8bcb)
        await page.click('[data-testid=appearance-accent-select]');
        await waitSel('[data-testid=appearance-accent-opt-blue]');
        await page.click('[data-testid=appearance-accent-opt-blue]');
        await settle(80, 500);
        const bgAfterAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
        const fgAfterAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim());
        const primaryAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
        check('#118 重工 深灰主題下只改強調色,背景/文字保留主題預設檔色調',
            bgAfterAccent === bgGraphite && fgAfterAccent === fgGraphite,
            JSON.stringify({bgGraphite, fgGraphite, bgAfterAccent, fgAfterAccent}));
        // primary 應該是藍色的 HSL(藍色的 hue ≈ 210;琥珀是 36)。
        check('#118 重工 只改強調色後 --primary 變成藍色', /^\s*2[0-9]{2}|^\s*21[0-9]/.test(primaryAfter) || primaryAfter.startsWith('209') || primaryAfter.startsWith('210') || primaryAfter.startsWith('207'),
            `primary=${primaryAfter}`);
        await shot('81-appearance-graphite-blue');

        // 重工#3:手動逐字輸入 hex:可逐個字打進來不被打回去,合法 #rrggbb 才儲存。
        await page.click('[data-testid=appearance-reset]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset-confirm]');
        await settle(80, 500);
        // 用 page.keyboard.type 逐字輸入(不是 fill);delay 讓每字間一點。先點擊確保焦點在輸入框。
        await page.click('[data-testid=appearance-background-hex]');
        await settle(80, 100);
        await page.keyboard.type('#1', {delay: 50});
        await settle(80, 200);
        await page.keyboard.type('23', {delay: 50});
        await settle(80, 200);
        await page.keyboard.type('456', {delay: 50});
        await settle(80, 200);
        // 到這裡已經合法(#123456),但還沒失焦不會儲存。Tab 出去推 onBlur:
        await page.keyboard.press('Tab');
        await settle(80, 500);
        const inputValue = await page.inputValue('[data-testid=appearance-background-hex]');
        const savedManual = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.appearance && s.appearance.dark && s.appearance.dark.background).catch(() => null));
        check('#118 重工 手動逐字輸入合法 hex 後保存', inputValue === '#123456' && savedManual === '#123456',
            JSON.stringify({inputValue, savedManual}));
        // 大寫:輸入大寫 hex 也接受並存小寫
        await page.fill('[data-testid=appearance-background-hex]', '#FFAABB');
        await page.keyboard.press('Tab');
        await settle(80, 500);
        const upperSaved = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.appearance && s.appearance.dark && s.appearance.dark.background).catch(() => null));
        check('#118 重工 大寫 hex 接受並存小寫', upperSaved === '#ffaabb', `saved=${upperSaved}`);

        // 重工#5:不合法值回錯 — 用 window.go.main.App.SetAppearance 直接送一個壞的(mode=auto),預期 Promise reject。
        await page.click('[data-testid=appearance-reset]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset-confirm]');
        await settle(80, 500);
        const badRes = await page.evaluate(() => window.go.main.App.SetAppearance({
            mode: 'auto', uiFontSize: 'standard', reduceMotion: 'system',
            dark: {preset: 'study'}, light: {preset: 'paper'},
        }).then(() => ({ok: true})).catch(e => ({ok: false, msg: String(e)})));
        check('#118 重工 不合法 mode 回錯(不是默默接受)', badRes.ok === false && /未知的模式|未知/.test(badRes.msg || ''),
            JSON.stringify(badRes));
        // 設定檔沒有被改寫
        const stillDefault = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.appearance && s.appearance.mode));
        check('#118 重工 不合法值被拒絕後設定不變', stillDefault === 'dark', `mode=${stillDefault}`);

        // 重工#2:system 模式隨 emulateMedia 切換。先設為 system,emulateMedia dark 應變深色、light 變淺色。
        await page.click('[data-testid=appearance-reset]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset-confirm]');
        await settle(80, 500);
        await page.click('[data-testid=appearance-mode-system]');
        await settle(80, 300);
        // 模擬 OS = 深色 → html 應有 .dark class
        await page.emulateMedia({colorScheme: 'dark'});
        await settle(80, 700);
        const onDark = await page.evaluate(() => document.documentElement.classList.contains('dark') && !document.documentElement.classList.contains('light'));
        await page.emulateMedia({colorScheme: 'light'});
        await settle(80, 700);
        const onLight = await page.evaluate(() => document.documentElement.classList.contains('light') && !document.documentElement.classList.contains('dark'));
        check('#118 重工 system 模式隨 emulateMedia 切換(dark→light)', onDark && onLight,
            JSON.stringify({onDark, onLight}));
        // 還原
        await page.emulateMedia({colorScheme: 'light'});
        await page.click('[data-testid=appearance-mode-dark]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset-confirm]');
        await settle(80, 500);

        // Orchestrator 審查:自訂文字色時,卡片/選單/次要文字等衍生 token 要真的套上;
        // 文字與背景都自訂後只清掉背景,背景要回到主題原值(不能沿用上一次自己蓋上的自訂色)
        const cssVar = name => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
        const bgPreset = await cssVar('--background');
        const typeHex = async (field, v) => {
            await page.fill(`[data-testid=appearance-${field}-hex]`, v);
            await page.keyboard.press('Tab');
            await settle(80, 500);
        };
        await typeHex('foreground', '#ffeecc');
        await typeHex('background', '#203040');
        const derived = {fg: await cssVar('--foreground'), cardFg: await cssVar('--card-foreground'), popFg: await cssVar('--popover-foreground')};
        check('外觀 自訂文字色會套到卡片與選單的文字色', derived.cardFg === derived.fg && derived.popFg === derived.fg, JSON.stringify(derived));
        await page.click('[data-testid=appearance-background-clear]');
        await settle(80, 500);
        const bgBack = await cssVar('--background');
        // 背景經 hex 來回換算後重新推算,允許取整誤差
        const nums = s => s.split(/\s+/).map(parseFloat);
        const near = (a, b) => nums(a).every((v, i) => Math.abs(v - nums(b)[i]) <= 2);
        check('外觀 文字仍自訂時清除背景,背景回到主題原值', near(bgBack, bgPreset), JSON.stringify({bgPreset, bgBack}));
        const resetAppearance = async () => {
            await page.click('[data-testid=appearance-reset]');
            await settle(80, 300);
            await page.click('[data-testid=appearance-reset-confirm]');
            await settle(80, 500);
        };
        await resetAppearance();

        // PR #121 審查 1:上一筆還沒存完就改別的欄位,兩筆都要保留(後一筆不得以舊物件蓋掉前一筆)。
        // 綁定在呼叫時才讀 window.go,包一層延遲模擬後端慢回應
        await page.evaluate(() => {
            const app = window.go.main.App;
            window.__origSetAppearance = app.SetAppearance;
            app.SetAppearance = a => new Promise(r => setTimeout(r, 800)).then(() => window.__origSetAppearance(a));
        });
        await page.fill('[data-testid=appearance-background-hex]', '#203040');
        await page.click('[data-testid=appearance-mode-light]'); // 點擊讓 hex 框失焦觸發第一筆,緊接第二筆
        await page.waitForTimeout(2500); // 兩筆各延遲 800ms、依序寫入
        await page.evaluate(() => { window.go.main.App.SetAppearance = window.__origSetAppearance; });
        const both = await page.evaluate(() => window.go.main.App.GetSettings().then(s => ({mode: s.appearance.mode, darkBg: s.appearance.dark.background})));
        check('#121 存檔未完成就切模式:背景與模式都保留', both.mode === 'light' && both.darkBg === '#203040', JSON.stringify(both));
        await resetAppearance();

        // PR #121 重審:第一筆寫入失敗時,之後的變更不得讓畫面與設定檔錯開(再改第三欄也不能蓋掉已存的值)
        await page.evaluate(() => {
            const app = window.go.main.App;
            let n = 0;
            app.SetAppearance = a => new Promise(r => setTimeout(r, 800))
                .then(() => (n++ === 0 ? Promise.reject('模擬寫入失敗') : window.__origSetAppearance(a)));
        });
        await page.fill('[data-testid=appearance-background-hex]', '#203040');
        await page.click('[data-testid=appearance-mode-light]');
        await page.waitForTimeout(2500);
        const errShown = await page.isVisible('[data-testid=appearance-save-error]');
        await page.evaluate(() => { window.go.main.App.SetAppearance = window.__origSetAppearance; });
        await page.evaluate(() => { document.querySelector('[data-testid=appearance-advanced]')?.setAttribute('open', ''); });
        await page.click('[data-testid=appearance-font-size]').catch(() => {});
        const fontOpt = await page.waitForSelector('[data-testid=appearance-font-size-opt-large]', {timeout: 2000}).then(() => true).catch(() => false);
        if (fontOpt) await page.click('[data-testid=appearance-font-size-opt-large]');
        await page.waitForTimeout(1000);
        const consistent = await page.evaluate(async () => {
            const a = (await window.go.main.App.GetSettings()).appearance;
            const uiMode = document.documentElement.classList.contains('light') ? 'light' : 'dark';
            const uiBg = document.querySelector('[data-testid=appearance-background-hex]')?.value ?? null;
            return {diskMode: a.mode, uiMode, diskBg: a[uiMode].background || '', uiBg, font: a.uiFontSize};
        });
        check('#121 第一筆寫入失敗:顯示錯誤,之後畫面與設定檔一致',
            errShown && fontOpt && consistent.font === 'large' && consistent.diskMode === consistent.uiMode && consistent.diskBg === consistent.uiBg,
            JSON.stringify({errShown, fontOpt, ...consistent}));
        await resetAppearance();

        // PR #121 審查 3:內建綠色強調色的按鈕文字要選深色(白字對比不到 3:1)
        await page.click('[data-testid=appearance-accent-select]');
        await waitSel('[data-testid=appearance-accent-opt-green]');
        await page.click('[data-testid=appearance-accent-opt-green]');
        await settle(80, 500);
        const pfg = nums(await cssVar('--primary-foreground'));
        check('#121 綠色強調色的按鈕文字為深色', pfg[2] < 30, pfg.join(' '));
        await resetAppearance();

        // PR #121 審查 4:換主題後對比警告依新主題的背景重新判斷(白紙 4.54:1 不警告,米白 4.11:1 警告)
        await page.click('[data-testid=appearance-mode-light]');
        await settle(80, 300);
        await typeHex('foreground', '#727272');
        const warnPaper = await page.isVisible('[data-testid=contrast-warn]');
        await page.click('[data-testid=appearance-preset-select]');
        await waitSel('[data-testid=appearance-preset-opt-cream]');
        await page.click('[data-testid=appearance-preset-opt-cream]');
        await settle(80, 500);
        const warnCream = await page.isVisible('[data-testid=contrast-warn]');
        check('#121 換成米白後對比警告依新背景出現', !warnPaper && warnCream, JSON.stringify({warnPaper, warnCream}));
        await page.click('[data-testid=appearance-mode-dark]');
        await settle(80, 300);
        await resetAppearance();

        // ===== #120 轉場:減少動態效果關閉時有進場動畫;開啟時轉場歸零,但 AI 改動標示維持時長、改為不漸變 =====
        const setMotion = async v => {
            await page.evaluate(() => { document.querySelector('[data-testid=appearance-advanced]')?.setAttribute('open', ''); });
            await page.click('[data-testid=appearance-reduce-motion]');
            await waitSel(`[data-testid=appearance-reduce-motion-opt-${v}]`);
            await page.click(`[data-testid=appearance-reduce-motion-opt-${v}]`);
            await settle(80, 500);
        };
        // 轉場元素與資訊性標示的 computed animation(標示用臨時元素量測,與編輯器同一組 CSS 規則)
        const motionState = () => page.evaluate(() => {
            const dur = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el).animationDuration : null; };
            const probe = cls => {
                const el = document.createElement('span'); el.className = cls; document.body.appendChild(el);
                const cs = getComputedStyle(el); const r = {dur: cs.animationDuration, fn: cs.animationTimingFunction};
                el.remove(); return r;
            };
            return {settings: dur('[data-testid=settings-page]'), body: dur('[data-testid=settings-page-body]'),
                ai: probe('cm-ai-flash'), jump: probe('cm-flash')};
        });
        await setMotion('off');
        const mOff = await motionState();
        check('#120 減少動態效果關閉:設定頁與頁面內容有進場動畫(約 200ms)', mOff.settings === '0.2s' && mOff.body === '0.2s', JSON.stringify(mOff));
        check('#120 減少動態效果關閉:AI 改動標示照常 3 秒漸變', mOff.ai.dur === '3s' && !mOff.ai.fn.startsWith('steps'), JSON.stringify(mOff.ai));
        await setMotion('on');
        const mOn = await motionState();
        check('#120 減少動態效果開啟:轉場歸零', mOn.settings === '0s' && mOn.body === '0s', JSON.stringify(mOn));
        check('#120 減少動態效果開啟:AI 改動標示與跳行閃爍維持原時長、不漸變',
            mOn.ai.dur === '3s' && mOn.ai.fn.startsWith('steps') && mOn.jump.dur === '1.2s' && mOn.jump.fn.startsWith('steps'), JSON.stringify(mOn));
        await page.click('[data-testid=appearance-reset]');
        await settle(80, 300);
        await page.click('[data-testid=appearance-reset-confirm]');
        await settle(80, 500);

        // ===== Perkins Bot 頁(Issue #38):從預設新增端點、思考強度、作者指示 AGENTS.md =====
        await page.click('[data-testid=tab-models]');
        await waitSel('[data-testid=profile-list]');
        // #95:清單頁只列端點(「›」進子頁),不在清單頁攤開編輯表單,也沒有第二條側欄式按鈕
        const listOnly = await page.evaluate(() => ({
            list: !!document.querySelector('[data-testid=profile-list]'),
            form: !!document.querySelector('[data-testid=profile-url]'),
            agentsInline: !!document.querySelector('[data-testid=agents-global-text]'),
        }));
        check('#95 Perkins Bot 頁清單頁只列端點與作者指示入口(表單在子頁)', listOnly.list && !listOnly.form && !listOnly.agentsInline, JSON.stringify(listOnly));
        // 從預設新增(#43):帶入名稱、網址、Provider;金鑰欄空白讓作者填
        const ids0 = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.profiles.map(p => p.id)));
        await page.click('[data-testid=preset-select]');
        await page.waitForSelector('[data-testid=preset-opt-anthropic]');
        await page.click('[data-testid=preset-opt-anthropic]');
        // 等表單帶入預設值(切換到新端點後 profile-url 會是預設檔的網址),避免讀到上一個端點的表單
        await page.waitForFunction(() => (document.querySelector('[data-testid=profile-url]') || {}).value === 'https://api.anthropic.com/v1', null, {timeout: 5000});
        const added = await page.evaluate(async () => {
            const s = await window.go.main.App.GetSettings();
            return s.profiles.map(p => ({id: p.id, name: p.name, baseUrl: p.baseUrl, provider: p.provider, model: p.model, hasKey: p.hasKey}));
        });
        const fresh = added.filter(p => !ids0.includes(p.id));
        const presetOK = fresh.length === 1 && fresh[0].baseUrl === 'https://api.anthropic.com/v1' && fresh[0].provider === 'anthropic' && !fresh[0].hasKey;
        check('從預設新增端點帶入名稱、網址與 Provider(金鑰留空)', presetOK, JSON.stringify(fresh));
        const formProvider = (await page.textContent('[data-testid=provider-select]') || '').trim();
        check('從預設新增後表單顯示 Anthropic 原生', formProvider.includes('Anthropic 原生'), formProvider);
        // 思考強度選項依 Provider 變化(#30):Anthropic 原生有 更高/最高,保存後寫入設定
        await page.click('[data-testid=effort-select]');
        await page.waitForSelector('[data-testid=effort-opt-xhigh]', {timeout: 3000}).catch(() => {});
        const effortAnthropic = !!(await page.$('[data-testid=effort-opt-xhigh]')) && !!(await page.$('[data-testid=effort-opt-max]'));
        await page.click('[data-testid=effort-opt-xhigh]');
        await page.click('[data-testid=save-profile]');
        const savedEffort = await page.evaluate(async (id) => {
            // 輪詢設定讀回(等寫入完成),逾時回最後讀到的值讓斷言自己 FAIL
            const read = async () => {
                const s = await window.go.main.App.GetSettings();
                const p = s.profiles.find(x => x.id === id);
                return p && {provider: p.provider, reasoningEffort: p.reasoningEffort};
            };
            for (let i = 0; i < 25; i++) {
                const cur = await read();
                if (cur && cur.reasoningEffort === 'xhigh') return cur;
                await new Promise(r => setTimeout(r, 200));
            }
            return read();
        }, fresh[0] && fresh[0].id);
        check('思考強度選項依 Provider 變化(Anthropic 有 更高/最高)', effortAnthropic);
        check('思考強度保存後寫入設定(xhigh)', !!savedEffort && savedEffort.reasoningEffort === 'xhigh', JSON.stringify(savedEffort));
        // #95 審查返工(Hemingway):子頁「只有按儲存才寫入」與離開保護
        // (a) 網址改了沒儲存:載入清單停用(不偷存表單),設定檔仍是原網址
        await page.fill('[data-testid=profile-url]', 'http://localhost:9/v1');
        const loadDisabled = await page.isDisabled('[data-testid=load-models]');
        const urlOnDisk = await page.evaluate(id => window.go.main.App.GetSettings().then(s => (s.profiles.find(p => p.id === id) || {}).baseUrl), fresh[0] && fresh[0].id);
        check('#95 網址未儲存時載入清單停用,設定檔不被偷存', loadDisabled && urlOnDisk === 'https://api.anthropic.com/v1', JSON.stringify({loadDisabled, urlOnDisk}));
        // (b) 點目前所在的導覽頁不觸發提醒、留在子頁;之後關閉設定頁仍會提醒(未儲存狀態沒被清掉)
        await page.click('[data-testid=tab-models]');
        const noPrompt = !(await page.$('[data-testid=unsaved-leave]')) && !!(await page.$('[data-testid=profile-page]'));
        await page.click('[data-testid=close-settings]');
        const prompted = await page.waitForSelector('[data-testid=unsaved-leave]', {timeout: 3000}).then(() => true).catch(() => false);
        if (prompted) await page.click('[data-testid=unsaved-stay]');
        check('#95 點目前導覽頁不清掉未儲存狀態,關閉設定頁仍會提醒', noPrompt && prompted, JSON.stringify({noPrompt, prompted}));
        await page.fill('[data-testid=profile-url]', 'https://api.anthropic.com/v1');
        // (c) 名稱清空後儲存:後端補成網址,表單同步,不殘留「未儲存」
        await page.fill('[data-testid=profile-name]', '');
        await page.click('[data-testid=save-profile]');
        await page.waitForFunction(() => (document.querySelector('[data-testid=profile-name]') || {}).value === 'https://api.anthropic.com/v1', null, {timeout: 5000}).catch(() => {});
        const nameSynced = await page.inputValue('[data-testid=profile-name]');
        const dirtyAfter = !!(await page.$('[data-testid=profile-dirty]'));
        check('#95 空白名稱儲存後表單與後端同步,不殘留未儲存', nameSynced === 'https://api.anthropic.com/v1' && !dirtyAfter, JSON.stringify({nameSynced, dirtyAfter}));
        // (d) 儲存請求進行中繼續改名稱:回應回來後保留新輸入、仍標示未儲存(以延遲回應的 SaveProfile 控制時序)
        await page.evaluate(() => {
            const app = window.go.main.App;
            window.__origSaveProfile = app.SaveProfile;
            // 後端照常寫入,回應延後 500ms 才交回前端(模擬回應比作者的新輸入晚到)
            window.__saveDone = false;
            app.SaveProfile = (...a) => window.__origSaveProfile(...a).then(v => new Promise(res => setTimeout(() => res(v), 500)))
                .finally(() => setTimeout(() => { window.__saveDone = true; }, 50));
        });
        await page.fill('[data-testid=profile-name]', 'E2E 第一次儲存');
        await page.click('[data-testid=save-profile]');
        await page.fill('[data-testid=profile-name]', 'E2E 儲存期間的新輸入');
        // 等延遲的回應交回前端(waitForFunction 的條件必須同步回傳布林值,回傳 Promise 會被當成已成立)
        const responded = await page.waitForFunction(() => window.__saveDone === true, null, {timeout: 5000}).then(() => true).catch(() => false);
        await settle(80, 700);
        const keptName = await page.inputValue('[data-testid=profile-name]');
        const stillDirty = !!(await page.$('[data-testid=profile-dirty]'));
        await page.evaluate(() => { window.go.main.App.SaveProfile = window.__origSaveProfile; });
        check('#95 儲存進行中的新輸入在回應後保留且仍標示未儲存', responded && keptName === 'E2E 儲存期間的新輸入' && stillDirty, JSON.stringify({responded, keptName, stillDirty}));
        // 換回 OpenAI 相容:不合法的值(xhigh)重設為不指定
        await page.click('[data-testid=provider-select]');
        await page.waitForSelector('[data-testid=provider-opt-openai]');
        await page.click('[data-testid=provider-opt-openai]');
        const effortReset = ((await page.textContent('[data-testid=effort-select]') || '').trim()).includes('不指定');
        check('切換 Provider 時不合法的思考強度重設為不指定', effortReset);
        // #95 刪除在子頁標題列、兩步確認:第一次按只出現後果說明,端點仍在;按確認才刪除並回到清單(同時清理暫時端點)
        let delOK = false, delDetail = '';
        if (fresh.length === 1) {
            await page.click('[data-testid=delete-profile]');
            await page.waitForSelector('[data-testid=delete-profile-confirm]', {timeout: 3000}).catch(() => {});
            const stillThere = await page.evaluate(id => window.go.main.App.GetSettings().then(s => s.profiles.some(p => p.id === id)), fresh[0].id);
            await page.click('[data-testid=delete-profile-yes]');
            await page.waitForSelector('[data-testid=profile-list]', {timeout: 5000}).catch(() => {});
            const gone = await page.evaluate(id => window.go.main.App.GetSettings().then(s => !s.profiles.some(p => p.id === id)), fresh[0].id);
            const backToList = !!(await page.$('[data-testid=profile-list]'));
            delOK = stillThere && gone && backToList;
            delDetail = JSON.stringify({stillThere, gone, backToList});
            if (!gone) await page.evaluate(id => window.go.main.App.DeleteProfile(id), fresh[0].id);
        }
        check('#95 刪除端點要先確認(第一次按不刪),確認後刪除並回到清單', delOK, delDetail);

        // 作者指示(AGENTS.md)編輯(Issue #38):作品層編輯儲存後寫入磁碟
        const agFile = path.join(PROJ, 'AGENTS.md');
        const agText = 'E2E 作者指示:提到森林時稱「紫斑蝶E2E森林」。';
        await page.click('[data-testid=agents-row-project]');
        await waitSel('[data-testid=agents-project-text]');
        const agVisible = !!(await page.$('[data-testid=agents-project]'));
        await page.fill('[data-testid=agents-project-text]', agText);
        await page.click('[data-testid=agents-project-save]');
        await page.waitForSelector('[data-testid=agents-project] >> text=已儲存', {timeout: 5000}); // 等寫檔完成(限本編輯區的訊息)
        const onDisk = fs.existsSync(agFile) ? fs.readFileSync(agFile, 'utf8') : '(不存在)';
        check('AGENTS.md 編輯儲存後寫入磁碟', agVisible && onDisk === agText, JSON.stringify(onDisk));
        await page.waitForFunction(() => /約\s*[1-9]/.test(document.querySelector('[data-testid=agents-project-tokens]')?.textContent || ''), null, {timeout: 5000}).catch(() => {});
        const agTokens = (await page.textContent('[data-testid=agents-project-tokens]') || '').trim();
        check('作者指示顯示估算長度與上限', /約\s*[1-9]\d*\s*\/\s*4000/.test(agTokens), agTokens);
        // #95 離開保護:改了沒儲存就按返回,先提醒且留在子頁、檔案不變;選「捨棄並離開」才回清單
        await page.fill('[data-testid=agents-project-text]', agText + '(未儲存)');
        await page.click('[data-testid=subpage-back]');
        const warned = await page.waitForSelector('[data-testid=unsaved-leave]', {timeout: 3000}).then(() => true).catch(() => false);
        const stayed = !!(await page.$('[data-testid=agents-project-text]'));
        await page.click('[data-testid=unsaved-discard]');
        const leftToList = await waitSel('[data-testid=profile-list]');
        const diskAfter = fs.existsSync(agFile) ? fs.readFileSync(agFile, 'utf8') : '(不存在)';
        check('#95 子頁有未儲存變更時返回會先提醒,捨棄後才離開且不寫檔', warned && stayed && leftToList && diskAfter === agText,
            JSON.stringify({warned, stayed, leftToList, diskAfter}));
        // 全域層入口也要在(不寫入作者的真實全域檔)
        check('作者指示顯示全域層編輯區與路徑', !!(await page.$('[data-testid=agents-row-global]')) &&
            (await page.textContent('[data-testid=agents-row-global]') || '').includes('AGENTS.md'));
        fs.rmSync(agFile, {force: true}); // 清理:不留給後面的組

        // PR #122 審查:清單 ↔ 作者指示子頁要換掉整個容器,進場動畫才會重播(同一個 div 沿用時不會)
        const markRoot = () => page.evaluate(() => { document.querySelector('[data-testid=settings-page-body]').lastElementChild.__m = 1; });
        const rootMarked = () => page.evaluate(() => document.querySelector('[data-testid=settings-page-body]').lastElementChild.__m === 1);
        await markRoot();
        await page.click('[data-testid=agents-row-global]');
        await waitSel('[data-testid=agents-page]');
        const subNew = !(await rootMarked());
        await markRoot();
        await page.click('[data-testid=subpage-back]');
        await waitSel('[data-testid=profile-list]');
        const listNew = !(await rootMarked());
        check('#122 進出作者指示子頁會換掉容器(轉場重播)', subNew && listNew, JSON.stringify({subNew, listNew}));

        // ===== 設定頁 640×672(半螢幕,SPEC §16 第 7 項 (c) + 返工):堆疊版面 =====
        // 三欄並排(導覽+清單+表單)會把表單壓到約 148px、模型輸入框剩 24px——
        // 無水平捲軸 ≠ 可用;lg 以下清單與表單必須上下堆疊,表單控制項可用寬度 ≥ 200px
        await page.setViewportSize({width: 640, height: 672});
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        await page.click('[data-testid=tab-models]');
        await waitSel('[data-testid=profile-list]');
        await settle(80, 700);
        const list640 = await page.evaluate(() => { const c = document.querySelector('[data-testid=settings-content]'); return {sw: c.scrollWidth, cw: c.clientWidth}; });
        check('#95 設定頁 640×672 端點清單頁無水平捲軸', list640.sw <= list640.cw + 1, JSON.stringify(list640));
        await shot('76-settings-models-640');
        await page.click('[data-testid=profile-list] button');
        await waitSel('[data-testid=profile-url]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const stacked640 = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            const url = document.querySelector('[data-testid=profile-url]');
            // 可見的 input 與 select 觸發器(排除 Switch 之類的小控制項)
            const controls = [...c.querySelectorAll('input, button[role=combobox]')]
                .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                .map(el => { const r = el.getBoundingClientRect(); return {w: Math.round(r.width), t: (el.getAttribute('data-testid') || el.tagName)}; });
            // #95:端點表單在子頁、佔滿內容寬(清單與表單不並排擠壓);網址欄至少佔內容寬 70%
            return {sw: c.scrollWidth, cw: c.clientWidth, urlW: Math.round(url.getBoundingClientRect().width),
                    urlClientW: url.clientWidth, minControl: Math.min(...controls.map(x => x.w)), controls,
                    urlRatio: url.getBoundingClientRect().width / c.clientWidth};
        });
        check('設定頁 640×672 模型輸入框可用寬度 ≥ 200', stacked640.urlClientW >= 200, JSON.stringify(stacked640.urlClientW));
        check('設定頁 640×672 所有表單控制項可用寬度 ≥ 200', stacked640.minControl >= 200,
            JSON.stringify(stacked640.controls));
        check('設定頁 640×672 端點子頁表單滿寬(清單與表單不並排)', stacked640.urlRatio >= 0.7, `urlRatio=${stacked640.urlRatio}`);
        check('設定頁 640×672 AI 模型頁無水平捲軸', stacked640.sw <= stacked640.cw + 1, JSON.stringify(stacked640.sw));
        await shot('76b-settings-profile-640');
        await page.click('[data-testid=tab-appearance]');
        await waitSel("[data-testid=appearance-visual]");
        await settle(80, 700); // 等 UI 更新
        const app640 = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            return {sw: c.scrollWidth, cw: c.clientWidth};
        });
        check('設定頁 640×672 外觀頁無水平捲軸', app640.sw <= app640.cw + 1, JSON.stringify(app640));
        await shot('78-settings-appearance-640');
        await page.click('[data-testid=tab-platforms]');
        const platList640 = await waitSel('[data-testid=platform-list]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        // 清單+子頁(#95 延續):清單頁不攤開規則表單與預覽(沒有 platform-preview)
        const platListOnly = await page.evaluate(() => ({
            list: !!document.querySelector('[data-testid=platform-list]'),
            preview: !!document.querySelector('[data-testid=platform-preview]'),
        }));
        check('平台輸出清單頁只列平台(規則表單與預覽在子頁)', platList640 && platListOnly.list && !platListOnly.preview,
            JSON.stringify(platListOnly));
        await shot('77-settings-platforms-640');
        // 恢復內建預設是破壞性操作,兩步確認(UI_GUIDE §7):第一次按不變更設定;
        // 第二步不真的執行(以免影響後續測試),按「取消」離開確認
        const platBefore = await page.evaluate(() => window.go.main.App.GetSettings().then(s => JSON.stringify(s.platforms)));
        await page.click('[data-testid=reset-platforms]');
        const resetConfirm = await page.waitForSelector('[data-testid=reset-platforms-confirm]', {timeout: 3000}).then(() => true).catch(() => false);
        const platDuring = await page.evaluate(() => window.go.main.App.GetSettings().then(s => JSON.stringify(s.platforms)));
        await page.click('[data-testid=reset-platforms-cancel]');
        const platAfterCancel = await page.evaluate(() => window.go.main.App.GetSettings().then(s => JSON.stringify(s.platforms)));
        check('恢復內建預設要兩步確認(第一次按不變更設定)', resetConfirm && platDuring === platBefore && platAfterCancel === platBefore,
            JSON.stringify({resetConfirm, changedFirst: platDuring !== platBefore, changedCancel: platAfterCancel !== platBefore}));
        // 新增平台:直接進子頁;不儲存、捨棄離開後,清單與設定檔都沒有新平台
        const idsBeforeAdd = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.platforms.map(p => p.id).sort().join(',')));
        await page.click('[data-testid=add-platform]');
        const addInSub = await page.waitForSelector('[data-testid=platform-name]', {timeout: 5000}).then(() => true).catch(() => false);
        const addDirty = !!(await page.$('[data-testid=platform-dirty]'));
        await page.click('[data-testid=subpage-back]');
        const addWarned = await page.waitForSelector('[data-testid=unsaved-leave]', {timeout: 3000}).then(() => true).catch(() => false);
        await page.click('[data-testid=unsaved-discard]');
        const addBackToList = await waitSel('[data-testid=platform-list]');
        const idsAfterAdd = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.platforms.map(p => p.id).sort().join(',')));
        // 清單上的平台 id 與新增前相同(沒有留下未儲存的新平台)
        const listIdsAfter = await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid^=platform-card-]')].map(el => (el.getAttribute('data-testid') || '').slice('platform-card-'.length)).sort().join(','));
        check('新增平台直接進子頁,未儲存捨棄離開後不出現在清單與設定檔',
            addInSub && addDirty && addWarned && addBackToList && idsAfterAdd === idsBeforeAdd && listIdsAfter === idsBeforeAdd,
            JSON.stringify({addInSub, addDirty, addWarned, addBackToList, sameIds: idsAfterAdd === idsBeforeAdd, sameList: listIdsAfter === idsBeforeAdd}));
        // 640×672 平台頁量測改在進入第一個平台的子頁後:控制項寬度、下拉值不截斷、無水平捲軸
        const firstPlat = await page.evaluate(() => window.go.main.App.GetSettings().then(s => ({id: (s.platforms[0] || {}).id, name: (s.platforms[0] || {}).name})));
        await page.click(`[data-testid=platform-card-${firstPlat.id}]`);
        await waitSel('[data-testid=platform-preview]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const stacked640p = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            const controls = [...c.querySelectorAll('input, button[role=combobox]')]
                .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                .map(el => Math.round(el.getBoundingClientRect().width));
            // 下拉選單的值不被截斷到看不見:比較值文字自身 scrollWidth 與 clientWidth。
            // (返工:Hemingway — 此檢查原本停在 AI 模型頁,那頁沒有 button[role=combobox],
            //  truncSel 恆 0、永遠通過;下拉在平台子頁。值 span 是 inline,clientWidth 恆 0,
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
        check('設定頁 640×672 平台子頁表單控制項可用寬度 ≥ 200', stacked640p.minControl >= 200, JSON.stringify(stacked640p));
        check('設定頁 640×672 平台子頁找得到下拉控制項(檢查不是空轉)', stacked640p.selCount >= 1, `selCount=${stacked640p.selCount}`);
        check('設定頁 640×672 平台子頁下拉選單值不被截斷', stacked640p.selCount >= 1 && stacked640p.truncSel === 0,
            `sel=${stacked640p.selCount} truncated=${stacked640p.truncSel}`);
        check('設定頁 640×672 平台子頁無水平捲軸', stacked640p.sw <= stacked640p.cw + 1, JSON.stringify(stacked640p));
        await shot('77b-settings-platform-sub-640');
        // 離開保護(#95 延續):子頁改名沒儲存按返回 → 提醒且留在子頁;捨棄後回清單,設定檔名稱沒變
        await page.fill('[data-testid=platform-name]', 'E2E 未儲存改名');
        await page.click('[data-testid=subpage-back]');
        const platWarned = await page.waitForSelector('[data-testid=unsaved-leave]', {timeout: 3000}).then(() => true).catch(() => false);
        const platStayed = !!(await page.$('[data-testid=platform-preview]'));
        await page.click('[data-testid=unsaved-discard]');
        const platLeftToList = await waitSel('[data-testid=platform-list]');
        const platNameAfter = await page.evaluate(() => window.go.main.App.GetSettings().then(s => (s.platforms[0] || {}).name));
        check('平台子頁改名未儲存按返回會先提醒,捨棄後設定檔名稱不變',
            platWarned && platStayed && platLeftToList && platNameAfter === firstPlat.name,
            JSON.stringify({platWarned, platStayed, platLeftToList, before: firstPlat.name, after: platNameAfter}));

        // PR #110 審查(Hemingway):平台清單由後端整份覆寫。儲存 A 的回應還沒回來就離開(返回子頁,或切到別的導覽頁再切回)、
        // 刪除 B,不得以舊清單把 A 剛儲存的內容蓋回去,A 的遲到回應也不得讓 B 在畫面上復活(以延遲回應的 SavePlatforms 控制時序)
        const pendingSaveThenDelete = async (leave) => {
            const fullPlats = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.platforms));
            const [pa, pb] = fullPlats;
            await page.evaluate(() => {
                const app = window.go.main.App;
                window.__origSP = app.SavePlatforms;
                window.__spDone = 0;
                app.SavePlatforms = (...a) => window.__origSP(...a).then(v => new Promise(res => setTimeout(() => res(v), 1500)))
                    .finally(() => { window.__spDone++; });
            });
            await page.click(`[data-testid=platform-card-${pa.id}]`);
            await waitSel('[data-testid=platform-name]');
            await page.fill('[data-testid=platform-name]', pa.name + 'E2E');
            await page.click('[data-testid=save-platform]');
            await page.click(leave === 'back' ? '[data-testid=subpage-back]' : '[data-testid=tab-appearance]');
            if (await page.waitForSelector('[data-testid=unsaved-leave]', {timeout: 1000}).then(() => true).catch(() => false)) {
                await page.click('[data-testid=unsaved-discard]');
            }
            if (leave === 'nav') {
                await waitSel("[data-testid=appearance-visual]");
                await page.click('[data-testid=tab-platforms]');
            }
            await waitSel(`[data-testid=platform-card-${pb.id}]`);
            await page.click(`[data-testid=platform-card-${pb.id}]`);
            await page.click('[data-testid=delete-platform]');
            await page.click('[data-testid=delete-platform-yes]');
            const spSettled = await page.waitForFunction(() => window.__spDone >= 2, null, {timeout: 10000}).then(() => true).catch(() => false);
            await settle(80, 900);
            const plAfter = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.platforms.map(p => ({id: p.id, name: p.name}))));
            const plCards = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=platform-card-]')].map(e => e.getAttribute('data-testid')));
            await page.evaluate(() => { window.go.main.App.SavePlatforms = window.__origSP; });
            const aKept = plAfter.some(p => p.id === pa.id && p.name === pa.name + 'E2E');
            const bGone = !plAfter.some(p => p.id === pb.id) && !plCards.includes(`platform-card-${pb.id}`);
            // 還原平台清單(後面的檢查與組沿用原本的平台),切頁讓畫面重讀
            await page.evaluate(ps => window.go.main.App.SavePlatforms(ps), fullPlats);
            await page.click('[data-testid=tab-appearance]');
            await page.click('[data-testid=tab-platforms]');
            await waitSel('[data-testid=platform-list]');
            return {spSettled, aKept, bGone, plAfter: plAfter.map(p => p.name), plCards};
        };
        const pdBack = await pendingSaveThenDelete('back');
        check('#110 儲存回應未到就返回並刪除另一平台:剛儲存的內容保留,刪掉的不會復活', pdBack.spSettled && pdBack.aKept && pdBack.bGone, JSON.stringify(pdBack));
        const pdNav = await pendingSaveThenDelete('nav');
        check('#110 儲存回應未到就切換導覽頁再回來刪除另一平台:剛儲存的內容保留,刪掉的不會復活', pdNav.spSettled && pdNav.aKept && pdNav.bGone, JSON.stringify(pdNav));

        // 1280×800:先回作品頁量測(兩種版面都用得上),再量模型/平台頁;平台頁與 640 同一套清單+子頁版型
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
        const mod1280 = await waitSel('[data-testid=profile-list]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        g = await geoSettings();
        check('設定頁 1280×800 AI 模型頁 捲軸在內容區(根節點不滾動)', mod1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 AI 模型頁 內容無水平捲軸', mod1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        if (hasNav) await shot('73-settings-models-1280');

        await page.click('[data-testid=tab-platforms]');
        const plt1280 = await waitSel('[data-testid=platform-list]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        g = await geoSettings();
        check('設定頁 1280×800 平台輸出頁 捲軸在內容區(根節點不滾動)', plt1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 平台輸出頁 內容無水平捲軸', plt1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        if (hasNav) await shot('75-settings-platforms-1280');

        await page.click('[data-testid=tab-appearance]');
        const app1280 = await waitSel("[data-testid=appearance-visual]");
        await settle(80, 700); // 等 UI 更新
        g = await geoSettings();
        check('設定頁 1280×800 外觀頁 捲軸在內容區(根節點不滾動)', app1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 外觀頁 內容無水平捲軸', app1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        if (hasNav) await shot('80-settings-appearance-1280');

        // #155:浮層沒有離場動畫、按 Esc 會立刻卸載;設定頁的 Esc 不能因此把「關選單的那一下」也當成關設定頁。
        await page.click('[data-testid=appearance-preset-select]');
        const listOpen = await page.waitForSelector('[role=listbox]', {timeout: 3000}).then(() => true, () => false);
        await page.keyboard.press('Escape');
        await settle(80, 400);
        const afterEsc = await page.evaluate(() => ({list: !!document.querySelector('[role=listbox]'), settings: !!document.querySelector('[data-testid=settings-page]')}));
        check('#155 設定頁開著下拉時按 Esc 只關下拉,設定頁仍在', listOpen && !afterEsc.list && afterEsc.settings, JSON.stringify({listOpen, ...afterEsc}));

        // ===== 關於頁(#175,SPEC §17.2):導覽項目、內容、對外連結與 BrowserOpenURL =====
        await page.click('[data-testid=tab-about]');
        const about1280 = await waitSel('[data-testid=about-info]');
        await settle(80, 700); // 等 AppVersion 綁定回應與渲染
        const aboutState = await page.evaluate(() => {
            const txt = (sel) => { const e = document.querySelector(sel); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : null; };
            return {
                title: txt('[data-testid=settings-page-title]'),
                name: txt('[data-testid=about-name]'),
                version: txt('[data-testid=about-version]'),
                license: txt('[data-testid=about-license]'),
                support: txt('[data-testid=about-support-text]'),
                navLabels: [...document.querySelectorAll('[data-testid=settings-nav] button')].map(b => (b.textContent || '').trim()),
                links: [...document.querySelectorAll('[data-testid^=about-link-]')].map(b => ({
                    testid: b.getAttribute('data-testid'),
                    tag: b.tagName,
                    text: (b.textContent || '').trim().replace(/\s+/g, ' '),
                })),
            };
        });
        check('設定頁有「關於」導覽項目(tab-about)', !!about1280 && aboutState.navLabels.includes('關於'), JSON.stringify(aboutState.navLabels));
        check('關於頁標題與名稱、授權正確',
            aboutState.title === '關於' && aboutState.name === 'Perkins WritingSpace' && aboutState.license === 'MIT License',
            JSON.stringify({title: aboutState.title, name: aboutState.name, license: aboutState.license}));
        // 版本依 #174 的規則:E2E 必須能斷言(開發版為「開發版 (未注入版本資訊)」,正式建置為 semver + 提交編號)
        check('關於頁顯示完整版本(AppVersion 有值,不是空字串或換行)',
            !!aboutState.version && /開發版|\d+\.\d+\.\d+/.test(aboutState.version), JSON.stringify(aboutState.version));
        // 支援範圍文字照 SPEC/工單原文,不得改寫(工單「文字照抄」)
        const SUPPORT_TEXT = '市面上絕大多數大型語言模型都支援,但不保證 agent 的輔助效果。目前只驗證過注音輸入法可以正常輸入,其他輸入法待驗證。';
        check('關於頁顯示支援範圍原文(模型與輸入法驗證狀態)',
            aboutState.support === SUPPORT_TEXT, JSON.stringify(aboutState.support));
        check('關於頁三個對外連結都在頁面文字中顯示網址且整列可點',
            aboutState.links.length === 3 && aboutState.links.every(l => l.tag === 'BUTTON') &&
            aboutState.links[0].text.includes(REPO_BASE) && !aboutState.links[0].text.includes('/issues') &&
            aboutState.links[1].text.includes(`${REPO_BASE}/issues`) &&
            aboutState.links[2].text.includes(`${REPO_BASE}/releases`),
            JSON.stringify(aboutState.links.map(l => `${l.testid}:${l.text}`)));
        await shot('85-settings-about-1280-dark');
        // 「支援範圍」是關於頁最後一個區塊,1280×800 要捲動才看得到:捲到該區塊再補一張截圖(#195 審查)
        await page.evaluate(() => document.querySelector('[data-testid=about-support]')?.scrollIntoView({behavior: 'instant', block: 'end'}));
        await settle(80, 700);
        const supportState = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            const s = document.querySelector('[data-testid=about-support]');
            const t = document.querySelector('[data-testid=about-support-text]');
            if (!c || !s || !t) return null;
            const cr = c.getBoundingClientRect(), sr = s.getBoundingClientRect(), tr = t.getBoundingClientRect();
            return {shown: sr.top >= cr.top - 1 && sr.bottom <= cr.bottom + 1 && sr.height > 0 &&
                    tr.top >= cr.top - 1 && tr.bottom <= cr.bottom + 1 && tr.height > 0,
                    scrollTop: c.scrollTop, supportTop: Math.round(sr.top), supportBottom: Math.round(sr.bottom),
                    clientH: c.clientHeight};
        });
        check('關於頁 1280×800 捲動後「支援範圍」與文字完整可見(截圖有拍到底部)',
            !!supportState && supportState.shown, JSON.stringify(supportState));
        await shot('85b-settings-about-1280-support');
        // 捲回頂端:後面與連結檢查相關的截圖從頁首開始
        await page.evaluate(() => { const c = document.querySelector('[data-testid=settings-content]'); c.scrollTop = 0; });
        await settle(80, 400);

        // 對外連結要用系統瀏覽器開啟,不能在 WebView 內導航。把 window.runtime.BrowserOpenURL 換成記錄器
        // (其他 runtime 方法一律轉傳真的 runtime),所以不會打開真的瀏覽器,又能斷言有呼叫到。
        const proxyInstalled = await page.evaluate(() => {
            const real = window.runtime;
            if (!real || typeof real.BrowserOpenURL !== 'function') return false;
            window.__realRuntime = real;
            window.__opened = [];
            window.__runtimeProxy = new Proxy(real, {
                get(t, k) {
                    if (k === 'BrowserOpenURL') return (u) => { window.__opened.push(u); };
                    const v = Reflect.get(t, k);
                    return typeof v === 'function' ? v.bind(t) : v;
                },
                set() { return true; },
            });
            window.runtime = window.__runtimeProxy;
            return true;
        });
        const urlBefore = page.url();
        for (const tid of ['about-link-github', 'about-link-issues', 'about-link-releases']) {
            await page.click(`[data-testid=${tid}]`);
        }
        await settle(80, 900);
        const afterLinks = await page.evaluate(() => ({
            opened: window.__opened || [],
            settings: !!document.querySelector('[data-testid=settings-page]'),
            title: (document.querySelector('[data-testid=settings-page-title]') || {}).textContent,
            version: (document.querySelector('[data-testid=about-version]') || {}).textContent,
        }));
        await page.evaluate(() => { if (window.__realRuntime) window.runtime = window.__realRuntime; });
        const urlsOk = afterLinks.opened.length === 3
            && afterLinks.opened[0] === REPO_BASE
            && afterLinks.opened[1] === `${REPO_BASE}/issues`
            && afterLinks.opened[2] === `${REPO_BASE}/releases`;
        check('關於頁三個連結都經 BrowserOpenURL 交給系統瀏覽器開啟(未開啟瀏覽器、未在 WebView 內導航)',
            proxyInstalled && urlsOk && page.url() === urlBefore && afterLinks.settings && (afterLinks.title || '').trim() === '關於'
            && (afterLinks.version || '').trim() === (aboutState.version || '').trim(),
            JSON.stringify({proxyInstalled, opened: afterLinks.opened, moved: page.url() !== urlBefore,
                            settings: afterLinks.settings, title: afterLinks.title}));

        // 淺色主題截圖(拍完還原成深色,不留下狀態)
        await page.click('[data-testid=tab-appearance]');
        await waitSel('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-light]');
        await settle(80, 500);
        await page.click('[data-testid=tab-about]');
        await waitSel('[data-testid=about-info]');
        await settle(900);
        const aboutLight = await page.evaluate(() => document.documentElement.classList.contains('light'));
        check('關於頁在淺色主題下可見(模式切到淺色)', aboutLight, JSON.stringify(aboutLight));
        await shot('85c-settings-about-1280-light');
        await page.click('[data-testid=tab-appearance]');
        await waitSel('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-dark]');
        await settle(80, 500);
        await page.click('[data-testid=tab-about]');
        await waitSel('[data-testid=about-info]');

        // 900×600(SPEC §17.2 驗收:五頁都要在 900×600 與 1280×800 通過;「關於」頁原本只量 1280 與 640)
        // (量完的尺寸由下一個 640 段落自己設回去)
        await page.setViewportSize({width: 900, height: 600});
        await settle(80, 900); // 等 UI 更新
        const about900 = await waitSel('[data-testid=about-info]');
        await settle(80, 700); // 等版本列與版面穩定
        g = await geoSettings();
        check('關於頁 900×600 捲軸在內容區(根節點不滾動)', about900 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('關於頁 900×600 內容無水平捲軸', about900 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        check('關於頁 900×600 元素右緣不超出內容區', about900 && !!g && g.overflowing.length === 0, JSON.stringify(g && g.overflowing));

        // 640×672:窄寬度下不得出現水平捲軸(UI_GUIDE §13 最小宽度 640)
        await page.setViewportSize({width: 640, height: 672});
        await settle(80, 900); // 等 UI 更新
        const about640 = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            const links = [...document.querySelectorAll('[data-testid^=about-link-]')]
                .map(b => Math.round(b.getBoundingClientRect().width));
            return {sw: c.scrollWidth, cw: c.clientWidth, links, rootScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth};
        });
        check('關於頁 640×672 無水平捲軸', about640.sw <= about640.cw + 1 && !about640.rootScroll, JSON.stringify(about640));
        check('關於頁 640×672 連結列仍看得見(不超出內容寬)', about640.links.length === 3 && about640.links.every(w => w > 0 && w <= about640.cw),
            JSON.stringify(about640.links));
        await shot('85d-settings-about-640-dark');
        // 640 淺色主題：由外觀頁切換模式再回到關於頁（導覽欄與內容都必須仍可用）
        await page.click('[data-testid=tab-appearance]');
        await waitSel('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-light]');
        await settle(900); // 等顏色轉場完成(DOM quiet 不等過轉場)
        await page.click('[data-testid=tab-about]');
        await waitSel('[data-testid=about-info]');
        await settle(900);
        const about640Light = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            const links = [...document.querySelectorAll('[data-testid^=about-link-]')]
                .map(b => Math.round(b.getBoundingClientRect().width));
            return {sw: c.scrollWidth, cw: c.clientWidth, links, rootScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth};
        });
        check('關於頁 640×672 淺色主題也不出現水平捲軸',
            about640Light.sw <= about640Light.cw + 1 && !about640Light.rootScroll && about640Light.links.length === 3 && about640Light.links.every(w => w > 0 && w <= about640Light.cw),
            JSON.stringify(about640Light));
        await shot('85e-settings-about-640-light');
        await page.click('[data-testid=tab-appearance]');
        await waitSel('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-dark]');
        await settle(80, 500);

        // 還原:視窗與設定頁關閉(後續測試在 1440×900 進行)
        await page.setViewportSize({width: 1440, height: 900});
        await page.click('[data-testid=close-settings]');
    },
};
