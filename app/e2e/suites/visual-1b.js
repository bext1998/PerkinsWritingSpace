// visual-1b — 1B 視覺:AI 浮窗回覆與提案卡、資訊欄(深/淺)
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'visual-1b',
    desc: '1B 視覺:AI 浮窗回覆與提案卡、資訊欄(深/淺)',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // ===== 1B 視覺驗收:AI 浮窗含回覆與提案卡、資訊欄(深/淺各一;截圖等動畫結束) =====
        // 回覆:DEV hook 注入(不呼叫模型);提案卡:寫入真實 .perkins/proposals/<id>.json 後由 refreshProposals 載入
        const projWrite = (rel, content) => { fs.mkdirSync(path.dirname(P(rel)), {recursive: true}); fs.writeFileSync(P(rel), content); };
        projWrite('.perkins/proposals/20261005-090000-abc123.json', JSON.stringify({
            id: '20261005-090000-abc123', createdAt: '2026-10-05T09:00:00+08:00', model: '截圖用假提案', target: 'manuscript/第一章.md',
            original: '天很黑。她很害怕。', replacement: '夜色像墨一樣漫開。她把手電筒擑得更緊。',
            rationale: '讓開場更有畫面感。', assumptions: [], baseHash: 'x', start: 0, end: 0, status: 'pending',
        }, null, 2));
        await page.evaluate(() => {
            window.__perkinsChatInject([
                {role: 'user', text: '把開場改得更有畫面感', meta: '選取 9 字'},
                {role: 'assistant', text: '建議**修改**開場段落:\n- 原句節奏平直\n- 以環境細節代替直述'},
            ]);
            window.__perkinsRefreshProposals();
        });
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=assistant-turn]');
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        // Markdown 檢查核對實際 DOM(review-1b 第 2 點):strong/ul/li 必須真的存在
        const mdDom = await page.$eval('[data-testid=assistant-turn]', el => ({
            strong: !!el.querySelector('strong'), ul: !!el.querySelector('ul'), li: el.querySelectorAll('li').length,
        }));
        check('1B 截圖準備:回覆以 Markdown 顯示(strong/ul/li 在 DOM)且提案卡在場',
            mdDom.strong && mdDom.ul && mdDom.li >= 2 && !!(await page.$('[data-testid=proposal]')), JSON.stringify(mdDom));
        // H3(review-1b 第 3 點):回覆不以整塊背景包框(透明背景);提案卡無獨立外框背景
        const frame = await page.evaluate(() => {
            const at = document.querySelector('[data-testid=assistant-turn]');
            const pr = document.querySelector('[data-testid=proposal]');
            const bg = at ? getComputedStyle(at).backgroundColor : null;
            const prBg = pr ? getComputedStyle(pr).backgroundColor : null;
            const prBorder = pr ? getComputedStyle(pr).borderTopWidth : null;
            return {atBg: bg, atRounded: at ? at.className.includes('rounded-lg') : null, prBg, prBorder, prRounded: pr ? pr.className.includes('rounded-lg') : null};
        });
        check('H3 回覆無整塊背景包框', frame.atBg === 'rgba(0, 0, 0, 0)' && frame.atRounded === false, JSON.stringify(frame));
        check('H3 提案卡無獨立外框背景', frame.prBg === 'rgba(0, 0, 0, 0)' && frame.prRounded === false, JSON.stringify(frame));
        await shot('34-1b-chat-reply-dark');
        // 淺色浮窗 + 資訊欄
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        await shot('35-1b-workspace-light');
        await page.click('[data-testid=chat-fab]');
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        await shot('36-1b-chat-reply-light');
        await page.keyboard.press('Escape');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await shot('37-1b-inspector-light');
        await page.click('[data-testid=open-settings]');
        await page.click('button:has-text("夜間書房")');
        await page.click('[data-testid=close-settings]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)

        // AI改動標示(#45 a):接受提案後短暫標示 AI 改動範圍,數秒後淡掉。用專用章節,不動其他組依賴的第一章;
        // 改寫後的文字故意在前面已出現一次,標示必須落在實際改動處(離提案位置最近的那次),不是第一次出現
        // 專用章節以 fs 建立,靠第一章「弄髒→存檔→refreshTree」讓側欄出現(同冒煙組;第一章內容不變)
        const flashRel = 'manuscript/提案標示.md';
        projWrite(flashRel, '# 提案標示\n\n星光落下。\n\n雨停了。\n');
        await ctx.ensureProject('第一章', 'manuscript');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('x');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await page.locator('[data-testid=chapter-row]:has-text("提案標示")').first().click({timeout: 15000});
        await page.waitForSelector('.cm-content:has-text("雨停了")', {timeout: 15000});
        const flashSrc = read(flashRel);
        const at = flashSrc.indexOf('雨停了。');
        const start = Buffer.byteLength(flashSrc.slice(0, at));
        projWrite('.perkins/proposals/20261009-120000-flash1.json', JSON.stringify({
            id: '20261009-120000-flash1', createdAt: '2026-10-09T12:00:00+08:00', model: 'E2E', target: flashRel,
            original: '雨停了。', replacement: '星光落下。', rationale: 'E2E 標示測試', assumptions: [],
            baseHash: require('crypto').createHash('sha256').update(flashSrc).digest('hex'),
            start, end: start + Buffer.byteLength('雨停了。'), status: 'pending',
        }));
        await page.evaluate(() => window.__perkinsRefreshProposals());
        await page.click('[data-testid=chat-fab]');
        await page.click('[data-testid=proposal]:has-text("雨停了") [data-testid=accept]');
        await page.waitForSelector('.cm-ai-flash', {timeout: 5000});
        const flash = await page.evaluate(() => {
            const els = [...document.querySelectorAll('.cm-ai-flash')];
            const lines = [...document.querySelectorAll('.cm-line')];
            return {text: els.map(e => e.textContent).join(''), line: lines.indexOf(els[0]?.closest('.cm-line')),
                last: lines.map(l => l.textContent).lastIndexOf('星光落下。')};
        });
        check('AI改動標示 接受提案後標示改動範圍(文字等於寫入內容,落在實際改動處而非第一次出現)',
            read(flashRel).includes('星光落下。\n\n星光落下。') && flash.text === '星光落下。' && flash.line === flash.last && flash.last > 0,
            JSON.stringify(flash));
        await page.waitForSelector('.cm-ai-flash', {state: 'detached', timeout: 6000});
        check('AI改動標示 數秒後移除', !(await page.$('.cm-ai-flash')));
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
    },
};
