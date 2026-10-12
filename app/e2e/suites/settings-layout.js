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

        // 左側導覽欄(新設計才有;現況 FAIL 屬預期破壞證據):四頁 — 作品/Perkins Bot/平台輸出/外觀
        const hasNav = !!(await page.$('[data-testid=settings-nav]'));
        let navSwitch = false;
        if (hasNav) {
            await page.click('[data-testid=tab-models]');
            const n1 = await waitSel('[data-testid=profile-list]');
            await page.click('[data-testid=tab-platforms]');
            const n2 = await waitSel('[data-testid=platform-preview]');
            await page.click('[data-testid=tab-project]');
            const n3 = await waitSel('[data-testid=research-row]');
            await page.click('[data-testid=tab-appearance]');
            const n4 = await waitSel('[data-testid=appearance-theme]');
            navSwitch = n1 && n2 && n3 && n4;
        }
        check('設定頁 900×600 左側導覽欄存在且切換四頁正常', hasNav && navSwitch, `nav=${hasNav} switch=${navSwitch}`);

        // 主題與稿紙版面搬到位於「外觀」頁(Issue #88):導覽欄底部不再放主題與稿紙版面
        await page.click('[data-testid=tab-project]');
        await waitSel('[data-testid=research-row]');
        const navNoTheme = !(await page.isVisible('button:has-text("白紙")')) && !(await page.isVisible('[data-testid=paper-width]'));
        check('設定頁 導覽欄底部不再放主題與稿紙版面(作品頁看不到了)', navNoTheme);
        await page.click('[data-testid=tab-appearance]');
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
            check('設定頁 外觀頁主題切換會保存(白紙→夜間書房)', themeOk,
                JSON.stringify({lightHtml, savedLight, darkHtml, savedDark}));
        } else {
            check('設定頁 外觀頁主題切換會保存(白紙→夜間書房)', false, '外觀頁看不到「白紙」主題卡');
        }

        // 截圖:900×600 四頁(現況圖另由一次性腳本拍攝;這裡只在新版面下拍)
        if (hasNav) {
            await shot('70-settings-project-900');
            await page.click('[data-testid=tab-models]');
            await waitSel('[data-testid=profile-list]');
            await shot('72-settings-models-900');
            await page.click('[data-testid=tab-platforms]');
            await waitSel('[data-testid=platform-preview]');
            await shot('74-settings-platforms-900');
            await page.click('[data-testid=tab-appearance]');
            await waitSel('[data-testid=appearance-theme]');
            await shot('78-settings-appearance-900');
        }

        // ===== 外觀頁(Issue #88):主題選擇卡、稿紙版面每項一列 =====
        await page.click('[data-testid=tab-appearance]');
        const app900 = await waitSel('[data-testid=appearance-theme]');
        await settle(80, 700);
        g = await geoSettings();
        check('設定頁 900×600 外觀頁 捲軸在內容區(根節點不滾動)', app900 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 900×600 外觀頁 內容無水平捲軸', app900 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        const paperControls = await page.evaluate(() => ['paper-width', 'paper-font-size', 'paper-gap']
            .map(t => { const el = document.querySelector(`[data-testid=${t}]`); return !!el; }));
        check('外觀頁 稿紙版面三項控制項齊全', paperControls.every(Boolean), JSON.stringify(paperControls));
        // 淺色外觀頁截圖(拍完還原夜間書房)
        await page.click('button:has-text("白紙")');
        await settle(80, 700);
        await shot('79-settings-appearance-900-light');
        await page.click('button:has-text("夜間書房")');
        await settle(80, 700);

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
            app.SaveProfile = (...a) => window.__origSaveProfile(...a).then(v => new Promise(res => setTimeout(() => res(v), 500)));
        });
        await page.fill('[data-testid=profile-name]', 'E2E 第一次儲存');
        await page.click('[data-testid=save-profile]');
        await page.fill('[data-testid=profile-name]', 'E2E 儲存期間的新輸入');
        await page.waitForFunction(id => window.go.main.App.GetSettings().then(s => (s.profiles.find(p => p.id === id) || {}).name === 'E2E 第一次儲存'), fresh[0] && fresh[0].id, {timeout: 5000}).catch(() => {});
        await settle(80, 700);
        const keptName = await page.inputValue('[data-testid=profile-name]');
        const stillDirty = !!(await page.$('[data-testid=profile-dirty]'));
        await page.evaluate(() => { window.go.main.App.SaveProfile = window.__origSaveProfile; });
        check('#95 儲存進行中的新輸入在回應後保留且仍標示未儲存', keptName === 'E2E 儲存期間的新輸入' && stillDirty, JSON.stringify({keptName, stillDirty}));
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
        await waitSel('[data-testid=appearance-theme]');
        await settle(80, 700); // 等 UI 更新
        const app640 = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            return {sw: c.scrollWidth, cw: c.clientWidth};
        });
        check('設定頁 640×672 外觀頁無水平捲軸', app640.sw <= app640.cw + 1, JSON.stringify(app640));
        await shot('78-settings-appearance-640');
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
        const mod1280 = await waitSel('[data-testid=profile-list]');
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

        await page.click('[data-testid=tab-appearance]');
        const app1280 = await waitSel('[data-testid=appearance-theme]');
        await settle(80, 700); // 等 UI 更新
        g = await geoSettings();
        check('設定頁 1280×800 外觀頁 捲軸在內容區(根節點不滾動)', app1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 外觀頁 內容無水平捲軸', app1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        if (hasNav) await shot('80-settings-appearance-1280');

        // 還原:視窗與設定頁關閉(後續測試在 1440×900 進行)
        await page.setViewportSize({width: 1440, height: 900});
        await page.click('[data-testid=close-settings]');
    },
};
