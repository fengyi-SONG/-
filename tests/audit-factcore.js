const fs=require('fs'),vm=require('vm');
const win={};win.window=win;win.globalThis=win;
vm.runInContext(fs.readFileSync('src/fact-core.js','utf8'),vm.createContext(win),{filename:'fact-core.js'});
const FC=win.FactCore;
let pass=0,fail=[];
const t=(n,c,x)=>{if(c)pass++;else fail.push(n+(x?' :: '+x:''))};

/* 解析收紧 */
console.log('--- parseMetric ---');
['不知道','效果挺好的','很多','大概提升了不少','2023'].forEach(s=>{
  const r=FC.parseMetric(s);
  console.log(JSON.stringify(s),'=> ok:',r.ok,'reason:',r.reason,'metrics:',JSON.stringify(r.metrics));
  t('非数字不产出指标: '+s, r.ok===false && r.metrics.length===0, r.reason);
});
const r1=FC.parseMetric('41%→55%');
t('区间解析', r1.ok&&r1.metrics[0].value==='41%→55%', JSON.stringify(r1));
const r2=FC.parseMetric('从30人涨到200人');
t('中文区间', r2.ok&&r2.metrics[0].value==='30人→200人', JSON.stringify(r2));
const r3=FC.parseMetric('提升约30%');
console.log('提升约30% =>',JSON.stringify(r3));
t('约 保留为估算标记', r3.ok&&/估算/.test(r3.metrics[0].note)&&r3.hedged===true, JSON.stringify(r3.metrics[0]));
t('新指标默认 claim', r3.metrics[0].status==='claim');
const r4=FC.parseMetric('+14pt');
t('单值带符号', r4.ok&&r4.metrics[0].value==='+14pt', JSON.stringify(r4.metrics));

/* 守卫 */
console.log('--- 守卫 ---');
try{FC.assertClaim({status:'fact',by:'ai'},'t');t('AI 不得标 fact',false)}catch(e){t('AI 不得标 fact',true)}
try{FC.assertClaim({text:'x'},'t');t('缺 status 抛错',false)}catch(e){t('缺 status 抛错',true)}
const c=FC.ensureClaim({status:'fact',by:'ai'});
t('AI 的 fact 被降级为 assumption', c.status==='assumption', c.status);

/* 迁移 */
console.log('--- v2 迁移 ---');
const v2={meta:{version:2,theme:'noir'},hero:{name:'张三'},
  metrics:[{value:'+38%',label:'转化'}],
  experiences:[{company:'A',metrics:[{value:'+7pt',label:'留存'}],highlights:['做了X']}],
  projects:[{name:'P',problem:'问题',approach:'做法',result:'结果',metrics:[{value:'×1.6',label:'产出'}]}]};
const mig=FC.migrate(v2);
t('版本升到 3', mig.profile.meta.version===3);
t('旧指标补 status=claim', mig.profile.metrics[0].status==='claim');
t('项目补 contribution 且默认 unknown', mig.profile.projects[0].contribution.self==='unknown');
t('项目补 evidenceList 空数组', Array.isArray(mig.profile.projects[0].evidenceList)&&mig.profile.projects[0].evidenceList.length===0);
t('项目 fields 状态就位', mig.profile.projects[0].fields.problem.status==='claim');
t('幂等：再迁一次不变', JSON.stringify(FC.migrate(JSON.parse(JSON.stringify(mig.profile))).profile)===JSON.stringify(mig.profile));

/* 事实清单 */
console.log('--- ledger ---');
const led=FC.buildLedger(mig.profile);
console.log('summary:',JSON.stringify(led.summary));
console.log('前3条:',led.items.slice(0,3).map(i=>i.status+'|'+i.kind+'|'+i.text.slice(0,30)));
t('ledger 能列出待补项', led.items.length>0);
t('unknown 排在前面', led.items[0].status==='unknown', led.items[0].status);
t('pendingCount = unknown 数', FC.pendingCount(mig.profile)===led.summary.unknown);

console.log('\n通过',pass,'失败',fail.length);
fail.forEach(f=>console.log('  ✗',f));
