// close-guard — 關閉前存檔保護、對話框關閉鈕、聊天浮窗拖曳
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'close-guard',
    desc: '關閉前存檔保護、對話框關閉鈕、聊天浮窗拖曳',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // ---- 關閉前存檔保護(SPEC §17.1) ----
        // ConfirmQuit 是前端確認後才呼叫的綁定;E2E 用替身記錄呼叫,並在呼叫當下讀磁碟驗證「先存檔、後確認」。
        const quitCalls = () => page.evaluate(() => (window.__quitCalls || []).length);
        const stubConfirmQuit = probe => page.evaluate(p => {
            window.__quitCalls = [];
            window.go.main.App.ConfirmQuit = async () => {
                let disk = null;
                if (p) { try { disk = await window.go.main.App.ReadFile(p); } catch (e) { disk = 'ERR:' + e; } }
                window.__quitCalls.push({disk});
            };
        }, probe || null);
        const triggerClose = () => page.evaluate(() => window.__perkinsCloseRequest());
        const typeInEditor = async text => {
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type(text);
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
        };
        // 重新載入整個頁面:崩潰段之後回到乾淨的模組狀態(DEV 鉤子與替身都會重設)
        const freshWorkspace = async () => {
            await page.reload();
            await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
        };

        // (a) 有未存字:先寫入磁碟,之後才 ConfirmQuit
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-content');
        await typeInEditor('closeGuardMark');
        check('關閉保護 (a) 前置:文字尚未寫入磁碟', !read(ch1).includes('closeGuardMark'));
        await stubConfirmQuit(ch1);
        await triggerClose();
        await page.waitForFunction(() => (window.__quitCalls || []).length >= 1, null, {timeout: 15000});
        const quitCall0 = await page.evaluate(() => window.__quitCalls[0]);
        check('關閉保護 (a) ConfirmQuit 呼叫當下文字已在磁碟上',
            typeof quitCall0.disk === 'string' && quitCall0.disk.includes('closeGuardMark'),
            `diskLen=${quitCall0.disk ? quitCall0.disk.length : 'null'}`);
        check('關閉保護 (a) 只呼叫一次 ConfirmQuit', (await quitCalls()) === 1);
        check('關閉保護 (a) 未存文字確實落在磁碟', read(ch1).includes('closeGuardMark'));

        // (a2) 存檔途中繼續打字:新字必須先落盤才 ConfirmQuit
        // 回歸:關閉存檔必須走 Workspace 的序列化存檔迴圈(saveAll),不能只寫一次快照。
        await stubConfirmQuit(ch1);
        await page.evaluate(() => window.__perkinsSaveDelay(1200));
        await typeInEditor('closeTypingBefore');
        await page.click('[data-testid=save-button]'); // 存檔開始(刻意延遲),仍在存檔途中
        await typeInEditor('closeTypingAfter');        // 存檔途中繼續打字
        await triggerClose();
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 20000});
        const typingCall = await page.evaluate(() => window.__quitCalls[0] || null);
        check('關閉保護 (a2) 放行當下磁碟已含存檔途中新打的字',
            !!typingCall && typeof typingCall.disk === 'string'
                && typingCall.disk.includes('closeTypingAfter') && typingCall.disk.includes('closeTypingBefore'),
            `disk=${typingCall && typingCall.disk ? [typingCall.disk.includes('closeTypingBefore'), typingCall.disk.includes('closeTypingAfter')] : 'null'}`);
        check('關閉保護 (a2) 磁碟最後確實有新字', read(ch1).includes('closeTypingAfter'));
        check('關閉保護 (a2) 只呼叫一次 ConfirmQuit', (await quitCalls()) === 1);
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (c) 存檔進行中連按三次關閉:只跑一次流程(存檔完成後才 ConfirmQuit 一次)
        await stubConfirmQuit(null);
        await page.evaluate(() => window.__perkinsSaveDelay(1200));
        await typeInEditor('closeGuardConcurrent');
        await page.click('[data-testid=save-button]');
        await page.evaluate(() => { window.__perkinsCloseRequest(); window.__perkinsCloseRequest(); window.__perkinsCloseRequest(); });
        check('關閉保護 (c) 存檔進行中不呼叫 ConfirmQuit', (await quitCalls()) === 0);
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 15000});
        check('關閉保護 (c) 存檔完成後只呼叫一次 ConfirmQuit', (await quitCalls()) === 1);
        check('關閉保護 (c) 存檔中的文字已寫入磁碟', read(ch1).includes('closeGuardConcurrent'));
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (a3) 在途存檔失敗不得被吞掉:關閉流程要走序列化存檔迴圈(錯誤才傳得到),
        // 不能自己吞掉在途失敗再補一次寫入就默默放行。
        await stubConfirmQuit(ch1);
        await page.evaluate(() => window.__perkinsSaveDelay(2000)); // 確保關閉時該次存檔仍在途
        await typeInEditor('closeFailInflight');
        await page.evaluate(() => window.__perkinsSaveFailOnce()); // 下一次實際寫入失敗
        await page.click('[data-testid=save-button]');             // 在途存檔(將失敗)
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000});
        const inflightMsg = await page.textContent('[data-testid=quit-failed-msg]').catch(() => '');
        const inflightText = await page.$eval('[data-testid=quit-rescue-text]', el => el.value).catch(() => '');
        check('關閉保護 (a3) 在途存檔失敗時顯示提示,不默默關閉', (await quitCalls()) === 0);
        check('關閉保護 (a3) 提示帶實際寫入失敗原因', inflightMsg.includes('開發模式模擬寫入失敗'), inflightMsg);
        check('關閉保護 (a3) 救援原文含未落盤的文字', inflightText.includes('closeFailInflight'), `len=${inflightText.length}`);
        await page.click('[data-testid=quit-cancel]');
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000});
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (a4) 存檔途中繼續打字 → 存檔失敗:提示與「複製全文」必須是最新文字,
        // 不能用存檔前(關閉流程開頭)取好的救援快照。
        await stubConfirmQuit(ch1);
        await page.evaluate(() => {
            window.__copiedText = null;
            navigator.clipboard.writeText = t => { window.__copiedText = t; return Promise.resolve(); };
        });
        await typeInEditor('rescueLateBefore');
        await page.evaluate(() => window.__perkinsSaveDelay(2500)); // 存檔停住,留打字時間
        await page.evaluate(() => window.__perkinsSaveFailOnce());  // 這輪寫入會失敗
        await triggerClose();
        await typeInEditor('rescueLateAfter'); // 存檔途中繼續打字
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 15000});
        const lateText = await page.$eval('[data-testid=quit-rescue-text]', el => el.value).catch(() => '');
        check('關閉保護 (a4) 存檔失敗時提示是最新文字(含存檔途中新打的字)',
            lateText.includes('rescueLateBefore') && lateText.includes('rescueLateAfter'), `len=${lateText.length}`);
        await page.click('[data-testid=quit-copy]', {timeout: 3000});
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const lateCopied = await page.evaluate(() => window.__copiedText || '');
        check('關閉保護 (a4) 複製全文也是最新文字',
            lateCopied === lateText && lateCopied.includes('rescueLateAfter'), `len=${lateCopied.length}`);
        check('關閉保護 (a4) 存檔失敗未放行', (await quitCalls()) === 0);
        await page.click('[data-testid=quit-cancel]');
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000});
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (b) 存檔失敗:顯示提示,取消不關、明確選「仍要關閉」才關
        await page.evaluate(() => {
            window.__perkinsSaveFail();
            window.__confirmCalls = 0;
            window.confirm = () => { window.__confirmCalls++; return true; }; // 假設質:實作若用 confirm 就會被算到
        });
        await stubConfirmQuit(null);
        await typeInEditor('closeGuardFail');
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000});
        const quitFailMsg = await page.textContent('[data-testid=quit-failed-msg]');
        check('關閉保護 (b) 提示含目標路徑與失敗原因',
            quitFailMsg.includes(ch1) && quitFailMsg.includes('存檔失敗') && quitFailMsg.includes('開發模式模擬存檔失敗'), quitFailMsg);
        check('關閉保護 (b) 未使用 window.confirm', (await page.evaluate(() => window.__confirmCalls ?? 0)) === 0);
        check('關閉保護 (b) 存檔失敗時未呼叫 ConfirmQuit', (await quitCalls()) === 0);
        // 提示開著時再按關閉:不得再開一份流程
        await triggerClose();
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        check('關閉保護 (b) 提示開著時重複關閉不重啟流程', (await quitCalls()) === 0 && (await page.$$('[data-testid=quit-prompt]')).length === 1);
        await shot('55-quit-save-failed');
        // 先取消(不重設任何旗標),再讓存檔失敗一次並直接再按關閉 → 提示必須重現,代表流程已解鎖
        await page.click('[data-testid=quit-cancel]');
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000});
        check('關閉保護 (b) 取消後仍未呼叫 ConfirmQuit', (await quitCalls()) === 0);
        check('關閉保護 (b) 取消後視窗仍在', await page.isVisible('[data-testid=titlebar]'));
        check('關閉保護 (b) 取消後磁碟仍未寫入未存字', !read(ch1).includes('closeGuardFail'));
        await page.evaluate(() => window.__perkinsSaveFail()); // 只重設「模擬失敗」,不動流程旗標
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000});
        check('關閉保護 (b) 取消後直接再關閉,提示會重現且未呼叫 ConfirmQuit',
            (await page.$$('[data-testid=quit-prompt]')).length === 1 && (await quitCalls()) === 0);
        await page.click('[data-testid=quit-force]');
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 10000});
        check('關閉保護 (b) 明確選擇仍要關閉才呼叫 ConfirmQuit 一次', (await quitCalls()) === 1);

        // (d) 根層錯誤畫面下仍能走完關閉流程(監聽在 React 樹之外)
        await stubConfirmQuit(null);
        await page.evaluate(() => window.__perkinsCrash('root'));
        await page.waitForSelector('[data-testid=root-error]', {timeout: 10000});
        check('關閉保護 (d) 錯誤畫面下標題欄仍在', await page.isVisible('[data-testid=titlebar]'));
        await triggerClose();
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 10000});
        check('關閉保護 (d) 錯誤畫面下關閉流程仍完成一次', (await quitCalls()) === 1);

        // (e) 根層崩潰且緊急存檔「進行中」:關閉要等存檔結束才放行
        await freshWorkspace();
        await stubConfirmQuit(ch1);
        await typeInEditor('crashSavingText');
        await page.evaluate(() => window.__perkinsSaveDelay(1500));
        await page.click('[data-testid=save-button]'); // 讓在途存檔停住
        await page.evaluate(() => window.__perkinsCrash('root'));
        await page.waitForSelector('[data-testid=root-error]', {timeout: 10000});
        await triggerClose();
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        check('關閉保護 (e) 緊急存檔進行中不先放行', (await quitCalls()) === 0);
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 20000});
        const crashSavingCall = await page.evaluate(() => window.__quitCalls[0] || null);
        check('關閉保護 (e) 存檔結束後放行一次', (await quitCalls()) === 1);
        check('關閉保護 (e) 放行當下磁碟已有最新文字',
            !!crashSavingCall && typeof crashSavingCall.disk === 'string' && crashSavingCall.disk.includes('crashSavingText'),
            `diskLen=${crashSavingCall && crashSavingCall.disk ? crashSavingCall.disk.length : 'null'}`);
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (f) 根層崩潰且緊急存檔「失敗」:關閉要拿同一份救援原文出提示,不能直接放棄
        await freshWorkspace();
        await stubConfirmQuit(null);
        await typeInEditor('crashFailText');
        await page.evaluate(() => { window.__perkinsSaveFail(); window.__perkinsCrash('root'); });
        await page.waitForSelector('[data-testid=root-error]', {timeout: 10000});
        await page.waitForSelector('[data-testid=emergency-save][data-save-state=failed]', {timeout: 10000});
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000});
        const crashPromptText = await page.$eval('[data-testid=quit-rescue-text]', el => el.value).catch(() => '');
        check('關閉保護 (f) 崩潰存檔失敗後關閉顯示同一份救援原文', crashPromptText.includes('crashFailText'), `len=${crashPromptText.length}`);
        const crashPromptMsg = await page.textContent('[data-testid=quit-failed-msg]').catch(() => '');
        check('關閉保護 (f) 提示帶崩潰存檔的失敗原因', crashPromptMsg.includes('開發模式模擬存檔失敗'), crashPromptMsg);
        check('關閉保護 (f) 未呼叫 ConfirmQuit', (await quitCalls()) === 0);
        // 取消後不重設任何狀態,直接再按關閉:提示必須重現(不得把最後一次失敗當成已處理)
        await page.click('[data-testid=quit-cancel]');
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000});
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000});
        check('關閉保護 (f) 取消後不重設再關閉,提示仍重現且未呼叫 ConfirmQuit',
            (await page.$$('[data-testid=quit-prompt]')).length === 1 && (await quitCalls()) === 0);
        await page.click('[data-testid=quit-force]');
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 10000});
        check('關閉保護 (f) 明確選擇仍要關閉才呼叫 ConfirmQuit 一次', (await quitCalls()) === 1);

        // (g) Radix 對話框開著時:標題欄關閉鈕與關閉提示的按鈕都要真的點得到
        // Radix modal 會把 body 設成 pointer-events:none,用真實滑鼠點(page.click)才驗得出來。
        await freshWorkspace();
        await typeInEditor('dialogGuardText');
        await page.click('[data-testid=open-versions]');
        await page.waitForSelector('[role=dialog]', {timeout: 10000});
        // 標題欄關閉鈕:用 WailsInvoke 替身攔下 "Q"(證明點擊真的送到按鈕),不真的送給 Go
        await page.evaluate(() => {
            window.__quitInvokes = 0;
            const orig = window.WailsInvoke.bind(window);
            window.WailsInvoke = m => { if (m === 'Q') { window.__quitInvokes++; return; } return orig(m); };
        });
        await page.click('[data-testid=win-close]', {timeout: 3000});
        check('標題欄 對話框開著時關閉鈕點得到', (await page.evaluate(() => window.__quitInvokes)) === 1);
        // 剛剛對標題欄的點擊可能被 Radix 當成「點到外面」而關掉對話框;要驗的是「關閉提示出現
        // 之前對話框確實開著」,被關掉就重開。
        if (!(await page.$('[role=dialog]'))) {
            await page.click('[data-testid=open-versions]');
            await page.waitForSelector('[role=dialog]', {timeout: 10000});
        }
        const dialogOpenBefore = !!(await page.$('[role=dialog]'));
        // 複製全文:先換成可計數的剪貼簿替身(真實滑鼠點擊,不以 evaluate 直接呼叫)
        await page.evaluate(() => {
            window.__copyCalls = 0;
            navigator.clipboard.writeText = () => { window.__copyCalls++; return Promise.resolve(); };
        });
        // 明確套用 Radix modal 的「body pointer-events:none」條件:審查者回報的環境會如此,
        // 本機 Radix 版本實測 body 不一定會被設成 none,不能依賴別人的版本行為。
        await page.evaluate(() => { document.body.style.pointerEvents = 'none'; });
        await stubConfirmQuit(null);
        await page.evaluate(() => window.__perkinsSaveFail());
        await triggerClose();
        const promptAppeared = await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).then(() => true).catch(() => false);
        const modalState = await page.evaluate(() => {
            const prompt = document.querySelector('[data-testid=quit-prompt]');
            const bar = document.querySelector('[data-testid=titlebar]');
            return {
                dialog: !!document.querySelector('[role=dialog]'),
                bodyPE: document.body.style.pointerEvents,
                promptPE: prompt ? getComputedStyle(prompt).pointerEvents : 'missing',
                barPE: bar ? getComputedStyle(bar).pointerEvents : 'missing',
            };
        });
        check('關閉提示 對話框開著且 body 不可點時,提示與標題欄拉回 pointer-events:auto',
            dialogOpenBefore && promptAppeared && modalState.dialog && modalState.bodyPE === 'none'
                && modalState.promptPE === 'auto' && modalState.barPE === 'auto',
            JSON.stringify({before: dialogOpenBefore, appeared: promptAppeared, ...modalState}));
        // 焦點必須真的在提示內:提示自己是一個 Radix Dialog,會成為最上層 focus scope
        const focusState = await page.evaluate(() => ({
            inside: !!document.activeElement?.closest?.('[data-testid=quit-prompt-box]'),
            where: document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '',
        }));
        check('關閉提示 開著對話框時焦點在提示內', focusState.inside, JSON.stringify(focusState));
        await page.click('[data-testid=quit-copy]', {timeout: 3000});
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        check('關閉提示 開著對話框時「複製全文」點得到', (await page.evaluate(() => window.__copyCalls)) === 1);
        await page.click('[data-testid=quit-cancel]', {timeout: 3000});
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000});
        check('關閉提示 開著對話框時「取消」點得到',
            !(await page.$('[data-testid=quit-prompt]')) && (await quitCalls()) === 0);

        // 鍵盤:Tab 只能在提示內移動(焦點不能被原本的對話框搶回去)
        await page.evaluate(() => window.__perkinsSaveFail());
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000});
        const promptIds = ['quit-rescue-text', 'quit-copy', 'quit-cancel', 'quit-force'];
        const trail = [];
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Tab');
            trail.push(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? ''));
        }
        check('關閉提示 開著對話框時 Tab 只在提示內移動', trail.every(t => promptIds.includes(t)), JSON.stringify(trail));
        let atForce = false;
        for (let i = 0; i < 6 && !atForce; i++) {
            await page.keyboard.press('Tab');
            atForce = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'quit-force');
        }
        check('關閉提示 可用 Tab 移到「仍要關閉」', atForce);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 10000});
        check('關閉提示 開著對話框時 Enter 觸發「仍要關閉」', (await quitCalls()) === 1);

        // 滑鼠路徑也要成立(第一輪的要求):再來一輪用 page.click 點「仍要關閉」
        await page.evaluate(() => window.__perkinsSaveFail());
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000});
        await page.click('[data-testid=quit-force]', {timeout: 3000});
        await page.waitForFunction(() => (window.__quitCalls || []).length === 2, null, {timeout: 10000});
        check('關閉提示 開著對話框時「仍要關閉」滑鼠點得到', (await quitCalls()) === 2);

        // Escape = 取消:提示收起、不關視窗、不呼叫 ConfirmQuit,也不動底下開著的對話框
        await page.evaluate(() => window.__perkinsSaveFail());
        await triggerClose();
        const escAppeared = await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).then(() => true).catch(() => false);
        const callsBeforeEsc = await quitCalls();
        const escActive = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '');
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000});
        const escGone = !(await page.$('[data-testid=quit-prompt]'));
        const escDbg = await page.evaluate(() => ({
            prompts: document.querySelectorAll('[data-testid=quit-prompt]').length,
            hosts: document.querySelectorAll('[data-testid=quit-prompt-host]').length,
        }));
        const escCalls = await quitCalls();
        const escBar = await page.isVisible('[data-testid=titlebar]');
        check('關閉提示 Escape 等於取消(收起、未呼叫 ConfirmQuit、視窗還在)',
            escAppeared && escGone && escCalls === callsBeforeEsc && escBar,
            JSON.stringify({appeared: escAppeared, gone: escGone, before: callsBeforeEsc, after: escCalls, bar: escBar, active: escActive, ...escDbg}));

        // 收尾:關掉可能還開著的版本對話框,確認 body 的 pointer-events 與畫面都回到可操作
        await page.keyboard.press('Escape');
        await page.waitForSelector('[role=dialog]', {state: 'detached', timeout: 5000});
        await page.evaluate(() => { document.body.style.pointerEvents = ''; }); // 還原模擬的 Radix 條件
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        check('關閉提示 收掉後 body 回復可點', await page.evaluate(() =>
            getComputedStyle(document.body).pointerEvents === 'auto'));

        // (h) 聊天浮窗拖到最上方:停在標題欄底緣,拖曳列完整可見且可操作
        if (!(await page.isVisible('[data-testid=chat-window]'))) await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const dragBar = await page.locator('[data-testid=chat-window] .cursor-move').first().boundingBox();
        await page.mouse.move(dragBar.x + 60, dragBar.y + 16);
        await page.mouse.down();
        await page.mouse.move(dragBar.x + 60, 2, {steps: 8}); // 想拖到比標題欄更高
        await page.mouse.up();
        await settle(80, 600); // 等 UI 更新(原固定等 200ms)
        const chatBox = await page.locator('[data-testid=chat-window]').boundingBox();
        check('聊天浮窗 拖到最上方時停在標題欄底緣', !!chatBox && Math.abs(chatBox.y - 32) < 2, JSON.stringify({y: chatBox && chatBox.y}));
        const dragBarAfter = await page.locator('[data-testid=chat-window] .cursor-move').first().boundingBox();
        check('聊天浮窗 拖曳列完整可見(未被標題欄蓋住)',
            !!dragBarAfter && dragBarAfter.y >= 32 - 1 && dragBarAfter.height >= 40,
            JSON.stringify({y: dragBarAfter && dragBarAfter.y, h: dragBarAfter && dragBarAfter.height}));
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)', {timeout: 3000}).catch(() => {}); // 軟等待保留:收尾(聊天窗可能已收起)
        await settle(80, 600); // 等 UI 更新(原固定等 200ms)
        check('聊天浮窗 拖曳列按鈕真的可操作', !(await page.isVisible('[data-testid=chat-window]')));
        await shot('57-chat-dragged-top');

    },
};
