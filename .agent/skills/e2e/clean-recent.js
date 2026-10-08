// 清掉 E2E 留在作者真實設定裡的書櫃垃圾:%APPDATA%\Perkins\settings.json 的「最近作品」中,
// 路徑位於系統暫存資料夾(os.tmpdir())的項目,以及暫存資料夾下殘留的 perkins-e2e-b-* 測試專案(e2e.js 以 mkdtemp 建立的「乙作品」)。
// 不刪 perkins-e2e-backup-* 等其他資料夾(可能是正在進行的 E2E 的設定備份)。
// 只動暫存資料夾內的東西;作者真正的作品(暫存資料夾以外的路徑)一律保留。
// 用法:node .agent/skills/e2e/clean-recent.js   (加 --dry-run 只列出不修改)
const fs = require('fs');
const os = require('os');
const path = require('path');

const dry = process.argv.includes('--dry-run');
const tmp = path.resolve(os.tmpdir()).toLowerCase();
const inTmp = p => path.resolve(p).toLowerCase().startsWith(tmp + path.sep);

const file = path.join(process.env.APPDATA, 'Perkins', 'settings.json');
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const recent = cfg.recent || [];
const drop = recent.filter(r => inTmp(r.path));
console.log(`最近作品:共 ${recent.length} 項,移除暫存資料夾內 ${drop.length} 項`);
drop.forEach(r => console.log('  -', r.name, r.path));
if (!dry && drop.length) {
    cfg.recent = recent.filter(r => !inTmp(r.path));
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
}

const dirs = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('perkins-e2e-b-'));
console.log(`暫存資料夾殘留測試專案 ${dirs.length} 個`);
for (const n of dirs) {
    console.log('  -', n);
    if (!dry) fs.rmSync(path.join(os.tmpdir(), n), {recursive: true, force: true});
}
