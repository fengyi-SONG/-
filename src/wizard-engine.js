/**
 * wizard-engine.js
 * 逐题引导式访谈引擎
 *
 * 解决的核心问题：不要一上来就让用户"讲一长串"。
 *   · 零基础 / 零经历用户：给选项、给示例、给岗位工具清单，跟着点就行
 *   · 老手：可以随时切换成自由输入，一次讲完
 *
 * 每个步骤（step）返回：
 *   {
 *     id, title, subtitle, why,
 *     input: 'choice' | 'multi' | 'text' | 'longtext' | 'date' | 'link' | 'confirm',
 *     options: [{label, value, hint}],     // choice / multi
 *     placeholder, example,               // text / longtext
 *     skippable: true,
 *     suggestions: []                     // AI 根据岗位给的补充建议（可一键采纳）
 *   }
 */
(function (global) {
  'use strict';

  var RK = global.RoleKit;

  /* ================================================================ *
   * 步骤定义
   * ================================================================ */

  // ---------- 阶段 0：画像 ----------

  function stepName() {
    return {
      id: 'name', phase: 'profile',
      title: '先认识一下，怎么称呼你？',
      subtitle: '填真名或常用昵称都行，作品集上会显示这个名字。',
      input: 'text',
      placeholder: '比如：林澈',
      skippable: false,
    };
  }

  function stepTargetRole() {
    return {
      id: 'targetRole', phase: 'profile',
      title: '你想找什么方向的工作？',
      subtitle: '选一个最接近的就行。我会按这个方向给你推荐常用的工具和指标。',
      input: 'choice',
      options: (RK ? RK.allRoles() : []).map(function (r) {
        return { label: r, value: r };
      }).concat([{ label: '还没想好 / 其他', value: '其他' }]),
      skippable: false,
      allowCustom: true,
      customPlaceholder: '或者直接输入岗位，比如「用户增长」',
    };
  }

  function stepYear() {
    return {
      id: 'year', phase: 'profile',
      title: '你现在处在哪个阶段？',
      subtitle: '这决定我接下来问你什么——不同阶段的人，能讲的素材完全不一样。',
      input: 'choice',
      options: [
        { label: '在校生，找实习', value: '在校生找实习', hint: '重点挖课程项目、社团、比赛' },
        { label: '应届生，找第一份工作', value: '应届生找全职', hint: '重点挖实习和毕设' },
        { label: '工作 1-3 年，想跳槽', value: '1-3年跳槽', hint: '重点挖成果和量化数据' },
        { label: '工作 3 年以上', value: '3年以上', hint: '重点挖主导过的项目和影响力' },
        { label: '转行 / 零经验', value: '转行零经验', hint: '重点挖可迁移能力，帮你造项目' },
      ],
      skippable: false,
      // 转行/零经验会触发不同的后续路径
      onSelect: function (v) { return v === '转行零经验' || v === '在校生找实习'; },
    };
  }

  // ---------- 阶段 1：素材盘点 ----------

  function stepHasExperience(profile) {
    var isGreen = /转行零经验|在校生找实习/.test((profile.meta && profile.meta.stage) || '');
    return {
      id: 'hasExp', phase: 'source',
      title: isGreen ? '你有过实习、兼职或者参与过什么活动吗？' : '先说说你的经历来源',
      subtitle: isGreen
        ? '不用是正式实习。课程项目、社团、比赛、帮老师做事、自己折腾的小东西，都算。'
        : '我们会把这些变成作品集里的"经历"和"项目"。',
      input: 'multi',
      options: [
        { label: '有过实习 / 兼职', value: 'internship', hint: '公司、机构都算' },
        { label: '做过课程项目 / 毕设', value: 'coursework', hint: '小组作业、实验、毕业设计' },
        { label: '参加过社团 / 学生组织', value: 'club', hint: '组织活动、带团队、做宣传' },
        { label: '参加过比赛 / 竞赛', value: 'contest', hint: '商赛、数模、设计、编程比赛' },
        { label: '自己做过东西', value: 'selfmade', hint: '账号、网站、自媒体、开源、副业' },
        { label: '暂时都没有', value: 'none', hint: '我会帮你从零搭一个' },
      ],
      skippable: false,
    };
  }

  function stepNoExperience(profile) {
    var kit = RK ? RK.match(profile.hero && profile.hero.title) : null;
    return {
      id: 'buildProject', phase: 'source',
      title: '没关系，我们从零造一个出来',
      subtitle: '零经历的人也能做出有说服力的作品集——关键是有一个"完整走完"的小项目。我给你几个能一周做完的选题。',
      input: 'choice',
      options: (kit && kit.kit && kit.kit.starter ? [
        { label: '用你推荐的那个选题', value: '__starter__', hint: kit.kit.starter.slice(0, 60) + '…' },
      ] : []).concat([
        { label: '我自己想一个题目', value: 'custom', hint: '你说想做什么，我帮你拆成可执行的步骤' },
        { label: '先跳过，只放基本信息和技能', value: 'skip', hint: '之后随时可以回来加' },
      ]),
      skippable: false,
      tip: kit && kit.kit ? kit.kit.starter : '',
    };
  }

  // ---------- 阶段 2：逐条挖经历 ----------

  function stepExpOrg(ctx) {
    return {
      id: 'exp.org', phase: 'experience',
      title: ctx.editing ? '这段经历是在哪里？' : '先说第一段经历：在哪家公司 / 哪个组织？',
      subtitle: '公司名、学校实验室、社团名都可以。',
      input: 'text',
      placeholder: '比如：某某科技有限公司 / 校学生会 / 电商创业团队',
      skippable: false,
      suggestions: [],
    };
  }

  function stepExpRole(ctx, profile) {
    var kit = RK ? RK.match((profile.hero && profile.hero.title) || '') : null;
    var roleOptions = [];
    if (kit && kit.key) {
      // 按岗位方向推几个常见岗位名
      var base = kit.key;
      roleOptions = [
        { label: base + '实习生', value: base + '实习生' },
        { label: base, value: base },
        { label: base + '助理', value: base + '助理' },
      ];
    }
    return {
      id: 'exp.role', phase: 'experience',
      title: '你的岗位或角色是什么？',
      subtitle: '写清楚是哪类工作，比写"成员"具体得多。',
      input: 'text',
      placeholder: '比如：产品经理实习生 / 运营专员 / 队长',
      options: roleOptions,
      allowCustom: true,
      skippable: false,
    };
  }

  function stepExpTime(ctx) {
    return {
      id: 'exp.time', phase: 'experience',
      title: '这段时间是什么时候？',
      subtitle: '大概时间就行，不用精确到日。',
      input: 'date',
      placeholder: '2023.07 — 2024.06',
      skippable: true,
    };
  }

  function stepExpTasks(ctx, profile) {
    var kit = RK ? RK.match((profile.hero && profile.hero.title) || '') : null;
    var opts = (kit && kit.kit.tasks || []).map(function (t) {
      return { label: t, value: t };
    });
    return {
      id: 'exp.tasks', phase: 'experience',
      title: '你主要做了哪些事？',
      subtitle: '直接勾选就行，可以多选。勾完我会帮你改写成专业的表述。',
      input: 'multi',
      options: opts,
      allowCustom: true,
      customPlaceholder: '还有别的吗？直接补充',
      skippable: false,
      tip: '不用纠结措辞，勾选/写关键词就行，我来组织语言。',
    };
  }

  function stepExpDetail(ctx) {
    return {
      id: 'exp.detail', phase: 'experience',
      title: '挑一件最有代表性的事，具体说说',
      subtitle: '我想知道：当时遇到什么问题、你具体怎么做的、最后结果怎样。三句话就够。',
      input: 'longtext',
      placeholder: '比如：当时新用户流失很严重，我先做了 20 场用户访谈找原因，然后重新设计了引导流程，最后激活率从 41% 提到了 55%。',
      example: '当时【遇到什么问题】，我【具体怎么做的】，最后【结果】。',
      skippable: false,
    };
  }

  function stepExpMetric(ctx, profile) {
    var hints = RK ? RK.metricHints((profile.hero && profile.hero.title) || '', 6) : [];
    return {
      id: 'exp.metric', phase: 'experience',
      title: '有没有数字可以说明效果？',
      subtitle: '哪怕只是大概的估计也很有价值。选一个最常见的指标给我个数字。',
      input: 'metric',
      metricHints: hints,
      placeholder: '比如 41% → 55%，或者提升约 30%',
      skippable: true,
      tip: '招聘方最看重的就是这一项。没有精确数据时，"提升约 XX%" 也完全可以写。',
    };
  }

  function stepExpMore(ctx) {
    return {
      id: 'exp.more', phase: 'experience',
      title: '还有别的经历要加吗？',
      subtitle: '一般 2-3 段最合适。多了会稀释重点。',
      input: 'choice',
      options: [
        { label: '还有，继续加', value: 'more' },
        { label: '够了，去写项目', value: 'done' },
      ],
      skippable: false,
    };
  }

  // ---------- 阶段 3：项目 ----------

  function stepProjName(ctx) {
    return {
      id: 'proj.name', phase: 'project',
      title: '说一个你最想展示的项目',
      subtitle: '可以是实习里的一个功能、一次活动、课设、比赛作品、自己的账号——任何"你从头到尾做下来"的事。',
      input: 'text',
      placeholder: '比如：新用户引导重构 / 校园二手交易小程序',
      skippable: false,
    };
  }

  function stepProjLink(ctx) {
    return {
      id: 'proj.link', phase: 'project',
      title: '这个项目有链接吗？（选填）',
      subtitle: '比如 GitHub、作品演示页、文章链接。贴上来我会尝试读取页面内容，自动补全项目信息。',
      input: 'link',
      placeholder: 'https://…',
      skippable: true,
      tip: '没有链接也没关系，直接跳过。',
    };
  }

  function stepProjProblem(ctx) {
    return {
      id: 'proj.problem', phase: 'project',
      title: '当时要解决什么问题？',
      subtitle: '为什么非做不可？不做会怎样？说清这个，别人才能判断你的判断力。',
      input: 'longtext',
      placeholder: '比如：新用户首日流失率比行业均值高 15 个百分点，团队对原因有分歧，也没有可靠的归因数据。',
      example: '建议句式：现状是【…】，问题是【…】，如果不解决会【…】。',
      skippable: false,
    };
  }

  function stepProjApproach(ctx, profile) {
    var kit = RK ? RK.match((profile.hero && profile.hero.title) || '') : null;
    return {
      id: 'proj.approach', phase: 'project',
      title: '你具体做了哪几步？',
      subtitle: '这是最能体现你能力的一段。分步骤讲，说清"为什么这么选"。',
      input: 'longtext',
      placeholder: '比如：先做了 20 场用户访谈建立归因假设，再按假设优先级排期，做了三轮灰度实验，每轮只改一个变量。',
      example: '建议句式：我先【第一步】，然后【第二步】，因为【为什么这么选】。',
      skippable: false,
      tip: kit && kit.key ? '提示：' + kit.key + '常见的做法有 ' + (kit.kit.methods || []).slice(0, 4).join('、') + '，用到了就说出来。' : '',
      suggestions: (kit && kit.kit.methods || []).slice(0, 5).map(function (m) { return m; }),
    };
  }

  function stepProjResult(ctx) {
    return {
      id: 'proj.result', phase: 'project',
      title: '最后结果怎么样？',
      subtitle: '上线之后带来了什么变化？哪怕只影响了一小部分人，也值得说。',
      input: 'longtext',
      placeholder: '比如：首日激活率从 41% 提升到 55%，7 日留存提升 7 个百分点，方案被纳入季度 OKR。',
      skippable: false,
    };
  }

  function stepProjMetric(ctx, profile) {
    var hints = RK ? RK.metricHints((profile.hero && profile.hero.title) || '', 6) : [];
    return {
      id: 'proj.metric', phase: 'project',
      title: '给这个结果一个数字',
      subtitle: '有数字的项目，说服力完全不一样。',
      input: 'metric',
      metricHints: hints,
      placeholder: '+14pt / 41%→55%',
      skippable: true,
    };
  }

  function stepProjMore(ctx) {
    return {
      id: 'proj.more', phase: 'project',
      title: '还有别的项目吗？',
      subtitle: '2-3 个是理想数量。',
      input: 'choice',
      options: [
        { label: '还有，再加一个', value: 'more' },
        { label: '够了，去补技能', value: 'done' },
      ],
      skippable: false,
    };
  }

  // ---------- 阶段 4：技能 ----------

  function stepSkills(profile) {
    var kit = RK ? RK.match((profile.hero && profile.hero.title) || '') : null;
    return {
      id: 'skills', phase: 'skill',
      title: '你用过哪些工具 / 会哪些方法？',
      subtitle: kit && kit.key
        ? '下面是「' + kit.key + '」这个岗位最常用的，勾上你会的就行——不会的别勾，面试会问。'
        : '勾上你会的就行。',
      input: 'multi',
      options: ((kit && kit.kit.tools) || []).map(function (t) { return { label: t, value: t }; })
        .concat(((kit && kit.kit.methods) || []).slice(0, 6).map(function (m) {
          return { label: m, value: m, hint: '方法' };
        })),
      allowCustom: true,
      customPlaceholder: '还有别的工具或技能',
      skippable: true,
    };
  }

  function stepEducation() {
    return {
      id: 'education', phase: 'skill',
      title: '你的教育背景',
      subtitle: '学校、专业、时间。',
      input: 'text',
      fields: [
        { key: 'school', placeholder: '学校名称' },
        { key: 'major', placeholder: '专业' },
        { key: 'time', placeholder: '2019.09 — 2023.06' },
      ],
      skippable: true,
    };
  }

  // ---------- 阶段 5：收尾 ----------

  function stepContact() {
    return {
      id: 'contact', phase: 'final',
      title: '留个联系方式',
      subtitle: '邮箱是必须的。作品链接（GitHub / 小红书 / 博客）如果有也加上。',
      input: 'text',
      fields: [
        { key: 'email', placeholder: '邮箱（必填）' },
        { key: 'location', placeholder: '城市，如 上海' },
        { key: 'link', placeholder: '作品/主页链接（选填）' },
      ],
      skippable: true,
    };
  }

  function stepDone() {
    return {
      id: 'done', phase: 'done',
      title: '基础素材已经齐了',
      subtitle: '接下来你可以：开编辑模式精修文字、换主题配色、或者让我继续深挖某个项目。',
      input: 'confirm',
      skippable: false,
    };
  }

  /* ================================================================ *
   * 流程编排：根据当前 profile 决定下一步该问什么
   * ================================================================ */

  function nextStep(profile, ctx) {
    ctx = ctx || {};
    var p = profile;

    // 0. 姓名
    if (!p.hero || !p.hero.name) return stepName();

    // 1. 求职方向
    if (!p.hero.title) return stepTargetRole();

    // 2. 阶段（存在 meta.stage）
    if (!p.meta.stage) return stepYear();

    // 3. 素材盘点
    if (!p.meta.srcScanned) return stepHasExperience(p);

    // 3.5 零经历路径
    if (p.meta.noExp && !(p.projects || []).length && !p.meta.buildDecided) {
      return stepNoExperience(p);
    }

    // 4. 经历逐条
    var exps = p.experiences || [];
    if (ctx.editingExp != null && exps[ctx.editingExp]) {
      return nextExpStep(exps[ctx.editingExp], ctx.editingExp, p, true);
    }
    for (var i = 0; i < exps.length; i++) {
      var r = nextExpStep(exps[i], i, p, false);
      if (r) return r;
    }
    // 新增经历
    if (!p.meta.expDone) {
      if (!exps.length) {
        var so = stepExpOrg({ editing: false });
        so.index = exps.length; so.targetType = 'experience'; so.isNew = true;
        return so;
      }
      var sm = stepExpMore({});
      sm.index = -1; sm.targetType = 'experience';
      return sm;
    }

    // 5. 项目逐个
    var projs = p.projects || [];
    if (ctx.editingProj != null && projs[ctx.editingProj]) {
      return nextProjStep(projs[ctx.editingProj], ctx.editingProj, p, true);
    }
    for (var j = 0; j < projs.length; j++) {
      var r2 = nextProjStep(projs[j], j, p, false);
      if (r2) return r2;
    }
    if (!p.meta.projDone) {
      if (!projs.length) {
        var sp = stepProjName({});
        sp.index = projs.length; sp.targetType = 'project'; sp.isNew = true;
        return sp;
      }
      var spm = stepProjMore({});
      spm.index = -1; spm.targetType = 'project';
      return spm;
    }

    // 6. 技能
    if (!p.meta.skillDone) return stepSkills(p);

    // 7. 教育
    if (!p.meta.eduDone) return stepEducation();

    // 8. 联系
    if (!p.meta.contactDone) return stepContact();

    return stepDone();
  }

  /** 单条经历的下一个缺口 */
  function nextExpStep(e, idx, profile, editing) {
    var ctx = { editing: editing, index: idx };
    var st = _nextExpStep(e, idx, profile, editing);
    if (st) { st.index = idx; st.targetType = 'experience'; }
    return st;
  }
  function _nextExpStep(e, idx, profile, editing) {
    var ctx = { editing: editing, index: idx };
    if (!e.company) return stepExpOrg(ctx);
    if (!e.role) return stepExpRole(ctx, profile);
    if (!e.start && !e.end && !e.current) return stepExpTime(ctx);
    if (!(e.highlights || []).length) return stepExpTasks(ctx, profile);
    if (!e.__detailDone) return stepExpDetail(ctx);
    if (!(e.metrics || []).length && !e.__metricSkipped) return stepExpMetric(ctx, profile);
    return null;
  }

  /** 单个项目的下一个缺口 */
  function nextProjStep(x, idx, profile, editing) {
    var ctx = { editing: editing, index: idx };
    var st = _nextProjStep(x, idx, profile, editing);
    if (st) { st.index = idx; st.targetType = 'project'; }
    return st;
  }
  function _nextProjStep(x, idx, profile, editing) {
    var ctx = { editing: editing, index: idx };
    if (!x.name) return stepProjName(ctx);
    if (!x.__linkAsked && !x.link) return stepProjLink(ctx);
    if (!x.problem) return stepProjProblem(ctx);
    if (!x.approach) return stepProjApproach(ctx, profile);
    if (!x.result) return stepProjResult(ctx);
    if (!(x.metrics || []).length && !x.__metricSkipped) return stepProjMetric(ctx, profile);
    return null;
  }

  /* ================================================================ *
   * 把用户的一次回答写回 profile
   * ================================================================ */

  function applyAnswer(profile, step, answer, ctx) {
    var p = JSON.parse(JSON.stringify(profile));
    p.meta = p.meta || {};
    ctx = ctx || {};

    switch (step.id) {
      case 'name':
        p.hero.name = String(answer || '').trim();
        break;

      case 'targetRole':
        p.hero.title = String(answer || '').trim();
        // 预填一个数据条占位，让用户有东西可改
        break;

      case 'year':
        p.meta.stage = answer;
        if (/转行零经验|在校生找实习/.test(answer)) p.meta.green = true;
        break;

      case 'hasExp':
        p.meta.srcScanned = true;
        p.meta.sources = answer || [];
        if (!answer || !answer.length || answer.indexOf('none') !== -1) {
          p.meta.noExp = true;
        }
        break;

      case 'buildProject':
        p.meta.buildDecided = true;
        if (answer === 'skip') {
          p.meta.expDone = true;
          p.meta.projDone = true;
        } else if (answer === '__starter__') {
          var kit = RK ? RK.match(p.hero.title) : null;
          p.projects.push({
            name: (kit && kit.key ? kit.key : '') + '入门作品',
            role: '个人项目',
            period: '',
            context: '没有正式经历，主动做的练习项目。',
            problem: '',
            approach: '',
            result: '',
            metrics: [], tags: [], link: '', cover: '',
            __fromStarter: true,
          });
        }
        break;

      case 'exp.org': {
        var ei = pickIndex(step, ctx, p.experiences.length);
        if (p.experiences[ei]) p.experiences[ei].company = answer;
        else p.experiences.push(Object.assign(emptyExp(), { company: answer }));
        break;
      }
      case 'exp.role':
        getExp(p, ctx, step).role = answer;
        break;
      case 'exp.time': {
        var parts = String(answer || '').split(/[—–\-~至]+/);
        var t = getExp(p, ctx, step);
        t.start = (parts[0] || '').trim();
        if (/至今/.test(answer)) { t.current = true; t.end = ''; }
        else t.end = (parts[1] || '').trim();
        break;
      }
      case 'exp.tasks': {
        var ex = getExp(p, ctx, step);
        ex.highlights = (answer || []).slice(0, 8);
        ex.tags = (ex.tags || []).concat(inferTags(answer || [])).filter(uniq);
        break;
      }
      case 'exp.detail': {
        var ed = getExp(p, ctx, step);
        // 把详细叙述拆成要点，替换掉原来勾选的简短项
        var parsed = splitDetail(answer);
        if (parsed.length) {
          ed.highlights = parsed;
        }
        ed.__detailDone = true;
        break;
      }
      case 'exp.metric': {
        var em = getExp(p, ctx, step);
        if (answer === '__skip__') { em.__metricSkipped = true; break; }
        em.metrics = parseMetricInput(answer);
        break;
      }
      case 'exp.more':
        if (answer === 'done') p.meta.expDone = true;
        else p.experiences.push(emptyExp());
        break;

      case 'proj.name': {
        var pi = pickIndex(step, ctx, p.projects.length);
        if (p.projects[pi]) p.projects[pi].name = answer;
        else p.projects.push(Object.assign(emptyProj(), { name: answer }));
        break;
      }
      case 'proj.link': {
        var pj = getProj(p, ctx, step);
        pj.__linkAsked = true;
        if (answer && answer !== '__skip__') pj.link = answer;
        break;
      }
      case 'proj.problem':
        getProj(p, ctx, step).problem = answer;
        break;
      case 'proj.approach':
        getProj(p, ctx, step).approach = answer;
        break;
      case 'proj.result':
        getProj(p, ctx, step).result = answer;
        break;
      case 'proj.metric': {
        var pm = getProj(p, ctx, step);
        if (answer === '__skip__') { pm.__metricSkipped = true; break; }
        pm.metrics = parseMetricInput(answer);
        break;
      }
      case 'proj.more':
        if (answer === 'done') p.meta.projDone = true;
        else p.projects.push(emptyProj());
        break;

      case 'skills': {
        p.meta.skillDone = true;
        var items = (answer || []).filter(Boolean);
        if (items.length) {
          p.skills = p.skills || { groups: [] };
          if (!p.skills.groups.length) {
            p.skills.groups.push({ name: p.hero.title || '技能', items: [] });
          }
          items.forEach(function (it) {
            if (p.skills.groups[0].items.indexOf(it) === -1) p.skills.groups[0].items.push(it);
          });
        }
        break;
      }

      case 'education': {
        p.meta.eduDone = true;
        var a = answer || {};
        if (a.school) {
          var tp = String(a.time || '').split(/[—–\-~至]+/);
          p.education.push({
            school: a.school, degree: '', major: a.major || '',
            start: (tp[0] || '').trim(), end: (tp[1] || '').trim(), note: '',
          });
        }
        break;
      }

      case 'contact': {
        p.meta.contactDone = true;
        var c = answer || {};
        if (c.email) p.hero.email = c.email;
        if (c.location) p.hero.location = c.location;
        if (c.link) {
          p.hero.links = p.hero.links || [];
          p.hero.links.push({ label: guessLinkLabel(c.link), url: c.link });
        }
        break;
      }

      case 'done':
        p.meta.finished = true;
        break;
    }

    // 自动生成顶部数据条：从经历/项目的 metrics 里挑前 4 个
    p.metrics = deriveTopMetrics(p);
    p.meta.updatedAt = new Date().toISOString();
    return p;
  }

  /* ---------------- 辅助 ---------------- */

  function emptyExp() {
    return { company: '', role: '', start: '', end: '', current: false, location: '', summary: '', highlights: [], tags: [], metrics: [] };
  }
  function emptyProj() {
    return { name: '', role: '', period: '', context: '', problem: '', approach: '', result: '', metrics: [], tags: [], link: '', cover: '' };
  }
  function uniq(x, i, arr) { return arr.indexOf(x) === i; }

  // 决定写入第几条：优先 step.index，其次 ctx.index，最后追加
  function pickIndex(step, ctx, len) {
    if (step && step.index != null && step.index >= 0 && step.index < len) return step.index;
    if (ctx && ctx.index != null && ctx.index >= 0 && ctx.index < len) return ctx.index;
    return len; // 越界 -> 表示新增
  }
  function getExp(p, ctx, step) {
    var i = pickIndex(step, ctx, p.experiences.length);
    if (p.experiences[i]) return p.experiences[i];
    if (!p.experiences.length) p.experiences.push(emptyExp());
    return p.experiences[p.experiences.length - 1];
  }
  function getProj(p, ctx, step) {
    var i = pickIndex(step, ctx, p.projects.length);
    if (p.projects[i]) return p.projects[i];
    if (!p.projects.length) p.projects.push(emptyProj());
    return p.projects[p.projects.length - 1];
  }

  var TAG_WORDS = {
    '增长': ['增长', '拉新', '留存', '激活', '转化', '漏斗', '实验'],
    '用户研究': ['访谈', '调研', '用户研究', '问卷'],
    '数据分析': ['sql', '数据', '指标', '看板', '分析', '复盘'],
    '活动运营': ['活动', '大促', '社群', '运营'],
    '内容运营': ['内容', '选题', '账号', '发布', '创作者'],
    '项目管理': ['协调', '推进', '排期', '统筹', '落地', '对接'],
    '产品设计': ['原型', 'prd', '需求', '交互', '设计'],
    '商业化': ['营收', '变现', '投放', 'roi', '销售', '定价'],
  };
  function inferTags(arr) {
    var t = (arr || []).join(' ').toLowerCase();
    var out = [];
    Object.keys(TAG_WORDS).forEach(function (k) {
      for (var i = 0; i < TAG_WORDS[k].length; i++) {
        if (t.indexOf(TAG_WORDS[k][i]) !== -1) { out.push(k); break; }
      }
    });
    return out;
  }

  /** 把一段口语叙述拆成 2-4 条要点 */
  function splitDetail(text) {
    if (!text) return [];
    var s = String(text).trim();
    // 优先按句号/分号切
    var parts = s.split(/[。；;\n]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 6; });
    if (parts.length >= 2) return parts.slice(0, 5);
    // 按"然后/接着/后来/最后"切
    var p2 = s.split(/(?:，|,)?(?:然后|接着|后来|最后|之后)/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 6; });
    if (p2.length >= 2) return p2.slice(0, 5);
    return [s];
  }

  /** 解析用户输入的指标，支持 "41%→55%" "提升30%" "+7pt" */
  function parseMetricInput(text) {
    var s = String(text || '').trim();
    if (!s) return [];
    var out = [];
    // A→B（支持中文"从X涨到Y"、带单位的"30人→200人"）
    var m1 = s.match(/从?\s*([\d.]+\s*(?:%|pt|个百分点|倍|万人次|万|亿|人|个|次|单|篇|小时|天|元)?)\s*(?:→|->|—>|增长到|提升到|涨到|到|至)\s*([\d.]+\s*(?:%|pt|个百分点|倍|万人次|万|亿|人|个|次|单|篇|小时|天|元)?)/);
    if (m1) {
      out.push({ value: m1[1].replace(/\s/g, '') + '→' + m1[2].replace(/\s/g, ''), label: '关键指标' });
      return out;
    }
    var m2 = s.match(/([+\-]?[\d.]+\s*(?:%|pt|个百分点|倍|万|亿|个|人|天|小时|元|名))/);
    if (m2) out.push({ value: m2[1].replace(/\s/g, ''), label: '效果' });
    if (!out.length) out.push({ value: s.slice(0, 16), label: '效果' });
    return out;
  }

  function guessLinkLabel(url) {
    try {
      var u = new URL(url);
      var h = u.hostname.replace(/^www\./, '');
      if (h.indexOf('github') !== -1) return 'GitHub';
      if (h.indexOf('xiaohongshu') !== -1) return '小红书';
      if (h.indexOf('jike') !== -1) return '即刻';
      if (h.indexOf('zhihu') !== -1) return '知乎';
      if (h.indexOf('bilibili') !== -1) return 'B 站';
      return h;
    } catch (e) { return '链接'; }
  }

  /** 从所有条目里 derive 顶部数据条 */
  function deriveTopMetrics(p) {
    var pool = [];
    (p.experiences || []).forEach(function (e) {
      (e.metrics || []).forEach(function (m) { if (m && m.value) pool.push(m); });
    });
    (p.projects || []).forEach(function (x) {
      (x.metrics || []).forEach(function (m) { if (m && m.value) pool.push(m); });
    });
    // 去重，最多 4 条
    var seen = {}, out = [];
    pool.forEach(function (m) {
      var k = m.value;
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ value: m.value, label: m.label || '成果' });
    });
    // 补一个经验时长
    if (out.length < 4) {
      var n = (p.experiences || []).filter(function (e) { return e.company; }).length;
      var projN = (p.projects || []).filter(function (x) { return x.name; }).length;
      if (n && !seen[n + ' 段经历']) out.push({ value: n + ' 段', label: '相关经历' });
      if (projN) out.push({ value: projN + ' 个', label: '完整项目' });
    }
    return out.slice(0, 4);
  }

  /* ================================================================ *
   * 链接读取
   * ================================================================ */

  /**
   * 尝试读取一个链接的页面信息。
   * 浏览器有 CORS 限制，纯前端无法直接 fetch 任意站点。
   * 三级降级：
   *   1) 如果是已知平台（GitHub 等）用公开 API
   *   2) 尝试 r.jina.ai 这类只读代理（可选，需联网）
   *   3) 失败则只解析 URL 本身的结构，给出占位信息
   */
  function readLink(url, opts) {
    opts = opts || {};
    var clean = String(url || '').trim();
    if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;

    var guess = { url: clean, title: '', desc: '', source: 'none' };

    // GitHub 仓库：走公开 API，无需 token
    var gh = clean.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/i);
    if (gh) {
      var api = 'https://api.github.com/repos/' + gh[1] + '/' + gh[2];
      return fetch(api).then(function (r) {
        if (!r.ok) throw new Error('仓库不存在或不可访问');
        return r.json();
      }).then(function (j) {
        return {
          url: clean,
          title: j.name || gh[2],
          desc: [j.description, j.language ? '主要语言：' + j.language : '',
            j.stargazers_count ? '★ ' + j.stargazers_count : ''].filter(Boolean).join(' · '),
          topics: j.topics || [],
          source: 'github',
          suggested: {
            name: j.name,
            context: j.description || '',
            tags: (j.topics || []).slice(0, 4).concat(j.language ? [j.language] : []),
          },
        };
      });
    }

    // 其他链接：尝试 jina reader（只读代理，返回 markdown）
    if (opts.useProxy !== false) {
      return fetch('https://r.jina.ai/' + clean, { headers: { 'Accept': 'text/plain' } })
        .then(function (r) {
          if (!r.ok) throw new Error('proxy fail');
          return r.text();
        })
        .then(function (txt) {
          var head = txt.slice(0, 3000);
          var titleM = head.match(/^Title:\s*(.+)$/m) || head.match(/^#\s+(.+)$/m);
          var descM = head.match(/^(?:Description|摘要):\s*(.+)$/m);
          // 取正文前 400 字
          var body = head.replace(/^(Title|URL Source|Published Time|Description|Markdown Content):.*$/gm, '')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/[#*_`>]/g, '')
            .replace(/\n{2,}/g, '\n').trim();
          return {
            url: clean,
            title: (titleM ? titleM[1] : '') || clean.replace(/^https?:\/\//, '').split('/')[0],
            desc: (descM ? descM[1] : '') + (body ? '\n\n' + body.slice(0, 400) : ''),
            source: 'proxy',
            suggested: {
              name: (titleM ? titleM[1] : '').slice(0, 40),
              context: (descM ? descM[1] : body.slice(0, 200)),
            },
          };
        })
        .catch(function () {
          return fallbackFromUrl(clean);
        });
    }

    return Promise.resolve(fallbackFromUrl(clean));
  }

  function fallbackFromUrl(url) {
    var domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
    return {
      url: url, title: domain, desc: '',
      source: 'url-only',
      note: '这个站点不允许跨域读取具体内容，我只拿到了域名。你可以手动补充一两句话说明这个链接里是什么。',
      suggested: { name: '', context: '' },
    };
  }

  /* ================================================================ *
   * 智能建议：根据当前步骤 + 岗位给出可一键采纳的补充
   * ================================================================ */

  function suggestionsFor(step, profile) {
    var kit = RK ? RK.match((profile.hero && profile.hero.title) || '') : null;
    if (!kit || !kit.key) return [];
    var out = [];

    if (step.id === 'exp.tasks') {
      out = (kit.kit.tasks || []).slice(0, 5);
    } else if (step.id === 'proj.approach') {
      out = (kit.kit.methods || []).slice(0, 5);
    } else if (step.id === 'exp.metric' || step.id === 'proj.metric') {
      out = (kit.kit.metrics || []).slice(0, 6);
    } else if (step.id === 'skills') {
      out = (kit.kit.tools || []).slice(0, 8);
    }
    return out;
  }

  global.Wizard = {
    nextStep: nextStep,
    applyAnswer: applyAnswer,
    readLink: readLink,
    suggestionsFor: suggestionsFor,
    deriveTopMetrics: deriveTopMetrics,
    splitDetail: splitDetail,
    parseMetricInput: parseMetricInput,
    emptyExp: emptyExp,
    emptyProj: emptyProj,
  };
})(window);
