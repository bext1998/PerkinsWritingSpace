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

        // #56 reloadCurrent 競態:接受提案讀檔期間切章,不得把舊章內容放進新章編輯器
        // (之後存檔會寫進新章檔案)。用專用章節,不動其他組依賴的章節原始內容;
        // ReadFile 只對章節 A 卡住(受控 Promise,比照 research R2 覆寫綁定),其他路徑照常。
        const raceA = 'manuscript/重載競態A.md';
        const raceB = 'manuscript/重載競態B.md';
        const raceBSrc = '# 重載競態B\n\n乙章原文。\n';
        projWrite(raceA, '# 重載競態A\n\n甲章原文。\n');
        projWrite(raceB, raceBSrc);
        await ctx.ensureProject('第一章', 'manuscript');
        // 弄髒目前章節存檔觸發 refreshTree,讓側欄出現兩個專用章節
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('x');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await settle(80, 900);
        await page.locator('[data-testid=chapter-row]:has-text("重載競態A")').first().click({timeout: 15000});
        await page.waitForFunction(c => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes(c), '重載競態A', {timeout: 15000});
        const raceSrc = read(raceA);
        const raceAt = raceSrc.indexOf('甲章原文。');
        const raceStart = Buffer.byteLength(raceSrc.slice(0, raceAt));
        projWrite('.perkins/proposals/20261009-130000-race56.json', JSON.stringify({
            id: '20261009-130000-race56', createdAt: '2026-10-09T13:00:00+08:00', model: 'E2E', target: raceA,
            original: '甲章原文。', replacement: '甲章已接受。', rationale: 'E2E 競態測試', assumptions: [],
            baseHash: require('crypto').createHash('sha256').update(raceSrc).digest('hex'),
            start: raceStart, end: raceStart + Buffer.byteLength('甲章原文。'), status: 'pending',
        }, null, 2));
        await page.evaluate(() => window.__perkinsRefreshProposals());
        // 覆寫 ReadFile:只對章節 A 回傳受控 Promise;放行時用原始綁定讀回真實內容,讀完設旗標。
        // try/finally:中途失敗也要放行並還原綁定,不讓後續組卡在被覆寫的 ReadFile
        const gateRead = rel => page.evaluate(rel => {
            window.__perkinsReadOrig = window.__perkinsReadOrig || window.go.main.App.ReadFile;
            window.__perkinsReadDone = false;
            window.go.main.App.ReadFile = (r, ...rest) => {
                if (r === rel) return new Promise(resolve => {
                    window.__perkinsReadGate = () => resolve(window.__perkinsReadOrig(r, ...rest).then(c => { window.__perkinsReadDone = true; return c; }));
                });
                return window.__perkinsReadOrig(r, ...rest);
            };
        }, rel);
        // 放行並等讀檔真的完成,再等 React 套用(或作廢)結果與解除鎖定
        const releaseRead = async () => {
            await page.evaluate(() => window.__perkinsReadGate());
            await page.waitForFunction(() => window.__perkinsReadDone === true, null, {timeout: 5000});
            await settle(80, 900);
        };
        const restoreRead = () => page.evaluate(() => {
            if (window.__perkinsReadGate) window.__perkinsReadGate();
            window.__perkinsReadGate = null;
            if (window.__perkinsReadOrig) window.go.main.App.ReadFile = window.__perkinsReadOrig;
        });
        const waitDisk = async (rel, mark) => {
            const t0 = Date.now();
            while (!read(rel).includes(mark) && Date.now() - t0 < 5000) await page.waitForTimeout(100);
        };
        try {
            await gateRead(raceA);
            await page.click('[data-testid=chat-fab]');
            await page.click('[data-testid=proposal]:has-text("甲章原文") [data-testid=accept]');
            // 接受已送出,重載卡在章節 A 的 ReadFile;等待期間切到章節 B
            await page.waitForFunction(() => !!window.__perkinsReadGate, null, {timeout: 5000});
            await page.locator('[data-testid=chapter-row]:has-text("重載競態B")').first().click({timeout: 15000});
            await page.waitForFunction(c => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes(c), '重載競態B', {timeout: 15000});
            await page.waitForSelector('.cm-content:has-text("乙章原文")', {timeout: 15000});
            await releaseRead();
            const raceCrumbs = await page.textContent('[data-testid=crumbs]');
            const raceBody = await page.textContent('.cm-content');
            check('#56 讀檔卡住期間切章:麵包屑仍是章節 B', raceCrumbs.includes('重載競態B') && !raceCrumbs.includes('重載競態A'), raceCrumbs);
            check('#56 讀檔卡住期間切章:編輯器仍顯示章節 B 內容',
                raceBody.includes('乙章原文') && !raceBody.includes('甲章'), JSON.stringify(raceBody.slice(0, 80)));
            // 在 B 打字存檔(等落盤):磁碟上的 B 不得被寫成 A 章內容
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('乙章標記');
            await page.keyboard.press('Control+s');
            await waitDisk(raceB, '乙章標記');
            const raceBDisk = read(raceB);
            check('#56 讀檔卡住期間切章:存檔後磁碟上的章節 B 不變(未被寫成章節 A 內容)',
                raceBDisk.includes('乙章原文') && raceBDisk.includes('乙章標記') && !raceBDisk.includes('甲章'), JSON.stringify(raceBDisk.slice(0, 80)));

            await restoreRead(); // 第一段結束:還原 ReadFile,下面重開章節 A 要讀真實內容
            // 同一章:接受期間(存檔→套用→重載)編輯器唯讀,打的字不會進編輯器、也就不會被重載覆蓋
            await page.locator('[data-testid=chapter-row]:has-text("重載競態A")').first().click({timeout: 15000});
            await page.waitForSelector('.cm-content:has-text("甲章已接受")', {timeout: 15000});
            const srcA2 = read(raceA);
            const at2 = Buffer.byteLength(srcA2.slice(0, srcA2.indexOf('甲章已接受。')));
            projWrite('.perkins/proposals/20261009-130100-race56b.json', JSON.stringify({
                id: '20261009-130100-race56b', createdAt: '2026-10-09T13:01:00+08:00', model: 'E2E', target: raceA,
                original: '甲章已接受。', replacement: '甲章再改。', rationale: 'E2E 唯讀測試', assumptions: [],
                baseHash: require('crypto').createHash('sha256').update(srcA2).digest('hex'),
                start: at2, end: at2 + Buffer.byteLength('甲章已接受。'), status: 'pending',
            }));
            await page.evaluate(() => window.__perkinsRefreshProposals());
            await gateRead(raceA);
            await page.click('[data-testid=proposal]:has-text("甲章已接受") [data-testid=accept]');
            await page.waitForFunction(() => !!window.__perkinsReadGate, null, {timeout: 5000});
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('接受中輸入');
            const lockedBody = await page.textContent('.cm-content');
            check('#56 接受期間編輯器唯讀:打的字不會進入編輯器', !lockedBody.includes('接受中輸入'), JSON.stringify(lockedBody.slice(-40)));
            await releaseRead();
            const afterBody = await page.textContent('.cm-content');
            check('#56 接受完成後顯示套用後內容,且可再編輯',
                afterBody.includes('甲章再改') && read(raceA).includes('甲章再改'), JSON.stringify(afterBody.slice(-40)));
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('解鎖後輸入');
            check('#56 接受完成後解除唯讀', (await page.textContent('.cm-content')).includes('解鎖後輸入'));
            await page.keyboard.press('Control+s');
            await waitDisk(raceA, '解鎖後輸入');

            // 重複按接受:第二次失敗不得提早解鎖;右鍵「剪下」(程式直接送出的修改)也要被擋
            const srcA3 = read(raceA);
            const at3 = Buffer.byteLength(srcA3.slice(0, srcA3.indexOf('甲章再改。')));
            projWrite('.perkins/proposals/20261009-130200-race56c.json', JSON.stringify({
                id: '20261009-130200-race56c', createdAt: '2026-10-09T13:02:00+08:00', model: 'E2E', target: raceA,
                original: '甲章再改。', replacement: '甲章三改。', rationale: 'E2E 重複接受測試', assumptions: [],
                baseHash: require('crypto').createHash('sha256').update(srcA3).digest('hex'),
                start: at3, end: at3 + Buffer.byteLength('甲章再改。'), status: 'pending',
            }));
            await page.evaluate(() => window.__perkinsRefreshProposals());
            await gateRead(raceA);
            const acc3 = '[data-testid=proposal]:has-text("甲章三改") [data-testid=accept]';
            await page.click(acc3);
            await page.waitForFunction(() => !!window.__perkinsReadGate, null, {timeout: 5000});
            await page.click(acc3); // 提案已接受 → 第二次失敗,其解鎖不得解開第一次仍需要的鎖
            await page.waitForSelector('[data-testid=chat-error]', {timeout: 5000});
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('重複接受後輸入');
            await page.keyboard.press('Shift+Home'); // 選取最後一行,右鍵剪下
            await page.click('.cm-content', {button: 'right'});
            await page.click('div:text-is("剪下")');
            await settle(80, 700);
            const dupBody = await page.textContent('.cm-content');
            check('#56 重複按接受後仍唯讀:打字與右鍵剪下都不會改動編輯器',
                !dupBody.includes('重複接受後輸入') && dupBody.includes('解鎖後輸入'), JSON.stringify(dupBody.slice(-40)));
            await releaseRead();
            check('#56 重複接受:完成後顯示套用後內容', (await page.textContent('.cm-content')).includes('甲章三改'));
            await restoreRead();

            // 版本還原:還原期間關掉對話框繼續打字,也不得被重載覆蓋(還原期間唯讀)
            await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
            await page.click('[data-testid=open-versions]');
            await page.waitForSelector('text=建立快照');
            await page.evaluate(() => { (document.querySelector('ul.w-56 li')).click(); }); // 最新快照:接受「甲章三改」之前
            await page.waitForSelector('[data-testid=restore-file]');
            await gateRead(raceA);
            await page.click('[data-testid=restore-file]');
            await page.click('[data-testid=restore-confirm-go]');
            await page.waitForFunction(() => !!window.__perkinsReadGate, null, {timeout: 5000});
            await page.keyboard.press('Escape');
            await page.waitForSelector('[data-testid=restore-file]', {state: 'hidden'});
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('還原中輸入');
            const restoreBody = await page.textContent('.cm-content');
            check('#56 版本還原期間唯讀:關掉對話框後打的字不會進入編輯器', !restoreBody.includes('還原中輸入'), JSON.stringify(restoreBody.slice(-40)));
            await releaseRead();
            const restoredBody = await page.textContent('.cm-content');
            check('#56 版本還原完成後顯示快照內容', restoredBody.includes('甲章再改') && !restoredBody.includes('甲章三改'), JSON.stringify(restoredBody.slice(-40)));
            await restoreRead();

            // 同章重載重疊:連續接受兩個提案,讀取立即發出但結果暫扣;較新的先回、較舊的後回,
            // 最後畫面必須是兩個提案都套用後的內容(較舊讀取不得倒序覆蓋)
            const srcA4 = read(raceA);
            const mkProp = (id, original, replacement) => {
                const at = Buffer.byteLength(srcA4.slice(0, srcA4.indexOf(original)));
                projWrite(`.perkins/proposals/${id}.json`, JSON.stringify({
                    id, createdAt: '2026-10-09T13:03:00+08:00', model: 'E2E', target: raceA, original, replacement,
                    rationale: 'E2E 重載倒序測試', assumptions: [], baseHash: require('crypto').createHash('sha256').update(srcA4).digest('hex'),
                    start: at, end: at + Buffer.byteLength(original), status: 'pending',
                }));
            };
            mkProp('20261009-130300-race56d', '甲章再改。', '甲章四改。');
            mkProp('20261009-130301-race56e', '解鎖後輸入', '解鎖後五改');
            await page.evaluate(rel => {
                window.__perkinsReadOrig = window.__perkinsReadOrig || window.go.main.App.ReadFile;
                window.__perkinsHolds = [];
                window.go.main.App.ReadFile = (r, ...rest) => {
                    if (r !== rel) return window.__perkinsReadOrig(r, ...rest);
                    const p = window.__perkinsReadOrig(r, ...rest); // 立即讀(取得當下磁碟內容),結果暫扣
                    return new Promise(resolve => window.__perkinsHolds.push(() => resolve(p)));
                };
            }, raceA);
            await page.click('[data-testid=chat-fab]');
            await page.evaluate(() => window.__perkinsRefreshProposals());
            await page.click('[data-testid=proposal]:has-text("甲章四改") [data-testid=accept]');
            await page.waitForFunction(() => window.__perkinsHolds.length === 1, null, {timeout: 5000});
            await page.click('[data-testid=proposal]:has-text("解鎖後五改") [data-testid=accept]');
            await page.waitForFunction(() => window.__perkinsHolds.length === 2, null, {timeout: 5000});
            await page.evaluate(() => window.__perkinsHolds[1]()); // 較新的先回
            await settle(80, 700);
            await page.evaluate(() => window.__perkinsHolds[0]()); // 較舊的後回
            await settle(80, 900);
            const orderBody = await page.textContent('.cm-content');
            check('#56 同章重載倒序回來:畫面是兩個提案都套用後的內容(較舊讀取不覆蓋)',
                orderBody.includes('甲章四改') && orderBody.includes('解鎖後五改') && read(raceA).includes('解鎖後五改'), JSON.stringify(orderBody.slice(-40)));
        } finally {
            await restoreRead();
        }
        // ===== #35 提案審查視窗:專用章節 + 兩個專用提案(內容與聊天卡片共用 edited、同一組接受/拒絕) =====
        await page.setViewportSize({width: 1440, height: 900});
        const revRel = 'manuscript/審查視窗.md';
        projWrite(revRel, '# 審查視窗\n\n春日在望。\n\n秋風起了。\n');
        // 弄髒目前章節存檔觸發 refreshTree,讓專用章節出現在側欄(內容不變)
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('x');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await settle(80, 900);
        await page.locator('[data-testid=chapter-row]:has-text("審查視窗")').first().click({timeout: 15000});
        await page.waitForFunction(c => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes(c), '審查視窗', {timeout: 15000});
        const revSrc = read(revRel);
        const mkRevProp = (id, original, replacement) => {
            const at = Buffer.byteLength(revSrc.slice(0, revSrc.indexOf(original)));
            projWrite(`.perkins/proposals/${id}.json`, JSON.stringify({
                id, createdAt: '2026-10-10T15:00:00+08:00', model: 'E2E審查', target: revRel, original, replacement,
                rationale: 'E2E 審查視窗測試', assumptions: ['測試假設'],
                baseHash: require('crypto').createHash('sha256').update(revSrc).digest('hex'),
                start: at, end: at + Buffer.byteLength(original), status: 'pending',
            }, null, 2));
        };
        // 清單依 id 由大到小:revb(春日在望)在前、reva(秋風起了)在後
        mkRevProp('20261010-150100-revb', '春日在望。', '春日照進了院子。');
        mkRevProp('20261010-150000-reva', '秋風起了。', '秋風捲起落葉。');
        // 先把本組前面留下的假提案收掉,讓「第 i / n 個」的分母確定
        const leftoverProp = '.perkins/proposals/20261005-090000-abc123.json';
        const leftoverJson = JSON.parse(fs.readFileSync(P(leftoverProp), 'utf8'));
        leftoverJson.status = 'rejected';
        projWrite(leftoverProp, JSON.stringify(leftoverJson, null, 2));
        await page.evaluate(() => window.__perkinsRefreshProposals());
        await settle(80, 700);
        // 檢查名稱集中一處:萬一中途抛錯,尚未報告的項目才補成 FAIL(已報告的不重複)
        const REV_CHECKS = [
            '#35 卡片放大審查開啟視窗:顯示對應提案、第 1 / 2 個、檔名與模型',
            '#35 審查視窗「下一個」切到第 2 個待審提案',
            '#35 審查視窗「上一個」回到第 1 個待審提案',
            '#35 Esc 只關閉視窗:兩個提案仍在待審(卡片仍在、磁碟狀態仍 pending)',
            '#35 640 寬:審查視窗完整在畫面內、接受/拒絕可見可點',
            '#35 640 寬:審查視窗內容上下堆疊',
            '#35 1280 寬:審查視窗內容左右並排',
            '#35 標題列可拖曳(視窗跟著移動)',
            '#35 右下角可調整大小(拖曳後尺寸變大)',
            '#35 審查視窗內編輯:聊天卡片同步顯示「已修改」與同一份內容',
            '#35 聊天卡片內編輯:審查視窗同步顯示作者版本',
            '#35 審查視窗接受:磁碟寫入作者版本、視窗切到下一個待審提案',
            '#35 審查視窗拒絕最後一個:視窗關閉、提案從待審消失(磁碟 rejected)',
        ];
        const revDone = new Set();
        const revCheck = (name, ok, detail = '') => { revDone.add(name); check(name, ok, detail); };
        const revHead = () => page.evaluate(() => ({
            target: document.querySelector('[data-testid=review-target]')?.textContent,
            count: document.querySelector('[data-testid=review-count]')?.textContent,
            model: document.querySelector('[data-testid=review-model]')?.textContent,
            original: document.querySelector('[data-testid=review-original]')?.textContent,
            edit: document.querySelector('[data-testid=review-edit]')?.value,
        }));
        const revBox = () => page.evaluate(() => {
            const el = document.querySelector('[data-testid=proposal-review]');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const o = document.querySelector('[data-testid=review-original]').getBoundingClientRect();
            const e = document.querySelector('[data-testid=review-edit]').getBoundingClientRect();
            return {x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom,
                    o: {left: o.left, top: o.top, right: o.right, bottom: o.bottom}, e: {left: e.left, top: e.top, right: e.right, bottom: e.bottom}};
        });
        try {
            // --- 從卡片開啟;顯示對應提案、第 i / n 個 ---
            await page.click('[data-testid=proposal]:has-text("春日在望") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            await settle(80, 500);
            const h1 = await revHead();
            revCheck(REV_CHECKS[0],
                h1.count === '第 1 / 2 個' && h1.original === '春日在望。' && h1.edit === '春日照進了院子。'
                && h1.target === '審查視窗' && h1.model === 'E2E審查', JSON.stringify(h1));
            // --- 下一個 / 上一個 ---
            await page.click('[data-testid=review-next]');
            await settle(80, 400);
            const h2 = await revHead();
            revCheck(REV_CHECKS[1], h2.count === '第 2 / 2 個' && h2.original === '秋風起了。' && h2.edit === '秋風捲起落葉。', JSON.stringify(h2));
            await page.click('[data-testid=review-prev]');
            await settle(80, 400);
            const h3 = await revHead();
            revCheck(REV_CHECKS[2], h3.count === '第 1 / 2 個' && h3.original === '春日在望。' && h3.edit === '春日照進了院子。', JSON.stringify(h3));
            // --- Esc 只關閉視窗,不動提案狀態 ---
            await page.keyboard.press('Escape');
            await page.waitForSelector('[data-testid=proposal-review]', {state: 'detached', timeout: 5000});
            const escCards = await page.$$eval('[data-testid=proposal]', els => els.length);
            revCheck(REV_CHECKS[3],
                escCards === 2 && JSON.parse(read('.perkins/proposals/20261010-150100-revb.json')).status === 'pending'
                && JSON.parse(read('.perkins/proposals/20261010-150000-reva.json')).status === 'pending',
                JSON.stringify({cards: escCards}));
            // --- 先拖到畫面右側,再縮成 640×672:視窗要自己回到可見範圍(#55 的做法),內容改上下堆疊 ---
            await page.click('[data-testid=proposal]:has-text("春日在望") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            await settle(80, 600);
            const grabPad = await page.evaluate(() => {
                const r = document.querySelector('[data-testid=review-titlebar]').getBoundingClientRect();
                return {x: r.left + 150, y: r.top + 18};
            });
            await page.mouse.move(grabPad.x, grabPad.y);
            await page.mouse.down();
            await page.mouse.move(grabPad.x + 700, grabPad.y, {steps: 8});
            await page.mouse.up();
            await settle(80, 400);
            await page.setViewportSize({width: 640, height: 672});
            await settle(80, 900);
            const b640 = await revBox();
            const clickable640 = await page.evaluate(() => {
                const probe = sel => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    return {inView: r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1,
                            hits: !!at && (el.contains(at) || at.contains(el)), disabled: !!el.disabled};
                };
                return {accept: probe('[data-testid=review-accept]'), reject: probe('[data-testid=review-reject]')};
            });
            revCheck(REV_CHECKS[4],
                !!b640 && b640.x >= -1 && b640.y >= -1 && b640.right <= 640.5 && b640.bottom <= 672.5
                && clickable640.accept?.inView && clickable640.accept.hits && !clickable640.accept.disabled
                && clickable640.reject?.inView && clickable640.reject.hits && !clickable640.reject.disabled,
                JSON.stringify({b640, clickable640}));
            revCheck(REV_CHECKS[5], b640.o.bottom <= b640.e.top + 1 && b640.o.right > b640.e.left,
                JSON.stringify({o: b640.o, e: b640.e}));
            await shot('80-proposal-review-640');
            // --- 1280×800:內容左右並排 ---
            await page.setViewportSize({width: 1280, height: 800});
            await settle(80, 900);
            const b1280 = await revBox();
            revCheck(REV_CHECKS[6], b1280.o.right <= b1280.e.left + 1 && Math.abs(b1280.o.top - b1280.e.top) < 2,
                JSON.stringify({o: b1280.o, e: b1280.e}));
            await shot('81-proposal-review-1280');
            // 640 的檢查會觸發 ≤960 的側欄/資訊欄互斥而收掉資訊欄;後面的組(如 save-flow 的 E6)會用到
            // 資訊欄裡的場景清單,跑完窄寬度檢查後把資訊欄還原成原本的開著狀態
            if (!(await page.$('[data-testid=inspector]')) && (await page.$('[data-testid=toggle-inspector]'))) {
                await page.click('[data-testid=toggle-inspector]');
                await settle(80, 600);
            }
            // --- 可拖曳(標題列)與可調整大小(右下角) ---
            await page.setViewportSize({width: 1440, height: 900});
            await settle(80, 900);
            const bar0 = await revBox();
            const grab = await page.evaluate(() => {
                const r = document.querySelector('[data-testid=review-titlebar]').getBoundingClientRect();
                return {x: r.left + 150, y: r.top + 18};
            });
            // 往右下方拖(視窗預設在畫面左側,往右下還有空間;往左會被邊界夾住)
            await page.mouse.move(grab.x, grab.y);
            await page.mouse.down();
            await page.mouse.move(grab.x + 80, grab.y + 40, {steps: 8});
            await page.mouse.up();
            await settle(80, 400);
            const bar1 = await revBox();
            revCheck(REV_CHECKS[7], Math.abs((bar0.x + 80) - bar1.x) <= 3 && Math.abs((bar0.y + 40) - bar1.y) <= 3,
                JSON.stringify({before: {x: bar0.x, y: bar0.y}, after: {x: bar1.x, y: bar1.y}}));
            const corner = await page.evaluate(() => {
                const r = document.querySelector('[data-testid=proposal-review]').getBoundingClientRect();
                return {x: r.right - 2, y: r.bottom - 2};
            });
            await page.mouse.move(corner.x, corner.y);
            await page.mouse.down();
            await page.mouse.move(corner.x + 100, corner.y + 60, {steps: 8});
            await page.mouse.up();
            await settle(80, 400);
            const size1 = await revBox();
            revCheck(REV_CHECKS[8], size1.w > bar1.w + 40 && size1.h > bar1.h + 20,
                JSON.stringify({before: {w: bar1.w, h: bar1.h}, after: {w: size1.w, h: size1.h}}));
            // --- 編輯內容與聊天卡片共用同一份狀態(兩邊互相反映) ---
            await page.fill('[data-testid=review-edit]', '春日照進了院子,麻雀在叫。');
            await settle(80, 500);
            const cardAfterEdit = await page.evaluate(() => {
                const card = document.querySelector('[data-testid=proposal]');
                return {txt: card?.textContent || '', edit: card?.querySelector('[data-testid=proposal-edit]')?.value};
            });
            revCheck(REV_CHECKS[9], cardAfterEdit.txt.includes('已修改') && cardAfterEdit.edit === '春日照進了院子,麻雀在叫。', JSON.stringify(cardAfterEdit));
            await page.fill('[data-testid=proposal]:has-text("春日在望") [data-testid=proposal-edit]', '春日終究來了。');
            await settle(80, 500);
            const h4 = await revHead();
            revCheck(REV_CHECKS[10], h4.edit === '春日終究來了。', JSON.stringify(h4));
            // --- 接受:磁碟寫入作者版本、視窗切到下一個 ---
            await page.click('[data-testid=review-accept]');
            await waitDisk(revRel, '春日終究來了。');
            await settle(80, 900);
            const h5 = await revHead();
            revCheck(REV_CHECKS[11],
                read(revRel).includes('春日終究來了。') && !read(revRel).includes('春日在望。')
                && JSON.parse(read('.perkins/proposals/20261010-150100-revb.json')).status === 'accepted'
                && h5.original === '秋風起了。' && h5.count === '第 1 / 1 個', JSON.stringify({head: h5, disk: read(revRel)}));
            // --- 拒絕最後一個:視窗關閉、提案從待審消失 ---
            await page.click('[data-testid=review-reject]');
            await settle(80, 900);
            const endState = await page.evaluate(() => ({
                win: !!document.querySelector('[data-testid=proposal-review]'),
                cards: [...document.querySelectorAll('[data-testid=proposal]')].map(e => e.textContent),
            }));
            revCheck(REV_CHECKS[12],
                !endState.win && !endState.cards.some(t => t.includes('秋風起了'))
                && JSON.parse(read('.perkins/proposals/20261010-150000-reva.json')).status === 'rejected'
                && !read(revRel).includes('秋風捲起落葉'), JSON.stringify(endState));
        } catch (e) {
            for (const n of REV_CHECKS) if (!revDone.has(n)) check(n, false, e.message);
            await page.keyboard.press('Escape').catch(() => {});
        }
        await page.setViewportSize({width: 1440, height: 900});
        await settle(80, 700);

        // 收合浮窗,不讓開啟中的浮窗擋住後續組的 chat-fab(冒煙組會再開)
        if (await page.isVisible('[data-testid=chat-window]')) await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
    },
};
