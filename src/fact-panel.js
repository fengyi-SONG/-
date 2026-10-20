/**
 * fact-panel.js  ·  T4 事实检查面板
 *
 * 职责：把 FactCore.buildLedger 的结果变成可操作的界面。
 *   1. 逐条列出"还没有依据"的陈述
 *   2. 让用户就地补来源 / 改成假设 / 标记为已确认
 *   3. 导出前强制过一遍，未处理的 unknown 项会提示但**不阻断**（诚实标注也是合格答案）
 */
(function (global) {
  'use strict';

  var FC = global.FactCore;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function get(p, path) {
    return String(path).split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, p);
  }

  /**
   * @param profile 当前 profile
   * @param opts { onFix(path, patch, label) }
   */
  function open(profile, opts) {
    opts = opts || {};
    var led = FC.buildLedger(profile);
    var host = $('#factBody');
    var title = $('#factTitle');
    var stat = $('#factStat');
    if (!host) return;

    title.textContent = led.items.length ? '事实检查 · 还有 ' + led.items.length + ' 处需要你确认' : '事实检查 · 没有发现待确认项';
    stat.innerHTML = led.items.length
      ? '<span class="fs-pill fs-unknown">待补 ' + led.summary.unknown + '</span>' +
        '<span class="fs-pill fs-assume">未验证 ' + led.summary.assumption + '</span>' +
        '<span class="fs-pill fs-plan">计划 ' + led.summary.plan + '</span>' +
        '<span class="fs-pill fs-claim">陈述 ' + led.summary.claim + '</span>'
      : '';

    if (!led.items.length) {
      host.innerHTML = '<div class="fs-empty">所有项目陈述都有依据或已确认。' +
        '<br><span style="color:var(--muted);font-size:12.5px">这不代表内容一定真实，只代表你已经逐条看过一遍。</span></div>';
    } else {
      host.innerHTML = led.items.map(function (it, i) {
        var meta = FC.statusMeta(it.status);
        return '<div class="fs-item" data-i="' + i + '">' +
          '<div class="fs-head">' +
            '<span class="fs-kind">' + esc(it.kind) + '</span>' +
            '<span class="fs-status fs-' + it.status + '">' + esc(meta.label) + '</span>' +
          '</div>' +
          '<div class="fs-text">' + esc(it.text) + '</div>' +
          '<div class="fs-hint">' + esc(meta.hint) + '</div>' +
          '<div class="fs-actions">' +
            '<button class="fs-btn" data-act="confirm">确认属实</button>' +
            (it.kind.indexOf('数字') !== -1 || it.kind.indexOf('指标') !== -1
              ? '<button class="fs-btn" data-act="source">补来源</button>' : '') +
            '<button class="fs-btn" data-act="assume">标为假设</button>' +
            '<button class="fs-btn fs-btn-mute" data-act="ignore">先不管</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // 绑定动作
    var items = host.querySelectorAll('.fs-item');
    Array.prototype.forEach.call(items, function (el) {
      var item = led.items[+el.getAttribute('data-i')];
      el.querySelectorAll('[data-act]').forEach(function (b) {
        b.onclick = function () {
          var act = b.getAttribute('data-act');
          if (act === 'ignore') { el.classList.add('fs-done'); return; }
          if (act === 'confirm') {
            opts.onFix && opts.onFix(item.ref, { status: 'fact' }, '已确认');
            el.classList.add('fs-done');
          }
          if (act === 'assume') {
            opts.onFix && opts.onFix(item.ref, { status: 'assumption' }, '已标为假设');
            el.classList.add('fs-done');
          }
          if (act === 'source') {
            var src = prompt('这个数字是从哪里来的？（如：后台漏斗截图 / 团队周报 / 自己记的笔记）');
            if (src) {
              opts.onFix && opts.onFix(item.ref, { status: 'evidence', source: src }, '已记录来源');
              el.classList.add('fs-done');
            }
          }
          if (opts.onChange) opts.onChange();
        };
      });
    });

    $('#mFact').classList.add('on');
  }

  /**
   * 把面板上的修改写回 profile。
   * ref 形如 metrics.0 / projects.1.problem / projects.0.metrics.2
   */
  function applyFix(profile, ref, patch) {
    var p = profile;
    var ks = String(ref).split('.');
    var target = p;
    for (var i = 0; i < ks.length; i++) {
      if (target == null) return false;
      target = target[ks[i]];
    }
    if (target == null || typeof target !== 'object') return false;
    if (patch.status) target.status = patch.status;
    if (patch.source != null) target.source = patch.source;

    // 如果是项目的叙述字段，同步改 fields.xxx.status
    var m = String(ref).match(/^projects\.(\d+)\.(problem|approach|result)$/);
    if (m && patch.status) {
      var proj = p.projects[+m[1]];
      if (proj && proj.fields && proj.fields[m[2]]) proj.fields[m[2]].status = patch.status;
    }
    // 顶部/项目指标确认后，来源清空则视为"用户口头确认真实"
    if (patch.status === 'fact' && /metrics\.\d+$/.test(ref) && target.source == null) target.source = '作者确认';
    return true;
  }

  global.FactPanel = { open: open, applyFix: applyFix };
})(window);
