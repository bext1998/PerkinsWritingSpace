// E2E 共用基礎設施:fixture 建立、瀏覽器啟動、檢查/截圖/狀態準備 helper。
// 各測試組(suites/*.js)與 run.js 使用;不直接執行。
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const BASE = 'http://localhost:34115';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROJ = process.env.PROJ; // 書櫃卡片選擇器用(同 run.js 的環境約定)

// Notion 匯出 fixture:放在測試專案之外的暫存處,同一資料夾三頁,檔名帶 32 位 hex id。
// 用 resolve 保證絕對路徑(Windows 後端不吃「\notion-export」這種相對路徑)
const notionSrcFor = projDir => path.resolve(path.dirname(projDir), 'notion-export');

function buildFixture(dir) {
    const NOTION_SRC = notionSrcFor(dir);
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
    // Notion 匯出:同一資料夾(人物)三頁,檔名帶 32 位 hex id
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
}

class Reporter {
    constructor() {
        this.results = [];
        // 用箭頭函式綁定 this:解構取出(check/skip/maybe)後仍可用
        this.check = (name, ok, detail = '') => { ok = !!ok; this.results.push({name, ok, detail}); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
        // E2E_SKIP_AI=1:跳過所有向模型送出請求的步驟;被跳過的檢查印成「略過」,結尾統計,不算通過
        this.skip = name => { this.results.push({name, ok: null, detail: '略過(E2E_SKIP_AI=1)'}); console.log(`SKIP ${name} (E2E_SKIP_AI=1)`); };
        this.maybe = async (name, fn, detail = '') => {
            if (this.skipAI) { this.skip(name); return; }
            this.check(name, await fn(), detail);
        };
    }
    get skipAI() { return process.env.E2E_SKIP_AI === '1'; }
    summary() {
        const failed = this.results.filter(r => r.ok === false);
        const passed = this.results.filter(r => r.ok === true);
        const skipped = this.results.filter(r => r.ok === null).length;
        console.log(`\n${passed.length}/${passed.length + failed.length} passed,略過 ${skipped} 項${this.skipAI ? '(E2E_SKIP_AI=1)' : ''}`);
        return failed.length ? 1 : 0;
    }
}

async function launch(reporter) {
    const {chromium} = require('playwright-core');
    const browser = await chromium.launch({executablePath: EDGE, headless: true});
    const context = await browser.newContext({viewport: {width: 1440, height: 900}});
    await context.grantPermissions(['clipboard-read', 'clipboard-write']); // E4 複製全文用
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    return {browser, context, page, errors};
}

// 狀態準備(冪等):--all 依序執行時前一組的結束狀態多半已符合,no-op;
// 單獨執行時把應用帶到該組需要的起始狀態。
async function currentTitle(page) {
    return page.evaluate(() => (document.querySelector('[data-testid=titlebar-title]')?.textContent || '').trim()).catch(() => '');
}

// 點書櫃上 E2E 測試專案的封面(title 是路徑)。逐一比對正規化後的路徑,
// 不把 Windows 路徑塞進 CSS 屬性選擇器(反斜線會變成非法跳脫)
async function clickProjectCard(page) {
    const norm = s => s.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    const cards = page.locator('button[title]');
    await cards.first().waitFor({timeout: 15000});
    const titles = await cards.evaluateAll(els => els.map(e => e.title));
    const i = titles.findIndex(t => norm(t) === norm(PROJ));
    if (i < 0) throw new Error(`書櫃找不到測試專案封面:${PROJ}`);
    await cards.nth(i).click();
}

// 開啟 E2E 測試專案;chapter 指定時確認該章在編輯器中(crumbs 含章名);
// panel 指定側欄面板(manuscript/bible/docs/checks):各組第一步可能是「切換面板」的
// rail 點擊(已在該面板時會變成收合),起始面板要對齊原始流程
async function ensureProject(page, chapter, panel) {
    const title = await currentTitle(page);
    if (title === 'Perkins WritingSpace') {
        // 同一次 wails session 裡 reload 頁面會回到書櫃(PERKINS_OPEN 只在後端啟動時生效):
        // 點 E2E測試 卡重新開啟專案,不要 goto(goto 之後仍是書櫃)
        await clickProjectCard(page);
        await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
    } else if (title === 'E2E測試') {
        // 開章節需要稿件面板(章節列只在稿件/設定集/大綱面板可見)
        if (chapter) {
            await ensurePanel(page, 'manuscript');
            const ok = await page.evaluate(c => {
                const cm = !!document.querySelector('.cm-content');
                const crumbs = (document.querySelector('[data-testid=crumbs]')?.textContent || '');
                return cm && crumbs.includes(c);
            }, chapter);
            if (!ok) {
                await page.locator(`[data-testid=chapter-row]:has-text("${chapter}")`).first().click({timeout: 15000});
                await waitChapterLoaded(page, chapter);
            }
        }
        // 最後把側欄帶到該組需要的面板(可與開章節用的面板不同)
        return ensurePanel(page, panel);
    }
    await page.goto(BASE);
    // 等應用載入:書櫃(reload 情境,PERKINS_OPEN 只在後端啟動時生效)或已自動開作品
    await page.waitForSelector('[data-testid=bookshelf-title], [data-testid=chapter-row]', {timeout: 30000});
    if (await page.$('[data-testid=bookshelf-title]')) {
        // 書櫃:點 E2E測試 卡開啟專案
        await clickProjectCard(page);
        await page.waitForSelector('[data-testid=chapter-row]', {timeout: 30000});
    }
    // 等自動開作品的 tree 載入完畢(字數統計等非同步請求落地,mutation 靜默),
    // 否則緊接著的新增章節會跟在途的 tree 更新競態,列會出現後又消失
    await settleDOM(page, 300, 5000);
    if (chapter) {
        await ensurePanel(page, 'manuscript');
        await page.locator(`[data-testid=chapter-row]:has-text("${chapter}")`).first().click({timeout: 15000});
        await waitChapterLoaded(page, chapter);
    }
    return ensurePanel(page, panel);
}

// 等指定章節真的載入:.cm-content 在 + 麵包屑含章名。切章時 .cm-content 一直存在,
// 只等它可能在新章載入前返回;麵包屑(目前檔案路徑)才是載入完成的指標。
async function waitChapterLoaded(page, chapter) {
    await page.waitForFunction(c => {
        const crumbs = (document.querySelector('[data-testid=crumbs]')?.textContent || '');
        return !!document.querySelector('.cm-content') && crumbs.includes(c);
    }, chapter, {timeout: 15000});
}
// 確認側欄在指定面板;各組第一步可能是「切換面板」的 rail 點擊(已在該面板時會變成收合),
// 起始面板要對齊原始流程
async function ensurePanel(page, panel) {
    if (!panel) return;
    // 側欄收起時先展開(展開回到 lastPanel;確保後再導到目標面板)
    const open = await page.evaluate(() => !!document.querySelector('[data-testid=sidebar-title]')).catch(() => false);
    if (!open) {
        await page.click('[data-testid=titlebar-sidebar]');
        await page.waitForSelector('[data-testid=sidebar-title]', {timeout: 5000});
    }
    const cur = await page.evaluate(() => (document.querySelector('[data-testid=sidebar-title]')?.textContent || '')).catch(() => '');
    const label = {manuscript: '稿件', bible: '設定集', docs: '大綱與筆記', checks: '檢查'}[panel];
    if (cur === label) return;
    await page.click(`[data-testid=rail-${panel}]`);
    await page.waitForSelector(`[data-testid=sidebar-title] >> text=${label}`, {timeout: 5000});
}

// 確認某章節存在(不存在就以 UI 建立)並開啟
async function ensureChapter(page, name) {
    await ensureProject(page);
    const has = await page.$$eval('[data-testid=chapter-row]', els => els.some(e => e.textContent.includes(name)));
    if (has) {
        const ok = await page.evaluate(c => {
            const cm = !!document.querySelector('.cm-content');
            const crumbs = (document.querySelector('[data-testid=crumbs]')?.textContent || '');
            return cm && crumbs.includes(c);
        }, name);
        if (!ok) {
            // locator 自動重試:對話框關閉後側欄重渲染不會打斷點擊
            await page.locator(`[data-testid=chapter-row]:has-text("${name}")`).first().click({timeout: 15000});
            await waitChapterLoaded(page, name);
        }
        return;
    }
    await page.evaluate(() => document.querySelector('[data-testid=add-chapter-0]')?.click());
    await page.waitForSelector('[data-testid=chapter-name]');
    await page.fill('[data-testid=chapter-name]', name);
    await page.click('[data-testid=chapter-create]');
    // 建立後 refreshTree 會重渲染列,用 locator(自動重試)開啟
    await page.locator(`[data-testid=chapter-row]:has-text("${name}")`).first().click({timeout: 15000});
    await waitChapterLoaded(page, name);
}

// 回到書櫃(在書櫃就 no-op)
async function ensureBookshelf(page) {
    const atShelf = await page.$('[data-testid=bookshelf-title]');
    if (atShelf) return;
    const hasHouse = await page.$('nav button:has(svg.lucide-house)');
    if (!hasHouse) {
        // 應用尚未載入(新頁面 about:blank 或空白狀態):goto 後依畫面導到書櫃
        await page.goto(BASE);
        await page.waitForSelector('[data-testid=bookshelf-title], [data-testid=chapter-row]', {timeout: 30000});
        const atShelf2 = await page.$('[data-testid=bookshelf-title]');
        if (atShelf2) return;
    }
    await page.click('nav button:has(svg.lucide-house)');
    await page.waitForSelector('[data-testid=bookshelf-title]', {timeout: 20000});
}

module.exports = {BASE, EDGE, notionSrcFor, buildFixture, Reporter, launch, ensureProject, ensureChapter, ensureBookshelf, settleDOM, serverUp, reuseProject,
    makeFs: (PROJ) => ({
        P: rel => (require('path').join(PROJ, ...rel.split('/'))),
        read: rel => fs.readFileSync(require('path').join(PROJ, ...rel.split('/')), 'utf8'),
        hash: rel => crypto.createHash('sha256').update(fs.readFileSync(require('path').join(PROJ, ...rel.split('/')))).digest('hex'),
    })};

// 34115 上是否已有 wails dev(只偵測,不自己啟動)。--reuse 需要它:Go 程式碼改了沒重啟就測不到。
async function serverUp() {
    try {
        const res = await fetch(BASE, {signal: AbortSignal.timeout(3000)});
        return res.ok;
    } catch {
        return false;
    }
}

// E2E 重用同一個 wails dev(--reuse):重建 fixture 後叫後端重新開啟作品,再讓前端重載回起始畫面。
// 後端的作品狀態(proj、agent 含對話與提案快取、research、在途 cancel)由 OpenProjectAt → setProject 整個換掉,
// 與作者從書櫃換作品是同一條產品路徑;冷啟動只多了 Go 重編譯與行程重啟。
// 注意:改了 Go 程式碼一定要冷啟動(wails dev -noreload 不會重編譯);改前端 vite 會熱更新,
// 這裡仍然會重載頁面,所以測到的一定是磁碟上的最新前端程式。
async function reuseProject(page, projDir) {
    buildFixture(projDir);
    await page.goto(BASE);
    const bound = await page.waitForFunction(() => !!(window.go && window.go.main && window.go.main.App && window.go.main.App.OpenProjectAt),
        null, {timeout: 20000}).then(() => true).catch(() => false);
    if (!bound) throw new Error('34115 上的 wails dev 沒有回應綁定:確認伺服器還活著(見 .agent/skills/e2e/SKILL.md)');
    await page.evaluate(dir => window.go.main.App.OpenProjectAt(dir), projDir);
    await page.goto(BASE);
    await page.waitForSelector('[data-testid=bookshelf-title], [data-testid=chapter-row]', {timeout: 30000});
    return true;
}

// 條件式等待:等 DOM 靜默(連續 quietMs 無 mutation)或超過 maxMs 上限。
// 取代「click 後固定等 N ms」的寫法:UI 早就更新完就提早返回,更新中就繼續等。
async function settleDOM(page, quietMs = 120, maxMs = 1500) {
    return page.evaluate(({q, m}) => new Promise(resolve => {
        let last = performance.now();
        const start = last;
        const obs = new MutationObserver(() => { last = performance.now(); });
        obs.observe(document.documentElement, {childList: true, subtree: true, characterData: true, attributes: true});
        const tick = () => {
            const now = performance.now();
            if (now - last >= q || now - start >= m) { obs.disconnect(); resolve(); return; }
            setTimeout(tick, 40);
        };
        setTimeout(tick, q);
    }), {q: quietMs, m: maxMs});
}
