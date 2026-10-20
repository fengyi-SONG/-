/**
 * flow-test.js  ·  T2 验收：零经历路径、跳过记忆、回退一致性
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

function load(files) {
  const win = {};
  win.window = win; win.globalThis = win;
  win.URL = URL;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.console = console;
  const ctx = vm.createContext(win);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  return win;
}

const W = load(['src/fact-core.js', 'src/role-kit.js', 'src/flow-engine.js']);
const FC = W.FactCore, Flow = W.Flow, RK = W.RoleKit;

let pass = 0, fail = [];
const t = (n, c, x) => { if (c) pass++; else fail.push(n + (x ? ' :: ' + x : '')); };

/* ---------- 通用驱动器 ---------- */
function drive(answers, opts) {
  opts = opts || {};
  let p = opts.profile || FC.migrate({}).profile;
  let s = Flow.emptySession();
  const trace = [];
  for (let i = 0; i < 200; i++) {
    const st = Flow.nextStep(p, s);
    if (!st) break;
    trace.push(st.id);
    let a = '';
    const rule = answers[st.id];
    if (typeof rule === 'function') a = rule(st, p);
    else if (rule !== undefined) a = rule;
    else if (st.input === 'multi') a = [];
    else if (st.input === 'text' && st.fields) a = { school: '某大学' };
    if (st.id === 'review') a = '';
    // 模拟"跳过"标记
    let outcome = 'answered';
    if (a === '__skip__') { outcome = 'skipped'; a = ''; }
    p = Flow.applyAnswer(p, st, a, outcome);
    s = Flow.record(s, st, outcome, st.path);
  }
  return { p, s, trace };
}

/* ================= 1. 零经历路径：不得出现任何经历追问 ================= */
console.log('--- 1. 零经历路径 ---');
const zero = drive({
  name: '测试',
  track: 'pm',
  roleText: 'AI 产品经理',
  stage: '转行',
  sourceInventory: ['none'],
  pickPractice: 'starter',
  projName: 'X',
  users: { who: '校园用户', scale: '没有真实用户' },
  problem: 'P',
  evidence: ['none'],
  analysis: 'A',
  approach: 'AP',
  alternatives: '__skip__',
  contribution: { self: '访谈和原型都是我自己做的' },
  result: '只做到高保真原型',
  validation: ['none'],
  metrics: '__skip__',
  limitations: '样本只有 5 人',
  nextStep: '推给 200 个真实用户',
  evidenceList: '3 份访谈记录、Figma 原型',
  projMore: 'done',
  skills: ['Figma'],
  education: { school: '某大学' },
  contact: { email: 'a@b.com' },
  review: '',
});
console.log('步骤序列:', zero.trace.join(' > '));
t('零经历全程不出现 expOrg', zero.trace.indexOf('expOrg') === -1);
t('零经历全程不出现 expRole', zero.trace.indexOf('expRole') === -1);
t('零经历全程不出现 expTime', zero.trace.indexOf('expTime') === -1);
t('零经历全程不出现 expDetail', zero.trace.indexOf('expDetail') === -1);
t('零经历能走完（走到 review）', zero.trace[zero.trace.length - 1] === 'review', zero.trace[zero.trace.length - 1]);
t('steps 数量合理 (<40)', zero.trace.length < 40, String(zero.trace.length));

/* ================= 2. 事实状态真的落盘了 ================= */
console.log('--- 2. 状态落盘 ---');
const P0 = zero.p.projects[0];
t('project 存在', !!P0);
t('problem 状态=assumption（用户选了"没有证据"）', P0.fields.problem.status === 'assumption', P0.fields.problem.status);
t('result 状态=assumption（只做到原型 + 无验证）', P0.fields.result.status === 'assumption', P0.fields.result.status);
t('nextStep 状态=plan', P0.nextStep.status === 'plan', P0.nextStep.status);
t('contribution 不是 solo（用户没写全部自己做的）', P0.contribution.self === 'partial', P0.contribution.self);
t('evidenceList 已拆分为数组', P0.evidenceList.length === 2, JSON.stringify(P0.evidenceList));
t('metrics 为空（用户跳过且未编造）', P0.metrics.length === 0);
t('__metricNote 记录了原因', /没有可量化/.test(P0.__metricNote || ''), P0.__metricNote);

/* ================= 3. 跳过 = 未解决，不是永久丢失 ================= */
console.log('--- 3. 跳过记忆 ---');
const gaps = Flow.openGaps(zero.s);
console.log('未解决项:', gaps.map(g => g.stepId).join(', '));
t('跳过的 alternatives 出现在缺口清单', gaps.some(g => g.stepId === 'alternatives'));
t('跳过的 metrics 出现在缺口清单', gaps.some(g => g.stepId === 'metrics'));
t('已回答的 problem 不在缺口清单', !gaps.some(g => g.stepId === 'problem'));

/* ================= 4. 同一个 nextStep 不会重复问已答项 ================= */
console.log('--- 4. 幂等 ---');
const st1 = Flow.nextStep(zero.p, zero.s);
t('全部答完后 nextStep 返回 null', st1 === null, st1 && st1.id);

/* ================= 5. 用户后来补了跳过的内容 → 不再问 ================= */
console.log('--- 5. 补答 ---');
let p5 = JSON.parse(JSON.stringify(zero.p));
let s5 = JSON.parse(JSON.stringify(zero.s));
p5.meta.reviewed = false;          // 回到 review 之前
p5.projects[0].metrics = [{ value: '5 人', label: '测试人数', status: 'claim', source: '测试记录', by: 'user' }];
const st5 = Flow.nextStep(p5, s5);
t('补了 metrics 后直接进 review', st5 && st5.id === 'review', st5 && st5.id);

