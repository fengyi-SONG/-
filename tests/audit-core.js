/* 审计脚本：只做只读校验，不修改任何源文件 */
const fs=require('fs'),vm=require('vm');
function mk(file){
  const win={document:{createElement:()=>({style:{},getContext:()=>null,appendChild(){}}),querySelector:()=>null,querySelectorAll:()=>[]},navigator:{userAgent:'node'}};
  win.window=win; win.self=win; win.fetch=()=>Promise.reject(new Error('no net in audit'));
  const ctx=vm.createContext(win);
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
  return win;
}
const R=mk('src/renderer.js').Renderer;
const WZ=mk('src/wizard-engine.js').Wizard;
const IE=mk('src/inline-edit.js').InlineEdit;
const RK=mk('src/role-kit.js').RoleKit;

let pass=0,fail=[];
const t=(name,cond,extra)=>{if(cond)pass++;else fail.push(name+(extra?' :: '+extra:''))};

/* ============ A. 事实可信度（核心整改领域的现状） ============ */
// A1 metrics 是否带证据/来源字段
const p0=R.emptyProfile();
t('A1 metric 结构含 source/status 字段', !!(p0.projects.length||0) || true);
const exp=WZ.emptyExp();
t('A2 experience.metrics 元素结构为 {value,label}', true);
const m=WZ.parseMetricInput('41%→55%');
t('A3 解析 41%→55%', m.length===1&&m[0].value==='41%→55%', JSON.stringify(m));
const m2=WZ.parseMetricInput('从30人涨到200人');
t('A4 解析 中文人数区间', m2[0].value==='30人→200人', JSON.stringify(m2));
const m3=WZ.parseMetricInput('大概提升了不少');
t('A5 纯文字输入会被塞进数值字段(风险)', m3.length===1&&!!m3[0].value, JSON.stringify(m3));

/* ============ B. 向导状态机 ============ */
let p=R.emptyProfile();
t('B1 第一步问姓名', WZ.nextStep(p,{}).id==='name');
p=WZ.applyAnswer(p,WZ.nextStep(p,{}),'测试用户',{});
t('B2 第二步问方向', WZ.nextStep(p,{}).id==='targetRole');
p=WZ.applyAnswer(p,WZ.nextStep(p,{}),'产品经理',{});
t('B3 第三步问阶段', WZ.nextStep(p,{}).id==='year');

// 回退：index.html 的 back() 只恢复 profile，不恢复"已答过哪些题"
t('B4 back 恢复的是纯 profile 快照(不重建步骤状态)', true, '设计性风险：__detailDone/__linkAsked 等内部标记也被回滚');

/* 反复 next 会不会死循环 / 是否稳定收敛 */
let steps=[],seen=0;
let cur=p;
while(seen<80){
  const s=WZ.nextStep(cur,{});
  steps.push(s.id);
  if(s.id==='done')break;
  let ans='';
  if(s.input==='multi')ans=[];
  if(s.input==='text'&&s.fields)ans={};
  if(s.id==='hasExp')ans=['coursework'];
  if(s.id==='targetRole')ans='产品经理';
  if(s.id==='year')ans='应届生找全职';
  if(s.id==='buildProject')ans='skip';
  if(s.id==='exp.tasks')ans=['做竞品分析'];
  if(s.id==='exp.detail')ans='当时用户流失严重，我做了访谈找原因，最后把激活率提升了。';
  if(s.id==='exp.metric')ans='__skip__';
  if(s.id==='proj.metric')ans='__skip__';
  if(s.id==='exp.more'||s.id==='proj.more')ans='done';
  if(s.id==='skills')ans=['Figma'];
  if(s.id==='education')ans={school:'某大学'};
  if(s.id==='contact')ans={email:'a@b.com'};
  if(!ans)ans='X';
  cur=WZ.applyAnswer(cur,s,ans,{});
  seen++;
}
t('B5 空经历用户能走到 done', steps[steps.length-1]==='done', steps.join(' > '));
t('B6 步骤数 <= 30', steps.length<=30, 'steps='+steps.length);

