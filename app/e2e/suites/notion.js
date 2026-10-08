// notion — Notion 逐頁分類匯入與撤銷
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'notion',
    desc: 'Notion 逐頁分類匯入與撤銷',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // Notion 逐頁分類(SPEC §16 第 2 項):原生檔案對話框無法在無頭模式操作,覆寫 PickNotionExport 綁定
        // (wailsjs 在呼叫當下才讀 window.go,所以可覆寫)
        await page.evaluate(p => { window.go.main.App.PickNotionExport = async () => p; }, NOTION_SRC);
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.waitForSelector('[data-testid=settings-page] button:has-text("選擇資料夾")');
        await page.click('button:has-text("選擇資料夾")');
        await page.waitForSelector('text=Notion 資料夾');
        await page.waitForSelector('[data-testid=expand-人物]', {timeout: 5000});
        await page.click('[data-testid=expand-人物]');
        await page.waitForSelector('[data-testid=pages-人物]');
        await shot('17-notion-pages');
        // §16 第 8 項:展開的逐頁清單要排在資料夾列下方的整列,不得塞在「匯入為」窄欄裡(長頁名會把其他欄擠成直排)
        {
            const lay = await page.evaluate(() => {
                const box = document.querySelector('[data-testid=pages-人物]').getBoundingClientRect();
                const sel = document.querySelector('[data-testid=group-select-人物]').getBoundingClientRect();
                const table = document.querySelector('[data-testid=pages-人物]').closest('table').getBoundingClientRect();
                return {boxLeft: box.left, boxW: box.width, selLeft: sel.left, tableW: table.width};
            });
            check('Notion 逐頁清單不在「匯入為」欄內', lay.boxLeft < lay.selLeft, JSON.stringify(lay));
            check('Notion 逐頁清單佔整列寬度', lay.boxW >= lay.tableW * 0.8, JSON.stringify(lay));
        }
        // 長資料夾名稱(Notion 匯出常見長英數名稱)要在第一欄內截斷,不得侵入「頁數」欄;設定頁最窄 900×600
        {
            await page.setViewportSize({width: 900, height: 600});
            const lay = await page.evaluate(() => {
                const label = document.querySelector('[data-testid=group-label-人物]');
                const orig = label.textContent;
                label.textContent = 'A'.repeat(120); // 只為量測版面,量完還原
                const right = label.getBoundingClientRect().right;
                const th = [...document.querySelectorAll('th')].find(t => t.textContent.trim() === '頁數').getBoundingClientRect();
                label.textContent = orig;
                return {labelRight: right, pagesLeft: th.left};
            });
            check('Notion 長資料夾名稱不侵入「頁數」欄', lay.labelRight <= lay.pagesLeft, JSON.stringify(lay));
            // 半螢幕(640 寬,SPEC §16 第 7 項):匯入表格不產生水平捲軸
            await page.setViewportSize({width: 640, height: 672});
            check('Notion 640×672 匯入表格無水平溢出', await page.evaluate(() => {
                const c = document.querySelector('[data-testid=settings-content]');
                return !!c && c.scrollWidth <= c.clientWidth + 1;
            }));
            await page.setViewportSize({width: 1440, height: 900});
        }
        // 三頁分別設:艾莉絲=跟隨資料夾(人物→角色)、王都=地點、草稿=略過
        const setPage = async (name, target) => {
            await page.click(`[data-testid=pages-人物] div:has(span:text-is("${name}")) button`);
            await page.waitForSelector('[role=option]');
            const opts = await page.$$('[role=option]');
            for (const o of opts) {
                const t = (await o.textContent()).trim();
                if (t === target || t.startsWith('跟隨資料夾') && target === '跟隨資料夾') { await o.click(); break; }
            }
            await page.waitForSelector('[role=option]', {state: 'hidden', timeout: 5000});
        };
        // 劉洋:先覆寫為「地點」,再選回「跟隨資料夾」(清除覆寫)→ 驗證覆寫清除與計數同步
        await setPage('劉洋', '地點');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        check('N1a 覆寫時頁數同步變化', (await page.textContent('[data-testid=override-count-人物]')).includes('1 頁另行指定'), await page.textContent('[data-testid=override-count-人物]'));
        let importBtn = await page.textContent('button:has-text("匯入 ")');
        check('N1a 覆寫時匯入頁數維持 4(劉洋地點仍非略過)', importBtn.includes('匯入 4 頁'), importBtn.trim());
        await setPage('劉洋', '跟隨資料夾');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        await setPage('王都', '地點');
        await setPage('草稿', '略過');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        await shot('18-notion-perpage');
        // 未覆寫頁(劉洋)的閉合選單應顯示「跟隨資料夾(目前:角色)」,隨群組去處即時更新
        const liuTrigger = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("劉洋")) button');
        check('N1c 閉合選單顯示跟隨資料夾(目前:X)', liuTrigger.includes('跟隨資料夾(目前:角色)'), liuTrigger.trim());
        // 群組改略過:兩個跟隨頁(艾莉絲/劉洋)的閉合顯示變成「跟隨資料夾(目前:略過)」、匯入數變為 1(僅王都);
        // 已覆寫頁保持原值(王都仍地點、草稿仍略過);再切回角色完成匯入與撤銷
        await page.click('[data-testid=pages-人物] div:has(span:text-is("艾莉絲")) button'); // 開啟跟隨頁的 Select 以便選回角色(暫不選)
        await page.keyboard.press('Escape');
        const groupTrigger = await page.$('[data-testid=pages-人物] >> xpath=ancestor::table >> button[data-radix-collection-item]');
        // 資料夾列的 Select(不在 pages- 區塊內):表格第三欄的第一個 SelectTrigger
        await page.click('[data-testid=group-select-人物]');
        await page.waitForSelector('[role=option]', {timeout: 5000});
        const groupOpts = await page.$$('[role=option]');
        for (const o of groupOpts) {
            if ((await o.textContent()).trim() === '略過') { await o.click(); break; }
        }
        await page.waitForSelector('[role=option]', {state: 'hidden', timeout: 5000});
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const aliceChip = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("艾莉絲")) button');
        const liuChip = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("劉洋")) button');
        check('C2 跟隨頁閉合顯示變為略過(艾莉絲)', aliceChip.includes('跟隨資料夾(目前:略過)'), aliceChip.trim());
        check('C2 跟隨頁閉合顯示變為略過(劉洋)', liuChip.includes('跟隨資料夾(目前:略過)'), liuChip.trim());
        const wtChip = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("王都")) button');
        const cgChip = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("草稿")) button');
        check('C2 已覆寫頁保持原值(王都=地點)', wtChip.includes('地點'), wtChip.trim());
        check('C2 已覆寫頁保持原值(草稿=略過)', cgChip.includes('略過'), cgChip.trim());
        let importBtnG = await page.textContent('button:has-text("匯入 ")');
        check('C2 群組略過時匯入數變為 1', importBtnG.includes('匯入 1 頁'), importBtnG.trim());
        check('C2 覆寫頁數不變(王都+草稿=2)', (await page.textContent('[data-testid=override-count-人物]')).includes('2 頁另行指定'));
        // 切回角色
        await page.click('[data-testid=group-select-人物]');
        await page.waitForSelector('[role=option]', {timeout: 5000});
        const groupOpts2 = await page.$$('[role=option]');
        for (const o of groupOpts2) {
            if ((await o.textContent()).trim() === '角色') { await o.click(); break; }
        }
        await page.waitForSelector('[role=option]', {state: 'hidden', timeout: 5000});
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        check('N1 資料夾列顯示覆寫頁數', (await page.textContent('[data-testid=override-count-人物]')).includes('2 頁另行指定'));
        const importBtnText = await page.textContent('button:has-text("匯入 ")');
        check('N1 匯入頁數按逐頁結果計算', importBtnText.includes('匯入 3 頁'), importBtnText.trim());
        const aliceBefore = hash('canon/艾莉絲.md');
        await page.click('button:has-text("匯入 ")');
        await page.waitForSelector('text=已匯入 2 個檔案', {timeout: 30000});
        check('N1 匯入報告 2 個檔案、略過 1 個', (await page.textContent('[data-testid=settings-page]')).includes('略過 1 個'));
        check('N1 王都 frontmatter 為地點', read('canon/王都.md').includes('type: 地點'), JSON.stringify(read('canon/王都.md').slice(0, 40)));
        check('N1 草稿頁略過未匯入', !fs.existsSync(P('canon/草稿.md')));
        check('N1 B9 同名頁未覆蓋既有艾莉絲', hash('canon/艾莉絲.md') === aliceBefore);
        // 劉洋(未覆寫,跟隨資料夾=角色):應在 canon/、frontmatter 為角色
        check('N1b 跟隨資料夾的劉洋匯入為角色', fs.existsSync(P('canon/劉洋.md')) && read('canon/劉洋.md').includes('type: 角色'), JSON.stringify(read('canon/劉洋.md').slice(0, 40)));
        // 撤銷 → 檔案消失
        await page.click('button:has-text("撤銷這次匯入")');
        await page.waitForSelector('text=已撤銷這次匯入', {timeout: 10000});
        await page.click('[data-testid=close-settings]');
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        check('N1 撤銷後王都消失', !fs.existsSync(P('canon/王都.md')));
        check('N1b 撤銷後劉洋消失', !fs.existsSync(P('canon/劉洋.md')));
    },
};
