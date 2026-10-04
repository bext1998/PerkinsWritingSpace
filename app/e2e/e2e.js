// Perkins 第二階段前端 E2E:透過 wails dev 的瀏覽器端 (localhost:34115) 呼叫真實 Go 後端。
//
// 測試專案由 node e2e.js --fixture <資料夾> 建立(拋棄式,測試會修改它)。流程:
//   1. node e2e.js --fixture <專案>
//   2. PERKINS_OPEN=<專案> wails dev            (另一個終端)
//   3. PROJ=<專案> node e2e.js
// 需要本機 LM Studio 與 Perkins 設定中已選好的模型(提案流程);需要 Microsoft Edge。
// 注意:wails dev 使用真實的 %APPDATA%\Perkins\settings.json(書櫃清單會加入測試專案),必要時先備份。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (process.argv[2] === '--fixture') {
    const dir = process.argv[3];
    const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true}); fs.writeFileSync(path.join(dir, rel), s); };
    fs.rmSync(dir, {recursive: true, force: true});
    // 舊版單層 order:驗證升級後順序保留(B1)
    w('perkins.json', JSON.stringify({name: 'E2E測試', order: ['manuscript/第一章.md', 'manuscript/第二章.md', 'manuscript/第三章.md']}, null, 2));
    w('manuscript/第一章.md', '# 第一章\n\n## 森林\n\n艾莉絲走進森林。天很黑。她很害怕。\n\n## 營火\n\n雷恩點起營火。艾麗絲靠近火堆。\n');
    w('manuscript/第二章.md', '# 第二章\n\n天亮了。艾莉絲醒來。\n');
    // 第三章沒有提到任何設定:驗證「建議附加」對空結果不會炸掉(見 docs/PITFALLS.md)
    w('manuscript/第三章.md', '# 第三章\n\n風停了。四下一片寂靜。\n');
    w('canon/艾莉絲.md', '---\ntype: 角色\nname: 艾莉絲\naliases: []\n---\n\n# 艾莉絲\n\n十七歲,怕黑。\n');
    w('canon/雷恩.md', '# 雷恩\n\n隊長。\n');
    w('notes/私人.md', '私人筆記:反派是雷恩的哥哥。\n');
    w('outline/第二卷.md', '第二卷大綱:王都陷落。\n');
    console.log('fixture ready:', dir);
    process.exit(0);
}

