// search-editor — 搜尋/取代面板、IME 組字防護、編輯器手感(內文比對需新 fixture)
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'search-editor',
    desc: '搜尋/取代面板、IME 組字防護、編輯器手感(內文比對需新 fixture)',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // ===== 搜尋/取代(SPEC §16 第 24 項第一層;返工:安靜精簡兩列面板)=====
        const editorTxt = () => page.$$eval('.cm-content .cm-line', els => els.map(e => e.textContent).join('\n'));
        const openPanel = async key => { await page.keyboard.press(key); await page.waitForSelector('.perkins-search', {timeout: 5000}); };
        await page.setViewportSize({width: 1440, height: 900});
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        const searchRow = (await page.$$('[data-testid=chapter-row]'))[0];
        await searchRow.click();
        await page.waitForSelector('.cm-content');
        await page.keyboard.press('Control+s');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)

        // Ctrl+F 開面板,焦點在搜尋欄(中文 placeholder)。Ctrl+F 只在編輯器聚焦時作用(CodeMirror 慣例),先點回編輯器
        try {
            await page.click('.cm-content');
            await page.keyboard.press('Control+Home');
            await openPanel('Control+f');
            const okFocus = await page.evaluate(() =>
                document.activeElement?.matches('.perkins-search input[name=search]') &&
                document.activeElement.placeholder === '搜尋');
            check('搜尋 Ctrl+F 開啟面板且搜尋欄自動聚焦(中文介面)', okFocus,
                await page.evaluate(() => document.activeElement?.placeholder || '(焦點不在面板)'));
            await shot('65-search-panel-dark');
        } catch (e) { check('搜尋 Ctrl+F 開啟面板且搜尋欄自動聚焦(中文介面)', false, e.message); }

        // 面板精簡:沒有任何核取方塊(區分大小寫/正規/整詞不做)
        try {
            const boxes = await page.$$eval('.perkins-search input[type=checkbox]', els => els.length);
            const labels = await page.textContent('.perkins-search');
            check('搜尋 面板精簡(無區分大小寫/正規/整詞核取方塊)',
                boxes === 0 && !/區分大小寫|正規|整詞/.test(labels), `checkbox=${boxes}`);
        } catch (e) { check('搜尋 面板精簡(無區分大小寫/正規/整詞核取方塊)', false, e.message); }

        // 輸入關鍵字 → Enter:選取比對、高亮、顯示目前第幾個/比對數
        try {
            await page.click('.perkins-search input[name=search]');
            await page.keyboard.type('森林', {delay: 20});
            await page.keyboard.press('Enter');
            await page.waitForSelector('.cm-searchMatch-selected', {timeout: 5000});
            const sel = await page.evaluate(() => document.querySelector('.cm-searchMatch-selected')?.textContent || '');
            check('搜尋 Enter 後選取比對並以主題色高亮', sel.includes('森林'), sel);
            const count = (await page.textContent('.perkins-search .perkins-search-count')).trim();
            check('搜尋 顯示目前第幾個/比對數', /1\s*\/\s*2/.test(count), count);
        } catch (e) {
            check('搜尋 Enter 後選取比對並以主題色高亮', false, e.message);
            check('搜尋 顯示目前第幾個/比對數', false, e.message);
        }

        // Escape 關面板(先確認面板開著,避免「沒開也沒關」的假通過)
        try {
            await page.click('.cm-content');
            await openPanel('Control+f');
            await page.keyboard.press('Escape');
            await page.waitForSelector('.perkins-search', {state: 'detached', timeout: 5000});
            check('搜尋 Escape 關閉面板', true);
        } catch (e) { check('搜尋 Escape 關閉面板', false, e.message); }

        // 面板預設收起取代列;「取代」切換鈕可展開/收起
        try {
            await page.click('.cm-content');
            await openPanel('Control+f');
            const hidden0 = await page.$eval('.perkins-replace-row', el => getComputedStyle(el).display === 'none');
            check('搜尋 面板預設收起取代列', hidden0);
            await page.click('button[name=toggle-replace]');
            const shown = await page.$eval('.perkins-replace-row', el => getComputedStyle(el).display !== 'none');
            check('取代 切換鈕展開取代列', shown);
            await page.click('button[name=toggle-replace]');
            const hidden2 = await page.$eval('.perkins-replace-row', el => getComputedStyle(el).display === 'none');
            check('取代 切換鈕再點收起取代列', hidden2);
        } catch (e) {
            check('搜尋 面板預設收起取代列', false, e.message);
            check('取代 切換鈕展開取代列', false, e.message);
            check('取代 切換鈕再點收起取代列', false, e.message);
        }

        // Ctrl+H:開啟面板並展開取代列,焦點在「取代為」欄
        try {
            await page.click('.cm-content');
            await openPanel('Control+h');
            const okRepl = await page.evaluate(() =>
                document.activeElement?.matches('.perkins-search input[name=replace]') &&
                getComputedStyle(document.querySelector('.perkins-replace-row')).display !== 'none');
            check('取代 Ctrl+H 開啟面板並聚焦「取代為」欄(取代列展開)', okRepl);
        } catch (e) { check('取代 Ctrl+H 開啟面板並聚焦「取代為」欄(取代列展開)', false, e.message); }

        // 回歸(PR #23 審查#1):面板顯示與實際取代條件同步。
        // 面板開著輸入「森林→樹林」,回編輯器選取「天」再按 Ctrl+H:openSearchPanel 會以編輯器選取字
        // 重設 query(天→空),面板若未同步會顯示舊條件,實際全部取代卻刪「天」
        try {
            // 先關掉上一段遺留的開啟面板(取代列展開中),重開才是全新狀態
            await page.keyboard.press('Escape');
            await page.waitForSelector('.perkins-search', {state: 'detached', timeout: 5000});
            await page.click('.cm-content');
            await page.keyboard.press('Control+Home');
            await openPanel('Control+f');
            await page.click('.perkins-search input[name=search]', {clickCount: 3});
            await page.keyboard.type('森林', {delay: 20});
            await page.keyboard.press('Enter');
            await page.click('button[name=toggle-replace]');
            await page.click('.perkins-search input[name=replace]');
            await page.keyboard.type('樹林', {delay: 20});
            // 回編輯器選取「天」:行內文字包在 span 裡,用 TreeWalker 找文字節點;點到字元左緣,Shift+→ 選一個字
            const pos = await page.evaluate(() => {
                const root = document.querySelector('.cm-content');
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                let n;
                while ((n = walker.nextNode())) {
                    const i = (n.textContent || '').indexOf('天');
                    if (i < 0) continue;
                    const r = document.createRange();
                    r.setStart(n, i); r.setEnd(n, i + 1);
                    const rect = r.getBoundingClientRect();
                    if (rect.width === 0) continue;
                    return {x: rect.left + 1, y: rect.top + rect.height / 2};
                }
                return null;
            });
            await page.mouse.click(pos.x, pos.y);
            await page.keyboard.press('Shift+ArrowRight');
            let selChar = await page.evaluate(() => window.getSelection()?.toString() || '');
            for (let tries = 0; selChar !== '天' && tries < 5; tries++) {
                await page.keyboard.press('ArrowLeft');
                await page.keyboard.press('Shift+ArrowRight');
                selChar = await page.evaluate(() => window.getSelection()?.toString() || '');
            }
            await page.keyboard.press('Control+h');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const synced = await page.evaluate(() => ({
                search: document.querySelector('.perkins-search input[name=search]').value,
                replace: document.querySelector('.perkins-search input[name=replace]').value,
                count: document.querySelector('.perkins-search .perkins-search-count').textContent,
                sel: document.querySelector('.cm-searchMatch-selected')?.textContent || '',
            }));
            await page.click('.perkins-search button[name=replaceAll]');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const t2 = await editorTxt();
            check('面板顯示與實際取代條件同步(Ctrl+H 後顯示「天→空」,全部取代移除的正是天)',
                selChar === '天' && synced.search === '天' && synced.replace === '' && synced.count === '1/1' && synced.sel === '天'
                && !t2.includes('天很黑') && t2.includes('很黑'), JSON.stringify({selChar, synced, tail: t2.slice(-40)}));
            check('同步後取代走正常編輯流程(未儲存)', !!(await page.$('[title="尚未儲存"]')));
            await page.keyboard.press('Control+s');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            await page.keyboard.press('Escape');
            await page.waitForSelector('.perkins-search', {state: 'detached', timeout: 5000});
        } catch (e) {
            check('面板顯示與實際取代條件同步(Ctrl+H 後顯示「天→空」,全部取代移除的正是天)', false, e.message);
            check('同步後取代走正常編輯流程(未儲存)', false, e.message);
        }

        // 取代:先加入固定字樣,全部取代,驗證走 onChange → dirty → 存檔流程
        try {
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.press('Enter');
            await page.keyboard.type('搜尋取代目標字,又是搜尋取代目標字。');
            await page.keyboard.press('Control+s');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            await openPanel('Control+h');
            await page.click('.perkins-search input[name=search]', {clickCount: 3});
            await page.keyboard.type('搜尋取代目標字', {delay: 20});
            await page.click('.perkins-search input[name=replace]', {clickCount: 3});
            await page.keyboard.type('改寫後的字', {delay: 20});
            await page.click('.perkins-search button[name=replaceAll]');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const t1 = await editorTxt();
            check('全部取代後內容已改變', !t1.includes('搜尋取代目標字') && (t1.match(/改寫後的字/g) || []).length === 2, t1.slice(-60));
            check('取代走正常編輯流程(狀態為未儲存)', !!(await page.$('[title="尚未儲存"]')));
            await page.keyboard.press('Control+s');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            check('取代結果以正常存檔流程落盤', read(ch1).includes('改寫後的字'));
        } catch (e) {
            check('全部取代後內容已改變', false, e.message);
            check('取代走正常編輯流程(狀態為未儲存)', false, e.message);
            check('取代結果以正常存檔流程落盤', false, e.message);
        }

        // 640×672:收起時單排;展開取代時最多兩排;不得出水平捲軸或按鈕被裁掉
        try {
            // 先關掉上一段遺留的面板(取代列展開中),重開才是全新狀態
            await page.keyboard.press('Escape');
            await page.waitForSelector('.perkins-search', {state: 'detached', timeout: 5000});
            await page.setViewportSize({width: 640, height: 672});
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            await openPanel('Control+f');
            const measure = () => page.evaluate(() => {
                const p = document.querySelector('.perkins-search');
                if (!p) return null;
                const de = document.documentElement;
                const pr = p.getBoundingClientRect();
                const row1 = p.querySelector('.perkins-search-row');
                const clipped = [];
                for (const el of p.querySelectorAll('button,input')) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && (r.right > pr.right + 1 || r.left < pr.left - 1)) clipped.push(el.name || (el.getAttribute('aria-label') || '').slice(0, 6));
                }
                const c = p.querySelector('button[name=close]');
                return {
                    panelH: Math.round(pr.height),
                    row1H: Math.round(row1.getBoundingClientRect().height),
                    replaceVisible: getComputedStyle(p.querySelector('.perkins-replace-row')).display !== 'none',
                    docH: de.scrollWidth > de.clientWidth,
                    clipped,
                    close: !!c && c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().right <= pr.right + 1,
                };
            });
            const m1 = await measure();
            check('搜尋 640×672 收起時單排、無水平捲軸、按鈕不被裁掉',
                !!m1 && !m1.docH && m1.clipped.length === 0 && m1.close && !m1.replaceVisible && m1.panelH <= 40 && m1.row1H <= 32, JSON.stringify(m1));
            await page.click('button[name=toggle-replace]');
            const m2 = await measure();
            check('搜尋 640×672 展開取代時最多兩排、無水平捲軸、按鈕不被裁掉',
                !!m2 && !m2.docH && m2.clipped.length === 0 && m2.close && m2.replaceVisible && m2.panelH <= 76, JSON.stringify(m2));
            await shot('66-search-640-dark-replace');
            await page.click('button[name=toggle-replace]');
            await shot('66-search-640-dark');
        } catch (e) {
            check('搜尋 640×672 收起時單排、無水平捲軸、按鈕不被裁掉', false, e.message);
            check('搜尋 640×672 展開取代時最多兩排、無水平捲軸、按鈕不被裁掉', false, e.message);
        }

        // 兩種主題的面板外觀
        await page.setViewportSize({width: 1280, height: 800});
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        await shot('67-search-dark-1280');
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        try {
            await page.click('.cm-content');
            await openPanel('Control+f');
            await shot('68-search-light');
            await page.keyboard.press('Escape');
        } catch (e) { await shot('68-search-light-error'); }
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('button:has-text("夜間書房")');
        await page.click('[data-testid=close-settings]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)

        // IME 組字(PR #23 審查#2/#3)。三個防護分支的驗證:
        // (a) 合成 InputEvent(isComposing: true):組字中途不提交比對數;提交不同字(一般 input)後才更新。
        // (b) CDP:imeSetComposition 會發真實 composition 事件(旗標生效);keyCode 229 的 Enter/Escape
        //     key='Enter' 才會進 Enter 分支,配合 229 才能驗防護本身)不觸發 findNext/不關面板;
        //     提交與原 query 不同的文字後核對值/比對數/選取;組字結束後一般 Enter(keyCode 13)恢復。
        // 註:無頭環境無真實 IME,真實 IME 建議作者實機確認。
        try {
            await page.setViewportSize({width: 1440, height: 900});
            await page.click('.cm-content');
            await page.keyboard.press('Control+Home');
            await openPanel('Control+f');
            await page.click('.perkins-search input[name=search]', {clickCount: 3});
            await page.keyboard.type('森林', {delay: 20});
            await page.keyboard.press('Enter');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const ime = await page.evaluate(() => {
                const input = document.querySelector('.perkins-search input[name=search]');
                const count = () => document.querySelector('.perkins-search .perkins-search-count').textContent;
                const r = {};
                r.start = count(); // 森林:1/2
                input.value = 'ㄙㄣ'; // 組字中途的暫存字串
                input.dispatchEvent(new InputEvent('input', {bubbles: true, isComposing: true}));
                r.mid = count(); // 不得提交(isComposing 事件層防護)
                input.value = '雷恩'; // 提交與原 query 不同總數的字(森林 total 2 → 雷恩 total 1,營火也是 2 筆會分不出新舊條件)
                input.dispatchEvent(new InputEvent('input', {bubbles: true}));
                r.afterSubmit = count(); // 雷恩:1/1(總數變了,才證明提交真的生效)
                return r;
            });
            check('IME 組字中不提交(isComposing 略過),提交不同字後更新',
                ime.start === '1/2' && ime.mid === ime.start && ime.afterSubmit === '1/1', JSON.stringify(ime));

            // 重新搜尋森林,改用 CDP 驗 keydown 防護(真實 composition 事件讓組字旗標生效)
            await page.click('.perkins-search input[name=search]', {clickCount: 3});
            await page.keyboard.type('森林', {delay: 20});
            await page.keyboard.press('Enter');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const countOf = () => page.evaluate(() => document.querySelector('.perkins-search .perkins-search-count')?.textContent);
            const scrollOf = () => page.evaluate(() => document.querySelector('.cm-scroller').scrollTop);
            const cdp = await page.context().newCDPSession(page);
            const c0 = await countOf(); // 1/2
            const s0 = await scrollOf();
            const doc0 = await editorTxt();
            await cdp.send('Input.imeSetComposition', {text: 'ㄙㄣ', selectionStart: 1, selectionEnd: 1});
            await cdp.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229});
            await cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229});
            await cdp.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 229});
            await cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 229});
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const c1 = await countOf();
            const s1 = await scrollOf();
            const open1 = !!(await page.$('.perkins-search'));
            const doc1 = await editorTxt();
            check('IME(CDP) 組字中 229 的 Enter/Escape 不跳比對、不關面板、文件不變',
                c1 === c0 && s1 === s0 && open1 && doc1 === doc0, `count ${c0}→${c1}, scroll ${s0}→${s1}, open=${open1}`);
            // 提交與原 query 不同的文字,核對值/比對數/選取
            // 事件記錄(診斷用):組字/提交的實際事件流
            await page.evaluate(() => {
                window.__evts = [];
                const input = document.querySelector('.perkins-search input[name=search]');
                for (const t of ['compositionstart', 'compositionend', 'input', 'keydown'])
                    input.addEventListener(t, e => window.__evts.push({t, isComp: !!e.isComposing, keyCode: e.keyCode, text: (e.target?.value || '').slice(0, 12)}));
            });
            // 提交與原 query 不同總數的文字:組字仍在,insertText 會提交組字並結束(森林 total 2 → 雷恩 total 1)
            const doc2 = await editorTxt();
            await cdp.send('Input.insertText', {text: '雷恩'});
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const q2 = await page.$eval('.perkins-search input[name=search]', el => el.value);
            const c2 = await countOf();
            const doc2b = await editorTxt();
            const evts2 = await page.evaluate(() => window.__evts);
            // 提交後的高亮:整份文件只剩雷恩這一筆比對高亮(Enter 前不會有 selected,看一般 searchMatch 即可)
            const hl2 = await page.evaluate(() => {
                const ms = [...document.querySelectorAll('.cm-searchMatch')];
                return {n: ms.length, texts: [...new Set(ms.map(m => m.textContent))]};
            });
            check('IME(CDP) 提交不同文字後更新(值、比對數 1/1、高亮在雷恩、文件不變、組字結束)',
                q2 === '雷恩' && c2 === '1/1' && hl2.n === 1 && hl2.texts[0] === '雷恩' && doc2b === doc2 && evts2.some(x => x.t === 'compositionend'),
                `value=${q2}, count=${c2}, hl=${JSON.stringify(hl2)}, evts=${JSON.stringify(evts2)}`);
            // 組字結束後一般 Enter 恢復:雷恩只有一筆,Enter 後仍選在同一筆(斷言選取與高亮仍在雷恩)
            await cdp.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
            await cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const c3 = await countOf();
            const sel3 = await page.evaluate(() => document.querySelector('.cm-searchMatch-selected')?.textContent || '');
            check('IME(CDP) 組字結束後一般 Enter 恢復(選取仍同步在雷恩比對)',
                sel3 === '雷恩' && c3 === '1/1', `count=${c3}, sel=${sel3}`);
            await page.keyboard.press('Escape');
            await page.waitForSelector('.perkins-search', {state: 'detached', timeout: 5000}).catch(() => {}); // 軟等待保留:收尾(面板可能已關),由後續檢查把關
        } catch (e) {
            check('IME 組字中不提交(isComposing 略過),提交不同字後更新', false, e.message);
            check('IME(CDP) 組字中 229 的 Enter/Escape 不跳比對、不關面板、文件不變', false, e.message);
            check('IME(CDP) 提交不同文字後更新(值、比對數 1/1、選取在雷恩、文件不變、組字結束)', false, e.message);
            check('IME(CDP) 組字結束後一般 Enter 恢復(選取仍同步在雷恩比對)', false, e.message);
        }

        // ===== 編輯器手感(§16 第 24 項第一層):切章位置記憶、縮放穩定、全域 Ctrl+F/H、貼上純文字、長章節量測 =====
        try {
            // --- 貼上的格式處理:CodeMirror 預設只貼純文字;\r\n 統一成 \n(右鍵貼上路徑由前端正規化) ---
            // 無頭環境原生 Ctrl+V 不穩定,用合成 paste 事件驅動同一條 CM paste 處理路徑
            await page.setViewportSize({width: 1440, height: 900});
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            const docText = () => page.evaluate(() => document.querySelector('.cm-content').innerText);
            await page.evaluate(() => {
                const dt = new DataTransfer();
                dt.setData('text/plain', '甲乙\r\n丙丁\r');
                document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
            });
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const pasteTxt = await docText();
            check('貼上(paste 事件)只貼純文字且 \\r\\n 統一成 \\n',
                pasteTxt.includes('甲乙\n丙丁') && !pasteTxt.includes('\r'));
            // 帶 text/html 的剪貼簿資料:只能取 text/plain 圖層(雙格式)
            await page.evaluate(() => {
                const dt = new DataTransfer();
                dt.setData('text/html', '<b>HTML標記不應出現</b>');
                dt.setData('text/plain', '純文字版');
                const el = document.querySelector('.cm-content');
                el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
            });
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const rich = await docText();
            check('貼上含 HTML 格式時只取純文字圖層',
                rich.includes('純文字版') && !rich.includes('HTML標記不應出現'));
            // 右鍵選單「貼上」走前端的 clipboard.readText():\r\n 也要正規化(點擊座標固定在可見編輯區內)
            // 暫時替換 clipboard.readText() 固定回傳含 \r\n 的測試字串(不依賴真剪貼簿,拿掉無頭環境
            // writeText 不生效時的雙軌備援),斷言實際插入內容,再還原替身
            await page.evaluate(() => { if (window.__clipStubs?.orig) navigator.clipboard.writeText = window.__clipStubs.orig; });
            await page.evaluate(() => {
                window.__readOrig = navigator.clipboard.readText.bind(navigator.clipboard);
                navigator.clipboard.readText = async () => '戊己\r\n庚辛';
            });
            const sc = await page.evaluate(() => { const r = document.querySelector('.cm-scroller').getBoundingClientRect(); return {x: r.left + 150, y: r.top + r.height / 2}; });
            await page.mouse.click(sc.x, sc.y, {button: 'right'});
            await page.waitForSelector('.ctxmenu', {timeout: 5000});
            await page.click('.ctxmenu div:text-is("貼上")');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            await page.evaluate(() => { navigator.clipboard.readText = window.__readOrig; delete window.__readOrig; });
            const menuPaste = await docText();
            check('右鍵選單貼上同樣把 \r\n 統一成 \n(替身固定內容,驗實際插入)',
                menuPaste.includes('戊己\n庚辛') && !menuPaste.includes('\r'), `tail=${JSON.stringify(menuPaste.slice(-20))}`);

            // --- 全域 Ctrl+F / Ctrl+H:編輯器未聚焦時也開面板;輸入框/對話框/浮窗內不攔;沒開檔不做任何事 ---
            await page.keyboard.press('Escape');
            await page.click('[data-testid=sidebar-title]'); // 焦點離開編輯器
            await page.keyboard.press('Control+f');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const gf = await page.evaluate(() => ({
                open: !!document.querySelector('.perkins-search'),
                focus: document.activeElement?.name || document.activeElement?.tagName,
            }));
            check('全域 Ctrl+F(編輯器未聚焦)開啟搜尋面板並聚焦搜尋欄',
                gf.open && gf.focus === 'search', JSON.stringify(gf));
            await shot('70-global-find');
            await page.keyboard.press('Control+h');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const gh = await page.evaluate(() => ({
                replaceVisible: document.querySelector('.perkins-search .perkins-replace-row')?.style.display,
                focus: document.activeElement?.name || document.activeElement?.tagName,
            }));
            check('全域 Ctrl+H(編輯器未聚焦)展開取代列並聚焦「取代為」欄',
                gh.replaceVisible === 'flex' && gh.focus === 'replace', JSON.stringify(gh));
            await page.keyboard.press('Escape');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            // Perkins Bot 浮窗:焦點在輸入框時不攔截
            await page.click('[data-testid=chat-fab]');
            await page.waitForSelector('[data-testid=chat-window]:visible');
            await page.click('[data-testid=question]');
            await page.keyboard.press('Control+f');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const chatGuard = await page.evaluate(() => ({
                panel: !!document.querySelector('.perkins-search'),
                focus: document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName,
            }));
            check('Perkins Bot 輸入框內 Ctrl+F 不被攔截(面板不開、焦點留在輸入框)',
                !chatGuard.panel && chatGuard.focus === 'question', JSON.stringify(chatGuard));
            await page.keyboard.press('Escape');
            await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            // 對話框內不攔截(版本對話框)
            await page.click('[data-testid=open-versions]');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            await page.keyboard.press('Control+f');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            check('對話框內 Ctrl+F 不被攔截(面板不開)',
                !(await page.$('.perkins-search')));
            await page.keyboard.press('Escape');
            await page.waitForSelector('[role=dialog]', {state: 'hidden', timeout: 5000});
            // 設定頁(非輸入框焦點)內 Ctrl+F 不被攔截(設定頁是 fixed 覆蓋層,無 role=dialog)
            await page.click('[data-testid=open-settings]');
            await page.waitForSelector('[data-testid=settings-page]');
            await page.click('[data-testid=tab-project]');
            await page.waitForSelector('[data-testid=research-row]');
            await page.click('[data-testid=research-row]'); // 焦點落在設定頁非輸入框區域
            await page.keyboard.press('Control+f');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            check('設定頁內 Ctrl+F 不被攔截(面板不開)', !(await page.$('.perkins-search')));
            await page.click('[data-testid=close-settings]');
            await settle(80, 800); // 等 UI 更新(原固定等 400ms)
            // Tooltip(radix popper wrapper)只是提示,不是選單:滑鼠停在按鈕上時 Ctrl+F 仍要能開搜尋
            await page.hover('[data-testid=open-settings]');
            await page.waitForSelector('[data-radix-popper-content-wrapper]', {timeout: 5000});
            await page.keyboard.press('Control+f');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const tt = await page.evaluate(() => ({
                panel: !!document.querySelector('.perkins-search'),
                focus: document.activeElement?.name || document.activeElement?.tagName,
            }));
            check('Tooltip 顯示時 Ctrl+F 仍可開搜尋(滑鼠停在按鈕上不被擋)', tt.panel && tt.focus === 'search', JSON.stringify(tt));
            await page.mouse.move(10, 400);
            await page.keyboard.press('Escape');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            // Radix Select 浮層(role=listbox)在作品畫面內(設定集 EntityHeader 類型選單)開啟時不被攔截
            await page.click('[data-testid=rail-bible]');
            await page.waitForSelector('[data-testid=entity-row]');
            await page.click('[data-testid=entity-row]:has-text("艾莉絲")');
            await page.waitForSelector('[data-testid=entity-header-type]');
            await page.click('[data-testid=entity-header-type]');
            await page.waitForSelector('[data-radix-popper-content-wrapper] [role=listbox]', {timeout: 5000});
            await page.keyboard.press('Control+f');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            check('Radix Select 浮層開啟時 Ctrl+F 不被攔截(面板不開)', !(await page.$('.perkins-search')));
            await page.keyboard.press('Escape'); // 收起 Select 浮層
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            await page.click('[data-testid=rail-manuscript]');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            await page.click('aside li:has-text("第一章")'); // 回到稿件,後續檢查需要 manuscript 檔案
            await page.waitForSelector('.cm-content');
            // Shift/Alt 組合(CapsLock 下 Ctrl+Shift+F 的 key 是小寫 f)與 defaultPrevented 不攔截
            await page.evaluate(() => {
                const fire = init => document.body.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, ...init}));
                const pe = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'f', ctrlKey: true});
                pe.preventDefault();
                fire({key: 'f', ctrlKey: true, shiftKey: true});   // CapsLock 下 Ctrl+Shift+F(禪模式快捷鍵)
                fire({key: 'f', ctrlKey: true, altKey: true});     // Ctrl+Alt+F
                document.body.dispatchEvent(pe);                   // 已被處理(defaultPrevented)
            });
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            check('Ctrl+Shift+F / Ctrl+Alt+F / defaultPrevented 不開搜尋面板', !(await page.$('.perkins-search')));
            // 合併禪模式後 Ctrl+Shift+F(含 CapsLock 小寫 f)應切進禪模式;確認後離開,後續步驟需要側欄
            check('CapsLock 下 Ctrl+Shift+F 進入禪模式(未被搜尋搶走)', await page.isVisible('[data-testid=zen-exit]'));
            if (await page.isVisible('[data-testid=zen-exit]')) await page.click('[data-testid=zen-exit]');
            await page.waitForSelector('[data-testid=rail]:visible');
            // IME 組字中(keyCode 229)的 Ctrl+F 不開面板(CDP 模擬真實 keydown)
            const cdpG = await page.context().newCDPSession(page);
            await cdpG.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 229, modifiers: 2});
            await cdpG.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 229, modifiers: 2});
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            check('IME 組字中(229)的 Ctrl+F 不開搜尋面板', !(await page.$('.perkins-search')));
            // 合併禪模式後,上面的合成 Ctrl+Shift+F 會切禪模式:有進入就離開
            if (await page.$('[data-testid=zen-exit]')) {
                await page.keyboard.press('Control+Shift+F');
                await page.waitForSelector('[data-testid=rail]:visible', {timeout: 3000}).catch(() => {}); // 軟等待保留:收尾(禪模式可能未進入),由 zenVisible 斷言把關
            }
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)

            // --- 長章節:建約 5 萬字章節,量測捲動與輸入延遲(只在有明顯問題時才改程式) ---
            const LONG = 'manuscript/長章測試.md';
            fs.mkdirSync(path.join(PROJ, 'manuscript'), {recursive: true});
            fs.writeFileSync(P(LONG), '# 長章測試\n\n## 場景一\n\n' + '這是一段測試用的長篇文字,描述森林裡的冒險故事與角色之間的對話。'.repeat(2400) + '\n');
            // EntityHeader 檢查途中的切檔已把貼上的字存檔,第一章在此是乾淨的:
            // Ctrl+S 對乾淨檔不觸發 refreshTree,新章節列不出來 — 空格+Backspace 弄髒(內容不變)再存
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type(' ');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Control+s'); // 存檔後 refreshTree,新章節才會出現在側欄
            await page.waitForSelector('aside li:has-text("長章測試")', {timeout: 15000});
            await page.click('aside li:has-text("長章測試")');
            await page.waitForTimeout(800);
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            await page.evaluate(() => { document.querySelector('.cm-scroller').scrollTop = 0; });
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const scrollMs = await page.evaluate(() => new Promise(res => {
                const s = document.querySelector('.cm-scroller');
                s.scrollTop = s.scrollHeight;
                let last = -1, stable = 0;
                const t0 = performance.now();
                const tick = () => {
                    if (performance.now() - t0 > 5000) return res(-1);
                    if (s.scrollTop === last) { if (++stable >= 2) return res(performance.now() - t0); }
                    else stable = 0;
                    last = s.scrollTop;
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }));
            const lat = [];
            for (let i = 0; i < 10; i++) {
                const word = '好' + i;
                const t0 = Date.now();
                await page.keyboard.insertText(word);
                await page.waitForFunction(w => {
                    const ls = document.querySelectorAll('.cm-content .cm-line');
                    return ls[ls.length - 1]?.textContent.includes(w);
                }, word, {timeout: 5000});
                lat.push(Date.now() - t0);
            }
            lat.sort((a, b) => a - b);
            console.log(`量測:長章捲動定位 ${scrollMs.toFixed(0)}ms;輸入到畫面更新 中位 ${lat[Math.floor(lat.length/2)]}ms / 最大 ${lat[lat.length-1]}ms(10 次)`);
            check('長章節輸入延遲在可用範圍(中位數 < 500ms)', lat[Math.floor(lat.length/2)] < 500, `median=${lat[Math.floor(lat.length/2)]}ms max=${lat[lat.length-1]}ms scroll=${scrollMs.toFixed(0)}ms`);
            await shot('72-long-chapter');

            // --- 視窗縮放後游標穩定(縮放前可見的游標):游標在末端且可視,縮到 640(資訊欄自動收合)後仍可視、不跳到頂端 ---
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            await page.evaluate(() => { document.querySelector('.cm-scroller').scrollTop = document.querySelector('.cm-scroller').scrollHeight; });
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const before = await page.evaluate(() => ({pos: window.__perkinsEditor?.pos(), vis: window.__perkinsEditor?.cursorVisible()}));
            await page.setViewportSize({width: 640, height: 672}); // 觸發 ≤960 互斥收合
            await settle(80, 900); // 等 UI 更新(原固定等 500ms)
            const after = await page.evaluate(() => ({pos: window.__perkinsEditor?.pos(), vis: window.__perkinsEditor?.cursorVisible()}));
            check('縮放到 640(互斥收合)後游標行仍在可視範圍、未跳到頂端',
                after.vis === true && after.pos.scrollTop > 0, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
            await shot('71-resize-640-stable');
            await page.setViewportSize({width: 1440, height: 900});
            await settle(80, 800); // 等 UI 更新(原固定等 400ms)

            // --- C1:還原(rAF 重試)進行中,點場景跳行(scrollToLine)不得被拉回舊位置 ---
            await page.click('aside li:has-text("第三章")');
            await settle(80, 800); // 等 UI 更新(原固定等 400ms)
            await page.click('aside li:has-text("長章測試")'); // 切回,還原開始
            await page.waitForSelector('.cm-content');
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const c1memo = await page.evaluate(() => window.__perkinsPosMemo?.current?.get('manuscript/長章測試.md') ?? null);
            await page.evaluate(() => { [...document.querySelectorAll('aside li')].find(e => e.textContent.trim().startsWith('場景一'))?.click(); }); // 還原視窗內立刻點場景項目(scrollToLine);startsWith 避免match到外層章節 li
            await page.waitForTimeout(1200);
            const c1after = await page.evaluate(() => window.__perkinsEditor?.pos() ?? null);
            check('還原進行中點場景跳行,不被拉回舊位置',
                !!c1memo && !!c1after && c1after.scrollTop < c1memo.scrollTop * 0.5,
                `memo=${JSON.stringify(c1memo)} after=${JSON.stringify(c1after)}`);

            // --- C2:游標在開頭、捲到中段閱讀時縮放,保留閱讀位置不被拉回游標 ---
            await page.click('.cm-content');
            await page.keyboard.press('Control+Home');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            await page.evaluate(() => { const s = document.querySelector('.cm-scroller'); s.scrollTop = (s.scrollHeight - s.clientHeight) * 0.5; });
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            const c2before = await page.evaluate(() => ({pos: window.__perkinsEditor?.pos(), vis: window.__perkinsEditor?.cursorVisible()}));
            check('前置:游標在開頭且被捲出畫面(閱讀中)', c2before.vis === false && c2before.pos.scrollTop > 5000, JSON.stringify(c2before));
            await page.setViewportSize({width: 640, height: 672});
            await settle(80, 900); // 等 UI 更新(原固定等 500ms)
            const c2after = await page.evaluate(() => ({pos: window.__perkinsEditor?.pos(), vis: window.__perkinsEditor?.cursorVisible()}));
            check('游標在畫面外(閱讀中)縮放保留閱讀位置,不拉回開頭',
                c2after.vis === false && Math.abs(c2after.pos.scrollTop - c2before.pos.scrollTop) <= 400,
                `before=${JSON.stringify(c2before)} after=${JSON.stringify(c2after)}`);
            await shot('74-resize-reading-preserved');
            await page.setViewportSize({width: 1440, height: 900});
            await settle(80, 800); // 等 UI 更新(原固定等 400ms)

            // --- 切章位置記憶:游標(選取)與捲動回到上次位置;外部改檔後超出長度要夾住不報錯 ---
            await page.click('aside li:has-text("第三章")');
            await settle(80, 900); // 等 UI 更新(原固定等 500ms)
            await page.click('aside li:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await settle(80, 800); // 等 UI 更新(原固定等 400ms)
            // 捲到中段,雙擊選一個詞(選取記憶可從浮動列觀察)
            await page.evaluate(() => {
                const s = document.querySelector('.cm-scroller');
                s.scrollTop = Math.max(0, (s.scrollHeight - s.clientHeight) * 0.6);
            });
            await settle(80, 700); // 等 UI 更新(原固定等 300ms)
            await page.click('.cm-content >> text=雷恩點起營火', {clickCount: 2});
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            const memo = await page.evaluate(() => ({
                sel: document.querySelector('[data-testid=selection-bar]') ? window.getSelection().toString() : null,
                pos: window.__perkinsEditor?.pos(),
            }));
            check('前置:已選取文字並捲動(位置記憶的素材)', !!memo.sel && memo.pos.scrollTop > 0, JSON.stringify(memo));
            await page.click('aside li:has-text("第三章")');
            await settle(80, 900); // 等 UI 更新(原固定等 500ms)
            const stored = await page.evaluate(() => window.__perkinsEditor?.posAll?.());
            await page.click('aside li:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await settle(80, 900); // 等 UI 更新(原固定等 500ms)
            const restored = await page.evaluate(() => ({
                bar: !!document.querySelector('[data-testid=selection-bar]'),
                pos: window.__perkinsEditor?.pos(),
            }));
            check('切章後回到上次游標(選取)與捲動位置',
                restored.bar && restored.pos.anchor === memo.pos.anchor && Math.abs(restored.pos.scrollTop - memo.pos.scrollTop) <= 80,
                `sel ${JSON.stringify(memo.sel)} bar=${restored.bar}, anchor ${memo.pos.anchor}→${restored.pos.anchor}, scroll ${memo.pos.scrollTop}→${restored.pos.scrollTop}, stored=${JSON.stringify(stored)}`);
            await shot('73-position-restored');
            // 外部改檔(縮短)後切回:位置超出文件長度要夾住,不報錯
            await page.keyboard.press('Control+s'); // 確保非 dirty,否則切檔存檔會蓋掉外部修改
            await page.waitForTimeout(600);
            fs.writeFileSync(P('manuscript/第一章.md'), '縮水測試\n');
            await page.click('aside li:has-text("第三章")');
            await settle(80, 900); // 等 UI 更新(原固定等 500ms)
            await page.click('aside li:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await settle(80, 900); // 等 UI 更新(原固定等 500ms)
            const clamped = await page.evaluate(() => {
                const p = window.__perkinsEditor?.pos();
                const len = document.querySelector('.cm-content').textContent.length;
                return {head: p?.head, lines: p?.lines, len};
            });
            check('外部重載後游標超出長度會夾住(不報錯、游標在文件內)',
                clamped.head <= clamped.len + 1 && clamped.lines === 2, JSON.stringify(clamped));

            // --- C6:刪除章節後位置記憶清除;同名新章節從預設位置開始 ---
            await page.hover('[data-testid=chapter-row]:has-text("第一章")');
            await page.click('[data-testid=chapter-row]:has-text("第一章") button:has(svg.lucide-more-horizontal)');
            await page.click('[role=menu] div:has-text("移到回收區")');
            await page.waitForSelector('[role=dialog]');
            await page.click('[role=dialog] button:has-text("移到回收區")');
            await page.waitForTimeout(800); // refreshTree + 位置記憶清理
            const memoAfterDel = await page.evaluate(() => [...((window.__perkinsPosMemo?.current) ?? new Map()).keys()]);
            check('刪除章節後位置記憶一併清除', !memoAfterDel.includes('manuscript/第一章.md'), JSON.stringify(memoAfterDel));
            // 建立同名新章節,開啟後從預設位置開始(head 0)
            await page.click('[data-testid=add-chapter-0]');
            await page.fill('[data-testid=chapter-name]', '第一章');
            await page.click('[data-testid=chapter-create]');
            await page.waitForSelector('[data-testid=chapter-row]:has-text("第一章")', {timeout: 15000});
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await settle(80, 800); // 等 UI 更新(原固定等 400ms)
            const recreated = await page.evaluate(() => window.__perkinsEditor?.pos() ?? null);
            check('刪除後建立同名文件,從預設位置開始(游標在開頭)',
                !!recreated && recreated.head === 0, JSON.stringify(recreated));
        } catch (e) {
            check('貼上的格式處理', false, e.message);
            check('全域 Ctrl+F / Ctrl+H / 不攔截檢查', false, e.message);
            check('長章節量測與縮放/位置記憶檢查', false, e.message);
        }

        // ===== 全形標點插入 + 選取字數(#46 前半):專用章節,不動其他組依賴的章節內容 =====
        await page.setViewportSize({width: 1440, height: 900});
        fs.writeFileSync(P('manuscript/標點測試.md'), '# 標點測試\n\n森林深處。\n');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('x');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=chapter-row]:has-text("標點測試")', {timeout: 15000});
        await page.click('[data-testid=chapter-row]:has-text("標點測試")');
        await page.waitForSelector('.cm-content:has-text("森林深處")', {timeout: 15000});
        const docText = () => page.evaluate(() => [...document.querySelectorAll('.cm-content .cm-line')].map(e => e.textContent).join('\n'));
        const editorPos = () => page.evaluate(() => window.__perkinsEditor?.pos() ?? null);
        const endCursor = async () => { await page.click('.cm-content'); await page.keyboard.press('Control+End'); await settle(80, 400); };
        const selectLast = async n => { for (let i = 0; i < n; i++) await page.keyboard.press('Shift+ArrowLeft'); await settle(80, 400); };
        const undoOnce = async () => { await page.keyboard.press('Control+z'); await settle(80, 600); };

        // Alt+[:無選取 → 插入「」,游標在中間;Ctrl+Z 一次復原
        await endCursor();
        const p0 = await editorPos();
        await page.keyboard.press('Alt+[');
        await settle(80, 600);
        const k1 = await page.evaluate(() => ({pos: window.__perkinsEditor?.pos(), txt: [...document.querySelectorAll('.cm-content .cm-line')].map(e => e.textContent).join('\n')}));
        check('#46 Alt+[ 無選取:插入「」且游標在中間', k1.txt.includes('「」') && k1.pos.head === p0.head + 1, JSON.stringify(k1));
        await undoOnce();
        const k1u = await docText();
        check('#46 Alt+[ 插入後 Ctrl+Z 一次復原', !k1u.includes('「」'), JSON.stringify(k1u.slice(-60)));

        // Alt+[:有選取 → 包住選取,選取保持在內文;Ctrl+Z 一次復原
        await endCursor();
        await page.keyboard.type('測試選取');
        await settle(80, 400);
        await selectLast(2);
        const selBefore = await page.evaluate(() => window.getSelection().toString());
        check('#46 前置:已選取「選取」2 字', selBefore === '選取', selBefore);
        await page.keyboard.press('Alt+[');
        await settle(80, 600);
        const k2 = await page.evaluate(() => ({txt: [...document.querySelectorAll('.cm-content .cm-line')].map(e => e.textContent).join('\n'), sel: window.getSelection().toString()}));
        check('#46 Alt+[ 有選取:包住選取且選取保持在內文', k2.txt.includes('測試「選取」') && k2.sel === '選取', JSON.stringify(k2));
        await undoOnce();
        const k2u = await docText();
        check('#46 Alt+[ 包住後 Ctrl+Z 一次復原', k2u.includes('測試選取') && !k2u.includes('測試「'), JSON.stringify(k2u.slice(-60)));

        // Alt+Shift+[:有選取 → 包住『』
        await endCursor();
        await page.keyboard.type('引號雙');
        await settle(80, 400);
        await selectLast(1);
        await page.keyboard.press('Alt+Shift+[');
        await settle(80, 600);
        const k3 = await page.evaluate(() => ({txt: [...document.querySelectorAll('.cm-content .cm-line')].map(e => e.textContent).join('\n'), sel: window.getSelection().toString()}));
        check('#46 Alt+Shift+[ 有選取:包住『』且選取保持在內文', k3.txt.includes('引號『雙』') && k3.sel === '雙', JSON.stringify(k3));
        await undoOnce();
        const k3u = await docText();
        check('#46 Alt+Shift+[ 後 Ctrl+Z 一次復原', k3u.includes('引號雙') && !k3u.includes('引號『'), JSON.stringify(k3u.slice(-60)));

        // Alt+. / Alt+-:取代選取插入刪節號與破折號
        await endCursor();
        await page.keyboard.type('刪節');
        await settle(80, 400);
        await selectLast(2);
        await page.keyboard.press('Alt+.');
        await settle(80, 600);
        const k4 = await docText();
        check('#46 Alt+. 取代選取插入刪節號', k4.includes('……') && !k4.includes('刪節'), JSON.stringify(k4.slice(-60)));
        await undoOnce();
        const k4u = await docText();
        check('#46 Alt+. 後 Ctrl+Z 一次復原', k4u.includes('刪節') && !k4u.includes('……'), JSON.stringify(k4u.slice(-60)));
        await page.keyboard.press('Alt+-');
        await settle(80, 600);
        const k5 = await docText();
        check('#46 Alt+- 取代選取插入破折號', k5.includes('——') && !k5.includes('刪節'), JSON.stringify(k5.slice(-60)));
        await undoOnce();
        const k5u = await docText();
        check('#46 Alt+- 後 Ctrl+Z 一次復原', k5u.includes('刪節') && !k5u.includes('——'), JSON.stringify(k5u.slice(-60)));

        // 右鍵選單「插入標點」:4 項可用且標示快捷鍵
        const openMenu = async (atRight = false) => {
            if (atRight) {
                const box = await page.locator('.cm-content').boundingBox();
                await page.mouse.click(box.x + box.width - 40, box.y + 100, {button: 'right'});
            } else {
                await page.click('.cm-content', {button: 'right', position: {x: 200, y: 120}});
            }
            await page.waitForSelector('.ctxmenu', {timeout: 5000});
            await page.hover('[data-testid=punct-submenu]');
            await page.waitForSelector('[data-testid=punct-item-quote]', {timeout: 5000});
        };
        await endCursor();
        await openMenu();
        const punctItems = await page.$$eval('[data-testid=punct-submenu] > div > div', els => els.map(e => e.textContent));
        check('#46 右鍵選單插入標點:4 項且標示快捷鍵',
            punctItems.length === 4 && punctItems[0].includes('「」') && punctItems[0].includes('Alt+[')
            && punctItems[1].includes('『』') && punctItems[1].includes('Alt+Shift+[')
            && punctItems[2].includes('刪節號') && punctItems[2].includes('Alt+.')
            && punctItems[3].includes('破折號') && punctItems[3].includes('Alt+-'), JSON.stringify(punctItems));
        // Windows Chromium 的右鍵會先把游標移到點擊處(原生 contenteditable 行為),
        // 故插入落在右鍵點擊處:以累積連續片段驗證 4 項依序插入成功
        const punctSeq = [['punct-item-quote', '「」'], ['punct-item-dquote', '『』'], ['punct-item-ellipsis', '……'], ['punct-item-dash', '——']];
        let acc = '';
        for (const [tid, frag] of punctSeq) {
            await openMenu();
            await page.click(`[data-testid=${tid}]`);
            await settle(80, 500);
            acc += frag;
            const after = await docText();
            check(`#46 右鍵選單插入 ${frag}`, after.includes(acc) && !(await page.$('.ctxmenu')),
                JSON.stringify({tail: after.slice(-24), menu: !!(await page.$('.ctxmenu'))}));
        }
        check('#46 右鍵選單插入不改其他內容', (await docText()).includes('森林深處。') && (await docText()).includes('測試選取引號雙刪節'), 'skip');
        // 靠近右緣時子選單往左開(沿用既有右鍵選單規則)
        await endCursor();
        await openMenu(true);
        const flipBoxes = await page.evaluate(() => {
            const tr = document.querySelector('[data-testid=punct-submenu]').getBoundingClientRect();
            const sub = document.querySelector('[data-testid=punct-submenu] > div').getBoundingClientRect();
            return {trLeft: tr.left, subRight: sub.right};
        });
        check('#46 靠右緣時插入標點子選單往左開', flipBoxes.subRight <= flipBoxes.trLeft + 2, JSON.stringify(flipBoxes));
        await page.click('.cm-content'); // 關閉選單
        await settle(80, 400);

        // 選取字數:與 WordCount 綁定同值;沒選取不顯示;取消選取後消失;640 不溢出
        check('#46 沒有選取時不顯示已選字數', !(await page.$('[data-testid=count-selection]')));
        await endCursor();
        await page.keyboard.type('森林深處');
        await settle(80, 400);
        await selectLast(4);
        const expected = await page.evaluate(t => window.go.main.App.WordCount(t), '森林深處');
        await page.waitForSelector('[data-testid=count-selection]', {timeout: 5000});
        const shown = (await page.textContent('[data-testid=count-selection]')).trim();
        check('#46 選取字數與 WordCount 同值', shown === `已選 ${expected.toLocaleString()} 字`, `shown=${shown} expected=${expected}`);
        await page.click('.cm-content'); // 取消選取(設游標)
        await page.waitForSelector('[data-testid=count-selection]', {state: 'detached', timeout: 5000});
        check('#46 取消選取後已選字數消失', !(await page.$('[data-testid=count-selection]')));
        await page.setViewportSize({width: 640, height: 672});
        await settle(80, 900);
        await endCursor();
        await selectLast(4);
        await page.waitForSelector('[data-testid=count-selection]', {timeout: 5000});
        const sb = await page.evaluate(() => { const el = document.querySelector('[data-testid=statusbar]'); return {sw: el.scrollWidth, cw: el.clientWidth}; });
        check('#46 640 寬狀態列不溢出(含已選字數)', sb.sw <= sb.cw, JSON.stringify(sb));
        await page.setViewportSize({width: 1440, height: 900});
        await settle(80, 800);
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")', {timeout: 10000});
    },
};
