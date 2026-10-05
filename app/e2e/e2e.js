// Perkins 第二階段前端 E2E:透過 wails dev 的瀏覽器端 (localhost:34115) 呼叫真實 Go 後端。
//
// 測試專案由 node e2e.js --fixture <資料夾> 建立(拋棄式,測試會修改它)。流程:
//   1. node e2e.js --fixture <專案>
//   2. PERKINS_OPEN=<專案> wails dev            (另一個終端)
//   3. PROJ=<專案> node e2e.js
// 需要本機 LM Studio 與 Perkins 設定中已選好的模型(提案流程);需要 Microsoft Edge。
// 注意:wails dev 使用真實的 %APPDATA%\Perkins\settings.json(書櫃清單會加入測試專案),必要時先備份。
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
// Notion 匯出 fixture:放在測試專案之外的暫存處,同一資料夾三頁,檔名帶 32 位 hex id
// runtime 模式由 PROJ 推出;--fixture 模式由 dir 推出(兩者同層,同一個資料夾)。
// 用 resolve 保證絕對路徑(Windows 後端不吃「\notion-export」這種相對路徑)
let NOTION_SRC = path.resolve(path.dirname(process.env.PROJ || path.join(os.tmpdir(), 'perkins-e2e', 'proj')), 'notion-export');

if (process.argv[2] === '--fixture') {
    const dir = process.argv[3];
    NOTION_SRC = path.resolve(path.dirname(dir), 'notion-export');
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
    // Notion 匯出:同一資料夾(人物)三頁,檔名帶 32 位 hex id;放在測試專案之外的暫存處
    const nid = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    const ndir = path.join(path.dirname(dir), 'notion-export');
    fs.rmSync(ndir, {recursive: true, force: true});
    const wn = (rel, s) => { fs.mkdirSync(path.dirname(path.join(ndir, rel)), {recursive: true}); fs.writeFileSync(path.join(ndir, rel), s); };
    wn('人物 ' + nid + '/艾莉絲 ' + nid + '.md', '# 艾莉絲\n\n年齡: 17\n\n怕黑。\n');
    wn('人物 ' + nid + '/王都 ' + nid + '.md', '# 王都\n\n王國的首都。\n');
    wn('人物 ' + nid + '/草稿 ' + nid + '.md', '# 草稿\n\n還沒想好。\n');
    wn('人物 ' + nid + '/劉洋 ' + nid + '.md', '# 劉洋\n\n王國的將軍。\n');
    console.log('notion fixture ready:', ndir);
    console.log('fixture ready:', dir);
    process.exit(0);
}

const {chromium} = require('playwright-core');
const PROJ = process.env.PROJ;
// NOTION_SRC 已在 --fixture 分支前定義(同層 notion-export/)
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
const maybe = async (name, fn, detail = '') => {
    if (SKIP_AI) { skip(name); return; }
    check(name, await fn(), detail);
};

