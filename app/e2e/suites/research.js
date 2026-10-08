// research — 研究記錄 R1–R3
// (由 e2e.js 拆組;R1/R2 為原始流程的連續片段,檢查名稱與斷言未改;R3 為快速指令來源記錄)
module.exports = {
    name: 'research',
    desc: '研究記錄 R1–R3',
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

        // R3(§16 第 21 項):ask 事件記下快速指令來源。暫時切到連不上的本機端點(127.0.0.1:9),
        // 送出後連線立即失敗,仍寫入恰好一筆 ask 事件;不呼叫真實模型。結束後還原原本的端點與模型。
        const asks = () => rlog().trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.event === 'ask');
        const orig = await page.evaluate(() => window.go.main.App.GetSettings());
        const origModel = orig.profiles.find(p => p.id === orig.active).model;
        const DEAD = 'e2e-unreachable';
        // 把研究記錄設為指定狀態(不盲目切換);關閉設定頁時 Workspace 重新讀設定,
        // 對話框才不會沿用舊端點(雲端端點要求送出前確認)
        const setResearch = async want => {
            await page.click('[data-testid=open-settings]');
            await page.waitForSelector('[data-testid=settings-page]');
            await page.click('[data-testid=tab-project]');
            await page.waitForSelector('[data-testid=research-switch]:not([disabled])');
            if ((await page.evaluate(() => window.go.main.App.GetResearch())) !== want) {
                await page.click('[data-testid=research-switch]');
                await settle(80, 900);
            }
            await page.click('[data-testid=close-settings]');
            await settle(80, 700);
        };
        // 對話框的模型按鈕顯示目前端點的模型:用它確認 Workspace 已重讀設定(DOM 靜默不代表 GetSettings 已回來)
        const waitModel = m => page.waitForFunction(m => document.querySelector('[data-testid=model-btn]')?.textContent.trim() === m, m, {timeout: 5000});
        // 送出並等到這次提問的 ask 事件寫入、對話框結束忙碌,回傳該筆事件
        const sendAsk = async () => {
            const n = asks().length;
            await page.click('[data-testid=send]');
            const t0 = Date.now();
            while (asks().length === n && Date.now() - t0 < 15000) await page.waitForTimeout(100);
            await page.waitForSelector('[data-testid=send]', {timeout: 15000});
            return asks()[n];
        };
        const quickFromBar = async label => {
            await ensureProject('第一章', 'manuscript');
            await page.click('.cm-line:has-text("雷恩點起營火")');
            await page.keyboard.press('Home');
            await page.keyboard.press('Shift+End');
            await page.click('[data-testid=selection-quick]');
            await page.click(`[data-testid=selection-bar] div:text-is("${label}")`);
            await page.waitForSelector('[data-testid=chat-window]:visible');
            await waitModel('e2e');
        };
        let created = false;
        try {
            await page.evaluate(id => window.go.main.App.SaveProfile({id, name: 'E2E 不可達', baseUrl: 'http://127.0.0.1:9/v1', model: 'e2e', contextTokens: 32768}, null), DEAD);
            created = true;
            await page.evaluate(id => window.go.main.App.SetActiveModel(id, 'e2e'), DEAD);
            await setResearch(true);
            const on = await page.evaluate(() => window.go.main.App.GetResearch());
            check('R3 前置:研究記錄已開啟', on === true, `research=${on}`);

            // 1. 快速指令原樣送出 → quickId=analyze、quickEdited=false
            await quickFromBar('分析這段');
            const e1 = await sendAsk();
            check('R3 快速指令原樣送出:ask 記 quickId=analyze、quickEdited=false',
                e1?.detail.quickId === 'analyze' && e1?.detail.quickEdited === false, JSON.stringify(e1?.detail ?? null).slice(0, 200));

            // 2. 帶入後改寫問題 → quickEdited=true,記錄不含原始問題全文(只記布林)
            await quickFromBar('節奏是否太快或太慢');
            const paceQ = '這段的節奏是否太快或太慢?請指出具體位置,並說明讀者可能的感受。';
            const filled = await page.inputValue('[data-testid=question]');
            await page.fill('[data-testid=question]', 'R3改寫後的問題');
            const e2 = await sendAsk();
            const raw2 = JSON.stringify(e2 ?? null);
            check('R3 改過問題:ask 記 quickId=pace、quickEdited=true,且不含原始問題全文',
                filled === paceQ && e2?.detail.quickId === 'pace' && e2?.detail.quickEdited === true
                && raw2.includes('R3改寫後的問題') && !raw2.includes(paceQ),
                `filled=${filled === paceQ} quickId=${e2?.detail.quickId} quickEdited=${e2?.detail.quickEdited} hasNew=${raw2.includes('R3改寫後的問題')} hasOrig=${raw2.includes(paceQ)}`);

            // 3. 自行輸入問題 → 不寫 quickId/quickEdited 欄位
            await page.fill('[data-testid=question]', 'R3自行輸入的問題');
            const e3 = await sendAsk();
            check('R3 自行輸入問題:ask 無 quickId/quickEdited 欄位',
                !!e3 && !('quickId' in e3.detail) && !('quickEdited' in e3.detail), JSON.stringify(e3?.detail ?? null).slice(0, 200));

            // 4. 檢查面板 AI 檢查 → quickId 為該檢查的 id
            await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
            await ensureProject('第一章', 'checks');
            await page.click('button:has-text("人物設定矛盾")');
            await page.waitForSelector('[data-testid=chat-window]:visible');
            await waitModel('e2e');
            await page.waitForFunction(() => document.querySelector('[data-testid=question]')?.value.startsWith('請檢查本章中角色'));
            const e4 = await sendAsk();
            check('R3 檢查面板 AI 檢查:ask 記 quickId=char、quickEdited=false',
                e4?.detail.quickId === 'char' && e4?.detail.quickEdited === false, JSON.stringify(e4?.detail ?? null).slice(0, 200));
        } finally {
            // 先還原使用者設定(原端點與模型;只刪本次建立的暫時端點),不受後面介面清理失敗影響
            await page.evaluate(([id, model]) => window.go.main.App.SetActiveModel(id, model), [orig.active, origModel]);
            if (created) await page.evaluate(id => window.go.main.App.DeleteProfile(id), DEAD);
            // 開關一次設定頁讓 Workspace 重讀設定(研究記錄設回關閉),確認對話框回到原模型
            if (await page.isVisible('[data-testid=chat-window]')) await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
            await setResearch(false);
            await page.click('[data-testid=chat-fab]');
            await waitModel(origModel || '選擇模型');
            // 最後才按新對話:清掉本段帶入的選取、附加、報告模式(重開對話框會把舊選取帶回來,所以放在開啟之後),
            // 中途失敗也不讓後續組(polish U2)沿用舊選取
            await page.click('[data-testid=chat-window] button:has(svg.lucide-square-pen)');
            await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        }
        // 恢復:把研究記錄關閉狀態留在專案(拋棄式測試專案,不需還原)
    },
};
