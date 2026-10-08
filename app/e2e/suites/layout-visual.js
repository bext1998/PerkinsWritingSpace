// layout-visual — 書櫃 1B 視覺(H4 長書名封面)與重新開啟
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'layout-visual',
    desc: '書櫃 1B 視覺(H4 長書名封面)與重新開啟',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureBookshelf();
        // H4(review-1b2):render 真實元件的長書名驗證 — 此時已在書櫃(13 之後);覆寫 ListRecent
        // 回傳兩筆受控資料(無空白與含空白的長英文名;路徑指向不存在的暫存位置,不開啟、
        // 不動作者的最近清單),reload 讓真實 Bookshelf/GeneratedCover 以受控資料 render
        await page.evaluate(projPath => {
            window.__perkinsListRecentOrig = window.go.main.App.ListRecent;
            window.go.main.App.ListRecent = () => Promise.resolve([
                {path: projPath, name: 'E2E測試', cover: '', missing: false}, // 真實作品:置入受控清單供 H4 後重開
                {path: 'C:/__perkins_test__/no-space-long-name', name: 'TheLastGallopAndTheForgottenKingdom', cover: '', missing: true},
                {path: 'C:/__perkins_test__/spaced-long-name', name: 'The Last Gallop and the Forgotten Kingdom', cover: '', missing: true},
            ]);
        }, PROJ);
        // 此時已在書櫃(13 之後);先開任意真實作品進編輯器,再回書櫃讓 Bookshelf 重新
        // mount,以覆寫後的 ListRecent render 受控卡片
        await page.click('button[title="' + PROJ.replace(/\//g, '\\') + '"], button[title="' + PROJ + '"]');
        await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
        await page.click('nav button:has(svg.lucide-house)');
        await page.waitForSelector('[data-testid=bookshelf-title]', {timeout: 20000});
        // 兩張受控測試卡片必須 render;找不到就 FAIL(不退回短名、不跳過)
        await page.waitForSelector('.group.relative button.h-\\[176px\\]', {timeout: 10000});
        const h4All = await page.evaluate(() => {
            const cards = [...document.querySelectorAll('.group.relative')];
            const out = {};
            for (const name of ['TheLastGallopAndTheForgottenKingdom', 'The Last Gallop and the Forgotten Kingdom']) {
                const card = cards.find(c => (c.querySelector('p')?.textContent || '') === name);
                if (!card) { out[name] = null; continue; }
                const btn = card.querySelector('button');
                const span = btn?.querySelector('span.line-clamp-2');
                const tag = card.querySelector('p');
                const spanR = span?.getBoundingClientRect();
                const btnR = btn?.getBoundingClientRect();
                const tagR = tag?.getBoundingClientRect();
                out[name] = {
                    spanLeft: span && btnR ? spanR.left - btnR.left : null,
                    spanH: spanR ? spanR.height : null,
                    spanTwoLines: spanR ? spanR.height > 20 && spanR.height <= 2 * 17.55 + 2 : null, // 斷行兩行內(line-clamp-2 上限)
                    tagNoOverflow: tag ? tag.scrollWidth <= tag.clientWidth + 1 : null,
                    tagH: tagR ? tagR.height : null,
                };
            }
            return out;
        });
        const noSpace = 'TheLastGallopAndTheForgottenKingdom';
        const spaced = 'The Last Gallop and the Forgotten Kingdom';
        check('H4 兩張長名測試卡片都已 render', !!h4All[noSpace] && !!h4All[spaced], JSON.stringify(Object.keys(h4All)));
        // 封面:文字與書脊線留間距(≥20px)、長名斷行成兩行(高>一行且 ≤ 兩行上限)
        check('H4 無空白長名:封面斷行兩行、與書脊線留間距',
            !!h4All[noSpace] && h4All[noSpace].spanLeft >= 20 && h4All[noSpace].spanTwoLines, JSON.stringify(h4All[noSpace]));
        check('H4 含空白長名:封面斷行兩行、與書脊線留間距',
            !!h4All[spaced] && h4All[spaced].spanLeft >= 20 && h4All[spaced].spanTwoLines, JSON.stringify(h4All[spaced]));
        // 下方書名標籤:兩行內(高≤兩行)且不水平溢出
        check('H4 無空白長名:標籤兩行內且不溢出',
            !!h4All[noSpace] && h4All[noSpace].tagNoOverflow && h4All[noSpace].tagH <= 2 * 18 * 1.3, JSON.stringify(h4All[noSpace]));
        check('H4 含空白長名:標籤兩行內且不溢出',
            !!h4All[spaced] && h4All[spaced].tagNoOverflow && h4All[spaced].tagH <= 2 * 18 * 1.3, JSON.stringify(h4All[spaced]));
        // 補拍:兩張長名卡特寫(第一張無空白)
        const testCards = await page.$$('.group.relative');
        if (testCards[0]) {
            const cb = await testCards[0].boundingBox();
            await page.screenshot({path: path.join(SHOTS, '32-1b-cover-zoom.png'), clip: {x: Math.max(0, cb.x - 20), y: Math.max(0, cb.y - 20), width: Math.min(300, cb.width + 40 + 140), height: cb.height + 70}});
        }
        await shot('38-1b-longname-covers');
        // 還原覆寫;書櫃仍 render 受控清單(含真實卡)— 點真實卡重開作品進編輯器
        await page.evaluate(() => { window.go.main.App.ListRecent = window.__perkinsListRecentOrig; });
        await settle(80, 600); // 等 UI 更新(原固定等 200ms)
        // 淺色書櫃:切白紙 → 書櫃 → 切回
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        await shot('33-1b-bookshelf-light');
        await page.click('[data-testid=open-settings]');
        await page.click('button:has-text("夜間書房")');
        await page.click('[data-testid=close-settings]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        // 從書櫃重新開啟作品(受控清單中的真實卡路徑 = 當輪 PROJ)
        await page.click('button[title="' + PROJ.replace(/\//g, '\\') + '"], button[title="' + PROJ + '"]');
        await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
        if (!(await page.$('.cm-content'))) await page.click('[data-testid=chapter-row]:has-text("第一章")');
        check('從書櫃重新開啟作品', !!(await page.$('[data-testid=chapter-row]')));
    },
};
