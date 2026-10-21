/**
 * fact-core.js  ·  T1 事实状态数据层
 *
 * 存在理由：v2 的 profile 里指标只有 {value,label}，系统在设计上就无法区分
 * "用户算出来的数" 和 "用户编的数"。本模块提供唯一的事实状态定义与守卫，
 * 所有写入 profile 的路径都必须经过它。
 *
 * 核心约定
 *   1. 六种状态严格互斥，见 STATUS。
 *   2. 用户提供的信息默认是 claim（陈述），不是 fact（事实）。
 *      系统没有能力独立核实，所以 claim 是默认值，fact 需要用户显式确认。
 *   3. 任何进入作品集的指标必须带 status；没说来源的标 claim。
 *   4. AI 产出的内容只能落 assumption，不能落 fact。
 */
(function (global) {
  'use strict';

  /* ================================================================
   * 状态定义
   * ================================================================ */

  var STATUS = {
    fact:       { key: 'fact',       label: '已确认事实', short: '事实', level: 0,
                  hint: '你亲自确认发生过、并且能说清来龙去脉' },
    claim:      { key: 'claim',      label: '你的陈述（未核实）', short: '陈述', level: 1,
                  hint: '你提供的信息。系统默认按此处理，面试前建议自己再过一遍' },
    evidence:   { key: 'evidence',   label: '有材料支撑', short: '有据', level: 0,
                  hint: '有访谈记录、数据截图、原型文件等可以出示的材料' },
    assumption: { key: 'assumption', label: '待验证假设', short: '假设', level: 2,
                  hint: '目前只是你的判断，还没有证据支持' },
    plan:       { key: 'plan',       label: '未来计划', short: '计划', level: 2,
                  hint: '还没做，是打算做的事' },
    unknown:    { key: 'unknown',    label: '信息不足', short: '待补', level: 3,
                  hint: '你也不确定，或还没想清楚' },
  };

  var ORDER = ['fact', 'evidence', 'claim', 'assumption', 'plan', 'unknown'];

  function normalizeStatus(s) {
    return STATUS[s] ? s : 'claim';
  }
  function statusMeta(s) {
    return STATUS[normalizeStatus(s)];
  }
  /** 是否属于"不能当成已发生事实"的状态 */
  function isUnverified(s) {
    return normalizeStatus(s) === 'assumption' || normalizeStatus(s) === 'plan' ||
           normalizeStatus(s) === 'unknown';
  }
  function isConfirmed(s) {
    var k = normalizeStatus(s);
    return k === 'fact' || k === 'evidence';
  }

  /* ================================================================
   * 指标解析（收紧版）
   * ================================================================
   * 与 v2 的 parseMetricInput 的区别：
   *   v2: 任何文字都被塞成 {value:'不知道', label:'效果'}，且吞掉"约"
   *   v3: 识别不出量纲就不产出指标，交给调用方引导用户改写句定性结果
   *        同时把"约/大概/左右/估计"保留到 note，并在 status 上标为 claim
   */

  // 允许作为"数值"的形态：数字 + 可选单位；或数字→数字
  var NUM = '(?:\\d+(?:\\.\\d+)?)';
  var UNIT = '(?:%|pt|个百分点|倍|万人次|万|亿|人|个|次|单|篇|小时|天|元|名|条|页|分|秒|月|周|年)?';
  var HEDGE_SRC = '(?:约|大约|大概|估计|左右|差不多|接近|超过)';
  var HEDGE = new RegExp(HEDGE_SRC);
  var RANGE_SEP = '(?:→|->|—>|–>|增长到|提升到|涨到|提高到|上升到|到|至)';

  /**
   * @returns {{ok:boolean, metrics:Array, hedged:boolean, raw:string, reason:string}}
   *   ok=false 时 metrics 为空，reason 说明为什么没识别出来
   */
  function parseMetric(text) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return { ok: false, metrics: [], hedged: false, raw: s, reason: 'empty' };

    var hedged = HEDGE.test(s);
    var note = hedged ? '用户表述为估算值' : '';

    // 形态 A：区间  从30人涨到200人 / 41%→55%
    // 说明：所有分组都用非捕获 (?:...)，保证 capture 组编号稳定为 1(前值) / 2(后值)
    var reA = new RegExp('从?\\s*(?:' + HEDGE_SRC + '\\s*)?(' + NUM + '\\s*' + UNIT + ')\\s*' + RANGE_SEP +
                         '\\s*(?:' + HEDGE_SRC + '\\s*)?(' + NUM + '\\s*' + UNIT + ')');
    var a = s.match(reA);
    if (a) {
      return {
        ok: true, hedged: hedged, raw: s, reason: '',
        metrics: [{
          value: a[1].replace(/\s/g, '') + '→' + a[2].replace(/\s/g, ''),
          label: '关键指标',
          status: 'claim',
          source: '',
          note: note,
        }],
      };
    }

    // 形态 B：单值带符号或单位  +14pt / -40% / 3 轮 / 200 人
    var reB = new RegExp('([+\\-]?' + NUM + '\\s*' + UNIT + ')');
    var b = s.match(reB);
    if (b && /\d/.test(b[1])) {
      var v = b[1].replace(/\s/g, '');
      // 纯数字且没单位，且原文很长 → 可能是"2023"这种年份，判定不可靠
      var hasUnit = /[%pt个次单篇小时天元名条页分秒周月年倍万人亿]/.test(v);
      if (!hasUnit && v.replace(/[+\-]/g, '').length >= 4) {
        return { ok: false, metrics: [], hedged: hedged, raw: s, reason: 'ambiguous-number' };
      }
      return {
        ok: true, hedged: hedged, raw: s, reason: '',
        metrics: [{ value: v, label: '效果', status: 'claim', source: '', note: note }],
      };
    }

    // 形态 C：完全没有数字 → 不产出指标
    return { ok: false, metrics: [], hedged: hedged, raw: s, reason: 'no-number' };
  }

  /**
   * 把一段"没有数字的结果"转成定性描述，而不是伪造指标。
   * 返回值可直接写进 project.result / experience.highlights 的补充说明。
   */
  function qualitativeHint(text) {
    var s = String(text || '').trim();
    if (!s) return '';
    return '（未量化）' + s;
  }

  /* ================================================================
   * 写入守卫
   * ================================================================ */

  /**
   * 保证一条 claim 合法；不合法时抛出，用于开发期捕获"绕过状态直接写内容"。
   * 生产路径请用 ensureClaim（会补默认值而不是抛错）。
   */
  function assertClaim(obj, where) {
    if (!obj || typeof obj !== 'object') {
      throw new Error('[assertClaim] ' + (where || '') + ' 不是对象');
    }
    if (!obj.status) {
      throw new Error('[assertClaim] ' + (where || '') + ' 缺少 status，禁止写入');
    }
    if (!STATUS[obj.status]) {
      throw new Error('[assertClaim] ' + (where || '') + ' status 非法：' + obj.status);
    }
    if (obj.by === 'ai' && obj.status === 'fact') {
      throw new Error('[assertClaim] ' + (where || '') + ' AI 产出不得标记为 fact');
    }
    return true;
  }

  /**
   * 补全默认值：缺 status 一律降级为 claim。
   * origin: 'user' | 'ai' | 'system'
   */
  function ensureClaim(obj, origin) {
    var o = obj || {};
    if (!STATUS[o.status]) o.status = 'claim';
    if (o.by == null) o.by = origin || 'user';
    if (o.by === 'ai' && (o.status === 'fact' || o.status === 'evidence')) {
      // AI 不能把内容提升到"已确认"，最多到假设
      o.status = 'assumption';
    }
    if (!o.updatedAt) o.updatedAt = new Date().toISOString();
    return o;
  }

  /** 造一条指标（唯一入口） */
  function makeMetric(value, label, opts) {
    opts = opts || {};
    return ensureClaim({
      value: String(value == null ? '' : value),
      label: label || '效果',
      status: opts.status || 'claim',
      source: opts.source || '',
      note: opts.note || '',
      by: opts.by || 'user',
    }, opts.by);
  }

  /**
   * 检查一条指标是否需要提醒用户补来源。
   * 规则引擎能判断的：有无数字、有无来源、是否估算。
   * 需要 LLM 协助的：来源与结论是否对得上（本版本不做）。
   */
  function metricIssue(m) {
    if (!m || !m.value) return 'empty';
    if (m.status === 'unknown') return 'unknown';
    if (!m.source) return 'no-source';
    if (m.note && /估算/.test(m.note)) return 'hedged';
    return '';
  }

  /* ================================================================
   * 数据迁移 v2 -> v3
   * ================================================================ */

  var CURRENT_VERSION = 3;

  function emptyClaim(text) {
    return { text: text || '', status: 'claim', evidence: [], source: '', by: 'user', updatedAt: new Date().toISOString() };
  }

  /**
   * 把任意版本的 profile 升级到 v3。幂等。
   * 原则：不猜测、不补全内容；只补结构，并把既有内容一律标为 claim。
   */
  function migrate(profile) {
    var p = profile && typeof profile === 'object' ? profile : {};
    p.meta = p.meta || {};
    var from = p.meta.version || 1;
    var notes = [];

    // --- meta ---
    p.meta.version = CURRENT_VERSION;
    // T5：mono/noir 主题已裁剪，旧数据归一到 aurora
    if (p.meta.theme === 'mono' || p.meta.theme === 'noir') {
      p.meta.theme = 'aurora';
      notes.push('主题 ' + p.meta.theme + ' 已合并为 aurora');
    }
    p.meta.theme = p.meta.theme || 'aurora';
    p.meta.accent = p.meta.accent || '#2f5eff';
    if (!Array.isArray(p.meta.sources)) p.meta.sources = [];

    // --- hero ---
    p.hero = p.hero || {};
    ['name', 'title', 'tagline', 'location', 'email', 'phone', 'avatar', 'badge'].forEach(function (k) {
      if (p.hero[k] == null) p.hero[k] = '';
    });
    if (!Array.isArray(p.hero.links)) p.hero.links = [];

    // --- 顶层指标 ---
    var topRaw = Array.isArray(p.metrics) ? p.metrics : [];
    p.metrics = topRaw.filter(function (m) { return m && m.value; }).map(function (m) {
      if (m.status) return ensureClaim(m);
      notes.push('顶部指标「' + m.value + '」已标记为待核实');
      return makeMetric(m.value, m.label, { status: 'claim', note: '由 v2 数据升级，来源待补' });
    });

    // --- 经历 ---
    p.experiences = (Array.isArray(p.experiences) ? p.experiences : []).map(function (e) {
      var o = e || {};
      o.company = o.company || '';
      o.role = o.role || '';
      o.start = o.start || '';
      o.end = o.end || '';
      o.current = !!o.current;
      o.location = o.location || '';
      o.summary = o.summary || '';
      o.highlights = (Array.isArray(o.highlights) ? o.highlights : []).filter(Boolean);
      o.tags = Array.isArray(o.tags) ? o.tags : [];
      // 贡献归属：v2 完全没有这个维度，默认 unknown 而不是"独立完成"
      if (!o.contribution) o.contribution = { self: 'unknown', team: '', others: '', ai: '', note: '' };
      o.metrics = (Array.isArray(o.metrics) ? o.metrics : []).filter(function (m) { return m && m.value; })
        .map(function (m) {
          return m.status ? ensureClaim(m) : makeMetric(m.value, m.label, { status: 'claim', note: '由 v2 数据升级，来源待补' });
        });
      o.highlightStatus = o.highlightStatus || o.highlights.map(function () { return 'claim'; });
      return o;
    });

    // --- 项目 ---
    p.projects = (Array.isArray(p.projects) ? p.projects : []).map(function (x) {
      var o = x || {};
      ['name', 'role', 'period', 'context', 'problem', 'approach', 'result', 'link', 'cover'].forEach(function (k) {
        if (o[k] == null) o[k] = '';
      });
      o.tags = Array.isArray(o.tags) ? o.tags : [];
      if (!o.contribution) o.contribution = { self: 'unknown', team: '', others: '', ai: '', note: '' };
      // 新维度：v2 没有，全部置空并在 UI 里显示"待补"，不自动填任何内容
      if (!o.users) o.users = { who: '', scale: '', status: 'unknown' };
      if (!Array.isArray(o.evidenceList)) o.evidenceList = [];
      if (!o.limitations) o.limitations = { text: '', status: 'unknown' };
      if (!o.nextStep) o.nextStep = { text: '', status: 'unknown' };
      if (!o.decision) o.decision = { why: '', alternatives: '', status: 'unknown' };
      // 三个主叙述字段的状态
      o.fields = o.fields || {
        context: { status: 'claim' }, problem: { status: 'claim' },
        approach: { status: 'claim' }, result: { status: 'claim' },
      };
      // v2 的 result 里可能混着"计划"
      o.metrics = (Array.isArray(o.metrics) ? o.metrics : []).filter(function (m) { return m && m.value; })
        .map(function (m) {
          return m.status ? ensureClaim(m) : makeMetric(m.value, m.label, { status: 'claim', note: '由 v2 数据升级，来源待补' });
        });
      return o;
    });

    // --- skills / education / extras ---
    p.skills = p.skills && Array.isArray(p.skills.groups) ? p.skills : { groups: [] };
    p.education = (Array.isArray(p.education) ? p.education : []).map(function (e) {
      var o = e || {};
      ['school', 'degree', 'major', 'start', 'end', 'note'].forEach(function (k) { if (o[k] == null) o[k] = ''; });
      return o;
    });
    p.extras = Array.isArray(p.extras) ? p.extras : [];

    // --- 会话级状态（v3 新增）---
    if (!p.meta.factUnshown) p.meta.factUnshown = false;

    return { profile: p, from: from, notes: notes };
  }

  /* ================================================================
   * 事实清单（供导出前检查使用）
   * ================================================================ */

  /**
   * 汇总所有"不能当作已发生事实"的陈述，供导出前逐条确认。
   * 纯规则，不调用 LLM。
   */
  function buildLedger(profile) {
    var p = profile || {};
    var items = [];

    function push(kind, ref, text, status, extra) {
      items.push(Object.assign({
        kind: kind, ref: ref, text: String(text || '').slice(0, 200),
        status: normalizeStatus(status),
      }, extra || {}));
    }

    (p.metrics || []).forEach(function (m, i) {
      if (!m || !m.value) return;
      var st = m.status || 'claim';
      if (isConfirmed(st) && m.source) return;
      push('顶部指标', 'metrics.' + i, m.value + ' ' + (m.label || ''), st, { source: m.source || '' });
    });

    (p.experiences || []).forEach(function (e, ei) {
      (e.metrics || []).forEach(function (m, mi) {
        if (!m || !m.value) return;
        var st = m.status || 'claim';
        if (isConfirmed(st) && m.source) return;
        push('经历数字', 'experiences.' + ei + '.metrics.' + mi,
          (e.company || '未命名经历') + ' · ' + m.value + ' ' + (m.label || ''), st, { source: m.source || '' });
      });
      if (!e.contribution || e.contribution.self === 'unknown') {
        push('贡献归属', 'experiences.' + ei + '.contribution',
          (e.company || '未命名经历') + ' · 尚未说明你独立完成了哪部分', 'unknown');
      }
    });

    (p.projects || []).forEach(function (x, xi) {
      var name = x.name || '未命名项目';
      // v3：文本在 fields.<k>.text（v2 兼容：顶层 x[k]）
      (['problem', 'approach', 'result', 'context']).forEach(function (k) {
        var f = x.fields && x.fields[k] ? x.fields[k] : null;
        var txt = (f && f.text) || x[k];
        var st = (f && f.status) || 'claim';
        if (!txt) return;
        if (isConfirmed(st)) return;
        push('项目叙述', 'projects.' + xi + '.' + k,
          name + ' · ' + ({ problem: '问题', approach: '做法', result: '结果', context: '背景' })[k] + '：' + txt, st);
      });
      (x.metrics || []).forEach(function (m, mi) {
        if (!m || !m.value) return;
        var st = m.status || 'claim';
        if (isConfirmed(st) && m.source) return;
        push('项目数字', 'projects.' + xi + '.metrics.' + mi,
          name + ' · ' + m.value + ' ' + (m.label || ''), st, { source: m.source || '' });
      });
      if (!x.contribution || x.contribution.self === 'unknown') {
        push('贡献归属', 'projects.' + xi + '.contribution', name + ' · 尚未说明个人与团队/AI 的分工', 'unknown');
      }
      if ((x.evidenceList || []).length === 0) {
        push('证据材料', 'projects.' + xi + '.evidenceList', name + ' · 没有登记任何证据材料', 'unknown');
      }
      if (!x.limitations || !x.limitations.text) {
        push('局限与不足', 'projects.' + xi + '.limitations', name + ' · 尚未说明方案局限', 'unknown');
      } else if (!isConfirmed(x.limitations.status)) {
        push('局限与不足', 'projects.' + xi + '.limitations', name + ' · 局限：' + x.limitations.text, x.limitations.status);
      }
      if (x.nextStep && x.nextStep.text && !isConfirmed(x.nextStep.status)) {
        push('下一步计划', 'projects.' + xi + '.nextStep', name + ' · 计划：' + x.nextStep.text, x.nextStep.status || 'plan');
      }
    });

    // 排序：越需要用户处理越靠前
    var rank = { unknown: 0, assumption: 1, plan: 2, claim: 3, evidence: 4, fact: 5 };
    items.sort(function (a, b) { return (rank[a.status] || 0) - (rank[b.status] || 0); });

    var summary = { total: items.length, unknown: 0, assumption: 0, plan: 0, claim: 0, evidence: 0, fact: 0 };
    items.forEach(function (i) { summary[i.status] = (summary[i.status] || 0) + 1; });

    return { items: items, summary: summary, blocking: summary.unknown + summary.assumption };
  }

  /** 把 profile 里所有 claim 的计数（给 UI 显示"还有 N 处待确认"） */
  function pendingCount(profile) {
    return buildLedger(profile).summary.unknown;
  }

  /* ================================================================
   * 隐私：外部请求清单（供 UI 明确告知）
   * ================================================================ */

  var DATA_FLOW = {
    local: {
      label: '本地处理',
      items: ['你填写的所有内容', '作品集渲染', 'PDF 生成', '本地存储'],
      note: '不会离开你的浏览器',
    },
    link: {
      label: '链接读取（你主动触发才发生）',
      items: ['你粘贴的 URL', '该 URL 所在站点的公开内容'],
      note: 'GitHub 链接请求 api.github.com；其他站点默认不解析',
      host: 'api.github.com',
    },
    llm: {
      label: 'AI 增强（你配置并同意后才发生）',
      items: ['你提交的文本片段', '你的 API Key（放在请求头里）'],
      note: '发往你自己填写的接口地址，不经过本产品任何服务器',
      host: '由你配置',
    },
  };

  global.FactCore = {
    STATUS: STATUS,
    ORDER: ORDER,
    CURRENT_VERSION: CURRENT_VERSION,
    normalizeStatus: normalizeStatus,
    statusMeta: statusMeta,
    isUnverified: isUnverified,
    isConfirmed: isConfirmed,
    parseMetric: parseMetric,
    qualitativeHint: qualitativeHint,
    assertClaim: assertClaim,
    ensureClaim: ensureClaim,
    makeMetric: makeMetric,
    metricIssue: metricIssue,
    emptyClaim: emptyClaim,
    migrate: migrate,
    buildLedger: buildLedger,
    pendingCount: pendingCount,
    DATA_FLOW: DATA_FLOW,
  };
})(typeof window !== 'undefined' ? window : globalThis);
