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
    t('清單+斜體', html.includes('<li>清單項</li>') && html.includes('<em>斜體</em>'), html);
}
process.exit(fails ? 1 : 0);
