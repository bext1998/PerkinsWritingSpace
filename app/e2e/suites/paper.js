// paper — 稿紙化(#44 第一階段):一個 Enter 一段、段落間的空行不出現在畫面上、游標不落在它上面、
// 游標不在該行時隱藏 Markdown 標記。
//
// 觀察方式(見 #44 的決定):「檔案內容/游標位置」一律讀 CodeMirror state(DEV hook __perkinsEditor.doc/cursor),
// 「作者看到的畫面」讀 innerText 與實際幾何(getBoundingClientRect),兩者互相對照——
// 例如標記必須「檔案裡還在、畫面上看不到」。方向鍵、點擊、Enter、Backspace、Delete 都用真實按鍵/滑鼠。
module.exports = {
    name: 'paper',
    desc: '稿紙化:一個 Enter 一段、隱藏段落空行與 Markdown 標記',
    run: async ctx => {
        const {page, check, shot, P, settle, ensureProject} = ctx;
        const fs = require('fs');
        const FILE = 'manuscript/稿紙測試.md';
        // 檔名換掉時要重新整理章節列:在編輯器動一下再存檔會 refreshTree(E2E 既有做法)
        const refreshTree = async () => {
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('x');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Control+s');
            await settle(120, 1500);
        };
        const openTestFile = async (text) => {
            fs.writeFileSync(P(FILE), text);
            await refreshTree();
            await page.locator(`[data-testid=chapter-row]:has-text("稿紙測試")`).first().click({timeout: 15000});
            await page.waitForFunction(() => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('稿紙測試'), null, {timeout: 15000});
            await settle(120, 1200);
        };
        const doc = () => page.evaluate(() => window.__perkinsEditor.doc());
        const cur = () => page.evaluate(() => window.__perkinsEditor.cursor());
        const seen = () => page.evaluate(() => document.querySelector('.cm-content').innerText);
        const rows = () => page.evaluate(() => [...document.querySelectorAll('.cm-content .cm-line')].map(l => {
            const r = l.getBoundingClientRect();
            return {h: Math.round(r.height), top: Math.round(r.top), blank: l.classList.contains('cm-paper-blank'),
                    para: l.classList.contains('cm-paper-para'), cls: l.className, t: l.innerText};
        }));
        const save = async () => {
            await page.keyboard.press('Control+s');
            await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")', {timeout: 10000});
        };
        const setDoc = async text => {
            await page.click('.cm-content');
            await page.keyboard.press('Control+a');
            await page.evaluate(t => {
                const dt = new DataTransfer();
                dt.setData('text/plain', t);
                document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
            }, text);
            await settle(80, 800);
        };
        const home = async () => { await page.click('.cm-content'); await page.keyboard.press('Control+Home'); await settle(60, 300); };
        const press = async (key, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(key); await settle(60, 400); };

        await ensureProject('第一章', 'manuscript');
        await openTestFile('# 稿紙測試\n\n第一段。\n\n第二段。\n');

        // ---- 一、一個 Enter 一段 ----
        // 段中 Enter:游標處補出段落分隔,游標到新段開頭;存檔後磁碟就是「\n\n」分段
        await setDoc('甲段。乙段。');
        await home();
        await press('ArrowRight', 3); // 游標在「甲段。」之後、「乙段。」之前
        await page.keyboard.press('Enter');
        await settle(80, 600);
        const e1 = await cur();
        check('#44 Enter 段中分段:檔案是 \\n\\n 分隔、游標在新段開頭',
            (await doc()) === '甲段。\n\n乙段。' && e1.line === 3 && e1.col === 0, JSON.stringify({doc: await doc(), cur: e1}));
        await save();
        check('#44 Enter 存檔後磁碟內容也是 \\n\\n 分段',
            fs.readFileSync(P(FILE), 'utf8') === '甲段。\n\n乙段。', JSON.stringify(fs.readFileSync(P(FILE), 'utf8')));
        // 畫面上不顯示那個空行:段落之間沒有高度的行(段落行與隱藏行同一位置)
        const r1 = await rows();
        check('#44 段落間的空行不在畫面上佔高度(改用段距)',
            r1.length === 3 && r1[1].blank && r1[1].h === 0 && r1[0].h > 0 && r1[2].h > 0 && r1[2].top === r1[1].top,
            JSON.stringify(r1));
        await shot('44-paper-enter');

        // 一次 Ctrl+Z 復原一次段落化 Enter(段落分隔整個回復)
        await page.keyboard.press('Control+z');
        await settle(80, 500);
        check('#44 段落化 Enter 後 Ctrl+Z 一次復原',
            (await doc()) === '甲段。乙段。', JSON.stringify(await doc()));

        // 段尾 Enter:後面已經是段落分隔,只把游標移到下一段開頭,不多插空行(Ctrl+Z 後狀態要重新建立)
        await setDoc('甲段。\n\n乙段。');
        await home();
        await press('End');
        await page.keyboard.press('Enter');
        await settle(80, 500);
        const e2 = await cur();
        check('#44 Enter 段尾:游標移到下一段開頭,內容不變(不多出空行)',
            (await doc()) === '甲段。\n\n乙段。' && e2.line === 3 && e2.col === 0, JSON.stringify({doc: await doc(), cur: e2}));

        // Shift+Enter 保留單一換行;畫面上第二行也是一段(與複製為平台格式「每個非空行一段」一致,PR #69 審查)
        await setDoc('甲段。乙段。');
        await home();
        await press('ArrowRight', 3);
        await page.keyboard.press('Shift+Enter');
        await settle(80, 500);
        const s1 = await rows();
        check('#44 Shift+Enter 是單一換行(檔案不補空行),畫面上兩行各是一段(與發文結果一致)',
            (await doc()) === '甲段。\n乙段。' && s1[0].para && s1[1].para && !s1[0].blank, JSON.stringify({doc: await doc(), rows: s1.map(r => ({t: r.t, para: r.para}))}));
        // 一次 Ctrl+Z 復原一次 Shift+Enter
        await page.keyboard.press('Control+z');
        await settle(80, 500);
        check('#44 Shift+Enter 後 Ctrl+Z 一次復原(回到原本的一行)',
            (await doc()) === '甲段。乙段。', JSON.stringify(await doc()));

        // 程式碼區塊內 Enter 照舊(單一換行)。在行首按 Enter 才分得出:段落化會補成 \n\n,預設只補一個 \n
        await setDoc('```\n甲\n```');
        await home();
        await press('ArrowDown');
        await page.keyboard.press('Home');
        await page.keyboard.press('Enter');
        await settle(80, 500);
        check('#44 程式碼區塊內 Enter 仍是單一換行(段落化不套用)',
            (await doc()) === '```\n\n甲\n```', JSON.stringify(await doc()));

        // frontmatter 內 Enter 照舊(單一換行)
        await setDoc('---\ntitle: x\n---\n\n正文。');
        await home();
        await press('ArrowDown');
        await page.keyboard.press('Home');
        await page.keyboard.press('Enter');
        await settle(80, 500);
        check('#44 frontmatter 內 Enter 仍是單一換行(段落化不套用)',
            (await doc()) === '---\n\ntitle: x\n---\n\n正文。', JSON.stringify(await doc()));

        // 程式碼區塊/frontmatter 內行首 Backspace 照舊只刪一個換行,不跨過可見空行合併(PR #69 審查)
        await setDoc('```\nA\n\nB\n```');
        await home();
        await press('ArrowDown', 3);
        await page.keyboard.press('Home');
        await page.keyboard.press('Backspace');
        await settle(80, 500);
        check('#44 程式碼區塊內行首 Backspace 只刪一個換行(不合併成 AB)',
            (await doc()) === '```\nA\nB\n```', JSON.stringify(await doc()));
        await setDoc('---\na: x\n\nb: y\n---\n\n正文。');
        await home();
        await press('ArrowDown', 3);
        await page.keyboard.press('Home');
        await page.keyboard.press('Backspace');
        await settle(80, 500);
        check('#44 frontmatter 內行首 Backspace 只刪一個換行(不把兩個欄位串成一行)',
            (await doc()) === '---\na: x\nb: y\n---\n\n正文。', JSON.stringify(await doc()));

        // IME 組字中 Enter 不分段(CDP 發真實 composition 事件;無頭環境無真實 IME,實機見 #47)
        await setDoc('甲段。乙段。');
        await home();
        await press('ArrowRight', 3);
        const before = await doc();
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.imeSetComposition', {text: 'ㄙㄣ', selectionStart: 1, selectionEnd: 1});
        await cdp.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229});
        await cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229});
        await settle(80, 600);
        const mid = await doc();
        const c1 = await cur();
        await cdp.send('Input.insertText', {text: '森林'});
        await settle(80, 500);
        const after = await doc();
        // CM 對「真實組字」本來就忽略 key 事件(ignoreDuringComposition),上面的 CDP 路徑只驗得到現況;
        // 補一條合成 compositionstart(CM 不會忽略按鍵)的真實 Enter,才驗得到我們自己的防護。
        // 只斷言「沒有插入段落分隔」:合成組字本身可能讓瀏覽器改動 DOM,不拿它比對整份文件
        await setDoc('甲段。乙段。');
        await home();
        await press('ArrowRight', 3);
        const b2 = await doc();
        await page.evaluate(() => document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: ''})));
        await page.keyboard.press('Enter');
        await settle(80, 500);
        const synth = await doc();
        await page.evaluate(() => document.querySelector('.cm-content').dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: ''})));
        await settle(60, 400);
        // 組字中的暫存字串會進 state(瀏覽器行為):要驗的是 229 的 Enter 沒有插進段落分隔
        check('#44 IME 組字中 Enter 不分段(真實組字與合成組字都沒有插入段落分隔)',
            !mid.includes('\n') && !synth.includes('\n\n') && after === '甲段。森林乙段。',
            JSON.stringify({before, mid, synth, b2, after, cur: c1}));

        // ---- 二、段落間的空行:游標與滑鼠都不停在它上面 ----
        await setDoc('甲段。\n\n乙段。');
        await home();
        await press('ArrowDown');
        const d1 = await cur();
        await page.keyboard.press('Backspace');
        await settle(80, 500);
        const d1b = await cur();
        check('#44 段首 Backspace 合併兩段(整個段落分隔一起刪掉)',
            (await doc()) === '甲段。乙段。' && d1.line === 3 && d1b.line === 1 && d1b.col === 3,
            JSON.stringify({doc: await doc(), before: d1, after: d1b}));
        await save();
        check('#44 合併兩段後存檔,磁碟也只剩一段',
            fs.readFileSync(P(FILE), 'utf8') === '甲段。乙段。', JSON.stringify(fs.readFileSync(P(FILE), 'utf8')));

        await setDoc('甲段。\n\n乙段。');
        await home();
        await press('End');
        await page.keyboard.press('Delete');
        await settle(80, 500);
        check('#44 段尾 Delete 合併兩段(與段首 Backspace 對稱)',
            (await doc()) === '甲段。乙段。', JSON.stringify(await doc()));

        // 作者刻意多留空行時,段首 Backspace / 段尾 Delete 要把整個間隔刪掉(不是只刪一個換行)
        await setDoc('甲段。\n\n\n\n乙段。');
        await home();
        await press('ArrowDown', 3); // 藏起來的只有分隔那個,另外兩個空行看得見,方向鍵會停上去
        const mb0 = await cur();
        await page.keyboard.press('Backspace');
        await settle(80, 500);
        check('#44 段首 Backspace 合併多個空行的間隔:整個間隔一起刪',
            mb0.line === 5 && (await doc()) === '甲段。乙段。', JSON.stringify({doc: await doc(), cur: mb0}));
        await setDoc('甲段。\n\n\n\n乙段。');
        await home();
        await press('End');
        await page.keyboard.press('Delete');
        await settle(80, 500);
        check('#44 段尾 Delete 合併多個空行的間隔:整個間隔一起刪',
            (await doc()) === '甲段。乙段。', JSON.stringify(await doc()));

        // 方向鍵跨段:真實 ArrowDown/ArrowUp,不停在隱藏的空行上
        await setDoc('甲段。\n\n乙段。\n\n丙段。');
        await home();
        await press('ArrowDown');
        const k1 = await cur();
        await press('ArrowDown');
        const k2 = await cur();
        await press('ArrowUp');
        const k3 = await cur();
        await press('ArrowUp');
        const k4 = await cur();
        check('#44 方向鍵跨段不停在隱藏空行上(1→3→5→3→1)',
            k1.line === 3 && k2.line === 5 && k3.line === 3 && k4.line === 1,
            JSON.stringify([k1.line, k2.line, k3.line, k4.line]));
        // 左右方向鍵也一樣:段尾往右直接到下一段開頭
        await home();
        await press('End');
        await press('ArrowRight');
        const k5 = await cur();
        await press('ArrowLeft');
        const k6 = await cur();
        check('#44 左右方向鍵跨段:段尾往右到下段開頭、往左回上段段尾',
            k5.line === 3 && k5.col === 0 && k6.line === 1 && k6.col === 3, JSON.stringify([k5, k6]));

        // 點擊兩段之間的空隙:游標不會落在隱藏空行(line 2)
        const gapY = await page.evaluate(() => {
            const ls = [...document.querySelectorAll('.cm-content .cm-line')];
            const a = ls[0].getBoundingClientRect(), b = ls[2].getBoundingClientRect();
            return {y: Math.round((a.bottom + b.top) / 2), x: Math.round(a.left + 60)};
        });
        await page.mouse.click(gapY.x, gapY.y);
        await settle(80, 400);
        const k7 = await cur();
        check('#44 點擊段落之間的空隙,游標不會停在隱藏的空行上',
            k7.line !== 2 && (k7.line === 1 || k7.line === 3), JSON.stringify(k7));

        // 作者刻意多留的空行照實顯示(只藏掉分隔那一個)
        await setDoc('甲段。\n\n\n\n乙段。');
        await home();
        await press('ArrowDown');
        await settle(80, 400);
        const r2 = await rows();
        const zero = r2.filter(r => r.h === 0).length;
        const visibleBlank = r2.filter(r => r.t.trim() === '' && r.h > 0).length;
        check('#44 連續多個空行只藏掉分隔那一個,多出來的照實顯示',
            (await doc()) === '甲段。\n\n\n\n乙段。' && zero === 1 && visibleBlank === 2,
            JSON.stringify({doc: await doc(), zero, visibleBlank}));

        // ---- 三、標記隱藏、場景分隔、註解、段落樣式 ----
        const FULL = '# 稿紙測試\n\n第一段**粗體**與*斜體*還有 `a*b*c` 程式碼。\n\n***\n\n<!-- 這是註解 -->\n\n第二段。\n\n```\n# 不是標題\n**不是粗體**\n```\n\n第三段。\n';
        await setDoc(FULL);
        await page.keyboard.press('Control+End');
        await settle(120, 800);
        const seenTxt = await seen(), fileTxt = await doc();
        // 只看標題行與強調記號:程式碼區塊內的 # 與 ** 本來就要照實顯示(下一項驗)
        const headingLine = (seenTxt.split('\n').find(l => l.trim() !== '') || '').trim();
        check('#44 游標不在該行時:畫面看不到標題 # 與 ** 強調記號,檔案裡仍在',
            headingLine === '稿紙測試' && !seenTxt.includes('**粗體**') && !seenTxt.includes('*斜體*') &&
            seenTxt.includes('粗體') && seenTxt.includes('斜體') &&
            fileTxt === FULL, JSON.stringify({標題行: headingLine, 檔案: fileTxt.slice(0, 40)}));
        check('#44 場景分隔行在畫面上是 ◇◇◇,原始分隔符號看不到',
            seenTxt.includes('◇◇◇') && !seenTxt.includes('***'), JSON.stringify(seenTxt.split('\n').filter(l => l.includes('◇'))));
        check('#44 程式碼區塊內不套用(仍看得到 # 與 **)',
            seenTxt.includes('# 不是標題') && seenTxt.includes('**不是粗體**'), JSON.stringify(seenTxt.split('\n').filter(l => l.includes('不是'))));
        const cmt = await page.evaluate(() => {
            const e = document.querySelector('.cm-paper-comment');
            const p = document.querySelector('.cm-paper-para');
            if (!e) return null;
            const a = getComputedStyle(e), b = getComputedStyle(p);
            return {color: a.color, size: a.fontSize, text: e.innerText, normal: b.fontSize, inText: document.querySelector('.cm-content').innerText.includes('這是註解')};
        });
        check('#44 註解弱化:內容還在,但顏色/字級與正文不同',
            !!cmt && cmt.inText && cmt.color !== 'rgb(0, 0, 0)' && cmt.size !== cmt.normal, JSON.stringify(cmt));
        const style = await page.evaluate(() => {
            const ls = [...document.querySelectorAll('.cm-content .cm-line')];
            const heading = ls.find(l => l.classList.contains('cm-paper-h1'));
            const para = ls.filter(l => l.classList.contains('cm-paper-para')).pop();
            const g = e => { const s = getComputedStyle(e); return {indent: s.textIndent, padTop: s.paddingTop, size: s.fontSize, align: s.textAlign}; };
            const brk = ls.find(l => l.classList.contains('cm-paper-break'));
            return {heading: g(heading), para: g(para), brek: brk ? g(brk) : null};
        });
        check('#44 段首縮排兩個全形字寬、段落用段距區隔',
            Math.abs(parseFloat(style.para.indent) - 2 * parseFloat(style.para.size)) < 0.5 && parseFloat(style.para.padTop) > 0 &&
            parseFloat(style.heading.indent) === 0, JSON.stringify(style));
        check('#44 場景分隔行置中', !!style.brek && style.brek.align === 'center', JSON.stringify(style.brek));
        await shot('44-paper-dark');
        // 游標回到該行:顯示原始文字(可以改)
        await home();
        await settle(80, 400);
        check('#44 游標回到該行時顯示原始文字(標題還原成 # 開頭)',
            (await seen()).includes('# 稿紙測試'), JSON.stringify((await seen()).slice(0, 30)));

        // 既有稿件不重寫、不正規化:單一換行分段 + 多餘空行的檔案,開檔存檔後逐位元組不變
        const RAW = '# 舊稿\n\n甲段。\n乙段(只有單一換行)。\n\n\n丙段。\n';
        await setDoc(RAW);
        await save();
        check('#44 既有稿件開檔存檔後逐位元組不變(不正規化)',
            fs.readFileSync(P(FILE), 'utf8') === RAW, JSON.stringify(fs.readFileSync(P(FILE), 'utf8')));

        // 淺色主題與 640 寬(視覺確認:段距、縮排、隱藏空行、◇◇◇)
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-appearance]');
        await page.waitForSelector('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-light]');
        await page.click('[data-testid=close-settings]');
        await settle(120, 900);
        await shot('44-paper-light');
        await page.setViewportSize({width: 640, height: 672});
        await settle(200, 1200);
        await shot('44-paper-640');
        check('#44 640 寬不出現水平捲軸(稿紙呈現)',
            await page.evaluate(() => document.querySelector('.cm-scroller').scrollWidth <= document.querySelector('.cm-scroller').clientWidth + 1));
        await page.setViewportSize({width: 1440, height: 900});
        await settle(200, 1000);
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-appearance]');
        await page.waitForSelector('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-dark]');
        await page.click('[data-testid=close-settings]');
        await settle(120, 800);

        // ---- 第二階段(二):版心寬度、字級、段距可調(Issue #44,SPEC §17.3) ----
        // 作者的全域偏好(與主題同一處設定、同一種保存方式,不是作品設定);量測 computed style 與實際幾何。
        // 預設值必須等於第一階段的畫面;標題/場景分隔行用 em 等比縮放;段首縮排維持兩個全形字寬。
        const LDOC = '# 版面測試\n\n第一段內容。\n\n***\n\n第二段內容。\n\n第三段內容。\n';
        const layout = () => page.evaluate(() => {
            const sc = document.querySelector('.cm-scroller');
            const content = document.querySelector('.cm-content');
            const lines = [...document.querySelectorAll('.cm-content .cm-line')];
            const para = lines.find(l => l.classList.contains('cm-paper-para'));
            const h1 = lines.find(l => l.classList.contains('cm-paper-h1'));
            const mark = document.querySelector('.cm-paper-break-mark');
            const g = e => e && getComputedStyle(e);
            const maxIn = e => e ? Math.max(...[e, ...e.querySelectorAll('*')].map(x => parseFloat(getComputedStyle(x).fontSize))) : null;
            return {
                rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
                body: parseFloat(g(sc).fontSize),
                gap: parseFloat(g(para).paddingTop),
                indent: parseFloat(g(para).textIndent),
                maxW: parseFloat(g(content).maxWidth),
                w: Math.round(content.getBoundingClientRect().width),
                h1: maxIn(h1), // 標題(含內部 span)的最大字級:1.5em → 要跟著正文等比縮放
                mark: mark ? parseFloat(g(mark).fontSize) : null, // 場景分隔 ◇◇◇:與正文同大小
            };
        });
        const near = (a, b, eps = 0.05) => typeof a === 'number' && Math.abs(a - b) <= eps;
        // 外觀頁的三個稿紙版面預設檔下拉(選項有穩定的 data-testid,不靠顯示文字)
        const pickPaper = async (testid, value) => {
            await page.click('[data-testid=open-settings]');
            await page.waitForSelector('[data-testid=settings-page]');
            await page.click('[data-testid=tab-appearance]');
            await page.click(`[data-testid="${testid}"]`);
            await page.click(`[data-testid="${testid}-opt-${value}"]`);
            await page.click('[data-testid=close-settings]');
            await settle(120, 900);
        };

        // 受控起點:作者的真實設定可能在任何檔位(例如字級已選特大),先用同一個設定入口把三項
        // 設成預設值並等待套用,再量 m0(否則預設外觀與變更幅度斷言會假失敗);作者的偏好由
        // E2E 外層的 settings.json 備份還原契約負責還原,不在此另存另還。
        await pickPaper('paper-width', '44rem');
        await pickPaper('paper-font-size', '1.08rem');
        await pickPaper('paper-gap', '0.7em');
        await setDoc(LDOC);
        const m0 = await layout();
        check('#44 稿紙版面預設值等於第一階段畫面(字級 1.08rem、段距 0.7em、版心 44rem)',
            near(m0.body, 1.08 * m0.rem, 0.1) && near(m0.gap / m0.body, 0.7, 0.01) && near(m0.maxW, 44 * m0.rem, 1) &&
            near(m0.indent, 2 * m0.body, 0.5) && near(m0.h1 / m0.body, 1.5, 0.02) && near(m0.mark / m0.body, 1, 0.02),
            JSON.stringify(m0));

        // 字級:立即套用到開著的編輯器(不用重開);標題與場景分隔行等比縮放;段首縮排維持 2em
        await pickPaper('paper-font-size', '1.45rem');
        const m1 = await layout();
        check('#44 字級設定改變正文計算後字級(立即套用,不用重開)',
            m1.body > m0.body + 3 && near(m1.body, 1.45 * m1.rem, 0.1), JSON.stringify({m0, m1}));
        check('#44 標題與場景分隔行的相對大小跟著字級等比縮放',
            near(m1.h1 / m1.body, 1.5, 0.02) && near(m1.mark / m1.body, 1, 0.02) &&
            near(m1.h1 / m1.body, m0.h1 / m0.body, 0.01) && near(m1.mark / m1.body, m0.mark / m0.body, 0.01),
            JSON.stringify({m0, m1}));
        check('#44 字級調大時段首縮排維持兩個全形字寬(2em)',
            near(m1.indent, 2 * m1.body, 0.5), JSON.stringify(m1));

        // 段距:段落之間的距離(cm-paper-para 的 padding-top)
        await pickPaper('paper-gap', '1.15em');
        const m2 = await layout();
        check('#44 段距設定改變段落之間的距離',
            m2.gap > m1.gap + 1 && near(m2.gap / m2.body, 1.15, 0.01), JSON.stringify({m1, m2}));

        // 版心寬度:正文欄的最大寬度(cm-content 的 max-width)
        await pickPaper('paper-width', '52rem');
        const m3 = await layout();
        check('#44 版心寬度設定改變正文欄最大寬度',
            near(m3.maxW, 52 * m3.rem, 1) && m3.w > m1.w + 40, JSON.stringify({m1, m3}));

        // 重開編輯器(reload 整個前端)後仍保持:設定已存回 settings.json,啟動時重新載入
        await page.reload();
        await settle(250, 2500);
        await ensureProject('第一章', 'manuscript');
        await openTestFile(LDOC);
        const m4 = await layout();
        const saved = await page.evaluate(() => window.go.main.App.GetSettings().then(s => ({w: s.paperWidth, f: s.paperFontSize, g: s.paperParaGap})));
        check('#44 重開編輯器後版心寬度、字級、段距仍保持(設定已存回)',
            near(m4.body, m3.body, 0.1) && near(m4.gap, m3.gap, 0.5) && near(m4.maxW, m3.maxW, 1) &&
            saved.w === '52rem' && saved.f === '1.45rem' && saved.g === '1.15em', JSON.stringify({m4, saved}));

        // 640 寬(半螢幕)在大字級+寬版心下也不出水平捲軸:版心比視窗寬時照常填滿可用寬度
        await page.setViewportSize({width: 640, height: 672});
        await settle(250, 1500);
        check('#44 640 寬(大字級、寬版心)不出現水平捲軸,版心填滿可用寬度',
            await page.evaluate(() => {
                const s = document.querySelector('.cm-scroller');
                const c = document.querySelector('.cm-content');
                const r = c.getBoundingClientRect();
                return s.scrollWidth <= s.clientWidth + 1 && r.right <= window.innerWidth + 1 && r.width < parseFloat(getComputedStyle(c).maxWidth);
            }), JSON.stringify(await layout()));
        await shot('44-paper-layout-640');
        await page.setViewportSize({width: 1440, height: 900});
        await settle(250, 1200);

        // 字級調大時游標穩定保護仍成立(Editor.tsx 的縮放保護):長文捲到結尾、游標可見,
        // 字級調大後游標不得被推出畫面
        await setDoc(Array.from({length: 120}, (_, i) => `第${i + 1}段長度測試內容,用來把版面擑長。`).join('\n\n') + '\n');
        await pickPaper('paper-font-size', '0.95rem');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await settle(120, 800);
        const visBefore = await page.evaluate(() => window.__perkinsEditor.cursorVisible());
        await pickPaper('paper-font-size', '1.45rem');
        await settle(200, 1000);
        const visAfter = await page.evaluate(() => window.__perkinsEditor.cursorVisible());
        check('#44 字級調大時游標穩定保護仍成立(原本可見的游標不得被推出畫面)',
            visBefore === true && visAfter === true, JSON.stringify({visBefore, visAfter}));

        // 回到預設值:畫面與改前完全一致(作者沒動設定時外觀與第一階段相同)
        await pickPaper('paper-font-size', '1.08rem');
        await pickPaper('paper-gap', '0.7em');
        await pickPaper('paper-width', '44rem');
        await setDoc(LDOC);
        const m6 = await layout();
        check('#44 回到預設值後畫面與改前一致(字級/段距/版心/縮排)',
            near(m6.body, 1.08 * m6.rem, 0.1) && near(m6.gap / m6.body, 0.7, 0.01) && near(m6.maxW, 44 * m6.rem, 1) &&
            near(m6.body, m0.body, 0.1) && near(m6.gap, m0.gap, 0.5) &&
            near(m6.indent, m0.indent, 0.5) && near(m6.h1, m0.h1, 0.5) && near(m6.mark, m0.mark, 0.5),
            JSON.stringify({m0, m6}));

        // 截圖:深/淺各一(含調大字級的樣子)與設定入口
        await pickPaper('paper-font-size', '1.25rem');
        await pickPaper('paper-gap', '1.15em');
        await shot('44-paper-layout-dark-big');
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-appearance]');
        await page.waitForSelector('[data-testid=appearance-visual]');
        await shot('44-paper-layout-settings');
        await page.click('[data-testid=appearance-mode-light]');
        await page.click('[data-testid=close-settings]');
        await settle(120, 900);
        await shot('44-paper-layout-light-big');
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-appearance]');
        await page.waitForSelector('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-dark]');
        await page.click('[data-testid=close-settings]');
        await settle(120, 800);
        // 還原預設(後面的組與量測不受影響)
        await pickPaper('paper-font-size', '1.08rem');
        await pickPaper('paper-gap', '0.7em');

        // ---- 第二階段(一):打字機捲動與專注模式(Issue #44,SPEC §17.3) ----
        // 只改呈現、狀態只存記憶體。游標的螢幕位置用 DEV hook __perkinsEditor.cursorScreen() 量
        // (游標頂端相對編輯區頂端的高度 ÷ 編輯區高度 = 比值,目標約 0.4);淡化看 .cm-line 的計算後 opacity。
        const TDOC = '# 打字機測試\n\n' + Array.from({length: 40}, (_, i) => `打字第${i + 1}段,內容用來把文件撐長。`).join('\n\n') + '\n\n***\n\n末段。\n';
        await setDoc(TDOC);
        const scr = () => page.evaluate(() => {
            const s = window.__perkinsEditor.cursorScreen();
            return s ? {y: Math.round(s.y), h: Math.round(s.h), ratio: s.y / s.h} : null;
        });
        const stTop = () => page.evaluate(() => document.querySelector('.cm-scroller').scrollTop);
        // 專注模式淡化有 200ms 透明度漸變(#120):量測前等進行中的漸變結束,讀到的是最終值
        const ops = () => page.evaluate(async () => {
            const ls = [...document.querySelectorAll('.cm-content .cm-line')];
            await Promise.all(ls.flatMap(l => l.getAnimations().map(a => a.finished.catch(() => {}))));
            return ls.map(l => ({t: l.innerText.trim(), op: parseFloat(getComputedStyle(l).opacity)}));
        });
        const openAppMenu = async () => {
            await page.click('[data-testid=app-menu]');
            await page.waitForSelector('[data-testid=app-menu-content]', {timeout: 5000});
        };
        // 開關選單(標題欄應用程式選單):讀完文字後要把選單確實關掉——選單浮層開著時
        // 鍵盤與滑鼠都會被它吃掉(第一次實測:Escape 沒關掉,後面的方向鍵/滾輪全部失效)
        const menuText = async id => {
            await openAppMenu();
            const t = ((await page.textContent(`[data-testid=${id}]`)) || '').trim();
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => !document.querySelector('[data-testid=app-menu-content]'), null, {timeout: 1500}).catch(() => {});
            if (await page.locator('[data-testid=app-menu-content]').count()) {
                await page.click('[data-testid=titlebar-title]'); // 點中性處關閉(不動到編輯器游標)
                await page.waitForFunction(() => !document.querySelector('[data-testid=app-menu-content]'), null, {timeout: 3000}).catch(() => {});
            }
            await settle(60, 300);
            return {t, closed: (await page.locator('[data-testid=app-menu-content]').count()) === 0};
        };

        // 存檔按鈕在「已儲存」(停用)時滑鼠移上去仍看得到提示(PR #156 審查:停用按鈕收不到 pointer 事件)
        await page.click('.cm-content');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=save-button]:disabled');
        const saveBB = await page.locator('[data-testid=save-button]').boundingBox(); // 照真人操作把滑鼠移到按鈕上
        await page.mouse.move(saveBB.x + saveBB.width / 2, saveBB.y + saveBB.height / 2);
        const saveTip = await page.waitForSelector('[role=tooltip]:has-text("儲存(Ctrl+S)")', {timeout: 3000}).then(() => true, () => false);
        await page.mouse.move(5, 5);
        check('工具列 已儲存(停用)的存檔按鈕滑鼠移上去看得到「儲存(Ctrl+S)」提示', saveTip);

        // 專注寫作(#116):工具列按鈕——存在、aria-pressed 切換、打字機捲動與段落淡化一起開關
        const dimCount = async () => (await ops()).filter(r => r.t !== '' && r.op < 1).length;
        const focusBtn = page.locator('[data-testid=toolbar-focus]');
        const fw0 = await focusBtn.getAttribute('aria-pressed');
        await focusBtn.click();
        await settle(150, 1000);
        const fw1 = await focusBtn.getAttribute('aria-pressed');
        const twOn = await page.evaluate(() => document.querySelector('.cm-host').classList.contains('cm-typewriter'));
        const dimOn = await dimCount();
        await focusBtn.click();
        await settle(150, 1000);
        const fw2 = await focusBtn.getAttribute('aria-pressed');
        const twOff = await page.evaluate(() => document.querySelector('.cm-host').classList.contains('cm-typewriter'));
        const dimOff = await dimCount();
        check('#116 專注寫作:工具列按鈕存在,點下去打字機捲動與段落淡化一起開啟,再點一次全部恢復',
            fw0 === 'false' && fw1 === 'true' && twOn && dimOn > 0 && fw2 === 'false' && !twOff && dimOff === 0,
            JSON.stringify({fw0, fw1, fw2, twOn, dimOn, twOff, dimOff}));
        // 1280 寬時按鈕有文字「專注寫作」
        await page.setViewportSize({width: 1280, height: 800});
        await settle(200, 1000);
        const btnText = (await focusBtn.innerText()).trim();
        check('#116 專注寫作:1280 寬時按鈕有文字「專注寫作」', btnText === '專注寫作', JSON.stringify({btnText}));
        await page.setViewportSize({width: 1440, height: 900});
        await settle(200, 1000);

        // 專注寫作:選單開啟。游標在文件開頭時不硬拉(開頭照常顯示,scrollTop 夾在 0)
        await page.click('.cm-content');
        await page.keyboard.press('Control+Home');
        await settle(80, 500);
        const t0 = await scr();
        await openAppMenu();
        const fwLabelOff = (await page.textContent('[data-testid=menu-focus]')) || '';
        if (await page.locator('[data-testid=menu-focus]').count()) await page.click('[data-testid=menu-focus]');
        else await page.click('[data-testid=titlebar-title]'); // 開關不存在(破壞驗證時):只關選單,讓檢查自己 FAIL
        await settle(150, 1000);
        const t1 = await scr();
        check('#116 專注寫作(選單開啟):文件開頭不足以捲動時不硬拉,開頭照常顯示',
            fwLabelOff.includes('專注寫作') && t0 && t1 && (await stTop()) < 2 && t1.ratio < 0.25,
            JSON.stringify({label: fwLabelOff, t0, t1, st: await stTop()}));
        const fwMenu = await menuText('menu-focus');
        check('#116 專注寫作:選單顯示目前狀態(開啟後標示「離開專注寫作」),選完能回到編輯器',
            fwMenu.t.includes('離開專注寫作') && fwMenu.closed, JSON.stringify(fwMenu));

        // 連續輸入與方向鍵移動:游標行維持在固定範圍(約上方 40%),內容捲動而不是游標往下跑。
        // 先把游標放到中段(上方有足夠內容可捲動)再量,避免開頭夾住的暫態混進量測;
        // 同時驗證游標真的有動(避免輸入沒到編輯器時檢查空轉)
        await page.evaluate(() => window.__perkinsEditor.setCursor(21, 0)); // 打字第10段
        await settle(150, 1000);
        const lineBefore = (await page.evaluate(() => window.__perkinsEditor.cursor())).line;
        const stBefore = await stTop();
        const ratios = [(await scr()).ratio];
        for (let i = 0; i < 12; i++) {
            await page.keyboard.press('ArrowDown');
            await settle(40, 250);
            ratios.push((await scr()).ratio);
        }
        await page.keyboard.type('輸入文字。');
        await settle(80, 500);
        ratios.push((await scr()).ratio);
        const lineAfter = (await page.evaluate(() => window.__perkinsEditor.cursor())).line;
        const stTyped = await stTop();
        check('#44 打字機捲動:輸入與方向鍵移動時游標行維持在固定範圍,內容捲動而不是游標往下跑',
            lineAfter > lineBefore + 10 && stTyped > stBefore + 100 &&
            ratios.every(r => r > 0.3 && r < 0.5) && Math.max(...ratios) - Math.min(...ratios) < 0.08,
            JSON.stringify({lineBefore, lineAfter, stBefore, stTyped, ratios: ratios.map(r => Math.round(r * 100) / 100)}));

        // 快捷鍵 Ctrl+Shift+D 關閉:恢復一般行為(游標往下跑、內容不捲動);再按開啟:游標行回到固定位置
        await page.keyboard.press('Control+Shift+D');
        await settle(100, 600);
        const twOff0 = await scr();
        const twOffS0 = await stTop();
        const lineOff0 = (await page.evaluate(() => window.__perkinsEditor.cursor())).line;
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await settle(80, 500);
        const twOff1 = await scr();
        const twOffS1 = await stTop();
        const lineOff1 = (await page.evaluate(() => window.__perkinsEditor.cursor())).line;
        check('#116 專注寫作關閉(快捷鍵)後恢復一般行為:游標往下跑、內容不捲動',
            lineOff1 > lineOff0 && twOff1.ratio > twOff0.ratio + 0.02 && Math.abs(twOffS1 - twOffS0) < 2,
            JSON.stringify({lineOff0, lineOff1, twOff0, twOff1, twOffS0, twOffS1}));
        await page.keyboard.press('Control+Shift+D');
        await settle(150, 1000);
        const twOn2 = await scr();
        check('#116 專注寫作(快捷鍵開啟)後游標行回到固定位置(約上方 40%)',
            twOn2 && twOn2.ratio > 0.3 && twOn2.ratio < 0.5, JSON.stringify(twOn2));

        // 作者用滾輪主動捲動閱讀:不被拉回,直到下一次移動游標(先確認編輯器有焦點)
        await page.click('.cm-content');
        await settle(80, 400);
        const preWheel = await stTop();
        const box = await page.locator('.cm-scroller').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -400);
        await settle(150, 1000);
        const w0 = await stTop();
        await page.waitForTimeout(600);
        const w1 = await stTop();
        check('#44 打字機捲動:作者滾動閱讀時不被拉回(捲動位置維持)',
            w0 < preWheel - 100 && Math.abs(w1 - w0) < 2, JSON.stringify({preWheel, w0, w1}));
        await page.keyboard.press('ArrowDown');
        await settle(150, 1000);
        const back = await scr();
        check('#44 打字機捲動:作者移動游標後才拉回固定位置',
            back && back.ratio > 0.3 && back.ratio < 0.5, JSON.stringify(back));

        // IME:組字中不捲動(不打斷組字),組字結束才定位(CDP 發真實組字事件;無頭環境無真實 IME,實機見 #47)
        await page.click('.cm-content'); // 確認焦點在編輯器(組字事件需要)
        await settle(80, 400);
        await page.mouse.wheel(0, 150); // 把畫面捲離固定位置(游標仍在畫面內):組字中不得被拉回
        await settle(150, 1000);
        const disturbed = await stTop();
        const cdp2 = await page.context().newCDPSession(page);
        await cdp2.send('Input.imeSetComposition', {text: 'ㄙㄣ', selectionStart: 1, selectionEnd: 1});
        await settle(150, 1000);
        const during = await stTop();
        check('#44 打字機捲動:IME 組字中不捲動(不打斷組字)',
            Math.abs(during - disturbed) < 2, JSON.stringify({disturbed, during}));
        await cdp2.send('Input.insertText', {text: '森林'});
        await settle(250, 1500);
        const afterIme = await scr();
        check('#44 打字機捲動:組字結束後才定位(游標行回到固定位置)',
            afterIme && afterIme.ratio > 0.3 && afterIme.ratio < 0.5, JSON.stringify(afterIme));
        // 專注寫作(段落淡化):打字機捲動維持開啟直接測(淡化在打字機捲動開著時一樣成立);
        // 游標所在段落不淡化,其他(含標題、場景分隔)淡化;換段跟著換。
        // 畫面只渲染可見的行,一律用行文字找目標行(不靠行序),量測前先捲到該區
        const rowOf = t => page.evaluate(async s => {
            const l = [...document.querySelectorAll('.cm-content .cm-line')].find(x => x.innerText.trim().startsWith(s));
            if (l) await Promise.all(l.getAnimations().map(a => a.finished.catch(() => {})));
            return l ? {t: l.innerText.trim(), op: parseFloat(getComputedStyle(l).opacity)} : null;
        }, t);
        await setDoc(TDOC);
        await page.click('.cm-content');
        await page.keyboard.press('Control+Home');
        await settle(150, 1000);
        await page.evaluate(() => window.__perkinsEditor.setCursor(3, 0)); // 打字第1段
        await settle(150, 1000);
        const f1 = await ops();
        const f1all = f1.filter(r => r.t !== '');
        const dimmed1 = f1all.filter(r => r.op < 1);
        const headRow = f1.find(r => r.t === '打字機測試');
        check('#116 專注寫作(段落淡化):游標所在段落不淡化,其他段落(含標題)淡化',
            headRow && headRow.op < 1 && f1all.length > 3 && dimmed1.length === f1all.length - 1 &&
            (await rowOf('打字第1段')).op === 1,
            JSON.stringify({heading: headRow, dimmed: dimmed1.length, all: f1all.length, para: await rowOf('打字第1段')}));
        await page.evaluate(() => window.__perkinsEditor.setCursor(7, 0)); // 打字第3段
        await settle(150, 1000);
        check('#116 專注寫作(段落淡化):游標移到別段,淡化跟著換',
            (await rowOf('打字第3段')).op === 1 && (await rowOf('打字第1段')).op < 1,
            JSON.stringify({now: await rowOf('打字第3段'), old: await rowOf('打字第1段')}));

        // 選取跨多段:選取涵蓋的段落都不淡化
        await page.evaluate(() => window.__perkinsEditor.setCursor(5, 0)); // 打字第2段
        await settle(100, 600);
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Shift+ArrowDown');
        await settle(150, 1000);
        const sel = [await rowOf('打字第2段'), await rowOf('打字第3段'), await rowOf('打字第4段')];
        const out = [await rowOf('打字第1段'), await rowOf('打字第5段')];
        check('#116 專注寫作(段落淡化):選取跨多段時,選取涵蓋的段落都不淡化',
            sel.every(r => r && r.op === 1) && out.every(r => r && r.op < 1), JSON.stringify({sel, out}));

        // 場景分隔:游標不在它上面時淡化,游標移上去就不淡化
        await page.keyboard.press('Control+End');
        await settle(150, 1000);
        await page.evaluate(() => window.__perkinsEditor.setCursor(85, 0)); // 末段
        await settle(150, 1000);
        const brk = await rowOf('◇◇◇');
        const last = await rowOf('末段');
        check('#116 專注寫作(段落淡化):場景分隔行一樣依是否在游標所在段落淡化',
            brk && brk.op < 1 && last && last.op === 1, JSON.stringify({brk, last}));

        // 快捷鍵 Ctrl+Shift+D 關閉:回到一般行為(全部不淡化)
        await page.keyboard.press('Control+Shift+D');
        await settle(150, 1000);
        const f4 = await ops();
        check('#116 專注寫作關閉(快捷鍵)後恢復一般行為:所有段落都不淡化',
            f4.filter(r => r.t !== '' && r.op < 1).length === 0, JSON.stringify(f4.filter(r => r.op < 1).slice(0, 3)));

        // 快捷鍵必須在 CodeMirror keymap 之前攔截(PR #79 返工):Caps Lock 下 Ctrl+Shift+D 的 key
        // 是小寫 'd'(keyCode 68),CM 的 Mod-d(selectNextOccurrence)若先收到會把游標所在的英文字
        // 選起來,切換專注寫作後下一個輸入就取代被選的字。送真實 keyDown(key='d'+Ctrl+Shift)驗:
        // 狀態切換且原本的游標/選取不變。
        await setDoc('hello world\n\n第二段。\n');
        await home();
        await press('ArrowRight', 2); // 游標在 hello 中間(空選取)
        const capKey = (k, modifiers = 10) => cdp.send('Input.dispatchKeyEvent', {type: 'keyDown', key: k, code: `Key${k.toUpperCase()}`,
            windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), nativeVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers}); // 預設 10 = Ctrl+Shift
        const capUp = (k, modifiers = 10) => cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', key: k, code: `Key${k.toUpperCase()}`,
            windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), nativeVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers}); // 預設 10 = Ctrl+Shift
        const kb0 = await page.evaluate(() => window.__perkinsEditor.pos());
        const dim0 = (await ops()).filter(r => r.t !== '' && r.op < 1).length;
        await capKey('d');
        await capUp('d');
        await settle(150, 1000);
        const kb1 = await page.evaluate(() => window.__perkinsEditor.pos());
        const dim1 = (await ops()).filter(r => r.t !== '' && r.op < 1).length;
        check('#44 PR#79 返工:Caps Lock 風格的 Ctrl+Shift+D(key=d)切換專注寫作且游標/選取不變',
            dim0 === 0 && dim1 > 0 && kb1.anchor === kb0.anchor && kb1.head === kb0.head,
            JSON.stringify({kb0, kb1, dim0, dim1}));
        await capKey('d');
        await capUp('d'); // 關回
        await settle(150, 800);
        const twCls = () => page.evaluate(() => document.querySelector('.cm-host').classList.contains('cm-typewriter'));
        const tw0 = await twCls();
        const dimA0 = (await ops()).filter(r => r.t !== '' && r.op < 1).length;
        await capKey('t');
        await capUp('t');
        await settle(150, 1000);
        const tw1 = await twCls();
        const dimA1 = (await ops()).filter(r => r.t !== '' && r.op < 1).length;
        const kb2 = await page.evaluate(() => window.__perkinsEditor.pos());
        check('#44 PR#79 返工:Caps Lock 風格的 Ctrl+Shift+T(key=t)不再切換任何模式(.cm-typewriter 存在與淡化不變),選取不變',
            tw0 === tw1 && dimA0 === dimA1 && kb2.anchor === kb0.anchor && kb2.head === kb0.head,
            JSON.stringify({tw0, tw1, dimA0, dimA1, kb2}));

        // ===== #80:Caps Lock 下其餘全域快捷鍵(實測後修正,回歸) =====
        // Ctrl+Shift+F(key='f')與 Ctrl+Shift+D/T 同一個問題:CM 的 Mod-f 會先把按鍵處理掉並打開
        // 搜尋面板,所以禪模式也必須在 capture 階段擋。斷言「有切換」且「沒有副作用」
        // (搜尋面板沒開、文件文字與選取不變)。
        await setDoc('hello world\n\n第二段。\n');
        await home();
        await press('ArrowRight', 2); // 游標在 hello 中間(空選取)
        const st80 = () => page.evaluate(() => ({
            zen: !!document.querySelector('[data-testid=zen-exit]'),
            search: !!document.querySelector('.perkins-search'),
            doc: window.__perkinsEditor.doc(), pos: window.__perkinsEditor.pos(),
        }));
        const zenF0 = await st80();
        await capKey('f');
        await capUp('f');
        await settle(200, 1200);
        const zenF1 = await st80();
        check('#80 Caps Lock 下 Ctrl+Shift+F(key=f)只切禪模式:不開搜尋面板、文件與選取不變',
            !zenF0.zen && zenF1.zen && !zenF1.search && zenF1.doc === zenF0.doc &&
            zenF1.pos.anchor === zenF0.pos.anchor && zenF1.pos.head === zenF0.pos.head,
            JSON.stringify({zen0: zenF0.zen, zen1: zenF1.zen, search: zenF1.search, pos0: zenF0.pos, pos1: zenF1.pos}));
        await capKey('f');
        await capUp('f'); // 關回禪模式(後續步驟需要側欄)
        await page.waitForSelector('[data-testid=rail]:visible', {timeout: 5000});
        await settle(150, 800);
        // 右鍵選單開著時按 Ctrl+Shift+F:禪模式的 capture 攔截不能讓選單留在稿紙上(#80 審查)
        const cmBox = await page.locator('.cm-content').boundingBox();
        await page.mouse.click(cmBox.x + 40, cmBox.y + 10, {button: 'right'});
        await page.waitForSelector('.ctxmenu');
        await capKey('f');
        await capUp('f');
        await settle(150, 800);
        const menuAfterZen = await page.evaluate(() => ({
            menu: !!document.querySelector('.ctxmenu'), zen: !!document.querySelector('[data-testid=zen-exit]')}));
        check('#80 右鍵選單開著時 Ctrl+Shift+F 切禪模式並收起選單', menuAfterZen.zen && !menuAfterZen.menu, JSON.stringify(menuAfterZen));
        await capKey('f');
        await capUp('f'); // 關回禪模式
        await page.waitForSelector('[data-testid=rail]:visible', {timeout: 5000});
        await settle(150, 800);
        // Ctrl+S:Caps Lock 下 key 是大寫 'S',比對不分大小寫才會存檔(setDoc 之後是未存狀態)
        const saveS0 = await st80();
        const diskBefore = fs.readFileSync(P(FILE), 'utf8').includes('hello world');
        await capKey('S', 2); // modifiers 2 = 只有 Ctrl(Caps Lock 下的 Ctrl+S,沒有 Shift)
        await capUp('S', 2);
        // 不用 waitForSelector:等不到「已儲存」也是一種結果,由斷言把關(不會中斷整組)
        const savedMark = await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")', {timeout: 8000})
            .then(() => true).catch(() => false);
        await settle(150, 800);
        const saveS1 = await st80();
        const diskAfter = fs.readFileSync(P(FILE), 'utf8').includes('hello world');
        check('#80 Caps Lock 下 Ctrl+S(key=S)會存檔:磁碟更新、文件與選取不變',
            savedMark && !diskBefore && diskAfter && saveS1.doc === saveS0.doc &&
            saveS1.pos.anchor === saveS0.pos.anchor && saveS1.pos.head === saveS0.pos.head,
            JSON.stringify({savedMark, diskBefore, diskAfter, pos0: saveS0.pos, pos1: saveS1.pos}));

        // 640 寬(半螢幕)可用:快捷鍵開啟、游標行維持固定位置、無水平捲軸。
        // 先把文件與游標帶到中段(上一段是快捷鍵的短測試檔,游標在開頭會被不硬拉的夾住影響量測)
        await setDoc(TDOC);
        await page.evaluate(() => window.__perkinsEditor.setCursor(21, 0)); // 打字第10段
        await settle(150, 1000);
        await page.setViewportSize({width: 640, height: 672});
        await settle(250, 1500);
        await page.keyboard.press('Control+Shift+D');
        await settle(150, 1000);
        const g0 = await scr();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await settle(120, 800);
        const g1 = await scr();
        const gDim = (await ops()).filter(r => r.t !== '' && r.op < 1).length;
        const gFocusBB = await page.locator('[data-testid=toolbar-focus]').boundingBox();
        check('#116 640 寬:專注寫作可用(游標行維持固定位置、有淡化、無水平捲軸),工具列按鈕可見(只剩圖示)',
            gFocusBB && gFocusBB.width > 0 && g0 && g1 && g0.ratio > 0.3 && g0.ratio < 0.5 && g1.ratio > 0.3 && g1.ratio < 0.5 && gDim > 0 &&
            await page.evaluate(() => document.querySelector('.cm-scroller').scrollWidth <= document.querySelector('.cm-scroller').clientWidth + 1),
            JSON.stringify({g0, g1, gDim, gFocusBB}));
        await shot('44-typewriter-focus-640');

        // 禪模式下可用:選單有「專注寫作」項目且切換有效
        await page.keyboard.press('Control+Shift+F');
        await settle(250, 1500);
        await openAppMenu();
        const zenMenu = await page.evaluate(() => ({
            fo: !!document.querySelector('[data-testid=menu-focus]'),
        }));
        const zDimOn = (await ops()).filter(r => r.t !== '' && r.op < 1).length;
        if (zenMenu.fo) await page.click('[data-testid=menu-focus]'); // 選單關閉專注寫作
        else await page.click('[data-testid=titlebar-title]'); // 開關不存在(破壞驗證時):只關選單,讓檢查自己 FAIL
        await settle(150, 1000);
        const zDim = (await ops()).filter(r => r.t !== '' && r.op < 1).length;
        check('#116 禪模式下可用:選單有「專注寫作」項目且切換有效',
            zenMenu.fo && zDimOn > 0 && zDim === 0, JSON.stringify({zenMenu, zDimOn, zDim}));
        await page.keyboard.press('Control+Shift+D'); // 再開啟(截圖用)
        await settle(150, 1000);
        await page.keyboard.press('Control+Shift+F'); // 離開禪模式
        await settle(250, 1500);

        // 截圖:深/淺各一(專注寫作,游標在中段)
        await page.setViewportSize({width: 1440, height: 900});
        await settle(250, 1200);
        await page.evaluate(() => window.__perkinsEditor.setCursor(21, 0)); // 打字第10段
        await settle(150, 1000);
        await shot('44-typewriter-focus-dark');
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-appearance]');
        await page.waitForSelector('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-light]');
        await page.click('[data-testid=close-settings]');
        await settle(150, 1000);
        await shot('44-typewriter-focus-light');
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-appearance]');
        await page.waitForSelector('[data-testid=appearance-visual]');
        await page.click('[data-testid=appearance-mode-dark]');
        await page.click('[data-testid=close-settings]');
        await settle(150, 1000);
        await page.keyboard.press('Control+Shift+D'); // 關掉專注寫作
        await settle(100, 600);

        // 效能(SPEC §17.3 基準):約 7.7 萬字章節、專注寫作開啟,輸入到畫面更新(40 次)
        const BIG = Array.from({length: 2200}, (_, i) => `第${i + 1}段長度測試內容,用來把版面撐長,模擬真實章節的段落長度。`).join('\n\n') + '\n';
        await setDoc(BIG);
        await page.keyboard.press('Control+Shift+D');
        await settle(250, 1500);
        await page.evaluate(() => window.__perkinsEditor.setCursor(1100, 0));
        await settle(150, 1000);
        await page.evaluate(() => {
            const ts = [];
            (window).__perf = ts;
            document.querySelector('.cm-content').addEventListener('keydown', () => {
                const t0 = performance.now();
                requestAnimationFrame(() => ts.push(performance.now() - t0));
            }, true);
        });
        for (let i = 0; i < 40; i++) { await page.keyboard.press('x'); await page.waitForTimeout(25); }
        const perf = await page.evaluate(() => window.__perf);
        const sorted = [...perf].sort((a, b) => a - b);
        const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
        const maxT = sorted.length ? sorted[sorted.length - 1] : null;
        check('#44 效能:約 7.7 萬字章節輸入到畫面更新(專注寫作)不失速(中位數 < 40ms、最大 < 150ms)',
            perf.length >= 38 && median < 40 && maxT < 150,
            JSON.stringify({chars: BIG.length, n: perf.length, median: median && Math.round(median * 10) / 10, max: maxT && Math.round(maxT * 10) / 10}));
        await page.keyboard.press('Control+Shift+D');
        await settle(100, 600);

        // ---- #116 PR-2:打字機音效 ----
        // 無頭環境聽不到聲音,用 DEV hook window.__perkinsSound 的計數驗證(前後差值)
        // 比對前後差值(同一頁面先前若有計數也不影響)
        const soundBase = await page.evaluate(() => ({...window.__perkinsSound}));
        const sound = async () => { const c = await page.evaluate(() => window.__perkinsSound); return {tick: c.tick - soundBase.tick, ding: c.ding - soundBase.ding}; };
        // 1) 預設關閉:打字不響
        await page.click('.cm-content');
        await page.keyboard.press('Control+Home');
        await page.keyboard.type('abc');
        await settle(80, 500);
        const sn0 = await sound();
        check('#116 打字機音效:預設關閉,打字不響(tick 差 0)',
            sn0.tick === 0 && sn0.ding === 0, JSON.stringify({sn0}));
        // 2) 設定頁開啟:打 abc → tick 差 3;Enter → ding 差 1、tick 差 0
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.waitForSelector('[data-testid=typing-sound-row]');
        await page.click('[data-testid=typing-sound-switch]');
        await settle(100, 800);
        await page.click('[data-testid=close-settings]');
        await settle(150, 1000);
        // 開關打開時會試播一聲:從這裡重新起算。打字間隔 60ms(長按連發節流是 35ms,太快會被當成連發)
        Object.assign(soundBase, await page.evaluate(() => ({...window.__perkinsSound})));
        // #163:開關打開但專注寫作未開(一般模式):打字與 Enter 都不響
        await page.click('.cm-content');
        await page.keyboard.press('Control+Home');
        await page.keyboard.type('abc', {delay: 60});
        await page.keyboard.press('Enter');
        await settle(100, 600);
        const sn1a = await sound();
        check('#163 打字機音效:開關打開但未開專注寫作,打字與 Enter 都不響(tick、ding 差 0)',
            sn1a.tick === 0 && sn1a.ding === 0, JSON.stringify({sn1a}));
        // #163:開專注寫作後重新起算,打字與 Enter 響
        await page.keyboard.press('Control+Shift+D');
        await settle(150, 1000);
        Object.assign(soundBase, await page.evaluate(() => ({...window.__perkinsSound})));
        await page.click('.cm-content');
        await page.keyboard.press('Control+Home');
        await page.keyboard.type('abc', {delay: 60});
        await page.keyboard.press('Enter');
        await settle(100, 600);
        const sn1 = await sound();
        check('#116 #163 打字機音效:開關打開且專注寫作開啟,打 abc 響 3 次(tick 差 3),Enter 響 1 次叮(ding 差 1、tick 差 0)',
            sn1.tick === 3 && sn1.ding === 1, JSON.stringify({sn1}));
        // 3) 程式插入(貼上)不響
        await page.evaluate(t => {
            const dt = new DataTransfer();
            dt.setData('text/plain', t);
            document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
        }, '貼上的一段文字');
        await settle(80, 500);
        const sn2 = await sound();
        check('#116 打字機音效:貼上(程式插入)不響(tick 差 0)',
            sn2.tick === 3 && sn2.ding === 1, JSON.stringify({sn2}));
        // 4) IME:組字中不響,選字確認送出(compositionend 帶文字)響一次
        //    (CDP 發真實組字事件;無頭環境無真實 IME,實機見 #47)
        await page.click('.cm-content'); // 組字事件需要焦點
        await settle(80, 400);
        const cdp3 = await page.context().newCDPSession(page);
        await cdp3.send('Input.imeSetComposition', {text: 'ㄋㄧˇ', selectionStart: 3, selectionEnd: 3});
        await cdp3.send('Input.imeSetComposition', {text: 'ㄋㄧˇ', selectionStart: 3, selectionEnd: 3});
        await settle(100, 600);
        const sn3 = await sound();
        check('#116 打字機音效:IME 組字中不響(tick 差 0)',
            sn3.tick === 3 && sn3.ding === 1, JSON.stringify({sn3}));
        await cdp3.send('Input.insertText', {text: '你'});
        await settle(100, 600);
        const sn4 = await sound();
        check('#116 打字機音效:IME 選字確認送出後響一次(tick 差 1)',
            sn4.tick === 4 && sn4.ding === 1, JSON.stringify({sn4}));
        // 4b) 搜尋面板(在編輯器 DOM 內,但不是稿件內文)打字不響
        await page.click('.cm-content');
        await page.keyboard.press('Control+f');
        await page.waitForSelector('.perkins-search input[name=search]');
        await page.keyboard.type('abc', {delay: 60});
        await settle(80, 500);
        const sn4b = await sound();
        check('#116 打字機音效:搜尋面板打字不響(tick 差 0)',
            sn4b.tick === 4 && sn4b.ding === 1, JSON.stringify({sn4b}));
        await page.keyboard.press('Escape');
        await settle(80, 500);
        // 5) Perkins Bot 輸入框不響
        if (!(await page.$('[data-testid=chat-window]:visible'))) await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        await page.click('[data-testid=question]');
        await page.keyboard.type('abc', {delay: 60});
        await settle(80, 500);
        const sn5 = await sound();
        check('#116 打字機音效:Perkins Bot 輸入框打字不響(tick 差 0)',
            sn5.tick === 4 && sn5.ding === 1, JSON.stringify({sn5}));
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)'); // 關掉浮窗
        await settle(100, 600);
        // 5b) #163:關閉專注寫作後打字恢復不響
        await page.keyboard.press('Control+Shift+D');
        await settle(150, 1000);
        await page.click('.cm-content');
        await page.keyboard.type('abc', {delay: 60});
        await settle(100, 600);
        const sn5b = await sound();
        check('#163 打字機音效:關閉專注寫作後打字恢復不響(tick 差 0)',
            sn5b.tick === 4 && sn5b.ding === 1, JSON.stringify({sn5b}));
        // 6) 收尾:回設定頁把開關關掉(作者設定回到預設)
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.waitForSelector('[data-testid=typing-sound-row]');
        // 音量存檔失敗:滑桿與數字回到最後存成功的值,錯誤看得到(PR #151 審查)
        const volBefore = await page.inputValue('[data-testid=typing-volume]');
        await page.evaluate(() => {
            const app = window.go.main.App;
            window.__origSetTypingSound = app.SetTypingSound;
            app.SetTypingSound = () => Promise.reject('模擬寫入失敗');
        });
        await page.focus('[data-testid=typing-volume]');
        await page.keyboard.press('ArrowRight'); // onChange 改值,onKeyUp 存檔(被拒)
        await settle(100, 800);
        const volAfter = await page.inputValue('[data-testid=typing-volume]');
        const volErr = await page.$('[data-testid=typing-sound-error]');
        await page.evaluate(() => { window.go.main.App.SetTypingSound = window.__origSetTypingSound; });
        check('#116 打字機音效:音量存檔失敗時滑桿回到原值且顯示錯誤',
            volAfter === volBefore && !!volErr, JSON.stringify({volBefore, volAfter, err: !!volErr}));
        await page.click('[data-testid=typing-sound-switch]');
        await settle(100, 800);
        const sn6 = await sound();
        check('#116 打字機音效:收尾關掉開關後 switch 呈關閉(關開關不觸發音效)',
            !!(await page.$('[data-testid=typing-sound-switch][data-state=unchecked]'))
            && sn6.tick === 4 && sn6.ding === 1, JSON.stringify({sn6}));
        await page.click('[data-testid=close-settings]');
        await settle(150, 1000);

        // 清理:刪掉專用檔並把章節列還原(後面的組會數章節數量)
        await page.locator('[data-testid=chapter-row]:has-text("第一章")').first().click({timeout: 15000});
        await page.waitForFunction(() => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('第一章'), null, {timeout: 15000});
        fs.unlinkSync(P(FILE));
        await refreshTree();
        check('#44 專用檔已清掉(章節列不留痕跡)',
            !fs.existsSync(P(FILE)) && (await page.locator('[data-testid=chapter-row]:has-text("稿紙測試")').count()) === 0);
    },
};