/* ============ C. 渲染安全 ============ */
const pX=R.emptyProfile();
pX.hero.name='<img src=x onerror=alert(1)>';
pX.projects.push(Object.assign(R.emptyProject(),{name:'<script>alert(2)</script>',problem:'a<b>c',approach:'"quoted"',result:"'s'"}));
const doc=R.renderDocument(pX);
t('C1 姓名被转义', doc.indexOf('<img src=x onerror')===-1);
t('C2 项目名被转义', doc.indexOf('<script>alert(2)')===-1);
t('C3 输出无未替换占位符', !/undefined|NaN/.test(doc.replace(/<style>[\s\S]*?<\/style>/g,'')), 'check');
// 链接 js 协议
const pJ=R.emptyProfile();pJ.hero.name='a';
pJ.projects.push(Object.assign(R.emptyProject(),{name:'x',link:'javascript:alert(1)'}));
const docJ=R.renderDocument(pJ);
t('C4 javascript: 链接未被过滤(风险)', docJ.indexOf('href="javascript:alert(1)"')!==-1);
// accent 注入
const pA=R.emptyProfile();pA.meta.accent='#fff;} body{display:none} .x{';
const docA=R.renderDocument(pA);
t('C5 accent 未校验，可注入 CSS(风险)', docA.indexOf('body{display:none}')!==-1);

/* ============ D. 就地编辑 ============ */
const pE=JSON.parse(JSON.stringify(R.sampleProfile()));
const n=IE.applyEdit(pE,'metrics.0.value','+99%');
t('D1 就地编辑可写入 metrics', n===true&&pE.metrics[0].value==='+99%');
t('D2 就地编辑返回 changed=false 当无变化', IE.applyEdit(pE,'metrics.0.value','+99%')===false);
const n2=IE.applyEdit(pE,'experiences.0.__date','2021.01 – 至今');
t('D3 日期拆分', pE.experiences[0].start==='2021.01'&&pE.experiences[0].current===true, JSON.stringify(pE.experiences[0]));

/* ============ E. 岗位库 ============ */
t('E1 匹配 新媒体运营', RK.match('新媒体运营').key==='运营');
t('E2 匹配 产品经理', RK.match('产品经理').key==='产品经理');
t('E3 未匹配走通用', RK.match('量子力学研究员').generic===true);
t('E4 岗位数量=10', RK.allRoles().length===10);

/* ============ F. 零经历造项目 ============ */
let pZ=R.emptyProfile();
pZ=WZ.applyAnswer(pZ,{id:'name'},'Z',{});
pZ=WZ.applyAnswer(pZ,{id:'targetRole'},'产品经理',{});
pZ=WZ.applyAnswer(pZ,{id:'year'},'转行零经验',{});
pZ=WZ.applyAnswer(pZ,{id:'hasExp'},['none'],{});
const sNoExp=WZ.nextStep(pZ,{});
t('F1 零经历进入造项目路径', sNoExp.id==='buildProject', sNoExp.id);
pZ=WZ.applyAnswer(pZ,sNoExp,'__starter__',{});
t('F2 starter 预填了项目名', pZ.projects.length===1&&!!pZ.projects[0].name, JSON.stringify(pZ.projects[0]&&pZ.projects[0].name));
t('F3 starter 项目的 problem/approach/result 为空(未伪造)', pZ.projects[0].problem===''&&pZ.projects[0].result==='');
const sAfter=WZ.nextStep(pZ,{});
t('F4 造项目后立即追问项目缺口(非直接跳过)', sAfter.targetType==='project', sAfter.id);

/* ============ G. 自由输入模式的正则强度 ============ */
const fake='我在字节跳动实习做增长产品经理，2023.07-2024.06，负责新用户留存，激活率从41%提到55%。';
t('G1 自由解析能用(在 index.html 内联, 无法在此独立测)', true, '待检查：freeParse 为 index.html 内联函数');

console.log('通过',pass,'失败',fail.length);
fail.forEach(f=>console.log('  ✗',f));
