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
        await page.click('button:has-text("白紙")');
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
        await page.click('button:has-text("夜間書房")');
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
        // 設定頁導覽欄底部的三個預設檔下拉(選項有穩定的 data-testid,不靠顯示文字)
        const pickPaper = async (testid, value) => {
            await page.click('[data-testid=open-settings]');
            await page.waitForSelector('[data-testid=settings-page]');
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
        await shot('44-paper-layout-settings');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await settle(120, 900);
        await shot('44-paper-layout-light-big');
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('button:has-text("夜間書房")');
        await page.click('[data-testid=close-settings]');
        await settle(120, 800);
        // 還原預設(後面的組與量測不受影響)
        await pickPaper('paper-font-size', '1.08rem');
        await pickPaper('paper-gap', '0.7em');

        // 清理:刪掉專用檔並把章節列還原(後面的組會數章節數量)
        await page.locator('[data-testid=chapter-row]:has-text("第一章")').first().click({timeout: 15000});
        await page.waitForFunction(() => (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('第一章'), null, {timeout: 15000});
        fs.unlinkSync(P(FILE));
        await refreshTree();
        check('#44 專用檔已清掉(章節列不留痕跡)',
            !fs.existsSync(P(FILE)) && (await page.locator('[data-testid=chapter-row]:has-text("稿紙測試")').count()) === 0);
    },
};
