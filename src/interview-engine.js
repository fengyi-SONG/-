/**
 * interview-engine.js
 * 追问式访谈引擎
 *
 * 设计目标：不是"用户说完就完事"，而是像一个真实的资深顾问一样：
 *   1. 每轮解析用户输入，写入 profile
 *   2. 对每个条目做完整度评分，找出最关键的缺口
 *   3. 一次只问 1-2 个问题（不轰炸用户），并给出为什么问
 *   4. 主动询问"要不要我帮你扩充/润色"
 *   5. 支持三种模式：本地规则 / LLM / 混合（有 Key 用 LLM，无 Key 用规则）
 *
 * 对外：
 *   Interview.createSession(profile)
 *   session.ingest(text) -> Promise<{patch, reply, questions, completeness, offerExpand}>
 *   session.getNextQuestion(profile)  规则式追问（离线也能用）
 *   Interview.audit(profile)          整体体检，返回带权重的缺失项
 */
(function (global) {
  'use strict';

  /* ================================================================== *
   * 1. 完整度模型：什么算"说明白了"
   * ================================================================== */

  // 每个字段：权重 + 检查函数。权重决定追问优先级。
  var EXPERIENCE_FIELDS = [
    {
      key: 'company', label: '公司 / 组织', weight: 10,
      test: function (e) { return !!(e.company && e.company.trim().length >= 2); },
      ask: function (e) { return '这段经历是在哪家公司或组织？'; },
      why: '招聘方第一眼看的就是背书的组织',
    },
    {
      key: 'role', label: '岗位', weight: 9,
      test: function (e) { return !!(e.role && e.role.trim().length >= 2); },
      ask: function () { return '你的岗位 / 角色是什么？比如「产品经理实习生」「增长运营」。'; },
      why: '岗位决定了别人怎么理解你的职责范围',
    },
    {
      key: 'period', label: '时间', weight: 6,
      test: function (e) { return !!(e.start || e.end || e.current); },
      ask: function () { return '这段时间大概是什么时候到什么时候？（例如「2023.07 — 2024.06」）'; },
      why: '时间能体现你的经验长度和成长节奏',
    },
    {
      key: 'scope', label: '具体做了什么', weight: 12,
      test: function (e) { return (e.highlights || []).filter(nonEmpty).length >= 1; },
      ask: function () { return '你在这个岗位上具体负责哪些事？挑 2-3 件最核心的说就行。'; },
      why: '这是整段经历的主体，没有它整段就是空的',
    },
    {
      key: 'specific', label: '细节 / 方法', weight: 8,
      test: function (e) {
        var t = (e.highlights || []).join('') + (e.summary || '');
        return t.length >= 60 && /(通过|用|采用|搭建|设计|分析|访谈|复盘|策略|流程|模型|方法)/.test(t);
      },
      ask: function () {
        return '能不能说说你**具体是怎么做的**？用了什么方法、工具或思路，而不是只写"负责了 XX"。';
      },
      why: '"怎么做的"才是区分你和别人的地方',
    },
    {
      key: 'result', label: '结果 / 影响', weight: 12,
      test: function (e) {
        var t = (e.highlights || []).join('');
        return /(提升|提高|增长|下降|降低|减少|节省|缩短|达到|实现|完成|上线|落地|第一|翻倍|从[\d.]+)/.test(t);
      },
      ask: function () { return '这段时间最拿得出手的成果是什么？带来了什么变化？'; },
      why: '没有结果，前面的努力都只是过程描述',
    },
    {
      key: 'metric', label: '可量化数字', weight: 11,
      test: function (e) {
        var t = (e.highlights || []).join('') +
          (e.metrics || []).map(function (m) { return m.value; }).join('');
        return /[\d.]+\s*(%|pt|倍|万|亿|个|人|天|小时|元|名)/.test(t);
      },
      ask: function () {
        return '有没有具体的数字能佐证？哪怕是「带来 2 万+ 曝光」「效率提升约 30%」这样的估计值，也比没有强很多。';
      },
      why: '数字是作品集里最有说服力的部分，也是 AI 最容易帮你估算的',
    },
  ];

  var PROJECT_FIELDS = [
    {
      key: 'name', label: '项目名', weight: 7,
      test: function (p) { return !!(p.name && p.name.trim().length >= 2); },
      ask: function () { return '这个项目叫什么？给个能让人一眼记住的名字就行。'; },
      why: '名字是项目的门面',
    },
    {
      key: 'role', label: '你的角色', weight: 9,
      test: function (p) { return !!(p.role && p.role.trim().length >= 2); },
      ask: function () { return '你在这个项目里是什么角色？是主导、参与，还是只负责其中一块？'; },
      why: '项目是你做的还是你参与的，分量完全不同',
    },
    {
      key: 'context', label: '背景', weight: 6,
      test: function (p) { return !!(p.context && p.context.trim().length >= 12); },
      ask: function () { return '这个项目是在什么背景下开始的？为什么要做这件事？'; },
      why: '背景决定了别人能不能判断你的判断力',
    },
    {
      key: 'problem', label: '要解决的问题', weight: 12,
      test: function (p) { return !!(p.problem && p.problem.trim().length >= 12); },
      ask: function () { return '当时要解决的核心问题是什么？为什么非解决不可？'; },
      why: '问题是项目存在的前提，缺了它后面的做法就没有根据',
    },
    {
      key: 'approach', label: '你的做法', weight: 13,
      test: function (p) { return !!(p.approach && p.approach.trim().length >= 20); },
      ask: function () {
        return '你具体做了哪几步？如果分步骤讲更好——先做了什么，再做了什么，为什么这么选。';
      },
      why: '这是最能体现你能力的一段，也是作品集的核心',
    },
    {
      key: 'result', label: '结果', weight: 12,
      test: function (p) { return !!(p.result && p.result.trim().length >= 8); },
      ask: function () { return '最后的结果怎么样？这个项目上线后带来了什么变化？'; },
      why: '结果决定了这个项目值不值得放进作品集',
    },
    {
      key: 'metric', label: '关键数据', weight: 13,
      test: function (p) {
        var has = (p.metrics || []).filter(function (m) { return m && m.value; });
        if (has.length) return true;
        return /[\d.]+\s*(%|pt|倍|万|亿|个|人|天|小时|元|名)/.test((p.result || '') + (p.approach || ''));
      },
      ask: function () {
        return '这个项目有没有可以量化的结果？比如转化率、留存、效率、成本、用户数——有数字的项目说服力完全不一样。';
      },
      why: '数据是项目卡片里最抓眼的部分',
    },
  ];

  var HERO_FIELDS = [
    { key: 'name', label: '姓名', weight: 10, test: function (h) { return !!(h.name || '').trim(); },
      ask: function () { return '先告诉我怎么称呼你？'; }, why: '作品集总得有个署名' },
    { key: 'title', label: '一句话定位', weight: 11,
      test: function (h) { return !!(h.title || '').trim(); },
      ask: function () { return '用一句话形容你自己，比如「产品经理 · 增长与商业化方向」。你想让别人第一眼记住你是什么样的人？'; },
      why: '定位决定了别人用什么框架看你' },
    { key: 'tagline', label: '自我介绍', weight: 9,
      test: function (h) { return (h.tagline || '').trim().length >= 20; },
      ask: function () { return '再来两三句自我介绍：你最擅长什么、做过什么最有代表性的事？'; },
      why: '这是访客停留的第一段文字' },
  ];

  function nonEmpty(s) { return s && String(s).trim().length > 0; }

  function scoreFields(obj, fields) {
    var total = 0, got = 0, missing = [];
    fields.forEach(function (f) {
      total += f.weight;
      if (f.test(obj)) got += f.weight;
      else missing.push(f);
    });
    missing.sort(function (a, b) {
      // 姓名永远最先问——连称呼都不知道就没法开始
      if (a.key === 'name') return -1;
      if (b.key === 'name') return 1;
      return b.weight - a.weight;
    });
    return {
      score: total ? Math.round((got / total) * 100) : 0,
      missing: missing,
      top: missing[0] || null,
    };
  }

  /* ================================================================== *
   * 2. 整体体检
   * ================================================================== */

  function audit(profile) {
    var p = profile || {};
    var issues = [];
    var items = [];

    // HERO
    var hero = p.hero || {};
    var hs = scoreFields(hero, HERO_FIELDS);
    items.push({ type: 'hero', name: '关于你', score: hs.score, missing: hs.missing });

    (p.experiences || []).forEach(function (e, i) {
      var r = scoreFields(e, EXPERIENCE_FIELDS);
      items.push({
        type: 'experience', index: i,
        name: (e.company || '未命名经历') + (e.role ? ' · ' + e.role : ''),
        score: r.score, missing: r.missing,
      });
    });

    (p.projects || []).forEach(function (pr, i) {
      var r = scoreFields(pr, PROJECT_FIELDS);
      items.push({
        type: 'project', index: i,
        name: pr.name || '未命名项目',
        score: r.score, missing: r.missing,
      });
    });

    // 结构性建议
    if (!(p.projects || []).length) {
      issues.push({
        level: 'high', weight: 100,
        text: '还没有任何项目。项目是作品集最核心的部分——实习里做的一件事也可以单独拆成一个项目来讲。',
        action: 'add-project',
      });
    }
    if ((p.experiences || []).length === 1 && (p.projects || []).length === 0) {
      issues.push({
        level: 'mid', weight: 60,
        text: '只有一段经历、没有项目。建议至少把其中最有代表性的一件事展开成一个项目案例。',
        action: 'add-project',
      });
    }
    if (!(p.metrics || []).length) {
      issues.push({
        level: 'low', weight: 25,
        text: '顶部没有数据条。放 3-4 个最能打的数字，会让人第一眼就看出你的分量。',
        action: 'add-metrics',
      });
    }
    var allScores = items.map(function (x) { return x.score; });
    var avg = allScores.length ? Math.round(allScores.reduce(function (a, b) { return a + b; }, 0) / allScores.length) : 0;

    // 单个条目里最严重的缺口
    items.forEach(function (it) {
      it.missing.slice(0, 2).forEach(function (f, k) {
        if (k > 0 && f.weight < 6) return;
        issues.push({
          level: f.weight >= 11 ? 'high' : (f.weight >= 8 ? 'mid' : 'low'),
          weight: f.weight,
          text: (it.type === 'hero' ? '' : '「' + it.name + '」') + '还缺：' + f.label +
            (f.why ? '（' + f.why + '）' : ''),
          action: 'ask',
          target: it,
          field: f,
        });
      });
    });

    issues.sort(function (a, b) { return b.weight - a.weight; });

    return {
      average: avg,
      items: items,
      issues: issues,
      ready: avg >= 78 && (p.projects || []).length >= 1,
    };
  }

  /* ================================================================== *
   * 3. 追问生成（规则式）
   * ================================================================== */

  /**
   * 决定下一个该问什么。
   * 优先级：整体结构 > 最严重缺口的条目字段
   */
  function getNextQuestion(profile) {
    var a = audit(profile);

    // 最高优先：连姓名/定位都没有时，先认识用户
    var heroItem = a.items.filter(function (x) { return x.type === 'hero'; })[0];
    if (heroItem && heroItem.missing.length && heroItem.missing[0].weight >= 10) {
      var hf = heroItem.missing[0];
      var h = profile.hero || {};
      return {
        text: hf.ask(h), why: hf.why,
        kind: 'hero', index: -1, field: hf.key,
      };
    }

    var hi = a.issues.filter(function (x) { return x.weight >= 11; });
    var pool = hi.length ? hi : a.issues.filter(function (x) { return x.weight >= 8; });
    if (!pool.length) pool = a.issues;

    var pick = pool[0];
    if (!pick) return null;

    if (pick.action === 'ask' && pick.field) {
      var target = null;
      if (pick.target.type === 'hero') target = profile.hero || {};
      else if (pick.target.type === 'experience') target = (profile.experiences || [])[pick.target.index] || {};
      else target = (profile.projects || [])[pick.target.index] || {};

      return {
        text: pick.field.ask(target),
        why: pick.field.why,
        kind: pick.target.type,
        index: pick.target.index == null ? -1 : pick.target.index,
        field: pick.field.key,
      };
    }

    if (pick.action === 'add-project') {
      return {
        text: '现在还没有项目。回想一下：你在实习或学校里，有没有哪件事是你从头跟到尾、并且看到了结果的？哪怕规模不大，也可以展开成一个项目案例。',
        why: '项目是作品集的骨架',
        kind: 'project', index: -1, field: 'new',
      };
    }
    if (pick.action === 'add-metrics') {
      return {
        text: '把你这几段经历里最亮眼的数字挑 3 个给我，我会放到作品集最顶部的数据条上。',
        why: '顶部数据条是访客第一眼看到的东西',
        kind: 'hero', index: -1, field: 'metrics',
      };
    }
    return null;
  }

  /* ================================================================== *
   * 4. 本地解析（无 Key 时使用）
   * ================================================================== */

  var METRIC_UNITS = '%|pt|个百分点|倍|万|亿|元|人|天|小时|分钟|个|次|名|星|分';

  function extractMetrics(text) {
    var out = [], seen = {};
    function push(v, l) {
      var k = v + '|' + l;
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ value: v, label: l });
    }
    var m;

    // 从 A 提升到 B
    var re1 = new RegExp('从\\s*([\\d.]+)\\s*(' + METRIC_UNITS + ')?\\s*(?:提升|提高|增长|上涨|下降|降低|减少|涨|增)?\\s*(?:到|至|了)\\s*([\\d.]+)\\s*(' + METRIC_UNITS + ')?', 'g');
    while ((m = re1.exec(text))) {
      var u = m[2] || m[4] || '';
      push(m[1] + u + '→' + m[3] + u, '指标变化');
    }

    // 提升 / 降低 N 单位
    var re2 = new RegExp('(提升|提高|增长|上涨|下降|降低|减少|节省|优化|缩短|扩大)(?:了|约|近)?\\s*([\\d.]+)\\s*(' + METRIC_UNITS + ')', 'g');
    while ((m = re2.exec(text))) {
      var sign = /下降|降低|减少|缩短/.test(m[1]) ? '-' : '+';
      push(sign + m[2] + m[3], '效果');
    }

    // 倍数与量级
    var re3 = /([\d.]+)\s*(倍|万\+?|亿\+?|w\+?)/gi;
    while ((m = re3.exec(text))) push(m[1] + m[2], '规模');

    // 排名
    var re4 = /(?:排名|第)\s*(?:前)?\s*(\d+)\s*(?:名|\/|位)/g;
    while ((m = re4.exec(text))) push('No.' + m[1], '排名');

    // 纯 N 次 / N 场 / N 个
    var re5 = /(\d+)\s*(场|次|个|位|篇)/g;
    while ((m = re5.exec(text))) push(m[1] + m[2], '工作量');

    return out.slice(0, 8);
  }

  var TAG_DICT = {
    '增长': ['增长', '拉新', '留存', '激活', '转化', '漏斗', 'ab测试', 'a/b', '实验', '裂变'],
    '用户研究': ['访谈', '调研', '用户研究', '问卷', '可用性', '洞察'],
    '数据分析': ['sql', '数据', '指标', '看板', '归因', '报表', '建模', '分析'],
    '活动运营': ['活动', '大促', '社群', '私域', '运营'],
    '内容运营': ['内容', '创作者', '选题', '审核', '社区', '新媒体'],
    '商业化': ['变现', '营收', 'gmv', '投放', 'roi', '广告', '定价', '销售'],
    '产品设计': ['原型', 'prd', '需求', '交互', '体验', '设计', 'figma'],
    '项目管理': ['协调', '推进', '排期', '跨部门', '统筹', '落地', '对接'],
    '技术': ['代码', '开发', '接口', 'api', '前端', '后端', '算法', '脚本', 'python'],
    '策略': ['策略', '规划', '战略', '定位', 'gtm', '商业计划'],
  };

  function extractTags(text) {
    var low = text.toLowerCase(), tags = [];
    Object.keys(TAG_DICT).forEach(function (t) {
      for (var i = 0; i < TAG_DICT[t].length; i++) {
        if (low.indexOf(TAG_DICT[t][i].toLowerCase()) !== -1) { tags.push(t); break; }
      }
    });
    return tags.slice(0, 5);
  }

  var ACTION_WORDS = ['负责', '主导', '参与', '搭建', '设计', '规划', '推动', '协调', '统筹',
    '落地', '优化', '改版', '重构', '分析', '调研', '访谈', '策划', '执行', '跟进',
    '维护', '撰写', '输出', '建立', '制定', '组织', '上线', '测试', '验证', '复盘',
    '培训', '带领', '管理', '拓展', '对接', '监控', '梳理', '拆解', '搭建', '跑通'];

  function splitSentences(text) {
    return String(text).split(/[\n。；;！!？?]+/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 3; });
  }

  function isResult(s) {
    return /(提升|提高|增长|上涨|下降|降低|减少|节省|优化|缩短|达到|做到|完成|实现|获得|拿到|排名|第一|翻倍|从[\d.]+)/.test(s);
  }

  function isProblem(s) {
    return /(问题|痛点|困难|挑战|瓶颈|流失|不够|不足|偏低|很差|效率低|成本高|没有人|做不了)/.test(s);
  }

  function isBackground(s) {
    return /(当时|原本|原来|之前|背景|因为|由于|公司要|老板|业务上)/.test(s);
  }

  function classify(text) {
    if (/(项目|案例)/.test(text) ||
      /(做了|负责|主导|参与)[^。]{0,15}(产品|功能|活动|方案|系统|小程序|网站|app|改版|计划)/i.test(text)) {
      return 'project';
    }
    if (/(实习|公司|就职|入职|在职|担任|岗位|部门|上班|工作过)/.test(text)) return 'experience';
    if (/(我会|我熟悉|熟练|掌握|擅长|技能|工具|证书|技能是)/.test(text) && text.length < 200 && !/\d+%/.test(text)) return 'skill';
    return 'experience';
  }

  function guessOrg(text) {
    var m = text.match(/在\s*([\u4e00-\u9fa5A-Za-z0-9·（）()]{2,20})\s*(?:实习|工作|任职|做|期间|的时候)/);
    if (m) return cleanOrg(m[1]);
    m = text.match(/([\u4e00-\u9fa5A-Za-z0-9·（）()]{2,20}(?:公司|集团|科技|网络|传媒|银行|事务所|实验室|工作室|研究院))/);
    if (m) return cleanOrg(m[1]);
    m = text.match(/在\s*([\u4e00-\u9fa5A-Za-z0-9·]{2,15})/);
    return m ? cleanOrg(m[1]) : '';
  }
  function cleanOrg(s) {
    return String(s).replace(/(实习|工作|任职|期间|的时候|时|做)$/, '').trim();
  }

  function guessRole(text) {
    var m = text.match(/(?:担任|作为|做|是|负责)\s*([\u4e00-\u9fa5A-Za-z]{2,16}(?:经理|实习生|专员|分析师|工程师|设计师|助理|管培生|运营|产品|顾问|总监|主管))/);
    if (m) return m[1];
    m = text.match(/([\u4e00-\u9fa5A-Za-z]{2,12}(?:经理|实习生|专员|分析师|工程师|设计师|助理|管培生))/);
    return m ? m[1] : '';
  }

  function guessProjectName(text) {
    var m = text.match(/(?:做了|负责|主导|参与了?|做了一个)\s*(?:一?个)?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,18}(?:项目|活动|功能|系统|方案|计划|改版|小程序|网站|app))/i);
    if (m) return m[1].replace(/^一个/, '');
    var first = splitSentences(text)[0] || '';
    return first.replace(/^(我|我们)/, '').slice(0, 20);
  }

  function dedupe(arr) {
    var seen = {};
    return arr.filter(function (x) {
      var k = String(x).replace(/\s/g, '').slice(0, 24);
      if (!k || seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }

  function localParse(text) {
    var kind = classify(text);
    var sents = splitSentences(text);
    var metrics = extractMetrics(text);
    var tags = extractTags(text);

    var actions = [], results = [], problems = [], backgrounds = [];
    sents.forEach(function (s) {
      if (isResult(s)) results.push(s);
      else if (isProblem(s)) problems.push(s);
      else if (isBackground(s)) backgrounds.push(s);
      else if (ACTION_WORDS.some(function (w) { return s.indexOf(w) !== -1; })) actions.push(s);
      else backgrounds.push(s);
    });

    if (kind === 'project') {
      return {
        kind: 'project',
        patch: strip({
          name: guessProjectName(text),
          context: backgrounds[0] || '',
          problem: problems.join('；'),
          approach: actions.join('；'),
          result: results.join('；'),
          metrics: metrics,
          tags: tags,
        }),
      };
    }

    if (kind === 'skill') {
      var items = String(text)
        .replace(/我(熟悉|会|熟练|掌握|擅长|了解)(使用)?/g, '')
        .replace(/也(会|熟悉|掌握)?(用|使用)?/g, '、')
        .split(/[、,，和及\/]+/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s && s.length <= 20; });
      return { kind: 'skill', patch: { items: dedupe(items) } };
    }

    // 经历：summary 用第一句动作，其余进 highlights
    var highlights = dedupe(actions.concat(results)).slice(0, 6);
    return {
      kind: 'experience',
      patch: strip({
        company: guessOrg(text),
        role: guessRole(text),
        summary: '',
        highlights: highlights,
        tags: tags,
        metrics: metrics,
      }),
    };
  }

  function strip(o) {
    var r = {};
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (Array.isArray(v)) { if (v.length) r[k] = v; }
      else if (v != null && String(v).trim() !== '') r[k] = v;
    });
    return r;
  }

  /* ================================================================== *
   * 5. LLM 通道
   * ================================================================== */

  var SYS = [
    '# 角色',
    '你是一位资深作品集顾问，做过上百份产品/运营/商业方向的作品集评审。你的任务是**访谈**用户，把口语化的经历整理成高质量的结构化内容。',
    '',
    '# 核心原则',
    '1. **不要编造事实**。用户没说的公司、时间、数字，一律不要凭空填补。',
    '2. **可以合理润色表达**（让语句更专业、更紧凑），但不得改变事实。',
    '3. **主动追问**。如果关键信息缺失，必须问出来，并简短说明为什么这个问题重要。',
    '4. **一次只问 1-2 个问题**，不要一次抛出五个问题轰炸用户。',
    '5. **量化优先**。如果用户给了模糊描述（"效果不错"），追问具体数字；如果用户实在没有，可以提议给一个保守的估计值并标注「约」。',
    '6. 语言克制专业。禁用"赋能""抓手""闭环""打通"等空话，用具体动词。',
    '',
    '# 输出格式（严格 JSON，不要 markdown 代码块）',
    '{',
    '  "kind": "experience | project | skill | hero | chat",',
    '  "patch": { ... },',
    '  "reply": "给用户的简短反馈（1-3 句），说明你做了什么",',
    '  "questions": [{ "text": "追问内容", "why": "为什么问这个（短）" }],',
    '  "offerExpand": true | false,',
    '  "expandHint": "如果要扩充，你打算补什么（一句话）"',
    '}',
    '',
    '# patch 字段',
    'experience: {company, role, start, end, current, location, summary, highlights:[字符串], tags:[], metrics:[{value,label}]}',
    'project: {name, role, period, context, problem, approach, result, metrics:[{value,label}], tags:[]}',
    'skill: {items:[字符串]}',
    'hero: {name, title, tagline, location, email, links:[{label,url}]}',
    '只输出用户提到的字段。数组元素必须是完整句子，不要半截话。',
  ].join('\n');

  function callLLM(cfg, messages) {
    var body = {
      model: cfg.model || 'deepseek-chat',
      messages: messages,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    };
    return fetch(String(cfg.baseUrl).replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey,
      },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('接口返回 ' + r.status + '：' + t.slice(0, 180));
        });
      }
      return r.json();
    }).then(function (j) {
      var c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!c) throw new Error('模型没有返回内容');
      var clean = String(c).trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
      // 容错：截取第一个 { 到最后一个 }
      var a = clean.indexOf('{'), b = clean.lastIndexOf('}');
      if (a > 0 || b < clean.length - 1) clean = clean.slice(a, b + 1);
      return JSON.parse(clean);
    });
  }

  /* ================================================================== *
   * 6. 合并 patch
   * ================================================================== */

  function mergeMetrics(a, b) {
    var out = (a || []).slice();
    (b || []).forEach(function (m) {
      if (!m || !m.value) return;
      var dup = out.some(function (x) {
        return x.value === m.value || (x.label === m.label && x.label);
      });
      if (!dup) out.push({ value: String(m.value), label: String(m.label || '') });
    });
    return out.slice(0, 8);
  }

  function assign(obj, src) {
    Object.keys(src || {}).forEach(function (k) {
      var v = src[k];
      if (Array.isArray(v)) { if (v.length) obj[k] = v; }
      else if (v != null && String(v).trim() !== '') obj[k] = v;
    });
  }

  /**
   * 把一次解析结果写进 profile。
   * @param target {type,index} 可选：强制写入某个已有条目（追问场景）
   */
  function applyPatch(profile, kind, patch, target) {
    var p = JSON.parse(JSON.stringify(profile));
    if (!p.meta) p.meta = { theme: 'aurora', accent: '#2f5eff' };
    p.meta.updatedAt = new Date().toISOString();
    patch = patch || {};

    if (kind === 'skill') {
      if (!p.skills) p.skills = { groups: [] };
      var items = (patch.items || []).filter(Boolean);
      var gname = patch.group || '技能';
      var g = null;
      for (var i = 0; i < p.skills.groups.length; i++) {
        if (p.skills.groups[i].name === gname) { g = p.skills.groups[i]; break; }
      }
      if (!g) { g = { name: gname, items: [] }; p.skills.groups.push(g); }
      items.forEach(function (it) { if (g.items.indexOf(it) === -1) g.items.push(it); });
      return p;
    }

    if (kind === 'hero') {
      p.hero = p.hero || {};
      assign(p.hero, patch);
      if (patch.metrics && patch.metrics.length) {
        p.metrics = mergeMetrics(p.metrics, patch.metrics);
      }
      return p;
    }

    if (kind === 'project') {
      var pi = -1;
      if (target && target.type === 'project' && target.index >= 0) pi = target.index;
      else {
        for (var j = 0; j < (p.projects || []).length; j++) {
          if (patch.name && p.projects[j].name === patch.name) { pi = j; break; }
        }
      }
      if (pi >= 0 && p.projects[pi]) {
        var ex = p.projects[pi];
        var om = (ex.metrics || []).slice();
        assign(ex, patch);
        if (patch.metrics) ex.metrics = mergeMetrics(om, patch.metrics);
      } else {
        p.projects = p.projects || [];
        p.projects.push(Object.assign({ name: '', role: '', period: '', context: '', problem: '', approach: '', result: '', metrics: [], tags: [], link: '', cover: '' }, patch));
      }
      return p;
    }

    // experience
    var ei = -1;
    if (target && target.type === 'experience' && target.index >= 0) ei = target.index;
    else {
      for (var k = 0; k < (p.experiences || []).length; k++) {
        if (patch.company && p.experiences[k].company === patch.company) { ei = k; break; }
      }
    }
    if (ei >= 0 && p.experiences[ei]) {
      var ee = p.experiences[ei];
      var oh = (ee.highlights || []).slice();
      var om2 = (ee.metrics || []).slice();
      assign(ee, patch);
      if (patch.highlights) ee.highlights = dedupe(oh.concat(patch.highlights));
      if (patch.metrics) ee.metrics = mergeMetrics(om2, patch.metrics);
    } else {
      p.experiences = p.experiences || [];
      p.experiences.push(Object.assign({
        company: '', role: '', start: '', end: '', current: false, location: '',
        summary: '', highlights: [], tags: [], metrics: [],
      }, patch));
    }
    return p;
  }

  /* ================================================================== *
   * 7. 会话对象
   * ================================================================== */

  function createSession(getProfile, cfg) {
    var history = [];      // [{role, content}]
    var context = null;    // 当前聚焦的条目 {type,index}
    var round = 0;

    function setContext(c) { context = c; }
    function getContext() { return context; }

    /**
     * 处理一轮用户输入
     */
    function ingest(text) {
      round++;
      var profile = getProfile();

      // 先把用户这句话放入历史
      history.push({ role: 'user', content: text });
      if (history.length > 16) history = history.slice(-16);

      var runner = (cfg && cfg.apiKey) ? llmIngest(profile, text) : Promise.resolve(localIngest(profile, text));

      return runner.then(function (res) {
        // 写入 profile
        var newProfile = applyPatch(profile, res.kind, res.patch, context);

        // 规则引擎补充追问（补 LLM 可能漏掉的结构性问题）
        var ruleQ = getNextQuestion(newProfile);
        var qs = (res.questions || []).slice();
        if (ruleQ && !qs.some(function (q) { return overlap(q.text, ruleQ.text); })) {
          qs.push({ text: ruleQ.text, why: ruleQ.why });
        }

        // 只在没有严重缺口时才考虑"要不要扩充"
        var a = audit(newProfile);
        var hasCritical = a.issues.some(function (x) { return x.weight >= 11; });
        var offerExpand = res.offerExpand != null
          ? res.offerExpand
          : (a.average >= 60 && !hasCritical && qs.length < 2);

        var out = {
          kind: res.kind,
          patch: res.patch || {},
          reply: res.reply || '',
          questions: qs.slice(0, 2),
          offerExpand: offerExpand,
          expandHint: res.expandHint || '',
          audit: a,
          applied: newProfile,
          source: res.source,
        };

        history.push({ role: 'assistant', content: JSON.stringify({ kind: res.kind, patch: res.patch }) });
        return out;
      });
    }

    function localIngest(profile, text) {
      var r = localParse(text);
      return {
        kind: r.kind,
        patch: r.patch,
        reply: buildLocalReply(r, profile),
        questions: [],
        source: 'local',
      };
    }

    function llmIngest(profile, text) {
      var ctxDesc = describeContext(profile, context);
      var auditDesc = describeAudit(profile);
      var msgs = [{ role: 'system', content: SYS }];
      msgs.push({
        role: 'user',
        content: [
          '【当前作品集已有内容摘要】',
          ctxDesc || '（还是空的）',
          '',
          '【体检结果（缺口）】',
          auditDesc || '（无）',
          '',
          '【用户这句话】',
          text,
          '',
          '请解析这句话并输出 JSON。注意：如果这句话是在补充上面某一条，patch 里只放被补充的字段。',
        ].join('\n'),
      });
      // 附加历史（作为多轮上下文）
      var withHistory = msgs.slice(0, 1).concat(
        history.slice(-6).map(function (m) {
          return { role: m.role, content: m.content };
        }),
        msgs.slice(1)
      );

      return callLLM(cfg, withHistory).then(function (j) {
        j.source = 'model';
        if (!j.kind) j.kind = 'experience';
        return j;
      }).catch(function (e) {
        var r = localParse(text);
        return {
          kind: r.kind,
          patch: r.patch,
          reply: '（模型暂时不可用，已用本地规则整理：' + e.message + '）\n\n' + buildLocalReply(r, profile),
          questions: [],
          source: 'local-fallback',
        };
      });
    }

    /**
     * 让 AI 主动扩充某一条内容
     */
    function expand(target, profile) {
      var t = target || context;
      if (!t) return Promise.reject(new Error('没有指定要扩充的条目'));

      var item = getItem(profile, t);
      if (!item) return Promise.reject(new Error('找不到这个条目'));

      if (!(cfg && cfg.apiKey)) {
        // 本地模式：给出结构化的"扩充脚手架"，不编造事实
        return Promise.resolve({
          kind: t.type,
          patch: {},
          reply: localExpandScaffold(t.type, item),
          questions: [],
          offerExpand: false,
          source: 'local',
        });
      }

      var msgs = [
        { role: 'system', content: SYS },
        {
          role: 'user',
          content: [
            '【任务：扩充这一条内容】',
            JSON.stringify(item, null, 2),
            '',
            '要求：',
            '1. 保持事实不变，只在表达层面补充细节感：把"负责XX"改写成体现方法、判断、取舍的具体表述；',
            '2. 如果原文有数字，保留原数值，不要改；',
            '3. 如果原文完全没有量化，可以加一个**保守估计**并明确写成"约 XX"或"XX 左右"，同时在 reply 里提醒用户核对；',
            '4. highlights / approach 等数组可以适度扩充到 3-5 条，每条一句话，动宾结构开头；',
            '5. 不要添加原文完全没有的新事实（比如新的公司、新的项目阶段）。',
            '',
            '输出 JSON：{"kind":"' + t.type + '","patch":{...},"reply":"说明你改了什么、哪些需要用户确认","questions":[],"offerExpand":false}',
          ].join('\n'),
        },
      ];

      return callLLM(cfg, msgs).then(function (j) {
        j.source = 'model';
        j.kind = j.kind || t.type;
        return j;
      });
    }

    return {
      ingest: ingest,
      expand: expand,
      setContext: setContext,
      getContext: getContext,
      getRound: function () { return round; },
      reset: function () { history = []; context = null; round = 0; },
    };
  }

  function overlap(a, b) {
    var ka = String(a).replace(/[^\u4e00-\u9fa5a-z]/gi, '').slice(0, 8);
    var kb = String(b).replace(/[^\u4e00-\u9fa5a-z]/gi, '').slice(0, 8);
    return ka && kb && (ka.indexOf(kb) !== -1 || kb.indexOf(ka) !== -1);
  }

  function getItem(profile, t) {
    if (t.type === 'hero') return profile.hero || {};
    if (t.type === 'experience') return (profile.experiences || [])[t.index] || null;
    if (t.type === 'project') return (profile.projects || [])[t.index] || null;
    return null;
  }

  function buildLocalReply(r, profile) {
    var bits = [];
    if (r.kind === 'skill') {
      return '我记下这些技能了：' + (r.patch.items || []).join('、') + '。\n\n接下来我会看看还有哪些地方需要补。';
    }
    if (r.kind === 'project') {
      bits.push('按「问题 → 做法 → 结果」的框架，我把这段整理成项目了。');
    } else {
      var c = r.patch.company, ro = r.patch.role;
      bits.push(c ? '记下了「' + c + (ro ? ' · ' + ro : '') + '」这段经历。' : '我把这段内容整理成一条经历了。');
    }
    var m = (r.patch.metrics || []).length;
    var hl = (r.patch.highlights || []).length;
    if (hl) bits.push('梳理出 ' + hl + ' 个要点');
    if (m) bits.push('抓到 ' + m + ' 个数字');
    var s = bits.join('，') + '。';
    if (!m) s += ' 这段里还没有量化数据，后面我会专门问你。';
    return s;
  }

  function localExpandScaffold(type, item) {
    if (type === 'project') {
      return [
        '本地模式下我不能替你编内容，但可以给你一个扩充的「填空框架」——你照着补几句话，我立刻帮你整理：',
        '',
        '**问题**：这件事不做会怎样？谁受影响？',
        '**约束**：当时有什么限制（时间 / 预算 / 人力 / 技术）？',
        '**做法**：你试过哪些方案？为什么最后选了这一个？（这里的"为什么"最值钱）',
        '**协作**：你和谁配合？你负责哪一块？',
        '**结果**：数字 + 一个具体的细节（比如"某客户特意反馈…"）',
        '',
        '另外，你可以在「AI 设置」里填入任意 OpenAI 兼容的 API Key，我就能直接替你把这些补出来。',
      ].join('\n');
    }
    return [
      '本地模式下我只能帮你理结构，不能替你写内容。给你几个可以往里补的维度：',
      '',
      '· **体量**：团队多大？你负责的范围多大？',
      '· **难点**：最难的一件事是什么？你怎么解决的？',
      '· **方法**：用了什么工具或框架？（SQL / Figma / 某个分析模型）',
      '· **数字**：任何一个可量化的变化，哪怕是估计值。',
      '',
        '也可以在「AI 设置」里填入 API Key，让我直接帮你丰富表达。',
    ].join('\n');
  }

  function describeContext(profile, ctx) {
    var lines = [];
    if (profile.hero && profile.hero.name) lines.push('姓名：' + profile.hero.name + '；定位：' + (profile.hero.title || '未填'));
    (profile.experiences || []).forEach(function (e, i) {
      lines.push('- 经历[' + i + ']：' + (e.company || '?') + ' / ' + (e.role || '?') + ' / 要点 ' + (e.highlights || []).length + ' 条 / 数据 ' + (e.metrics || []).length + ' 个');
    });
    (profile.projects || []).forEach(function (p, i) {
      lines.push('- 项目[' + i + ']：' + (p.name || '?') + ' / 问题' + (p.problem ? '有' : '无') + ' / 做法' + (p.approach ? '有' : '无') + ' / 结果' + (p.result ? '有' : '无'));
    });
    if (ctx) lines.push('\n【当前正在补充】' + ctx.type + ' #' + ctx.index);
    return lines.join('\n');
  }

  function describeAudit(profile) {
    var a = audit(profile);
    return a.issues.slice(0, 6).map(function (x) { return '- ' + x.text; }).join('\n');
  }

  /* ================================================================== *
   * 8. 开场白
   * ================================================================== */

  function greeting() {
    return {
      reply: [
        '我来帮你做作品集。你只要**随便讲**就行，不用组织语言。',
        '',
        '比如：「我在一家内容社区实习，做增长，主要管新用户留存。当时首日流失挺严重，我做了用户访谈和漏斗分析，后来改了引导流程，激活率从 41% 提到了 55% 左右。」',
        '',
        '我会一边整理，一边追问你漏掉的关键信息——尤其是**结果**和**数字**，这两项是作品集最值钱的部分。',
      ].join('\n'),
      questions: [],
    };
  }

  global.Interview = {
    createSession: createSession,
    audit: audit,
    applyPatch: applyPatch,
    getNextQuestion: getNextQuestion,
    localParse: localParse,
    extractMetrics: extractMetrics,
    extractTags: extractTags,
    greeting: greeting,
    EXPERIENCE_FIELDS: EXPERIENCE_FIELDS,
    PROJECT_FIELDS: PROJECT_FIELDS,
    HERO_FIELDS: HERO_FIELDS,
  };
})(window);
