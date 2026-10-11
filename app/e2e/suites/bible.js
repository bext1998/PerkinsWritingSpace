// bible — 設定集別名、自訂分類與回歸、寫法檢查
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'bible',
    desc: '設定集別名、自訂分類與回歸、寫法檢查',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // 設定集:補別名 → 索引更新
        await page.click('[data-testid=rail-bible]');
        await page.waitForSelector('[data-testid=entity-row]');
        check('設定集面板列出實體', (await page.$$('[data-testid=entity-row]')).length === 2);
        await page.click('[data-testid=entity-row]:has-text("雷恩")');
        await page.waitForSelector('[data-testid=entity-aliases]');
        await page.fill('[data-testid=entity-aliases]', '隊長、雷');
        await page.click('[data-testid=entity-apply]');
        await page.waitForSelector('.cm-content:has-text("aliases")', {timeout: 5000});
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(800);
        const ren = read('canon/雷恩.md');
        check('設定欄位寫入 frontmatter 且保留本文', ren.includes('aliases:') && ren.includes('隊長') && ren.includes('# 雷恩') && ren.includes('隊長。'), JSON.stringify(ren));
        const ap = await page.$('[data-testid=appearances]') ? await page.textContent('[data-testid=appearances]') : '';
        check('設定的登場索引列出章節', ap.includes('第一章'));
        await shot('07-bible');

        // ===== 設定集自訂分類(SPEC §12.2 與 §16 第 9 項):新增 → 建檔 → 側欄顯示 → 刪除 → 歸其他 =====
        // 每個步驟都設旗標再統一 check:現況(無此功能)要全部 FAIL 且不能中斷後續測試。
        const catWait = sel => page.waitForSelector(sel, {timeout: 5000}).then(() => true).catch(() => false);
        const cat = {manage: false, list: false, add: false, typeSel: false, created: false, usage: false, del: false, retag: false, snap: false, moved: false};
        cat.manage = !!(await page.$('[data-testid=manage-categories]'));
        if (cat.manage) {
            await page.click('[data-testid=manage-categories]');
            if (await catWait('[data-testid=category-list]')) {
                const listTxt = await page.textContent('[data-testid=category-list]').catch(() => '');
                cat.list = listTxt.includes('角色') && listTxt.includes('其他');
            }
            if (cat.list) {
                await page.fill('[data-testid=category-name]', '組織');
                await page.click('[data-testid=category-add]');
                cat.add = await catWait('[data-testid=del-cat-組織]');
                if (cat.add) await shot('80-manage-categories'); // 管理分類介面(含自訂分類與刪除鈕)
            }
            await page.keyboard.press('Escape');
            await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000});
        }

        // 以自訂分類建立設定檔(獨立於管理入口:選單沒長出來也要能 FAIL 而不是中斷)
        let preUnsaved = false; // (回歸#1)刪除前未存的字,宣告在這裡供後續驗證使用
        let r3 = false, r4 = false, r4cycle = false, r4created = false, r5m = false, r5h = false, r9 = false;
        const r4dbg = {};
        await page.click('[data-testid=new-entity]');
        if (await catWait('[role=dialog]')) {
            if (await catWait('[data-testid=entity-type]')) {
                await page.click('[data-testid=entity-type]');
                cat.typeSel = await catWait('[role=option]:has-text("組織")');
                if (cat.typeSel) {
                    await page.click('[role=option]:has-text("組織")');
                    await page.fill('#ename', '天網');
                    await page.click('[role=dialog] button:has-text("建立")');
                    cat.created = await catWait('[data-testid=group-組織] [data-testid=entity-row]:has-text("天網")');
                    if (cat.created) await shot('81-sidebar-custom-category'); // 側欄出現自訂分類分組
                }
                // (回歸#1)刪除前先打字不存:確認刪除要把未存內容先存盤(快照才含最新內容)
                if (cat.created) {
                    await page.click('.cm-content');
                    await page.keyboard.press('Control+End');
                    await page.keyboard.type('未存字');
                    await settle(80, 700); // 等 UI 更新(原固定等 300ms)
                    preUnsaved = !read('canon/天網.md').includes('未存字');
                } else {
                    await page.keyboard.press('Escape');
                }
            } else {
                await page.keyboard.press('Escape');
            }
        }

        // 刪除:先確認(告知幾個設定檔改歸其他)→ 確認後快照 + 改歸其他
        if (cat.add) {
            await page.click('[data-testid=manage-categories]');
            if (await catWait('[data-testid=del-cat-組織]')) {
                await page.click('[data-testid=del-cat-組織]');
                if (await catWait('[data-testid=category-confirm]')) {
                    const cTxt = await page.textContent('[data-testid=category-confirm]').catch(() => '');
                    cat.usage = cTxt.includes('其他') && /1\s*個設定檔/.test(cTxt);
                    if (cat.usage) {
                        // (回歸#5)讓 DeleteCategory 變慢:在途時對話框不可關閉(Esc/外點)、確認鈕停用顯示進行中
                        await page.evaluate(() => {
                            const orig = window.go.main.App.DeleteCategory;
                            window.go.main.App.DeleteCategory = (...a) =>
                                new Promise((res, rej) => setTimeout(() => { orig(...a).then(res, rej); }, 2500));
                            window.__restoreDelete = () => { window.go.main.App.DeleteCategory = orig; };
                        });
                        await page.click('[data-testid=category-confirm-go]');
                        await page.waitForTimeout(600); // 在途:存檔→刪除→重讀
                        const btnMid = await page.evaluate(() => {
                            const b = document.querySelector('[data-testid=category-confirm-go]');
                            return b ? {disabled: !!b.disabled, text: (b.textContent || '').trim()} : null;
                        });
                        const openBefore = !!(await page.$('[data-testid=category-list]'));
                        await page.keyboard.press('Escape');
                        await settle(80, 650); // 等 UI 更新(原固定等 250ms)
                        const openAfterEsc = !!(await page.$('[data-testid=category-list]'));
                        await page.mouse.click(20, 400); // 對話框外(側欄)點擊
                        await settle(80, 650); // 等 UI 更新(原固定等 250ms)
                        const openAfterOutside = !!(await page.$('[data-testid=category-list]'));
                        r3 = openBefore && openAfterEsc && openAfterOutside
                            && !!btnMid && btnMid.disabled && btnMid.text.includes('刪除中');
                        cat.del = await page.waitForSelector('[data-testid=del-cat-組織]', {state: 'detached', timeout: 8000})
                            .then(() => true).catch(() => false);
                        await page.evaluate(() => { if (window.__restoreDelete) window.__restoreDelete(); });
                        // 等刪除真正完成(舊版對話框會提前關閉,不能只靠 detached 判斷)
                        for (let i = 0; i < 50; i++) {
                            if (fs.existsSync(P('canon/天網.md')) && read('canon/天網.md').includes('type: 其他')) break;
                            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
                        }
                    }
                }
            }
            await page.keyboard.press('Escape');
            await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000});
        }

        // 刪除後:檔案 type=其他(名稱與本文保留)、快照存在、側欄分組跟著移動
        const tianWang = fs.existsSync(P('canon/天網.md')) ? read('canon/天網.md') : '';
        cat.retag = tianWang.includes('type: 其他') && tianWang.includes('name: 天網') && tianWang.includes('# 天網');
        cat.snap = (() => {
            const d = P('.perkins/snapshots');
            if (!fs.existsSync(d)) return false;
            return fs.readdirSync(d).some(x => {
                try { return JSON.parse(fs.readFileSync(path.join(d, x, 'meta.json'), 'utf8')).reason === 'before-delete-category'; } catch { return false; }
            });
        })();
        const grpGone = !(await page.$('[data-testid=group-組織]'));
        cat.moved = grpGone && await catWait('[data-testid=group-其他] [data-testid=entity-row]:has-text("天網")');

        check('自訂分類 側欄有「管理分類」入口', cat.manage);
        check('自訂分類 管理對話框列出分類(內建在列)', cat.list);
        check('自訂分類 新增「組織」後出現在清單(有刪除鈕)', cat.add);
        check('自訂分類 新增設定的類型選單含自訂分類', cat.typeSel);
        check('自訂分類 以自訂分類建立設定檔後側欄顯示分組', cat.created);
        check('自訂分類 刪除確認顯示會有 1 個設定檔改歸其他', cat.usage);
        check('自訂分類 確認後分類從管理清單移除', cat.del);
        check('自訂分類 刪除後檔案改歸其他且名稱本文保留', cat.retag);
        check('自訂分類 刪除前有自動快照(before-delete-category)', cat.snap);
        check('自訂分類 刪除後側欄分組移到其他(原分組消失)', cat.moved);

        // (回歸#1)刪除前未存的字:確認刪除時先存盤,刪除後再編輯存檔 type 不得變回舊值
        let r1 = false;
        if (cat.created && preUnsaved && cat.del) {
            await settle(80, 900); // 等 UI 更新(原固定等 500ms)
            const afterDel = read('canon/天網.md');
            const savedNow = afterDel.includes('未存字') && afterDel.includes('type: 其他');
            let keepType = false;
            if (savedNow) {
                await page.click('.cm-content');
                await page.keyboard.press('Control+End');
                await page.keyboard.type('再存字');
                await page.keyboard.press('Control+s');
                const okSaved = await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 10000})
                    .then(() => true).catch(() => false);
                const again = read('canon/天網.md');
                keepType = okSaved && again.includes('再存字') && again.includes('type: 其他') && again.includes('未存字');
            }
            r1 = savedNow && keepType;
        }

        // (回歸#4)已開啟的 EntityHeader:新增分類後類型選單要立即更新(共用分類狀態)
        let r2 = false;
        if (cat.manage && !!(await page.$('[data-testid=entity-header-type]'))) {
            await page.click('[data-testid=manage-categories]');
            if (await catWait('[data-testid=category-name]')) {
                await page.fill('[data-testid=category-name]', '交通工具');
                await page.click('[data-testid=category-add]');
                const added = await catWait('[data-testid=del-cat-交通工具]');
                await page.keyboard.press('Escape');
                await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000});
                if (added && !!(await page.$('[data-testid=entity-header-type]'))) {
                    await page.click('[data-testid=entity-header-type]');
                    r2 = await catWait('[role=option]:has-text("交通工具")');
                    await page.keyboard.press('Escape').catch(() => {}); // 軟等待保留:收尾
                }
            }
            if (!r2) await page.keyboard.press('Escape').catch(() => {}); // 軟等待保留:收尾(r2 失敗時的退場)
        }
        check('自訂分類(回歸#1) 刪除前未存的字先存盤,後續存檔 type 仍為其他', r1);
        check('自訂分類(回歸#4) 新增分類後已開啟的 EntityHeader 類型選單立即更新', r2);

        // (回歸#6)刪除成功但重讀失敗:檔案要被關閉(舊 buffer 不得再存回舊 type),提示重新開啟
        if (cat.manage) {
            await page.click('[data-testid=manage-categories]');
            if (await catWait('[data-testid=category-name]')) {
                await page.fill('[data-testid=category-name]', '組織');
                await page.click('[data-testid=category-add]');
                r4cycle = await catWait('[data-testid=del-cat-組織]');
                r4dbg.cycle = r4cycle;
            }
            await page.keyboard.press('Escape');
            await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000});
            if (r4cycle) {
                await page.click('[data-testid=new-entity]');
                if (await catWait('[data-testid=entity-type]')) {
                    await page.click('[data-testid=entity-type]');
                    if (await catWait('[role=option]:has-text("組織")')) {
                        await page.click('[role=option]:has-text("組織")');
                        await page.fill('#ename', '天網二');
                        await page.click('[role=dialog] button:has-text("建立")');
                        r4created = await catWait('[data-testid=group-組織] [data-testid=entity-row]:has-text("天網二")');
                        r4dbg.created = r4created;
                    } else {
                        await page.keyboard.press('Escape');
                    }
                } else {
                    await page.keyboard.press('Escape');
                }
            }
            if (r4created) {
                // 覆寫 ReadFile:只對天網二失敗(Workspace 刪除後的重讀會撞到)
                await page.evaluate(() => {
                    const orig = window.go.main.App.ReadFile;
                    window.go.main.App.ReadFile = (rel, ...rest) =>
                        rel === 'canon/天網二.md' ? Promise.reject(new Error('模擬重讀失敗')) : orig(rel, ...rest);
                    window.__restoreRead = () => { window.go.main.App.ReadFile = orig; };
                });
                await page.click('[data-testid=manage-categories]');
                if (await catWait('[data-testid=del-cat-組織]')) {
                    await page.click('[data-testid=del-cat-組織]');
                    if (await catWait('[data-testid=category-confirm]')) {
                        r4dbg.confirmSeen = true;
                        await page.click('[data-testid=category-confirm-go]');
                        // 等確認框消失(doDelete 的 catch/完成點)——toast 剛設好,立刻量測
                        await page.waitForSelector('[data-testid=category-confirm]', {state: 'detached', timeout: 8000});
                        const closed = !(await page.$('.cm-content'));
                        const toastTxt = await page.textContent('[data-testid=toast]').catch(() => '');
                        const disk2 = fs.existsSync(P('canon/天網二.md')) ? read('canon/天網二.md') : '';
                        Object.assign(r4dbg, {closed, toast: (toastTxt || '').slice(0, 90), diskHead: disk2.slice(0, 60)});
                        r4 = closed && toastTxt.includes('重新開啟') && disk2.includes('type: 其他') && disk2.includes('天網二');
                    }
                }
                await page.evaluate(() => { if (window.__restoreRead) window.__restoreRead(); });
                await page.keyboard.press('Escape').catch(() => {}); // 軟等待保留:收尾(前一個 Escape 已可能關掉)
                await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000});
            }
        }
        check('自訂分類(回歸#6) 刪除成功但重讀失敗→關閉檔案、磁碟 type 為其他、提示重新開啟', r4, JSON.stringify(r4dbg));

        // (回歸#8,資料安全)預先建立 PROJ-b 目錄並放檔案:舊實作會整目錄 rm -rf;
        // 本輪改用 mkdtemp 唯一目錄,絕不刪除預先存在的目錄,只清本次建立的路徑。
        const guardDir = PROJ + '-b';
        const guardDirExisted = fs.existsSync(guardDir);
        fs.mkdirSync(guardDir, {recursive: true});
        const guardFile = path.join(guardDir, 'PRE-EXISTING.txt');
        const guardFileExisted = fs.existsSync(guardFile);
        if (!guardFileExisted) fs.writeFileSync(guardFile, 'must survive');
        // (回歸#7)A → 書櫃 → B:分類快取綁定作品,B 只顯示自己的分類
        // 用 mkdtemp 建唯一目錄:絕不刪除預先存在的目錄(第三輪返工 #1,資料安全)
        // 路徑統一正斜線:反斜線會讓 CSS 屬性選擇器的 \ 跳脫失敗(\U 等),卡片選擇器永遠匹配不到
        const projB = fs.mkdtempSync(path.join(os.tmpdir(), 'perkins-e2e-b-')).replace(/\\/g, '/');
        fs.mkdirSync(path.join(projB, 'canon'), {recursive: true});
        fs.mkdirSync(path.join(projB, '.perkins'), {recursive: true});
        fs.writeFileSync(path.join(projB, 'perkins.json'), JSON.stringify({name: '乙作品', order: []}, null, 2));
        fs.writeFileSync(path.join(projB, '.perkins', 'categories.json'), JSON.stringify(['乙分類'], null, 2));
        fs.writeFileSync(path.join(projB, 'canon', '乙組織.md'), '---\ntype: 乙分類\nname: 乙組織\naliases: []\n---\n\n# 乙組織\n\n乙作品的設定。\n');
        await page.evaluate(projBPath => {
            window.__lrOrig = window.go.main.App.ListRecent;
            window.go.main.App.ListRecent = () => Promise.resolve([
                {path: projBPath, name: '乙作品', cover: '', missing: false},
            ]);
        }, projB);
        // (回歸#9)可控 Promise:一次性陳舊 EntityTypes(call1=A 掛起、call2=B 掛起且缺之後新增的分類)
        await page.evaluate(() => {
            const orig = window.go.main.App.EntityTypes;
            window.__etGates = {a: {}, b: {}};
            window.__etGates.a.promise = new Promise(r => { window.__etGates.a.release = r; });
            window.__etGates.b.promise = new Promise(r => { window.__etGates.b.release = r; });
            let calls = 0;
            window.go.main.App.EntityTypes = () => {
                calls++;
                if (calls === 1) return window.__etGates.a.promise.then(() => ['角色', '地點', '勢力', '道具', '名詞', '其他']);
                if (calls === 2) return window.__etGates.b.promise.then(() => ['角色', '地點', '勢力', '道具', '名詞', '其他', '乙分類']);
                return orig();
            };
            window.__etRestore = () => { window.go.main.App.EntityTypes = orig; };
        });
        // 觸發 A 的在途查詢(call1)掛起:在 A 新增甲分類(伺服器端真成功,但清單回應被扣住)
        await page.click('[data-testid=manage-categories]');
        if (await catWait('[data-testid=category-name]')) {
            await page.fill('[data-testid=category-name]', '甲分類');
            await page.click('[data-testid=category-add]');
        }
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000});
        await page.click('nav button:has(svg.lucide-house)');
        await page.waitForSelector('[data-testid=bookshelf-title]', {timeout: 20000});
        const cardSel = 'button[title="' + projB + '"], button[title="' + projB.replace(/\//g, '\\') + '"]';
        await page.waitForSelector(cardSel, {timeout: 10000});
        await page.click(cardSel);
        await page.waitForFunction(n => document.querySelector("[data-testid=titlebar-title]")?.textContent.trim() === n, "乙作品", {timeout: 30000});
        await page.click('[data-testid=rail-bible]');
        await page.waitForSelector('[data-testid=manage-categories]');
        await page.click('[data-testid=manage-categories]');
        await catWait('[data-testid=category-list]');
        // (回歸#9)可控完成順序:A 在途回應先返回(不得清掉 B 的在途狀態)→ B 清單變更(
        // 在途期間的刷新要記 pending)→ B 的掛起回應(陳舊、缺乙新增)最後到達(不得覆蓋新清單)
        await page.evaluate(() => { window.__etGates.a.release(); });
        await settle(80, 550); // 等 UI 更新(原固定等 150ms)
        if (await catWait('[data-testid=category-name]')) {
            await page.fill('[data-testid=category-name]', '乙新增分類');
            await page.click('[data-testid=category-add]');
        }
        // 等「若舊碼會啟動的第二份查詢」先落地(約 1s),確保陳舊回應是最後到達的
        await page.waitForTimeout(1000);
        await page.evaluate(() => { window.__etGates.b.release(); });
        await page.waitForTimeout(800); // 陳舊回應 → 補查 → 最新清單
        const bList = await page.textContent('[data-testid=category-list]').catch(() => '');
        r5m = bList.includes('乙分類') && !bList.includes('組織') && !bList.includes('交通工具');
        r9 = bList.includes('乙分類') && bList.includes('乙新增分類');
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000});
        await page.click('[data-testid=entity-row]:has-text("乙組織")');
        await page.waitForSelector('[data-testid=entity-header-type]');
        await page.click('[data-testid=entity-header-type]');
        await page.waitForFunction(() =>
            [...document.querySelectorAll('[role=option]')].some(o => (o.textContent || '').trim() === '乙分類'),
            null, {timeout: 5000});
        const optsB = await page.$$eval('[role=option]', els => els.map(e => (e.textContent || '').trim()));
        r5h = optsB.includes('乙分類') && !optsB.includes('組織') && !optsB.includes('交通工具');
        await page.keyboard.press('Escape').catch(() => {}); // 軟等待保留:收尾(Select 可能已自行關閉)
        // 回到作品 A 繼續後續測試(還原 ListRecent,從最近清單重開)
        await page.evaluate(() => { window.go.main.App.ListRecent = window.__lrOrig; });
        await page.click('nav button:has(svg.lucide-house)');
        await page.waitForSelector('[data-testid=bookshelf-title]', {timeout: 20000});
        await page.waitForSelector('p:has-text("E2E測試")', {timeout: 5000}).catch(() => {}); // 軟等待保留:既有 flaky race(原因未明,見 docs/PROGRESS.md),等不到也由下一行斷言把關
        const cardA = 'button[title="' + PROJ.replace(/\//g, '\\') + '"], button[title="' + PROJ + '"]';
        await page.waitForSelector(cardA, {timeout: 10000});
        await page.click(cardA);
        await page.waitForFunction(n => document.querySelector("[data-testid=titlebar-title]")?.textContent.trim() === n, "E2E測試", {timeout: 30000});
        await page.evaluate(() => { if (window.__etRestore) window.__etRestore(); });
        // (回歸#8)清理:只清本次建立的路徑;預先存在的 guardDir 檔案必須還在
        const guardOk = fs.existsSync(guardFile);
        if (!guardFileExisted) fs.rmSync(guardFile, {force: true});
        if (!guardDirExisted) fs.rmSync(guardDir, {recursive: true, force: true});
        fs.rmSync(projB, {recursive: true, force: true}); // mkdtemp 唯一目錄(新實作),本次建立可清
        check('自訂分類(回歸#5) 刪除在途時對話框不可關閉且確認鈕停用顯示進行中', r3);
        check('自訂分類(回歸#7) A→書櫃→B 後管理清單只顯示 B 的分類', r5m);
        check('自訂分類(回歸#7) A→書櫃→B 後 EntityHeader 只顯示 B 的分類', r5h);
        check('自訂分類(回歸#8) 預先存在的 PROJ-b 目錄與檔案不會被刪除', guardOk);
        check('自訂分類(回歸#9) 在途刷新會補查,陳舊回應最後到達也不覆蓋新清單', r9);

        // 寫法檢查
        await page.click('[data-testid=rail-checks]');
        await page.click('[data-testid=run-variants]');
        await page.waitForSelector('[data-testid=variant]', {timeout: 5000});
        const vs = await page.$$eval('[data-testid=variant]', els => els.map(e => e.textContent));
        check('B3 寫法檢查抓到「艾麗絲」', vs.some(t => t.includes('艾麗絲') && t.includes('艾莉絲')), JSON.stringify(vs));

        // ===== 作品健康檢查(#41,SPEC §0 第 4 條):只在按下時檢查、只報告不修改 =====
        // 專用檔:壞 frontmatter、孤兒摘要、過期摘要、斷連結,以及只含外部/錨點/編碼路徑/程式碼區塊的對照檔(不得誤報)。
        // 測完把專用檔修好/刪除,並用設定頁開關讓前端重讀 tree 與索引,不把痕跡留給後面的測試組。
        const hw = (rel, s) => { const f = P(rel); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, s); };
        const hdel = rel => { try { fs.unlinkSync(P(rel)); } catch {} };
        const hGroup = async c => {
            const sel = `[data-testid=health-group][data-check=${c}]`;
            return (await page.$(sel)) ? (await page.textContent(sel)) : '';
        };
        const hWait = (sel, timeout = 5000) => page.waitForSelector(sel, {timeout}).then(() => true).catch(() => false);
        const hOpenPanel = async () => { if (!(await page.$('[data-testid=run-health]'))) await page.click('[data-testid=rail-checks]'); };
        const hRun = async () => { await page.click('[data-testid=run-health]'); return hWait('[data-testid=health-report]'); };

        await ctx.ensureProject('第一章', 'manuscript');
        await hOpenPanel();
        check('#41 開啟作品不會自動檢查(要按下按鈕才有結果)', !(await page.$('[data-testid=health-report]')));
        // 壞 frontmatter:YAML 解析失敗(bible.Parse 會靜默退回其他/檔名)
        hw('canon/健康壞檔.md', '---\ntype: 角色\nname: [未關閉\n---\n\n# 健康壞檔\n');
        // 孤兒摘要:source 指向不存在的章節
        hw('summaries/孤兒摘要.md', '---\nsource: manuscript/已經不存在.md\nsourceHash: deadbeef\nupdated: 2026-10-10T00:00:00+08:00\n---\n\n孤兒摘要。\n');
        // 過期摘要:章節與 sourceHash 對不上
        hw('summaries/第一章.md', '---\nsource: manuscript/第一章.md\nsourceHash: deadbeef\nupdated: 2026-10-10T00:00:00+08:00\n---\n\n過期摘要。\n');
        // 斷連結(另含程式碼區塊裡的假連結)
        hw('notes/健康連結.md', '# 健康連結\n\n[第一章](../manuscript/第一章.md)\n[斷連結](不存在檔.md)\n\n```\n[程式碼區塊](也不存在.md)\n```\n');
        // 不得誤報的對照檔:外部、mailto、錨點、URL 編碼後存在的路徑
        hw('notes/健康外部連結.md', '# 外部連結\n\n[網站](https://example.com/a.md)\n[信](mailto:a@example.com)\n[錨點](#頂點)\n[編碼](../canon/%E8%89%BE%E8%8E%89%E7%B5%B2.md)\n');

        const ran = await hRun();
        check('#41 按下「開始檢查」後出現結果', ran);
        const fmTxt = await hGroup('frontmatter');
        check('#41 frontmatter 無法解析:列出壞檔與錯誤訊息', fmTxt.includes('canon/健康壞檔.md') && fmTxt.includes('無法解析'), fmTxt);
        const orphTxt = await hGroup('orphan-summary');
        check('#41 孤兒摘要:列出摘要與不存在的章節', orphTxt.includes('summaries/孤兒摘要.md') && orphTxt.includes('manuscript/已經不存在.md'), orphTxt);
        const staleTxt = await hGroup('stale-summary');
        check('#41 摘要可能過期:列出過期摘要', staleTxt.includes('summaries/第一章.md'), staleTxt);
        const linkTxt = await hGroup('broken-link');
        check('#41 斷連結:列出連結所在檔與不存在的目標', linkTxt.includes('notes/健康連結.md') && linkTxt.includes('notes/不存在檔.md'), linkTxt);
        check('#41 外部連結、錨點、編碼路徑、程式碼區塊不誤報',
            !linkTxt.includes('健康外部連結') && !linkTxt.includes('也不存在.md'), linkTxt);
        await shot('08-health');

        // 點問題項目會開啟該檔(斷連結那項指向的檔不存在,所以點 frontmatter 那項)
        const itemSel = '[data-testid=health-group][data-check=frontmatter] [data-testid=health-issue]';
        const clicked = await page.click(itemSel).then(() => true).catch(() => false);
        const opened = clicked && await page.waitForFunction(() =>
            (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('健康壞檔'), null, {timeout: 10000})
            .then(() => true).catch(() => false);
        const crumbsTxt = await page.textContent('[data-testid=crumbs]').catch(() => '');
        check('#41 點問題項目會開啟該檔', opened, `clicked=${clicked} crumbs=${crumbsTxt}`);

        // 如同作者自己動手修:改寫壞檔與斷連結、刪掉孤兒/過期摘要(健康檢查本身不修改任何檔)。
        // 不離開檢查面板也不切換檔案:編輯器停在剛開的壞檔(沒有未存變更,runHealth 的 save 不會蓋回去),
        // 再按一次「開始檢查」——驗的是同一份畫面重跑,不是重新掛載面板。
        hw('canon/健康壞檔.md', '---\ntype: 角色\nname: 健康壞檔\naliases: []\n---\n\n# 健康壞檔\n\n修好了。\n');
        hw('notes/健康連結.md', '# 健康連結\n\n[第一章](../manuscript/第一章.md)\n');
        hdel('summaries/孤兒摘要.md');
        hdel('summaries/第一章.md');
        try { fs.rmdirSync(P('summaries')); } catch {}
        // 同一份畫面再按一次「開始檢查」:等報告文字真的換掉(不是等期待的結果),
        // 沒換就讀到第一份舊報告——沒重算的話下面兩項會 FAIL
        const prevTxt = await page.textContent('[data-testid=health-report]').catch(() => '');
        await page.click('[data-testid=run-health]');
        await page.waitForFunction(p => (document.querySelector('[data-testid=health-report]')?.textContent || '') !== p, prevTxt, {timeout: 10000}).catch(() => {});
        const afterTxt = await page.textContent('[data-testid=health-report]').catch(() => '');
        check('#41 修好後再檢查不再列出',
            afterTxt !== prevTxt && !afterTxt.includes('健康壞檔') && !afterTxt.includes('孤兒摘要') && !afterTxt.includes('健康連結') && !afterTxt.includes('不存在檔'), afterTxt);
        const timeTxt = (await page.$('[data-testid=health-time]')) ? await page.textContent('[data-testid=health-time]') : '';
        check('#41 沒問題時顯示「沒有發現問題」與檢查時間',
            afterTxt.includes('沒有發現問題') && /\d{1,2}:\d{2}:\d{2}/.test(timeTxt), `${afterTxt} | ${timeTxt}`);

        // 清掉專用檔(不留下痕跡給後面的測試組),並用設定頁開關讓前端重讀 tree 與索引
        hdel('canon/健康壞檔.md');
        hdel('notes/健康連結.md');
        hdel('notes/健康外部連結.md');
        await page.click('[data-testid=open-settings]');
        await hWait('[data-testid=settings-page]');
        await page.click('[data-testid=close-settings]');
        await hWait('[data-testid=rail-checks]');
        check('#41 專用檔已清掉(不留痕跡)', !fs.existsSync(P('canon/健康壞檔.md')) && !fs.existsSync(P('notes/健康連結.md'))
            && !fs.existsSync(P('notes/健康外部連結.md')) && !fs.existsSync(P('summaries/第一章.md')));
    },
};
