/* T3 验证：role-kit practice + playbook 结构与选择逻辑 */
var fs = require('fs'), vm = require('vm');
var sandbox = { console: console };
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../src/role-kit.js', 'utf8'), sandbox);
var RK = sandbox.RoleKit;

var pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

// practice 练习路径
var pm = RK.match('产品经理');
t('PM kit 有 practice', !!(pm.kit && pm.kit.practice));
t('practice 有 title/duration/output/steps', ['title', 'duration', 'output', 'steps', 'evidence'].every(function (k) { return pm.kit.practice[k]; }));
t('practice steps >= 3', pm.kit.practice.steps.length >= 3);
t('AI产品经理 命中 PM kit（含 practice）', RK.match('AI 产品经理').kit.practice != null);

// playbook 结构
var cards = pm.kit.playbooks || [];
t('PM kit 有 >=4 张方法论卡', cards.length >= 4);
t('每卡 7 问齐全', cards.every(RK.playbookOk));

// 选择逻辑
t('analysis + data 证据 → 漏斗卡', RK.playbook('analysis', ['data'], '产品经理').id === 'funnel');
t('analysis + interview 证据 → 访谈卡', RK.playbook('analysis', ['interview'], '产品经理').id === 'interview');
t('analysis + none → 兜底访谈卡', RK.playbook('analysis', ['none'], '产品经理').id === 'interview');
t('approach → 取舍卡', RK.playbook('approach', [], '产品经理').id === 'tradeoff');
t('metrics → 指标口径卡', RK.playbook('metrics', [], '产品经理').id === 'metric');
t('其他岗位（无 playbooks）→ null', RK.playbook('analysis', ['data'], '教师') === null);
t('未知 stepId → null', RK.playbook('users', [], '产品经理') === null);

console.log('\n通过 ' + pass + ' 失败 ' + fail);
process.exit(fail ? 1 : 0);
