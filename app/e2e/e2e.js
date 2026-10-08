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
        check('標題欄 作品畫面標題為作品名(不再重複應用程式名稱)', wsTitle === 'E2E測試', wsTitle);
        check('標題欄 作品名只出現在標題欄(側欄標頭改顯示面板名稱)',
            (await page.textContent('[data-testid=sidebar-title]')).trim() === '稿件');
        // L 形外框(SPEC §17.1):作品畫面標題欄與圖示列同色、標題欄不畫底線、logo 欄與圖示列等寬
        const lFrame = await page.evaluate(() => {
            const tb = document.querySelector('[data-testid=titlebar]');
            const rail = document.querySelector('[data-testid=rail]');
            const menu = document.querySelector('[data-testid=app-menu]');
            return {tbBg: getComputedStyle(tb).backgroundColor, railBg: getComputedStyle(rail).backgroundColor,
                tbBorder: getComputedStyle(tb).borderBottomWidth, menuW: menu.getBoundingClientRect().width,
                railW: rail.getBoundingClientRect().width, railLogo: !!document.querySelector('[data-testid=rail-logo]')};
        });
        check('標題欄 作品畫面與圖示列同色、無底線,logo 欄與圖示列等寬',
            lFrame.tbBg === lFrame.railBg && lFrame.tbBorder === '0px' && lFrame.menuW === lFrame.railW, JSON.stringify(lFrame));
        check('品牌 圖示列不再放 logo', !lFrame.railLogo);
        await shot('50-titlebar-workspace-dark');

        // 品牌(SPEC §17):標題欄 logo 是應用程式選單
        const logoState = () => page.evaluate(() => {
            const el = document.querySelector('[data-testid=app-menu] img');
            return el ? {tag: el.tagName, naturalWidth: el.naturalWidth, w: el.offsetWidth, h: el.offsetHeight} : null;
        });
        const logoDark = await logoState();
        check('品牌 標題欄 logo 是已載入的圖片', !!logoDark && logoDark.tag === 'IMG' && logoDark.naturalWidth > 0, JSON.stringify(logoDark));
        check('品牌 標題欄 logo 尺寸 20×20', !!logoDark && logoDark.w === 20 && logoDark.h === 20, JSON.stringify(logoDark));
        // 應用程式選單:作品畫面有儲存、回到書櫃、設定
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        check('應用程式選單 作品畫面有儲存/回到書櫃/設定',
            !!(await page.$('[data-testid=menu-save]')) && !!(await page.$('[data-testid=menu-bookshelf]')) && !!(await page.$('[data-testid=menu-settings]')));
        await page.waitForTimeout(250); // 等開啟動畫結束再拍
        await shot('57-app-menu-workspace');
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=app-menu-content]', {state: 'detached'});
        // 選單「儲存」走與 Ctrl+S 相同的存檔流程:打字變未儲存 → 選單儲存 → 已儲存
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.type('選');
        await page.waitForSelector('[data-testid=statusbar] >> text=未儲存');
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        await page.click('[data-testid=menu-save]');
        await page.waitForSelector('[data-testid=app-menu-content]', {state: 'detached'});
        await page.waitForSelector('[data-testid=statusbar] >> text=已儲存', {timeout: 5000}).catch(() => {});
        check('應用程式選單 儲存會存檔', (await page.textContent('[data-testid=statusbar]')).includes('已儲存'));
        await page.click('.cm-content');
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+s');
        await page.waitForSelector('[data-testid=statusbar] >> text=已儲存', {timeout: 5000}).catch(() => {});
        // 側欄開關在標題欄:收合後再展開,回到原本的面板
        await page.click('[data-testid=rail-bible]');
        await page.waitForSelector('[data-testid=sidebar-title] >> text=設定集');
        await page.click('[data-testid=titlebar-sidebar]');
        await page.waitForTimeout(150);
        const collapsed = !(await page.$('[data-testid=sidebar-title]'));
        await page.click('[data-testid=titlebar-sidebar]');
        await page.waitForSelector('[data-testid=sidebar-title]');
        check('標題欄 側欄開關可收合並展開回原面板', collapsed && (await page.textContent('[data-testid=sidebar-title]')).trim() === '設定集');
        await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('[data-testid=sidebar-title] >> text=稿件');
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
        await page.click('[data-testid=titlebar-sidebar]');
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
            await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000}).catch(() => {});
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
                    await page.waitForTimeout(300);
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
                        await page.waitForTimeout(250);
                        const openAfterEsc = !!(await page.$('[data-testid=category-list]'));
                        await page.mouse.click(20, 400); // 對話框外(側欄)點擊
                        await page.waitForTimeout(250);
                        const openAfterOutside = !!(await page.$('[data-testid=category-list]'));
                        r3 = openBefore && openAfterEsc && openAfterOutside
                            && !!btnMid && btnMid.disabled && btnMid.text.includes('刪除中');
                        cat.del = await page.waitForSelector('[data-testid=del-cat-組織]', {state: 'detached', timeout: 8000})
                            .then(() => true).catch(() => false);
                        await page.evaluate(() => { if (window.__restoreDelete) window.__restoreDelete(); });
                        // 等刪除真正完成(舊版對話框會提前關閉,不能只靠 detached 判斷)
                        for (let i = 0; i < 50; i++) {
                            if (fs.existsSync(P('canon/天網.md')) && read('canon/天網.md').includes('type: 其他')) break;
                            await page.waitForTimeout(200);
                        }
                    }
                }
            }
            await page.keyboard.press('Escape');
            await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000}).catch(() => {});
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
            await page.waitForTimeout(500); // 等 Workspace 重載受影響的開啟中檔案
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
                await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000}).catch(() => {});
                if (added && !!(await page.$('[data-testid=entity-header-type]'))) {
                    await page.click('[data-testid=entity-header-type]');
                    r2 = await catWait('[role=option]:has-text("交通工具")');
                    await page.keyboard.press('Escape').catch(() => {});
                }
            }
            if (!r2) await page.keyboard.press('Escape').catch(() => {});
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
            await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000}).catch(() => {});
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
                        await page.waitForSelector('[data-testid=category-confirm]', {state: 'detached', timeout: 8000}).catch(() => {});
                        const closed = !(await page.$('.cm-content'));
                        const toastTxt = await page.textContent('[data-testid=toast]').catch(() => '');
                        const disk2 = fs.existsSync(P('canon/天網二.md')) ? read('canon/天網二.md') : '';
                        Object.assign(r4dbg, {closed, toast: (toastTxt || '').slice(0, 90), diskHead: disk2.slice(0, 60)});
                        r4 = closed && toastTxt.includes('重新開啟') && disk2.includes('type: 其他') && disk2.includes('天網二');
                    }
                }
                await page.evaluate(() => { if (window.__restoreRead) window.__restoreRead(); });
                await page.keyboard.press('Escape').catch(() => {});
                await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000}).catch(() => {});
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
        await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000}).catch(() => {});
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
        await page.waitForTimeout(150);
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
        await page.waitForSelector('[data-testid=category-list]', {state: 'detached', timeout: 3000}).catch(() => {});
        await page.click('[data-testid=entity-row]:has-text("乙組織")');
        await page.waitForSelector('[data-testid=entity-header-type]');
        await page.click('[data-testid=entity-header-type]');
        await page.waitForFunction(() =>
            [...document.querySelectorAll('[role=option]')].some(o => (o.textContent || '').trim() === '乙分類'),
            null, {timeout: 5000}).catch(() => {});
        const optsB = await page.$$eval('[role=option]', els => els.map(e => (e.textContent || '').trim()));
        r5h = optsB.includes('乙分類') && !optsB.includes('組織') && !optsB.includes('交通工具');
        await page.keyboard.press('Escape').catch(() => {});
        // 回到作品 A 繼續後續測試(還原 ListRecent,從最近清單重開)
        await page.evaluate(() => { window.go.main.App.ListRecent = window.__lrOrig; });
        await page.click('nav button:has(svg.lucide-house)');
        await page.waitForSelector('[data-testid=bookshelf-title]', {timeout: 20000});
        await page.waitForSelector('p:has-text("E2E測試")', {timeout: 5000}).catch(() => {});
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
        // 上一步「摘要已儲存」的通知可能還在畫面上:等到複製結果的通知出現再讀,逾時就讀當下內容讓檢查失敗
        await page.waitForSelector('[data-testid=toast]:has-text("已複製")', {timeout: 5000}).catch(() => {});
        const toastText = (await page.$$eval('[data-testid=toast]', els => els.map(e => e.textContent))).join(' | ');
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
        // 設定頁蓋住作品外框 → 標題欄畫底線、不提供側欄開關與作品項目(不是只看「有沒有開作品」)
        check('標題欄 設定頁時有底線且無側欄開關',
            await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=titlebar]')).borderBottomWidth !== '0px')
            && !(await page.$('[data-testid=titlebar-sidebar]')));
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        check('應用程式選單 設定頁時不提供回到書櫃/儲存/設定',
            !(await page.$('[data-testid=menu-bookshelf]')) && !(await page.$('[data-testid=menu-save]')) && !(await page.$('[data-testid=menu-settings]')));
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=app-menu-content]', {state: 'detached'});
        await shot('56-titlebar-settings-logo');
        await shot('52-titlebar-settings');
        await shot('10-settings-models');
        await page.click('[data-testid=tab-platforms]');
        await page.waitForSelector('[data-testid=platform-preview]');
        await page.waitForTimeout(300);
        const out = await page.textContent('[data-testid=platform-preview]');
        check('平台預覽:兩格縮排、筆記不外流', out.includes('\u3000\u3000清晨的王都很安靜') && !out.includes('伏筆'), JSON.stringify(out));
        await shot('11-settings-platforms');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(300);
        await shot('12-light-theme');
        check('標題欄 離開設定頁回到作品畫面後恢復側欄開關', !!(await page.$('[data-testid=titlebar-sidebar]')));

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
        check('標題欄 書櫃有 logo 選單', !!(await page.$('[data-testid=app-menu] img')));
        await page.click('[data-testid=app-menu]');
        await page.waitForSelector('[data-testid=app-menu-content]');
        check('應用程式選單 書櫃只有設定', !!(await page.$('[data-testid=menu-settings]'))
            && !(await page.$('[data-testid=menu-bookshelf]')) && !(await page.$('[data-testid=menu-save]')));
        await page.click('[data-testid=menu-settings]');
        await page.waitForSelector('[data-testid=settings-page]', {timeout: 3000}).catch(() => {});
        check('應用程式選單 設定項可開啟設定頁', !!(await page.$('[data-testid=settings-page]')));
        await page.click('[data-testid=close-settings]');
        await page.waitForSelector('[data-testid=bookshelf-title]');
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
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(400);
        await shot('33-1b-bookshelf-light');
        await page.click('[data-testid=open-settings]');
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
        // §16 第 8 項:展開的逐頁清單要排在資料夾列下方的整列,不得塞在「匯入為」窄欄裡(長頁名會把其他欄擠成直排)
        {
            const lay = await page.evaluate(() => {
                const box = document.querySelector('[data-testid=pages-人物]').getBoundingClientRect();
                const sel = document.querySelector('[data-testid=group-select-人物]').getBoundingClientRect();
                const table = document.querySelector('[data-testid=pages-人物]').closest('table').getBoundingClientRect();
                return {boxLeft: box.left, boxW: box.width, selLeft: sel.left, tableW: table.width};
            });
            check('Notion 逐頁清單不在「匯入為」欄內', lay.boxLeft < lay.selLeft, JSON.stringify(lay));
            check('Notion 逐頁清單佔整列寬度', lay.boxW >= lay.tableW * 0.8, JSON.stringify(lay));
        }
        // 長資料夾名稱(Notion 匯出常見長英數名稱)要在第一欄內截斷,不得侵入「頁數」欄;設定頁最窄 900×600
        {
            await page.setViewportSize({width: 900, height: 600});
            const lay = await page.evaluate(() => {
                const label = document.querySelector('[data-testid=group-label-人物]');
                const orig = label.textContent;
                label.textContent = 'A'.repeat(120); // 只為量測版面,量完還原
                const right = label.getBoundingClientRect().right;
                const th = [...document.querySelectorAll('th')].find(t => t.textContent.trim() === '頁數').getBoundingClientRect();
                label.textContent = orig;
                return {labelRight: right, pagesLeft: th.left};
            });
            check('Notion 長資料夾名稱不侵入「頁數」欄', lay.labelRight <= lay.pagesLeft, JSON.stringify(lay));
            // 半螢幕(640 寬,SPEC §16 第 7 項):匯入表格不產生水平捲軸
            await page.setViewportSize({width: 640, height: 672});
            check('Notion 640×672 匯入表格無水平溢出', await page.evaluate(() => {
                const c = document.querySelector('[data-testid=settings-content]');
                return !!c && c.scrollWidth <= c.clientWidth + 1;
            }));
            await page.setViewportSize({width: 1440, height: 900});
        }
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

        // ===== 設定頁左側導覽版面(SPEC §17.2):900×600 與 1280×800 三頁 =====
        // 量測:根節點是否滾動(捲軸該在內容區)、內容水平捲軸、元素右緣、研究記錄間距、
        // 內容置中、封面與欄位不重疊;導覽欄與主題切換屬新設計(現況 FAIL 為預期破壞證據)。
        const geoSettings = () => page.evaluate(() => {
            const sp = document.querySelector('[data-testid=settings-page]');
            if (!sp) return null;
            const isScroller = el => { const o = getComputedStyle(el).overflowY; return o === 'auto' || o === 'scroll'; };
            const sc = [sp, ...sp.querySelectorAll('*')].find(isScroller) || sp;
            const scr = sc.getBoundingClientRect();
            const out = {
                rootScrollable: sp.scrollHeight > sp.clientHeight + 1,
                rootScrollH: sp.scrollHeight, rootClientH: sp.clientHeight,
                scrollerIsRoot: sc === sp,
                hScroll: sc.scrollWidth > sc.clientWidth + 1,
                scScrollW: sc.scrollWidth, scClientW: sc.clientWidth,
                hasNav: !!sp.querySelector('[data-testid=settings-nav]'),
                hasContent: !!sp.querySelector('[data-testid=settings-content]'),
                overflowing: [], researchGap: null, centerDiff: null, coverOverlap: null,
            };
            const scope = sp.querySelector('[data-testid=settings-content]') || sp;
            out.overflowing = [...scope.querySelectorAll('input,button,pre,img,label')]
                .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > scr.right + 1 || r.left < scr.left - 1); })
                .map(el => ((el.textContent || el.tagName).trim()).slice(0, 16));
            const rr = sp.querySelector('[data-testid=research-row]');
            if (rr && rr.parentElement) {
                const prev = rr.previousElementSibling;
                out.researchGap = prev ? Math.round(rr.getBoundingClientRect().top - prev.getBoundingClientRect().bottom) : null;
                const wr = rr.parentElement.getBoundingClientRect();
                out.centerDiff = Math.round(Math.abs((wr.left - scr.left) - (scr.right - wr.right)));
                const cover = rr.parentElement.querySelector('[class*="220px"]');
                const fields = cover && cover.nextElementSibling;
                if (cover && fields) {
                    const a = cover.getBoundingClientRect(), b = fields.getBoundingClientRect();
                    out.coverOverlap = a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1;
                }
            }
            return out;
        });
        const waitSel = sel => page.waitForSelector(sel, {timeout: 5000}).then(() => true).catch(() => false);

        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.setViewportSize({width: 900, height: 600});
        await page.waitForTimeout(500);

        let g = await geoSettings();
        check('設定頁 900×600 AI 模型頁 捲軸在內容區(根節點不滾動)', !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`, scrollerIsRoot: g.scrollerIsRoot}));
        check('設定頁 900×600 AI 模型頁 內容無水平捲軸', !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));

        await page.click('[data-testid=tab-platforms]');
        const plat900 = await waitSel('[data-testid=platform-preview]');
        await page.waitForTimeout(300);
        g = await geoSettings();
        check('設定頁 900×600 平台輸出頁 捲軸在內容區(根節點不滾動)', plat900 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 900×600 平台輸出頁 內容無水平捲軸', plat900 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));

        await page.click('[data-testid=tab-project]');
        const proj900 = await waitSel('[data-testid=research-row]');
        await page.waitForTimeout(300);
        g = await geoSettings();
        check('設定頁 900×600 作品頁 捲軸在內容區(根節點不滾動)', proj900 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 900×600 作品頁 內容無水平捲軸', proj900 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        check('作品頁 900×600 元素右緣不超出內容區', proj900 && !!g && g.overflowing.length === 0, JSON.stringify(g && g.overflowing));
        check('作品頁 900×600 研究記錄上方間距不重複疊加(≤40px)', proj900 && !!g && g.researchGap != null && g.researchGap <= 40,
            `gap=${g && g.researchGap}`);
        check('設定頁 900×600 內容置中(左右間距差 ≤16px)', proj900 && !!g && g.centerDiff != null && g.centerDiff <= 16,
            `diff=${g && g.centerDiff}`);
        check('作品頁 900×600 封面與欄位區不重疊', proj900 && !!g && g.coverOverlap === false, `overlap=${g && g.coverOverlap}`);

        // 左側導覽欄(新設計才有;現況 FAIL 屬預期破壞證據)
        const hasNav = !!(await page.$('[data-testid=settings-nav]'));
        let navSwitch = false;
        if (hasNav) {
            await page.click('[data-testid=tab-models]');
            const n1 = await waitSel('[data-testid=profile-url]');
            await page.click('[data-testid=tab-platforms]');
            const n2 = await waitSel('[data-testid=platform-preview]');
            await page.click('[data-testid=tab-project]');
            const n3 = await waitSel('[data-testid=research-row]');
            navSwitch = n1 && n2 && n3;
        }
        check('設定頁 900×600 左側導覽欄存在且切換三頁正常', hasNav && navSwitch, `nav=${hasNav} switch=${navSwitch}`);

        // 主題切換:導覽欄底部、任何頁面可用,且立即保存到設定(SetTheme)
        const themeVisible = await page.isVisible('button:has-text("白紙")');
        let themeOk = false;
        if (themeVisible) {
            await page.click('button:has-text("白紙")');
            await page.waitForTimeout(300);
            const lightHtml = await page.evaluate(() => document.documentElement.classList.contains('light'));
            const savedLight = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.theme).catch(() => null));
            await page.click('button:has-text("夜間書房")');
            await page.waitForTimeout(300);
            const darkHtml = await page.evaluate(() => document.documentElement.classList.contains('dark'));
            const savedDark = await page.evaluate(() => window.go.main.App.GetSettings().then(s => s.theme).catch(() => null));
            themeOk = lightHtml && savedLight === 'light' && darkHtml && savedDark === 'dark';
            check('設定頁 主題切換在任何頁面可用且會保存(白紙→夜間書房)', themeOk,
                JSON.stringify({lightHtml, savedLight, darkHtml, savedDark}));
        } else {
            check('設定頁 主題切換在任何頁面可用且會保存(白紙→夜間書房)', false, '作品頁看不到「白紙」按鈕');
        }

        // 截圖:900×600 三頁(現況圖另由一次性腳本拍攝;這裡只在新版面下拍)
        if (hasNav) {
            await shot('70-settings-project-900');
            await page.click('[data-testid=tab-models]');
            await waitSel('[data-testid=profile-url]');
            await shot('72-settings-models-900');
            await page.click('[data-testid=tab-platforms]');
            await waitSel('[data-testid=platform-preview]');
            await shot('74-settings-platforms-900');
        }

        // ===== 設定頁 640×672(半螢幕,SPEC §16 第 7 項 (c) + 返工):堆疊版面 =====
        // 三欄並排(導覽+清單+表單)會把表單壓到約 148px、模型輸入框剩 24px——
        // 無水平捲軸 ≠ 可用;lg 以下清單與表單必須上下堆疊,表單控制項可用寬度 ≥ 200px
        await page.setViewportSize({width: 640, height: 672});
        await page.waitForTimeout(500);
        await page.click('[data-testid=tab-models]');
        await waitSel('[data-testid=profile-url]');
        await page.waitForTimeout(300);
        const stacked640 = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            const url = document.querySelector('[data-testid=profile-url]');
            // 可見的 input 與 select 觸發器(排除 Switch 之類的小控制項)
            const controls = [...c.querySelectorAll('input, button[role=combobox]')]
                .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                .map(el => { const r = el.getBoundingClientRect(); return {w: Math.round(r.width), t: (el.getAttribute('data-testid') || el.tagName)}; });
            // 堆疊驗證:找到含 lg:grid-cols 的外層 grid(清單+表單容器),lg 以下必須單欄(上下堆疊);
            // 注意 url.closest('div.grid') 會抓到 Field 的內層 grid(永遠 1 欄),必須往上找 lg:grid-cols
            let outer = url.parentElement;
            while (outer && !(outer.className || '').includes('lg:grid-cols')) outer = outer.parentElement;
            const cols = outer ? getComputedStyle(outer).gridTemplateColumns.split(' ').length : 0;
            return {sw: c.scrollWidth, cw: c.clientWidth, urlW: Math.round(url.getBoundingClientRect().width),
                    urlClientW: url.clientWidth, minControl: Math.min(...controls.map(x => x.w)), controls,
                    gridCols: cols};
        });
        check('設定頁 640×672 模型輸入框可用寬度 ≥ 200', stacked640.urlClientW >= 200, JSON.stringify(stacked640.urlClientW));
        check('設定頁 640×672 所有表單控制項可用寬度 ≥ 200', stacked640.minControl >= 200,
            JSON.stringify(stacked640.controls));
        check('設定頁 640×672 清單與表單上下堆疊(非三欄並排)', stacked640.gridCols === 1, `gridCols=${stacked640.gridCols}`);
        check('設定頁 640×672 AI 模型頁無水平捲軸', stacked640.sw <= stacked640.cw + 1, JSON.stringify(stacked640.sw));
        await shot('76-settings-models-640');
        await page.click('[data-testid=tab-platforms]');
        await waitSel('[data-testid=platform-preview]');
        await page.waitForTimeout(300);
        const stacked640p = await page.evaluate(() => {
            const c = document.querySelector('[data-testid=settings-content]');
            const controls = [...c.querySelectorAll('input, button[role=combobox]')]
                .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                .map(el => Math.round(el.getBoundingClientRect().width));
            // 下拉選單的值不被截斷到看不見:比較值文字自身 scrollWidth 與 clientWidth。
            // (返工:Hemingway — 此檢查原本停在 AI 模型頁,那頁沒有 button[role=combobox],
            //  truncSel 恆 0、永遠通過;下拉在平台輸出頁。值 span 是 inline,clientWidth 恆 0,
            //  暫時轉 inline-block 才量得到,量完還原)
            const sels = [...c.querySelectorAll('button[role=combobox]')].filter(el => el.getBoundingClientRect().width > 0);
            const truncSel = sels.filter(el => {
                const v = el.querySelector('span');
                if (!v) return false;
                const d = v.style.display;
                v.style.display = 'inline-block';
                const trunc = v.scrollWidth > v.clientWidth + 1;
                v.style.display = d;
                return trunc;
            }).length;
            return {sw: c.scrollWidth, cw: c.clientWidth, minControl: controls.length ? Math.min(...controls) : null,
                    selCount: sels.length, truncSel};
        });
        check('設定頁 640×672 平台輸出頁表單控制項可用寬度 ≥ 200', stacked640p.minControl >= 200, JSON.stringify(stacked640p));
        check('設定頁 640×672 平台輸出頁找得到下拉控制項(檢查不是空轉)', stacked640p.selCount >= 1, `selCount=${stacked640p.selCount}`);
        check('設定頁 640×672 平台輸出頁下拉選單值不被截斷', stacked640p.selCount >= 1 && stacked640p.truncSel === 0,
            `sel=${stacked640p.selCount} truncated=${stacked640p.truncSel}`);
        check('設定頁 640×672 平台輸出頁無水平捲軸', stacked640p.sw <= stacked640p.cw + 1, JSON.stringify(stacked640p));
        await shot('77-settings-platforms-640');

        // 1280×800:先回作品頁量測(兩種版面都用得上),再量模型/平台頁;1280(lg 以上)清單與表單回到並排
        await page.setViewportSize({width: 1280, height: 800});
        await page.waitForTimeout(500);
        await page.click('[data-testid=tab-project]');
        const proj1280 = await waitSel('[data-testid=research-row]');
        await page.waitForTimeout(300);
        g = await geoSettings();
        check('設定頁 1280×800 作品頁 捲軸在內容區(根節點不滾動)', proj1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 作品頁 內容無水平捲軸', proj1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        check('設定頁 1280×800 內容置中(左右間距差 ≤16px)', proj1280 && !!g && g.centerDiff != null && g.centerDiff <= 16,
            `diff=${g && g.centerDiff}`);
        if (hasNav) await shot('71-settings-project-1280');

        await page.click('[data-testid=tab-models], button:has-text("模型端點")'); // 現況無 tab-models,用文字
        const mod1280 = await waitSel('[data-testid=profile-url]');
        await page.waitForTimeout(300);
        g = await geoSettings();
        check('設定頁 1280×800 AI 模型頁 捲軸在內容區(根節點不滾動)', mod1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 AI 模型頁 內容無水平捲軸', mod1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        if (hasNav) await shot('73-settings-models-1280');

        await page.click('[data-testid=tab-platforms]');
        const plt1280 = await waitSel('[data-testid=platform-preview]');
        await page.waitForTimeout(300);
        g = await geoSettings();
        check('設定頁 1280×800 平台輸出頁 捲軸在內容區(根節點不滾動)', plt1280 && !!g && !g.rootScrollable,
            JSON.stringify(g && {root: `${g.rootScrollH}/${g.rootClientH}`}));
        check('設定頁 1280×800 平台輸出頁 內容無水平捲軸', plt1280 && !!g && !g.hScroll, JSON.stringify(g && {sw: g.scScrollW, cw: g.scClientW}));
        if (hasNav) await shot('75-settings-platforms-1280');

        // 還原:視窗與設定頁關閉(後續測試在 1440×900 進行)
        await page.setViewportSize({width: 1440, height: 900});
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(400);
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
            for (const [area, marker] of [['sidebar', 'E1sb'], ['inspector', 'E1in'], ['chat', 'E1ch']]) {
                // 半螢幕互斥(SPEC §16 第 7 項)可能在前面設定頁的寬度切換中收掉資訊欄,這裡補開;
                // 只在窄寬度(≤960)需要先收側欄,寬視窗直接開。補開後重置 w0 基準(開欄本身會變寬度,不算崩潰的影響)
                if (area === 'inspector' && !(await page.$('[data-testid=inspector]')) && (await page.$('[data-testid=toggle-inspector]'))) {
                    if (await page.$('aside') && await page.evaluate(() => window.innerWidth <= 960)) await page.click('[data-testid=rail-manuscript]');
                    await page.click('[data-testid=toggle-inspector]');
                    await page.waitForSelector('[data-testid=inspector]');
                }
                const w0 = await editorWidth();
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

// 最小視窗尺寸(640×672,半螢幕並排 SPEC §16 第 7 項)下標題欄與主要版面仍在
        await page.click('[data-testid=chapter-row]:has-text("第一章")');
        await page.waitForSelector('.cm-content');
        // 先確認 1440(>960)下兩欄都開著,縮窄才驗得到「兩個都開→自動收資訊欄」
        if (!(await page.$('aside'))) await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('aside');
        if (!(await page.$('[data-testid=inspector]'))) await page.click('[data-testid=toggle-inspector]');
        await page.waitForSelector('[data-testid=inspector]');
        await page.setViewportSize({width: 640, height: 672});
        await page.waitForTimeout(400);
        check('標題欄 640×672 下仍在', await page.isVisible('[data-testid=titlebar]'));
        check('標題欄 640×672 三顆視窗鈕完整在視窗內', await page.evaluate(() =>
            ['win-min', 'win-max', 'win-close'].every(id => {
                const r = document.querySelector(`[data-testid=${id}]`)?.getBoundingClientRect();
                return r && r.width > 0 && r.height > 0 && r.right <= window.innerWidth + 1;
            })));
        check('標題欄 640×672 下有 logo 選單、側欄開關與編輯器', !!(await page.$('[data-testid=app-menu]'))
            && !!(await page.$('[data-testid=titlebar-sidebar]')) && !!(await page.$('.cm-content')));
        await shot('54-titlebar-min-640x672');

        // ===== 半螢幕並排(SPEC §16 第 7 項):640×672 =====
        // 前提:進到這裡時側欄與資訊欄都開著(前面章節的狀態);由 >960 縮窄到 ≤960 觸發互斥,
        // 兩個都開就自動收資訊欄。門檻 960 = 1920×1080 縮放 100% 的半邊(驗收尺寸上限)。
        // 側欄的 aside 沒有 testid;Inspector 根元素也是 aside(testid=inspector),選擇器要排除
        const exclusiveOK = () => page.evaluate(() =>
            !(!!document.querySelector('aside:not([data-testid=inspector])') && !!document.querySelector('[data-testid=inspector]')));
        check('半螢幕 縮窄到 640 後資訊欄自動收起', !(await page.$('[data-testid=inspector]')));
        check('半螢幕 縮窄到 640 後側欄仍在', !!(await page.$('aside:not([data-testid=inspector])')));
        check('半螢幕 640×672 側欄與資訊欄不同時存在', await exclusiveOK());
        const mainW640 = await page.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width));
        check('半螢幕 640×672 主編輯區寬度 ≥ 300(可寫作)', mainW640 >= 300, `mainW=${mainW640}(圖示列 60+側欄 272=332,640-332=308)`);
        check('半螢幕 640×672 整頁無水平捲軸', await page.evaluate(() =>
            document.documentElement.scrollWidth <= document.documentElement.clientWidth));
        await shot('55-halfscreen-640');

        // ===== 窄寬度編輯區工具列(SPEC §17.1):640×672、側欄開(資訊欄已收)、長章名 =====
        // 量測重點:工具列「內容右緣」(所有可見後代的最大 right)不得超過 main 右緣——
        // 溢出的按鈕即使被 overflow-hidden 視覺裁掉,幾何上仍會超過,檢查才驗得到。
        if (!(await page.$('[data-testid=chapter-row]'))) await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('[data-testid=chapter-row]');
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

        const m640 = await measureToolbar();
        check('工具列 640×672 高度維持 48(不換行)', m640.tbH === 48, `tbH=${m640.tbH}`);
        check('工具列 640×672 內容不超出 main 右緣',
            m640.contentRight <= m640.tbRight + 1,
            JSON.stringify({contentRight: m640.contentRight, tbRight: m640.tbRight}));
        check('工具列 640×672 狀態徽章單行(未被擠成直排)',
            !!m640.badgeH && m640.badgeH <= 30, `badgeH=${m640.badgeH}`);
        check('工具列 640×672 麵包屑省略號截斷且看得到章名開頭',
            !!m640.crumb && m640.crumb.text.includes('第十二章') && m640.crumb.w >= 40
                && m640.crumb.scrollW > m640.crumb.w && m640.crumb.h <= 22,
            JSON.stringify(m640.crumb));
        check('工具列 640×672 次要按鈕收進「更多」(直列不放摘要/複製到平台/版本)',
            !/摘要|複製到平台|版本/.test(m640.text), m640.text);
        check('工具列 640×672 「儲存」與資訊欄開關仍可見且在工具列內',
            !!m640.save && !!m640.toggle && m640.save.w > 0 && m640.toggle.w > 0
                && m640.save.right <= m640.tbRight + 1 && m640.toggle.right <= m640.tbRight + 1,
            JSON.stringify({save: m640.save, toggle: m640.toggle}));
        await shot('60-toolbar-640x672');

        // 狀態列(SPEC §17.1):640 寬下不換行、每一項不超出 main 右緣;模型名以省略號截斷
        const sb640 = await page.evaluate(() => {
            const f = document.querySelector('footer');
            const main = document.querySelector('main');
            if (!f || !main) return null;
            const mainRight = main.getBoundingClientRect().right;
            const items = [...f.children].map(el => {
                const r = el.getBoundingClientRect();
                return {t: (el.textContent || '').trim().slice(0, 16), w: r.width, h: r.height, right: r.right};
            }).filter(i => i.w > 0 && i.h > 0);
            const ai = [...f.children].find(el => (el.textContent || '').startsWith('AI:'));
            const ar = ai ? ai.getBoundingClientRect() : null;
            return {
                text: (f.innerText || '').replace(/\s+/g, ' '),
                mainRight,
                items,
                ai: ai ? {scrollW: ai.scrollWidth, clientW: ai.clientWidth, right: ar.right, h: ar.height} : null,
            };
        });
        check('狀態列 640×672 每一項單行且不超出 main 右緣(不換行、不溢出)',
            !!sb640 && sb640.items.every(i => i.h <= 20 && i.right <= sb640.mainRight + 1),
            JSON.stringify(sb640 && {mainRight: sb640.mainRight, items: sb640.items}));
        check('狀態列 640×672 保留本章與已儲存、模型名省略號截斷且在 main 內',
            !!sb640 && /本章/.test(sb640.text) && /已儲存/.test(sb640.text)
                && !!sb640.ai && sb640.ai.scrollW > sb640.ai.clientW
                && sb640.ai.right <= sb640.mainRight + 1 && sb640.ai.h <= 20,
            JSON.stringify(sb640 && sb640.ai));

        // 「更多」下拉:最窄段把次要功能收進下拉,功能一個都不能少(SPEC §17.1)
        const hasMore = !!(await page.$('[data-testid=toolbar-more]'));
        check('工具列 640×672 有「更多」按鈕(次要功能收進下拉)', hasMore);
        if (hasMore) {
            await page.click('[data-testid=toolbar-more]');
            const menuOpen = await page.waitForSelector('[role=menu]', {timeout: 3000}).then(() => true).catch(() => false);
            const moreTxt = menuOpen ? await page.textContent('[role=menu]').catch(() => '') : '';
            const menuHasAll = menuOpen && moreTxt.includes('摘要') && moreTxt.includes('版本') && moreTxt.includes('複製到平台');
            check('更多 選單含摘要/版本/複製到平台', menuHasAll, moreTxt.slice(0, 120));
            if (menuOpen) { await page.waitForTimeout(300); await shot('62-toolbar-more-menu'); } // 等開合動畫結束再拍
            if (menuHasAll) {
                // 摘要
                await page.click('[role=menuitem]:has-text("摘要")').catch(() => {});
                const sumOpen = await page.waitForSelector('[data-testid=summary-text]', {timeout: 4000}).then(() => true).catch(() => false);
                check('更多 可從選單開啟摘要', sumOpen);
                if (sumOpen) {
                    await page.keyboard.press('Escape');
                    await page.waitForSelector('[data-testid=summary-text]', {state: 'detached', timeout: 4000}).catch(() => {});
                }
                // 版本
                await page.click('[data-testid=toolbar-more]').catch(() => {});
                await page.waitForSelector('[role=menu]', {timeout: 3000}).catch(() => {});
                await page.click('[role=menuitem]:has-text("版本")').catch(() => {});
                const verOpen = await page.waitForSelector('text=建立快照', {timeout: 4000}).then(() => true).catch(() => false);
                check('更多 可從選單開啟版本', verOpen);
                if (verOpen) {
                    await page.keyboard.press('Escape');
                    await page.waitForSelector('text=建立快照', {state: 'detached', timeout: 4000}).catch(() => {});
                }
                // 複製到平台(平台清單以展開項目呈現;點擊會寫入系統剪貼簿)
                await page.click('[data-testid=toolbar-more]').catch(() => {});
                await page.waitForSelector('[role=menu]', {timeout: 3000}).catch(() => {});
                await page.click('[role=menuitem]:has-text("角角者")').catch(() => {});
                const copied = await page.waitForSelector('[data-testid=toast]', {timeout: 5000})
                    .then(async () => (await page.textContent('[data-testid=toast]').catch(() => '')).includes('已複製')).catch(() => false);
                check('更多 可從選單觸發複製到平台', copied);
            } else {
                check('更多 可從選單開啟摘要', false, '選單未如期開啟或缺項目');
                check('更多 可從選單開啟版本', false, '選單未如期開啟或缺項目');
                check('更多 可從選單觸發複製到平台', false, '選單未如期開啟或缺項目');
            }
        } else {
            check('更多 選單含摘要/版本/複製到平台', false, 'toolbar-more 不存在');
            check('更多 可從選單開啟摘要', false, 'toolbar-more 不存在');
            check('更多 可從選單開啟版本', false, 'toolbar-more 不存在');
            check('更多 可從選單觸發複製到平台', false, 'toolbar-more 不存在');
        }
        await page.keyboard.press('Escape').catch(() => {}); // 收掉可能還開著的選單
        await page.waitForTimeout(300);

        // 窄寬度下作者手動開關仍有效:開資訊欄自動收側欄,再開側欄自動收資訊欄(SPEC §16 第 7 項 b)
        await page.click('[data-testid=toggle-inspector]');
        await page.waitForSelector('[data-testid=inspector]');
        const inspW640 = await page.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width));
        check('半螢幕 640 手動開資訊欄自動收側欄且主編輯區 ≥ 300',
            !(await page.$('aside:not([data-testid=inspector])')) && inspW640 >= 300, `mainW=${inspW640}`);
        await shot('56-halfscreen-640-inspector');
        await page.click('[data-testid=rail-manuscript]');
        await page.waitForSelector('aside');
        check('半螢幕 640 手動開側欄自動收資訊欄', !(await page.$('[data-testid=inspector]')));
        check('半螢幕 640 手動開側欄後仍互斥', await exclusiveOK());

        // 900×600(舊最小尺寸):側欄開時工具列退化成只剩圖示,互斥仍成立,不溢出
        await page.setViewportSize({width: 900, height: 600});
        await page.waitForTimeout(400);
        const m900 = await measureToolbar();
        check('工具列 900×600 退化成只剩圖示(文字收起,按鈕保留 aria-label 與 title)',
            !!m900.summary && m900.summary.w > 0 && m900.summary.aria === '章節摘要' && !!m900.summary.title
                && !/摘要|複製到平台|版本/.test(m900.text),
            JSON.stringify({text: m900.text, summary: m900.summary}));
        check('工具列 900×600 內容不超出 main 右緣',
            m900.contentRight <= m900.tbRight + 1,
            JSON.stringify({contentRight: m900.contentRight, tbRight: m900.tbRight}));
        check('半螢幕 900×600 側欄與資訊欄不同時存在', await exclusiveOK());
        await shot('54b-toolbar-900x600');

        // 1280×800(預設視窗):恢復完整文字標籤;變寬後不自動重開資訊欄(不強迫改變作者的選擇)
        await page.setViewportSize({width: 1280, height: 800});
        await page.waitForTimeout(400);
        const m1280 = await measureToolbar();
        check('工具列 1280×800 顯示完整文字標籤',
            /摘要/.test(m1280.text) && /複製到平台/.test(m1280.text) && /版本/.test(m1280.text),
            m1280.text);
        check('工具列 1280×800 內容不超出 main 右緣',
            m1280.contentRight <= m1280.tbRight + 1,
            JSON.stringify({contentRight: m1280.contentRight, tbRight: m1280.tbRight}));
        check('半螢幕 變寬到 1280 後不自動重開資訊欄', !(await page.$('[data-testid=inspector]')));
        await shot('61-toolbar-1280x800');

        // ===== 搜尋/取代(SPEC §16 第 24 項第一層;返工:安靜精簡兩列面板)=====
        const editorTxt = () => page.$$eval('.cm-content .cm-line', els => els.map(e => e.textContent).join('\n'));
        const openPanel = async key => { await page.keyboard.press(key); await page.waitForSelector('.perkins-search', {timeout: 5000}); };
        await page.setViewportSize({width: 1440, height: 900});
        await page.waitForTimeout(300);
        const searchRow = (await page.$$('[data-testid=chapter-row]'))[0];
        await searchRow.click();
        await page.waitForSelector('.cm-content');
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(300);

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
            await page.waitForTimeout(200);
            const synced = await page.evaluate(() => ({
                search: document.querySelector('.perkins-search input[name=search]').value,
                replace: document.querySelector('.perkins-search input[name=replace]').value,
                count: document.querySelector('.perkins-search .perkins-search-count').textContent,
                sel: document.querySelector('.cm-searchMatch-selected')?.textContent || '',
            }));
            await page.click('.perkins-search button[name=replaceAll]');
            await page.waitForTimeout(300);
            const t2 = await editorTxt();
            check('面板顯示與實際取代條件同步(Ctrl+H 後顯示「天→空」,全部取代移除的正是天)',
                selChar === '天' && synced.search === '天' && synced.replace === '' && synced.count === '1/1' && synced.sel === '天'
                && !t2.includes('天很黑') && t2.includes('很黑'), JSON.stringify({selChar, synced, tail: t2.slice(-40)}));
            check('同步後取代走正常編輯流程(未儲存)', !!(await page.$('[title="尚未儲存"]')));
            await page.keyboard.press('Control+s');
            await page.waitForTimeout(300);
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
            await page.waitForTimeout(300);
            await openPanel('Control+h');
            await page.click('.perkins-search input[name=search]', {clickCount: 3});
            await page.keyboard.type('搜尋取代目標字', {delay: 20});
            await page.click('.perkins-search input[name=replace]', {clickCount: 3});
            await page.keyboard.type('改寫後的字', {delay: 20});
            await page.click('.perkins-search button[name=replaceAll]');
            await page.waitForTimeout(300);
            const t1 = await editorTxt();
            check('全部取代後內容已改變', !t1.includes('搜尋取代目標字') && (t1.match(/改寫後的字/g) || []).length === 2, t1.slice(-60));
            check('取代走正常編輯流程(狀態為未儲存)', !!(await page.$('[title="尚未儲存"]')));
            await page.keyboard.press('Control+s');
            await page.waitForTimeout(300);
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
            await page.waitForTimeout(300);
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
        await page.waitForTimeout(300);
        await shot('67-search-dark-1280');
        await page.click('[data-testid=open-settings]');
        await page.waitForSelector('[data-testid=settings-page]');
        await page.click('button:has-text("白紙")');
        await page.click('[data-testid=close-settings]');
        await page.waitForTimeout(400);
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
        await page.waitForTimeout(300);

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
            await page.waitForTimeout(200);
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
            await page.waitForTimeout(200);
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
            await page.waitForTimeout(200);
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
            await page.waitForTimeout(300);
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
            await page.waitForTimeout(200);
            const c3 = await countOf();
            const sel3 = await page.evaluate(() => document.querySelector('.cm-searchMatch-selected')?.textContent || '');
            check('IME(CDP) 組字結束後一般 Enter 恢復(選取仍同步在雷恩比對)',
                sel3 === '雷恩' && c3 === '1/1', `count=${c3}, sel=${sel3}`);
            await page.keyboard.press('Escape');
            await page.waitForSelector('.perkins-search', {state: 'detached', timeout: 5000}).catch(() => {});
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
            await page.waitForTimeout(300);
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
            await page.waitForTimeout(300);
            const rich = await docText();
            check('貼上含 HTML 格式時只取純文字圖層',
                rich.includes('純文字版') && !rich.includes('HTML標記不應出現'));
            // 右鍵選單「貼上」走前端的 clipboard.readText():\\r\\n 也要正規化(點擊座標固定在可見編輯區內)
            // 先還原 E4a 段留下的 writeText 替身(它不寫真剪貼簿),否則這裡的 writeText 不生效
            await page.evaluate(() => { if (window.__clipStubs?.orig) navigator.clipboard.writeText = window.__clipStubs.orig; });
            let cbFull = '';
            for (let i = 0; i < 4; i++) {
                await page.evaluate(async () => { try { await navigator.clipboard.writeText('戊己\r\n庚辛'); } catch (e) {} });
                await page.waitForTimeout(250);
                cbFull = await page.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch (e) { return 'ERR:' + e.name; } });
                if (cbFull === '戊己\r\n庚辛') break;
            }
            const hasCRLF = cbFull.includes('\r');
            const beforeLen = (await docText()).length;
            const sc = await page.evaluate(() => { const r = document.querySelector('.cm-scroller').getBoundingClientRect(); return {x: r.left + 150, y: r.top + r.height / 2}; });
            await page.mouse.click(sc.x, sc.y, {button: 'right'});
            await page.waitForSelector('.ctxmenu', {timeout: 5000});
            await page.click('.ctxmenu div:text-is("貼上")');
            await page.waitForTimeout(300);
            const menuPaste = await docText();
            const grew = menuPaste.length >= beforeLen + cbFull.replace(/\r/g, '').length - 2;
            // 雙軌:剪貼簿是預期測試文字時驗內容;writeText 不生效(用殘留的救援複本,仍含 \\r\\n)時
            // 以「文件精確變長 + 無 \\r」驗正規化;兩軌都能抓到「沒貼入/貼入含 \\r」的破壞
            const contentOk = cbFull === '戊己\r\n庚辛'
                ? menuPaste.includes('戊己\n庚辛')
                : grew;
            check('右鍵選單貼上同樣把 \\r\\n 統一成 \\n',
                hasCRLF && contentOk && !menuPaste.includes('\r'),
                `cb=${JSON.stringify(cbFull.slice(0, 8))} grew=${grew} len ${beforeLen}→${menuPaste.length}`);

            // --- 全域 Ctrl+F / Ctrl+H:編輯器未聚焦時也開面板;輸入框/對話框/浮窗內不攔;沒開檔不做任何事 ---
            await page.keyboard.press('Escape');
            await page.click('[data-testid=sidebar-title]'); // 焦點離開編輯器
            await page.keyboard.press('Control+f');
            await page.waitForTimeout(200);
            const gf = await page.evaluate(() => ({
                open: !!document.querySelector('.perkins-search'),
                focus: document.activeElement?.name || document.activeElement?.tagName,
            }));
            check('全域 Ctrl+F(編輯器未聚焦)開啟搜尋面板並聚焦搜尋欄',
                gf.open && gf.focus === 'search', JSON.stringify(gf));
            await shot('70-global-find');
            await page.keyboard.press('Control+h');
            await page.waitForTimeout(200);
            const gh = await page.evaluate(() => ({
                replaceVisible: document.querySelector('.perkins-search .perkins-replace-row')?.style.display,
                focus: document.activeElement?.name || document.activeElement?.tagName,
            }));
            check('全域 Ctrl+H(編輯器未聚焦)展開取代列並聚焦「取代為」欄',
                gh.replaceVisible === 'flex' && gh.focus === 'replace', JSON.stringify(gh));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            // Perkins Bot 浮窗:焦點在輸入框時不攔截
            await page.click('[data-testid=chat-fab]');
            await page.waitForSelector('[data-testid=chat-window]:visible');
            await page.click('[data-testid=question]');
            await page.keyboard.press('Control+f');
            await page.waitForTimeout(200);
            const chatGuard = await page.evaluate(() => ({
                panel: !!document.querySelector('.perkins-search'),
                focus: document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName,
            }));
            check('Perkins Bot 輸入框內 Ctrl+F 不被攔截(面板不開、焦點留在輸入框)',
                !chatGuard.panel && chatGuard.focus === 'question', JSON.stringify(chatGuard));
            await page.keyboard.press('Escape');
            await page.click('[data-testid=chat-window] button:has(svg.lucide-minus)');
            await page.waitForTimeout(300);
            // 對話框內不攔截(版本對話框)
            await page.click('[data-testid=open-versions]');
            await page.waitForTimeout(300);
            await page.keyboard.press('Control+f');
            await page.waitForTimeout(200);
            check('對話框內 Ctrl+F 不被攔截(面板不開)',
                !(await page.$('.perkins-search')));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);

            // --- 長章節:建約 5 萬字章節,量測捲動與輸入延遲(只在有明顯問題時才改程式) ---
            const LONG = 'manuscript/長章測試.md';
            fs.mkdirSync(path.join(PROJ, 'manuscript'), {recursive: true});
            fs.writeFileSync(P(LONG), '# 長章測試\n\n' + '這是一段測試用的長篇文字,描述森林裡的冒險故事與角色之間的對話。'.repeat(2400) + '\n');
            await page.click('.cm-content');
            await page.keyboard.press('Control+s'); // 存檔後 refreshTree,新章節才會出現在側欄
            await page.waitForSelector('aside li:has-text("長章測試")', {timeout: 15000});
            await page.click('aside li:has-text("長章測試")');
            await page.waitForTimeout(800);
            await page.click('.cm-content');
            await page.keyboard.press('Control+End');
            await page.waitForTimeout(300);
            await page.evaluate(() => { document.querySelector('.cm-scroller').scrollTop = 0; });
            await page.waitForTimeout(300);
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

            // --- 視窗縮放後游標穩定:游標行仍在可視範圍,不跳到頂端 ---
            // 在長章中段放游標,捲到游標行在中間,縮到 640(資訊欄自動收合),游標行應仍在可視範圍
            await page.evaluate(() => {
                const s = document.querySelector('.cm-scroller');
                s.scrollTop = s.scrollTop > 0 ? s.scrollTop * 0.5 : s.scrollHeight * 0.5;
            });
            await page.waitForTimeout(300);
            // 游標在文件末端,先點中間某行讓游標落在可視範圍
            await page.evaluate(() => {
                const lines = document.querySelectorAll('.cm-content .cm-line');
                const el = lines[Math.floor(lines.length / 2)];
                const r = el.getBoundingClientRect();
                window.__midClick = {x: r.left + 10, y: r.top + 4};
            });
            await page.mouse.click((await page.evaluate(() => window.__midClick.x)), (await page.evaluate(() => window.__midClick.y)));
            await page.waitForTimeout(200);
            const before = await page.evaluate(() => window.__perkinsEditor?.pos());
            await page.setViewportSize({width: 640, height: 672}); // 觸發 ≤960 互斥收合
            await page.waitForTimeout(500);
            const after = await page.evaluate(() => ({pos: window.__perkinsEditor?.pos(), vis: window.__perkinsEditor?.cursorVisible()}));
            check('縮放到 640(互斥收合)後游標行仍在可視範圍、未跳到頂端',
                after.vis === true && after.pos.scrollTop > 0, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
            await shot('71-resize-640-stable');
            await page.setViewportSize({width: 1440, height: 900});
            await page.waitForTimeout(400);

            // --- 切章位置記憶:游標(選取)與捲動回到上次位置;外部改檔後超出長度要夾住不報錯 ---
            await page.click('aside li:has-text("第三章")');
            await page.waitForTimeout(500);
            await page.click('aside li:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await page.waitForTimeout(400);
            // 捲到中段,雙擊選一個詞(選取記憶可從浮動列觀察)
            await page.evaluate(() => {
                const s = document.querySelector('.cm-scroller');
                s.scrollTop = Math.max(0, (s.scrollHeight - s.clientHeight) * 0.6);
            });
            await page.waitForTimeout(300);
            await page.click('.cm-content >> text=雷恩點起營火', {clickCount: 2});
            await page.waitForTimeout(200);
            const memo = await page.evaluate(() => ({
                sel: document.querySelector('[data-testid=selection-bar]') ? window.getSelection().toString() : null,
                pos: window.__perkinsEditor?.pos(),
            }));
            check('前置:已選取文字並捲動(位置記憶的素材)', !!memo.sel && memo.pos.scrollTop > 0, JSON.stringify(memo));
            await page.click('aside li:has-text("第三章")');
            await page.waitForTimeout(500);
            const stored = await page.evaluate(() => window.__perkinsEditor?.posAll?.());
            await page.click('aside li:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await page.waitForTimeout(500);
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
            await page.waitForTimeout(500);
            await page.click('aside li:has-text("第一章")');
            await page.waitForSelector('.cm-content');
            await page.waitForTimeout(500);
            const clamped = await page.evaluate(() => {
                const p = window.__perkinsEditor?.pos();
                const len = document.querySelector('.cm-content').textContent.length;
                return {head: p?.head, lines: p?.lines, len};
            });
            check('外部重載後游標超出長度會夾住(不報錯、游標在文件內)',
                clamped.head <= clamped.len + 1 && clamped.lines === 2, JSON.stringify(clamped));
        } catch (e) {
            check('貼上的格式處理', false, e.message);
            check('全域 Ctrl+F / Ctrl+H / 不攔截檢查', false, e.message);
            check('長章節量測與縮放/位置記憶檢查', false, e.message);
        }

        await page.setViewportSize({width: 1440, height: 900});    } catch (e) {
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
