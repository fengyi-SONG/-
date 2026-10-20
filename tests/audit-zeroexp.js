const fs=require('fs'),vm=require('vm');
function mk(file){
  const win={document:{createElement:()=>({style:{}}),querySelector:()=>null,querySelectorAll:()=>[]}};
  win.window=win;win.self=win;win.fetch=()=>Promise.reject(new Error('no net'));
  vm.runInContext(fs.readFileSync(file,'utf8'),vm.createContext(win),{filename:file});
  return win;
}
const WZ=mk('src/wizard-engine.js').Wizard, R=mk('src/renderer.js').Renderer;

/* 关键场景：选了"暂时都没有"后，向导要求填公司名 —— 零经历用户被卡死 */
let p=R.emptyProfile();
p=WZ.applyAnswer(p,{id:'name'},'Z',{});
p=WZ.applyAnswer(p,{id:'targetRole'},'产品经理',{});
p=WZ.applyAnswer(p,{id:'year'},'转行零经验',{});
p=WZ.applyAnswer(p,{id:'hasExp'},['none'],{});
console.log('[1] 零经历 hasExp 后 meta 状态:', JSON.stringify({noExp:p.meta.noExp,srcScanned:p.meta.srcScanned}));
let s=WZ.nextStep(p,{});
console.log('[1] 下一题:', s.id, '|', s.title);
p=WZ.applyAnswer(p,s,'__starter__',{});
s=WZ.nextStep(p,{});
console.log('[2] starter 后下一题:', s.id, '|', s.title, '| skippable=', s.skippable, '| targetType=', s.targetType);
console.log('    >>> 这道题就是「在哪家公司/组织」——零经历用户无话可答，且 skippable=false');

/* 再验证：只选 "none" 但用户想直接做 starter，是否被迫描述一段不存在的经历 */
console.log('[3] projects 数量:', p.projects.length, 'experiences 数量:', p.experiences.length);

/* 检查 metric 兜底：任何文字都会被当成数字 */
['大概提升了不少','效果挺好的','不知道','很多'].forEach(x=>{
  const r=WZ.parseMetricInput(x);
  console.log('[4] parseMetricInput(',JSON.stringify(x),') =>', JSON.stringify(r));
});

/* 检查"约"字：用户说约 30% 会怎么存 */
console.log('[5] 约30% =>', JSON.stringify(WZ.parseMetricInput('约30%')));
console.log('[6] 提升约30% =>', JSON.stringify(WZ.parseMetricInput('提升约30%')));
