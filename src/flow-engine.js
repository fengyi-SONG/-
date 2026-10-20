/**
 * flow-engine.js  ·  T2 缺口驱动流程引擎（v3）
 *
 * 与 v2 wizard-engine 的根本差别：
 *
 *   v2: nextStep(profile) —— 用"字段空不空"反推下一步。
 *       后果 ① 用户答过的内容不留痕，跳过 = 永久不再问
 *            ② 零经历用户选完 starter 后，仍被要求填"在哪家公司"（已复现的阻断缺陷）
 *            ③ 回退只回滚 profile，问题序列可能变化
 *
 *   v3: nextStep(profile, session) —— 用"未解决项 + 权重"驱动，session 记录
 *       每一步的 answered / skipped / unknown，回退按 answers 栈回放。
 *
 * 设计约束
 *   · 所有写入 profile 的内容必须过 FactCore 守卫（带 status）
 *   · 零经历路径（meta.noExp）跳过整个经历区块，直接进入项目构建
 *   · 跳过是"暂时没答"，不是"这个问题不存在"：记入 unanswered，缺口清单里长期可见
 *   · 每个问题都带 why（为什么问），不是装饰
 */
(function (global) {
  'use strict';

  var FC = global.FactCore;
  var RK = global.RoleKit;

  /* ================================================================
   * 岗位范围（T3 收缩：首期只深做产品经理 / AI 产品经理）
   * ================================================================ */

  var TRACKS = {
    pm: {
      key: 'pm', label: '产品经理 / AI 产品经理',
      aliases: ['产品', 'pm', 'product', 'ai产品', 'ai pm', '产品经理', '产品助理', '产品实习'],
      deep: true,
      hint: '首期只把这一条流程做到能扛面试追问',
    },
    basic: {
      key: 'basic', label: '其他岗位（基础流程）',
      aliases: [],
      deep: false,
      hint: '暂时只收素材、不追问证据。等其他方向的用户反馈足够多再扩充',
    },
  };

  function detectTrack(roleText) {
    var t = String(roleText || '').toLowerCase();
    var names = TRACKS.pm.aliases;
    for (var i = 0; i < names.length; i++) {
      if (t.indexOf(names[i]) !== -1) return TRACKS.pm;
    }
    return TRACKS.basic;
  }

  /* ================================================================
   * Session：回答记录（与 profile 并列持久化）
   * ================================================================ */

  function emptySession() {
    return { answers: [], cursor: -1, startedAt: new Date().toISOString() };
  }

  /** 当前这一步是否已经回答过 / 跳过过 / 标记为信息不足 */
  function findAnswer(session, stepId, targetPath) {
    var list = (session && session.answers) || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var a = list[i];
      if (a.stepId === stepId && (a.targetPath || '') === (targetPath || '')) return a;
    }
    return null;
  }

  /**
   * 记录一次回答。
   * outcome: 'answered' | 'skipped' | 'unknown'
   */
  function record(session, step, outcome, targetPath) {
    var s = session || emptySession();
    s.answers = s.answers || [];
    var prev = findAnswer(s, step.id, targetPath);
    if (prev) {
      prev.outcome = outcome;
      prev.at = new Date().toISOString();
    } else {
      s.answers.push({
        stepId: step.id,
        targetPath: targetPath || '',
        outcome: outcome,
        at: new Date().toISOString(),
      });
    }
    s.cursor = s.answers.length - 1;
    return s;
  }

  /* ================================================================
   * 步骤定义
   * ================================================================ */

  function step(id, phase, opts) {
    return Object.assign({ id: id, phase: phase, skippable: false }, opts || {});
  }

  /* ---------- 阶段 0：画像 ---------- */

  function stepName() {
    return step('name', 'profile', {
      title: '先认识一下，作品集上要显示的名字是什么？',
      subtitle: '真名或常用昵称都行，随时可以改。',
      why: '名字会出现在整份作品集最显眼的位置。',
      input: 'text',
      placeholder: '比如：林澈',
      skippable: false,
      targetPath: 'hero.name',
    });
  }

  function stepTargetRole() {
    return step('track', 'profile', {
      title: '你这次要投的方向是？',
      subtitle: '首期把"产品经理 / AI 产品经理"这一条流程打磨到能扛面试追问；其他方向先走基础流程。',
      why: '两个方向的追问深度不同。选错会让你被问到根本没做的准备。',
      input: 'choice',
      options: [
        { label: '产品经理 / AI 产品经理', value: 'pm', hint: '会追问证据、个人贡献、取舍和验证结果' },
        { label: '其他方向（运营 / 设计 / 数据 / 开发…）', value: 'basic', hint: '基础流程：先整理素材和经历' },
      ],
      skippable: false,
      targetPath: 'meta.track',
    });
  }

  function stepRoleText() {
    return step('roleText', 'profile', {
      title: '具体想投什么岗位？写全一点',
      subtitle: '比如「AI 产品经理」「增长产品经理」「B 端产品经理」。',
      why: '岗位名决定我给你哪些方法卡和必答项。',
      input: 'text',
      placeholder: '比如：AI 产品经理',
      skippable: false,
      targetPath: 'hero.title',
      suggestions: ['产品经理', 'AI 产品经理', '增长产品经理', 'B 端产品经理', '数据产品经理'],
    });
  }

  function stepStage() {
    return step('stage', 'profile', {
      title: '你现在处在哪个阶段？',
      subtitle: '这决定我接下来能向你要什么素材。',
      why: '在校生和转行者能拿出的材料完全不同，问法也必须不同。',
      input: 'choice',
      options: [
        { label: '在校 / 应届，找第一份产品工作', value: '应届生', hint: '课程、社团、比赛、毕设都能用' },
        { label: '想转产品，之前做的是别的', value: '转行', hint: '可迁移能力 + 练习项目' },
        { label: '做过产品实习，想找正式岗', value: '有实习', hint: '重点挖实习里的真实项目' },
        { label: '工作 1-3 年，想换赛道', value: '跳槽', hint: '重点挖你主导过的事' },
      ],
      skippable: false,
      targetPath: 'meta.stage',
    });
  }

  /* ---------- 阶段 1：素材盘点 ---------- */

  function stepSourceInventory() {
    return step('sourceInventory', 'source', {
      title: '你手上有什么可以拿来做项目的素材？',
      subtitle: '不用是正式实习。课程作业、社团活动、比赛、自己折腾的东西、帮朋友做的一件事，都可以。',
      why: '我要先知道你有哪些"真实发生过的事"，才不会让你从零编。',
      input: 'multi',
      options: [
        { label: '产品 / 运营实习', value: 'internship', hint: '公司、工作室、远程都算' },
        { label: '课程项目 / 毕设', value: 'coursework', hint: '小组作业、课程设计' },
        { label: '社团 / 学生组织', value: 'club', hint: '组织过活动、带过团队' },
        { label: '比赛 / 竞赛', value: 'contest', hint: '商赛、黑客松、大创' },
        { label: '自己做的产品 / 账号 / 开源', value: 'selfmade', hint: '哪怕只做了个原型' },
        { label: '什么都没有', value: 'none', hint: '我会给你一条"真做一次"的路径，不是编故事' },
      ],
      allowCustom: true,
      customPlaceholder: '还有别的？回车添加',
      skippable: false,
      targetPath: 'meta.sources',
    });
  }

  /**
   * 零经历路径。
   * 关键区别：这里不是"给你编一个项目"，而是"给你一条真做一次的路径"，
   * 并且明确告诉你做完能拿到什么证据、大概要花多久。
   */
  function stepPickPractice(profile) {
    var kit = RK ? RK.match('产品经理') : null;
    var starter = (kit && kit.kit && kit.kit.practice) || null;
    var options = [];
    if (starter) {
      options.push({
        label: starter.title,
        value: 'starter',
        hint: starter.duration + ' · 产出：' + starter.output,
      });
    }
    options.push(
      { label: '我自己有想做的题目', value: 'custom', hint: '你说想法，我帮你拆成可执行的任务' },
      { label: '先不做项目，只整理现有素材', value: 'skip', hint: '可以，但作品集里会缺最重要的一块' }
    );
    return step('pickPractice', 'source', {
      title: '那就真做一个。不做假项目。',
      subtitle: starter
        ? '这是一个人能在 ' + starter.duration + ' 内独立完成的练习，做完你会手上真的有东西：' + starter.output + '。'
        : '我暂时没有适合你的练习模板，但你可以自己定一个题目。',
      why: '作品集里最值钱的是"你真的做过"。编出来的东西面试第一轮就会崩。',
      input: 'choice',
      options: options,
      tip: starter ? '提示：' + starter.steps.join(' → ') : '',
      skippable: false,
      targetPath: 'meta.practice',
    });
  }

  /* ---------- 阶段 2：项目（PM 七模块） ---------- */

  function stepProjName() {
    return step('projName', 'project', {
      title: '你最有代表性的一个项目是什么？',
      subtitle: '挑一个你"从头到尾参与过"的，不是只写了两页文档的那种。',
      why: '一个讲透的项目，比五个蜻蜓点水的项目更有说服力。',
      input: 'text',
      placeholder: '比如：新用户引导流程重构 / 校园二手交易小程序',
      skippable: false,
      targetPath: 'projects.{i}.name',
    });
  }

  /** 模块 A：问题发现 */
  function stepUsers() {
    return step('users', 'project', {
      title: '这个项目是给谁做的？大概有多少人？',
      subtitle: '分两行写：第一行是谁，第二行多少人或者什么范围。不确定就写"不确定"。',
      why: '说不清用户在哪儿，"需求"就没有落脚点。这是面试第一个会问的问题。',
      input: 'text',
      fields: [
        { key: 'who', placeholder: '目标用户是谁，越具体越好（如：入职 7 天内的新注册用户）' },
        { key: 'scale', placeholder: '规模 / 范围（如：日活约 3 万；或"没有真实用户，是课程作业"）' },
      ],
      skippable: false,
      targetPath: 'projects.{i}.users',
    });
  }

  function stepProblem() {
    return step('problem', 'project', {
      title: '当时要解决的具体问题是什么？',
      subtitle: '写"谁在什么场景下卡住了"，不要写"提升用户体验"这种结论。',
      why: '问题描述得越具体，你的方案才越有判断力可言。',
      input: 'longtext',
      placeholder: '比如：新用户注册后 72 小时内，有 63% 的人在填写资料这一步退出，导致后续功能完全用不上。',
      example: '建议句式：谁 / 在什么场景 / 卡在哪一步 / 造成了什么后果。',
      skippable: false,
      targetPath: 'projects.{i}.problem',
    });
  }

  /** 模块 B：证据 —— 这是 v3 新增的核心 */
  function stepProblemEvidence() {
    return step('evidence', 'project', {
      title: '你说这个问题存在，是凭什么判断的？',
      subtitle: '可以多选。没有证据也完全可以选最后一项——我会把它标成"假设"，不算谎报。',
      why: '这一条决定了你的项目是"有依据的判断"还是"拍脑袋"。面试官一定问。',
      input: 'multi',
      options: [
        { label: '有数据（后台数字、报表、截图）', value: 'data', hint: '哪怕只是后台看到的一个数字' },
        { label: '访谈过用户', value: 'interview', hint: '聊过几个人、聊了什么' },
        { label: '发过问卷', value: 'survey', hint: '多少份、结果如何' },
        { label: '自己就是这个产品的用户，亲身遇到', value: 'self', hint: '这也算证据，但要说明是一手体验' },
        { label: '看了竞品 / 行业报告', value: 'desk', hint: '注意：这是案头研究，不等于用户调研' },
        { label: '没有证据，是我的判断', value: 'none', hint: '会被标为"假设"，这是诚实的做法' },
      ],
      allowCustom: true,
      skippable: false,
      targetPath: 'projects.{i}.evidence',
    });
  }

  /** T3：按当前项目取方法论卡并附到步骤上 */
  function withPlaybook(def, profile, stepId) {
    var p = profile || {};
    var idx = p.meta && p.meta.curProj != null ? p.meta.curProj : 0;
    var proj = (p.projects || [])[idx];
    var card = RK ? RK.playbook(stepId, proj && proj.evidence, p.hero && p.hero.title) : null;
    if (card) def.card = card;
    return def;
  }

  /** 模块 C：问题分析 */
  function stepAnalysis(profile) {
    var def = step('analysis', 'project', {
      title: '你怎么分析这个问题的原因？',
      subtitle: '说清你排除了哪些可能，最后为什么认定是某个原因。',
      why: '这里暴露的是你的分析路径。只写结论的人，会被追问到说不出来。',
      input: 'longtext',
      placeholder: '比如：先看了漏斗，发现流失集中在资料页；再看录屏，多数人在"上传证件"那步放弃；问了 8 个用户，6 个说"不知道为什么要传身份证"。所以判断是信任解释缺失，而不是流程太长。',
      example: '建议句式：我先看了【什么】，发现【什么】，排除了【哪些可能】，所以判断是【什么原因】。',
      skippable: false,
      targetPath: 'projects.{i}.analysis',
    });
    return withPlaybook(def, profile, 'analysis');
  }

  /** 模块 D：方案设计 + 取舍 */
  function stepApproach(profile) {
    var def = step('approach', 'project', {
      title: '你提出了什么方案？为什么选它？',
      subtitle: '重点写"为什么不是别的方案"。面试官想看的其实是你的排除过程。',
      why: '方案谁都能想，取舍才是能力。',
      input: 'longtext',
      placeholder: '比如：有两条路——砍掉上传步骤，或者保留但加解释。选后者，因为合规要求必须收集，砍不掉。',
      example: '建议句式：方案 A 是【…】，方案 B 是【…】，我选【…】，因为【…】，不选另一个是因为【…】。',
      skippable: false,
      targetPath: 'projects.{i}.approach',
    });
    return withPlaybook(def, profile, 'approach');
  }

  function stepAlternatives() {
    return step('alternatives', 'project', {
      title: '有没有你考虑过但最后没做的方案？',
      subtitle: '写一个就够，说清为什么放弃。',
      why: '能说出"我为什么不做 X"的人，通常比"我做了 Y"的人更可信。',
      input: 'text',
      placeholder: '比如：做过一版直接砍掉上传步骤，但法务明确要求收集，所以放弃了。',
      skippable: true,
      targetPath: 'projects.{i}.decision.alternatives',
    });
  }

  /** 模块 E：个人贡献 —— 必须显式区分 */
  function stepContribution() {
    return step('contribution', 'project', {
      title: '这个项目里，哪些是你独立做的，哪些不是你做的？',
      subtitle: '分开说。团队一起做的、别人支持的、AI 帮你写的，都写出来——这不减分，反而加分。',
      why: '说不清自己做了什么，是最常见的失分点。夸大被问到更惨。',
      input: 'text',
      fields: [
        { key: 'self', placeholder: '你独立完成的部分（如：用户访谈、需求文档、原型全都自己做）' },
        { key: 'team', placeholder: '团队共同完成的（如：技术方案由开发主导，我参与评审）' },
        { key: 'ai', placeholder: 'AI 帮忙的部分（如：用 AI 生成了初版文案，我改过）' },
      ],
      skippable: false,
      targetPath: 'projects.{i}.contribution',
    });
  }

  /** 模块 F：验证与结果 */
  function stepResult() {
    return step('result', 'project', {
      title: '最后结果怎么样？做到哪一步了？',
      subtitle: '如果没上线、没真实用户，就直接写"只做到原型 / 只做了 5 人测试"，一样有价值。',
      why: '区分"做完了"和"验证了"，是诚实的核心。没有数据不丢人，假装有才丢人。',
      input: 'longtext',
      placeholder: '比如：只做到高保真原型，用 5 个同学做了可用性测试，4 人能在 2 分钟内完成注册任务。没有真实用户数据。',
      example: '建议句式：我做到了【哪一步】，观察到的现象是【…】，这只是【小样本 / 内部测试 / 未验证】。',
      skippable: false,
      targetPath: 'projects.{i}.result',
    });
  }

  function stepValidation() {
    return step('validation', 'project', {
      title: '你做过什么验证？',
      subtitle: '多选。什么都没做过也选最后一项——我会把你的结论标成"未验证"。',
      why: '这一题决定作品集里哪些是"已验证结论"，哪些只是"我的判断"。',
      input: 'multi',
      options: [
        { label: '用户访谈（≥3 人）', value: 'interview' },
        { label: '问卷（有回收数据）', value: 'survey' },
        { label: '可用性测试（有人试用了原型）', value: 'usability' },
        { label: '线上灰度 / A/B 实验', value: 'abtest', hint: '注意：要有对照和样本量才算' },
        { label: '上线后看了真实数据', value: 'postlaunch' },
        { label: '只做了原型，没找人验证', value: 'none', hint: '诚实的做法，会被标为"未验证"' },
      ],
      skippable: false,
      targetPath: 'projects.{i}.validation',
    });
  }

  function stepMetrics(profile) {
    var def = step('metrics', 'project', {
      title: '有没有可以量化的数字？',
      subtitle: '有就写，没有就留空。系统不会替你编一个。',
      why: '数字要能说出出处。说不出出处的数字，在面试里是负资产。',
      input: 'metric',
      placeholder: '比如：41%→55%，或者 从 30 人涨到 200 人',
      skippable: true,
      targetPath: 'projects.{i}.metrics',
    });
    return withPlaybook(def, profile, 'metrics');
  }

  /** 模块 G：复盘与局限 */
  function stepLimitations() {
    return step('limitations', 'project', {
      title: '这个方案有什么不足？',
      subtitle: '主动说局限不会减分。说不出局限才会让人怀疑你没想过。',
      why: '面试官常问"如果重做一次你会改什么"。这一题就是提前准备答案。',
      input: 'longtext',
      placeholder: '比如：只在 5 个同学身上验证过，样本严重偏向年轻人；也没考虑上传失败后的兜底流程。',
      skippable: false,
      targetPath: 'projects.{i}.limitations',
    });
  }

  function stepNextStep() {
    return step('nextStep', 'project', {
      title: '如果继续做，你下一步最想验证什么？',
      subtitle: '这一项会被明确标成"计划"，不会被当成你已经做成的事。',
      why: '能说清下一步的人，通常是真的想过这件事。',
      input: 'text',
      placeholder: '比如：把注册流程推给 200 个真实新用户，看资料页流失率能不能降到 40% 以下。',
      skippable: true,
      targetPath: 'projects.{i}.nextStep',
    });
  }

  function stepEvidenceList() {
    return step('evidenceList', 'project', {
      title: '你手上有哪些可以拿出来的材料？',
      subtitle: '访谈记录、数据截图、原型文件、需求文档、测试录音——有就列出来。',
      why: '这一栏是"可信度"的直接来源。列得出来，别人就更愿意信。',
      input: 'longtext',
      placeholder: '比如：8 份访谈记录（飞书文档）、后台漏斗截图 2 张、Figma 原型链接、5 人测试的录音与结论表',
      skippable: true,
      targetPath: 'projects.{i}.evidenceList',
    });
  }

  function stepProjMore() {
    return step('projMore', 'project', {
      title: '还有第二个项目要写吗？',
      subtitle: '一到两个讲透的项目，比五个只写了标题的更好。',
      why: '作品集的说服力来自深度，不来自数量。',
      input: 'choice',
      options: [
        { label: '还有，再加一个', value: 'more' },
        { label: '够了，去整理技能和背景', value: 'done' },
      ],
      skippable: false,
      targetPath: 'meta.projDone',
    });
  }

  /* ---------- 阶段 3：基础流程（非 PM 方向） ---------- */

  function stepExpOrg() {
    return step('expOrg', 'experience', {
      title: '第一段经历是在哪里？',
      subtitle: '公司、实验室、社团、创业团队都可以。',
      why: '经历区块展示你的背景，项目区块展示你的能力，两者不能互相替代。',
      input: 'text',
      placeholder: '比如：某某科技 / 校学生会 / 电商创业团队',
      skippable: false,
      targetPath: 'experiences.{i}.company',
    });
  }
  function stepExpRole() {
    return step('expRole', 'experience', {
      title: '你的岗位或角色是什么？',
      subtitle: '写具体一点，比写"成员"有用得多。',
      why: '角色决定别人用哪个标准评价你。',
      input: 'text',
      placeholder: '比如：产品实习生 / 运营专员 / 队长',
      skippable: false,
      targetPath: 'experiences.{i}.role',
    });
  }
  function stepExpTime() {
    return step('expTime', 'experience', {
      title: '这段时间是什么时候？',
      subtitle: '大概时间就行。',
      why: '时间决定别人怎么看你这段经历的含金量。',
      input: 'date',
      placeholder: '2023.07 — 2024.06',
      skippable: true,
      targetPath: 'experiences.{i}.period',
    });
  }
  function stepExpDetail() {
    return step('expDetail', 'experience', {
      title: '挑一件最有代表性的事说清楚',
      subtitle: '遇到什么问题、你怎么做的、结果怎样。三句话就够。',
      why: '没有具体事件的经历，读起来像岗位说明书。',
      input: 'longtext',
      placeholder: '比如：新人留存很差，我先做了 20 场访谈找原因，重做了引导流程，激活率从 41% 提到 55%。',
      example: '建议句式：当时【问题】，我【做法】，结果【结果】。',
      skippable: false,
      targetPath: 'experiences.{i}.highlights',
    });
  }
  function stepExpMore() {
    return step('expMore', 'experience', {
      title: '还有别的经历要加吗？',
      subtitle: '两到三段最合适。',
      why: '经历太多会稀释重点。',
      input: 'choice',
      options: [
        { label: '还有，继续加', value: 'more' },
        { label: '够了', value: 'done' },
      ],
      skippable: false,
      targetPath: 'meta.expDone',
    });
  }

  /* ---------- 阶段 4：技能 / 教育 / 联系 ---------- */

  function stepSkills(profile) {
    var kit = RK ? RK.match(profile.hero && profile.hero.title) : null;
    var tools = (kit && kit.kit.tools) || [];
    return step('skills', 'skill', {
      title: '你实际用过哪些工具或方法？',
      subtitle: '只勾你真的用过的。不会的别勾——面试官会问你怎么用的。',
      why: '这一栏是最容易被追问的，也是最容易被夸大的。',
      input: 'multi',
      options: tools.map(function (t) { return { label: t, value: t }; }),
      allowCustom: true,
      customPlaceholder: '还有别的？回车添加',
      skippable: true,
      targetPath: 'skills.groups',
    });
  }

  function stepEducation() {
    return step('education', 'skill', {
      title: '教育背景',
      subtitle: '学校、专业、时间。',
      why: '很多岗位有硬性学历要求，写清楚能省掉一轮沟通。',
      input: 'text',
      fields: [
        { key: 'school', placeholder: '学校名称' },
        { key: 'major', placeholder: '专业' },
        { key: 'time', placeholder: '2019.09 — 2023.06' },
      ],
      skippable: true,
      targetPath: 'education',
    });
  }

  function stepContact() {
    return step('contact', 'final', {
      title: '留个联系方式',
      subtitle: '邮箱必填。有其他作品链接也可以加上。',
      why: '作品集没有联系方式，等于白做。',
      input: 'text',
      fields: [
        { key: 'email', placeholder: '邮箱（必填）' },
        { key: 'location', placeholder: '城市，如 上海' },
        { key: 'link', placeholder: '作品 / 主页链接（选填）' },
      ],
      skippable: true,
      targetPath: 'hero.contact',
    });
  }

  function stepReview() {
    return step('review', 'final', {
      title: '素材收完了，先做一次事实检查',
      subtitle: '我会把所有"还没有依据"的地方列出来。你可以现在就补，也可以导出后再补。',
      why: '导出前不检查，等于把不确定的内容当成事实交出去。',
      input: 'confirm',
      skippable: false,
      targetPath: '',
    });
  }

  /* ================================================================
   * 编排：谁该被问
   * ================================================================ */

  var PROJECT_STEPS_PM = [
    stepUsers, stepProblem, stepProblemEvidence, stepAnalysis,
    stepApproach, stepAlternatives, stepContribution,
    stepResult, stepValidation, stepMetrics,
    stepLimitations, stepNextStep, stepEvidenceList,
  ];

  /**
   * 取某一步的 targetPath（含索引占位符替换）
   */
  function pathOf(stepDef, index) {
    var p = stepDef.targetPath || '';
    return p.replace('{i}', index == null ? '0' : index);
  }

  /**
   * 判断某个已记录的答案是否"解决了"这个缺口。
   *   answered → 解决
   *   skipped / unknown → 也算"已处理"，不重复问；但它会进 openGaps 缺口清单，
   *                       用户可以随时从清单里回来补。
   *   这样做是刻意的：v2 的 bug 在于"跳过 = 永久丢失询问意图"，
   *   v3 的修法不是"跳过 = 一直重问"（那会死循环），而是"跳过 = 记在缺口清单里"。
   */
  function isSettled(session, stepDef, path, profile, getter) {
    var a = findAnswer(session, stepDef.id, path);
    return !!a;
  }

  function hasValue(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.filter(Boolean).length > 0;
    if (typeof v === 'object') {
      return Object.keys(v).some(function (k) {
        var x = v[k];
        if (typeof x === 'string') return x.trim() !== '';
        if (Array.isArray(x)) return x.length > 0;
        return x != null && typeof x !== 'object';
      });
    }
    return String(v).trim() !== '';
  }

  /**
   * 主入口。
   * @returns step | null（null 表示全部收完）
   */
  function nextStep(profile, session) {
    var p = profile || {};
    var s = session || emptySession();
    var meta = p.meta || {};
    var track = TRACKS[meta.track] || detectTrack(p.hero && p.hero.title);

    function ret(def, index) {
      var st = def;
      st.path = pathOf(def, index);
      st.index = index == null ? -1 : index;
      st.session = s;
      return st;
    }

    // 0. 姓名
    if (!hasValue(p.hero && p.hero.name)) return ret(stepName());

    // 1. 方向（track）
    if (!meta.track) return ret(stepTargetRole());

    // 2. 具体岗位名
    if (!hasValue(p.hero && p.hero.title)) return ret(stepRoleText());

    // 3. 阶段
    if (!hasValue(meta.stage)) return ret(stepStage());

    // 4. 素材盘点
    if (!meta.srcScanned) return ret(stepSourceInventory());

    // 5. 零经历 → 练习项目决策（不再问经历！）
    var noExp = meta.noExp === true || (meta.sources || []).indexOf('none') !== -1;
    if (noExp && !meta.practice) return ret(stepPickPractice(p));

    // 6. 项目（PM 深流程 / 基础流程共用，只是深度不同）
    var projs = p.projects || [];
    var stepList = track.deep ? PROJECT_STEPS_PM : [stepUsers, stepProblem, stepApproach, stepContribution, stepResult];

    // 当前正在写的项目索引（没有就新建）
    var curIdx = meta.curProj;

    // 项目还没开始
    if (curIdx == null) {
      if (projs.length && meta.projDone) {
        // 全部写完，往下走
      } else if (projs.length && !meta.projDone) {
        return ret(stepProjMore_wrapped(s), -1);
      } else {
        meta.curProjPending = 0;
        return ret(stepProjName(), 0);
      }
    }

    if (curIdx != null) {
      var proj = projs[curIdx];
      if (!proj) {
        meta.curProj = null;
      } else {
        if (!hasValue(proj.name)) return ret(stepProjName(), curIdx);
        for (var i = 0; i < stepList.length; i++) {
          var def = stepList[i](p);
          var path = pathOf(def, curIdx);
          var getter = makeGetter(curIdx, def.id);
          // 已记录（answered / skipped / unknown）一律不重复问
          if (isSettled(s, def, path, p, getter)) continue;
          // profile 里已有值但从未问过（旧数据迁移 / starter 预填）→ 不重复問，记一条 answered
          if (hasValue(getter(p))) {
            record(s, def, 'answered', path);
            continue;
          }
          return ret(def, curIdx);
        }
        // 这个项目问完了 → 问"还有吗"
        meta.projDonePending = true;
        return ret(stepProjMore(), -1);
      }
    }

    // 7. 非 PM 方向才问经历
    if (!track.deep) {
      var exps = p.experiences || [];
      if (!noExp && exps.length === 0 && !meta.expDone) {
        meta.curExpPending = 0;
        return ret(stepExpOrg(), 0);
      }
      if (exps.length && !meta.expDone) {
        var lastExp = exps[exps.length - 1];
        if (!hasValue(lastExp.company)) return ret(stepExpOrg(), exps.length - 1);
        if (!hasValue(lastExp.role)) return ret(stepExpRole(), exps.length - 1);
        if (!hasValue(lastExp.start) && !hasValue(lastExp.end)) return ret(stepExpTime(), exps.length - 1);
        if (!(lastExp.highlights || []).length) return ret(stepExpDetail(), exps.length - 1);
        return ret(stepExpMore(), -1);
      }
    } else {
      // PM 深流程：经历区块可跳过，不阻断
      if (!meta.expDone) meta.expDone = true;
    }

    // 8. 技能
    if (!meta.skillDone) return ret(stepSkills(p));

    // 9. 教育
    if (!meta.eduDone) return ret(stepEducation());

    // 10. 联系
    if (!meta.contactDone) return ret(stepContact());

    // 11. 事实检查
    if (!meta.reviewed) return ret(stepReview());

    return null;
  }

  function stepProjMore_wrapped() { return stepProjMore(); }

  /** 每个步骤从 profile 取值的函数 */
  function makeGetter(idx, id) {
    return function (p) {
      var proj = (p.projects || [])[idx] || {};
      switch (id) {
        case 'users': return proj.users && (proj.users.who || proj.users.scale) ? proj.users : null;
        case 'problem': return proj.problem;
        case 'evidence': return proj.evidence;
        case 'analysis': return proj.analysis;
        case 'approach': return proj.approach;
        case 'alternatives': return proj.decision && proj.decision.alternatives;
        case 'contribution': return proj.contribution && proj.contribution.self !== 'unknown' ? proj.contribution : null;
        case 'result': return proj.result;
        case 'validation': return proj.validation;
        case 'metrics': return (proj.metrics || []).length ? proj.metrics : null;
        case 'limitations': return proj.limitations && proj.limitations.text;
        case 'nextStep': return proj.nextStep && proj.nextStep.text;
        case 'evidenceList': return (proj.evidenceList || []).length ? proj.evidenceList : null;
        default: return null;
      }
    };
  }

  /* ================================================================
   * 写入：把一次回答落进 profile（全部经 FactCore 守卫）
   * ================================================================ */

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function ensureProj(p, idx) {
    p.projects = p.projects || [];
    if (!p.projects[idx]) {
      p.projects[idx] = {
        name: '', role: '', period: '', context: '',
        problem: '', approach: '', result: '', analysis: '',
        users: { who: '', scale: '', status: 'unknown' },
        evidence: [], validation: [],
        decision: { why: '', alternatives: '', status: 'unknown' },
        contribution: { self: 'unknown', team: '', others: '', ai: '', note: '' },
        limitations: { text: '', status: 'unknown' },
        nextStep: { text: '', status: 'unknown' },
        evidenceList: [], metrics: [], tags: [], link: '', cover: '',
        fields: {
          context: { status: 'claim' }, problem: { status: 'claim' },
          approach: { status: 'claim' }, result: { status: 'claim' },
        },
      };
    }
    return p.projects[idx];
  }

  /**
   * 应用一次回答。
   * @param profile 当前 profile（不会原地改，返回新对象）
   * @param st      当前步骤（来自 nextStep）
   * @param answer  用户输入
   * @param outcome 'answered' | 'skipped' | 'unknown'
   */
  function applyAnswer(profile, st, answer, outcome) {
    var p = clone(profile || {});
    p.meta = p.meta || {};
    p.hero = p.hero || {};
    p.projects = p.projects || [];
    p.experiences = p.experiences || [];
    p.meta.version = 3;
    var idx = st.index == null ? -1 : st.index;
    var skipped = outcome === 'skipped' || outcome === 'unknown';

    switch (st.id) {
      case 'name':
        if (!skipped) p.hero.name = String(answer || '').trim();
        break;

      case 'track':
        if (!skipped) p.meta.track = answer;
        break;

      case 'roleText':
        if (!skipped) p.hero.title = String(answer || '').trim();
        break;

      case 'stage':
        if (!skipped) p.meta.stage = answer;
        break;

      case 'sourceInventory': {
        p.meta.srcScanned = true;
        var arr = Array.isArray(answer) ? answer.slice() : [];
        p.meta.sources = arr;
        p.meta.noExp = arr.length === 0 || arr.indexOf('none') !== -1;
        if (!p.meta.noExp) {
          p.meta.practice = p.meta.practice || '';
        }
        break;
      }

      case 'pickPractice': {
        p.meta.practice = skipped ? 'skip' : answer;
        if (answer === 'skip') {
          p.meta.expDone = true;
          p.meta.projDone = true;
        } else {
          // 建一个空项目壳，后续七模块逐个填。不预填任何内容。
          var kit = RK ? RK.match('产品经理') : null;
          var pr = (kit && kit.kit && kit.kit.practice) || null;
          var np = ensureProj(p, 0);
          np.name = pr ? pr.title : '';
          np.role = '个人练习项目';
          np.context = pr ? ('按练习路径完成：' + pr.steps.join(' → ')) : '';
          np.__practice = true;
          np.fields.context.status = 'fact'; // 这个"背景"是用户选了这个练习，属于已确认
          p.meta.curProj = 0;
        }
        break;
      }

      case 'projName': {
        if (idx < 0) idx = 0;
        var np2 = ensureProj(p, idx);
        if (!skipped) np2.name = String(answer || '').trim();
        p.meta.curProj = idx;
        break;
      }

      case 'users': {
        var a = answer || {};
        var pr2 = ensureProj(p, idx);
        pr2.users = {
          who: String(a.who || '').trim(),
          scale: String(a.scale || '').trim(),
          status: skipped ? 'unknown' : 'claim',
        };
        break;
      }

      case 'problem': {
        var pr3 = ensureProj(p, idx);
        if (!skipped) {
          pr3.problem = String(answer || '').trim();
          pr3.fields.problem.status = 'claim';
        } else {
          pr3.fields.problem.status = 'unknown';
        }
        break;
      }

      case 'evidence': {
        var pr4 = ensureProj(p, idx);
        var list = Array.isArray(answer) ? answer.filter(Boolean) : [];
        pr4.evidence = list;
        // 有实际证据 → evidence；只有案头/无 → assumption
        var real = list.filter(function (x) { return x !== 'none' && x !== 'desk'; });
        if (!list.length || list.indexOf('none') !== -1) pr4.problemStatus = 'assumption';
        else if (real.length) pr4.problemStatus = 'evidence';
        else pr4.problemStatus = 'assumption';
        pr4.fields.problem.status = pr4.problemStatus;
        break;
      }

      case 'analysis': {
        var pr5 = ensureProj(p, idx);
        if (!skipped) pr5.analysis = String(answer || '').trim();
        break;
      }

      case 'approach': {
        var pr6 = ensureProj(p, idx);
        if (!skipped) {
          pr6.approach = String(answer || '').trim();
          pr6.fields.approach.status = 'claim';
        }
        break;
      }

      case 'alternatives': {
        var pr7 = ensureProj(p, idx);
        pr7.decision = pr7.decision || { why: '', alternatives: '', status: 'unknown' };
        if (!skipped) {
          pr7.decision.alternatives = String(answer || '').trim();
          pr7.decision.status = 'claim';
        }
        break;
      }

      case 'contribution': {
        var ca = answer || {};
        var pr8 = ensureProj(p, idx);
        var self = String(ca.self || '').trim();
        pr8.contribution = {
          self: self ? 'partial' : 'unknown',
          team: String(ca.team || '').trim(),
          others: String(ca.others || '').trim(),
          ai: String(ca.ai || '').trim(),
          note: '',
        };
        // 只有用户明确写了"全部我自己做的"才算独立完成
        if (/全部|都是我做|独立完成|一个人做/.test(self)) pr8.contribution.self = 'solo';
        break;
      }

      case 'result': {
        var pr9 = ensureProj(p, idx);
        if (!skipped) {
          pr9.result = String(answer || '').trim();
          // 只在用户写了"只做到原型/没有真实用户/未验证"这类词时才降级
          var unverified = /只做到|没有真实|未验证|没上线|还没上线|内部测试|小样本|原型阶段/.test(pr9.result);
          pr9.fields.result.status = unverified ? 'assumption' : 'claim';
        }
        break;
      }

      case 'validation': {
        var pr10 = ensureProj(p, idx);
        var v = Array.isArray(answer) ? answer.filter(Boolean) : [];
        pr10.validation = v;
        if (!v.length || v.indexOf('none') !== -1) {
          // 没验证 → 结果只能是假设/未验证
          pr10.fields.result.status = 'assumption';
        } else if (v.indexOf('abtest') !== -1 || v.indexOf('postlaunch') !== -1) {
          pr10.fields.result.status = 'evidence';
        } else {
          pr10.fields.result.status = 'claim';
        }
        break;
      }

      case 'metrics': {
        var pr11 = ensureProj(p, idx);
        if (skipped || answer === '__skip__') {
          pr11.metrics = [];
          pr11.__metricNote = '用户表示暂时没有可量化的数字';
        } else {
          // 走收紧后的解析：识别不出数字就不产出指标
          var parsed = FC ? FC.parseMetric(answer) : { ok: false, metrics: [] };
          if (parsed.ok) {
            pr11.metrics = parsed.metrics.map(function (m) {
              m.by = 'user';
              return FC.ensureClaim(m, 'user');
            });
            pr11.__metricNote = '';
          } else {
            pr11.metrics = [];
            pr11.__metricNote = parsed.reason === 'no-number'
              ? '这段描述里没有数字，系统没有替你生成指标'
              : '无法可靠识别成指标，未写入';
          }
        }
        break;
      }

      case 'limitations': {
        var pr12 = ensureProj(p, idx);
        if (!skipped) pr12.limitations = { text: String(answer || '').trim(), status: 'claim' };
        break;
      }

      case 'nextStep': {
        var pr13 = ensureProj(p, idx);
        if (!skipped) pr13.nextStep = { text: String(answer || '').trim(), status: 'plan' };
        break;
      }

      case 'evidenceList': {
        var pr14 = ensureProj(p, idx);
        if (!skipped) {
          var txt = String(answer || '').trim();
          pr14.evidenceList = txt
            ? txt.split(/[、,，;；\n]+/).map(function (x) { return x.trim(); }).filter(Boolean)
            : [];
        }
        break;
      }

      case 'projMore': {
        if (answer === 'done' || skipped) {
          p.meta.projDone = true;
          p.meta.curProj = null;
        } else {
          var ni = (p.projects || []).length;
          ensureProj(p, ni);
          p.meta.curProj = ni;
        }
        break;
      }

      case 'expOrg': {
        if (idx < 0) idx = 0;
        p.experiences[idx] = p.experiences[idx] || { company: '', role: '', start: '', end: '', current: false, highlights: [], metrics: [], tags: [] };
        if (!skipped) p.experiences[idx].company = String(answer || '').trim();
        break;
      }
      case 'expRole': {
        p.experiences[idx] = p.experiences[idx] || {};
        if (!skipped) p.experiences[idx].role = String(answer || '').trim();
        break;
      }
      case 'expTime': {
        p.experiences[idx] = p.experiences[idx] || {};
        var tp = String(answer || '').split(/[—–\-~至]+/);
        p.experiences[idx].start = (tp[0] || '').trim();
        if (/至今/.test(answer || '')) { p.experiences[idx].current = true; p.experiences[idx].end = ''; }
        else p.experiences[idx].end = (tp[1] || '').trim();
        break;
      }
      case 'expDetail': {
        p.experiences[idx] = p.experiences[idx] || {};
        var parts = splitDetail(answer);
        p.experiences[idx].highlights = parts;
        break;
      }
      case 'expMore': {
        if (answer === 'done' || skipped) p.meta.expDone = true;
        else p.experiences.push({ company: '', role: '', start: '', end: '', current: false, highlights: [], metrics: [], tags: [] });
        break;
      }

      case 'skills': {
        p.meta.skillDone = true;
        var items = (Array.isArray(answer) ? answer : []).filter(Boolean);
        p.skills = p.skills || { groups: [] };
        if (!p.skills.groups.length) p.skills.groups.push({ name: (p.hero.title || '技能'), items: [] });
        items.forEach(function (it) {
          if (p.skills.groups[0].items.indexOf(it) === -1) p.skills.groups[0].items.push(it);
        });
        break;
      }

      case 'education': {
        p.meta.eduDone = true;
        var ea = answer || {};
        if (!skipped && ea.school) {
          var et = String(ea.time || '').split(/[—–\-~至]+/);
          p.education.push({
            school: ea.school, degree: '', major: ea.major || '',
            start: (et[0] || '').trim(), end: (et[1] || '').trim(), note: '',
          });
        }
        break;
      }

      case 'contact': {
        p.meta.contactDone = true;
        var c = answer || {};
        if (c.email) p.hero.email = String(c.email).trim();
        if (c.location) p.hero.location = String(c.location).trim();
        if (c.link) {
          p.hero.links = p.hero.links || [];
          p.hero.links.push({ label: guessLinkLabel(c.link), url: String(c.link).trim() });
        }
        break;
      }

      case 'review':
        p.meta.reviewed = true;
        break;
    }

    p.meta.updatedAt = new Date().toISOString();
    return p;
  }

  function splitDetail(text) {
    if (!text) return [];
    var s = String(text).trim();
    var parts = s.split(/[。；;\n]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 6; });
    if (parts.length >= 2) return parts.slice(0, 5);
    var p2 = s.split(/(?:，|,)?(?:然后|接着|后来|最后|之后)/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 6; });
    if (p2.length >= 2) return p2.slice(0, 5);
    return [s];
  }

  function guessLinkLabel(url) {
    try {
      var h = new URL(url).hostname.replace(/^www\./, '');
      if (/github/.test(h)) return 'GitHub';
      if (/xiaohongshu/.test(h)) return '小红书';
      if (/zhihu/.test(h)) return '知乎';
      if (/bilibili/.test(h)) return 'B 站';
      return h;
    } catch (e) { return '链接'; }
  }

  /* ================================================================
   * 缺口清单（给 UI 显示"还有 N 处没解决"）
   * ================================================================ */

  var STEP_LABELS = {
    name: '名字', track: '求职方向', roleText: '目标岗位', stage: '所处阶段',
    sourceInventory: '素材盘点', pickPractice: '练习项目',
    projName: '项目名称', users: '目标用户', problem: '问题',
    evidence: '问题依据', analysis: '原因分析', approach: '方案与取舍',
    alternatives: '放弃的方案', contribution: '个人贡献', result: '结果',
    validation: '验证情况', metrics: '量化数字', limitations: '局限',
    nextStep: '下一步计划', evidenceList: '证据材料', projMore: '更多项目',
    expOrg: '经历单位', expRole: '经历角色', expTime: '经历时间',
    expDetail: '经历细节', expMore: '更多经历',
    skills: '技能', education: '教育', contact: '联系方式', review: '事实检查',
  };

  function openGaps(session) {
    var out = [];
    ((session && session.answers) || []).forEach(function (a) {
      if (a.outcome === 'skipped' || a.outcome === 'unknown') {
        out.push({ stepId: a.stepId, label: STEP_LABELS[a.stepId] || a.stepId, targetPath: a.targetPath, outcome: a.outcome });
      }
    });
    return out;
  }

  /* ================================================================
   * 回退：按 answers 栈回放
   * ================================================================ */

  /**
   * 回退一步。返回 {session, profile, ok, undone}。
   * 语义：删掉最后一条 answer，并把 profile 里对应字段清空，
   *       使"问题序列"与"已有内容"保持一致（撤销 projName 后必须重问 projName，
   *       而不是跳过它直接问 users）。
   */
  function undo(profile, session) {
    var s = clone(session || emptySession());
    if (!s.answers.length) return { session: s, profile: profile, ok: false };
    var last = s.answers.pop();
    s.cursor = s.answers.length - 1;

    var p = clone(profile || {});
    var idx = parseIndex(last.targetPath);
    var skipped = 'unknown';

    switch (last.stepId) {
      case 'name': p.hero.name = ''; break;
      case 'track': p.meta.track = ''; break;
      case 'roleText': p.hero.title = ''; break;
      case 'stage': p.meta.stage = ''; break;
      case 'sourceInventory': p.meta.srcScanned = false; p.meta.sources = []; p.meta.noExp = false; break;
      case 'pickPractice': p.meta.practice = ''; break;

      case 'projName': if (p.projects && p.projects[idx]) p.projects[idx].name = ''; break;
      case 'users': if (p.projects && p.projects[idx]) p.projects[idx].users = { who: '', scale: '', status: 'unknown' }; break;
      case 'problem': if (p.projects && p.projects[idx]) { p.projects[idx].problem = ''; p.projects[idx].fields.problem.status = skipped; } break;
      case 'evidence': if (p.projects && p.projects[idx]) { p.projects[idx].evidence = []; } break;
      case 'analysis': if (p.projects && p.projects[idx]) p.projects[idx].analysis = ''; break;
      case 'approach': if (p.projects && p.projects[idx]) { p.projects[idx].approach = ''; p.projects[idx].fields.approach.status = 'claim'; } break;
      case 'alternatives': if (p.projects && p.projects[idx]) { p.projects[idx].decision.alternatives = ''; } break;
      case 'contribution': if (p.projects && p.projects[idx]) { p.projects[idx].contribution = { self: 'unknown', team: '', others: '', ai: '', note: '' }; } break;
      case 'result': if (p.projects && p.projects[idx]) { p.projects[idx].result = ''; p.projects[idx].fields.result.status = 'claim'; } break;
      case 'validation': if (p.projects && p.projects[idx]) { p.projects[idx].validation = []; } break;
      case 'metrics': if (p.projects && p.projects[idx]) { p.projects[idx].metrics = []; p.projects[idx].__metricNote = ''; } break;
      case 'limitations': if (p.projects && p.projects[idx]) p.projects[idx].limitations = { text: '', status: 'unknown' }; break;
      case 'nextStep': if (p.projects && p.projects[idx]) p.projects[idx].nextStep = { text: '', status: 'unknown' }; break;
      case 'evidenceList': if (p.projects && p.projects[idx]) p.projects[idx].evidenceList = []; break;

      case 'projMore': p.meta.projDone = false; break;

      case 'expOrg': if (p.experiences && p.experiences[idx]) p.experiences[idx].company = ''; break;
      case 'expRole': if (p.experiences && p.experiences[idx]) p.experiences[idx].role = ''; break;
      case 'expTime': if (p.experiences && p.experiences[idx]) { p.experiences[idx].start = ''; p.experiences[idx].end = ''; p.experiences[idx].current = false; } break;
      case 'expDetail': if (p.experiences && p.experiences[idx]) p.experiences[idx].highlights = []; break;
      case 'expMore': p.meta.expDone = false; break;

      case 'skills': p.meta.skillDone = false; break;
      case 'education': p.meta.eduDone = false; break;
      case 'contact': p.meta.contactDone = false; break;
      case 'review': p.meta.reviewed = false; break;
    }

    return { session: s, profile: p, ok: true, undone: last };
  }

  function parseIndex(path) {
    var m = String(path || '').match(/\.(\d+)(?:\.|$)/);
    return m ? +m[1] : -1;
  }

  /* ================================================================
   * 导出
   * ================================================================ */

  global.Flow = {
    TRACKS: TRACKS,
    detectTrack: detectTrack,
    emptySession: emptySession,
    record: record,
    findAnswer: findAnswer,
    nextStep: nextStep,
    applyAnswer: applyAnswer,
    openGaps: openGaps,
    undo: undo,
    splitDetail: splitDetail,
    hasValue: hasValue,
    STEP_LABELS: STEP_LABELS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
