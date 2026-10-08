// polish — 介面打磨 U1-U8
// (由 e2e.js 拆組;此段為原始流程的連續片段,檢查名稱與斷言未改)
module.exports = {
    name: 'polish',
    desc: '介面打磨 U1-U8',
    run: async ctx => {
        const {page, check, skip, maybe, shot, read, hash, P, PROJ, errors, cfgHash, ch1, SKIP_AI, NOTION_SRC, ensureProject, ensureChapter, ensureBookshelf, settle, SHOTS} = ctx;
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        await ctx.ensureProject('第一章', 'manuscript');
        // ===== 介面打磨第一批(§16 第 1 項,01/02/03/04/07) =====
        // U1(01):每卷底部常駐「新增章節」→ 輸入框 + 建立/取消
        await page.click('[data-testid=add-chapter-0]');
        await page.waitForSelector('[data-testid=chapter-name]');
        await page.fill('[data-testid=chapter-name]', '');
        check('U1 建立鈕在名稱空白時停用', !!(await page.$('[data-testid=chapter-create][disabled]')));
        // 取消:輸入框消失
        await page.click('[data-testid=chapter-cancel]');
        await settle(80, 600); // 等 UI 更新(原固定等 200ms)
        check('U1 取消後輸入框消失', !(await page.$('[data-testid=chapter-name]')));
        await page.click('[data-testid=add-chapter-0]');
        await page.fill('[data-testid=chapter-name]', '打磨測試章');
        await page.click('[data-testid=chapter-create]');
        await page.waitForSelector('.cm-content:has-text("打磨測試章")', {timeout: 10000});
        check('U1 建立後新章出現並開啟', true);
        await shot('20-u1-new-chapter');

        // U2(02):章 A 選取 → 切到章 B → 開 AI 視窗 → 標籤顯示來源 A、預設不附加(以送出內容預覽驗證)
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');
        await page.click('.cm-line:has-text("艾莉絲走進森林")');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End'); // 選取整行
        await page.click('[data-testid=chapter-row]:has-text("第二章")');
        await page.waitForSelector('.cm-line:has-text("天亮了")');
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const staleChip = await page.textContent('[data-testid=chips]');
        check('U2 標籤顯示選取來源為第一章', staleChip.includes('來自〈第一章〉'), staleChip);
        check('U2 警示色標籤', !!(await page.$('[data-testid=chips] .border-warning, [data-testid=chips] [class*=warning]')));
        // 送出內容預覽:從 PreviewContext 回傳的原始 messages(展開的 details)核對【作者選取的段落】
        // (review-1a 第 4 點:不以 preview-direct 摘要為準,以實際送出內容為準)
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        await page.evaluate(() => { const d = document.querySelector('[role=dialog] details'); if (d) d.open = true; });
        const msgs2 = await page.$$eval('[role=dialog] details pre', els => els.map(e => e.textContent));
        check('U2 預設不送出舊選取(原始 messages 無【作者選取的段落】)', !msgs2.some(t => t.includes('【作者選取的段落】')), `messages=${msgs2.length}`);
        await page.keyboard.press('Escape');
        // 點「仍要附加」→ 預覽的原始 messages 有精確全文
        await page.click('[data-testid=keep-sel]');
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        await page.evaluate(() => { const d = document.querySelector('[role=dialog] details'); if (d) d.open = true; });
        const msgs3 = await page.$$eval('[role=dialog] details pre', els => els.map(e => e.textContent));
        check('U2 明確點仍要附加後才送出(原始 messages 有精確全文)',
            msgs3.some(t => t.includes('【作者選取的段落】') && t.includes('艾莉絲走進森林。天很黑。她很害怕。')), `messages=${msgs3.length}`);
        await page.keyboard.press('Escape');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // U3(03):還原分層 — 主要「還原此檔」需確認,取消不還原,確定後還原
        // (review-round4 E5:首點前保存基準;首點/取消後精確比較;確定後精確等於快照;備份讀回核對)
        const hashCH1U3 = hash('manuscript/第一章.md'); // 單檔還原時其他檔案未變
        const snapDir = () => {
            const base = P('.perkins/snapshots');
            const ids = fs.readdirSync(base).filter(d => fs.existsSync(path.join(base, d, 'meta.json'))).sort();
            return ids[ids.length - 1];
        };
        // 先改稿:在第二章末尾打字(快照前的內容與目前不同,這樣 diff 才有差異、還原鈕可用)
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('還原前的新句');
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(600);
        // 建快照前的完整基準:磁碟/編輯器 + 章節檔清單
        const ch2Path = 'manuscript/第二章.md';
        const diskBeforeSnap = read(ch2Path);
        await page.click('[data-testid=open-versions]');
        await page.waitForSelector('text=建立快照');
        await page.click('button:has-text("建立快照")');
        await page.waitForTimeout(800); // 等快照完成
        const snapID = snapDir();
        const snapCh2 = fs.readFileSync(P('.perkins/snapshots/' + snapID + '/files/' + ch2Path), 'utf8');
        check('U3 快照內容等於建立當下的磁碟', snapCh2 === diskBeforeSnap, JSON.stringify(snapCh2.slice(-40)));
        // 選最新快照(清單第一項);dialog 內 flex 佈局,pre 可能攔截 — 用 evaluate 直擊
        await page.evaluate(() => { (document.querySelector('ul.w-56 li')).click(); });
        await page.waitForSelector('[data-testid=restore-file]');
        // 再改稿:關 dialog → 刪掉剛打的字(讓目前與快照有差異)→ 重開 dialog
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=restore-file]', {state: 'hidden'});
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(600);
        // 首點前的完整基準(磁碟+編輯器);編輯器以每行 .cm-line 用 LF 連接(textContent 無換行)
        const diskBeforeFirst = read(ch2Path);
        const LF = String.fromCharCode(10);
        const editorText = () => page.$$eval('.cm-content .cm-line', els => els.map(e => e.textContent).join(String.fromCharCode(10)));
        const editorBeforeFirst = await editorText();
        await page.click('[data-testid=open-versions]');
        await page.waitForSelector('text=建立快照');
        await page.evaluate(() => { (document.querySelector('ul.w-56 li')).click(); }); // 快照在清單中仍是最新(沒有新的)
        await page.waitForSelector('[data-testid=restore-file]');
        check('U3 還原此檔為主要按鈕', !!(await page.$('[data-testid=restore-file] .bg-primary, [data-testid=restore-file][class*=primary]')));
        check('U3 整批還原藏在「更多」下拉', !(await page.$('button:has-text("還原快照內全部檔案")')));
        // 首點(只開確認區,不得改動)
        await page.click('[data-testid=restore-file]');
        await page.waitForSelector('[data-testid=restore-confirm]');
        const confirmTxt = await page.textContent('[data-testid=restore-confirm]');
        check('U3 確認區含快照時間與備份說明', confirmTxt.includes('快照') && confirmTxt.includes('自動備份'), confirmTxt);
        check('U3 首點後磁碟未變', read(ch2Path) === diskBeforeFirst);
        check('U3 首點後編輯器未變', (await editorText()) === editorBeforeFirst);
        // 取消:磁碟與編輯器都精確未變
        await page.click('[data-testid=restore-confirm-cancel]');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        check('U3 取消後未還原(無確認區)', !(await page.$('[data-testid=restore-confirm]')));
        check('U3 取消後磁碟未變', read(ch2Path) === diskBeforeFirst);
        check('U3 取消後編輯器未變', (await editorText()) === editorBeforeFirst);
        // 確定還原:內容精確等於快照
        await page.click('[data-testid=restore-file]');
        await page.click('[data-testid=restore-confirm-go]');
        await page.waitForTimeout(1000);
        check('U3 確定後顯示已還原訊息', (await page.textContent('.max-w-5xl')).includes('已還原'));
        check('U3 還原後磁碟精確等於快照', read(ch2Path) === snapCh2, JSON.stringify(read(ch2Path).slice(-40)));
        check('U3 還原後編輯器精確等於快照', (await editorText()) === snapCh2);
        // 其他檔案未變
        check('U3 單檔還原時其他檔案未變', hash('manuscript/第一章.md') === hashCH1U3);
        // before-restore 備份:清單頂(最新)應為「還原前備份」,讀回核對其第二章內容 = 還原前磁碟
        const newestReason = await page.$$eval('ul.w-56 li', els => els[0].textContent);
        check('U3 before-restore 備份在清單頂', newestReason.includes('還原前備份'), newestReason);
        const bakID = snapDir(); // 還原又建了新快照;最新一筆即還原前備份
        const bakCh2 = fs.readFileSync(P('.perkins/snapshots/' + bakID + '/files/' + ch2Path), 'utf8');
        check('U3 before-restore 備份內容等於還原前磁碟', bakCh2 === diskBeforeFirst, JSON.stringify(bakCh2.slice(-40)));
        await shot('21-u3-restore');
        await page.keyboard.press('Escape');

        // U4(04):選取後浮動列出現;點「詢問這段」帶入選取開啟 AI 視窗(不送出)
        // 用與前次不同的選取(雷恩行),並核對實際帶入的文字(review-1a 第 4 點)
        await page.keyboard.press('Escape'); // 關版本 dialog
        await page.waitForSelector('[data-testid=restore-file]', {state: 'hidden'});
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-line:has-text("雷恩點起營火")');
        await page.click('.cm-line:has-text("雷恩點起營火")');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await page.waitForSelector('[data-testid=selection-bar]');
        check('U4 選取後浮動列出現', true);
        await shot('22-u4-selection-bar');
        await page.click('[data-testid=selection-ask]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const chip4 = await page.textContent('[data-testid=chips]');
        check('U4 帶入當下選取(標籤選取 N 字,無來源警示)', chip4.includes('選取') && !chip4.includes('來自'), chip4);
        // 核對實際送出內容:PreviewContext 的原始 messages 含【作者選取的段落】與本次選取全文
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        await page.evaluate(() => { const d = document.querySelector('[role=dialog] details'); if (d) d.open = true; });
        const msgs4 = await page.$$eval('[role=dialog] details pre', els => els.map(e => e.textContent));
        // 精確擷取【作者選取的段落】區塊本身(review-round4 E4):不能讓目前文件本文的雷恩句冒充選取
        const selBlock4 = msgs4.map(t => {
            const header = '【作者選取的段落】';
            const i = t.indexOf(header);
            if (i === -1) return null;
            let after = t.slice(i + header.length);
            if (after.startsWith('\n')) after = after.slice(1); // 標題後的換行
            const end = after.indexOf('\n\n'); // 區塊以空行結尾(組訊息時加的)
            return (end === -1 ? after : after.slice(0, end)).trim();
        }).find(Boolean);
        check('U4 原始 messages 有【作者選取的段落】且內容精確等於本次選取',
            selBlock4 === '雷恩點起營火。艾麗絲靠近火堆。', `block=${JSON.stringify(selBlock4)}`);
        await page.keyboard.press('Escape');
        check('U4 未送出(無助手回覆)', !(await page.$('[data-testid=assistant-turn]')));
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // U5(07):預覽按鈕可見文字;兩區內容正確
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        await page.fill('[data-testid=question]', '測試問題');
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        check('U5 兩區分列(直接送出+工具可讀範圍)', !!(await page.$('[data-testid=preview-direct]')) && !!(await page.$('[data-testid=preview-tools]')));
        const toolsTxt = await page.textContent('[data-testid=preview-tools]');
        check('U5 工具區標示 manuscript/canon 範圍', toolsTxt.includes('manuscript') && toolsTxt.includes('canon'), toolsTxt);
        // review-1a 第 3 點:工具區須明確說明 canon/outline/notes 只能讀「本次送出」的內容
        check('U5 工具區說明 canon/outline/notes 限本次送出', toolsTxt.includes('outline/') && toolsTxt.includes('notes/') && toolsTxt.includes('只有你本次送出的目前文件或明確點選附加的檔案'), toolsTxt.slice(0, 120));
        const direct5 = await page.textContent('[data-testid=preview-direct]');
        check('U5 直接送出區含目前文件與問題', direct5.includes('目前文件') && direct5.includes('測試問題'), direct5);
        const dlg = await page.textContent('[role=dialog]');
        check('U5 預覽標示端點位置', dlg.includes('本機') || dlg.includes('雲端'), dlg.slice(0, 120));
        check('U5 原始訊息在可展開區', !!(await page.$('[role=dialog] details')));
        // 截圖等動畫結束(建議修)
        await settle(80, 650); // 等 UI 更新(原固定等 250ms)
        await shot('23-u5-preview');
        await page.keyboard.press('Escape');
        await settle(80, 600); // 等 UI 更新(原固定等 200ms)

        // U6(review-1a 第 1 點):移除選取標籤/取消編輯器選取後,lastSel 不得回填
        // 開私人筆記 → 選取 → 開 AI → 移除「目前文件」與「選取」標籤 → 取消編輯器選取 → 縮小再重開 → 以 PreviewContext messages 斷言不含該段
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await page.click('[data-testid=rail-notes], aside li:has-text("私人")').catch(() => {}); // 軟等待保留:探針(rail-notes 可能不存在,舊版側欄結構)
        // 筆記在側欄 docs/notes 分頁;開大綱與筆記
        if (!(await page.$('aside li:has-text("私人")'))) {
            await page.click('[data-testid=rail-docs]');
            await page.waitForSelector('aside li:has-text("私人")');
        }
        await page.click('aside li:has-text("私人")');
        await page.waitForSelector('.cm-content:has-text("私人筆記")');
        await page.click('.cm-line:has-text("反派是雷恩的哥哥")');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        // 移除「目前文件」與「選取」兩個標籤
        await page.click('[data-testid=chips] span:has-text("目前:") button:has(svg.lucide-x)');
        await page.click('[data-testid=chips] span:has-text("選取") button:has(svg.lucide-x)');
        // 縮小 AI → 取消編輯器選取(點別行)→ 重開
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await page.click('.cm-line:has-text("私人筆記")'); // 點別行取消選取
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        check('U6 已移除的選取不得復活(無選取標籤)', !(await page.$('[data-testid=chips] span:has-text("選取")')), await page.textContent('[data-testid=chips]'));
        // 以 PreviewContext 的原始 messages 斷言不含該段
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        await page.evaluate(() => { const d = document.querySelector('[role=dialog] details'); if (d) d.open = true; });
        const msgs6 = await page.$$eval('[role=dialog] details pre', els => els.map(e => e.textContent));
        check('U6 原始 messages 不含私人筆記選取段', !msgs6.some(t => t.includes('反派是雷恩的哥哥')), `messages=${msgs6.length}`);
        await page.keyboard.press('Escape');
        await settle(80, 650); // 等 UI 更新(原固定等 250ms)
        await shot('24-u6-no-revive');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // U8(review-round4 E1):取消編輯器選取(未移除標籤、未開 AI)後,lastSel 也不得回填
        // 選取私人筆記(不開 AI)→ 點別行取消選取 → 開 AI → messages 不含該段
        await page.click('.cm-line:has-text("反派是雷恩的哥哥")');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        await page.click('.cm-line:has-text("私人筆記")'); // 點別行取消選取
        await settle(80, 700); // 等 UI 更新(原固定等 300ms)
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        check('U8 取消選取後無回填(無選取標籤)', !(await page.$('[data-testid=chips] span:has-text("選取")')), await page.textContent('[data-testid=chips]'));
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        await page.evaluate(() => { const d = document.querySelector('[role=dialog] details'); if (d) d.open = true; });
        const msgs8 = await page.$$eval('[role=dialog] details pre', els => els.map(e => e.textContent));
        check('U8 原始 messages 不含已取消的私人筆記選取', !msgs8.some(t => t.includes('反派是雷恩的哥哥')), `messages=${msgs8.length}`);
        await page.keyboard.press('Escape');
        await settle(80, 650); // 等 UI 更新(原固定等 250ms)
        await shot('27-u8-deselect-no-revive');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // U7(review-1a 第 2 點):長章名 —「仍要附加」與移除按鈕仍可見可點
        if (!(await page.$('[data-testid=chapter-row]:has-text("第一章")'))) await page.click('[data-testid=rail-manuscript]'); // 側欄沒開才點(toggle)
        await page.waitForSelector('[data-testid=chapter-row]:has-text("第一章")');
        // 建一個長章名(add-chapter-0 點擊後按鈕被輸入框取代,playwright 穩定性檢查會誤判 — 用 evaluate 直擊)
        await page.evaluate(() => document.querySelector('[data-testid=add-chapter-0]').click());
        await page.waitForSelector('[data-testid=chapter-name]');
        await page.fill('[data-testid=chapter-name]', '第十二章森林深處的最後一場大戰');
        await settle(80, 600); // 等 UI 更新(原固定等 200ms)
        check('U7 輸入框已填長章名', (await page.inputValue('[data-testid=chapter-name]')).includes('第十二章'), await page.inputValue('[data-testid=chapter-name]'));
        await page.click('[data-testid=chapter-create]');
        await page.waitForSelector('.cm-content:has-text("第十二章")');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('長章名選取測試句');
        await settle(80, 800); // 等 UI 更新(原固定等 400ms)
        // 選取剛打的字
        for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowLeft');
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        // 現在切到第一章,讓選取來源=長章名章(警示 chip);建立章節時側欄已開且在稿件面板,不必再 toggle
        if (!(await page.$('[data-testid=chapter-row]:has-text("第一章")'))) await page.click('[data-testid=rail-manuscript]');
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');
        const longChip = await page.$('[data-testid=chips] span:has-text("仍要附加") button, [data-testid=chips] button[data-testid=keep-sel]');
        check('U7 長章名下「仍要附加」按鈕存在於 DOM', !!longChip);
        // 可見性與可點擊性:按鈕的 boundingBox 在視窗內且能點擊成功
        const bb = await page.$eval('[data-testid=keep-sel]', el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, visible: r.width > 0 && r.x >= 0}; });
        check('U7 長章名下「仍要附加」可見(有寬度且在容器內)', bb.visible, JSON.stringify(bb));
        // shrinkText 機制:章名文字被截短(truncate),但「仍要附加」文字完整不被截(review-1a 第 2 點)
        const chipGeo = await page.evaluate(() => {
            const chip = [...document.querySelectorAll('[data-testid=chips] span')].find(e => (e.textContent || '').includes('仍要附加'));
            if (!chip) return null;
            const chipR = chip.getBoundingClientRect();
            // shrinkText 下:「仍要附加」在 .shrink-0 區(不收縮),truncate 區只剩來源段
            const btn = [...chip.querySelectorAll('.shrink-0')].find(e => (e.textContent || '').includes('仍要附加'));
            const btnR = btn?.getBoundingClientRect();
            const trunc = chip.querySelector('span.truncate');
            const truncText = trunc?.textContent || '';
            // 截短機制的核心:truncate 區不含「仍要附加」,且來源段(或被 max-width 截短)與操作鈕分離
            const separated = !truncText.includes('仍要附加');
            return {chipW: chipR.width, btnText: btn?.textContent, btnVisible: btnR ? btnR.width > 0 && btnR.x >= 0 : false, truncText: truncText.slice(0, 30), separated};
        });
        check('U7 來源段與「仍要附加」分離且按鈕完整可見(shrinkText)', !!chipGeo && chipGeo.separated && chipGeo.btnVisible && (chipGeo.btnText || '').includes('仍要附加'), JSON.stringify(chipGeo));
        await page.click('[data-testid=keep-sel]');
        check('U7 長章名下可點擊(點後變仍要附加狀態)', !!(await page.$('[data-testid=chips] span:has-text("仍要附加")')));
        await shot('25-u7-long-title');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

    },
};
