// bible — 設定集別名、資料夾樹、寫法檢查
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'bible',
    desc: '設定集別名、資料夾樹、寫法檢查',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, projectCard, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // 設定集:補別名 → 索引更新
        await page.click('[data-testid=rail-bible]');
        await page.waitForSelector('[data-testid=entity-row]');
        check('設定集面板列出實體', (await page.$$('[data-testid=entity-row]')).length === 2);
        await page.click('[data-testid=entity-row]:has-text("雷恩")');
        await page.waitForSelector('[data-testid=entity-aliases]');
        await page.fill('[data-testid=entity-aliases]', '隊長、雷');
        await page.click('[data-testid=entity-apply]');
        await page.waitForSelector('.cm-content:has-text("aliases")', {timeout: 5000});
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(800);
        const ren = read('canon/雷恩.md');
        check('設定欄位寫入 frontmatter 且保留本文', ren.includes('aliases:') && ren.includes('隊長') && ren.includes('# 雷恩') && ren.includes('隊長。'), JSON.stringify(ren));
        const ap = await page.$('[data-testid=appearances]') ? await page.textContent('[data-testid=appearances]') : '';
        check('設定的登場索引列出章節', ap.includes('第一章'));
        await shot('07-bible');

        // ===== 設定集側欄資料夾檔案樹(#31 第一步,SPEC §12.2):fixture 自建自清 =====
        // 子資料夾(人物/組織)、無 frontmatter 一檔多人物、別名搜尋、超長檔名(640 寬)
        const tw = (rel, s) => { const f = P(rel); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, s); };
        const tdel = rel => { try { fs.unlinkSync(P(rel)); } catch {} };
        const LONG = '這是一個非常長的設定檔名用來驗證窄寬度下側欄不會產生水平捲軸';
        tw('canon/人物/主要角色.md', '# 主要角色\n\n一檔多人物:艾莉絲、雷恩都在這一檔裡。\n');
        tw(`canon/人物/${LONG}.md`, '# 長檔名\n\n窄寬度檢視用。\n');
        tw('canon/組織/夜鶯團.md', '---\ntype: 勢力\nname: 夜鶯團\naliases: [小夜]\n---\n\n# 夜鶯團\n\n地下組織。\n');
        // #100:非內建 type(舊的自訂分類)照常顯示與保留,Perkins 不改寫
        const LEGACY = '---\ntype: 組織\nname: 白塔會\n---\n\n# 白塔會\n';
        tw('canon/組織/白塔會.md', LEGACY);
        // fs 建檔後讓前端重讀 tree 與索引(設定頁開關,同健康檢查段)
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]', {timeout: 5000});
        await page.click('[data-testid=close-settings]');
        await settle(80, 700);
        await ensureProject(null, 'bible');

        const treeWait = sel => page.waitForSelector(sel, {timeout: 5000}).then(() => true).catch(() => false);
        // 資料夾列的容器含其子層(子資料夾與檔案列)
        const folderHas = (folder, file) => page.evaluate(({folder, file}) => {
            const btn = document.querySelector(`[data-testid=canon-folder][data-folder="${folder}"]`);
            return !!btn && [...(btn.parentElement?.querySelectorAll('[data-testid=entity-row]') ?? [])]
                .some(r => r.getAttribute('data-file') === file);
        }, {folder, file});
        const visibleFiles = () => page.$$eval('[data-testid=entity-row]', els => els.map(e => e.getAttribute('data-file')));
        const visibleFolders = () => page.$$eval('[data-testid=canon-folder]', els => els.map(e => e.getAttribute('data-folder')));

        // 子資料夾內的檔案顯示在對應資料夾下(根層檔案不混進去)
        const dPeople = await treeWait('[data-testid=canon-folder][data-folder="canon/人物"]');
        const dOrg = await treeWait('[data-testid=canon-folder][data-folder="canon/組織"]');
        const inPeople = await folderHas('canon/人物', 'canon/人物/主要角色.md');
        const inOrg = await folderHas('canon/組織', 'canon/組織/夜鶯團.md');
        const rootOutside = await page.evaluate(() => {
            const btn = document.querySelector('[data-testid=canon-folder][data-folder="canon/人物"]');
            const inFolder = !!btn && [...btn.parentElement.querySelectorAll('[data-testid=entity-row]')]
                .some(r => r.getAttribute('data-file') === 'canon/雷恩.md');
            return !inFolder && !!document.querySelector('[data-testid=entity-row][data-file="canon/雷恩.md"]');
        });
        check('設定集樹 子資料夾的檔案顯示在對應資料夾下', dPeople && dOrg && inPeople && inOrg && rootOutside,
            JSON.stringify({dPeople, dOrg, inPeople, inOrg, rootOutside}));

        // 資料夾收合隱藏子檔案、再展開恢復(根層檔案不受影響)
        await page.click('[data-testid=canon-folder][data-folder="canon/人物"]');
        await settle(80, 600);
        const collapsedHidden = !(await page.$('[data-testid=entity-row][data-file="canon/人物/主要角色.md"]'))
            && !(await page.$(`[data-testid=entity-row][data-file="canon/人物/${LONG}.md"]`))
            && !!(await page.$('[data-testid=entity-row][data-file="canon/雷恩.md"]'));
        await page.click('[data-testid=canon-folder][data-folder="canon/人物"]');
        await settle(80, 600);
        const expandedBack = !!(await page.$('[data-testid=entity-row][data-file="canon/人物/主要角色.md"]'));
        check('設定集樹 資料夾收合隱藏子檔案、再展開恢復', collapsedHidden && expandedBack, JSON.stringify({collapsedHidden, expandedBack}));

        // 搜尋檔名:只剩符合的檔案與其上層資料夾
        await page.fill('[data-testid=canon-search]', '主要角');
        await settle(80, 600);
        const sNameRows = await visibleFiles();
        const sNameDirs = await visibleFolders();
        check('設定集樹 搜尋檔名只顯示符合項與上層資料夾',
            sNameRows.length === 1 && sNameRows[0] === 'canon/人物/主要角色.md'
            && sNameDirs.length === 1 && sNameDirs[0] === 'canon/人物',
            JSON.stringify({rows: sNameRows, dirs: sNameDirs}));
        // 搜尋別名:同上(夜鶯團的別名 小夜)
        await page.fill('[data-testid=canon-search]', '小夜');
        await settle(80, 600);
        const sAliasRows = await visibleFiles();
        const sAliasDirs = await visibleFolders();
        check('設定集樹 搜尋別名只顯示符合項與上層資料夾',
            sAliasRows.length === 1 && sAliasRows[0] === 'canon/組織/夜鶯團.md'
            && sAliasDirs.length === 1 && sAliasDirs[0] === 'canon/組織',
            JSON.stringify({rows: sAliasRows, dirs: sAliasDirs}));
        await page.fill('[data-testid=canon-search]', '');
        await settle(80, 600);

        // 無 frontmatter 的檔可開啟(名稱 = 檔名,SPEC §12.2)
        await page.click('[data-testid=entity-row][data-file="canon/人物/主要角色.md"]');
        const noFmOpen = await page.waitForFunction(() =>
            !!document.querySelector('.cm-content')
            && (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('主要角色'),
            null, {timeout: 10000}).then(() => true).catch(() => false);
        await page.waitForSelector('[data-testid=entity-aliases]', {timeout: 5000}).catch(() => {});
        // EntityHeader 由 ParseEntity 非同步更新:等提示裡的名稱真的換掉,不是讀到上一檔的殘值
        const noFmNameOk = await page.waitForFunction(() =>
            (document.querySelector('[data-testid=entity-aliases]')?.getAttribute('placeholder') ?? '').includes('「主要角色」'),
            null, {timeout: 5000}).then(() => true).catch(() => false);
        check('設定集樹 無 frontmatter 的檔可開啟(名稱 = 檔名)', noFmOpen && noFmNameOk, JSON.stringify({noFmOpen, noFmNameOk}));

        // 640 寬無水平捲軸(超長檔名靠截斷收在列內)
        await page.setViewportSize({width: 640, height: 672});
        await settle(80, 800);
        const wide = await page.evaluate(() => {
            const pageOK = document.documentElement.scrollWidth <= document.documentElement.clientWidth;
            const tree = document.querySelector('[data-testid=canon-tree]');
            const treeOK = !tree || tree.scrollWidth <= tree.clientWidth + 1;
            const rowsOK = [...document.querySelectorAll('[data-testid=entity-row]')].every(r => r.scrollWidth <= r.clientWidth + 1);
            return {pageOK, treeOK, rowsOK, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth};
        });
        check('設定集樹 640 寬側欄無水平捲軸(超長檔名截斷)', wide.pageOK && wide.treeOK && wide.rowsOK, JSON.stringify(wide));
        await page.setViewportSize({width: 1440, height: 900});
        await settle(80, 600);

        // 截圖:深/淺主題含子資料夾的設定集側欄(結束還原原主題)
        const theme0 = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.appearance && s.appearance.mode).catch(() => 'dark'));
        const setTheme = async mode => {
            await page.click('[data-testid=open-settings]');
            await page.waitForSelector('[data-testid=settings-page]', {timeout: 5000});
            await page.click('[data-testid=tab-appearance]');
            await page.waitForSelector('[data-testid=appearance-visual]');
            await page.click(`[data-testid=appearance-mode-${mode}]`);
            await page.click('[data-testid=close-settings]');
            await settle(80, 700);
        };
        await setTheme('dark');
        await shot('32-canon-tree-dark');
        await setTheme('light');
        // 舊檔的 type 等欄位(Perkins 已不使用)開檔不改寫,別名照常顯示(SPEC §12.2)
        await page.click('[data-testid=entity-row][data-file="canon/組織/夜鶯團.md"]');
        const legacyAlias = await page.waitForFunction(() =>
            document.querySelector('[data-testid=entity-aliases]')?.value === '小夜',
            null, {timeout: 5000}).then(() => true).catch(() => false);
        await page.click('[data-testid=entity-row][data-file="canon/組織/白塔會.md"]');
        await settle(80, 700);
        check('舊檔 type 開檔不改寫、別名照常顯示', legacyAlias && fs.readFileSync(P('canon/組織/白塔會.md'), 'utf8') === LEGACY);

        await shot('33-canon-tree-light');
        await setTheme(theme0 === 'light' ? 'light' : 'dark');

        // 清掉專用檔(不留痕跡給後面的測試組),並用設定頁開關讓前端重讀 tree 與索引
        tdel('canon/人物/主要角色.md');
        tdel(`canon/人物/${LONG}.md`);
        tdel('canon/組織/夜鶯團.md');
        tdel('canon/組織/白塔會.md');
        try { fs.rmdirSync(P('canon/人物')); } catch {}
        try { fs.rmdirSync(P('canon/組織')); } catch {}
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]', {timeout: 5000});
        await page.click('[data-testid=close-settings]');
        await page.waitForSelector('[data-testid=entity-row][data-file="canon/人物/主要角色.md"]', {state: 'detached', timeout: 5000}).catch(() => {});
        check('設定集樹 測試檔已清掉(不留痕跡給後面的測試組)',
            !fs.existsSync(P('canon/人物')) && !fs.existsSync(P('canon/組織')) && !(await page.$('[data-testid=canon-folder]')));

        // ===== 設定檔就是純 Markdown(SPEC §12.2):沒有分類、名稱 = 檔名,Perkins 只寫作者填的別名 =====
        check('設定集側欄沒有「管理分類」入口', !(await page.$('[data-testid=manage-categories]')));
        await page.click('[data-testid=new-entity]');
        check('新增設定對話框沒有分類欄', !(await page.$('[role=dialog] [data-testid=entity-type]')));
        await page.fill('#ename', '測試賽馬');
        await page.click('[role=dialog] button[type=submit]');
        await page.waitForSelector('[data-testid=entity-aliases]', {timeout: 5000});
        await settle(80, 700);
        check('新增設定只有標題、沒有 frontmatter', read('canon/測試賽馬.md') === '# 測試賽馬\n', JSON.stringify(read('canon/測試賽馬.md')));
        check('設定檔上方沒有分類與名稱欄', !(await page.$('[data-testid=entity-header-type]')) && !(await page.$('[data-testid=entity-name]')));
        // 填別名 → 只多一行 aliases;清空 → 回到純 Markdown
        await page.fill('[data-testid=entity-aliases]', '小賽、賽賽');
        await page.click('[data-testid=entity-apply]');
        await page.waitForSelector('.cm-content:has-text("aliases")', {timeout: 5000});
        await page.keyboard.press('Control+s');
        await settle(80, 900);
        const horse = read('canon/測試賽馬.md');
        // EntityHeader 由 ParseEntity(防抖 200ms)跟上新內容後「套用」才會消失;先等它同步,免得下一步的輸入被同步蓋回
        await page.waitForSelector('[data-testid=entity-apply]', {state: 'detached', timeout: 5000});
        check('別名只寫一行 aliases', horse === '---\naliases: [小賽, 賽賽]\n---\n# 測試賽馬\n', JSON.stringify(horse));
        await page.fill('[data-testid=entity-aliases]', '');
        await page.click('[data-testid=entity-apply]');
        await page.waitForFunction(() => !document.querySelector('.cm-content')?.textContent.includes('aliases'), null, {timeout: 5000}).catch(() => {});
        await page.keyboard.press('Control+s');
        await settle(80, 900);
        check('清空別名回到純 Markdown', read('canon/測試賽馬.md') === '# 測試賽馬\n', JSON.stringify(read('canon/測試賽馬.md')));
        await page.fill('[data-testid=entity-aliases]', '小賽');
        await shot('34-entity-aliases-only');
        tdel('canon/測試賽馬.md');
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]', {timeout: 5000});
        await page.click('[data-testid=close-settings]');
        await page.waitForSelector('[data-testid=entity-row][data-file="canon/測試賽馬.md"]', {state: 'detached', timeout: 5000}).catch(() => {});

        // 寫法檢查
        await page.click('[data-testid=rail-checks]');
        await page.click('[data-testid=run-variants]');
        await page.waitForSelector('[data-testid=variant]', {timeout: 5000});
        const vs = await page.$$eval('[data-testid=variant]', els => els.map(e => e.textContent));
        check('B3 寫法檢查抓到「艾麗絲」', vs.some(t => t.includes('艾麗絲') && t.includes('艾莉絲')), JSON.stringify(vs));

        // ===== 作品健康檢查(#41,SPEC §0 第 4 條):只在按下時檢查、只報告不修改 =====
        // 專用檔:壞 frontmatter、孤兒摘要、過期摘要、斷連結,以及只含外部/錨點/編碼路徑/程式碼區塊的對照檔(不得誤報)。
        // 測完把專用檔修好/刪除,並用設定頁開關讓前端重讀 tree 與索引,不把痕跡留給後面的測試組。
        const hw = (rel, s) => { const f = P(rel); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, s); };
        const hdel = rel => { try { fs.unlinkSync(P(rel)); } catch {} };
        const hGroup = async c => {
            const sel = `[data-testid=health-group][data-check=${c}]`;
            return (await page.$(sel)) ? (await page.textContent(sel)) : '';
        };
        const hWait = (sel, timeout = 5000) => page.waitForSelector(sel, {timeout}).then(() => true).catch(() => false);
        const hOpenPanel = async () => { if (!(await page.$('[data-testid=run-health]'))) await page.click('[data-testid=rail-checks]'); };
        const hRun = async () => { await page.click('[data-testid=run-health]'); return hWait('[data-testid=health-report]'); };

        await ctx.ensureProject('第一章', 'manuscript');
        await hOpenPanel();
        check('#41 開啟作品不會自動檢查(要按下按鈕才有結果)', !(await page.$('[data-testid=health-report]')));
        // 壞 frontmatter:YAML 解析失敗(bible.Parse 會靜默退回其他/檔名)
        hw('canon/健康壞檔.md', '---\ntype: 角色\nname: [未關閉\n---\n\n# 健康壞檔\n');
        // 孤兒摘要:source 指向不存在的章節
        hw('summaries/孤兒摘要.md', '---\nsource: manuscript/已經不存在.md\nsourceHash: deadbeef\nupdated: 2026-10-10T00:00:00+08:00\n---\n\n孤兒摘要。\n');
        // 過期摘要:章節與 sourceHash 對不上
        hw('summaries/第一章.md', '---\nsource: manuscript/第一章.md\nsourceHash: deadbeef\nupdated: 2026-10-10T00:00:00+08:00\n---\n\n過期摘要。\n');
        // 斷連結(另含程式碼區塊裡的假連結)
        hw('notes/健康連結.md', '# 健康連結\n\n[第一章](../manuscript/第一章.md)\n[斷連結](不存在檔.md)\n\n```\n[程式碼區塊](也不存在.md)\n```\n');
        // 不得誤報的對照檔:外部、mailto、錨點、URL 編碼後存在的路徑
        hw('notes/健康外部連結.md', '# 外部連結\n\n[網站](https://example.com/a.md)\n[信](mailto:a@example.com)\n[錨點](#頂點)\n[編碼](../canon/%E8%89%BE%E8%8E%89%E7%B5%B2.md)\n');

        const ran = await hRun();
        check('#41 按下「開始檢查」後出現結果', ran);
        const fmTxt = await hGroup('frontmatter');
        check('#41 frontmatter 無法解析:列出壞檔與錯誤訊息', fmTxt.includes('canon/健康壞檔.md') && fmTxt.includes('無法解析'), fmTxt);
        const orphTxt = await hGroup('orphan-summary');
        check('#41 孤兒摘要:列出摘要與不存在的章節', orphTxt.includes('summaries/孤兒摘要.md') && orphTxt.includes('manuscript/已經不存在.md'), orphTxt);
        const staleTxt = await hGroup('stale-summary');
        check('#41 摘要可能過期:列出過期摘要', staleTxt.includes('summaries/第一章.md'), staleTxt);
        const linkTxt = await hGroup('broken-link');
        check('#41 斷連結:列出連結所在檔與不存在的目標', linkTxt.includes('notes/健康連結.md') && linkTxt.includes('notes/不存在檔.md'), linkTxt);
        check('#41 外部連結、錨點、編碼路徑、程式碼區塊不誤報',
            !linkTxt.includes('健康外部連結') && !linkTxt.includes('也不存在.md'), linkTxt);
        await shot('08-health');

        // 點問題項目會開啟該檔(斷連結那項指向的檔不存在,所以點 frontmatter 那項)
        const itemSel = '[data-testid=health-group][data-check=frontmatter] [data-testid=health-issue]';
        const clicked = await page.click(itemSel).then(() => true).catch(() => false);
        const opened = clicked && await page.waitForFunction(() =>
            (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('健康壞檔'), null, {timeout: 10000})
            .then(() => true).catch(() => false);
        const crumbsTxt = await page.textContent('[data-testid=crumbs]').catch(() => '');
        check('#41 點問題項目會開啟該檔', opened, `clicked=${clicked} crumbs=${crumbsTxt}`);

        // 如同作者自己動手修:改寫壞檔與斷連結、刪掉孤兒/過期摘要(健康檢查本身不修改任何檔)。
        // 不離開檢查面板也不切換檔案:編輯器停在剛開的壞檔(沒有未存變更,runHealth 的 save 不會蓋回去),
        // 再按一次「開始檢查」——驗的是同一份畫面重跑,不是重新掛載面板。
        hw('canon/健康壞檔.md', '---\ntype: 角色\nname: 健康壞檔\naliases: []\n---\n\n# 健康壞檔\n\n修好了。\n');
        hw('notes/健康連結.md', '# 健康連結\n\n[第一章](../manuscript/第一章.md)\n');
        hdel('summaries/孤兒摘要.md');
        hdel('summaries/第一章.md');
        try { fs.rmdirSync(P('summaries')); } catch {}
        // 同一份畫面再按一次「開始檢查」:等報告文字真的換掉(不是等期待的結果),
        // 沒換就讀到第一份舊報告——沒重算的話下面兩項會 FAIL
        const prevTxt = await page.textContent('[data-testid=health-report]').catch(() => '');
        await page.click('[data-testid=run-health]');
        await page.waitForFunction(p => (document.querySelector('[data-testid=health-report]')?.textContent || '') !== p, prevTxt, {timeout: 10000}).catch(() => {});
        const afterTxt = await page.textContent('[data-testid=health-report]').catch(() => '');
        check('#41 修好後再檢查不再列出',
            afterTxt !== prevTxt && !afterTxt.includes('健康壞檔') && !afterTxt.includes('孤兒摘要') && !afterTxt.includes('健康連結') && !afterTxt.includes('不存在檔'), afterTxt);
        const timeTxt = (await page.$('[data-testid=health-time]')) ? await page.textContent('[data-testid=health-time]') : '';
        check('#41 沒問題時顯示「沒有發現問題」與檢查時間',
            afterTxt.includes('沒有發現問題') && /\d{1,2}:\d{2}:\d{2}/.test(timeTxt), `${afterTxt} | ${timeTxt}`);

        // 清掉專用檔(不留下痕跡給後面的測試組),並用設定頁開關讓前端重讀 tree 與索引
        hdel('canon/健康壞檔.md');
        hdel('notes/健康連結.md');
        hdel('notes/健康外部連結.md');
        await page.click('[data-testid=open-settings]');
        await hWait('[data-testid=settings-page]');
        await page.click('[data-testid=close-settings]');
        await hWait('[data-testid=rail-checks]');
        check('#41 專用檔已清掉(不留痕跡)', !fs.existsSync(P('canon/健康壞檔.md')) && !fs.existsSync(P('notes/健康連結.md'))
            && !fs.existsSync(P('notes/健康外部連結.md')) && !fs.existsSync(P('summaries/第一章.md')));
    },
};
