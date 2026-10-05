// 第 5 點(設計審查 10)單元式驗證:AI 回覆的受限 Markdown 轉換。不呼叫模型。
// 執行:cd app/frontend && node ../e2e/md-lite.test.mjs(esbuild 來自 frontend 的 node_modules)
import * as path from 'path';
import {fileURLToPath} from 'url';
import {createRequire} from 'module';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'package.json'));
const esbuild = require('esbuild');
const react = require('react');
const rds = require('react-dom/server');

const here = path.dirname(fileURLToPath(import.meta.url));

const r = await esbuild.build({entryPoints: [path.join(here, '..', 'frontend', 'src', 'lib', 'md-lite.tsx')], bundle: true, format: 'cjs', write: false, loader: {'.tsx': 'tsx'}});
const tmp = path.join(here, '..', 'frontend', 'md-lite.bundle.cjs');
(await import('fs')).writeFileSync(tmp, r.outputFiles[0].text);
const mod = require(tmp);
(await import('fs')).unlinkSync(tmp);
const el = (text) => react.createElement(mod.MdLite, {text});
let fails = 0;
const t = (name, ok, html) => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + ' => ' + (html || '').slice(0, 130)); if (!ok) fails++; };
{
    const html = rds.renderToStaticMarkup(el('建議**修改**這段:\n- 第一點\n- 第二點'));
    t('粗體', html.includes('<strong>修改</strong>'), html);
    t('清單', html.includes('<li>第一點</li>') && html.includes('<li>第二點</li>'), html);
}
{
    const html = rds.renderToStaticMarkup(el('使用 `<code>` 標記'));
    t('行內代碼且跳脫', html.includes('<code') && html.includes('&lt;code&gt;'), html);
}
{
    const html = rds.renderToStaticMarkup(el('<script>alert(1)</script>'));
    t('script 不執行/被跳脫', !html.includes('<script>'), html);
}
{
    const html = rds.renderToStaticMarkup(el('<img src=x onerror=alert(1)>**粗**'));
    t('img onerror 不執行', !html.includes('<img') && html.includes('<strong>粗</strong>'), html);
}
{
    const html = rds.renderToStaticMarkup(el('未成對 ** 星號'));
    t('未成對標記退回字面', html.includes('** 星號') && !html.includes('<strong>') && !html.includes('<em>'), html);
}
{
    const html = rds.renderToStaticMarkup(el('* 清單項\n*斜體*文字'));
    t('清單+斜體(區塊順序:li 在 em 前)', html.indexOf('<li>清單項</li>') < html.indexOf('<em>斜體</em>') && html.includes('<em>斜體</em>'), html);
}
{
    // 區塊順序(review-1b 第 2 點):清單後的一般段落不得被移到清單前
    const html = rds.renderToStaticMarkup(el('intro\n- item\nclosing'));
    const ok = html.indexOf('intro') < html.indexOf('<li>item</li>') && html.indexOf('<li>item</li>') < html.indexOf('closing');
    t('清單後段落保持順序(intro→li→closing)', ok, html);
}
{
    // 清單—段落—清單:兩份清單不得合併、段落順序正確
    const html = rds.renderToStaticMarkup(el('- first\nparagraph\n- second'));
    const liFirst = html.indexOf('<li>first</li>');
    const liSecond = html.indexOf('<li>second</li>');
    const para = html.indexOf('<p>paragraph</p>');
    const uls = html.match(/<ul/g) || [];
    const ok = uls.length === 2 && liFirst < para && para < liSecond;
    t('清單-段落-清單順序(兩份清單)', ok, html);
}
process.exit(fails ? 1 : 0);
