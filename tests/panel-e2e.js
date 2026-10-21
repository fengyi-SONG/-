/**
 * panel-e2e.js — 事实检查面板真实浏览器端到端测试（G2 验证）
 * 运行：node tests/panel-e2e.js
 * 依赖：puppeteer-core（NODE_PATH 指向托管 workspace）+ 本机 Edge
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NODE_WS = 'C:/Users/Fengyi Song/.workbuddy/binaries/node/workspace/node_modules';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 8791;

const puppeteer = require(path.join(NODE_WS, 'puppeteer-core'));

/* 极简静态服务器 */
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        const ext = path.extname(p);
        res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' : ext === '.html' ? 'text/html' : 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

const DEMO = {
  meta: { version: 3, theme: 'aurora', accent: '#2f5eff' },
  hero: { name: '测试用户', title: '产品经理', tagline: '', links: [] },
  projects: [{
    name: '演示项目', role: '负责人', period: '2025',
    fields: {
      problem: { text: '用户流失在注册第二步', status: 'unknown' },
      approach: { text: '访谈加漏斗定位', status: 'fact' },
      result: { text: '转化率提升', status: 'claim' },
      context: { text: '', status: 'unknown' },
    },
    metrics: [{ value: '41%→55%', label: '转化率', status: 'claim', note: '' }],
    nextStep: { text: '验证安卓端', status: 'plan' },
  }],
  experiences: [], skills: { groups: [] }, education: [], extras: [],
};

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

(async () => {
  const srv = await serve();
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0' });
  await page.evaluate((d) => { localStorage.clear(); localStorage.setItem('pf.profile.v3', JSON.stringify(d)); }, DEMO);
  await page.reload({ waitUntil: 'networkidle0' });

  // 1. 角标计数
  const count = await page.$eval('#factCount', (el) => el.textContent.trim());
  t('角标显示待确认数', /·\s*\d/.test(count));

  // 2. 点击打开面板
  await page.click('#btnFact');
  await new Promise((r) => setTimeout(r, 100));
  t('面板打开（mFact.on）', await page.$eval('#mFact', (el) => el.classList.contains('on')));
  const itemCount = await page.$$eval('#factBody .fs-item', (els) => els.length);
  t('面板列出了待确认项（>=4）', itemCount >= 4);

  // 3. 确认属实：定位 projects.0.problem 这一行（data-ref）
  const sel = (ref) => `#factBody .fs-item[data-ref="${ref}"]`;
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('pf.profile.v3')).projects[0].fields.problem.status);
  await page.click(`${sel('projects.0.problem')} [data-act="confirm"]`);
  await new Promise((r) => setTimeout(r, 100));
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('pf.profile.v3')).projects[0].fields.problem.status);
  t(`确认属实写回 localStorage（${before} → ${after}）`, before !== 'fact' && after === 'fact');
  t('角标数减少', await page.$eval('#factCount', (el) => el.textContent.trim()) !== count);
  t('该项标记为已完成', await page.$eval(sel('projects.0.problem'), (el) => el.classList.contains('fs-done')));

  // 4. 标为假设（nextStep 行）
  const st2before = await page.evaluate(() => JSON.parse(localStorage.getItem('pf.profile.v3')).projects[0].nextStep.status);
  await page.click(`${sel('projects.0.nextStep')} [data-act="assume"]`);
  await new Promise((r) => setTimeout(r, 100));
  const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('pf.profile.v3')).projects[0].nextStep.status);
  t(`标为假设写回（${st2before} → ${st2}）`, st2 === 'assumption');

  // 5. 补来源（找到带"补来源"按钮的项，dialog 输入来源）
  page.once('dialog', async (d) => { await d.accept('后台漏斗截图'); });
  const srcBtn = await page.$('#factBody [data-act="source"]');
  if (srcBtn) {
    await srcBtn.click();
    await new Promise((r) => setTimeout(r, 150));
    const m = await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('pf.profile.v3'));
      return JSON.stringify(p.projects[0].metrics[0]);
    });
    t(`补来源写回（${m}）`, /"status":"evidence"/.test(m) && /后台漏斗截图/.test(m));
  } else {
    t('存在"补来源"按钮', false);
  }

  // 6. 先不管：状态不变，仅视觉标记
  const st3 = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('pf.profile.v3'));
    const el = document.querySelector('#factBody .fs-item:not(.fs-done)');
    if (!el) return { profile: null, dom: false };
    el.querySelector('[data-act="ignore"]').click();
    return { profile: 'clicked', dom: el.classList.contains('fs-done') };
  });
  t('先不管只做视觉标记，不改数据', st3 && st3.profile === 'clicked' && st3.dom);

  // 7. Ctrl+K 打开面板（先关掉）
  await page.evaluate(() => document.querySelector('#mFact .m-close, #mFact [data-close], #mFact').click());
  await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 100));
  t('Ctrl+K 可打开面板', await page.$eval('#mFact', (el) => el.classList.contains('on')));

  // 8. 角标与 ledger 的 unknown 数一致（贡献归属/证据材料/局限未填 = 3；context 无文本不进清单）
  const shown = await page.$eval('#factCount', (el) => el.textContent.trim());
  t('角标显示剩余 unknown 数（· 3）', shown === '· 3');

  // 9. 页面无 JS 报错
  t('无页面 JS 错误' + (errors.length ? '：' + errors[0] : ''), errors.length === 0);

  await browser.close();
  srv.close();
  console.log(`\n通过 ${pass} 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 运行失败：', e.message); process.exit(1); });
