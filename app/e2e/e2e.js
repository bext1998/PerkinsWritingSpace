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
        await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
        await page.waitForFunction(() => document.querySelectorAll('[data-testid=chapter-row]').length === 3, {timeout: 30000});
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
        check('資訊欄列出本章提及的設定(含無 frontmatter 的舊設定)', cast.includes('艾莉絲') && cast.includes('雷恩'));
        await shot('01-workspace');

        // 標題欄(SPEC §17.1):作品畫面看得到三顆視窗鈕,標題含作品名,且不重複放 logo
        check('標題欄 作品畫面存在', await page.isVisible('[data-testid=titlebar]'));
        check('標題欄 三顆視窗鈕存在', !!(await page.$('[data-testid=win-min]')) && !!(await page.$('[data-testid=win-max]')) && !!(await page.$('[data-testid=win-close]')));
        const wsTitle = (await page.textContent('[data-testid=titlebar-title]')).trim();
        check('標題欄 作品畫面標題含作品名', wsTitle.includes('E2E測試') && wsTitle.includes('Perkins WritingSpace'), wsTitle);
        check('標題欄 作品畫面不重複放 logo', !(await page.$('[data-testid=titlebar-logo]')));
        await shot('50-titlebar-workspace-dark');

        // 品牌(SPEC §17):側欄 logo 與 AI 助手名稱
        const logoState = () => page.evaluate(() => {
            const el = document.querySelector('[data-testid=rail-logo]');
            return el ? {tag: el.tagName, naturalWidth: el.naturalWidth, w: el.offsetWidth, h: el.offsetHeight} : null;
        });
        const logoDark = await logoState();
        check('品牌 側欄 logo 是已載入的圖片', !!logoDark && logoDark.tag === 'IMG' && logoDark.naturalWidth > 0, JSON.stringify(logoDark));
        check('品牌 側欄 logo 尺寸 36×36', !!logoDark && logoDark.w === 36 && logoDark.h === 36, JSON.stringify(logoDark));
        const fabTitle = await page.getAttribute('[data-testid=chat-fab]', 'title');
        check('品牌 開啟按鈕標題為 Perkins Bot', fabTitle === 'Perkins Bot', String(fabTitle));
        await shot('40-brand-rail-dark');
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const chatTitleDark = (await page.textContent('[data-testid=chat-title]')).trim();
        check('品牌 AI 視窗標題為 Perkins Bot', chatTitleDark === 'Perkins Bot', chatTitleDark);
        check('品牌 頁面不再出現「AI 助手」', !(await page.textContent('body')).includes('AI 助手'));
        await shot('42-brand-chat-title-dark');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

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
        // 設定頁不應蓋住標題欄
        const tbBox = await page.locator('[data-testid=titlebar]').boundingBox();
        const spBox = await page.locator('[data-testid=settings-page]').boundingBox();
        check('標題欄 設定頁仍可見且未被蓋住', !!tbBox && !!spBox && tbBox.height > 0 && spBox.y >= tbBox.y + tbBox.height - 1,
            JSON.stringify({titlebarBottom: tbBox && tbBox.y + tbBox.height, settingsTop: spBox && spBox.y}));
        // 設定頁蓋住側欄 logo → 標題欄要補上小 logo(不是只看「有沒有開作品」)
        check('標題欄 設定頁蓋住側欄 logo 時標題欄有小 logo', !!(await page.$('[data-testid=titlebar-logo]')));
        await shot('56-titlebar-settings-logo');
        await shot('52-titlebar-settings');
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
        check('標題欄 離開設定頁回到作品畫面後收起小 logo', !(await page.$('[data-testid=titlebar-logo]')));

        // 淺色主題下的標題欄
        check('標題欄 淺色主題仍存在', await page.isVisible('[data-testid=titlebar]'));
        await shot('51-titlebar-workspace-light');

        // 淺色主題下的品牌 logo 與 AI 視窗標題(白色底也要清楚)
        const logoLight = await logoState();
        check('品牌 淺色主題側欄 logo 仍已載入', !!logoLight && logoLight.tag === 'IMG' && logoLight.naturalWidth > 0, JSON.stringify(logoLight));
        await shot('41-brand-rail-light');
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const chatTitleLight = (await page.textContent('[data-testid=chat-title]')).trim();
        check('品牌 淺色主題 AI 視窗標題為 Perkins Bot', chatTitleLight === 'Perkins Bot', chatTitleLight);
        await shot('43-brand-chat-title-light');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await page.click('[data-testid=open-settings]');
        await page.click('button:has-text("外觀")');
        await page.click('button:has-text("夜間書房")');
        await page.click('[data-testid=close-settings]');

        // 回書櫃
        await page.click('nav button:has(svg.lucide-house)');
        await page.waitForSelector('[data-testid=bookshelf-title]');
        // 書櫃沒有側欄 logo → 標題欄左側放小 logo,標題回到應用程式名稱
        // 標題欄在 React 樹之外(模組層狀態),名稱更新落在 App 的 effect 之後,
        // 因此先有限度等它更新再斷言(沒更新照樣 FAIL),不是放寬檢查
        await page.waitForFunction(() =>
            (document.querySelector('[data-testid=titlebar-title]')?.textContent || '').trim() === 'Perkins WritingSpace',
            null, {timeout: 3000}).catch(() => {});
        check('標題欄 書櫃顯示應用程式名稱', (await page.textContent('[data-testid=titlebar-title]')).trim() === 'Perkins WritingSpace');
        check('標題欄 書櫃有小 logo', !!(await page.$('[data-testid=titlebar-logo]')));
        // 既有檢查的 flaky race(已知問題,原因未明,見 docs/PROGRESS.md):先等列 render 再斷言,不弱化檢查
        await page.waitForSelector('p:has-text("E2E測試")', {timeout: 5000}).catch(() => {});
        check('書櫃顯示最近的作品', !!(await page.$('p:has-text("E2E測試")')));
        await page.waitForTimeout(400); // 等移除鈕/書封動畫收尾再拍
        await shot('13-bookshelf');
        await shot('53-titlebar-bookshelf');
        // 1B 視覺驗收(設計審查 16/17):書櫃首頁(深色)
        await shot('31-1b-bookshelf-dark');

        // H4(review-1b2):render 真實元件的長書名驗證 — 此時已在書櫃(13 之後);覆寫 ListRecent
        // 回傳兩筆受控資料(無空白與含空白的長英文名;路徑指向不存在的暫存位置,不開啟、
        // 不動作者的最近清單),reload 讓真實 Bookshelf/GeneratedCover 以受控資料 render
        await page.evaluate(projPath => {
            window.__perkinsListRecentOrig = window.go.main.App.ListRecent;
            window.go.main.App.ListRecent = () => Promise.resolve([
                {path: projPath, name: 'E2E測試', cover: '', missing: false}, // 真實作品:置入受控清單供 H4 後重開
                {path: 'C:/__perkins_test__/no-space-long-name', name: 'TheLastGallopAndTheForgottenKingdom', cover: '', missing: true},
                {path: 'C:/__perkins_test__/spaced-long-name', name: 'The Last Gallop and the Forgotten Kingdom', cover: '', missing: true},
            ]);
        }, PROJ);
        // 此時已在書櫃(13 之後);先開任意真實作品進編輯器,再回書櫃讓 Bookshelf 重新
        // mount,以覆寫後的 ListRecent render 受控卡片
        await page.click('button[title="' + PROJ.replace(/\//g, '\\') + '"], button[title="' + PROJ + '"]');
        await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
        await page.click('nav button:has(svg.lucide-house)');
        await page.waitForSelector('[data-testid=bookshelf-title]', {timeout: 20000});
        // 兩張受控測試卡片必須 render;找不到就 FAIL(不退回短名、不跳過)
        await page.waitForSelector('.group.relative button.h-\\[176px\\]', {timeout: 10000});
        const h4All = await page.evaluate(() => {
            const cards = [...document.querySelectorAll('.group.relative')];
            const out = {};
            for (const name of ['TheLastGallopAndTheForgottenKingdom', 'The Last Gallop and the Forgotten Kingdom']) {
                const card = cards.find(c => (c.querySelector('p')?.textContent || '') === name);
                if (!card) { out[name] = null; continue; }
                const btn = card.querySelector('button');
                const span = btn?.querySelector('span.line-clamp-2');
                const tag = card.querySelector('p');
                const spanR = span?.getBoundingClientRect();
                const btnR = btn?.getBoundingClientRect();
                const tagR = tag?.getBoundingClientRect();
                out[name] = {
                    spanLeft: span && btnR ? spanR.left - btnR.left : null,
                    spanH: spanR ? spanR.height : null,
                    spanTwoLines: spanR ? spanR.height > 20 && spanR.height <= 2 * 17.55 + 2 : null, // 斷行兩行內(line-clamp-2 上限)
                    tagNoOverflow: tag ? tag.scrollWidth <= tag.clientWidth + 1 : null,
                    tagH: tagR ? tagR.height : null,
                };
            }
            return out;
        });
        const noSpace = 'TheLastGallopAndTheForgottenKingdom';
        const spaced = 'The Last Gallop and the Forgotten Kingdom';
        check('H4 兩張長名測試卡片都已 render', !!h4All[noSpace] && !!h4All[spaced], JSON.stringify(Object.keys(h4All)));
        // 封面:文字與書脊線留間距(≥20px)、長名斷行成兩行(高>一行且 ≤ 兩行上限)
        check('H4 無空白長名:封面斷行兩行、與書脊線留間距',
            !!h4All[noSpace] && h4All[noSpace].spanLeft >= 20 && h4All[noSpace].spanTwoLines, JSON.stringify(h4All[noSpace]));
        check('H4 含空白長名:封面斷行兩行、與書脊線留間距',
            !!h4All[spaced] && h4All[spaced].spanLeft >= 20 && h4All[spaced].spanTwoLines, JSON.stringify(h4All[spaced]));
        // 下方書名標籤:兩行內(高≤兩行)且不水平溢出
        check('H4 無空白長名:標籤兩行內且不溢出',
            !!h4All[noSpace] && h4All[noSpace].tagNoOverflow && h4All[noSpace].tagH <= 2 * 18 * 1.3, JSON.stringify(h4All[noSpace]));
        check('H4 含空白長名:標籤兩行內且不溢出',
            !!h4All[spaced] && h4All[spaced].tagNoOverflow && h4All[spaced].tagH <= 2 * 18 * 1.3, JSON.stringify(h4All[spaced]));
        // 補拍:兩張長名卡特寫(第一張無空白)
        const testCards = await page.$$('.group.relative');
        if (testCards[0]) {
            const cb = await testCards[0].boundingBox();
            await page.screenshot({path: path.join(SHOTS, '32-1b-cover-zoom.png'), clip: {x: Math.max(0, cb.x - 20), y: Math.max(0, cb.y - 20), width: Math.min(300, cb.width + 40 + 140), height: cb.height + 70}});
        }
        await shot('38-1b-longname-covers');
        // 還原覆寫;書櫃仍 render 受控清單(含真實卡)— 點真實卡重開作品進編輯器
        await page.evaluate(() => { window.go.main.App.ListRecent = window.__perkinsListRecentOrig; });
        await page.waitForTimeout(200);
        // 淺色書櫃:切白紙 → 書櫃 → 切回
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('button:has-text("外觀")');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(400);
        await shot('33-1b-bookshelf-light');
        await page.click('[data-testid=open-settings]');
        await page.click('button:has-text("外觀")');
        await page.click('button:has-text("夜間書房")');
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(300);
        // 從書櫃重新開啟作品(受控清單中的真實卡路徑 = 當輪 PROJ)
        await page.click('button[title="' + PROJ.replace(/\//g, '\\') + '"], button[title="' + PROJ + '"]');
        await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
        if (!(await page.$('.cm-content'))) await page.click('[data-testid=chapter-row]:has-text("第一章")');
        check('從書櫃重新開啟作品', !!(await page.$('[data-testid=chapter-row]')));

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
        // 重開目前檔案不會重讀也不記 open_file;先開第二章再回第一章,確保至少一次真正切換
        await page.click('[data-testid=chapter-row]:has-text("第二章")');
        await page.waitForSelector('.cm-content:has-text("天亮了")');
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-content:has-text("森林")');
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
        await page.waitForTimeout(300);
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
        await page.waitForTimeout(250);
        await shot('23-u5-preview');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // U6(review-1a 第 1 點):移除選取標籤/取消編輯器選取後,lastSel 不得回填
        // 開私人筆記 → 選取 → 開 AI → 移除「目前文件」與「選取」標籤 → 取消編輯器選取 → 縮小再重開 → 以 PreviewContext messages 斷言不含該段
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await page.click('[data-testid=rail-notes], aside li:has-text("私人")').catch(() => {});
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
        await page.waitForTimeout(400);
        check('U6 已移除的選取不得復活(無選取標籤)', !(await page.$('[data-testid=chips] span:has-text("選取")')), await page.textContent('[data-testid=chips]'));
        // 以 PreviewContext 的原始 messages 斷言不含該段
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        await page.evaluate(() => { const d = document.querySelector('[role=dialog] details'); if (d) d.open = true; });
        const msgs6 = await page.$$eval('[role=dialog] details pre', els => els.map(e => e.textContent));
        check('U6 原始 messages 不含私人筆記選取段', !msgs6.some(t => t.includes('反派是雷恩的哥哥')), `messages=${msgs6.length}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        await shot('24-u6-no-revive');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // U8(review-round4 E1):取消編輯器選取(未移除標籤、未開 AI)後,lastSel 也不得回填
        // 選取私人筆記(不開 AI)→ 點別行取消選取 → 開 AI → messages 不含該段
        await page.click('.cm-line:has-text("反派是雷恩的哥哥")');
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        await page.waitForTimeout(300); // 等 onSelect 更新 lastSel
        await page.click('.cm-line:has-text("私人筆記")'); // 點別行取消選取
        await page.waitForTimeout(300);
        await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        await page.waitForTimeout(400);
        check('U8 取消選取後無回填(無選取標籤)', !(await page.$('[data-testid=chips] span:has-text("選取")')), await page.textContent('[data-testid=chips]'));
        await page.click('[data-testid=preview-btn]');
        await page.waitForSelector('[data-testid=preview-direct]');
        await page.evaluate(() => { const d = document.querySelector('[role=dialog] details'); if (d) d.open = true; });
        const msgs8 = await page.$$eval('[role=dialog] details pre', els => els.map(e => e.textContent));
        check('U8 原始 messages 不含已取消的私人筆記選取', !msgs8.some(t => t.includes('反派是雷恩的哥哥')), `messages=${msgs8.length}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        await shot('27-u8-deselect-no-revive');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');

        // U7(review-1a 第 2 點):長章名 —「仍要附加」與移除按鈕仍可見可點
        if (!(await page.$('[data-testid=chapter-row]:has-text("第一章")'))) await page.click('[data-testid=rail-manuscript]'); // 側欄沒開才點(toggle)
        await page.waitForSelector('[data-testid=chapter-row]:has-text("第一章")');
        // 建一個長章名(add-chapter-0 點擊後按鈕被輸入框取代,playwright 穩定性檢查會誤判 — 用 evaluate 直擊)
        await page.evaluate(() => document.querySelector('[data-testid=add-chapter-0]').click());
        await page.waitForSelector('[data-testid=chapter-name]');
        await page.fill('[data-testid=chapter-name]', '第十二章森林深處的最後一場大戰');
        await page.waitForTimeout(200);
        check('U7 輸入框已填長章名', (await page.inputValue('[data-testid=chapter-name]')).includes('第十二章'), await page.inputValue('[data-testid=chapter-name]'));
        await page.click('[data-testid=chapter-create]');
        await page.waitForSelector('.cm-content:has-text("第十二章")');
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('長章名選取測試句');
        await page.waitForTimeout(400);
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
        await page.waitForTimeout(500); // 等動畫
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
        await page.click('button:has-text("外觀")');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(400);
        await shot('35-1b-workspace-light');
        await page.click('[data-testid=chat-fab]');
        await page.waitForTimeout(500);
        await shot('36-1b-chat-reply-light');
        await page.keyboard.press('Escape');
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
        await shot('37-1b-inspector-light');
        await page.click('[data-testid=open-settings]');
        await page.click('button:has-text("外觀")');
        await page.click('button:has-text("夜間書房")');
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(300);

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

        // ---- 關閉前存檔保護(SPEC §17.1) ----
        // ConfirmQuit 是前端確認後才呼叫的綁定;E2E 用替身記錄呼叫,並在呼叫當下讀磁碟驗證「先存檔、後確認」。
        const quitCalls = () => page.evaluate(() => (window.__quitCalls || []).length);
        const stubConfirmQuit = probe => page.evaluate(p => {
            window.__quitCalls = [];
            window.go.main.App.ConfirmQuit = async () => {
                let disk = null;
                if (p) { try { disk = await window.go.main.App.ReadFile(p); } catch (e) { disk = 'ERR:' + e; } }
                window.__quitCalls.push({disk});
            };
        }, probe || null);
        const triggerClose = () => page.evaluate(() => window.__perkinsCloseRequest());
        const typeInEditor = async text => {
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.keyboard.type(text);
            await page.waitForTimeout(200);
        };
        // 重新載入整個頁面:崩潰段之後回到乾淨的模組狀態(DEV 鉤子與替身都會重設)
        const freshWorkspace = async () => {
            await page.reload();
            await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
            await page.click('[data-testid=chapter-row]:has-text("第一章")');
            await page.waitForSelector('.cm-content');
        };

        // (a) 有未存字:先寫入磁碟,之後才 ConfirmQuit
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-content');
        await typeInEditor('closeGuardMark');
        check('關閉保護 (a) 前置:文字尚未寫入磁碟', !read(ch1).includes('closeGuardMark'));
        await stubConfirmQuit(ch1);
        await triggerClose();
        await page.waitForFunction(() => (window.__quitCalls || []).length >= 1, null, {timeout: 15000}).catch(() => {});
        const quitCall0 = await page.evaluate(() => window.__quitCalls[0]);
        check('關閉保護 (a) ConfirmQuit 呼叫當下文字已在磁碟上',
            typeof quitCall0.disk === 'string' && quitCall0.disk.includes('closeGuardMark'),
            `diskLen=${quitCall0.disk ? quitCall0.disk.length : 'null'}`);
        check('關閉保護 (a) 只呼叫一次 ConfirmQuit', (await quitCalls()) === 1);
        check('關閉保護 (a) 未存文字確實落在磁碟', read(ch1).includes('closeGuardMark'));

        // (a2) 存檔途中繼續打字:新字必須先落盤才 ConfirmQuit
        // 回歸:關閉存檔必須走 Workspace 的序列化存檔迴圈(saveAll),不能只寫一次快照。
        await stubConfirmQuit(ch1);
        await page.evaluate(() => window.__perkinsSaveDelay(1200));
        await typeInEditor('closeTypingBefore');
        await page.click('[data-testid=save-button]'); // 存檔開始(刻意延遲),仍在存檔途中
        await typeInEditor('closeTypingAfter');        // 存檔途中繼續打字
        await triggerClose();
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 20000}).catch(() => {});
        const typingCall = await page.evaluate(() => window.__quitCalls[0] || null);
        check('關閉保護 (a2) 放行當下磁碟已含存檔途中新打的字',
            !!typingCall && typeof typingCall.disk === 'string'
                && typingCall.disk.includes('closeTypingAfter') && typingCall.disk.includes('closeTypingBefore'),
            `disk=${typingCall && typingCall.disk ? [typingCall.disk.includes('closeTypingBefore'), typingCall.disk.includes('closeTypingAfter')] : 'null'}`);
        check('關閉保護 (a2) 磁碟最後確實有新字', read(ch1).includes('closeTypingAfter'));
        check('關閉保護 (a2) 只呼叫一次 ConfirmQuit', (await quitCalls()) === 1);
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (c) 存檔進行中連按三次關閉:只跑一次流程(存檔完成後才 ConfirmQuit 一次)
        await stubConfirmQuit(null);
        await page.evaluate(() => window.__perkinsSaveDelay(1200));
        await typeInEditor('closeGuardConcurrent');
        await page.click('[data-testid=save-button]');
        await page.evaluate(() => { window.__perkinsCloseRequest(); window.__perkinsCloseRequest(); window.__perkinsCloseRequest(); });
        check('關閉保護 (c) 存檔進行中不呼叫 ConfirmQuit', (await quitCalls()) === 0);
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 15000}).catch(() => {});
        check('關閉保護 (c) 存檔完成後只呼叫一次 ConfirmQuit', (await quitCalls()) === 1);
        check('關閉保護 (c) 存檔中的文字已寫入磁碟', read(ch1).includes('closeGuardConcurrent'));
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (a3) 在途存檔失敗不得被吞掉:關閉流程要走序列化存檔迴圈(錯誤才傳得到),
        // 不能自己吞掉在途失敗再補一次寫入就默默放行。
        await stubConfirmQuit(ch1);
        await page.evaluate(() => window.__perkinsSaveDelay(2000)); // 確保關閉時該次存檔仍在途
        await typeInEditor('closeFailInflight');
        await page.evaluate(() => window.__perkinsSaveFailOnce()); // 下一次實際寫入失敗
        await page.click('[data-testid=save-button]');             // 在途存檔(將失敗)
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).catch(() => {});
        const inflightMsg = await page.textContent('[data-testid=quit-failed-msg]').catch(() => '');
        const inflightText = await page.$eval('[data-testid=quit-rescue-text]', el => el.value).catch(() => '');
        check('關閉保護 (a3) 在途存檔失敗時顯示提示,不默默關閉', (await quitCalls()) === 0);
        check('關閉保護 (a3) 提示帶實際寫入失敗原因', inflightMsg.includes('開發模式模擬寫入失敗'), inflightMsg);
        check('關閉保護 (a3) 救援原文含未落盤的文字', inflightText.includes('closeFailInflight'), `len=${inflightText.length}`);
        await page.click('[data-testid=quit-cancel]').catch(() => {});
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000}).catch(() => {});
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (a4) 存檔途中繼續打字 → 存檔失敗:提示與「複製全文」必須是最新文字,
        // 不能用存檔前(關閉流程開頭)取好的救援快照。
        await stubConfirmQuit(ch1);
        await page.evaluate(() => {
            window.__copiedText = null;
            navigator.clipboard.writeText = t => { window.__copiedText = t; return Promise.resolve(); };
        });
        await typeInEditor('rescueLateBefore');
        await page.evaluate(() => window.__perkinsSaveDelay(2500)); // 存檔停住,留打字時間
        await page.evaluate(() => window.__perkinsSaveFailOnce());  // 這輪寫入會失敗
        await triggerClose();
        await typeInEditor('rescueLateAfter'); // 存檔途中繼續打字
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 15000}).catch(() => {});
        const lateText = await page.$eval('[data-testid=quit-rescue-text]', el => el.value).catch(() => '');
        check('關閉保護 (a4) 存檔失敗時提示是最新文字(含存檔途中新打的字)',
            lateText.includes('rescueLateBefore') && lateText.includes('rescueLateAfter'), `len=${lateText.length}`);
        await page.click('[data-testid=quit-copy]', {timeout: 3000}).catch(() => {});
        await page.waitForTimeout(300);
        const lateCopied = await page.evaluate(() => window.__copiedText || '');
        check('關閉保護 (a4) 複製全文也是最新文字',
            lateCopied === lateText && lateCopied.includes('rescueLateAfter'), `len=${lateCopied.length}`);
        check('關閉保護 (a4) 存檔失敗未放行', (await quitCalls()) === 0);
        await page.click('[data-testid=quit-cancel]').catch(() => {});
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000}).catch(() => {});
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (b) 存檔失敗:顯示提示,取消不關、明確選「仍要關閉」才關
        await page.evaluate(() => {
            window.__perkinsSaveFail();
            window.__confirmCalls = 0;
            window.confirm = () => { window.__confirmCalls++; return true; }; // 假設質:實作若用 confirm 就會被算到
        });
        await stubConfirmQuit(null);
        await typeInEditor('closeGuardFail');
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000});
        const quitFailMsg = await page.textContent('[data-testid=quit-failed-msg]');
        check('關閉保護 (b) 提示含目標路徑與失敗原因',
            quitFailMsg.includes(ch1) && quitFailMsg.includes('存檔失敗') && quitFailMsg.includes('開發模式模擬存檔失敗'), quitFailMsg);
        check('關閉保護 (b) 未使用 window.confirm', (await page.evaluate(() => window.__confirmCalls ?? 0)) === 0);
        check('關閉保護 (b) 存檔失敗時未呼叫 ConfirmQuit', (await quitCalls()) === 0);
        // 提示開著時再按關閉:不得再開一份流程
        await triggerClose();
        await page.waitForTimeout(400);
        check('關閉保護 (b) 提示開著時重複關閉不重啟流程', (await quitCalls()) === 0 && (await page.$$('[data-testid=quit-prompt]')).length === 1);
        await shot('55-quit-save-failed');
        // 先取消(不重設任何旗標),再讓存檔失敗一次並直接再按關閉 → 提示必須重現,代表流程已解鎖
        await page.click('[data-testid=quit-cancel]').catch(() => {});
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000}).catch(() => {});
        check('關閉保護 (b) 取消後仍未呼叫 ConfirmQuit', (await quitCalls()) === 0);
        check('關閉保護 (b) 取消後視窗仍在', await page.isVisible('[data-testid=titlebar]'));
        check('關閉保護 (b) 取消後磁碟仍未寫入未存字', !read(ch1).includes('closeGuardFail'));
        await page.evaluate(() => window.__perkinsSaveFail()); // 只重設「模擬失敗」,不動流程旗標
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).catch(() => {});
        check('關閉保護 (b) 取消後直接再關閉,提示會重現且未呼叫 ConfirmQuit',
            (await page.$$('[data-testid=quit-prompt]')).length === 1 && (await quitCalls()) === 0);
        await page.click('[data-testid=quit-force]').catch(() => {});
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 10000}).catch(() => {});
        check('關閉保護 (b) 明確選擇仍要關閉才呼叫 ConfirmQuit 一次', (await quitCalls()) === 1);

        // (d) 根層錯誤畫面下仍能走完關閉流程(監聽在 React 樹之外)
        await stubConfirmQuit(null);
        await page.evaluate(() => window.__perkinsCrash('root'));
        await page.waitForSelector('[data-testid=root-error]', {timeout: 10000});
        check('關閉保護 (d) 錯誤畫面下標題欄仍在', await page.isVisible('[data-testid=titlebar]'));
        await triggerClose();
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 10000}).catch(() => {});
        check('關閉保護 (d) 錯誤畫面下關閉流程仍完成一次', (await quitCalls()) === 1);

        // (e) 根層崩潰且緊急存檔「進行中」:關閉要等存檔結束才放行
        await freshWorkspace();
        await stubConfirmQuit(ch1);
        await typeInEditor('crashSavingText');
        await page.evaluate(() => window.__perkinsSaveDelay(1500));
        await page.click('[data-testid=save-button]'); // 讓在途存檔停住
        await page.evaluate(() => window.__perkinsCrash('root'));
        await page.waitForSelector('[data-testid=root-error]', {timeout: 10000});
        await triggerClose();
        await page.waitForTimeout(400); // 先讓「立即放行」的錯誤實作有機會真的呼叫到(否則計數會偶爾讀到 0)
        check('關閉保護 (e) 緊急存檔進行中不先放行', (await quitCalls()) === 0);
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 20000}).catch(() => {});
        const crashSavingCall = await page.evaluate(() => window.__quitCalls[0] || null);
        check('關閉保護 (e) 存檔結束後放行一次', (await quitCalls()) === 1);
        check('關閉保護 (e) 放行當下磁碟已有最新文字',
            !!crashSavingCall && typeof crashSavingCall.disk === 'string' && crashSavingCall.disk.includes('crashSavingText'),
            `diskLen=${crashSavingCall && crashSavingCall.disk ? crashSavingCall.disk.length : 'null'}`);
        await page.evaluate(() => window.__perkinsSaveDelay(0));

        // (f) 根層崩潰且緊急存檔「失敗」:關閉要拿同一份救援原文出提示,不能直接放棄
        await freshWorkspace();
        await stubConfirmQuit(null);
        await typeInEditor('crashFailText');
        await page.evaluate(() => { window.__perkinsSaveFail(); window.__perkinsCrash('root'); });
        await page.waitForSelector('[data-testid=root-error]', {timeout: 10000});
        await page.waitForSelector('[data-testid=emergency-save][data-save-state=failed]', {timeout: 10000});
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).catch(() => {});
        const crashPromptText = await page.$eval('[data-testid=quit-rescue-text]', el => el.value).catch(() => '');
        check('關閉保護 (f) 崩潰存檔失敗後關閉顯示同一份救援原文', crashPromptText.includes('crashFailText'), `len=${crashPromptText.length}`);
        const crashPromptMsg = await page.textContent('[data-testid=quit-failed-msg]').catch(() => '');
        check('關閉保護 (f) 提示帶崩潰存檔的失敗原因', crashPromptMsg.includes('開發模式模擬存檔失敗'), crashPromptMsg);
        check('關閉保護 (f) 未呼叫 ConfirmQuit', (await quitCalls()) === 0);
        // 取消後不重設任何狀態,直接再按關閉:提示必須重現(不得把最後一次失敗當成已處理)
        await page.click('[data-testid=quit-cancel]').catch(() => {});
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000}).catch(() => {});
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).catch(() => {});
        check('關閉保護 (f) 取消後不重設再關閉,提示仍重現且未呼叫 ConfirmQuit',
            (await page.$$('[data-testid=quit-prompt]')).length === 1 && (await quitCalls()) === 0);
        await page.click('[data-testid=quit-force]').catch(() => {});
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 10000}).catch(() => {});
        check('關閉保護 (f) 明確選擇仍要關閉才呼叫 ConfirmQuit 一次', (await quitCalls()) === 1);

        // (g) Radix 對話框開著時:標題欄關閉鈕與關閉提示的按鈕都要真的點得到
        // Radix modal 會把 body 設成 pointer-events:none,用真實滑鼠點(page.click)才驗得出來。
        await freshWorkspace();
        await typeInEditor('dialogGuardText');
        await page.click('[data-testid=open-versions]');
        await page.waitForSelector('[role=dialog]', {timeout: 10000});
        // 標題欄關閉鈕:用 WailsInvoke 替身攔下 "Q"(證明點擊真的送到按鈕),不真的送給 Go
        await page.evaluate(() => {
            window.__quitInvokes = 0;
            const orig = window.WailsInvoke.bind(window);
            window.WailsInvoke = m => { if (m === 'Q') { window.__quitInvokes++; return; } return orig(m); };
        });
        await page.click('[data-testid=win-close]', {timeout: 3000}).catch(() => {});
        check('標題欄 對話框開著時關閉鈕點得到', (await page.evaluate(() => window.__quitInvokes)) === 1);
        // 剛剛對標題欄的點擊可能被 Radix 當成「點到外面」而關掉對話框;要驗的是「關閉提示出現
        // 之前對話框確實開著」,被關掉就重開。
        if (!(await page.$('[role=dialog]'))) {
            await page.click('[data-testid=open-versions]');
            await page.waitForSelector('[role=dialog]', {timeout: 10000});
        }
        const dialogOpenBefore = !!(await page.$('[role=dialog]'));
        // 複製全文:先換成可計數的剪貼簿替身(真實滑鼠點擊,不以 evaluate 直接呼叫)
        await page.evaluate(() => {
            window.__copyCalls = 0;
            navigator.clipboard.writeText = () => { window.__copyCalls++; return Promise.resolve(); };
        });
        // 明確套用 Radix modal 的「body pointer-events:none」條件:審查者回報的環境會如此,
        // 本機 Radix 版本實測 body 不一定會被設成 none,不能依賴別人的版本行為。
        await page.evaluate(() => { document.body.style.pointerEvents = 'none'; });
        await stubConfirmQuit(null);
        await page.evaluate(() => window.__perkinsSaveFail());
        await triggerClose();
        const promptAppeared = await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).then(() => true).catch(() => false);
        const modalState = await page.evaluate(() => {
            const prompt = document.querySelector('[data-testid=quit-prompt]');
            const bar = document.querySelector('[data-testid=titlebar]');
            return {
                dialog: !!document.querySelector('[role=dialog]'),
                bodyPE: document.body.style.pointerEvents,
                promptPE: prompt ? getComputedStyle(prompt).pointerEvents : 'missing',
                barPE: bar ? getComputedStyle(bar).pointerEvents : 'missing',
            };
        });
        check('關閉提示 對話框開著且 body 不可點時,提示與標題欄拉回 pointer-events:auto',
            dialogOpenBefore && promptAppeared && modalState.dialog && modalState.bodyPE === 'none'
                && modalState.promptPE === 'auto' && modalState.barPE === 'auto',
            JSON.stringify({before: dialogOpenBefore, appeared: promptAppeared, ...modalState}));
        // 焦點必須真的在提示內:提示自己是一個 Radix Dialog,會成為最上層 focus scope
        const focusState = await page.evaluate(() => ({
            inside: !!document.activeElement?.closest?.('[data-testid=quit-prompt-box]'),
            where: document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '',
        }));
        check('關閉提示 開著對話框時焦點在提示內', focusState.inside, JSON.stringify(focusState));
        await page.click('[data-testid=quit-copy]', {timeout: 3000}).catch(() => {});
        await page.waitForTimeout(300);
        check('關閉提示 開著對話框時「複製全文」點得到', (await page.evaluate(() => window.__copyCalls)) === 1);
        await page.click('[data-testid=quit-cancel]', {timeout: 3000}).catch(() => {});
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000}).catch(() => {});
        check('關閉提示 開著對話框時「取消」點得到',
            !(await page.$('[data-testid=quit-prompt]')) && (await quitCalls()) === 0);

        // 鍵盤:Tab 只能在提示內移動(焦點不能被原本的對話框搶回去)
        await page.evaluate(() => window.__perkinsSaveFail());
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).catch(() => {});
        const promptIds = ['quit-rescue-text', 'quit-copy', 'quit-cancel', 'quit-force'];
        const trail = [];
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Tab');
            trail.push(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? ''));
        }
        check('關閉提示 開著對話框時 Tab 只在提示內移動', trail.every(t => promptIds.includes(t)), JSON.stringify(trail));
        let atForce = false;
        for (let i = 0; i < 6 && !atForce; i++) {
            await page.keyboard.press('Tab');
            atForce = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'quit-force');
        }
        check('關閉提示 可用 Tab 移到「仍要關閉」', atForce);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => (window.__quitCalls || []).length === 1, null, {timeout: 10000}).catch(() => {});
        check('關閉提示 開著對話框時 Enter 觸發「仍要關閉」', (await quitCalls()) === 1);

        // 滑鼠路徑也要成立(第一輪的要求):再來一輪用 page.click 點「仍要關閉」
        await page.evaluate(() => window.__perkinsSaveFail());
        await triggerClose();
        await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).catch(() => {});
        await page.click('[data-testid=quit-force]', {timeout: 3000}).catch(() => {});
        await page.waitForFunction(() => (window.__quitCalls || []).length === 2, null, {timeout: 10000}).catch(() => {});
        check('關閉提示 開著對話框時「仍要關閉」滑鼠點得到', (await quitCalls()) === 2);

        // Escape = 取消:提示收起、不關視窗、不呼叫 ConfirmQuit,也不動底下開著的對話框
        await page.evaluate(() => window.__perkinsSaveFail());
        await triggerClose();
        const escAppeared = await page.waitForSelector('[data-testid=quit-prompt]', {timeout: 10000}).then(() => true).catch(() => false);
        const callsBeforeEsc = await quitCalls();
        const escActive = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? '');
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=quit-prompt]', {state: 'detached', timeout: 5000}).catch(() => {});
        const escGone = !(await page.$('[data-testid=quit-prompt]'));
        const escDbg = await page.evaluate(() => ({
            prompts: document.querySelectorAll('[data-testid=quit-prompt]').length,
            hosts: document.querySelectorAll('[data-testid=quit-prompt-host]').length,
        }));
        const escCalls = await quitCalls();
        const escBar = await page.isVisible('[data-testid=titlebar]');
        check('關閉提示 Escape 等於取消(收起、未呼叫 ConfirmQuit、視窗還在)',
            escAppeared && escGone && escCalls === callsBeforeEsc && escBar,
            JSON.stringify({appeared: escAppeared, gone: escGone, before: callsBeforeEsc, after: escCalls, bar: escBar, active: escActive, ...escDbg}));

        // 收尾:關掉可能還開著的版本對話框,確認 body 的 pointer-events 與畫面都回到可操作
        await page.keyboard.press('Escape');
        await page.waitForSelector('[role=dialog]', {state: 'detached', timeout: 5000}).catch(() => {});
        await page.evaluate(() => { document.body.style.pointerEvents = ''; }); // 還原模擬的 Radix 條件
        await page.waitForTimeout(300);
        check('關閉提示 收掉後 body 回復可點', await page.evaluate(() =>
            getComputedStyle(document.body).pointerEvents === 'auto'));

        // (h) 聊天浮窗拖到最上方:停在標題欄底緣,拖曳列完整可見且可操作
        if (!(await page.isVisible('[data-testid=chat-window]'))) await page.click('[data-testid=chat-fab]');
        await page.waitForSelector('[data-testid=chat-window]:visible');
        const dragBar = await page.locator('[data-testid=chat-window] .cursor-move').first().boundingBox();
        await page.mouse.move(dragBar.x + 60, dragBar.y + 16);
        await page.mouse.down();
        await page.mouse.move(dragBar.x + 60, 2, {steps: 8}); // 想拖到比標題欄更高
        await page.mouse.up();
        await page.waitForTimeout(200);
        const chatBox = await page.locator('[data-testid=chat-window]').boundingBox();
        check('聊天浮窗 拖到最上方時停在標題欄底緣', !!chatBox && Math.abs(chatBox.y - 32) < 2, JSON.stringify({y: chatBox && chatBox.y}));
        const dragBarAfter = await page.locator('[data-testid=chat-window] .cursor-move').first().boundingBox();
        check('聊天浮窗 拖曳列完整可見(未被標題欄蓋住)',
            !!dragBarAfter && dragBarAfter.y >= 32 - 1 && dragBarAfter.height >= 40,
            JSON.stringify({y: dragBarAfter && dragBarAfter.y, h: dragBarAfter && dragBarAfter.height}));
        await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)', {timeout: 3000}).catch(() => {});
        await page.waitForTimeout(200);
        check('聊天浮窗 拖曳列按鈕真的可操作', !(await page.isVisible('[data-testid=chat-window]')));
        await shot('57-chat-dragged-top');

        // 最小視窗尺寸(900×600)下標題欄與主要版面仍在(MinWidth/MinHeight 的依據)
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-content');
        await page.setViewportSize({width: 900, height: 600});
        await page.waitForTimeout(400);
        check('標題欄 900×600 下仍在', await page.isVisible('[data-testid=titlebar]'));
        check('標題欄 900×600 下有側欄 logo 與編輯器', !!(await page.$('[data-testid=rail-logo]')) && !!(await page.$('.cm-content')));
        await shot('54-titlebar-min-900x600');

        // ===== 窄寬度編輯區工具列(SPEC §17.1):900×600、側欄+資訊欄都開、長章名 =====
        // 量測重點:工具列「內容右緣」(所有可見後代的最大 right)不得超過資訊欄左緣——
        // 溢出的按鈕即使被 overflow-hidden 視覺裁掉,幾何上仍會超過,檢查才驗得到。
        if (!(await page.$('[data-testid=chapter-row]'))) await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('[data-testid=chapter-row]');
        if (!(await page.$('[data-testid=inspector]'))) await page.click('[data-testid=toggle-inspector]');
        await page.waitForSelector('[data-testid=inspector]');
        await page.click('[data-testid=chapter-row]:has-text("第十二章")');
        await page.waitForSelector('.cm-content');
        await page.waitForFunction(() =>
            (document.querySelector('[data-testid=crumbs]')?.textContent || '').includes('第十二章森林深處'),
            null, {timeout: 10000});
        await page.waitForTimeout(300);
        const measureToolbar = () => page.evaluate(() => {
            const tb = document.querySelector('[data-testid=editor-toolbar]');
            if (!tb) return {missing: 'editor-toolbar'};
            const insp = document.querySelector('[data-testid=inspector]');
            const badge = document.querySelector('[data-testid=status-badge]');
            const crumbs = document.querySelector('[data-testid=crumbs]');
            const crumbSpans = crumbs ? [...crumbs.querySelectorAll('span.truncate')] : [];
            const last = crumbSpans[crumbSpans.length - 1] || null;
            const tbR = tb.getBoundingClientRect();
            const inspR = insp ? insp.getBoundingClientRect() : null;
            let contentRight = -Infinity;
            for (const el of tb.querySelectorAll('*')) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) contentRight = Math.max(contentRight, r.right);
            }
            const btn = sel => {
                const el = tb.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return {w: r.width, right: r.right, aria: el.getAttribute('aria-label'), title: el.getAttribute('title')};
            };
            const lr = last ? last.getBoundingClientRect() : null;
            return {
                tbH: tbR.height, tbRight: tbR.right, contentRight,
                inspLeft: inspR ? inspR.left : null,
                badgeH: badge ? badge.getBoundingClientRect().height : null,
                crumb: last ? {text: last.textContent, w: last.clientWidth, scrollW: last.scrollWidth, h: lr.height} : null,
                text: (tb.innerText || '').replace(/\s+/g, ' '),
                summary: btn('button[aria-label="章節摘要"]'),
                copy: btn('[data-testid=copy-platform]'),
                versions: btn('[data-testid=open-versions]'),
                save: btn('[data-testid=save-button]'),
                toggle: btn('[data-testid=toggle-inspector]'),
            };
        });

        const m900 = await measureToolbar();
        check('工具列 900×600 高度維持 48(不換行)', m900.tbH === 48, `tbH=${m900.tbH}`);
        check('工具列 900×600 內容不溢出到資訊欄',
            !!m900.inspLeft && m900.contentRight <= m900.inspLeft + 1,
            JSON.stringify({contentRight: m900.contentRight, inspLeft: m900.inspLeft, tbRight: m900.tbRight}));
        check('工具列 900×600 狀態徽章單行(未被擠成直排)',
            !!m900.badgeH && m900.badgeH <= 30, `badgeH=${m900.badgeH}`);
        check('工具列 900×600 麵包屑省略號截斷且看得到章名開頭',
            !!m900.crumb && m900.crumb.text.includes('第十二章') && m900.crumb.w >= 40
                && m900.crumb.scrollW > m900.crumb.w && m900.crumb.h <= 22,
            JSON.stringify(m900.crumb));
        check('工具列 900×600 次要按鈕退化隱藏(摘要/複製到平台/版本不顯示)',
            !/摘要|複製到平台|版本/.test(m900.text), m900.text);
        check('工具列 900×600 「儲存」與資訊欄開關仍可見且在工具列內',
            !!m900.save && !!m900.toggle && m900.save.w > 0 && m900.toggle.w > 0
                && m900.save.right <= m900.tbRight + 1 && m900.toggle.right <= m900.tbRight + 1,
            JSON.stringify({save: m900.save, toggle: m900.toggle}));
        await shot('60-toolbar-900x600');

        // 中等寬度(1100×800,主編輯區約 488px):按鈕退化成只剩圖示,文字收起但保留 title/aria-label
        await page.setViewportSize({width: 1100, height: 800});
        await page.waitForTimeout(400);
        const mMid = await measureToolbar();
        check('工具列 中等寬度退化成只剩圖示(文字收起,按鈕保留 aria-label 與 title)',
            !!mMid.summary && mMid.summary.w > 0 && mMid.summary.aria === '章節摘要' && !!mMid.summary.title
                && !!mMid.versions && mMid.versions.aria === '版本' && !!mMid.versions.title
                && !!mMid.copy && mMid.copy.aria === '複製到平台' && !!mMid.copy.title
                && !/摘要|複製到平台|版本/.test(mMid.text),
            JSON.stringify({text: mMid.text, summary: mMid.summary, versions: mMid.versions}));
        check('工具列 中等寬度也不溢出資訊欄',
            !!mMid.inspLeft && mMid.contentRight <= mMid.inspLeft + 1,
            JSON.stringify({contentRight: mMid.contentRight, inspLeft: mMid.inspLeft}));

        // 1280×800(預設視窗):恢復完整文字標籤,一樣不溢出
        await page.setViewportSize({width: 1280, height: 800});
        await page.waitForTimeout(400);
        const m1280 = await measureToolbar();
        check('工具列 1280×800 顯示完整文字標籤',
            /摘要/.test(m1280.text) && /複製到平台/.test(m1280.text) && /版本/.test(m1280.text),
            m1280.text);
        check('工具列 1280×800 也不溢出資訊欄',
            !!m1280.inspLeft && m1280.contentRight <= m1280.inspLeft + 1,
            JSON.stringify({contentRight: m1280.contentRight, inspLeft: m1280.inspLeft}));
        await shot('61-toolbar-1280x800');
        await page.setViewportSize({width: 1440, height: 900});
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
