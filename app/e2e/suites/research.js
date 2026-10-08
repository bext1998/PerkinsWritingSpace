// research — 研究記錄 R1/R2
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'research',
    desc: '研究記錄 R1/R2',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // 研究記錄(SPEC §16 第 3 項/§12.8):預設關閉;開啟後 open_file/save 逐筆記錄;關閉後不再新增
        const rlog = () => { try { return fs.readFileSync(P('.perkins/research.jsonl'), 'utf8'); } catch { return ''; } };
        check('R1 預設關閉時檔案不存在', !fs.existsSync(P('.perkins/research.jsonl')));
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.waitForSelector('[data-testid=research-switch]');
        await shot('19-research-settings');
        await page.click('[data-testid=research-switch]');
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        await page.click('[data-testid=close-settings]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        // 開一章(open_file)→ 打字存檔(save)
        // 重開目前檔案不會重讀也不記 open_file;先開第二章再回第一章,確保至少一次真正切換
        await page.click('[data-testid=chapter-row]:has-text("第二章")');
        await page.waitForSelector('.cm-content:has-text("天亮了")');
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-content:has-text("森林")');
        check('R1 開啟後有 open_file 記錄', rlog().includes('"open_file"'), rlog().slice(-100));
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('researchLogText');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=toast]');
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        check('R1 存檔後有 save 記錄', rlog().includes('"save"'));
        const rlogLines = rlog().trim().split('\n').length;
        // 關掉開關 → 再存檔不再新增
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.click('[data-testid=research-switch]');
        await settle(80, 900); // 等 UI 更新(原固定等 500ms)
        await page.click('[data-testid=close-settings]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('afterOff');
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(800);
        check('R1 關閉後存檔不再新增記錄', rlog().trim().split('\n').length === rlogLines, `before=${rlogLines} after=${rlog().trim().split('\n').length}`);
        check('R1 記錄不含逐字內文', !rlog().includes('researchLogText') && !rlog().includes('afterOff'));

        // R2(review-round3 第 3 點):受控 GetResearch Promise — 等待期間 Switch 停用;
        // 拒絕後仍停用且顯示載入錯誤,不得冒充已關閉。以拋棄式測試專案驗證,不動作者設定。
        // 先在開設定頁前覆寫綁定(綁定在呼叫時才解析 window.go,覆寫對後續呼叫生效)
        await page.evaluate(() => {
            window.__perkinsGetResearchOrig = window.go.main.App.GetResearch;
            window.go.main.App.GetResearch = () => new Promise((resolve, reject) => {
                window.__perkinsGetResearchGate = {resolve, reject};
            });
        });
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.waitForSelector('[data-testid=research-switch]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const disPending = await page.$eval('[data-testid=research-switch]', el => el.disabled);
        check('R2 GetResearch 等待期間 Switch 停用', disPending === true, `disabled=${disPending}`);
        await page.evaluate(() => window.__perkinsGetResearchGate.reject(new Error('測試載入失敗')));
        await page.waitForSelector('[data-testid=research-load-error]', {timeout: 5000});
        const loadErrTxt = await page.textContent('[data-testid=research-load-error]');
        const disRejected = await page.$eval('[data-testid=research-switch]', el => el.disabled);
        check('R2 拒絕後仍停用且顯示載入錯誤(不冒充關閉)', disRejected === true && loadErrTxt.includes('測試載入失敗'), `disabled=${disRejected} err=${loadErrTxt.slice(0, 60)}`);
        await shot('26-research-load-error');
        // 還原覆寫,重開設定頁確認恢復正常載入
        await page.evaluate(() => { window.go.main.App.GetResearch = window.__perkinsGetResearchOrig; });
        await page.click('[data-testid=close-settings]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        // 恢復:把研究記錄關閉狀態留在專案(拋棄式測試專案,不需還原)
    },
};
