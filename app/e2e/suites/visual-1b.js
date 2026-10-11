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
        await page.click('[data-testid=tab-appearance]');
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
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-appearance]');
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
// 接受提案一律經審查視窗(#45 方案 A:卡片只做通知);送出後關掉視窗,讓後續操作點得到底下的編輯器
        const reviewAccept = async text => {
            await page.click(`[data-testid=proposal]:has-text("${text}") [data-testid=review-open]`);
            await page.waitForSelector('[data-testid=proposal-review]');
            await page.click('[data-testid=review-accept]');
            await page.evaluate(() => document.querySelector('[data-testid=review-close]')?.click());
        };
        await reviewAccept('雨停了');
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
            await reviewAccept('甲章原文');
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
            await reviewAccept('甲章已接受');
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
            await page.click('[data-testid=proposal]:has-text("甲章再改") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            await page.click('[data-testid=review-accept]');
            await page.waitForFunction(() => !!window.__perkinsReadGate, null, {timeout: 5000});
            await page.click('[data-testid=review-accept]'); // 提案已接受 → 第二次失敗,其解鎖不得解開第一次仍需要的鎖
            await page.waitForSelector('[data-testid=chat-error]', {timeout: 5000});
            await page.evaluate(() => document.querySelector('[data-testid=review-close]')?.click());
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
            await reviewAccept('甲章再改'); // 卡片顯示原文(#45 方案 A)
            await page.waitForFunction(() => window.__perkinsHolds.length === 1, null, {timeout: 5000});
            await reviewAccept('解鎖後輸入');
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
            '#35 審查視窗內編輯:聊天卡片顯示「已修改」',
            '#45 卡片只做通知:沒有接受/拒絕/編輯,只有「審查」',
            '#35 審查視窗接受:磁碟寫入作者版本、視窗切到下一個待審提案',
            '#35 審查視窗拒絕最後一個:視窗關閉、提案從待審消失(磁碟 rejected)',
            '#35 返工 手動放大後縮到 640:視窗尺寸跟著縮、接受/拒絕仍在畫面內',
            '#35 返工 接受等待中下一張被拒絕:完成後依最新清單切到再下一張',
            '#35 返工 接受失敗(衝突):視窗留在目前提案並顯示衝突',
            '#35 返工 目前提案在視窗外被處理掉:視窗關閉且之後縮放不拋錯',
            '#45 在稿件中顯示:從其他章節切回目標章節並標示原文',
            '#45 在稿件中顯示:原文因前面打字而位移時仍找得到',
            '#45 Ctrl+Shift+Enter:選取後開啟 Perkins Bot 並帶入選取',
            '#45 返工 CRLF 多行原文:直接顯示與在原文外打字後都能標示',
            '#45 返工 640 寬已修改狀態:頁尾按鈕都在視窗內且可點',
            '#40 按「拒絕」先出現選填原因列,確認前提案仍待審;確認後原因送進下一次給 Bot 的系統訊息',
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
            await page.fill('[data-testid=review-edit]', '春日照進了院子,640 寬的已修改狀態。');
            await settle(80, 400);
            const foot640 = await page.evaluate(() => {
                const box = document.querySelector('[data-testid=proposal-review]').getBoundingClientRect();
                const probe = sel => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    return {inBox: r.left >= box.left - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1 && r.top >= box.top - 1,
                            hits: !!at && (el.contains(at) || at.contains(el))};
                };
                return {reveal: probe('[data-testid=review-reveal]'), reset: probe('[data-testid=review-reset]'),
                        reject: probe('[data-testid=review-reject]'), accept: probe('[data-testid=review-accept]')};
            });
            revCheck(REV_CHECKS[21], ['reveal', 'reset', 'reject', 'accept'].every(k => foot640[k]?.inBox && foot640[k]?.hits), JSON.stringify(foot640));
            await page.click('[data-testid=review-reset]');
            await settle(80, 300);
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
            // --- 返工:手動放大後縮成 640,尺寸上限跟著可見範圍,頁尾按鈕仍可點(PR #64 審查 Major) ---
            await page.setViewportSize({width: 640, height: 672});
            await settle(80, 900);
            const big640 = await page.evaluate(() => {
                const r = document.querySelector('[data-testid=proposal-review]').getBoundingClientRect();
                const a = document.querySelector('[data-testid=review-accept]').getBoundingClientRect();
                const at = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
                return {box: {l: r.left, t: r.top, r: r.right, b: r.bottom}, acc: {r: a.right, b: a.bottom},
                        hits: !!at && !!at.closest('[data-testid=review-accept]'), vw: innerWidth, vh: innerHeight};
            });
            revCheck(REV_CHECKS[13],
                size1.w > 640 && big640.box.l >= -1 && big640.box.t >= -1 && big640.box.r <= big640.vw + 0.5 && big640.box.b <= big640.vh + 0.5
                && big640.acc.r <= big640.vw && big640.acc.b <= big640.vh && big640.hits, JSON.stringify({before: {w: size1.w, h: size1.h}, big640}));
            await page.setViewportSize({width: 1440, height: 900});
            await settle(80, 900);
            if (!(await page.$('[data-testid=inspector]')) && (await page.$('[data-testid=toggle-inspector]'))) {
                await page.click('[data-testid=toggle-inspector]');
                await settle(80, 600);
            }
            // --- #45 在稿件中顯示:先切到別章再按,應切回目標章節並標示原文 ---
            const flashText = () => page.evaluate(() => [...document.querySelectorAll('.cm-ai-flash')].map(e => e.textContent).join(''));
            await page.click('[data-testid=review-close]');
            await page.locator('[data-testid=chapter-row]:has-text("第一章")').first().click({timeout: 15000});
            await page.waitForFunction(() => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('第一章'), null, {timeout: 15000});
            await page.click('[data-testid=proposal]:has-text("春日在望") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            await page.click('[data-testid=review-reveal]');
            await page.waitForFunction(() => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('審查視窗'), null, {timeout: 15000});
            await page.waitForSelector('.cm-ai-flash', {timeout: 5000});
            const rv1 = await flashText();
            revCheck(REV_CHECKS[17], rv1 === '春日在望。', JSON.stringify({flash: rv1}));
            // 在原文前面打字(未存):提案記錄的位置已位移,仍要找到唯一的原文
            await page.click('[data-testid=review-close]');
            await page.waitForSelector('.cm-ai-flash', {state: 'detached', timeout: 6000}); // 等上一次標示消失,下面才量得到新的標示
            await page.click('.cm-line >> nth=0'); // 點第一行(.cm-content 中央可能被 Bot 浮窗蓋住)
            await page.keyboard.press('Control+Home');
            await page.keyboard.type('序');
            await settle(80, 400);
            const shifted = await page.evaluate(() => document.querySelector('.cm-content').innerText.startsWith('序'));
            await page.click('[data-testid=proposal]:has-text("春日在望") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            await page.click('[data-testid=review-reveal]');
            await page.waitForSelector('.cm-ai-flash', {timeout: 5000});
            const rv2 = await flashText();
            revCheck(REV_CHECKS[18], shifted && rv2 === '春日在望。', JSON.stringify({shifted, flash: rv2}));
            await page.click('[data-testid=review-close]');
            await page.click('.cm-line >> nth=0');
            await page.keyboard.press('Control+Home');
            await page.keyboard.press('Delete'); // 拿掉剛打的字,內容回到原樣
            await page.keyboard.press('Control+s');
            await settle(80, 700);
            await page.click('[data-testid=proposal]:has-text("春日在望") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            // --- 卡片只做通知;編輯在審查視窗做,卡片顯示「已修改」 ---
            await page.fill('[data-testid=review-edit]', '春日照進了院子,麻雀在叫。');
            await settle(80, 500);
            const cardAfterEdit = await page.evaluate(() => {
                const card = document.querySelector('[data-testid=proposal]:not([hidden])');
                return {txt: card?.textContent || '', controls: card ? [...card.querySelectorAll('button, textarea')].map(e => e.textContent.trim() || e.tagName) : []};
            });
            revCheck(REV_CHECKS[9], cardAfterEdit.txt.includes('已修改'), JSON.stringify(cardAfterEdit));
            revCheck(REV_CHECKS[10], cardAfterEdit.controls.length === 1 && cardAfterEdit.controls[0] === '審查', JSON.stringify(cardAfterEdit));
            await page.fill('[data-testid=review-edit]', '春日終究來了。');
            await settle(80, 500);
            // --- 接受:磁碟寫入作者版本、視窗切到下一個 ---
            await page.click('[data-testid=review-accept]');
            await waitDisk(revRel, '春日終究來了。');
            await settle(80, 900);
            const h5 = await revHead();
            revCheck(REV_CHECKS[11],
                read(revRel).includes('春日終究來了。') && !read(revRel).includes('春日在望。')
                && JSON.parse(read('.perkins/proposals/20261010-150100-revb.json')).status === 'accepted'
                && h5.original === '秋風起了。' && h5.count === '第 1 / 1 個', JSON.stringify({head: h5, disk: read(revRel)}));
            // --- 拒絕最後一個:先填選填原因(#40),確認後視窗關閉、提案從待審消失 ---
            await page.click('[data-testid=review-reject]');
            await settle(80, 300);
            const reasonRow = await page.evaluate(() => !!document.querySelector('[data-testid=review-reject-reason]'));
            const stillPending = JSON.parse(read('.perkins/proposals/20261010-150000-reva.json')).status === 'pending';
            await page.fill('[data-testid=review-reject-reason]', '節奏太快');
            await page.click('[data-testid=review-reject-confirm]');
            await settle(80, 900);
            const pvSys = await page.evaluate(() => window.go.main.App.PreviewContext({question: 'x'}).then(p => p.messages[0].content));
            revCheck(REV_CHECKS[22], reasonRow && stillPending && pvSys.includes('節奏太快'), JSON.stringify({reasonRow, stillPending, hasReason: pvSys.includes('節奏太快')}));
            const endState = await page.evaluate(() => ({
                win: !!document.querySelector('[data-testid=proposal-review]'),
                cards: [...document.querySelectorAll('[data-testid=proposal]')].map(e => e.textContent),
            }));
            revCheck(REV_CHECKS[12],
                !endState.win && !endState.cards.some(t => t.includes('秋風起了'))
                && JSON.parse(read('.perkins/proposals/20261010-150000-reva.json')).status === 'rejected'
                && !read(revRel).includes('秋風捲起落葉'), JSON.stringify(endState));

            // --- 返工(PR #64 審查):清單在視窗開著時變動、接受失敗 ---
            const errs = [];
            const onErr = e => errs.push(e.message);
            page.on('pageerror', onErr);
            const src2 = '# 審查視窗\n\n甲句。\n\n乙句。\n\n丙句。\n';
            projWrite(revRel, src2);
            const mk2 = (id, original) => {
                const at = Buffer.byteLength(src2.slice(0, src2.indexOf(original)));
                projWrite(`.perkins/proposals/${id}.json`, JSON.stringify({
                    id, createdAt: '2026-10-10T16:00:00+08:00', model: 'E2E審查', target: revRel, original, replacement: original.replace('句', '改'),
                    rationale: 'E2E 清單變動', assumptions: [],
                    baseHash: require('crypto').createHash('sha256').update(src2).digest('hex'),
                    start: at, end: at + Buffer.byteLength(original), status: 'pending',
                }, null, 2));
            };
            mk2('20261010-160300-revx', '甲句。');
            mk2('20261010-160200-revy', '乙句。');
            mk2('20261010-160100-revz', '丙句。');
            await page.evaluate(() => window.__perkinsRefreshProposals());
            await settle(80, 700);
            await page.click('[data-testid=proposal]:has-text("甲句") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            await settle(80, 500);
            try {
                // 接受甲句卡在後端期間,從聊天卡片拒絕乙句;放行後應接丙句(依最新清單,不是點擊當下的舊清單)
                await page.evaluate(() => {
                    const app = window.go.main.App;
                    window.__revOrigAccept = app.AcceptProposal;
                    let release;
                    window.__revGate = new Promise(r => { release = r; });
                    window.__revRelease = release;
                    app.AcceptProposal = (...a) => window.__revGate.then(() => window.__revOrigAccept(...a));
                });
                await page.click('[data-testid=review-accept]');
                await settle(80, 400);
                await page.evaluate(() => window.go.main.App.RejectProposal('20261010-160200-revy', '').then(() => window.__perkinsRefreshProposals()));
                await settle(80, 700);
                await page.evaluate(() => window.__revRelease());
                await waitDisk(revRel, '甲改。');
                await settle(80, 900);
                const hB = await revHead();
                revCheck(REV_CHECKS[14], hB.original === '丙句。' && hB.count === '第 1 / 1 個'
                    && JSON.parse(read('.perkins/proposals/20261010-160200-revy.json')).status === 'rejected', JSON.stringify(hB));
            } finally {
                await page.evaluate(() => { if (window.__revOrigAccept) window.go.main.App.AcceptProposal = window.__revOrigAccept; });
            }
            // 丙句的原文在磁碟上被改掉 → 接受失敗(衝突):視窗留在丙句並顯示衝突,不跳走也不關閉
            projWrite(revRel, read(revRel).replace('丙句。', '丙句被作者改了。'));
            await page.click('[data-testid=review-accept]');
            await settle(80, 1200);
            const conf = await page.evaluate(() => ({
                win: !!document.querySelector('[data-testid=proposal-review]'),
                original: document.querySelector('[data-testid=review-original]')?.textContent,
                text: document.querySelector('[data-testid=proposal-review]')?.textContent || '',
                accept: !!document.querySelector('[data-testid=review-accept]'),
            }));
            revCheck(REV_CHECKS[15], conf.win && conf.original === '丙句。' && conf.text.includes('無法套用') && !conf.accept,
                JSON.stringify({...conf, text: conf.text.slice(-60)}));
            // 目前這張從聊天卡片捨棄:視窗關閉;之後縮放視窗不得拋錯(不能留下已卸載內容的監聽器)
            await page.evaluate(() => window.go.main.App.RejectProposal('20261010-160100-revz', '').then(() => window.__perkinsRefreshProposals()));
            await settle(80, 900);
            await page.setViewportSize({width: 1400, height: 880});
            await settle(80, 500);
            await page.setViewportSize({width: 1440, height: 900});
            await settle(80, 500);
            const winGone = !(await page.$('[data-testid=proposal-review]'));
            page.off('pageerror', onErr);
            revCheck(REV_CHECKS[16], winGone && errs.length === 0
                && JSON.parse(read('.perkins/proposals/20261010-160100-revz.json')).status === 'rejected', JSON.stringify({winGone, errs}));
            // --- #45 (c) Ctrl+Shift+Enter:選取後直接詢問 Perkins Bot ---
            if (await page.$('[data-testid=chat-window]:visible')) await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.press('ArrowUp'); // 檔尾是空行:選上一行的文字
            await page.keyboard.press('End');
            await page.keyboard.press('Shift+Home');
            await page.keyboard.press('Control+Shift+Enter');
            await page.waitForSelector('[data-testid=chat-window]:visible', {timeout: 5000});
            await settle(80, 500);
            const askChips = await page.textContent('[data-testid=chips]');
            const askFocus = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
            revCheck(REV_CHECKS[19], /選取 \d+ 字/.test(askChips) && askFocus === 'question', JSON.stringify({askChips, askFocus}));
            // --- 返工(PR #66 審查):\r\n 稿件的多行原文;作者在原文外打字後,編輯器全文換成 LF,仍要找得到 ---
            const crRel = 'manuscript/換行測試.md';
            const crSrc = '\ufeff# 換行測試\r\n\r\n甲行\r\n乙行\r\n\r\n末\r\n';
            const crOrig = '甲行\r\n乙行';
            projWrite(crRel, crSrc);
            const crAt = Buffer.byteLength(crSrc.slice(0, crSrc.indexOf(crOrig)));
            projWrite('.perkins/proposals/20261010-170000-crlf.json', JSON.stringify({
                id: '20261010-170000-crlf', createdAt: '2026-10-10T17:00:00+08:00', model: 'E2E審查', target: crRel, original: crOrig, replacement: '甲乙合一',
                rationale: 'E2E \r\n', assumptions: [],
                baseHash: require('crypto').createHash('sha256').update(crSrc).digest('hex'),
                start: crAt, end: crAt + Buffer.byteLength(crOrig), status: 'pending',
            }, null, 2));
            await page.evaluate(() => window.__perkinsRefreshProposals());
            await settle(80, 600);
            if (!(await page.$('[data-testid=chat-window]:visible'))) await page.click('[data-testid=chat-fab]');
            const revealCr = async () => {
                await page.click('[data-testid=proposal]:has-text("甲行") [data-testid=review-open]');
                await page.waitForSelector('[data-testid=proposal-review]');
                await page.click('[data-testid=review-reveal]');
                await page.waitForFunction(() => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('換行測試'), null, {timeout: 15000});
                await page.waitForSelector('.cm-ai-flash', {timeout: 5000});
                const t = await flashText();
                await page.click('[data-testid=review-close]');
                await page.waitForSelector('.cm-ai-flash', {state: 'detached', timeout: 6000});
                return t;
            };
            const cr1 = await revealCr();
            await page.click('.cm-line >> nth=0');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('！');
            await settle(80, 400);
            const crTyped = await page.evaluate(() => document.querySelector('.cm-content').innerText.includes('！'));
            const cr2 = await revealCr();
            revCheck(REV_CHECKS[20], cr1 === '甲行乙行' && crTyped && cr2 === '甲行乙行', JSON.stringify({cr1, crTyped, cr2}));
            await page.click('.cm-line >> nth=0');
            await page.keyboard.press('Control+End');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Control+s');
            await settle(80, 600);
            await page.evaluate(() => window.go.main.App.RejectProposal('20261010-170000-crlf', '').then(() => window.__perkinsRefreshProposals()));
            await settle(80, 500);
        } catch (e) {
            for (const n of REV_CHECKS) if (!revDone.has(n)) check(n, false, e.message);
            await page.keyboard.press('Escape').catch(() => {});
        }
        await page.setViewportSize({width: 1440, height: 900});
        await settle(80, 700);

        // ===== #39 多版本提案:版本切換、接受所選版本寫入磁碟、640 寬元素在視窗內 =====
        // 預先寫好的提案 JSON(含 label/alternatives),照既有 fixture 寫法;不呼叫模型。
        // 用專用章節,不動其他組依賴的章節原始內容。
        const mvRel = 'manuscript/多版本.md';
        const mvSrc = '# 多版本\n\n夜色很美。\n\n雨聲很吵。\n\n風停了。\n';
        projWrite(mvRel, mvSrc);
        await ctx.ensureProject('第一章', 'manuscript');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('x');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await page.locator('[data-testid=chapter-row]:has-text("多版本")').first().click({timeout: 15000});
        await page.waitForFunction(() => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('多版本'), null, {timeout: 15000});
        const mvAt = Buffer.byteLength(mvSrc.slice(0, mvSrc.indexOf('夜色很美。')));
        const mvBase = require('crypto').createHash('sha256').update(mvSrc).digest('hex');
        projWrite('.perkins/proposals/20261011-160000-multi.json', JSON.stringify({
            id: '20261011-160000-multi', createdAt: '2026-10-11T16:00:00+08:00', model: 'E2E多版本', target: mvRel,
            original: '夜色很美。', replacement: '夜色溫柔。', label: '收斂',
            alternatives: [{label: '更誇張', replacement: '夜色張牙舞爪地撲了下來。'}],
            rationale: 'E2E 多版本測試', assumptions: [],
            baseHash: mvBase, start: mvAt, end: mvAt + Buffer.byteLength('夜色很美。'), status: 'pending',
        }, null, 2));
        // 第二個多版本提案(驗「編輯以所選版本為底」)
        const mvAt2 = Buffer.byteLength(mvSrc.slice(0, mvSrc.indexOf('雨聲很吵。')));
        projWrite('.perkins/proposals/20261011-160200-multi2.json', JSON.stringify({
            id: '20261011-160200-multi2', createdAt: '2026-10-11T16:02:00+08:00', model: 'E2E多版本', target: mvRel,
            original: '雨聲很吵。', replacement: '雨聲滴滴答答。',
            alternatives: [{label: '安靜', replacement: '雨聲很輕。'}, {label: '吵', replacement: '雨聲吵得睡不著。'}],
            rationale: 'E2E 多版本編輯底稿', assumptions: [],
            baseHash: mvBase, start: mvAt2, end: mvAt2 + Buffer.byteLength('雨聲很吵。'), status: 'pending',
        }, null, 2));
        // 舊格式提案(沒有 label/alternatives 欄位):照常可讀、可接受,不顯示版本切換
        const mvAt3 = Buffer.byteLength(mvSrc.slice(0, mvSrc.indexOf('風停了。')));
        projWrite('.perkins/proposals/20261011-160100-single.json', JSON.stringify({
            id: '20261011-160100-single', createdAt: '2026-10-11T16:01:00+08:00', model: 'E2E舊格式', target: mvRel,
            original: '風停了。', replacement: '風停了,夜更深了。', rationale: 'E2E 舊格式', assumptions: [],
            baseHash: mvBase, start: mvAt3, end: mvAt3 + Buffer.byteLength('風停了。'), status: 'pending',
        }, null, 2));
        await page.evaluate(() => window.__perkinsRefreshProposals());
        await settle(80, 700);
        const MV_CHECKS = [
            '#39 聊天卡片顯示「2 個版本」(含截圖)',
            '#39 審查視窗顯示版本切換(label 依序),預設第 1 個版本',
            '#39 切換版本:編輯框換成該版本內容',
            '#39 編輯後切換版本不丟掉:各版本的編輯分開保留',
            '#39 接受所選版本:磁碟寫入第 2 個版本(未編輯)',
            '#39 640 寬:版本切換與接受/拒絕都在視窗內可點',
            '#39 編輯第 2 個版本後接受:寫入作者版本(以所選版本為底)',
            '#39 舊格式提案(單一版本)不顯示版本切換,照常接受',
            '#39 Provenance 記錄選了第幾個版本與版本總數',
            '#39 接受第 2 個版本後,稿件標示的是寫入的第 2 個版本',
        ];
        const mvDone = new Set();
        const mvCheck = (name, ok, detail = '') => { mvDone.add(name); check(name, ok, detail); };
        const editVal = () => page.$eval('[data-testid=review-edit]', el => el.value);
        const mvWaitDisk = async (mark) => {
            const t0 = Date.now();
            while (!read(mvRel).includes(mark) && Date.now() - t0 < 5000) await page.waitForTimeout(100);
            return read(mvRel);
        };
        try {
            if (!(await page.$('[data-testid=chat-window]:visible'))) await page.click('[data-testid=chat-fab]');
            await page.waitForSelector('[data-testid=proposal]:has-text("夜色很美")', {timeout: 10000});
            await shot('82-multi-version-card');
            const cardN = await page.$eval('[data-testid=proposal]:has-text("夜色很美") [data-testid=proposal-versions]', el => el.textContent.trim());
            mvCheck(MV_CHECKS[0], cardN === '2 個版本', cardN);

            await page.click('[data-testid=proposal]:has-text("夜色很美") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            await settle(80, 500);
            const labels = await page.$$eval('[data-testid=review-versions] button', els => els.map(e => e.textContent.trim()));
            mvCheck(MV_CHECKS[1], labels.length === 2 && labels[0] === '收斂' && labels[1] === '更誇張'
                && await editVal() === '夜色溫柔。', JSON.stringify(labels));
            await page.click('[data-testid=review-version-1]');
            await settle(80, 300);
            mvCheck(MV_CHECKS[2], await editVal() === '夜色張牙舞爪地撲了下來。', await editVal());
            // 編輯版本 0 → 切到版本 1 → 切回版本 0:編輯保留;版本 1 不受影響
            await page.click('[data-testid=review-version-0]');
            await page.fill('[data-testid=review-edit]', '夜色溫柔(作者改)。');
            await page.click('[data-testid=review-version-1]');
            const v1After = await editVal();
            await page.click('[data-testid=review-version-0]');
            const v0Back = await editVal();
            mvCheck(MV_CHECKS[3], v0Back === '夜色溫柔(作者改)。' && v1After === '夜色張牙舞爪地撲了下來。',
                JSON.stringify({v0Back, v1After}));
            // 640 寬:版本切換與接受/拒絕都在視窗內可點(截圖)
            await page.click('[data-testid=review-version-1]');
            // 640 寬會自動收資訊欄(§17.1 互斥),視窗變寬後不自動重開;回 1280 後要補回,否則後續組(save-flow 場景列)找不到
            const mvInspOpen = !!(await page.$('[data-testid=inspector]'));
            await page.setViewportSize({width: 640, height: 672});
            await settle(80, 900);
            await shot('84-multi-version-review-640');
            const mv640 = await page.evaluate(() => {
                const box = document.querySelector('[data-testid=proposal-review]').getBoundingClientRect();
                const probe = sel => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    return {inBox: r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1,
                            inView: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
                            hits: !!at && (el.contains(at) || at.contains(el))};
                };
                return {v0: probe('[data-testid=review-version-0]'), v1: probe('[data-testid=review-version-1]'),
                        accept: probe('[data-testid=review-accept]'), reject: probe('[data-testid=review-reject]')};
            });
            mvCheck(MV_CHECKS[5], ['v0', 'v1', 'accept', 'reject'].every(k => mv640[k]?.inBox && mv640[k]?.inView && mv640[k]?.hits),
                JSON.stringify(mv640));
            // 回 1280 接受所選的第 2 個版本(不編輯):磁碟寫入第 2 個版本
            await page.setViewportSize({width: 1280, height: 800});
            await settle(80, 900);
            if (mvInspOpen && !(await page.$('[data-testid=inspector]'))) await page.evaluate(() => document.querySelector('[data-testid=toggle-inspector]')?.click());
            await shot('83-multi-version-review');
            await page.click('[data-testid=review-accept]');
            const mvDisk = await mvWaitDisk('夜色張牙舞爪地撲了下來。');
            await page.waitForSelector('.cm-ai-flash', {timeout: 5000}).catch(() => {});
            const mvFlash = await page.evaluate(() => [...document.querySelectorAll('.cm-ai-flash')].map(e => e.textContent).join(''));
            mvCheck(MV_CHECKS[9], mvFlash === '夜色張牙舞爪地撲了下來。', JSON.stringify({flash: mvFlash}));
            const prov = read('.perkins/provenance.jsonl').trim().split('\n').map(l => JSON.parse(l))
                .find(x => x.proposal === '20261011-160000-multi' && x.event === 'accept');
            mvCheck(MV_CHECKS[4], mvDisk.includes('夜色張牙舞爪地撲了下來。') && !mvDisk.includes('夜色溫柔'),
                JSON.stringify({disk: mvDisk, prov}));
            mvCheck(MV_CHECKS[8], prov?.version === 1 && prov?.versions === 2, JSON.stringify(prov));
            await page.evaluate(() => document.querySelector('[data-testid=review-close]')?.click());
            await settle(80, 400);

            // 編輯第 2 個版本後接受:寫入作者版本(以所選版本為底)
            await page.click('[data-testid=proposal]:has-text("雨聲很吵") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            await page.click('[data-testid=review-version-1]');
            await page.fill('[data-testid=review-edit]', '雨聲很輕(作者改)。');
            await settle(80, 300);
            await page.click('[data-testid=review-accept]');
            const mvDisk2 = await mvWaitDisk('雨聲很輕(作者改)。');
            mvCheck(MV_CHECKS[6], mvDisk2.includes('雨聲很輕(作者改)。') && !mvDisk2.includes('雨聲滴滴答答'), JSON.stringify(mvDisk2));
            await page.evaluate(() => document.querySelector('[data-testid=review-close]')?.click());
            await settle(80, 400);

            // 舊格式提案(單一版本):不顯示版本切換,照常接受
            await page.click('[data-testid=proposal]:has-text("風停了") [data-testid=review-open]');
            await page.waitForSelector('[data-testid=proposal-review]');
            await settle(80, 400);
            const noVersions = !(await page.$('[data-testid=review-versions]'));
            await page.click('[data-testid=review-accept]');
            const mvDisk3 = await mvWaitDisk('風停了,夜更深了。');
            mvCheck(MV_CHECKS[7], noVersions && mvDisk3.includes('風停了,夜更深了。'), JSON.stringify({noVersions}));
            await page.evaluate(() => document.querySelector('[data-testid=review-close]')?.click());
        } catch (e) {
            for (const n of MV_CHECKS) if (!mvDone.has(n)) check(n, false, e.message);
            await page.keyboard.press('Escape').catch(() => {});
        }
        await page.setViewportSize({width: 1440, height: 900});
        await settle(80, 700);

        // 收合浮窗,不讓開啟中的浮窗擋住後續組的 chat-fab(冒煙組會再開)
        if (await page.isVisible('[data-testid=chat-window]')) await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
    },
};
