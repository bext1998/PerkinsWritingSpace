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
    },
};
