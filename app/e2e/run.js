#!/usr/bin/env node
// Perkins 第二階段前端 E2E 執行器:透過 wails dev 的瀏覽器端 (localhost:34115) 呼叫真實 Go 後端。
//
// 用法:
//   node run.js --fixture <資料夾>   建立(重建)拋棄式測試專案;重建後必須重啟 wails dev(SKILL.md 已知陷阱)
//   node run.js                      印出測試組清單與用法
//   node run.js --all                全部測試組依序執行(合併前跑這個)
//   node run.js --smoke              冒煙組(約 2 分鐘:開檔/存檔/提案預覽/關閉保護/標題欄禪模式/搜尋)
//   node run.js <組名> [組名...]     只跑指定組(破壞驗證、返工時只跑受影響的組)
//
// 環境:E2E_SKIP_AI=1 跳過需本機模型的步驟;PROJ=<測試專案> 指定專案。
// 流程與副作用見 .agent/skills/e2e/SKILL.md(鎖檔、settings.json 備份還原、清書櫃垃圾)。
const fs = require('fs');
const path = require('path');
const lib = require('./lib');

const args = process.argv.slice(2);

if (args[0] === '--fixture') {
    if (!args[1]) { console.error('用法:node run.js --fixture <資料夾>'); process.exit(1); }
    lib.buildFixture(path.resolve(args[1]));
    process.exit(0);
}

const SUITES = [
    ['titlebar-zen', '標題欄與品牌與選單與禪模式(含開檔基本、白屏回歸)'],
    ['bot-chat', 'Perkins Bot 對話:快速指令、建議附加、提案(需模型)、版本初覽'],
    ['bible', '設定集與自訂分類與寫法檢查'],
    ['shelf', '作品章節:摘要、複製到平台、新增卷拖曳、主題切換、書櫃'],
    ['layout-visual', '書櫃 1B 視覺(長書名封面)與重新開啟'],
    ['research', '研究記錄 R1–R3'],
    ['polish', '介面打磨 U1-U8(新增章節、選取標籤、還原、浮動列、預覽)'],
    ['visual-1b', '1B 視覺:AI 浮窗回覆與提案卡、資訊欄(深/淺)'],
    ['save-flow', '存檔按鈕 E3、序列化存檔 E5、重開同章 E6、過期導覽 E7'],
    ['notion', 'Notion 逐頁分類匯入與撤銷'],
    ['settings-layout', '設定頁導覽版面 900/640/1280'],
    ['error-guard', '錯誤防護 E1/E2/E2b/E4/E4a(開發模式崩潰點)'],
    ['close-guard', '關閉前存檔保護、對話框關閉鈕、聊天浮窗拖曳'],
    ['layout-half', '半螢幕 640 互斥、窄寬度工具列與更多選單'],
    ['search-editor', '搜尋/取代面板、IME 組字防護、編輯器手感(位置記憶/縮放/貼上)'],
    ['paper', '稿紙化:一個 Enter 一段、隱藏段落空行與 Markdown 標記'],
];

const printUsage = () => {
    console.log('用法:node run.js [--fixture <dir> | --all | --smoke | <組名...>]');
    console.log('');
    console.log('測試組(依完整測試的執行順序):');
    for (const [n, d] of SUITES) console.log(`  ${n.padEnd(16)} ${d}`);
    console.log('');
    console.log('何時跑哪組(詳見 .agent/skills/e2e/SKILL.md):');
    console.log('  改標題欄/禪模式/品牌      → titlebar-zen');
    console.log('  改 ChatWindow/提案流程    → bot-chat polish visual-1b');
    console.log('  改設定集/分類/Notion 匯入 → bible notion');
    console.log('  改章節/書櫃/平台輸出/摘要 → shelf layout-visual');
    console.log('  改研究記錄                → research');
    console.log('  改存檔流程                → save-flow error-guard close-guard');
    console.log('  改編輯器呈現/Enter 行為    → paper search-editor');
    console.log('  改錯誤防護/關閉保護       → error-guard close-guard');
    console.log('  改設定頁版面              → settings-layout');
    console.log('  改半螢幕/窄寬度版面       → layout-half layout-visual');
    console.log('  改搜尋/取代/編輯器手感    → search-editor');
    console.log('  平常開發                  → --smoke + 受影響的組');
    console.log('  合併前                    → --all');
    if (process.env.PROJ) console.log(`\nPROJ=${process.env.PROJ}`);
};

// 無參數:只印用法與組清單,不啟動瀏覽器(不論有沒有設 PROJ)
if (args.length === 0) { printUsage(); process.exit(1); }

const PROJ = process.env.PROJ;
if (!PROJ) { console.error('需要 PROJ=<測試專案> 環境變數(wails dev 的 PERKINS_OPEN 同一個專案)'); process.exit(1); }

const only = args[0] === '--all' ? SUITES.map(s => s[0])
    : args.flatMap(a => a === '--smoke' ? ['__smoke'] : [a]);
if (only.includes('__smoke')) console.log('含冒煙組(不重建 fixture;建議先重建 + 重啟 wails dev 再跑)');

const loader = n => n === '__smoke' ? require('./suites/smoke') : require(`./suites/${n}.js`);
for (const n of only) {
    try { loader(n); } catch (e) { console.error(`找不到測試組:${n}(${e.message})`); printUsage(); process.exit(1); }
}

(async () => {
    const reporter = new lib.Reporter();
    const {check, skip, maybe} = reporter;
    const {browser, page, errors} = await lib.launch(reporter);
    const shot = n => page.screenshot({path: path.join(__dirname, 'shots', n + '.png')});
    const ctx = {
        page, check, skip, maybe, shot, errors,
        PROJ, SKIP_AI: reporter.skipAI, NOTION_SRC: lib.notionSrcFor(PROJ),
        SHOTS: path.join(__dirname, 'shots'),
        cfgHash: require('crypto').createHash('sha256').update(fs.readFileSync(path.join(PROJ, 'perkins.json'))).digest('hex'),
        ch1: 'manuscript/第一章.md',
        ...lib.makeFs(PROJ),
        settle: (q, m) => lib.settleDOM(page, q, m),
        ensureProject: (c, panel) => lib.ensureProject(page, c, panel),
        ensureChapter: (c, panel) => lib.ensureChapter(page, c, panel),
        ensureBookshelf: () => lib.ensureBookshelf(page),
    };
    const T0 = Date.now();
    for (const n of only) {
        const suite = loader(n);
        console.log(`\n===== ${n} — ${suite.desc || ''} =====`);
        const t = Date.now();
        try {
            await suite.run(ctx);
        } catch (e) {
            check('執行中斷', false, `[${n}] ${e.message}`);
            await shot('99-error').catch(() => {});
        }
        console.log(`(${n} ${((Date.now() - t) / 1000).toFixed(0)}s)`);
    }
    // 開發模式刻意拋錯(__perkinsCrash)會被 boundary 捕捉,但 React dev 仍會重拋到 window,屬預期,不算錯
    const realErrors = errors.filter(e => !e.includes('開發模式刻意拋錯'));
    check('頁面沒有 JavaScript 錯誤', realErrors.length === 0, realErrors.join(' | '));
    await browser.close();
    console.log(`總耗時 ${((Date.now() - T0) / 1000).toFixed(0)}s`);
    process.exit(reporter.summary());
})();
