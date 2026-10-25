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
        // 稿紙化後畫面行不再等於文件行、也不等於檔案文字:讀 CodeMirror state(DEV hook)
        const editorTxt = () => page.evaluate(() => window.__perkinsEditor.doc());
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
        await page.click('[data-testid=tab-appearance]');
        await page.waitForSelector('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-light]');
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
        await page.click('[data-testid=tab-appearance]');
        await page.waitForSelector('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-dark]');
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
            const docText = () => page.evaluate(() => window.__perkinsEditor.doc());
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
            // 在設定集 EntityHeader 的別名輸入框打字時 Ctrl+F 不被攔截
            // (原本測分類的 Radix Select 浮層;分類移除後作品畫面內已沒有 Select,SPEC §12.2)
            await page.click('[data-testid=rail-bible]');
            await page.waitForSelector('[data-testid=entity-row]');
            await page.click('[data-testid=entity-row]:has-text("艾莉絲")');
            await page.waitForSelector('[data-testid=entity-aliases]');
            await page.click('[data-testid=entity-aliases]');
            await page.keyboard.press('Control+f');
            await settle(80, 600); // 等 UI 更新(原固定等 200ms)
            check('EntityHeader 輸入框內 Ctrl+F 不被攔截(面板不開)', !(await page.$('.perkins-search')));
            await page.keyboard.press('Escape');
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

            // --- #80:Caps Lock 下 Ctrl+F / Ctrl+H 的 key 是大寫且沒有 shift ---
            // 實測結果:CM 認得(base 名稱比對),面板照常開、文件與選取不變。合成 KeyboardEvent 不會經過
            // CM 的 keymap,所以這裡用 CDP 送真實 keydown(modifiers:2 = Ctrl)。
            const cdp80 = await page.context().newCDPSession(page);
            const capKey80 = async (k) => {
                for (const type of ['keyDown', 'keyUp']) {
                    await cdp80.send('Input.dispatchKeyEvent', {type, key: k, code: `Key${k}`, windowsVirtualKeyCode: k.charCodeAt(0), nativeVirtualKeyCode: k.charCodeAt(0), modifiers: 2});
                }
            };
            const st80 = () => page.evaluate(() => ({doc: window.__perkinsEditor.doc(), pos: window.__perkinsEditor.pos()}));
            const same80 = (a, b) => a.doc === b.doc && a.pos.anchor === b.pos.anchor && a.pos.head === b.pos.head;
            await page.click('.cm-content');
            await settle(80, 400);
            const f80before = await st80();
            await capKey80('F');
            await settle(120, 900);
            const f80open = !!(await page.$('.perkins-search'));
            const f80after = await st80();
            check('#80 Caps Lock 下 Ctrl+F(key=F)照常開搜尋面板,文件與選取不變', f80open && same80(f80before, f80after),
                JSON.stringify({open: f80open, pos0: f80before.pos, pos1: f80after.pos}));
            await page.keyboard.press('Escape');
            await settle(80, 600); // 等 UI 更新
            const h80before = await st80();
            await capKey80('H');
            await settle(120, 900);
            const h80replace = await page.evaluate(() => {
                const row = document.querySelector('.perkins-replace-row');
                return !!row && getComputedStyle(row).display !== 'none';
            });
            const h80after = await st80();
            check('#80 Caps Lock 下 Ctrl+H(key=H)照常展開取代列,文件與選取不變', h80replace && same80(h80before, h80after),
                JSON.stringify({replace: h80replace, pos0: h80before.pos, pos1: h80after.pos}));
            await page.keyboard.press('Escape');
            await settle(80, 600); // 等 UI 更新

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
        const docText = () => page.evaluate(() => window.__perkinsEditor.doc());
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
                // 稿紙化後文字位置會變(段首縮排、段距、隱藏空行),固定像素會落到不同字元上:
                // 改以「森林深處」那一行的文字框算位置(最後一個字的右側、行的垂直中心),
                // 四次插入才會像原本一樣依序累積在同一處
                const at = await page.evaluate(() => {
                    const line = [...document.querySelectorAll('.cm-content .cm-line')].find(l => l.textContent.includes('森林深處'));
                    const box = line.getBoundingClientRect();
                    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                    let last = null;
                    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim()) last = n;
                    const range = document.createRange();
                    range.selectNodeContents(last);
                    const tr = range.getBoundingClientRect();
                    return {x: Math.round(tr.right - 2), y: Math.round(box.top + box.height / 2)};
                });
                await page.mouse.click(at.x, at.y, {button: 'right'});
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

        // ===== #46 返工 =====
        // 1. 打字後立刻插入:插入自成一個復原步驟,Ctrl+Z 只撤掉插入、前面的字還在
        await endCursor();
        await page.keyboard.type('合併');
        await page.keyboard.press('Alt+['); // 不等待,立刻插入
        await settle(80, 600);
        const r1 = await docText();
        check('#46 返工 打字後立刻插入:「」已插入', r1.includes('合併「」'), JSON.stringify(r1.slice(-40)));
        await undoOnce();
        const r2 = await docText();
        check('#46 返工 打字後立刻插入:Ctrl+Z 只撤插入,前面的字還在', r2.includes('合併') && !r2.includes('合併「」'), JSON.stringify(r2.slice(-40)));

        // 2. IME 組字初期(compositionstart 後尚無文字變更)快捷鍵不動作、不攔截
        await endCursor();
        const r3before = await docText();
        await page.evaluate(() => {
            document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: ''}));
        });
        await settle(80, 400);
        await page.keyboard.press('Alt+[');
        await settle(80, 600);
        check('#46 返工 IME 組字初期:Alt+[ 不插入', (await docText()) === r3before, JSON.stringify((await docText()).slice(-40)));
        await page.evaluate(() => {
            document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: ''}));
        });
        await settle(80, 400);
        // 組字結束後快捷鍵恢復(確認 compositionStarted 會重置,不會永遠擋住)
        await page.keyboard.press('Alt+[');
        await settle(80, 600);
        const r3after = await docText();
        check('#46 返工 組字結束後 Alt+[ 恢復插入', r3after !== r3before && r3after.includes('「」'), JSON.stringify(r3after.slice(-40)));
        await undoOnce();

        // 3. 過期字數回覆:選取變更/取消後,已發出的 WordCount 回覆不得寫入;取消選取立刻清空
        await page.click('.cm-content'); // 取消選取,顯示清空
        await page.waitForSelector('[data-testid=count-selection]', {state: 'detached', timeout: 3000});
        await page.evaluate(() => {
            window.__perkinsWCOrig = window.go.main.App.WordCount;
            window.go.main.App.WordCount = (t, ...rest) => {
                if (t === '森林深處') return new Promise(resolve => { window.__perkinsWCGate = resolve; });
                return window.__perkinsWCOrig(t, ...rest);
            };
        });
        await endCursor();
        await page.keyboard.type('森林深處');
        await settle(80, 400);
        await selectLast(4);
        await page.waitForTimeout(1200); // 若未卡住,不卡顯示早就出現
        check('#46 返工 WordCount 卡住期間不顯示', !(await page.$('[data-testid=count-selection]')));
        await page.evaluate(() => window.__perkinsWCGate(99));
        await page.waitForSelector('[data-testid=count-selection]', {timeout: 3000});
        const shown99 = (await page.textContent('[data-testid=count-selection]')).trim();
        check('#46 返工 放行回覆後顯示卡住的值(管路正常)', shown99 === '已選 99 字', shown99);
        // 取消選取:立刻清空;再重選、再取消後放行過期回覆,不得寫回
        await page.click('.cm-content');
        await page.waitForSelector('[data-testid=count-selection]', {state: 'detached', timeout: 2000});
        await endCursor();
        await selectLast(4); // 新請求再次卡住
        await page.waitForTimeout(400); // 確已過 250ms debounce,卡住的 WordCount 已發出
        await page.click('.cm-content'); // 取消選取
        await page.waitForSelector('[data-testid=count-selection]', {state: 'detached', timeout: 2000});
        await page.evaluate(() => window.__perkinsWCGate(99)); // 放行過期回覆
        await page.waitForTimeout(800);
        check('#46 返工 取消選取後過期回覆不寫入', !(await page.$('[data-testid=count-selection]')));
        await page.evaluate(() => { window.go.main.App.WordCount = window.__perkinsWCOrig; });

        // ===== 段落上移/下移、插入場景標題、場景跳轉(#46 後半):專用章節,不動其他組依賴的章節內容 =====
        await page.setViewportSize({width: 1440, height: 900});
        fs.writeFileSync(P('manuscript/段落場景測試.md'), '# 段落場景測試\n\n開場文字。\n\n## 場景一\n\n甲。\n\n## 場景二\n\n乙。\n');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('x');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=chapter-row]:has-text("段落場景測試")', {timeout: 15000});
        await page.click('[data-testid=chapter-row]:has-text("段落場景測試")');
        await page.waitForSelector('.cm-content:has-text("開場文字")', {timeout: 15000});
        await settle(80, 800);
        // 游標所在行(1 起算)、行內欄位與該行文字
        // 行號/欄位一律以文件行為準(稿紙化前畫面行 = 文件行,語意不變),直接讀 state
        const caretAt = () => page.evaluate(() => window.__perkinsEditor.cursor());
        // 換掉章節內容:全選後走 CM 的貼上路徑(與作者操作同一條路徑,也比逐行打字快)
        const setDoc = async text => {
            await page.click('.cm-content');
            await page.keyboard.press('Control+a');
            await page.evaluate(t => {
                const dt = new DataTransfer();
                dt.setData('text/plain', t);
                document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
            }, text);
            await settle(80, 600);
            return docText();
        };
        // 用 state 直接定位到第 n 個文件行行首(稿紙化後方向鍵會跳過隱藏空行,按鍵次數不再等於行數;
        // 方向鍵本身的真實行為在 paper 組驗)
        const cursorToLine = async n => {
            await page.click('.cm-content');
            await page.evaluate(n => window.__perkinsEditor.setCursor(n), n);
            await settle(80, 300);
        };

        // --- 空行分段:上移(與上方最近的非空白行交換,中間的空白行留在原處) ---
        await setDoc('第一段\n\n第二段\n\n第三段');
        await cursorToLine(3);
        await page.keyboard.press('Alt+ArrowUp');
        await settle(80, 500);
        const m1 = await caretAt(), t1 = await docText();
        check('#46 段落 空行分段上移:與上一段交換、空行留在原處、游標跟著內容走',
            t1 === '第二段\n\n第一段\n\n第三段' && m1.line === 1 && m1.text === '第二段',
            JSON.stringify({txt: t1, caret: m1}));
        // 移動是作者自己的編輯:走正常 dirty/存檔
        const dirtyLabel = (await page.textContent('[data-testid=save-button]')).trim();
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")', {timeout: 10000});
        check('#46 段落 移動走正常 dirty/存檔(存檔後磁碟內容已更新)',
            dirtyLabel === '儲存' && read('manuscript/段落場景測試.md') === '第二段\n\n第一段\n\n第三段',
            `label=${dirtyLabel} disk=${JSON.stringify(read('manuscript/段落場景測試.md'))}`);
        await undoOnce();
        const undone = await docText();
        check('#46 段落 上移後 Ctrl+Z 一次復原',
            t1 === '第二段\n\n第一段\n\n第三段' && undone === '第一段\n\n第二段\n\n第三段', JSON.stringify(undone));

        // --- 空行分段:下移 ---
        await cursorToLine(1);
        await page.keyboard.press('Alt+ArrowDown');
        await settle(80, 500);
        const m2 = await caretAt(), t2 = await docText();
        check('#46 段落 空行分段下移:與下一段交換、空行留在原處、游標跟著內容走',
            t2 === '第二段\n\n第一段\n\n第三段' && m2.line === 3 && m2.text === '第一段',
            JSON.stringify({txt: t2, caret: m2}));

        // --- 不空行分段(作者沒用空行分段):整行互換,不會多出空白行 ---
        await setDoc('第一段\n第二段\n第三段');
        await cursorToLine(3);
        await page.keyboard.press('Alt+ArrowUp');
        await settle(80, 500);
        const m3 = await caretAt(), t3 = await docText();
        check('#46 段落 不空行分段上移:整行互換、不產生空行、游標跟著內容走',
            t3 === '第一段\n第三段\n第二段' && m3.line === 2 && m3.text === '第三段' && m3.col === 0,
            JSON.stringify({txt: t3, caret: m3}));
        await setDoc('第一段\n第二段\n第三段');
        await cursorToLine(1);
        await page.keyboard.press('Alt+ArrowDown');
        await settle(80, 500);
        const m4 = await caretAt(), t4 = await docText();
        check('#46 段落 不空行分段下移:整行互換、不產生空行、游標跟著內容走',
            t4 === '第二段\n第一段\n第三段' && m4.line === 2 && m4.text === '第一段' && m4.col === 0,
            JSON.stringify({txt: t4, caret: m4}));

        // --- 已在頂/底:上面(下面)只有空行時不動作、文件不變 ---
        await setDoc('\n第一段\n第二段');
        await cursorToLine(2);
        await page.keyboard.press('Alt+ArrowUp');
        await settle(80, 500);
        const m5 = await caretAt(), t5 = await docText();
        check('#46 段落 已在頂端(上面只剩空行)上移不動作、文件不變',
            t5 === '\n第一段\n第二段' && m5.line === 2, JSON.stringify({txt: t5, caret: m5}));
        await setDoc('第一段\n第二段\n');
        await cursorToLine(2);
        await page.keyboard.press('Alt+ArrowDown');
        await settle(80, 500);
        const m6 = await caretAt(), t6 = await docText();
        check('#46 段落 已在底端(下面只剩空行)下移不動作、文件不變',
            t6 === '第一段\n第二段\n' && m6.line === 2, JSON.stringify({txt: t6, caret: m6}));

        // --- 多行選取:選取涵蓋的所有行一起移動 ---
        await setDoc('甲\n乙\n丙\n丁\n戊');
        await cursorToLine(2);
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Shift+ArrowDown');
        await settle(80, 300);
        const selPre = await editorPos();
        await page.keyboard.press('Alt+ArrowUp');
        await settle(80, 500);
        const m7 = await caretAt(), t7 = await docText(), selPost = await editorPos();
        check('#46 段落 多行選取一起上移:選取第 2–3 行(不含下一行)、兩行同進退、選取跟著內容走',
            selPre.anchor === 2 && selPre.head === 6 && t7 === '乙\n丙\n甲\n丁\n戊' && selPost.anchor === 0 && selPost.head === 3 && m7.head === 3,
            JSON.stringify({pre: selPre, txt: t7, sel: selPost}));

        // --- 插入場景標題(Alt+Enter):前後各一個空白行、游標在 `## ` 之後 ---
        // 游標在「第一段」而下一行已是空白行:那個空白行當標題前的那行,標題後面再補一個
        await setDoc('# 章名\n\n第一段\n\n第二段');
        await cursorToLine(3);
        await page.keyboard.press('End');
        await page.keyboard.press('Alt+Enter');
        await settle(80, 500);
        const m8 = await caretAt(), t8 = await docText();
        check('#46 場景 Alt+Enter 在下一行插入 `## `:前後各一個空白行且不重複加、游標接在後面',
            t8 === '# 章名\n\n第一段\n\n## \n\n第二段' && m8.line === 5 && m8.text === '## ' && m8.col === 3,
            JSON.stringify({txt: t8, caret: m8}));
        await page.keyboard.type('新場景');
        await settle(80, 400);
        check('#46 場景 插入後直接打字成為場景標題文字',
            (await docText()).includes('## 新場景'), JSON.stringify((await docText()).slice(0, 40)));
        await undoOnce();
        // 檔案最後一行:標題前留一個空白行,後面沒有內容就不補
        await setDoc('甲\n乙');
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Alt+Enter');
        await settle(80, 500);
        const m9 = await caretAt(), t9 = await docText();
        check('#46 場景 在檔案最後一行 Alt+Enter:前面補一個空白行、游標在 `## ` 之後',
            t9 === '甲\n乙\n\n## ' && m9.line === 4 && m9.text === '## ' && m9.col === 3,
            JSON.stringify({txt: t9, caret: m9}));

        // --- 場景跳轉(Alt+PageDown/PageUp):游標到標題行行首;到底不動作 ---
        const sceneDoc = '# 章名\n\n開場文字。\n\n## 場景一\n\n甲。\n\n## 場景二\n\n乙。';
        await setDoc(sceneDoc);
        await cursorToLine(3);
        await page.keyboard.press('Alt+PageDown');
        await settle(80, 500);
        const j1 = await caretAt();
        check('#46 場景 Alt+PageDown 跳到下一個場景標題行首',
            j1.line === 5 && j1.col === 0 && j1.text === '## 場景一', JSON.stringify(j1));
        await page.keyboard.press('Alt+PageDown');
        await settle(80, 400);
        const j2 = await caretAt();
        check('#46 場景 Alt+PageDown 再跳到下一個場景標題行首',
            j2.line === 9 && j2.col === 0 && j2.text === '## 場景二', JSON.stringify(j2));
        await page.keyboard.press('Alt+PageDown');
        await settle(80, 400);
        const j3 = await caretAt(), t10 = await docText();
        check('#46 場景 最後一個場景再往下不動作(游標與文件都不變)',
            j3.line === 9 && j3.col === 0 && t10 === sceneDoc, JSON.stringify({caret: j3, changed: t10 !== sceneDoc}));
        await page.keyboard.press('Alt+PageUp');
        await settle(80, 400);
        const j4 = await caretAt();
        check('#46 場景 Alt+PageUp 跳到上一個場景標題行首',
            j4.line === 5 && j4.col === 0 && j4.text === '## 場景一', JSON.stringify(j4));
        await page.keyboard.press('Alt+PageUp');
        await settle(80, 400);
        const j5 = await caretAt(), t11 = await docText();
        check('#46 場景 已是第一個場景再往上不動作(游標與文件都不變)',
            j5.line === 5 && t11 === sceneDoc, JSON.stringify({caret: j5, changed: t11 !== sceneDoc}));
        // 程式碼區塊內的 `## ` 不是場景(與側欄 ParseScenes 同一套判準;PR #62 審查)
        const fenceDoc = '開場\n\n```\n## 假場景\n```\n\n## 真場景';
        const tf = await setDoc(fenceDoc);
        await cursorToLine(1);
        await page.keyboard.press('Alt+PageDown');
        await settle(80, 400);
        const f1 = await caretAt();
        check('#46 場景 Alt+PageDown 略過程式碼區塊內的 ## 假標題',
            tf === fenceDoc && f1.line === 7 && f1.text === '## 真場景', JSON.stringify({caret: f1, doc: tf}));
        await page.keyboard.press('Alt+PageUp');
        await settle(80, 400);
        const f2 = await caretAt();
        check('#46 場景 Alt+PageUp 也不跳進程式碼區塊', f2.line === 7, JSON.stringify(f2));

        // --- IME 組字中快捷鍵不動作(與 #46 前半 同一情境),組字結束後恢復 ---
        await setDoc('第一段\n\n第二段\n\n第三段');
        await cursorToLine(3);
        const imeDoc = await docText();
        await page.evaluate(() => {
            document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: ''}));
        });
        await settle(80, 300);
        await page.keyboard.press('Alt+ArrowUp');
        await settle(80, 500);
        check('#46 段落 IME 組字中 Alt+↑ 不移動段落', (await docText()) === imeDoc, JSON.stringify(await docText()));
        await page.evaluate(() => {
            document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: ''}));
        });
        await settle(80, 300);
        await page.keyboard.press('Alt+ArrowUp');
        await settle(80, 500);
        check('#46 段落 組字結束後 Alt+↑ 恢復(不會永久擋住)',
            (await docText()) === '第二段\n\n第一段\n\n第三段', JSON.stringify(await docText()));
        await undoOnce();

        // --- 右鍵選單「段落與場景」子選單:5 項、標示快捷鍵、可點用、靠右緣往左開 ---
        const openParaMenu = async (atRight = false) => {
            if (atRight) {
                const box = await page.locator('.cm-content').boundingBox();
                await page.mouse.click(box.x + box.width - 40, box.y + 100, {button: 'right'});
            } else {
                await page.click('.cm-content', {button: 'right', position: {x: 200, y: 120}});
            }
            await page.waitForSelector('.ctxmenu', {timeout: 5000});
            await page.hover('[data-testid=para-submenu]');
            await page.waitForSelector('[data-testid=para-item-move-up]', {timeout: 5000});
        };
        // 選單壞掉時不要讓後面檢查一起被中斷:每個名稱都要能在 catch 裡單獨標成失敗
        const menuItemsCheck = '#46 右鍵選單段落與場景:5 項且標示快捷鍵';
        const menuClickCheck = '#46 右鍵選單插入場景標題可用(插入 `## ` 且游標接在後面、選單關閉)';
        const menuFlipCheck = '#46 靠右緣時段落與場景子選單往左開';
        try {
            await setDoc(sceneDoc);
            await openParaMenu();
            const paraItems = await page.$$eval('[data-testid=para-submenu] > div > div', els => els.map(e => e.textContent));
            check(menuItemsCheck,
                paraItems.length === 5
                && paraItems[0].includes('段落上移') && paraItems[0].includes('Alt+↑')
                && paraItems[1].includes('段落下移') && paraItems[1].includes('Alt+↓')
                && paraItems[2].includes('插入場景標題') && paraItems[2].includes('Alt+Enter')
                && paraItems[3].includes('上一個場景') && paraItems[3].includes('Alt+PageUp')
                && paraItems[4].includes('下一個場景') && paraItems[4].includes('Alt+PageDown'), JSON.stringify(paraItems));
            await page.click('[data-testid=para-item-insert-scene]');
            await settle(80, 500);
            const m10 = await caretAt(), t12 = await docText();
            check(menuClickCheck,
                t12.includes('## ') && m10.text === '## ' && m10.col === 3 && !(await page.$('.ctxmenu')),
                JSON.stringify({caret: m10, menu: !!(await page.$('.ctxmenu'))}));
            await undoOnce();
            await openParaMenu(true);
            const paraFlip = await page.evaluate(() => {
                const tr = document.querySelector('[data-testid=para-submenu]').getBoundingClientRect();
                const sub = document.querySelector('[data-testid=para-submenu] > div').getBoundingClientRect();
                return {trLeft: tr.left, subRight: sub.right};
            });
            check(menuFlipCheck, paraFlip.subRight <= paraFlip.trLeft + 2, JSON.stringify(paraFlip));
            await page.click('.cm-content'); // 關閉選單
            await settle(80, 400);
        } catch (e) {
            check(menuItemsCheck, false, e.message);
            check(menuClickCheck, false, e.message);
            check(menuFlipCheck, false, e.message);
            await page.keyboard.press('Escape');
            await page.click('.cm-content').catch(() => {});
        }
        // ===== 格式子選單與快捷鍵(#130):專用章節,不動其他組依賴的章節內容 =====
        await page.setViewportSize({width: 1440, height: 900});
        fs.writeFileSync(P('manuscript/格式測試.md'), '# 格式測試\n\n第一段\n');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('x');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=chapter-row]:has-text("格式測試")', {timeout: 15000});
        await page.click('[data-testid=chapter-row]:has-text("格式測試")');
        await page.waitForSelector('.cm-content:has-text("第一段")', {timeout: 15000});
        await settle(80, 800);
        // 右鍵開「格式」子選單(可選靠右緣,驗證往左開)
        const openFormatMenu = async (atRight = false) => {
            if (atRight) {
                const box = await page.locator('.cm-content').boundingBox();
                await page.mouse.click(box.x + box.width - 40, box.y + 100, {button: 'right'});
            } else {
                await page.click('.cm-content', {button: 'right', position: {x: 200, y: 120}});
            }
            await page.waitForSelector('.ctxmenu', {timeout: 5000});
            await page.hover('[data-testid=format-submenu]');
            await page.waitForSelector('[data-testid=format-item-h1]', {timeout: 5000});
        };
        // 右鍵點在指定文字那一行(Windows Chromium 右鍵會先把游標移到點擊處,選單動作作用在該行)
        const openFormatMenuOn = async lineText => {
            const at = await page.evaluate(t => {
                const line = [...document.querySelectorAll('.cm-content .cm-line')].find(l => l.textContent.includes(t));
                const box = line.getBoundingClientRect();
                const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                let last = null;
                for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim()) last = n;
                const range = document.createRange();
                range.selectNodeContents(last);
                const tr = range.getBoundingClientRect();
                return {x: Math.round(tr.right - 2), y: Math.round(box.top + box.height / 2)};
            }, lineText);
            await page.mouse.click(at.x, at.y, {button: 'right'});
            await page.waitForSelector('.ctxmenu', {timeout: 5000});
            await page.hover('[data-testid=format-submenu]');
            await page.waitForSelector('[data-testid=format-item-h1]', {timeout: 5000});
        };
        // 多行選取:游標到 fromLine 行首後,Shift+↓/Shift+End 擴到 toLine 行尾。
        // 稿紙化藏掉段落空行(方向鍵會跳過),逐次核對游標行號決定何時停,不假設按鍵次數
        const selectToLine = async (fromLine, toLine) => {
            await cursorToLine(fromLine);
            for (let i = 0; i < 60; i++) {
                const c = await caretAt();
                if (c.line >= toLine) break;
                await page.keyboard.press('Shift+ArrowDown');
                await settle(30, 150);
            }
            await page.keyboard.press('Shift+End');
            await settle(50, 250);
        };

        // --- 右鍵選單「格式」子選單:7 項、標示快捷鍵、不提語法字眼、可點用 ---
        await setDoc('# 章名\n\n第一段\n\n第二段');
        const fmtItemsCheck = '#130 右鍵選單格式:7 項且標示快捷鍵(介面文字不提 Markdown/#)';
        const fmtClickCheck = '#130 右鍵選單點「標題 2(場景)」可用(該行變 `## ` 且游標跟著文字走、選單關閉)';
        try {
            await openFormatMenu();
            const fmtItems = await page.$$eval('[data-testid^="format-item-"]', els => els.map(e => e.textContent));
            const fmtText = await page.$eval('[data-testid=format-submenu] > div', e => e.textContent);
            check(fmtItemsCheck,
                fmtItems.length === 7
                && fmtItems[0].includes('標題 1') && fmtItems[0].includes('Ctrl+1')
                && fmtItems[1].includes('標題 2') && fmtItems[1].includes('場景') && fmtItems[1].includes('Ctrl+2')
                && fmtItems[2].includes('標題 3') && fmtItems[2].includes('Ctrl+3')
                && fmtItems[3].includes('內文') && fmtItems[3].includes('Ctrl+0')
                && fmtItems[4].includes('粗體') && fmtItems[4].includes('Ctrl+B')
                && fmtItems[5].includes('斜體') && fmtItems[5].includes('Ctrl+I')
                && fmtItems[6].includes('插入場景分隔') && fmtItems[6].includes('◇◇◇') && !fmtItems[6].includes('Ctrl')
                && !/Markdown|#/.test(fmtText), JSON.stringify(fmtItems));
            await page.keyboard.press('Escape'); // 關閉選單(640 寬時選單蓋住 .cm-content,直接點內容會被擋)
            await settle(80, 400);
            await openFormatMenuOn('第一段');
            await page.click('[data-testid=format-item-h2]');
            await settle(80, 500);
            const mc = await caretAt(), mt = await docText();
            // 右鍵先把游標移到點擊處(行尾附近),套用後游標照前綴位移量調整(col 3–6)
            check(fmtClickCheck,
                mt === '# 章名\n\n## 第一段\n\n第二段' && mc.line === 3 && mc.text === '## 第一段' && mc.col >= 3 && mc.col <= 6 && !(await page.$('.ctxmenu')),
                JSON.stringify({txt: mt, caret: mc}));
            await undoOnce();
        } catch (e) {
            check(fmtItemsCheck, false, e.message);
            check(fmtClickCheck, false, e.message);
            await page.keyboard.press('Escape');
            await page.click('.cm-content').catch(() => {});
        }

        // --- Ctrl+2 標題 2(場景)/ Ctrl+0 內文:游標所在行、游標跟著文字走、走正常 dirty/存檔 ---
        await setDoc('# 章名\n\n第一段\n\n第二段');
        await cursorToLine(3);
        await page.evaluate(() => window.__perkinsEditor.setCursor(3, 2)); // 游標在「第一段」中間
        await settle(50, 250);
        await page.keyboard.press('Control+2');
        await settle(80, 500);
        const h2doc = await docText(), h2c = await caretAt();
        check('#130 Ctrl+2 標題 2(場景):該行變 `## ` 且游標跟著文字走',
            h2doc === '# 章名\n\n## 第一段\n\n第二段' && h2c.line === 3 && h2c.text === '## 第一段' && h2c.col === 5,
            JSON.stringify({txt: h2doc, caret: h2c}));
        const h2dirty = (await page.textContent('[data-testid=save-button]')).trim();
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")', {timeout: 10000});
        check('#130 標題 2 走正常 dirty/存檔(存檔後磁碟內容已更新)',
            h2dirty === '儲存' && read('manuscript/格式測試.md') === '# 章名\n\n## 第一段\n\n第二段',
            `label=${h2dirty} disk=${JSON.stringify(read('manuscript/格式測試.md'))}`);
        await undoOnce();
        check('#130 標題 2 後 Ctrl+Z 一次復原', (await docText()) === '# 章名\n\n第一段\n\n第二段', JSON.stringify(await docText()));
        // 已是同一層級就不變(不做切換)
        await page.keyboard.press('Control+2');
        await settle(80, 400);
        await page.keyboard.press('Control+2');
        await settle(80, 400);
        check('#130 已是同一層級再按 Ctrl+2 不切換(內容不變)',
            (await docText()) === '# 章名\n\n## 第一段\n\n第二段', JSON.stringify(await docText()));
        await page.keyboard.press('Control+0');
        await settle(80, 500);
        const h0doc = await docText(), h0c = await caretAt();
        check('#130 Ctrl+0 內文(取消標題):拿掉行首前綴、游標跟著文字走',
            h0doc === '# 章名\n\n第一段\n\n第二段' && h0c.line === 3 && h0c.text === '第一段' && h0c.col === 2,
            JSON.stringify({txt: h0doc, caret: h0c}));

        // --- 多行選取標題 1:跳過空白行與程式碼區塊內的行 ---
        await setDoc('# 章名\n\n段一\n\n段二\n\n```\n### 註解\n```\n\n段三');
        await selectToLine(3, 11);
        await page.keyboard.press('Control+1');
        await settle(80, 500);
        const h1m = await docText();
        check('#130 多行選取標題 1:非空白行都套用、跳過空白行',
            h1m === '# 章名\n\n# 段一\n\n# 段二\n\n```\n### 註解\n```\n\n# 段三', JSON.stringify(h1m));
        check('#130 多行選取標題 1:跳過程式碼區塊內的行',
            h1m.includes('```\n### 註解\n```'), JSON.stringify(h1m));

        // --- Ctrl+B 粗體(切換):包住選取、選取保持在內文;再按一次拿掉 ---
        await setDoc('甲乙丙丁');
        await cursorToLine(1);
        await page.evaluate(() => window.__perkinsEditor.setCursor(1, 1));
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');
        await settle(50, 250);
        await page.keyboard.press('Control+b');
        await settle(80, 500);
        const b1 = await docText(), b1pos = await editorPos();
        check('#130 Ctrl+B 粗體:包住選取且選取保持在內文',
            b1 === '甲**乙丙**丁' && b1pos.anchor === 3 && b1pos.head === 5, JSON.stringify({txt: b1, pos: b1pos}));
        await page.keyboard.press('Control+b');
        await settle(80, 500);
        const b2 = await docText(), b2pos = await editorPos();
        check('#130 Ctrl+B 再按一次拿掉粗體記號',
            b2 === '甲乙丙丁' && b2pos.anchor === 1 && b2pos.head === 3, JSON.stringify({txt: b2, pos: b2pos}));

        // --- Ctrl+I 斜體:不是 CodeMirror 預設的 selectParentSyntax(選取父節點) ---
        await setDoc('甲乙丙丁');
        await cursorToLine(1);
        await page.evaluate(() => window.__perkinsEditor.setCursor(1, 1));
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');
        await settle(50, 250);
        await page.keyboard.press('Control+i');
        await settle(80, 500);
        const i1 = await docText(), i1pos = await editorPos();
        check('#130 Ctrl+I 是斜體(不是選取父節點)',
            i1 === '甲*乙丙*丁' && i1pos.anchor === 2 && i1pos.head === 4, JSON.stringify({txt: i1, pos: i1pos}));
        // `**粗**` 選取內文按 Ctrl+I:不把粗體星號當斜體記號
        await setDoc('**粗**');
        await cursorToLine(1);
        await page.evaluate(() => window.__perkinsEditor.setCursor(1, 2));
        await page.keyboard.press('Shift+ArrowRight');
        await settle(50, 250);
        await page.keyboard.press('Control+i');
        await settle(80, 500);
        const i2 = await docText(), i2pos = await editorPos();
        check('#130 `**粗**` 選取內文按 Ctrl+I:不把粗體星號當斜體記號',
            i2 === '***粗***' && i2pos.anchor === 3 && i2pos.head === 4, JSON.stringify({txt: i2, pos: i2pos}));
        // 同一選取再按一次 Ctrl+I:只拿掉斜體,保留粗體(PR #139 審查:原本會堆成 ****粗****)
        await page.keyboard.press('Control+i');
        await settle(80, 500);
        const i3 = await docText(), i3pos = await editorPos();
        check('#130 粗斜體再按 Ctrl+I 只取消斜體、保留粗體',
            i3 === '**粗**' && i3pos.anchor === 2 && i3pos.head === 3, JSON.stringify({txt: i3, pos: i3pos}));
        // 粗斜體按 Ctrl+B:只拿掉粗體,留下斜體
        await page.keyboard.press('Control+i');
        await settle(80, 500);
        await page.keyboard.press('Control+b');
        await settle(80, 500);
        const i4 = await docText(), i4pos = await editorPos();
        check('#130 粗斜體按 Ctrl+B 只取消粗體、保留斜體',
            i4 === '*粗*' && i4pos.anchor === 1 && i4pos.head === 2, JSON.stringify({txt: i4, pos: i4pos}));
        await setDoc('**粗**');

        // --- 插入場景分隔(◇◇◇):前後各留一個空白行(已有就沿用)、游標在分隔行之後的下一行開頭 ---
        await setDoc('# 章名\n\n第一段\n\n第二段');
        await openFormatMenuOn('第一段');
        await page.click('[data-testid=format-item-break]');
        await settle(80, 500);
        const br1 = await docText(), brc = await caretAt();
        check('#130 插入場景分隔:前後各一個空白行、游標在分隔行之後的下一行行首',
            br1 === '# 章名\n\n第一段\n\n◇◇◇\n\n第二段' && brc.line === 6 && brc.col === 0 && brc.text === '',
            JSON.stringify({txt: br1, caret: brc}));
        check('#130 插入場景分隔後選單關閉', !(await page.$('.ctxmenu')));
        await undoOnce();
        check('#130 插入場景分隔後 Ctrl+Z 一次復原', (await docText()) === '# 章名\n\n第一段\n\n第二段', JSON.stringify(await docText()));
        // 後面已有空白行就沿用(不重複加)
        await setDoc('# 章名\n\n第一段\n\n\n第二段');
        await openFormatMenuOn('第一段');
        await page.click('[data-testid=format-item-break]');
        await settle(80, 500);
        const br2 = await docText();
        check('#130 插入場景分隔:已有空白行沿用、不重複加',
            br2 === '# 章名\n\n第一段\n\n◇◇◇\n\n第二段', JSON.stringify(br2));
        await undoOnce();

        // --- IME 組字中 Ctrl+B 不動作(與 #46 同一情境),組字結束後恢復 ---
        await setDoc('甲乙丙丁');
        await cursorToLine(1);
        await page.evaluate(() => window.__perkinsEditor.setCursor(1, 1));
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');
        await settle(50, 250);
        const imeBDoc = await docText();
        await page.evaluate(() => {
            document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: ''}));
        });
        await settle(80, 300);
        await page.keyboard.press('Control+b');
        await settle(80, 500);
        check('#130 IME 組字中 Ctrl+B 不動作', (await docText()) === imeBDoc, JSON.stringify(await docText()));
        await page.evaluate(() => {
            document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: ''}));
        });
        await settle(80, 300);
        await page.keyboard.press('Control+b');
        await settle(80, 500);
        check('#130 組字結束後 Ctrl+B 恢復(不會永久擋住)', (await docText()) === '甲**乙丙**丁', JSON.stringify(await docText()));
        await undoOnce();

        // --- Ctrl+0 攔下縮放重設;既有快捷鍵(Ctrl+F)不受影響 ---
        await setDoc('甲乙丙');
        await cursorToLine(1);
        const zoomBefore = await page.evaluate(() => ({w: window.innerWidth, dpr: window.devicePixelRatio}));
        await page.keyboard.press('Control+0');
        await settle(80, 500);
        const zoomAfter = await page.evaluate(() => ({w: window.innerWidth, dpr: window.devicePixelRatio}));
        check('#130 Ctrl+0 不觸發縮放重設(尺寸與像素比不變、無標題時內容不變)',
            zoomAfter.w === zoomBefore.w && zoomAfter.dpr === zoomBefore.dpr && (await docText()) === '甲乙丙',
            JSON.stringify({before: zoomBefore, after: zoomAfter}));
        await page.keyboard.press('Control+f');
        await page.waitForSelector('.perkins-search', {timeout: 5000});
        check('#130 Ctrl+F 仍開啟搜尋面板(與格式快捷鍵不衝突)', !!(await page.$('.perkins-search')));
        await page.keyboard.press('Escape');
        await page.waitForSelector('.perkins-search', {state: 'detached', timeout: 5000});

        // --- 截圖與版面:640×672 與 1280×800 右鍵「格式」子選單打開,不出水平捲軸、子選單不被裁掉 ---
        await setDoc('# 章名\n\n第一段\n\n第二段\n\n第三段\n\n第四段\n\n第五段');
        for (const [w, h, name] of [[640, 672, '85-format-menu-640'], [1280, 800, '86-format-menu-1280']]) {
            await page.setViewportSize({width: w, height: h});
            await settle(80, 900);
            await openFormatMenu(true);
            const fbox = await page.evaluate(() => {
                const sub = document.querySelector('[data-testid=format-submenu] > div').getBoundingClientRect();
                return {left: sub.left, right: sub.right, top: sub.top, bottom: sub.bottom,
                        sw: document.documentElement.scrollWidth, cw: window.innerWidth};
            });
            check(`#130 ${w}×${h} 格式子選單不被裁掉且不出水平捲軸`,
                fbox.left >= 0 && fbox.right <= w && fbox.top >= 0 && fbox.bottom <= h && fbox.sw <= fbox.cw, JSON.stringify(fbox));
            await shot(name);
            await page.keyboard.press('Escape'); // 關閉選單(同上:640 寬時選單蓋住 .cm-content)
            await settle(80, 400);
        }

        // --- #160:非最大化視窗時,右鍵選單與子選單依實際尺寸避開視窗邊緣(右下角/左上角) ---
        await setDoc('# 章名\n\n' + Array.from({length: 30}, (_, i) => '這是第 ' + (i + 1) + ' 段測試文字,用來填滿編輯區以測試右鍵選單在視窗邊緣的定位。').join('\n\n'));
        await settle(80, 400);
        const inWin = (r, w, h) => !!(r && r.left >= 0 && r.top >= 0 && r.right <= w && r.bottom <= h);
        const rectOf = sel => page.evaluate(s => {
            const el = typeof s === 'string' ? document.querySelector(s) : null;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, h: r.height};
        }, sel);
        const locBox = async loc => {
            const b = await loc.boundingBox();
            return b && {left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height, h: b.height};
        };
        for (const [w, h] of [[900, 600], [640, 600]]) {
            await page.setViewportSize({width: w, height: h});
            await settle(80, 900);
            for (const posName of ['右下角', '左上角']) {
                const sc = await page.evaluate(p => {
                    const r = document.querySelector('.cm-scroller').getBoundingClientRect();
                    return p === '右下角' ? {x: r.right - 20, y: r.bottom - 20} : {x: r.left + 20, y: r.top + 20};
                }, posName);
                // 在選取範圍內右鍵才保留選取(「快速指令」子選單需要選取);選取點擊點所在的行(同 bot-chat 模式)
                await page.evaluate(p => {
                    const v = window.__perkinsEditor;
                    const lines = [...document.querySelectorAll('.cm-content .cm-line')];
                    const r = document.querySelector('.cm-scroller').getBoundingClientRect();
                    const target = p === 'bottom-right' ? r.bottom - 20 : r.top + 20;
                    const hit = lines.find(l => { const lr = l.getBoundingClientRect(); return lr.top <= target && target <= lr.bottom; })
                        || lines[p === 'bottom-right' ? lines.length - 1 : 0];
                    v.setCursor(lines.indexOf(hit) + 1);
                }, posName);
                await page.keyboard.press('Home');
                await page.keyboard.press('Shift+End');
                await page.mouse.click(sc.x, sc.y, {button: 'right'});
                await page.waitForSelector('.ctxmenu', {timeout: 5000});
                const mainRect = await rectOf('.ctxmenu');
                const askAiRect = await rectOf('[data-testid=ask-ai]');
                const pb = await page.locator('.ctxmenu').getByText('貼上', {exact: true}).first().boundingBox();
                const pasteRect = pb && {left: pb.x, right: pb.x + pb.width, top: pb.y, bottom: pb.y + pb.height, h: pb.height};
                const subs = {};
                for (const [name, sel] of [
                    ['punct', '[data-testid=punct-submenu] > div'],
                    ['format', '[data-testid=format-submenu] > div'],
                    ['para', '[data-testid=para-submenu] > div'],
                ]) {
                    await page.hover('[data-testid=' + name + '-submenu]');
                    await settle(80, 400);
                    subs[name] = await rectOf(sel);
                }
                await page.hover('text=快速指令');
                await settle(80, 400);
                // 快速指令子選單 = 主選單第 2 列(第 1 列是「詢問 Perkins Bot」)的子選單 div;
                // 「text=快速指令 > div」不是有效的 Playwright 選子器,hover 本身仍用 text=快速指令
                subs.quick = await locBox(page.locator('.ctxmenu > div:nth-child(2) > div').first());
                const ok = inWin(mainRect, w, h) && inWin(subs.quick, w, h) && inWin(subs.punct, w, h)
                    && inWin(subs.format, w, h) && inWin(subs.para, w, h)
                    && askAiRect && pasteRect && askAiRect.h <= pasteRect.h + 1;
                check(`#160 ${w}×${h} ${posName} 主選單與子選單都在視窗內、文字不換行`, ok,
                    JSON.stringify({main: mainRect, askAiH: askAiRect?.h, pasteH: pasteRect?.h, subs}));
                if (w === 640 && h === 600 && posName === '右下角') await shot('87-ctxmenu-640-corner');
                await page.keyboard.press('Escape');
                await settle(80, 400);
            }
        }

        // --- #162:右鍵選單「全選」 ---
        await setDoc('# 章名\n\n第一段\n\n第二段');
        const p1at = await page.evaluate(t => {
            const line = [...document.querySelectorAll('.cm-content .cm-line')].find(l => l.textContent.includes(t));
            const box = line.getBoundingClientRect();
            return {x: Math.round(box.left + 20), y: Math.round(box.top + box.height / 2)};
        }, '第一段');
        await page.mouse.click(p1at.x, p1at.y, {button: 'right'});
        await page.waitForSelector('.ctxmenu', {timeout: 5000});
        await page.click('[data-testid=select-all]');
        await settle(80, 400);
        const selPos = await editorPos();
        const docLen = (await docText()).length;
        const focusInContent = await page.evaluate(() => {
            const ae = document.activeElement;
            return !!(ae && ae.closest('.cm-content'));
        });
        check('#162 右選「全選」選取整份檔案、選單關閉、焦點回到編輯器',
            selPos.anchor === 0 && selPos.head === docLen && !(await page.$('.ctxmenu')) && focusInContent,
            JSON.stringify({sel: selPos, docLen, menu: !!(await page.$('.ctxmenu')), focusInContent}));
        // 全選後右鍵「剪下」清空內容,復原後回到原文(無頭環境剪貼簿寫入不可靠,按 close-guard 的模式 stub)
        await page.evaluate(() => { window.__writeOrig = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = t => Promise.resolve(); });
        await page.mouse.click(p1at.x, p1at.y, {button: 'right'});
        await page.waitForSelector('.ctxmenu', {timeout: 5000});
        await page.click('.ctxmenu div:text-is("剪下")');
        await settle(80, 400);
        check('#162 全選後右鍵「剪下」清空內容', (await docText()) === '', JSON.stringify(await docText()));
        await undoOnce();
        check('#162 全選後剪下可復原回原文', (await docText()) === '# 章名\n\n第一段\n\n第二段', JSON.stringify(await docText()));
        await page.evaluate(() => { navigator.clipboard.writeText = window.__writeOrig; delete window.__writeOrig; });

        await page.setViewportSize({width: 1440, height: 900});
        await settle(80, 800);

        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")', {timeout: 10000});
    },
};
