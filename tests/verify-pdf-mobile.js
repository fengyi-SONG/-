/**
 * verify-pdf-mobile.js — G3（PDF 分页/中文）+ G4（移动端 375px）验证
 * 产出：
 *   .preview/pdf-print-a4.pdf          打印路径（@page CSS）导出的 A4
 *   .preview/mobile-375.png            移动端首屏截图
 *   控制台输出分页数与横向溢出检查结果
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const NODE_WS = 'C:/Users/Fengyi Song/.workbuddy/binaries/node/workspace/node_modules';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 8792;
const puppeteer = require(path.join(NODE_WS, 'puppeteer-core'));

/* 离线渲染完整示例 profile（含 3 个项目的长文档） */
function buildStandaloneHtml() {
  const code = fs.readFileSync(path.join(ROOT, 'src/renderer.js'), 'utf8');
  const sandbox = { console };
  sandbox.window = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const demo = sandbox.Renderer.sampleProfile();
  demo.projects.push(JSON.parse(JSON.stringify(demo.projects[0])));
  demo.projects[2].name = '数据看板搭建（第三个项目，用于撑长文档）';
  demo.projects[2].metrics[0].status = 'claim';
  demo.projects[2].nextStep = { text: '下一迭代验证安卓端结论', status: 'plan' };
  demo.projects[2].contribution = { self: 'owner', detail: '独立完成指标定义与看板原型', status: 'fact' };
  demo.meta.showMotion = false;
  return sandbox.Renderer.renderDocument(demo, { motion: false })
    .replace('</head>', '<style>.reveal{opacity:1 !important;transform:none !important}</style></head>');
}

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let data;
      if (p === '/standalone.html') data = Buffer.from(HTML, 'utf8');
      else {
        try { data = fs.readFileSync(path.join(ROOT, p === '/' ? 'index.html' : p)); }
        catch (e) { res.writeHead(404); res.end('nf'); return; }
      }
      const ext = path.extname(p);
      res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' : ext === '.html' ? 'text/html' : 'application/octet-stream' });
      res.end(data);
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

let pass = 0, fail = 0;
const t = (n, c) => { c ? (pass++, console.log('  ok ' + n)) : (fail++, console.log('FAIL ' + n)); };
const HTML = buildStandaloneHtml();
fs.writeFileSync(path.join(ROOT, '.preview', 'standalone.html'), HTML);

(async () => {
  const srv = await serve();
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });

  /* ---------- G3：PDF ---------- */
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/standalone.html`, { waitUntil: 'networkidle0' });
  const pdfPath = path.join(ROOT, '.preview', 'pdf-print-a4.pdf');
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  const buf = fs.readFileSync(pdfPath);
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  t(`PDF 已生成（${(buf.length / 1024).toFixed(0)} KB，${pages} 页）`, pages >= 2);
  t('长文档分页数在合理范围（2-12 页）', pages >= 2 && pages <= 12);
  // 中文内容存在性：PDF 内容流是压缩的，改为检查源 HTML 里的中文与字体声明
  t('源文档包含中文字体声明（PingFang/雅黑）', /PingFang|Microsoft YaHei|Source Han/.test(HTML));
  await page.close();

  /* ---------- G4：移动端 375px ---------- */
  const m = await browser.newPage();
  await m.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  const errs = [];
  m.on('pageerror', (e) => errs.push(e.message));
  await m.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0' });
  // 无数据时的向导界面
  const overflowWizard = await m.evaluate(() => ({
    doc: document.scrollingElement.scrollWidth - document.documentElement.clientWidth,
  }));
  t(`向导界面无横向溢出（超出 ${overflowWizard.doc}px）`, overflowWizard.doc <= 1);
  await m.screenshot({ path: path.join(ROOT, '.preview', 'mobile-375-wizard.png') });

  // 有数据后的预览界面
  await m.evaluate(() => {
    localStorage.setItem('pf.profile.v3', JSON.stringify({
      meta: { version: 3 }, hero: { name: '测试', title: '产品经理', tagline: '测试一句话', links: [] },
      projects: [{ name: '项目A', role: '负责人', period: '2025', fields: { problem: { text: '问题', status: 'fact' }, approach: { text: '做法', status: 'fact' }, result: { text: '结果', status: 'claim' }, context: { text: '背景', status: 'fact' } }, metrics: [{ value: '10%', label: '增长', status: 'claim' }] }],
      experiences: [], skills: { groups: [] }, education: [], extras: [],
    }));
    location.reload();
  });
  await m.waitForNetworkIdle({ idleTime: 500 });
  const overflowApp = await m.evaluate(() => {
    const bad = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > document.documentElement.clientWidth + 2 && r.width > 20) {
        const cls = (el.className && typeof el.className === 'string') ? el.className.split(' ')[0] : el.tagName;
        if (!bad.includes(cls)) bad.push(cls);
      }
    });
    return { doc: document.scrollingElement.scrollWidth - document.documentElement.clientWidth, bad: bad.slice(0, 8) };
  });
  t(`预览界面无横向溢出（超出 ${overflowApp.doc}px）`, overflowApp.doc <= 1);
  if (overflowApp.bad.length) console.log('  溢出元素：', overflowApp.bad.join(', '));
  await m.screenshot({ path: path.join(ROOT, '.preview', 'mobile-375-preview.png') });
  t('移动端无 JS 错误' + (errs.length ? '：' + errs[0] : ''), errs.length === 0);
  await m.close();

  await browser.close();
  srv.close();
  console.log(`\n通过 ${pass} 失败 ${fail}`);
  console.log('PDF 在：.preview/pdf-print-a4.pdf（请人工目检中文与分页断点）');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('运行失败：', e); process.exit(1); });