(async () => {
    const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
    const context = await browser.newContext({viewport: {width: 1440, height: 900}});
    await context.grantPermissions(['clipboard-read', 'clipboard-write']); // E4 複製全文用
    const page = await context.newPage();
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

        // 研究記錄(SPEC §16 第 3 項/§12.8):預設關閉;開啟後 open_file/save 逐筆記錄;關閉後不再新增
        const rlog = () => { try { return fs.readFileSync(P('.perkins/research.jsonl'), 'utf8'); } catch { return ''; } };
        check('R1 預設關閉時檔案不存在', !fs.existsSync(P('.perkins/research.jsonl')));
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.waitForSelector('[data-testid=research-switch]');
        await shot('19-research-settings');
        await page.click('[data-testid=research-switch]');
        await page.waitForTimeout(500);
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(300);
        // 開一章(open_file)→ 打字存檔(save)
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-content');
        check('R1 開啟後有 open_file 記錄', rlog().includes('"open_file"'), rlog().slice(-100));
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('researchLogText');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=toast]');
        await page.waitForTimeout(500);
        check('R1 存檔後有 save 記錄', rlog().includes('"save"'));
        const rlogLines = rlog().trim().split('\n').length;
        // 關掉開關 → 再存檔不再新增
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.click('[data-testid=research-switch]');
        await page.waitForTimeout(500);
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(300);
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('afterOff');
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(800);
        check('R1 關閉後存檔不再新增記錄', rlog().trim().split('\n').length === rlogLines, `before=${rlogLines} after=${rlog().trim().split('\n').length}`);
        check('R1 記錄不含逐字內文', !rlog().includes('researchLogText') && !rlog().includes('afterOff'));

        // R2(review-round3 第 3 點):受控 GetResearch Promise — 等待期間 Switch 停用;
        // 拒絕後仍停用且顯示載入錯誤,不得冒充已關閉。以拋棄式測試專案驗證,不動作者設定。
        // 先在開設定頁前覆寫綁定(綁定在呼叫時才解析 window.go,覆寫對後續呼叫生效)
        await page.evaluate(() => {
            window.__perkinsGetResearchOrig = window.go.main.App.GetResearch;
            window.go.main.App.GetResearch = () => new Promise((resolve, reject) => {
                window.__perkinsGetResearchGate = {resolve, reject};
            });
        });
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.waitForSelector('[data-testid=research-switch]');
        await page.waitForTimeout(300); // 等受控 Promise 掛入(useEffect 的 GetResearch 呼叫)
        const disPending = await page.$eval('[data-testid=research-switch]', el => el.disabled);
        check('R2 GetResearch 等待期間 Switch 停用', disPending === true, `disabled=${disPending}`);
        await page.evaluate(() => window.__perkinsGetResearchGate.reject(new Error('測試載入失敗')));
        await page.waitForSelector('[data-testid=research-load-error]', {timeout: 5000});
        const loadErrTxt = await page.textContent('[data-testid=research-load-error]');
        const disRejected = await page.$eval('[data-testid=research-switch]', el => el.disabled);
        check('R2 拒絕後仍停用且顯示載入錯誤(不冒充關閉)', disRejected === true && loadErrTxt.includes('測試載入失敗'), `disabled=${disRejected} err=${loadErrTxt.slice(0, 60)}`);
        await shot('26-research-load-error');
        // 還原覆寫,重開設定頁確認恢復正常載入
        await page.evaluate(() => { window.go.main.App.GetResearch = window.__perkinsGetResearchOrig; });
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(300);
        // 恢復:把研究記錄關閉狀態留在專案(拋棄式測試專案,不需還原)

        // 存檔按鈕(SPEC §16 第 5 項):開一章、打字、點按鈕存檔
        await page.click('[data-testid=chapter-row]:has-text("第二章")');
        await page.waitForSelector('.cm-content');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('saveBtnTest');
        // 以按鈕進入「儲存」狀態為完成訊號,不用固定等待
        await page.waitForFunction(() => document.querySelector('[data-testid=save-button]')?.textContent?.trim() === '儲存', null, {timeout: 5000});
        const btn = await page.textContent('[data-testid=save-button]');
        check('E3 未儲存時按鈕顯示「儲存」且可按', btn.trim() === '儲存' && !(await page.$('[data-testid=save-button][disabled]')), btn.trim());
        check('E3 點擊前磁碟尚未寫入標記字', !read('manuscript/第二章.md').includes('saveBtnTest'));
        await shot('13-save-button-dirty');
        await page.click('[data-testid=save-button]');
        // 等按鈕明確進入「已儲存」且停用,再驗證磁碟
        await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 10000});
        const diskE3 = read('manuscript/第二章.md');
        check('E3 點按鈕後檔案已寫入新字', diskE3.includes('saveBtnTest'), JSON.stringify(diskE3.slice(-40)));
        const btn2 = await page.textContent('[data-testid=save-button]');
        check('E3 存檔後按鈕變為「已儲存」且停用', btn2.includes('已儲存') && !!(await page.$('[data-testid=save-button][disabled]')), btn2.trim());
        await shot('14-save-button');

        // 情境 5(回歸):序列化存檔迴圈 — 存檔途中輸入並重複觸發,全部文字最終落盤,SaveFile 不並行
        // 需在開發模式(wails dev)下執行,__perkinsSaveDelay/__perkinsSaveStats 只存在於 DEV 建置
        if (await page.evaluate(() => typeof window.__perkinsSaveDelay === 'function' && typeof window.__perkinsSaveStats === 'object')) {
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('delayA');
            await page.waitForFunction(() => document.querySelector('[data-testid=save-button]')?.textContent?.trim() === '儲存', null, {timeout: 5000});
            await page.evaluate(() => window.__perkinsSaveDelay(500));
            await page.click('[data-testid=save-button]');
            await page.waitForSelector('[data-testid=save-button][disabled]:has-text("儲存中…")', {timeout: 5000});
            // 存檔途中輸入 B,並連按 Ctrl+S 兩次以上(重複觸發應等同一個序列化 Promise)
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('delayB');
            await page.keyboard.press('Control+s');
            await page.keyboard.press('Control+s');
            await page.keyboard.press('Control+s');
            // 迴圈會把新版本也存完,等按鈕進入「已儲存」停用
            await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 15000});
            const diskE5a = read('manuscript/第一章.md');
            check('E5 存檔途中輸入並連按 Ctrl+S 後磁碟含全部文字', diskE5a.includes('delayA') && diskE5a.includes('delayB'), JSON.stringify(diskE5a.slice(-50)));
            check('E5 最終按鈕為「已儲存」', true);
            const stats = await page.evaluate(() => ({...window.__perkinsSaveStats}));
            check('E5 SaveFile 最大並行數為 1', stats.maxInFlight === 1, JSON.stringify(stats));
            check('E5 最終狀態列顯示已儲存', (await page.textContent('footer')).includes('已儲存'));
            await page.evaluate(() => window.__perkinsSaveDelay(0)); // 解除延遲

            // 存檔延遲中點另一章:切換前在原章輸入的字最後都在原章檔案,目標章不混入
            await page.keyboard.type('cutLateWord');
            await page.waitForFunction(() => document.querySelector('[data-testid=save-button]')?.textContent?.trim() === '儲存', null, {timeout: 5000});
            const ch2Before = read('manuscript/第二章.md');
            await page.evaluate(() => window.__perkinsSaveDelay(1200));
            await page.click('[data-testid=save-button]');
            await page.waitForSelector('[data-testid=save-button][disabled]:has-text("儲存中…")', {timeout: 5000});
            await page.click('.cm-content'); // 回編輯器,在存檔途中再補一個字
            await page.keyboard.press('Control+End');
            await page.keyboard.type('X');
            await page.click('[data-testid=chapter-row]:has-text("第二章")'); // openFile 等存檔迴圈結束才切換
            await page.waitForSelector('.cm-line:has-text("天亮了")', {timeout: 15000});
            await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 15000});
            const ch1After = read('manuscript/第一章.md');
            check('E5 切章前原章輸入的字都在原章檔案', ch1After.includes('delayA') && ch1After.includes('delayB') && ch1After.includes('cutLateWordX'), JSON.stringify(ch1After.slice(-60)));
            check('E5 目標章未混入原章文字', read('manuscript/第二章.md') === ch2Before);
            check('E5 切章後 SaveFile 最大並行數仍為 1', (await page.evaluate(() => window.__perkinsSaveStats.maxInFlight)) === 1);
            await page.evaluate(() => window.__perkinsSaveDelay(0));
        } else {
            check('E5 開發模式延遲掛鉤存在', false, 'window.__perkinsSaveDelay / __perkinsSaveStats 不存在(需以 wails dev 開發模式執行)');
        }

        // 情境 6(回歸):重開目前章(章節列/場景列)不會把未存的字替換回舊稿
        // 當前在第二章(上一段切過來);開第一章、打字(不存)、再點同一章的章節列與場景列
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('reopenNewText');
        // 點同一章的章節列 → 編輯器內容應保留
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForTimeout(500);
        check('E6 點同章章節列後新字仍在編輯器', (await page.textContent('.cm-content')).includes('reopenNewText'));
        check('E6 點同章章節列未存檔(磁碟無新字)', !read(ch1).includes('reopenNewText'));
        // 展開場景列並點「森林」場景 → 同檔案 openFile,只定位不重讀
        await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('aside li:has-text("森林")');
        const editorBefore = await page.textContent('.cm-content'); // 點場景前存下完整文字
        await page.click('aside li:has-text("森林")');
        await page.waitForTimeout(500);
        check('E6 點場景列後新字仍在編輯器', (await page.textContent('.cm-content')).includes('reopenNewText'));
        check('E6 場景列點擊後編輯器內容逐字不變', (await page.textContent('.cm-content')) === editorBefore);
        check('E6 場景列點擊後仍為未儲存', (await page.textContent('footer')).includes('未儲存'));
        // 存檔後磁碟保有新字
        await page.click('[data-testid=save-button]');
        await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 10000});
        check('E6 存檔後磁碟保有新字', read(ch1).includes('reopenNewText'), JSON.stringify(read(ch1).slice(-40)));

        // 情境 7(回歸):重疊導覽 — 過期導覽不得套用讀檔結果
        if (await page.evaluate(() => typeof window.__perkinsReadDelay === 'function')) {
            // 場景定位後側欄可能仍開著;先確保側欄開啟(章節列可見)
            if (!(await page.$('[data-testid=chapter-row]:has-text("第一章")'))) await page.click('[data-testid=rail-manuscript]');
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")');
            await page.evaluate(() => window.__perkinsReadDelay(400));
            await page.click('[data-testid=chapter-row]:has-text("第二章")');
            await page.waitForTimeout(50);
            await page.click('[data-testid=chapter-row]:has-text("第三章")');
            await page.waitForSelector('.cm-line:has-text("風停了")', {timeout: 10000});
            await page.waitForTimeout(1000); // 讓過期導覽回來
            check('E7 A→B→C 快速切換最後停在 C', (await page.textContent('.cm-content')).includes('風停了'));
            // 第二段:B 進入在途後輸入新字,再點第三章觸發過期導覽,新字不得被舊稿蓋掉
            await page.click('[data-testid=chapter-row]:has-text("第二章")');
            await page.waitForSelector('.cm-line:has-text("天亮了")');
            await page.evaluate(() => window.__perkinsReadDelay(2500));
            // 點第一章(讀 A 在途,2.5s);期間補點第二章的請求已過期;等第一章讀回後打字
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForTimeout(300); // 讓第一章導覽先註冊序號,再點第二章使第一章變過期?不行——
            // 修正做法:點第二章(在途)→ 回第一章(第一章過期第二章變最新)→ 在途的第二章回來不得套用
            await page.click('[data-testid=chapter-row]:has-text("第二章")');
            await page.waitForTimeout(100);
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-line:has-text("艾莉絲走進森林")', {timeout: 10000});
            // 等待期間打字(不存);第二章的在途導覽回來不得覆蓋第一章的內容
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('staleGuard');
            await page.waitForTimeout(3000); // 第二章的在途導覽(2.5s)回來
            check('E7 過期導覽回來後編輯器仍是第一章', (await page.textContent('.cm-content')).includes('艾莉絲走進森林'));
            check('E7 過期導覽未套用,新字仍在', (await page.textContent('.cm-content')).includes('staleGuard'));
            check('E7 仍為未儲存', (await page.textContent('footer')).includes('未儲存'));
            // 存檔後磁碟不丟字
            await page.click('[data-testid=save-button]');
            await page.waitForSelector('[data-testid=save-button]:has-text("已儲存")[disabled]', {timeout: 10000});
            check('E7 存檔後磁碟不丟字', read(ch1).includes('staleGuard'), JSON.stringify(read(ch1).slice(-40)));
            await page.evaluate(() => window.__perkinsReadDelay(0));
        } else {
            check('E7 開發模式讀檔延遲掛鉤存在', false, 'window.__perkinsReadDelay 不存在(需以 wails dev 開發模式執行)');
        }

        // Notion 逐頁分類(SPEC §16 第 2 項):原生檔案對話框無法在無頭模式操作,覆寫 PickNotionExport 綁定
        // (wailsjs 在呼叫當下才讀 window.go,所以可覆寫)
        await page.evaluate(p => { window.go.main.App.PickNotionExport = async () => p; }, NOTION_SRC);
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('[data-testid=tab-project]');
        await page.waitForSelector('[data-testid=settings-page] button:has-text("選擇資料夾")');
        await page.click('button:has-text("選擇資料夾")');
        await page.waitForSelector('text=Notion 資料夾');
        await page.waitForSelector('[data-testid=expand-人物]', {timeout: 5000});
        await page.click('[data-testid=expand-人物]');
        await page.waitForSelector('[data-testid=pages-人物]');
        await shot('17-notion-pages');
        // 三頁分別設:艾莉絲=跟隨資料夾(人物→角色)、王都=地點、草稿=略過
        const setPage = async (name, target) => {
            await page.click(`[data-testid=pages-人物] div:has(span:text-is("${name}")) button`);
            await page.waitForSelector('[role=option]');
            const opts = await page.$$('[role=option]');
            for (const o of opts) {
                const t = (await o.textContent()).trim();
                if (t === target || t.startsWith('跟隨資料夾') && target === '跟隨資料夾') { await o.click(); break; }
            }
            await page.waitForSelector('[role=option]', {state: 'hidden', timeout: 5000}).catch(() => {});
        };
        // 劉洋:先覆寫為「地點」,再選回「跟隨資料夾」(清除覆寫)→ 驗證覆寫清除與計數同步
        await setPage('劉洋', '地點');
        await page.waitForTimeout(300);
        check('N1a 覆寫時頁數同步變化', (await page.textContent('[data-testid=override-count-人物]')).includes('1 頁另行指定'), await page.textContent('[data-testid=override-count-人物]'));
        let importBtn = await page.textContent('button:has-text("匯入 ")');
        check('N1a 覆寫時匯入頁數維持 4(劉洋地點仍非略過)', importBtn.includes('匯入 4 頁'), importBtn.trim());
        await setPage('劉洋', '跟隨資料夾');
        await page.waitForTimeout(300);
        await setPage('王都', '地點');
        await setPage('草稿', '略過');
        await page.waitForTimeout(300);
        await shot('18-notion-perpage');
        // 未覆寫頁(劉洋)的閉合選單應顯示「跟隨資料夾(目前:角色)」,隨群組去處即時更新
        const liuTrigger = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("劉洋")) button');
        check('N1c 閉合選單顯示跟隨資料夾(目前:X)', liuTrigger.includes('跟隨資料夾(目前:角色)'), liuTrigger.trim());
        // 群組改略過:兩個跟隨頁(艾莉絲/劉洋)的閉合顯示變成「跟隨資料夾(目前:略過)」、匯入數變為 1(僅王都);
        // 已覆寫頁保持原值(王都仍地點、草稿仍略過);再切回角色完成匯入與撤銷
        await page.click('[data-testid=pages-人物] div:has(span:text-is("艾莉絲")) button'); // 開啟跟隨頁的 Select 以便選回角色(暫不選)
        await page.keyboard.press('Escape');
        const groupTrigger = await page.$('[data-testid=pages-人物] >> xpath=ancestor::table >> button[data-radix-collection-item]');
        // 資料夾列的 Select(不在 pages- 區塊內):表格第三欄的第一個 SelectTrigger
        await page.click('[data-testid=group-select-人物]');
        await page.waitForSelector('[role=option]', {timeout: 5000});
        const groupOpts = await page.$$('[role=option]');
        for (const o of groupOpts) {
            if ((await o.textContent()).trim() === '略過') { await o.click(); break; }
        }
        await page.waitForSelector('[role=option]', {state: 'hidden', timeout: 5000}).catch(() => {});
        await page.waitForTimeout(300);
        const aliceChip = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("艾莉絲")) button');
        const liuChip = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("劉洋")) button');
        check('C2 跟隨頁閉合顯示變為略過(艾莉絲)', aliceChip.includes('跟隨資料夾(目前:略過)'), aliceChip.trim());
        check('C2 跟隨頁閉合顯示變為略過(劉洋)', liuChip.includes('跟隨資料夾(目前:略過)'), liuChip.trim());
        const wtChip = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("王都")) button');
        const cgChip = await page.textContent('[data-testid=pages-人物] div:has(span:text-is("草稿")) button');
        check('C2 已覆寫頁保持原值(王都=地點)', wtChip.includes('地點'), wtChip.trim());
        check('C2 已覆寫頁保持原值(草稿=略過)', cgChip.includes('略過'), cgChip.trim());
        let importBtnG = await page.textContent('button:has-text("匯入 ")');
        check('C2 群組略過時匯入數變為 1', importBtnG.includes('匯入 1 頁'), importBtnG.trim());
        check('C2 覆寫頁數不變(王都+草稿=2)', (await page.textContent('[data-testid=override-count-人物]')).includes('2 頁另行指定'));
        // 切回角色
        await page.click('[data-testid=group-select-人物]');
        await page.waitForSelector('[role=option]', {timeout: 5000});
        const groupOpts2 = await page.$$('[role=option]');
        for (const o of groupOpts2) {
            if ((await o.textContent()).trim() === '角色') { await o.click(); break; }
        }
        await page.waitForSelector('[role=option]', {state: 'hidden', timeout: 5000}).catch(() => {});
        await page.waitForTimeout(300);
        check('N1 資料夾列顯示覆寫頁數', (await page.textContent('[data-testid=override-count-人物]')).includes('2 頁另行指定'));
        const importBtnText = await page.textContent('button:has-text("匯入 ")');
        check('N1 匯入頁數按逐頁結果計算', importBtnText.includes('匯入 3 頁'), importBtnText.trim());
        const aliceBefore = hash('canon/艾莉絲.md');
        await page.click('button:has-text("匯入 ")');
        await page.waitForSelector('text=已匯入 2 個檔案', {timeout: 30000});
        check('N1 匯入報告 2 個檔案、略過 1 個', (await page.textContent('[data-testid=settings-page]')).includes('略過 1 個'));
        check('N1 王都 frontmatter 為地點', read('canon/王都.md').includes('type: 地點'), JSON.stringify(read('canon/王都.md').slice(0, 40)));
        check('N1 草稿頁略過未匯入', !fs.existsSync(P('canon/草稿.md')));
        check('N1 B9 同名頁未覆蓋既有艾莉絲', hash('canon/艾莉絲.md') === aliceBefore);
        // 劉洋(未覆寫,跟隨資料夾=角色):應在 canon/、frontmatter 為角色
        check('N1b 跟隨資料夾的劉洋匯入為角色', fs.existsSync(P('canon/劉洋.md')) && read('canon/劉洋.md').includes('type: 角色'), JSON.stringify(read('canon/劉洋.md').slice(0, 40)));
        // 撤銷 → 檔案消失
        await page.click('button:has-text("撤銷這次匯入")');
        await page.waitForSelector('text=已撤銷這次匯入', {timeout: 10000});
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(500);
        check('N1 撤銷後王都消失', !fs.existsSync(P('canon/王都.md')));
        check('N1b 撤銷後劉洋消失', !fs.existsSync(P('canon/劉洋.md')));
        // 錯誤防護(SPEC §16 第 0 項):需在開發模式(wails dev)下執行,__perkinsCrash/__perkinsSaveFail 只存在於 DEV 建置
        if (await page.evaluate(() => typeof window.__perkinsCrash === 'function' && typeof window.__perkinsSaveFail === 'function')) {
            // 情境 1:sidebar/inspector/chat 各自崩潰 → 編輯器寬度不變、仍可輸入,該區顯示錯誤與重試
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('boundaryE1');
            await page.waitForTimeout(400);
            const editorWidth = () => page.$eval('.cm-editor', el => el.getBoundingClientRect().width);
            const w0 = await editorWidth();
            for (const [area, marker] of [['sidebar', 'E1sb'], ['inspector', 'E1in'], ['chat', 'E1ch']]) {
                await page.evaluate(a => window.__perkinsCrash(a), area);
                await page.waitForSelector(`[data-testid=area-error-${area}]`, {timeout: 5000});
                const w1 = await editorWidth();
                check(`E1 ${area} 區崩潰後編輯器寬度不變(±3px)`, Math.abs(w1 - w0) < 3, `${w0} → ${w1}`);
                const areaErr = await page.textContent(`[data-testid=area-error-${area}]`);
                check(`E1 ${area} 區顯示錯誤與重試`, areaErr.includes('錯誤') && !!(await page.$(`[data-testid=area-error-${area}] button:has-text("重試")`)));
                await page.click('.cm-content');
                await page.keyboard.press('Control+End');
                await page.keyboard.type(marker);
                await page.waitForTimeout(300);
                check(`E1 ${area} 區崩潰後編輯器仍可輸入`, (await page.textContent('.cm-content')).includes(marker));
                if (area === 'chat') await shot('14-area-error-chat');
                await page.click(`[data-testid=area-error-${area}] button:has-text("重試")`);
                await page.waitForTimeout(300);
                check(`E1 ${area} 區重試後恢復`, !(await page.$(`[data-testid=area-error-${area}]`)));
            }

            // 情境 2:root 崩潰 → 未存的字先緊急存檔,等 data-save-state=saved 再驗證
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type('crashSaveE2');
            await page.waitForTimeout(400);
            await page.evaluate(() => window.__perkinsCrash('root'));
            await page.waitForSelector('[data-testid=root-error]', {timeout: 5000});
            await page.waitForSelector('[data-testid=emergency-save][data-save-state=saved]', {timeout: 10000});
            const saveMsg = await page.textContent('[data-testid=emergency-save]');
            check('E2 root 崩潰顯示錯誤畫面', (await page.textContent('[data-testid=root-error]')).includes('介面發生錯誤'));
            check('E2 顯示「未儲存的內容已存檔」', saveMsg.includes('已存檔'), saveMsg);
            check('E2 已存檔後重新載入可用', !(await page.$('[data-testid=reload-app][disabled]')));
            const diskE2 = read(ch1);
            check('E2 未存的字已寫入檔案', diskE2.includes('boundaryE1') && diskE2.includes('E1sb') && diskE2.includes('E1in') && diskE2.includes('E1ch') && diskE2.includes('crashSaveE2'), JSON.stringify(diskE2.slice(-80)));
            await shot('15-root-error');
            await page.click('[data-testid=reload-app]');
            await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            check('E2 重新載入後稿件保留', (await page.textContent('.cm-content')).includes('crashSaveE2'));

            // 情境 2b(review-merge):在途存檔保持 pending 時 root 崩潰 → saving 狀態下原文仍可取回與複製、重載停用;解除後 saved 且磁碟為最新
            // 此分支需有 __perkinsSaveDelay(合併自 PR #5)
            if (await page.evaluate(() => typeof window.__perkinsSaveDelay === 'function')) {
                await page.click('.cm-content');
                await page.keyboard.press('Control+End');
                await page.keyboard.type('pendingSaveText');
                await page.waitForTimeout(300);
                await page.evaluate(() => window.__perkinsSaveDelay(10000)); // 在途存檔保持 pending
                await page.click('[data-testid=save-button]');
                await page.waitForSelector('[data-testid=save-button][disabled]:has-text("儲存中…")');
                await page.evaluate(() => window.__perkinsCrash('root'));
                await page.waitForSelector('[data-testid=emergency-save][data-save-state=saving]', {timeout: 10000});
                const beforePending = read(ch1); // 存檔前磁碟(不含 pendingSaveText)
                check('E2b saving 狀態顯示 rescue textarea 且內容等於最新原文',
                    (await page.inputValue('[data-testid=rescue-text]')) === beforePending + 'pendingSaveText', `len=${(await page.inputValue('[data-testid=rescue-text]')).length}`);
                check('E2b saving 狀態重載停用', !!(await page.$('[data-testid=reload-app][disabled]')));
                // 可複製:點「複製全文」→ 已複製
                await page.click('[data-copy-main]');
                await page.waitForSelector('text=已複製', {timeout: 5000});
                check('E2b saving 狀態可複製原文', true);
                // 解除 → saved 且磁碟為最新文字(沒有較舊寫入再覆蓋)
                await page.evaluate(() => window.__perkinsSaveDelay(0));
                await page.waitForSelector('[data-testid=emergency-save][data-save-state=saved]', {timeout: 15000});
                check('E2b 解除後進 saved 且磁碟含最新文字', read(ch1).includes('pendingSaveText'), JSON.stringify(read(ch1).slice(-40)));
                await page.click('[data-testid=reload-app]');
                await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
                await page.click('[data-testid=chapter-row]:has-text("第一章")');
                await page.waitForSelector('.cm-content');
                check('E2b 重載後稿件保留最新文字', (await page.textContent('.cm-content')).includes('pendingSaveText'));
            } else {
                check('E2b 在途存檔情境', false, 'window.__perkinsSaveDelay 不存在');
            }

            // 情境 4:緊急存檔失敗 → 救援 textarea 顯示未存原文與目標路徑,重新載入按鈕改為「放棄未存內容」
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            const beforeFail = read(ch1);
            await page.keyboard.type('rescueFailText');
            await page.waitForTimeout(300);
            await page.evaluate(() => window.__perkinsSaveFail());
            await page.evaluate(() => window.__perkinsCrash('root'));
            await page.waitForSelector('[data-testid=emergency-save][data-save-state=failed]', {timeout: 10000});
            const failMsg = await page.textContent('[data-testid=emergency-save]');
            check('E4 存檔失敗顯示目標路徑與原因', failMsg.includes('manuscript/第一章.md') && failMsg.includes('存檔失敗'), failMsg);
            const rescueText = await page.inputValue('[data-testid=rescue-text]');
            check('E4 救援 textarea 內容等於未存原文', rescueText === beforeFail + 'rescueFailText', `len=${rescueText.length}`);
            check('E4 救援 textarea 為唯讀', !!(await page.$('[data-testid=rescue-text][readonly]')));
            await page.click('button:has-text("複製全文")');
            await page.waitForSelector('text=已複製', {timeout: 5000});
            check('E4 複製全文顯示完成', true);
            const clip = await page.evaluate(() => navigator.clipboard.readText());
            // Windows 系統剪貼簿會把換行正規化成 CRLF(實測 9 個 \n → \r\n),比對前先還原
            const clipNorm = clip.replace(/\r\n/g, '\n');
            check('E4 剪貼簿內容等於未存原文', clipNorm === rescueText, `clipLen=${clip.length} rescueLen=${rescueText.length}`);
            const relTxt = await page.textContent('[data-testid=reload-app]');
            check('E4 存檔失敗時放棄按鈕為次要樣式', relTxt.includes('放棄未存內容'), relTxt);
            check('E4 複製全文為主要按鈕(default)', await page.$eval('button:has-text("複製全文")', el => el.classList.contains('bg-primary')));
            check('E4 放棄按鈕為次要樣式(ghost+destructive 色)', await page.$eval('[data-testid=reload-app]', el => el.classList.contains('text-destructive') && !el.classList.contains('bg-primary')));
            await shot('16-rescue');

            // 受控剪貼簿:覆寫 writeText 為可控制的 Promise(替身:記錄呼叫次數與捕捉到的文字,不寫真剪貼簿);
            // 釋放時才以原始 writeText 寫入真剪貼簿
            await page.evaluate(() => {
                const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
                window.__clipStubs = {calls: 0, texts: [], gate: null, orig};
                navigator.clipboard.writeText = t => {
                    const s = window.__clipStubs;
                    s.calls++;
                    s.texts.push(t);
                    return new Promise(res => { s.gate = res; });
                };
                window.__clipRelease = () => { const s = window.__clipStubs; const r = s.gate; s.gate = null; if (r) { s.calls--; return s.orig(s.texts[0]).then(r); } };
            });
            // 進入確認段後才複製:確認段的「確定放棄並重新載入」也應停用
            await page.click('[data-testid=reload-app]');
            await page.waitForSelector('[data-testid=confirm-abandon]');
            await page.click('button:has-text("複製全文")');
            await page.waitForTimeout(300);
            check('E4a 複製進行中確認段停用', !!(await page.$('[data-testid=confirm-abandon][disabled]')));
            // 確認段的確認按鈕在複製中停用,handler 也擋;點擊(含繞過 disabled)不得重載
            await page.evaluate(() => document.querySelector('[data-testid=confirm-abandon]').click());
            await page.waitForTimeout(200);
            check('E4a 複製進行中確認按鈕點擊不重載', !!(await page.$('[data-testid=root-error]')));
            check('E4a 複製進行中複製按鈕停用', !!(await page.$('button:has-text("複製全文")[disabled]')));
            // 連按複製:防重入 — 兩層驗證:
            // (1) handler 層:繞過 disabled 的 click 事件仍被 copying() 擋住(無防重入時 writeText 會被呼叫第二次)
            await page.evaluate(() => { document.querySelector('button[data-copy-main]').disabled = false; });
            await page.click('button[data-copy-main]').catch(() => {});
            await page.evaluate(() => { document.querySelector('button[data-copy-main]').disabled = false; });
            await page.evaluate(() => { document.querySelector('button[data-copy-main]').dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true})); });
            await page.waitForTimeout(300);
            const calls = await page.evaluate(() => window.__clipStubs.calls);
            const copyCalls = await page.evaluate(() => window.__perkinsCopyCalls ?? 0);
            check('E4a 複製防重入:handler 層(繞過 disabled 的點擊也被擋)', calls === 1, `writeText=${calls} handlerCalls=${copyCalls}`);
            // (2) 方法層:直接呼叫 copyAll 兩次(DEV 鉤),防重入存在時 stub 只收一筆
            const stubCalls2 = await page.evaluate(() => { window.__perkinsBoundary.copyAll(); window.__perkinsBoundary.copyAll(); return window.__clipStubs.calls; });
            check('E4a 複製防重入:直接呼叫 copyAll 兩次,writeText 仍只一筆', stubCalls2 === 1, `calls=${stubCalls2}`);
            // 等待未解除時放棄按鈕(兩段)皆不可用
            check('E4a 等待中第一段放棄不可用', !(await page.$('[data-testid=reload-app]')));
            check('E4a 等待中確認段停用', !!(await page.$('[data-testid=confirm-abandon][disabled]')));
            // 釋放 → 以原始 writeText 寫入真剪貼簿並解開等待
            await page.evaluate(() => window.__clipRelease());
            await page.waitForSelector('text=已複製', {timeout: 5000});
            // 受控內容比對:用替身捕捉到的文字
            const stubText = await page.evaluate(() => window.__clipStubs.texts[0]);
            check('E4a 受控複製內容等於未存原文(替身捕捉)', stubText.replace(/\r\n/g, '\n') === rescueText, `len=${stubText.length}`);
            // 釋放後放棄恢復可用
            await page.click('[data-testid=cancel-abandon]');
            await page.waitForTimeout(200);
            check('E4a 釋放後放棄按鈕恢復可用', !(await page.$('[data-testid=reload-app][disabled]')));
            await page.click('[data-testid=reload-app]');
            await page.waitForSelector('[data-testid=confirm-abandon]');
            await page.click('[data-testid=cancel-abandon]');
            await page.waitForTimeout(200);
            // 回到正常兩段式放棄測試
            await page.click('[data-testid=reload-app]');
            await page.waitForSelector('[data-testid=confirm-abandon]', {timeout: 5000});
            check('E4 第一次點擊放棄只顯示確認,頁面未重載', !!(await page.$('[data-testid=root-error]')) && !!(await page.$('[data-testid=confirm-abandon]')));
            await page.click('[data-testid=cancel-abandon]');
            await page.waitForTimeout(200);
            check('E4 取消後回到救援畫面', !!(await page.$('[data-testid=reload-app]')) && !(await page.$('[data-testid=confirm-abandon]')));
            await page.click('[data-testid=reload-app]');
            await page.click('[data-testid=confirm-abandon]');
            await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            check('E4 放棄重載後檔案與編輯器皆無未存字', !read(ch1).includes('rescueFailText') && !(await page.textContent('.cm-content')).includes('rescueFailText'));
        } else {
            check('E1 開發模式拋錯點存在', false, 'window.__perkinsCrash / __perkinsSaveFail 不存在(需以 wails dev 開發模式執行)');
        }
    } catch (e) {
        check('執行中斷', false, e.message);
        await shot('99-error');
    }
    // 開發模式刻意拋錯(__perkinsCrash)會被 boundary 捕捉,但 React dev 仍會重拋到 window,屬預期,不算錯
    const realErrors = errors.filter(e => !e.includes('開發模式刻意拋錯'));
    check('頁面沒有 JavaScript 錯誤', realErrors.length === 0, realErrors.join(' | '));
    await browser.close();
    const failed = results.filter(r => r.ok === false);
    const passed = results.filter(r => r.ok === true);
    const skippedN = results.filter(r => r.ok === null).length;
    console.log(`\n${passed.length}/${passed.length + failed.length} passed,略過 ${skippedN} 項${SKIP_AI ? '(E2E_SKIP_AI=1)' : ''}`);
    process.exit(failed.length ? 1 : 0);
})();