const {chromium} = require('playwright-core');
const PROJ = process.env.PROJ;
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, {recursive: true});
const P = rel => path.join(PROJ, ...rel.split('/'));
const read = rel => fs.readFileSync(P(rel), 'utf8');
const hash = rel => crypto.createHash('sha256').update(fs.readFileSync(P(rel))).digest('hex');
const results = [];
const check = (name, ok, detail = '') => { ok = !!ok; results.push({name, ok, detail}); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
// E2E_SKIP_AI=1:跳過所有向模型送出請求的步驟;被跳過的檢查印成「略過」,結尾統計,不算通過
const SKIP_AI = process.env.E2E_SKIP_AI === '1';
let skipped = 0;
const skip = name => { skipped++; results.push({name, ok: null, detail: '略過(E2E_SKIP_AI=1)'}); console.log(`SKIP ${name} (E2E_SKIP_AI=1)`); };

(async () => {
    const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    const shot = n => page.screenshot({path: path.join(SHOTS, n + '.png')});
    const cfgHash = hash('perkins.json');
    const ch1 = 'manuscript/第一章.md';
    try {
        await page.goto('http://localhost:34115');
        await page.waitForSelector('text=E2E測試', {timeout: 30000});
        const rows = await page.$$('[data-testid=chapter-row]');
        check('B1 舊版 order 專案開啟後章節順序保留', rows.length === 3 && (await rows[0].textContent()).includes('第一章'));
        check('B1 只是開啟不改寫 perkins.json', hash('perkins.json') === cfgHash);

        await rows[0].click();
        await page.waitForSelector('.cm-content');
        check('開啟章節顯示內容', (await page.textContent('.cm-content')).includes('艾莉絲走進森林'));
        await page.waitForTimeout(600);
        check('狀態列顯示本章字數', /本章 \d+ 字/.test(await page.textContent('[data-testid=count-chapter]')));
        check('場景出現在側欄', !!(await page.$('aside li:has-text("營火")')));
        await page.waitForSelector('[data-testid=cast]', {timeout: 5000}).catch(() => {});
        const cast = await page.textContent('[data-testid=inspector]');
        check('資訊欄列出本章登場(含無 frontmatter 的舊設定)', cast.includes('艾莉絲') && cast.includes('雷恩'));
        await shot('01-workspace');

        // 回歸:章節裡沒有任何設定實體 + 收合側欄 → 開啟 AI 視窗不能整個白屏。
        // 成因是 SuggestAttachments 回傳 null(Go nil slice)而前端對它 .filter,見 docs/PITFALLS.md。
        const errs0 = errors.length;
        await page.click('[data-testid=chapter-row]:has-text("第三章")');
        await page.waitForSelector('.cm-line:has-text("風停了")');
        await page.click('aside button:has(svg.lucide-panel-left-close)');
        await page.click('[data-testid=chat-fab]');
        await page.waitForTimeout(1000);
        check('收合側欄後在無設定的章節開啟 AI 視窗', await page.isVisible('[data-testid=chat-window]').catch(() => false) && errors.length === errs0,
            errors.slice(errs0).join(' | '));
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await page.click('[data-testid=rail-manuscript]');
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');

        // 右鍵 → 快速指令
        await page.click('.cm-line:has-text("艾莉絲走進森林")');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        const line = await page.$('.cm-line:has-text("艾莉絲走進森林")');
        const box = await line.boundingBox();
        await page.mouse.click(box.x + 40, box.y + box.height / 2, {button: 'right'});
        await page.waitForSelector('.ctxmenu');
        await page.hover('.ctxmenu >> text=快速指令');
        await page.waitForSelector('.ctxmenu >> text=分析這段');
        await shot('02-context-menu');
        await page.click('.ctxmenu >> text=分析這段');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        check('快速指令帶入問題', (await page.inputValue('[data-testid=question]')).includes('分析'));
        check('選取段落成為附加標籤', (await page.textContent('[data-testid=chips]')).includes('選取'));

        // 建議附加(不會自動附加,點了才附加)
        await page.waitForSelector('[data-testid=chips] >> text=艾莉絲', {timeout: 5000}).catch(() => {});
        let pv = '';
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview]');
        pv = await page.textContent('[data-testid=preview]');
        check('建議附加在點選前不進入上下文', !pv.includes('十七歲'));
        await page.keyboard.press('Escape');
        await page.click('[data-testid=chips] >> text=艾莉絲');
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview]');
        pv = await page.textContent('[data-testid=preview]');
        check('點選建議後設定出現在預覽', pv.includes('十七歲'));
        check('B2 未附加的筆記與大綱不在預覽', !pv.includes('雷恩的哥哥') && !pv.includes('王都陷落'));
        await shot('03-preview');
        await page.keyboard.press('Escape');
        await shot('04-chat');

        // 提案 → 部分採用(E2E_SKIP_AI=1 時整段跳過:不向模型送出請求)
        let hasProposal = false;
        if (SKIP_AI) {
            skip('模型回覆完成');
            skip('模型建立提案並顯示卡片');
            skip('A1 提案顯示前稿件未被改動');
            skip('編輯後提示將寫入作者版本');
            skip('B4 接受後寫入作者編輯的版本');
            skip('B4 provenance 記錄 authorEdited');
            skip('編輯器重新載入為磁碟內容');
            skip('接受提案前的自動快照在版本清單');
        } else {
        const before = read(ch1);
        await page.fill('[data-testid=question]', '請使用 propose_patch 工具,把第一章的「天很黑。」改寫得更有畫面感。只改這一句,original 請逐字填「天很黑。」。');
        const t0 = Date.now();
        await page.click('[data-testid=send]');
        // 先等請求開始(出現「停止」),再等它結束(「送出」回來)
        await page.waitForSelector('[data-testid=chat-window] button:has-text("停止")', {timeout: 10000}).catch(() => {});
        await page.waitForSelector('[data-testid=send]', {timeout: 300000});
        const secs = ((Date.now() - t0) / 1000).toFixed(0);
        const chatErr = await page.$('[data-testid=chat-error]') ? await page.textContent('[data-testid=chat-error]') : '';
        hasProposal = !!(await page.$('[data-testid=proposal]'));
        check('模型回覆完成', !chatErr, `${secs}s ${chatErr}`);
        check('模型建立提案並顯示卡片', hasProposal);
        check('A1 提案顯示前稿件未被改動', read(ch1) === before);
        await shot('05-proposal');
        if (hasProposal) {
            await page.fill('[data-testid=proposal-edit]', '夜色濃得化不開。');
            check('編輯後提示將寫入作者版本', (await page.textContent('[data-testid=proposal]')).includes('寫入你的版本'));
            await page.click('[data-testid=accept]');
            await page.waitForTimeout(800);
            const disk = read(ch1);
            check('B4 接受後寫入作者編輯的版本', disk.includes('艾莉絲走進森林。夜色濃得化不開。她很害怕。'), JSON.stringify(disk.slice(0, 80)));
            const prov = fs.readFileSync(path.join(PROJ, '.perkins', 'provenance.jsonl'), 'utf8');
            check('B4 provenance 記錄 authorEdited', prov.includes('"authorEdited":true'));
            check('編輯器重新載入為磁碟內容', (await page.textContent('.cm-content')).includes('夜色濃得化不開'));
        }
        }
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // 版本
        await page.click('[data-testid=open-versions]');
        await page.waitForSelector('text=建立快照');
        if (hasProposal) check('接受提案前的自動快照在版本清單', !!(await page.$('li:has-text("接受提案前")')));
        await shot('06-versions');
        await page.keyboard.press('Escape');

        // 設定集:補別名 → 索引更新
        await page.click('[data-testid=rail-bible]');
        await page.waitForSelector('[data-testid=entity-row]');
        check('設定集面板列出實體', (await page.$$('[data-testid=entity-row]')).length === 2);
        await page.click('[data-testid=entity-row]:has-text("雷恩")');
        await page.waitForSelector('[data-testid=entity-aliases]');
        await page.fill('[data-testid=entity-aliases]', '隊長、雷');
        await page.click('[data-testid=entity-apply]');
        await page.waitForSelector('.cm-content:has-text("aliases")', {timeout: 5000}).catch(() => {});
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(800);
        const ren = read('canon/雷恩.md');
        check('設定欄位寫入 frontmatter 且保留本文', ren.includes('aliases:') && ren.includes('隊長') && ren.includes('# 雷恩') && ren.includes('隊長。'), JSON.stringify(ren));
        const ap = await page.$('[data-testid=appearances]') ? await page.textContent('[data-testid=appearances]') : '';
        check('設定的登場索引列出章節', ap.includes('第一章'));
        await shot('07-bible');

        // 寫法檢查
        await page.click('[data-testid=rail-checks]');
        await page.click('[data-testid=run-variants]');
        await page.waitForSelector('[data-testid=variant]', {timeout: 5000}).catch(() => {});
        const vs = await page.$$eval('[data-testid=variant]', els => els.map(e => e.textContent));
        check('B3 寫法檢查抓到「艾麗絲」', vs.some(t => t.includes('艾麗絲') && t.includes('艾莉絲')), JSON.stringify(vs));
        await shot('08-checks');

        // 章節摘要 → 前情
        await page.click('[data-testid=rail-manuscript]');
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.click('button:has-text("摘要")');
        await page.waitForSelector('[data-testid=summary-text]');
        await page.fill('[data-testid=summary-text]', '艾莉絲在夜晚的森林裡遇見雷恩,兩人在營火旁休息。');
        await page.click('[data-testid=save-summary]');
        await page.waitForTimeout(500);
        check('B6 摘要儲存到 summaries/', fs.existsSync(P('summaries/第一章.md')) && read('summaries/第一章.md').includes('營火旁休息'));
        await page.click('[data-testid=chapter-row]:has-text("第二章")');
        await page.waitForSelector('.cm-line:has-text("天亮了")');
        await page.click('[data-testid=chat-fab]');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-square-pen)');
        await page.fill('[data-testid=question]', '測試');
        await page.click('[data-testid=chips] >> text=前情摘要');
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview]');
        pv = await page.textContent('[data-testid=preview]');
        check('前情摘要出現在第二章的上下文', pv.includes('營火旁休息') && pv.includes('前情摘要'));
        await page.keyboard.press('Escape');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // 複製到平台(會寫入系統剪貼簿)
        const h2 = hash('manuscript/第二章.md');
        await page.click('[data-testid=copy-platform]');
        await page.click('[role=menuitem]:has-text("角角者")');
        await page.waitForSelector('[data-testid=toast]');
        const toastText = await page.textContent('[data-testid=toast]');
        check('複製到平台顯示結果', toastText.includes('已複製'), toastText);
        check('B8 複製不改動稿件', hash('manuscript/第二章.md') === h2);

        // 新增卷並拖曳章節
        const hashes = [hash(ch1), hash('manuscript/第二章.md')];
        await page.click('button:has-text("新增卷")');
        await page.waitForSelector('text=第2卷');
        await page.dragAndDrop('[data-testid=chapter-row]:has-text("第二章")', 'span:has-text("第2卷")');
        await page.waitForTimeout(800);
        const cfg = JSON.parse(read('perkins.json'));
        check('B1 拖曳章節到新卷只改 perkins.json', cfg.volumes?.[1]?.chapters?.includes('manuscript/第二章.md') && !cfg.order, JSON.stringify(cfg.volumes));
        check('B1 稿件雜湊不變', hash(ch1) === hashes[0] && hash('manuscript/第二章.md') === hashes[1]);
        await shot('09-volumes');

        // 設定頁
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await shot('10-settings-models');
        await page.click('[data-testid=tab-platforms]');
        await page.waitForSelector('[data-testid=platform-preview]');
        await page.waitForTimeout(300);
        const out = await page.textContent('[data-testid=platform-preview]');
        check('平台預覽:兩格縮排、筆記不外流', out.includes('\u3000\u3000清晨的王都很安靜') && !out.includes('伏筆'), JSON.stringify(out));
        await shot('11-settings-platforms');
        await page.click('button:has-text("外觀")');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(300);
        await shot('12-light-theme');
        await page.click('[data-testid=open-settings]');
        await page.click('button:has-text("外觀")');
        await page.click('button:has-text("夜間書房")');
        await page.click('[data-testid=close-settings]');

        // 回書櫃
        await page.click('nav button:has(svg.lucide-house)');
        await page.waitForSelector('text=我的書櫃');
        // 既有檢查的 flaky race(已知問題,原因未明,見 docs/PROGRESS.md):先等列 render 再斷言,不弱化檢查
        await page.waitForSelector('p:has-text("E2E測試")', {timeout: 5000}).catch(() => {});
        check('書櫃顯示最近的作品', !!(await page.$('p:has-text("E2E測試")')));
        await shot('13-bookshelf');
        await page.click('button[title="' + PROJ.replace(/\//g, '\\') + '"], button[title="' + PROJ + '"]');
        await page.waitForSelector('[data-testid=chapter-row]');
        check('從書櫃重新開啟作品', true);

        // ===== 介面打磨第一批(§16 第 1 項,01/02/03/04/07) =====
        // U1(01):每卷底部常駐「新增章節」→ 輸入框 + 建立/取消
        await page.click('[data-testid=add-chapter-0]');
        await page.waitForSelector('[data-testid=chapter-name]');
        await page.fill('[data-testid=chapter-name]', '');
        check('U1 建立鈕在名稱空白時停用', !!(await page.$('[data-testid=chapter-create][disabled]')));
        // 取消:輸入框消失
        await page.click('[data-testid=chapter-cancel]');
        await page.waitForTimeout(200);
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
        // 送出內容預覽:直接送出區不應含第一章的選取
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        const direct = await page.textContent('[data-testid=preview-direct]');
        check('U2 預設不送出舊選取(預覽無第一章選取段)', !direct.includes('艾莉絲走進森林。天很黑。她很害怕。'), direct);
        check('U2 預覽標示選取未附加', direct.includes('未附加'), direct);
        await page.keyboard.press('Escape');
        // 點「仍要附加」→ 預覽改含選取
        await page.click('[data-testid=keep-sel]');
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        const direct2 = await page.textContent('[data-testid=preview-direct]');
        check('U2 明確點仍要附加後才送出', direct2.includes('艾莉絲走進森林。天很黑。她很害怕。'), direct2);
        await page.keyboard.press('Escape');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // U3(03):還原分層 — 主要「還原此檔」需確認,取消不還原,確定後還原
        // 先改稿:在第二章末尾打字(快照前的內容與目前不同,這樣 diff 才有差異、還原鈕可用)
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('還原前的新句');
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(600);
        await page.click('[data-testid=open-versions]');
        await page.waitForSelector('text=建立快照');
        await page.click('button:has-text("建立快照")');
        await page.waitForTimeout(800); // 等快照完成
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
        await page.click('[data-testid=open-versions]');
        await page.waitForSelector('text=建立快照');
        await page.evaluate(() => { (document.querySelector('ul.w-56 li')).click(); }); // 快照在清單中仍是最新(沒有新的)
        await page.waitForSelector('[data-testid=restore-file]');
        check('U3 還原此檔為主要按鈕', !!(await page.$('[data-testid=restore-file] .bg-primary, [data-testid=restore-file][class*=primary]')));
        check('U3 整批還原藏在「更多」下拉', !(await page.$('button:has-text("還原快照內全部檔案")')));
        await page.click('[data-testid=restore-file]');
        await page.waitForSelector('[data-testid=restore-confirm]');
        const confirmTxt = await page.textContent('[data-testid=restore-confirm]');
        check('U3 確認區含快照時間與備份說明', confirmTxt.includes('快照') && confirmTxt.includes('自動備份'), confirmTxt);
        await page.click('[data-testid=restore-confirm-cancel]');
        await page.waitForTimeout(300);
        check('U3 取消後未還原(無確認區)', !(await page.$('[data-testid=restore-confirm]')));
        await page.click('[data-testid=restore-file]');
        await page.click('[data-testid=restore-confirm-go]');
        await page.waitForTimeout(1000);
        check('U3 確定後顯示已還原訊息', (await page.textContent('.max-w-5xl')).includes('已還原'));
        await shot('21-u3-restore');
        await page.keyboard.press('Escape');

        // U4(04):選取後浮動列出現;點「詢問這段」帶入選取開啟 AI 視窗(不送出)
        await page.keyboard.press('Escape'); // 關版本 dialog
        await page.waitForSelector('[data-testid=restore-file]', {state: 'hidden'});
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');
        await page.click('.cm-line:has-text("艾莉絲走進森林")');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await page.waitForSelector('[data-testid=selection-bar]');
        check('U4 選取後浮動列出現', true);
        await shot('22-u4-selection-bar');
        await page.click('[data-testid=selection-ask]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const chip4 = await page.textContent('[data-testid=chips]');
        check('U4 帶入當下選取(標籤選取 N 字,無來源警示)', chip4.includes('選取') && !chip4.includes('來自'), chip4);
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
        const direct5 = await page.textContent('[data-testid=preview-direct]');
        check('U5 直接送出區含目前文件與問題', direct5.includes('目前文件') && direct5.includes('測試問題'), direct5);
        const dlg = await page.textContent('[role=dialog]');
        check('U5 預覽標示端點位置', dlg.includes('本機') || dlg.includes('雲端'), dlg.slice(0, 120));
        check('U5 原始訊息在可展開區', !!(await page.$('[role=dialog] details')));
        await shot('23-u5-preview');
    } catch (e) {
        check('執行中斷', false, e.message);
        await shot('99-error');
    }
    check('頁面沒有 JavaScript 錯誤', errors.length === 0, errors.join(' | '));
    await browser.close();
    const failed = results.filter(r => r.ok === false);
    const passed = results.filter(r => r.ok === true);
    const skippedN = results.filter(r => r.ok === null).length;
    console.log(`
${passed.length}/${passed.length + failed.length} passed,略過 ${skippedN} 項${SKIP_AI ? '(E2E_SKIP_AI=1)' : ''}`);
    process.exit(failed.length ? 1 : 0);
})();
