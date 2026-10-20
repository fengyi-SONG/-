const fs=require('fs');
const src=fs.readFileSync('index.html','utf8');

function has(re,name){const ok=re.test(src);console.log((ok?'✓ 存在  ':'✗ 缺失  ')+name);}

console.log('=== 声称的功能 vs 代码实体 ===');
has(/state\.cfg&&state\.cfg\.apiKey/,'AI 设置面板（Key 输入/保存）');
has(/llmIngest/,'LLM 解析实现（interview-engine 内）');
has(/Interview/,'把 Interview 引擎接入主流程 index.html');
has(/why/,'每个问题展示"为什么问"（step.why 在渲染中被使用）');
has(/__evidence|evidence|确认状态|status/,'任何"证据/事实状态"字段');
has(/beforeunload/,'离开页面提醒（未保存内容保护）');
has(/导出.*检查|checkFacts|audit/,'导出前事实检查');
has(/删除.*数据|clearAll|purge/,'数据删除能力（含 localStorage 全清）');
has(/import|粘贴已有材料|导入/,'已有材料导入（除"一次性说"外）');
has(/saveSession|sessionList|项目列表|新建项目/,'多项目/会话保存');
has(/role.*product.*only|PM_ONLY/,'产品经理专属流程（当前是 10 岗位通用）');
console.log();
console.log('=== 关键交互对象 ===');
console.log('back() 只回退 profile:', /function back\(\)[\s\S]{0,300}state\.profile=last\.profile/.test(src));
console.log('下一步 直接丢弃未答内容:', /function next\(\)[\s\S]{0,600}applyAnswer/.test(src));
console.log('步骤无"已答记录"，回退后不会记住: hist 只存 profile 快照 ->', /state\.hist\.push\(\{profile:/.test(src));
