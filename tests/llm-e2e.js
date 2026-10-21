/**
 * llm-e2e.js — AI 润色流程端到端验证（mock 接口，不真实调用）
 * 覆盖：设置面板测试连接按钮逻辑、长文本题出现 AI 按钮、
 *       改写预览、采用后 status=assumption + by='ai'
 * 运行：NODE_PATH=<workspace>/node_modules node tests/llm-e2e.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NODE_WS = 'C:/Users/Fengyi Song/.workbuddy/binaries/node/workspace/node_modules';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 8793;
const puppeteer = require(path.join(NODE_WS, 'puppeteer-core'));

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let data;
      try { data = fs.readFileSync(path.join(ROOT, p === '/' ? 'index.html' : p)); }
      catch (e) { res.writeHead(404); res.end('nf'); return; }
      const ext = path.extname(p);
      res.writeHead(200, { 'Content-Type': ext === '.js' ? 'text/javascript' : ext === '.html' ? 'text/html' : 'application/octet-stream' });
      res.end(data);
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

let pass = 0, fail = 0;
const t = (n, c) => { c ? (pass++, console.log('  ok ' + n)) : (fail++, console.log('FAIL ' + n)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0' });

  // 统一在页面内 mock fetch（不真实调用任何接口）
  const MOCK_TEXT = '新用户注册后三天内有六成没有完成资料填写，我们判断是信任解释缺失。';
  await page.evaluate((mockText) => {
    window.__realFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (String(url).includes('/chat/completions')) {
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: mockText } }] }), { status: 200, contentType: 'application/json' }));
      }
      return window.__realFetch.apply(this, arguments);
    };
  }, MOCK_TEXT);

  // 1. FactLLM.polish：mock 成功
  const r1 = await page.evaluate(() => FactLLM.polish({ baseUrl: 'https://mock.local/v1', apiKey: 'sk-test', model: 'test' }, '用户注册后不填资料，我觉得是信任问题。'));
  t('FactLLM.polish 成功返回改写文本' + (r1.ok ? '' : '：' + r1.error), r1.ok && r1.text.includes('信任解释缺失'));

  // 2. FactLLM.polish：未配置时给出明确错误
  const r2 = await page.evaluate(() => FactLLM.polish(null, '随便'));
  t('未配置时返回明确错误', !r2.ok && /AI 设置/.test(r2.error));

  // 3. FactLLM.polish：接口报错时错误信息可用
  page.on('request', (req) => { /* noop */ });
  const r3 = await page.evaluate(async () => {
    const old = window.fetch;
    window.fetch = function () { return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('{"error":{"message":"bad key"}}') }); };
    const out = await FactLLM.polish({ baseUrl: 'https://mock.local/v1', apiKey: 'sk-bad' }, '测试文本');
    window.fetch = old;
    return out;
  });
  t('接口 401 时错误信息可读', !r3.ok && /401/.test(r3.error) && /bad key/.test(r3.error));

  // 4. 走到长文本题，出现 AI 按钮
  await page.evaluate(() => {
    const demo = {
      meta: { version: 3, track: 'pm', stage: '应届生', srcScanned: true, sources: ['coursework'], noExp: true, practice: 'starter', curProj: 0 },
      hero: { name: '测试', title: '产品经理', tagline: '', links: [] },
      projects: [{ name: '演示项目', role: '', period: '', fields: { problem: { text: '', status: 'claim' }, approach: { text: '', status: 'claim' }, result: { text: '', status: 'claim' }, context: { text: '', status: 'claim' } }, metrics: [] }],
      experiences: [], skills: { groups: [] }, education: [], extras: [],
    };
    const sess = { answers: [], cursor: -1 };
    const paths = {
      name: 'hero.name', track: 'meta.track', roleText: 'hero.title', stage: 'meta.stage',
      sourceInventory: 'meta.sources', pickPractice: 'meta.practice',
      projName: 'projects.0.name', users: 'projects.0.users',
    };
    Object.keys(paths).forEach((id) => {
      sess.answers.push({ stepId: id, targetPath: paths[id], outcome: 'answered', at: Date.now() });
    });
    sess.cursor = sess.answers.length - 1;
    localStorage.setItem('pf.profile.v3', JSON.stringify(demo));
    localStorage.setItem('pf.session.v3', JSON.stringify(sess));
    localStorage.setItem('pf.ai.v3', JSON.stringify({ baseUrl: 'https://mock.local/v1', apiKey: 'sk-test', model: 'test' }));
    location.reload();
  });
  await page.waitForNetworkIdle({ idleTime: 400 });
  // reload 会重置页面内 mock，重装
  await page.evaluate((mockText) => {
    window.__realFetch = window.fetch;
    window.fetch = function (url) {
      if (String(url).includes('/chat/completions')) {
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: mockText } }] }), { status: 200, contentType: 'application/json' }));
      }
      return window.__realFetch.apply(this, arguments);
    };
  }, MOCK_TEXT);
  const stepId = await page.evaluate(() => { window.__PF.goNext(); return window.__PF.state.step && window.__PF.state.step.id; });
  t('走到长文本题 problem（实际：' + stepId + '）', stepId === 'problem');
  t('配置了 AI 后长文本题出现「让 AI 帮我改写」按钮', !!(await page.$('#btnAiPolish')));

  // 5. 填入原文，点 AI 按钮 → 预览弹窗出现
  await page.evaluate(() => {
    document.querySelector('#textInp').value = '用户注册之后没有填资料，我觉得应该是他们不信任我们，所以就不填了。';
    document.querySelector('#textInp').dispatchEvent(new Event('input'));
  });
  await page.click('#btnAiPolish');
  await sleep(400);
  t('预览弹窗打开', await page.$eval('#mPolish', (el) => el.classList.contains('on')));
  const newText = await page.$eval('#polNew', (el) => el.textContent);
  t('预览显示 mock 改写结果', newText.includes('信任解释缺失'));

  // 6. 采用 → textarea 更新、aiUsed 标记
  await page.click('#btnPolUse');
  await sleep(100);
  const taVal = await page.$eval('#textInp', (el) => el.value);
  t('采用后文本框替换为 AI 版本', taVal.includes('信任解释缺失'));
  t('state.aiUsed 已标记', (await page.evaluate(() => window.__PF.state.aiUsed)) === 'problem');

  // 7. 提交 → 字段状态为 assumption + by:'ai'
  await page.evaluate(() => { window.__PF.state.outcome = "answered"; window.__PF.next(); });
  await sleep(100);
  const field = await page.evaluate(() => JSON.parse(localStorage.getItem('pf.profile.v3')).projects[0].fields.problem);
  t(`提交后 problem 状态为 assumption（实际 ${field.status}）`, field.status === 'assumption');
  t(`by 标记为 ai（实际 ${field.by}）`, field.by === 'ai');

  // 8. 该条出现在事实检查清单（assumption 可被用户确认）
  const inLedger = await page.evaluate(() => window.FactCore.buildLedger(JSON.parse(localStorage.getItem('pf.profile.v3')))
    .items.some((i) => i.ref === 'projects.0.problem' && i.status === 'assumption'));
  t('AI 润色的内容进入事实检查清单（未验证）', inLedger);

  // 9. 无 JS 错误
  t('无页面 JS 错误' + (errors.length ? '：' + errors[0] : ''), errors.length === 0);

  await browser.close();
  srv.close();
  console.log(`\n通过 ${pass} 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E 运行失败：', e); process.exit(1); });
