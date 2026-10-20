/**
 * inline-edit.js
 * 预览区就地编辑
 *
 * 思路：渲染出来的 DOM 顺序是确定的，按选择器顺序把元素映射到 profile 路径。
 * 开启编辑模式后元素变 contenteditable，失焦时写回 profile 并同步表单。
 */
(function (global) {
  'use strict';

  /**
   * 路径映射表：选择器 -> profile 路径工厂
   * ($el, idx) => 'experiences.0.company'
   */
  var MAP = [
    // hero
    { sel: '.hero h1', path: function () { return 'hero.name'; }, multiline: false },
    { sel: '.hero-role', path: function () { return 'hero.title'; }, multiline: false },
    { sel: '.hero-tag', path: function () { return 'hero.tagline'; }, multiline: true },
    // metrics (bento)
    { sel: '.bento .bcard-k', path: function (el, i) { return 'metrics.' + i + '.value'; }, multiline: false },
    { sel: '.bento .bcard-l', path: function (el, i) { return 'metrics.' + i + '.label'; }, multiline: false },
    // experiences
    { sel: '.xp-org', path: function (el, i) { return 'experiences.' + i + '.company'; }, multiline: false },
    { sel: '.xp-role', path: function (el, i) { return 'experiences.' + i + '.role'; }, multiline: false },
    { sel: '.xp-sum', path: function (el, i) { return 'experiences.' + i + '.summary'; }, multiline: true },
    { sel: '.xp-date', path: function (el, i) { return 'experiences.' + i + '.__date'; }, multiline: false },
    { sel: '.xp-list li', path: function (el, i) {
      // i 是全局 li 序号，需要换算成所属 xp 的第几条
      return { type: 'xpLi', index: i };
    }, multiline: false },
    // projects
    { sel: '.proj-name', path: function (el, i) { return 'projects.' + i + '.name'; }, multiline: false },
    { sel: '.proj-role', path: function (el, i) { return 'projects.' + i + '.role'; }, multiline: false },
    { sel: '.proj-period', path: function (el, i) { return 'projects.' + i + '.period'; }, multiline: false },
    { sel: '.proj-ctx', path: function (el, i) { return 'projects.' + i + '.context'; }, multiline: true },
    { sel: '.psr-row .psr-v', path: function (el) {
      var row = el.closest('.psr');
      var proj = el.closest('.proj');
      var pi = Array.prototype.indexOf.call(document.querySelectorAll('.proj'), proj);
      var ri = Array.prototype.indexOf.call(row.querySelectorAll('.psr-v'), el);
      var keys = ['problem', 'approach', 'result'];
      // 找到这个 row 的 key
      var k = row.querySelectorAll('.psr-k')[ri];
      var label = k ? k.textContent.trim() : '';
      var key = label === '做法' ? 'approach' : (label === '结果' ? 'result' : 'problem');
      return 'projects.' + pi + '.' + key;
    }, multiline: true },
    { sel: '.pm-v', path: function (el) {
      var proj = el.closest('.proj');
      var pi = Array.prototype.indexOf.call(document.querySelectorAll('.proj'), proj);
      var mi = Array.prototype.indexOf.call(proj.querySelectorAll('.pm-v'), el);
      return 'projects.' + pi + '.metrics.' + mi + '.value';
    }, multiline: false },
    { sel: '.pm-l', path: function (el) {
      var proj = el.closest('.proj');
      var pi = Array.prototype.indexOf.call(document.querySelectorAll('.proj'), proj);
      var mi = Array.prototype.indexOf.call(proj.querySelectorAll('.pm-l'), el);
      return 'projects.' + pi + '.metrics.' + mi + '.label';
    }, multiline: false },
    // skills
    { sel: '.skill .tag', path: function (el) {
      var skill = el.closest('.skill');
      var gi = Array.prototype.indexOf.call(document.querySelectorAll('.skills .skill'), skill);
      var ti = Array.prototype.indexOf.call(skill.querySelectorAll('.tag'), el);
      return 'skills.groups.' + gi + '.items.' + ti;
    }, multiline: false },
    // education
    { sel: '.edu-school', path: function (el, i) { return 'education.' + i + '.school'; }, multiline: false },
    { sel: '.edu-deg', path: function (el, i) { return 'education.' + i + '.__degree'; }, multiline: false },
    { sel: '.edu-note', path: function (el, i) { return 'education.' + i + '.note'; }, multiline: true },
  ];

  function get(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function setPath(obj, path, val) {
    var ks = path.split('.');
    var last = ks.pop();
    var t = ks.reduce(function (o, k) { if (o[k] == null) o[k] = {}; return o[k]; }, obj);
    t[last] = val;
  }

  /**
   * 给 iframe 文档打补丁：标注 data-iedit 路径
   * 返回标注数量
   */
  function annotate(doc, profile) {
    var count = 0;
    MAP.forEach(function (m) {
      var els = doc.querySelectorAll(m.sel);
      Array.prototype.forEach.call(els, function (el, i) {
        var path = m.path(el, i);
        if (typeof path === 'object' && path.type === 'xpLi') {
          // 找到所属 xp
          var xp = el.closest('.xp');
          var xi = Array.prototype.indexOf.call(doc.querySelectorAll('.xp'), xp);
          var li = Array.prototype.indexOf.call(xp.querySelectorAll('.xp-list li'), el);
          el.setAttribute('data-iedit', 'experiences.' + xi + '.highlights.' + li);
        } else if (typeof path === 'string') {
          el.setAttribute('data-iedit', path);
        }
        count++;
      });
    });
    return count;
  }

  /**
   * 开/关编辑模式
   */
  function setEditable(doc, on, handlers) {
    var els = doc.querySelectorAll('[data-iedit]');
    Array.prototype.forEach.call(els, function (el) {
      if (on) {
        el.contentEditable = 'true';
        el.style.outline = 'none';
        el.style.cursor = 'text';
        el.classList.add('iedit-on');
        el.__blur = function () {
          var path = el.getAttribute('data-iedit');
          var text = el.innerText.replace(/\n{3,}/g, '\n\n').trim();
          handlers.onChange(path, text, el);
        };
        el.addEventListener('blur', el.__blur);
        // 阻止回车产生 div
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey && el.getAttribute('data-iedit').indexOf('highlights') !== -1) {
            // highlights 支持回车换行 = 新条目？简单起见允许 shift+enter
          }
          if (e.key === 'Escape') el.blur();
        });
        el.addEventListener('focus', function () {
          handlers.onFocus && handlers.onFocus(path2target(el.getAttribute('data-iedit')));
        });
      } else {
        el.contentEditable = 'false';
        el.classList.remove('iedit-on');
        if (el.__blur) { el.removeEventListener('blur', el.__blur); el.__blur = null; }
      }
    });
  }

  function path2target(path) {
    // experiences.0.company -> {type:'experience',index:0}
    var m = path.match(/^(experiences|projects)\.(\d+)/);
    if (m) return { type: m[1] === 'experiences' ? 'experience' : 'project', index: +m[2] };
    return null;
  }

  /**
   * 把失焦后的文本写回 profile
   * 返回是否发生了变化
   */
  function applyEdit(profile, path, text) {
    if (path.endsWith('.__date')) {
      // 日期字段：解析 "2023.07 – 至今"
      var base = path.replace('.__date', '');
      var parts = text.split(/[–—\-~至]+/).map(function (s) { return s.trim(); });
      setPath(profile, base + '.start', parts[0] || '');
      if (/至今/.test(text)) {
        setPath(profile, base + '.end', '');
        setPath(profile, base + '.current', true);
      } else {
        setPath(profile, base + '.end', parts[1] || '');
        setPath(profile, base + '.current', false);
      }
      return true;
    }
    if (path.endsWith('.__degree')) {
      var b2 = path.replace('.__degree', '');
      var ps = text.split('·').map(function (s) { return s.trim(); });
      setPath(profile, b2 + '.degree', ps[0] || '');
      setPath(profile, b2 + '.major', ps[1] || '');
      return true;
    }
    var old = get(profile, path);
    if (old === text) return false;
    setPath(profile, path, text);
    return true;
  }

  global.InlineEdit = {
    annotate: annotate,
    setEditable: setEditable,
    applyEdit: applyEdit,
    path2target: path2target,
  };
})(window);
