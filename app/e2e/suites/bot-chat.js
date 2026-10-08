// bot-chat — 快速指令、建議附加、提案(需模型)、版本初覽
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'bot-chat',
    desc: '快速指令、建議附加、提案(需模型)、版本初覽',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // 右鍵 → 快速指令
        await page.click('.cm-line:has-text("艾莉絲走進森林")');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        const line = await page.$('.cm-line:has-text("艾莉絲走進森林")');
        const box = await line.boundingBox();
        await page.mouse.click(box.x + 40, box.y + box.height / 2, {button: 'right'});
        await page.waitForSelector('.ctxmenu');
        await page.hover('.ctxmenu >> text=快速指令');
        await page.waitForSelector('.ctxmenu >> text=分析這段');
        await shot('02-context-menu');
        await page.click('.ctxmenu >> text=分析這段');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        check('快速指令帶入問題', (await page.inputValue('[data-testid=question]')).includes('分析'));
        check('選取段落成為附加標籤', (await page.textContent('[data-testid=chips]')).includes('選取'));

        // 建議附加(不會自動附加,點了才附加)
        await page.waitForSelector('[data-testid=chips] >> text=艾莉絲', {timeout: 5000});
        let pv = '';
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview]');
        pv = await page.textContent('[data-testid=preview]');
        check('建議附加在點選前不進入上下文', !pv.includes('十七歲'));
        await page.keyboard.press('Escape');
        await page.click('[data-testid=chips] >> text=艾莉絲');
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview]');
        pv = await page.textContent('[data-testid=preview]');
        check('點選建議後設定出現在預覽', pv.includes('十七歲'));
        check('B2 未附加的筆記與大綱不在預覽', !pv.includes('雷恩的哥哥') && !pv.includes('王都陷落'));
        await shot('03-preview');
        await page.keyboard.press('Escape');
        await shot('04-chat');

        // 提案 → 部分採用(E2E_SKIP_AI=1 時整段跳過:不向模型送出請求)
        let hasProposal = false;
        if (SKIP_AI) {
            skip('模型回覆完成');
            skip('模型建立提案並顯示卡片');
            skip('A1 提案顯示前稿件未被改動');
            skip('編輯後提示將寫入作者版本');
            skip('B4 接受後寫入作者編輯的版本');
            skip('B4 provenance 記錄 authorEdited');
            skip('編輯器重新載入為磁碟內容');
            skip('接受提案前的自動快照在版本清單');
        } else {
        const before = read(ch1);
        await page.fill('[data-testid=question]', '請使用 propose_patch 工具,把第一章的「天很黑。」改寫得更有畫面感。只改這一句,original 請逐字填「天很黑。」。');
        const t0 = Date.now();
        await page.click('[data-testid=send]');
        // 先等請求開始(出現「停止」),再等它結束(「送出」回來)
        await page.waitForSelector('[data-testid=chat-window] button:has-text("停止")', {timeout: 10000});
        await page.waitForSelector('[data-testid=send]', {timeout: 300000});
        const secs = ((Date.now() - t0) / 1000).toFixed(0);
        const chatErr = await page.$('[data-testid=chat-error]') ? await page.textContent('[data-testid=chat-error]') : '';
        hasProposal = !!(await page.$('[data-testid=proposal]'));
        check('模型回覆完成', !chatErr, `${secs}s ${chatErr}`);
        check('模型建立提案並顯示卡片', hasProposal);
        check('A1 提案顯示前稿件未被改動', read(ch1) === before);
        await shot('05-proposal');
        if (hasProposal) {
            await page.fill('[data-testid=proposal-edit]', '夜色濃得化不開。');
            check('編輯後提示將寫入作者版本', (await page.textContent('[data-testid=proposal]')).includes('寫入你的版本'));
            await page.click('[data-testid=accept]');
            await page.waitForTimeout(800);
            const disk = read(ch1);
            check('B4 接受後寫入作者編輯的版本', disk.includes('艾莉絲走進森林。夜色濃得化不開。她很害怕。'), JSON.stringify(disk.slice(0, 80)));
            const prov = fs.readFileSync(path.join(PROJ, '.perkins', 'provenance.jsonl'), 'utf8');
            check('B4 provenance 記錄 authorEdited', prov.includes('"authorEdited":true'));
            check('編輯器重新載入為磁碟內容', (await page.textContent('.cm-content')).includes('夜色濃得化不開'));
        }
        }

        // ===== 上下文用量 + 送出預覽來源標示(Issue #37 部分)=====
        // 先按「新對話」回到乾淨狀態:無選取、無附加、模式歸零(doc=第一章仍帶著;
        // 新對話不清問題框,既有行為,所以問題文字直接讀畫面)。
        // 此時前端 params 與測試直呼 PreviewContext 的參數完全相同,可比對百分比
        await page.click('[data-testid=chat-window] button:has(svg.lucide-square-pen)');
        await page.waitForSelector('[data-testid=context-usage]', {timeout: 5000});
        const shown = (await page.textContent('[data-testid=context-usage]')).trim();
        const qNow = await page.inputValue('[data-testid=question]');
        const draftNow = await page.evaluate(() => [...document.querySelectorAll('.cm-content .cm-line')].map(l => l.textContent).join('\n'));
        const pvCtx = await page.evaluate(([q, draft]) => window.go.main.App.PreviewContext({
            question: q, doc: 'manuscript/第一章.md', selection: '', attachments: [], mode: '',
            priorSummaries: false, quickId: '', quickEdited: false, docDraft: draft,
        }), [qNow, draftNow]);
        const expectPct = Math.round(pvCtx.tokens / pvCtx.limit * 100);
        check('context-usage 顯示百分比與 PreviewContext(tokens/limit)一致',
            shown === `上下文 ${expectPct}%`, `shown=${shown} expect=${expectPct}% tokens=${pvCtx.tokens} limit=${pvCtx.limit}`);

        // 送出預覽標示來源:艾莉絲用建議標籤附加(採用建議附加)、雷恩用迥紋針手動附加(手動附加)
        await page.waitForSelector('[data-testid=chips] >> text=艾莉絲', {timeout: 5000});
        await page.click('[data-testid=chips] >> text=艾莉絲');
        await page.click('[data-testid=attach-btn]');
        await page.waitForSelector('label:has-text("雷恩")');
        await page.click('label:has-text("雷恩")');
        await page.keyboard.press('Escape');
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview]');
        const pvTxt = await page.textContent('[data-testid=preview]');
        check('預覽區分手動附加與採用建議附加',
            pvTxt.includes('雷恩(全文,手動附加)') && pvTxt.includes('艾莉絲(全文,採用建議附加)'),
            pvTxt.split('\n').filter(l => l.includes('附加')).join(' / ').slice(0, 160));
        check('原始訊息有來源標籤(系統指示/本次提問)',
            pvTxt.includes('系統指示') && pvTxt.includes('本次提問'));
        await page.keyboard.press('Escape');

        // 超過 100% 用警示色:暫時切到 contextTokens 很小的端點(不呼叫模型,PreviewContext 只做組裝)
        const orig = await page.evaluate(() => window.go.main.App.GetSettings());
        const origModel = orig.profiles.find(p => p.id === orig.active).model;
        const DEAD = 'e2e-tiny-ctx';
        let tinyCreated = false;
        try {
            await page.evaluate(id => window.go.main.App.SaveProfile(
                {id, name: 'E2E 極小上下文', baseUrl: 'http://127.0.0.1:9/v1', model: 'e2e', contextTokens: 200}, null), DEAD);
            tinyCreated = true;
            await page.evaluate(id => window.go.main.App.SetActiveModel(id, 'e2e'), DEAD);
            await page.fill('[data-testid=question]', 'q'); // 觸發用量重算(切換端點不改變前端狀態)
            await page.waitForFunction(() => {
                const el = document.querySelector('[data-testid=context-usage]');
                if (!el) return false;
                const m = el.textContent.match(/(\d+)%/);
                return m && parseInt(m[1]) > 100;
            }, null, {timeout: 5000});
            // 小 limit 下百分比有意義,再做一次精確一致性比對(此時附加了艾莉絲與雷恩;docDraft 帶當下編輯器內容)
            const shownTiny = (await page.textContent('[data-testid=context-usage]')).trim();
            const draftTiny = await page.evaluate(() => [...document.querySelectorAll('.cm-content .cm-line')].map(l => l.textContent).join('\n'));
            const pvTiny = await page.evaluate(draft => window.go.main.App.PreviewContext({
                question: 'q', doc: 'manuscript/第一章.md', selection: '',
                attachments: ['canon/艾莉絲.md', 'canon/雷恩.md'], mode: '',
                priorSummaries: false, quickId: '', quickEdited: false, docDraft: draft,
            }), draftTiny);
            const expectTiny = Math.round(pvTiny.tokens / pvTiny.limit * 100);
            check('超量時 context-usage 百分比也與 PreviewContext(tokens/limit)一致',
                shownTiny === `上下文 ${expectTiny}%`, `shown=${shownTiny} expect=${expectTiny}% tokens=${pvTiny.tokens} limit=${pvTiny.limit}`);
            const cls = await page.$eval('[data-testid=context-usage]', el => el.className);
            check('超過 100% 時 context-usage 用警示色(同 preview-over 語意)', cls.includes('text-warning'), cls);

            // 未存草稿也反映在用量(PR #54 返工):在編輯器插入一大段字但不存檔,用量應以草稿估算
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.insertText('這是一段還沒存檔的草稿。'.repeat(60)); // 約 660 字,不改變附加
            const draftUnsaved = await page.evaluate(() => [...document.querySelectorAll('.cm-content .cm-line')].map(l => l.textContent).join('\n'));
            const pvDraft = await page.evaluate(draft => window.go.main.App.PreviewContext({
                question: 'q', doc: 'manuscript/第一章.md', selection: '',
                attachments: ['canon/艾莉絲.md', 'canon/雷恩.md'], mode: '',
                priorSummaries: false, quickId: '', quickEdited: false, docDraft: draft,
            }), draftUnsaved);
            const expectDraft = `上下文 ${Math.round(pvDraft.tokens / pvDraft.limit * 100)}%`;
            await page.waitForFunction(exp => {
                const el = document.querySelector('[data-testid=context-usage]');
                return el && el.textContent.trim() === exp;
            }, expectDraft, {timeout: 5000});
            const shownDraft = (await page.textContent('[data-testid=context-usage]')).trim();
            check('未存草稿的用量反映草稿內容',
                shownDraft === expectDraft && pvDraft.tokens > pvTiny.tokens, `shown=${shownDraft} expect=${expectDraft} delta=${pvDraft.tokens - pvTiny.tokens}`);
            await page.keyboard.press('Control+Z'); // 還原草稿:不留內容給後面的組(存檔前還原,dirty 也消失)
        } finally {
            // 還原使用者設定(原端點與模型;只刪本次建立的暫時端點)
            await page.evaluate(([id, model]) => window.go.main.App.SetActiveModel(id, model), [orig.active, origModel]);
            if (tinyCreated) await page.evaluate(id => window.go.main.App.DeleteProfile(id), DEAD);
            // 清掉本段帶入的選取/附加/問題,不漏到後面的版本段與下一組
            await page.click('[data-testid=chat-window] button:has(svg.lucide-square-pen)');
        }

        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // 版本
        await page.click('[data-testid=open-versions]');
        await page.waitForSelector('text=建立快照');
        if (hasProposal) check('接受提案前的自動快照在版本清單', !!(await page.$('li:has-text("接受提案前")')));
        await shot('06-versions');
        await page.keyboard.press('Escape');
    },
};