/* ================= 6. 回退：问题序列可复现 ================= */
console.log('--- 6. 回退 ---');
let p6 = FC.migrate({}).profile, s6 = Flow.emptySession();
const seq1 = [];
for (let i = 0; i < 6; i++) {
  const st = Flow.nextStep(p6, s6);
  seq1.push(st.id);
  p6 = Flow.applyAnswer(p6, st, { name: '张三', track: 'pm', roleText: 'PM', stage: '应届生', sourceInventory: ['coursework'], projName: 'P' }[st.id] || 'x', 'answered');
  s6 = Flow.record(s6, st, 'answered', st.path);
}
console.log('前 6 步:', seq1.join(' > '));
const u = Flow.undo(p6, s6);
t('undo 成功', u.ok === true);
t('undo 后 answers 少一条', u.session.answers.length === s6.answers.length - 1);
const backStep = Flow.nextStep(u.profile, u.session);
t('undo 后问题序列可复现（回到任意已答项都合法）',
  backStep && seq1.indexOf(backStep.id) !== -1,
  backStep && backStep.id);
t('undo 后 answers 长度与 step 数一致', u.session.answers.length === seq1.length - 1,
  u.session.answers.length + ' vs ' + (seq1.length - 1));

/* ================= 7. 有实习的 PM 走向：经历可选，不阻断 ================= */
console.log('--- 7. 有实习的 PM ---');
const withExp = drive({
  name: '李四', track: 'pm', roleText: '产品经理', stage: '有实习',
  sourceInventory: ['internship'],
  projName: '实习项目', users: { who: '新用户' }, problem: 'P',
  evidence: ['data', 'interview'], analysis: 'A', approach: 'AP',
  alternatives: '不做 X', contribution: { self: '全部是我做的' },
  result: '上线了，激活率 41%→55%', validation: ['postlaunch'],
  metrics: '41%→55%', limitations: '样本偏小', nextStep: '扩量',
  evidenceList: '漏斗截图', projMore: 'done',
  skills: ['Figma'], education: { school: 'U' }, contact: { email: 'e@x.com' }, review: '',
});
const PW = withExp.p.projects[0];
t('有真实证据 → problem=evidence', PW.fields.problem.status === 'evidence', PW.fields.problem.status);
t('有上线数据 → result=evidence', PW.fields.result.status === 'evidence', PW.fields.result.status);
t('数字被解析且默认 claim', PW.metrics.length === 1 && PW.metrics[0].value === '41%→55%' && PW.metrics[0].status === 'claim', JSON.stringify(PW.metrics));
t('写了"全部是我做的" → solo', PW.contribution.self === 'solo', PW.contribution.self);

/* ================= 8. 数字造假防线 ================= */
console.log('--- 8. 指标防线 ---');
const fakeRun = drive({
  name: '王五', track: 'pm', roleText: 'PM', stage: '应届生', sourceInventory: ['coursework'],
  projName: 'P', users: { who: 'x' }, problem: 'P', evidence: ['none'], analysis: 'A',
  approach: 'AP', alternatives: 'x', contribution: { self: 'x' }, result: '效果很好',
  validation: ['none'], metrics: '不知道', limitations: 'x', nextStep: 'x',
  evidenceList: '', projMore: 'done', skills: [], education: { school: 'U' },
  contact: { email: 'e@x' }, review: '',
});
t('"不知道"不会被写成指标', fakeRun.p.projects[0].metrics.length === 0, JSON.stringify(fakeRun.p.projects[0].metrics));
t('给出原因说明', /没有数字/.test(fakeRun.p.projects[0].__metricNote || ''), fakeRun.p.projects[0].__metricNote);

/* ================= 9. 非 PM 基础流程仍能走 ================= */
console.log('--- 9. 基础流程 ---');
const basic = drive({
  name: '赵六', track: 'basic', roleText: '运营', stage: '应届生',
  sourceInventory: ['club'],
  expOrg: '校学生会', expRole: '干事', expTime: '2023.09—2024.06',
  expDetail: '组织了一场活动，来了 200 人，是我第一次独立做完整流程。',
  expMore: 'done',
  projName: '活动项目', users: { who: '学生' }, problem: 'P', approach: 'AP',
  contribution: { self: 'x' }, result: 'R', projMore: 'done',
  skills: [], education: { school: 'U' }, contact: { email: 'e' }, review: '',
});
console.log('基础流程序列:', basic.trace.join(' > '));
t('基础流程包含经历题', basic.trace.indexOf('expOrg') !== -1);
t('基础流程能走完', basic.trace[basic.trace.length - 1] === 'review', basic.trace[basic.trace.length - 1]);

/* ================= 10. 事实清单 ================= */
console.log('--- 10. ledger ---');
const led = FC.buildLedger(zero.p);
console.log('ledger summary:', JSON.stringify(led.summary));
t('零项目能产出待确认清单', led.items.length > 0);
t('assumption 项被列出', led.summary.assumption > 0, String(led.summary.assumption));
t('contribution 已处理（是 partial，不应重复列为缺口）',
  !led.items.some(i => i.kind === '贡献归属'),
  led.items.map(i => i.kind).join(','));

console.log('\n通过 ' + pass, '失败 ' + fail.length);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
