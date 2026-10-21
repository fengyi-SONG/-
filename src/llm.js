/**
 * llm.js · 可选 AI 润色通道（路线 A：用户自填 OpenAI 兼容接口）
 *
 * 产品红线（不可绕过）：
 *   1. AI 的一切输出只能作为"候选文本"，用户确认后才会写入 profile
 *   2. 写入后状态一律为 assumption（未验证），绝不自动成为 fact
 *   3. AI 不新增任何事实/数字——prompt 明确要求，且改写只作用于当前文本框
 *   4. Key 只存 localStorage，请求直连用户填写的接口
 */
(function (global) {
  'use strict';

  var SYSTEM_PROMPT = [
    '你是一个中文写作助手，帮助求职者润色作品集里的一段话。',
    '铁律（违反任何一条即为失败）：',
    '1. 不得新增任何事实、数字、指标、时间、工具——原文没有的，改写后也不能有。',
    '2. 不得删除原文中的事实，不得改变任何数字的数值和单位。',
    '3. 不得把口语推断改写成确定性结论（例如"我觉得提高了"不能改成"提高了"）。',
    '4. 只做：修通顺、修错别字、口语转书面、去掉重复。',
    '5. 只输出改写后的正文，不要解释、不要引号、不要前后缀。',
    '如果原文太短或没有可改进的，原样返回。'
  ].join('\n');

  /**
   * 调用 OpenAI 兼容接口。
   * @param cfg {baseUrl, apiKey, model}
   * @param text 待润色文本
   * @param context 可选上下文（如"这是项目的问题描述"），只用于语气，不用于补内容
   * @returns {Promise<{ok:true,text:string}|{ok:false,error:string}>}
   */
  function polish(cfg, text, context) {
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return Promise.resolve({ ok: false, error: '未配置 AI 接口，请先在「AI 设置」里填写' });
    }
    var url = String(cfg.baseUrl).replace(/\/+$/, '') + '/chat/completions';
    var userMsg = (context ? '【这段文字是：' + context + '】\n' : '') +
      '请润色下面这段话：\n\n' + text;

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 30000);

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey,
      },
      body: JSON.stringify({
        model: cfg.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
      signal: ctrl.signal,
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) {
        return r.text().then(function (body) {
          var msg = '接口返回 ' + r.status;
          try { msg += '：' + JSON.parse(body).error.message; } catch (e) { if (body) msg += '：' + body.slice(0, 120); }
          return { ok: false, error: msg };
        });
      }
      return r.json().then(function (j) {
        var out = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (!out) return { ok: false, error: '接口返回格式异常' };
        return { ok: true, text: String(out).trim() };
      });
    }).catch(function (e) {
      clearTimeout(timer);
      var msg = e.name === 'AbortError' ? '请求超时（30 秒）' : (e.message || '网络错误');
      return { ok: false, error: msg };
    });
  }

  /** 测试连接：发一条极短消息验证 Key 与地址可用 */
  function testConn(cfg) {
    return polish(cfg, '测试').then(function (r) {
      return r.ok ? { ok: true } : r;
    });
  }

  global.FactLLM = { polish: polish, testConn: testConn };
})(typeof window !== 'undefined' ? window : globalThis);
