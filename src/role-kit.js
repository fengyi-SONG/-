/**
 * role-kit.js
 * 岗位工具箱知识库
 *
 * 用途：用户说"我想做产品经理"，AI 不是干巴巴地问"你用了什么工具"，
 * 而是直接给出该岗位常用的工具/方法/指标清单让用户勾选——零基础用户也能被"带起来"。
 *
 * 每个岗位包含：
 *   tools    常用工具（勾选后进技能区）
 *   methods  方法论 / 工作动作
 *   metrics  该岗位常用的量化指标（追问数字时给例子）
 *   tasks    典型工作内容（用于引导"你做过什么"）
 *   starter  零经历用户的起点建议（课程项目/自学作品怎么做）
 */
(function (global) {
  'use strict';

  var KITS = {
    '产品经理': {
      aliases: ['产品', 'pm', '产品经理', '产品助理', '产品实习生', 'product'],
      tools: ['Axure', 'Figma', '墨刀', 'MasterGo', 'Jira', 'Confluence', '飞书多维表格', 'Xmind', 'ProcessOn', 'Mixpanel', '神策', 'GrowingIO', 'SQL', 'Tableau'],
      methods: ['需求调研与访谈', '用户画像', '竞品分析', 'PRD 撰写', '原型设计', '敏捷开发 / Scrum', 'MVP 验证', 'A/B 实验设计', '数据埋点设计', '用户旅程地图'],
      metrics: ['日活 / 月活（DAU / MAU）', '留存率', '转化率', '页面访问深度', '任务完成率', 'NPS', '需求上线周期'],
      tasks: ['写需求文档并跟进开发上线', '做竞品分析', '设计原型和交互流程', '分析用户数据找问题', '和设计、开发对齐排期'],
      starter: '没有实习经历？做一个"产品分析作业"：挑一个你常用的 App，写一份 3 页的产品分析（用户是谁 / 解决了什么问题 / 有什么可以改进），这本身就是可展示的项目。',
    },
    '运营': {
      aliases: ['运营', '内容运营', '用户运营', '活动运营', '社群运营', '新媒体', '增长'],
      tools: ['飞书', 'Excel / 数据透视表', '微信公众号后台', '小红书创作平台', '抖音创作者中心', 'Canva', '剪映', '人人秀 / 易企秀', '微伴助手', '新榜', '千瓜'],
      methods: ['内容选题策划', '活动全流程落地', '用户分层运营', '社群 SOP 搭建', '私域流量运营', '数据复盘', 'AB 测试文案', 'KOL 合作'],
      metrics: ['阅读量 / 播放量', '涨粉数', '转化率', '活动参与人数', '留存率', '复购率', 'ROI', '曝光量'],
      tasks: ['策划并落地一场活动', '写公众号 / 小红书内容', '维护社群、做用户答疑', '做数据复盘报告', '对接 KOL 或合作方'],
      starter: '零经历也能做：自己开一个账号，连续发 10 篇内容，记录每篇的数据变化和你的调整思路。这就是一个真实的"从 0 到 1 内容运营"项目。',
    },
    '数据分析': {
      aliases: ['数据', '数据分析', '数据分析师', '商业分析', 'bi', '数据运营'],
      tools: ['SQL', 'Python（pandas）', 'Excel / 数据透视表', 'Tableau', 'Power BI', '神策', 'Google Analytics', 'R', 'Hive', 'Metabase'],
      methods: ['漏斗分析', '同期群分析（Cohort）', '归因分析', 'A/B 测试', '指标体系搭建', '数据清洗', '可视化看板搭建', '假设检验'],
      metrics: ['转化率', '留存率', 'ARPU', 'GMV', '同比 / 环比', '异常波动幅度', '模型准确率'],
      tasks: ['写 SQL 取数并分析', '搭建业务看板', '做专题分析报告', '排查数据异常', '为业务方提供决策支持'],
      starter: '去 Kaggle 或和鲸社区找一个公开数据集，完整做一次分析（提出问题 → 清洗 → 分析 → 可视化 → 结论），写成一份报告。这是数据分析岗最标准的入门作品。',
    },
    '设计师': {
      aliases: ['设计', 'ui', 'ux', '交互设计', '视觉设计', '平面设计', '设计师', 'design'],
      tools: ['Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator', 'After Effects', 'Principle', 'MasterGo', 'Procreate'],
      methods: ['用户访谈', '信息架构', '线框图', '高保真原型', '设计规范 / Design System', '可用性测试', '竞品视觉分析', '组件化设计'],
      metrics: ['任务完成率', '操作路径步数', '可用性测试通过率', '设计交付效率', '组件复用率'],
      tasks: ['从需求到高保真稿的完整设计', '搭建组件库', '做可用性测试并迭代', '和开发对接还原度', '改版现有页面'],
      starter: '设计岗看作品集最重：做 2-3 个完整 case study（问题 → 调研 → 方案 → 迭代 → 最终稿），哪怕是自己虚构的题目。千万不要只放效果图。',
    },
    '开发工程师': {
      aliases: ['开发', '前端', '后端', '工程师', '程序员', '算法', 'dev', 'software'],
      tools: ['Git / GitHub', 'VS Code', 'Docker', 'Postman', 'Linux', 'MySQL / PostgreSQL', 'Redis', 'React / Vue', 'Node.js / Python / Java', 'Nginx'],
      methods: ['需求拆解', '接口设计', '单元测试', '代码评审（Code Review）', '性能优化', 'CI/CD', '技术方案设计', '线上问题排查'],
      metrics: ['接口响应时间', 'QPS', '代码覆盖率', '线上故障数', '构建时长', '页面加载速度'],
      tasks: ['独立完成一个功能模块', '设计并实现接口', '优化性能瓶颈', '排查并修复线上问题', '参与技术方案评审'],
      starter: '做一个能跑起来的完整项目（有前端有后端、能部署上线），把 GitHub 链接放上去。比任何描述都有说服力。',
    },
    '市场 / 品牌': {
      aliases: ['市场', '品牌', 'marketing', '公关', 'pr', '广告'],
      tools: ['微信公众号', '微博', '小红书', '抖音', 'Canva', 'PS', '百度指数', '巨量算数', '新榜', 'Google Analytics'],
      methods: ['品牌定位', '整合营销传播（IMC）', '媒介投放', '内容营销', '事件营销', '竞品监测', '用户调研', 'ROI 分析'],
      metrics: ['曝光量', '互动率', '声量增长', '投放 ROI', '获客成本（CAC）', '品牌搜索指数'],
      tasks: ['策划品牌 campaign', '管理社媒账号矩阵', '对接媒体和 KOL', '做投放效果复盘', '输出竞品监测报告'],
      starter: '为一个小品牌（或虚拟品牌）做一份完整的营销方案：定位、目标人群、内容策略、渠道组合、预算与预期效果。',
    },
    '人力资源': {
      aliases: ['hr', '人力', '人力资源', '招聘', 'recruit'],
      tools: ['Boss 直聘 / 猎聘', '北森', 'Moka', '飞书人事', 'Excel', '问卷星', '智联招聘'],
      methods: ['JD 撰写', '简历筛选', '结构化面试', '人才盘点', '员工关系处理', '培训体系搭建', '雇主品牌建设'],
      metrics: ['招聘周期', '到面率', 'offer 接受率', '离职率', '人均产出', '培训覆盖率'],
      tasks: ['负责某岗位的完整招聘流程', '组织面试安排与评估', '做员工入职培训', '整理人才数据报表', '优化招聘渠道'],
      starter: '帮一个学生社团或小团队做一次完整招聘（写 JD → 收简历 → 面试 → 入职），记录每环节的数据。',
    },
    '咨询 / 战略': {
      aliases: ['咨询', '战略', 'consulting', '商业分析'],
      tools: ['Excel', 'PowerPoint', 'Think-cell', 'Wind', 'Bloomberg', 'Statista', 'Capital IQ'],
      methods: ['MECE 拆解', '行业研究', '财务建模', '商业尽调', '波特五力', 'SWOT', '假设驱动分析', '专家访谈'],
      metrics: ['市场规模', '增长率', '毛利率', 'ROI', '市场份额'],
      tasks: ['做行业研究报告', '搭建财务模型', '做竞品对标分析', '参与客户访谈', '输出战略建议 PPT'],
      starter: '写一份完整的行业研究报告（选一个你感兴趣的赛道），包括市场规模测算、竞争格局、趋势判断。这是咨询岗的敲门砖。',
    },
    '财务 / 金融': {
      aliases: ['财务', '金融', '会计', '投行', '审计', 'finance'],
      tools: ['Excel', 'Wind', '同花顺', '用友 / 金蝶', 'Bloomberg', 'Python'],
      methods: ['三大报表分析', '财务建模', '估值（DCF / 可比公司）', '预算编制', '成本分析', '尽调'],
      metrics: ['营收增长率', '净利率', 'ROE', '周转率', '估值倍数'],
      tasks: ['搭建财务模型', '做月度经营分析', '参与尽调并写报告', '编制预算', '分析成本结构'],
      starter: '选一家上市公司，用公开财报搭一个三表模型，给出你的估值判断并写清逻辑。',
    },
    '教师 / 教育': {
      aliases: ['教师', '教育', '老师', '教研', '培训'],
      tools: ['PPT', 'Canva', '超星 / 学习通', '腾讯会议', '问卷星', '剪映'],
      methods: ['课程设计', '教案撰写', '学情分析', '分层教学', '课堂互动设计', '教学反思'],
      metrics: ['学生成绩提升', '课程完课率', '满意度评分', '课堂参与度'],
      tasks: ['独立设计并讲授一门课', '编写教案与课件', '做学情分析与辅导', '组织教学活动'],
      starter: '设计一门 4 课时的迷你课程（含大纲、教案、课件、作业），并录一节试讲。',
    },
  };

  // 通用兜底（识别不出岗位时）
  var GENERIC = {
    tools: ['Excel', 'PPT', 'Word', '飞书 / 钉钉', 'Python', 'SQL', 'Figma', 'Canva'],
    methods: ['项目管理', '数据分析', '沟通协调', '文档撰写', '复盘总结'],
    metrics: ['效率提升', '成本降低', '完成量', '满意度', '错误率下降'],
    tasks: ['独立负责一件事从开始到落地', '协调多方推进', '整理分析资料', '输出报告或方案'],
    starter: '没有正式经历也没关系：课程作业、社团活动、自己发起的小项目、甚至帮朋友做的一件事，只要讲清「问题—做法—结果」，都可以成为项目。',
  };

  /**
   * 根据岗位名/关键词匹配工具箱
   */
  function match(roleText) {
    if (!roleText) return { key: null, kit: GENERIC, generic: true };
    var t = String(roleText).toLowerCase();
    var best = null, bestLen = 0;
    Object.keys(KITS).forEach(function (k) {
      var kit = KITS[k];
      (kit.aliases || []).forEach(function (a) {
        var al = a.toLowerCase();
        if (t.indexOf(al) !== -1 && al.length > bestLen) {
          best = k; bestLen = al.length;
        }
      });
    });
    if (best) return { key: best, kit: KITS[best], generic: false };
    return { key: null, kit: GENERIC, generic: true };
  }

  /**
   * 给某个岗位推荐的指标选项（追问数字时展示）
   */
  function metricHints(roleText, n) {
    var r = match(roleText);
    return (r.kit.metrics || []).slice(0, n || 6);
  }

  /**
   * 全部岗位列表（用于首屏选择）
   */
  function allRoles() {
    return Object.keys(KITS);
  }

  global.RoleKit = {
    match: match,
    metricHints: metricHints,
    allRoles: allRoles,
    KITS: KITS,
    GENERIC: GENERIC,
  };
})(window);
