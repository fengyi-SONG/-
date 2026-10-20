/**
 * renderer.js
 * 作品集渲染引擎 v2
 *
 * 设计语言（2025-2026 主流作品集审美）：
 *   - 超大字排版 + 紧字距（display type）
 *   - 非对称 / 混合网格，打破中线对称
 *   - Bento 风格数据块
 *   - 克制的单一强调色，大量留白
 *   - 卡片圆角 + 极轻阴影 + 细描边
 *   - 滚动进入的微动效（仅网页版，打印时关闭）
 *
 * 四套主题：aurora(现代科技) / paper(编辑质感) / mono(极简黑白) / noir(深色)
 */
(function (global) {
  'use strict';

  /* ---------------- 数据模型 ---------------- */

  function emptyProfile() {
    return {
      meta: { version: 2, updatedAt: new Date().toISOString(), theme: 'aurora', accent: '#2f5eff', showMotion: true },
      hero: {
        name: '', title: '', tagline: '', location: '', email: '', phone: '',
        links: [], avatar: '', available: true, badge: '',
      },
      metrics: [],
      skills: { groups: [] },
      experiences: [],
      projects: [],
      education: [],
      extras: [],
    };
  }

  function emptyExperience() {
    return { company: '', role: '', start: '', end: '', current: false, location: '', summary: '', highlights: [], tags: [], metrics: [] };
  }
  function emptyProject() {
    return { name: '', role: '', period: '', context: '', problem: '', approach: '', result: '', metrics: [], tags: [], link: '', cover: '' };
  }
  function emptyEducation() {
    return { school: '', degree: '', major: '', start: '', end: '', note: '' };
  }

  /* ---------------- 工具 ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function nl2p(s) {
    if (!s) return '';
    return String(s).split(/\n+/).filter(function (x) { return x.trim(); })
      .map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }

  function dateRange(a, b, cur) {
    var s = (a || '').trim();
    var e = cur ? '至今' : (b || '').trim();
    if (s && e) return esc(s) + '<span class="dash">–</span>' + esc(e);
    return esc(s || e);
  }

  function initials(name) {
    if (!name) return '·';
    var n = name.trim();
    if (/[\u4e00-\u9fa5]/.test(n)) return n.slice(0, /^[\u4e00-\u9fa5]{2,}/.test(n) && n.length <= 3 ? n.length : 1);
    return n.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  }

  function firstChar(name) {
    if (!name) return '·';
    var n = name.trim();
    return /[\u4e00-\u9fa5]/.test(n) ? n.slice(0, 1) : n.slice(0, 1).toUpperCase();
  }

  function hasMetrics(m) {
    return (m || []).filter(function (x) { return x && x.value; });
  }

  /* ---------------- 主题 ---------------- */

  var THEMES = {
    aurora: {
      label: 'Aurora', desc: '现代 · 科技感',
      bg: '#fbfbfd', surface: '#ffffff', text: '#0b0d12', muted: '#6a7080',
      line: '#e8e9ee', soft: '#f3f4f8', radius: '18px',
      display: '"Inter Tight","Inter","Helvetica Neue","PingFang SC",system-ui,sans-serif',
      body: '"Inter","Helvetica Neue","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
      h1: 'clamp(48px,9vw,84px)', weight: 700, tracking: '-0.045em',
      cardShadow: '0 1px 2px rgba(11,13,18,.04), 0 8px 24px -12px rgba(11,13,18,.10)',
      metricBg: 'linear-gradient(160deg,rgba(255,255,255,1),rgba(243,244,248,.6))',
    },
    paper: {
      label: 'Paper', desc: '编辑 · 人文质感',
      bg: '#faf8f3', surface: '#fffefb', text: '#191713', muted: '#6d685d',
      line: '#e5e0d5', soft: '#f2eee4', radius: '3px',
      display: '"Iowan Old Style","Palatino Linotype","Songti SC","Source Han Serif SC",Georgia,serif',
      body: '"Inter","Helvetica Neue","PingFang SC",system-ui,sans-serif',
      h1: 'clamp(44px,8vw,76px)', weight: 500, tracking: '-0.03em',
      cardShadow: '0 1px 2px rgba(25,23,19,.05)',
      metricBg: '#f2eee4',
    },
    mono: {
      label: 'Mono', desc: '极简 · 黑白',
      bg: '#ffffff', surface: '#ffffff', text: '#0a0a0a', muted: '#767676',
      line: '#e4e4e4', soft: '#f6f6f6', radius: '0px',
      display: '"Inter Tight","Helvetica Neue","PingFang SC",system-ui,sans-serif',
      body: '"Inter","Helvetica Neue","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
      h1: 'clamp(46px,8.5vw,78px)', weight: 600, tracking: '-0.05em',
      cardShadow: 'none',
      metricBg: '#f6f6f6',
    },
    noir: {
      label: 'Noir', desc: '深色 · 高级感',
      bg: '#0a0b0d', surface: '#121417', text: '#f4f5f7', muted: '#9298a3',
      line: '#23262c', soft: '#181b1f', radius: '18px',
      display: '"Inter Tight","Inter","Helvetica Neue","PingFang SC",system-ui,sans-serif',
      body: '"Inter","Helvetica Neue","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
      h1: 'clamp(48px,9vw,84px)', weight: 700, tracking: '-0.045em',
      cardShadow: '0 1px 2px rgba(0,0,0,.4), 0 12px 32px -16px rgba(0,0,0,.8)',
      metricBg: 'linear-gradient(160deg,#181b1f,#121417)',
    },
  };

  /* ---------------- CSS ---------------- */

  function buildCSS(p) {
    var t = THEMES[p.meta.theme] || THEMES.aurora;
    var accent = p.meta.accent || '#2f5eff';
    var isDark = p.meta.theme === 'noir';
    var motion = p.meta.showMotion !== false;

    return `
:root{
  --bg:${t.bg}; --surface:${t.surface}; --text:${t.text}; --muted:${t.muted};
  --line:${t.line}; --soft:${t.soft}; --accent:${accent}; --radius:${t.radius};
  --display:${t.display}; --body:${t.body};
  --shadow:${t.cardShadow}; --metric-bg:${t.metricBg};
}
*,*::before,*::after{box-sizing:border-box;}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;}
body{
  margin:0;background:var(--bg);color:var(--text);font-family:var(--body);
  font-size:15px;line-height:1.65;-webkit-font-smoothing:antialiased;
  font-feature-settings:"palt" 1,"cv11" 1;letter-spacing:-0.008em;
}
a{color:inherit;text-decoration:none;}
h1,h2,h3,h4{margin:0;font-weight:600;line-height:1.12;letter-spacing:${t.tracking};}
p{margin:0 0 .72em;}p:last-child{margin-bottom:0;}
ul{margin:0;padding:0;list-style:none;}
img{max-width:100%;display:block;}
::selection{background:var(--accent);color:#fff;}

.wrap{max-width:980px;margin:0 auto;padding:0 40px;}
.wrap-wide{max-width:1180px;margin:0 auto;padding:0 40px;}

/* ============ HERO ============ */
.hero{padding:96px 0 0;position:relative;overflow:hidden;}
.hero::after{
  content:"";position:absolute;top:-30%;right:-15%;width:640px;height:640px;border-radius:50%;
  background:radial-gradient(circle,color-mix(in srgb,var(--accent) 9%,transparent) 0%,transparent 66%);
  pointer-events:none;z-index:0;
}
.hero>.wrap{position:relative;z-index:1;}
.hero-badge{
  display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;
  padding:5px 12px 5px 8px;border-radius:100px;background:color-mix(in srgb,var(--accent) 9%,transparent);
  color:var(--accent);margin-bottom:26px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);
}
.hero-badge .pulse{width:6px;height:6px;border-radius:50%;background:var(--accent);
  box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 60%,transparent);animation:pulse 2.4s infinite;}
@keyframes pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 55%,transparent);}
  70%{box-shadow:0 0 0 7px transparent;}100%{box-shadow:0 0 0 0 transparent;}}
.hero h1{font-family:var(--display);font-size:${t.h1};font-weight:${t.weight};
  letter-spacing:${t.tracking};margin-bottom:18px;}
.hero h1 .thin{font-weight:300;opacity:.42;}
.hero-role{font-size:clamp(17px,2.2vw,21px);font-weight:500;margin-bottom:18px;
  color:var(--text);display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.hero-role .sep{width:4px;height:4px;border-radius:50%;background:var(--accent);display:inline-block;}
.hero-tag{font-size:16.5px;line-height:1.72;color:var(--muted);max-width:56ch;margin-bottom:30px;}
.hero-contacts{display:flex;flex-wrap:wrap;gap:8px;padding-bottom:44px;}
.contact{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--muted);
  padding:6px 13px;border:1px solid var(--line);border-radius:100px;background:var(--surface);
  transition:border-color .2s,color .2s,transform .2s;}
.contact:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-1px);}
.contact svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.7;flex:0 0 auto;}

/* ============ BENTO METRICS ============ */
.bento{display:grid;gap:12px;grid-template-columns:repeat(4,1fr);margin-bottom:8px;}
.bento.n3{grid-template-columns:repeat(3,1fr);}
.bento.n2{grid-template-columns:repeat(2,1fr);}
.bento.n5{grid-template-columns:repeat(5,1fr);}
.bcard{
  background:var(--metric-bg);border:1px solid var(--line);border-radius:var(--radius);
  padding:22px 20px;position:relative;overflow:hidden;transition:transform .3s;
}
.bentex .bcard:hover{transform:translateY(-2px);}
.bcard-k{font-family:var(--display);font-size:clamp(26px,3.4vw,34px);font-weight:700;
  letter-spacing:-0.035em;line-height:1.05;color:var(--text);}
.bcard-k em{font-style:normal;color:var(--accent);}
.bcard-l{font-size:12px;color:var(--muted);margin-top:7px;letter-spacing:0.01em;line-height:1.4;}
.bcard::before{
  content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:radial-gradient(120% 80% at 100% 0%,color-mix(in srgb,var(--accent) 7%,transparent),transparent 60%);
}

/* ============ SECTION ============ */
.sec{padding:76px 0;}
.sec-head{margin-bottom:38px;display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;}
.sec-kicker{font-size:11.5px;letter-spacing:0.16em;text-transform:uppercase;
  color:var(--accent);font-weight:600;margin-bottom:11px;display:flex;align-items:center;gap:9px;}
.sec-kicker::after{content:"";flex:0 0 26px;height:1px;background:var(--accent);opacity:.45;}
.sec-title{font-family:var(--display);font-size:clamp(28px,4vw,38px);font-weight:${t.weight === 500 ? 500 : 700};
  letter-spacing:${t.tracking};}
.sec-sub{font-size:13.5px;color:var(--muted);margin-left:auto;padding-bottom:5px;}

/* ============ EXPERIENCE ============ */
.xp{display:grid;grid-template-columns:190px 1fr;gap:34px;padding:30px 0;
  border-top:1px solid var(--line);}
.xp:first-of-type{border-top:none;padding-top:0;}
.xp-left{position:relative;}
.xp-date{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;
  letter-spacing:0.015em;display:flex;align-items:center;gap:6px;}
.xp-date .dash{opacity:.45;margin:0 1px;}
.xp-cur{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--accent);
  background:color-mix(in srgb,var(--accent) 8%,transparent);padding:2px 7px;border-radius:100px;
  margin-top:8px;width:fit-content;font-weight:500;}
.xp-cur i{width:5px;height:5px;border-radius:50%;background:var(--accent);
  display:inline-block;animation:pulse 2.4s infinite;}
.xp-loc{font-size:12px;color:var(--muted);margin-top:6px;opacity:.85;}
.xp-org{font-family:var(--display);font-size:19px;font-weight:600;letter-spacing:-0.02em;
  margin-bottom:3px;line-height:1.3;}
.xp-role{font-size:14px;color:var(--muted);margin-bottom:14px;}
.xp-sum{font-size:14.5px;margin-bottom:13px;color:var(--text);}
.xp-list{display:grid;gap:9px;}
.xp-list li{position:relative;padding-left:19px;color:var(--muted);font-size:14.5px;line-height:1.68;}
.xp-list li::before{
  content:"";position:absolute;left:0;top:.72em;width:6px;height:1.5px;
  background:var(--accent);border-radius:1px;
}
.xp-mini{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px;}
.xp-mini .m{font-size:12px;padding:4px 10px;background:var(--soft);border-radius:6px;
  color:var(--text);font-variant-numeric:tabular-nums;}
.xp-mini .m b{color:var(--accent);font-weight:600;}

/* ============ TAGS ============ */
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:15px;}
.tag{font-size:11.5px;padding:4px 10px;border-radius:100px;border:1px solid var(--line);
  color:var(--muted);background:var(--surface);letter-spacing:0.005em;}

/* ============ PROJECT ============ */
.proj{border:1px solid var(--line);background:var(--surface);border-radius:calc(var(--radius) * 1.2);
  overflow:hidden;margin-bottom:18px;box-shadow:var(--shadow);transition:box-shadow .3s,transform .3s;}
.projen .proj:hover{box-shadow:0 2px 4px rgba(11,13,18,.05),0 16px 40px -16px rgba(11,13,18,.16);}
.proj-cover{width:100%;aspect-ratio:16/6.5;object-fit:cover;background:var(--soft);}
.proj-in{padding:32px 34px 30px;}
.proj-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:5px;}
.proj-name{font-family:var(--display);font-size:23px;font-weight:700;letter-spacing:-0.028em;
  line-height:1.25;}
.proj-period{font-size:12px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;
  padding-top:5px;}
.proj-role{font-size:13.5px;color:var(--accent);font-weight:500;margin-bottom:18px;}
.proj-ctx{font-size:13.5px;color:var(--muted);line-height:1.68;padding:13px 16px;
  background:var(--soft);border-radius:10px;margin-bottom:22px;}
.psr{display:grid;gap:18px;margin-bottom:4px;}
.psr-row{display:grid;grid-template-columns:72px 1fr;gap:18px;align-items:start;}
.psr-k{font-size:11px;letter-spacing:0.11em;text-transform:uppercase;color:var(--accent);
  font-weight:600;padding-top:4px;}
.psr-v{font-size:14.5px;color:var(--text);line-height:1.7;}
.proj-metrics{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);
  border-radius:10px;overflow:hidden;margin-top:24px;
  grid-template-columns:repeat(auto-fit,minmax(120px,1fr));}
.pm{background:var(--surface);padding:16px 16px 15px;}
.pm-v{font-family:var(--display);font-size:23px;font-weight:700;color:var(--accent);
  letter-spacing:-0.03em;line-height:1.1;}
.pm-l{font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.35;}
.proj-foot{display:flex;align-items:center;gap:14px;margin-top:20px;flex-wrap:wrap;}
.proj-link{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:var(--accent);
  font-weight:500;border-bottom:1px solid color-mix(in srgb,var(--accent) 35%,transparent);
  padding-bottom:1px;transition:border-color .2s;}
.proj-link:hover{border-bottom-color:var(--accent);}

/* ============ SKILLS ============ */
.skills{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;}
.skill{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
  padding:22px 22px 20px;}
.skill h4{font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;color:var(--accent);
  font-weight:600;margin-bottom:13px;}
.skill .tags{margin-top:0;gap:7px;}
.skill .tag{background:var(--soft);border-color:transparent;color:var(--text);font-size:12.5px;
  padding:5px 11px;}

/* ============ EDU ============ */
.edu{display:grid;grid-template-columns:190px 1fr;gap:34px;padding:20px 0;
  border-top:1px solid var(--line);}
.edu:first-of-type{border-top:none;padding-top:0;}
.edu-school{font-family:var(--display);font-size:17px;font-weight:600;letter-spacing:-0.02em;}
.edu-deg{font-size:13.5px;color:var(--muted);margin-top:3px;}
.edu-note{font-size:13px;color:var(--muted);margin-top:8px;}

/* ============ FOOT ============ */
.foot{padding:70px 0 80px;border-top:1px solid var(--line);margin-top:20px;}
.foot-in{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;}
.foot-big{font-family:var(--display);font-size:clamp(24px,3.6vw,34px);font-weight:700;
  letter-spacing:-0.035em;line-height:1.2;}
.foot-big em{font-style:normal;color:var(--accent);}
.foot-meta{font-size:12.5px;color:var(--muted);text-align:right;line-height:1.7;}

/* ============ EMPTY ============ */
.empty-ph{border:1px dashed var(--line);border-radius:var(--radius);padding:38px;
  text-align:center;color:var(--muted);font-size:13.5px;}

/* ============ MOTION ============ */
${motion ? `
.reveal{opacity:0;transform:translateY(18px);transition:opacity .7s cubic-bezier(.2,.7,.3,1),transform .7s cubic-bezier(.2,.7,.3,1);}
.reveal.in{opacity:1;transform:none;}
` : ''}

/* ============ RESPONSIVE ============ */
@media (max-width:820px){
  .wrap,.wrap-wide{padding:0 22px;}
  .hero{padding-top:56px;}
  .hero-contacts{padding-bottom:32px;}
  .bento,.bento.n3,.bento.n4,.bento.n5{grid-template-columns:repeat(2,1fr);}
  .bento .bcard:first-child{grid-column:span 2;}
  .sec{padding:54px 0;}
  .xp,.edu{grid-template-columns:1fr;gap:10px;}
  .xp-left{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
  .xp-date{font-size:12px;}
  .psr-row{grid-template-columns:1fr;gap:4px;}
  .proj-in{padding:24px 22px;}
  .proj-top{flex-direction:column;gap:4px;}
  .sec-sub{margin-left:0;width:100%;padding-bottom:0;margin-top:-8px;}
  .foot-in{flex-direction:column;align-items:flex-start;gap:16px;}
  .foot-meta{text-align:left;}
}
@media (max-width:480px){
  .bento,.bento.n3,.bento.n4,.bento.n5{grid-template-columns:1fr;}
  .bento .bcard:first-child{grid-column:span 1;}
}

/* ============ PRINT ============ */
@page{size:A4;margin:12mm 14mm;}
@media print{
  :root{--shadow:none !important;}
  body{font-size:10.5pt;background:#fff !important;color:#000 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .wrap,.wrap-wide{max-width:none;padding:0;}
  .hero{padding-top:0;}
  .hero::after{display:none;}
  .sec{padding:22px 0;break-inside:auto;}
  .reveal{opacity:1 !important;transform:none !important;}
  .proj,.xp,.bcard,.skill,.edu,.pm{break-inside:avoid;}
  .sec-head{break-after:avoid;margin-bottom:18px;}
  .proj{margin-bottom:12px;box-shadow:none;}
  .proj-in{padding:20px 22px;}
  .no-print{display:none !important;}
  a{text-decoration:none;color:inherit;}
  .hero h1{font-size:34pt;}
  .sec-title{font-size:17pt;}
  .proj-name{font-size:14pt;}
  .bcard-k{font-size:18pt;}
  .proj-cover{max-height:52mm;}
}
`;
  }

  /* ---------------- 图标 ---------------- */

  var ICONS = {
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  };

  /* ---------------- 渲染各区块 ---------------- */

  function renderHero(p) {
    var h = p.hero || {};
    if (!h.name && !h.title) {
      return '<header class="hero"><div class="wrap"><h1 class="reveal">' +
        '<span class="thin">你的</span> 名字</h1>' +
        '<div class="hero-role">在这里写一句话定位</div>' +
        '<p class="hero-tag">右边聊几句，这里就会自动长成一份作品集。</p>' +
        '</div></header>';
    }

    var contacts = [];
    if (h.location) contacts.push('<span class="contact">' + ICONS.pin + esc(h.location) + '</span>');
    if (h.email) contacts.push('<a class="contact" href="mailto:' + esc(h.email) + '">' + ICONS.mail + esc(h.email) + '</a>');
    if (h.phone) contacts.push('<span class="contact">' + ICONS.phone + esc(h.phone) + '</span>');
    (h.links || []).forEach(function (l) {
      if (!l || !l.url) return;
      var label = l.label || l.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      contacts.push('<a class="contact" href="' + esc(l.url) + '" target="_blank" rel="noopener">' +
        ICONS.link + esc(label) + '</a>');
    });

    // 姓名拆分：最后一个词做强调
    var nameHtml = esc(h.name || '');
    var nm = (h.name || '').trim();
    if (nm.length > 2 && /[\u4e00-\u9fa5]/.test(nm) && nm.length <= 4) {
      nameHtml = '<span class="thin">' + esc(nm.slice(0, nm.length - 2)) + '</span>' + esc(nm.slice(nm.length - 2));
      if (nm.length === 2) nameHtml = esc(nm);
    } else if (/\s/.test(nm)) {
      var parts = nm.split(/\s+/);
      var last = parts.pop();
      nameHtml = '<span class="thin">' + esc(parts.join(' ')) + '</span> ' + esc(last);
    }

    var roleBits = [];
    if (h.title) roleBits.push(esc(h.title));

    return [
      '<header class="hero"><div class="wrap">',
      h.available !== false
        ? '<div class="hero-badge"><span class="pulse"></span>' + esc(h.badge || '正在寻找机会') + '</div>'
        : '',
      '<h1 class="reveal">' + nameHtml + '</h1>',
      roleBits.length ? '<div class="hero-role reveal">' + roleBits.join('<span class="sep"></span>') + '</div>' : '',
      h.tagline ? '<p class="hero-tag reveal">' + nl2p(h.tagline) + '</p>' : '',
      contacts.length ? '<div class="hero-contacts reveal">' + contacts.join('') + '</div>' : '<div style="height:34px"></div>',
      '</div></header>',
    ].join('');
  }

  function renderMetrics(p) {
    var ms = hasMetrics(p.metrics);
    if (!ms.length) return '';
    var n = ms.length;
    return '<div class="wrap"><div class="bento n' + Math.min(n, 5) + ' reveal">' +
      ms.map(function (m) {
        // 把数字里的 % 或正负号高亮
        var v = esc(m.value);
        v = v.replace(/^([+\-]?)([\d.]+)(.*)$/, '$1<em>$2</em>$3');
        return '<div class="bcard"><div class="bcard-k">' + v + '</div>' +
          '<div class="bcard-l">' + esc(m.label) + '</div></div>';
      }).join('') + '</div></div>';
  }

  function secHead(kicker, title, sub) {
    return '<div class="sec-head reveal"><div>' +
      '<div class="sec-kicker">' + esc(kicker) + '</div>' +
      '<h2 class="sec-title">' + esc(title) + '</h2></div>' +
      (sub ? '<div class="sec-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function renderExperiences(p) {
    var list = (p.experiences || []).filter(function (e) { return e && (e.company || e.role || (e.highlights || []).length); });
    if (!list.length) return '';
    var body = list.map(function (e) {
      var left = '<div class="xp-left">' +
        '<div class="xp-date">' + dateRange(e.start, e.end, e.current) + '</div>' +
        (e.current ? '<div class="xp-cur"><i></i>至今</div>' : '') +
        (e.location ? '<div class="xp-loc">' + esc(e.location) + '</div>' : '') +
        '</div>';
      var ms = hasMetrics(e.metrics);
      return '<div class="xp reveal">' + left + '<div>' +
        '<div class="xp-org">' + esc(e.company || '') + '</div>' +
        (e.role ? '<div class="xp-role">' + esc(e.role) + '</div>' : '') +
        (e.summary ? '<div class="xp-sum">' + nl2p(e.summary) + '</div>' : '') +
        ((e.highlights || []).filter(Boolean).length
          ? '<ul class="xp-list">' + e.highlights.filter(Boolean).map(function (x) {
            return '<li>' + esc(x) + '</li>';
          }).join('') + '</ul>' : '') +
        (ms.length ? '<div class="xp-mini">' + ms.map(function (m) {
          return '<span class="m"><b>' + esc(m.value) + '</b> ' + esc(m.label) + '</span>';
        }).join('') + '</div>' : '') +
        ((e.tags || []).length ? '<div class="tags">' + e.tags.map(function (t) {
          return '<span class="tag">' + esc(t) + '</span>';
        }).join('') + '</div>' : '') +
        '</div></div>';
    }).join('');
    return '<section class="sec"><div class="wrap">' +
      secHead('Experience', '经历', '按时间倒序') + body + '</div></section>';
  }

  function renderProjects(p) {
    var list = (p.projects || []).filter(function (x) { return x && (x.name || x.problem || x.approach); });
    if (!list.length) return '';
    var body = list.map(function (x) {
      var rows = [];
      if (x.problem) rows.push(['问题', x.problem]);
      if (x.approach) rows.push(['做法', x.approach]);
      if (x.result) rows.push(['结果', x.result]);
      var ms = hasMetrics(x.metrics);

      return '<article class="proj reveal">' +
        (x.cover ? '<img class="proj-cover" src="' + esc(x.cover) + '" alt="">' : '') +
        '<div class="proj-in">' +
        '<div class="proj-top"><h3 class="proj-name">' + esc(x.name || '') + '</h3>' +
        (x.period ? '<span class="proj-period">' + esc(x.period) + '</span>' : '') + '</div>' +
        (x.role ? '<div class="proj-role">' + esc(x.role) + '</div>' : '') +
        (x.context ? '<div class="proj-ctx">' + nl2p(x.context) + '</div>' : '') +
        (rows.length ? '<div class="psr">' + rows.map(function (r) {
          return '<div class="psr-row"><div class="psr-k">' + esc(r[0]) + '</div>' +
            '<div class="psr-v">' + nl2p(r[1]) + '</div></div>';
        }).join('') + '</div>' : '') +
        (ms.length ? '<div class="proj-metrics">' + ms.map(function (m) {
          return '<div class="pm"><div class="pm-v">' + esc(m.value) + '</div>' +
            '<div class="pm-l">' + esc(m.label) + '</div></div>';
        }).join('') + '</div>' : '') +
        '<div class="proj-foot">' +
        ((x.tags || []).length ? '<div class="tags" style="margin:0">' + x.tags.map(function (t) {
          return '<span class="tag">' + esc(t) + '</span>';
        }).join('') + '</div>' : '') +
        (x.link ? '<a class="proj-link" href="' + esc(x.link) + '" target="_blank" rel="noopener">查看项目' + ICONS.arrow + '</a>' : '') +
        '</div></div></article>';
    }).join('');
    return '<section class="sec"><div class="wrap">' +
      secHead('Selected Work', '项目', list.length + ' 个案例') + body + '</div></section>';
  }

  function renderSkills(p) {
    var groups = ((p.skills && p.skills.groups) || []).filter(function (g) {
      return g && (g.items || []).filter(Boolean).length;
    });
    if (!groups.length) return '';
    return '<section class="sec"><div class="wrap">' + secHead('Capabilities', '能力') +
      '<div class="skills">' + groups.map(function (g) {
        return '<div class="skill reveal"><h4>' + esc(g.name || '技能') + '</h4><div class="tags">' +
          (g.items || []).filter(Boolean).map(function (i) {
            return '<span class="tag">' + esc(i) + '</span>';
          }).join('') + '</div></div>';
      }).join('') + '</div></div></section>';
  }

  function renderEducation(p) {
    var list = (p.education || []).filter(function (e) { return e && (e.school || e.degree); });
    if (!list.length) return '';
    return '<section class="sec"><div class="wrap">' + secHead('Education', '教育') +
      list.map(function (e) {
        return '<div class="edu reveal"><div class="xp-date">' + dateRange(e.start, e.end, false) + '</div>' +
          '<div><div class="edu-school">' + esc(e.school) + '</div>' +
          '<div class="edu-deg">' + [e.degree, e.major].filter(Boolean).map(esc).join(' · ') + '</div>' +
          (e.note ? '<div class="edu-note">' + nl2p(e.note) + '</div>' : '') + '</div></div>';
      }).join('') + '</div></section>';
  }

  function renderExtras(p) {
    var list = (p.extras || []).filter(function (e) { return e && (e.title || e.detail); });
    if (!list.length) return '';
    return '<section class="sec"><div class="wrap">' + secHead('More', '其他') +
      '<div class="skills">' + list.map(function (e) {
        return '<div class="skill reveal"><h4>' + esc(e.title || '') + '</h4>' +
          '<div style="font-size:13.5px;color:var(--muted);line-height:1.65">' + nl2p(e.detail) + '</div></div>';
      }).join('') + '</div></div></section>';
  }

  function renderFooter(p) {
    var h = p.hero || {};
    if (!h.name) return '';
    return '<footer class="foot"><div class="wrap"><div class="foot-in">' +
      '<div class="foot-big">一起做点 <em>有意思</em> 的事？</div>' +
      '<div class="foot-meta">' +
      (h.email ? '<div><a href="mailto:' + esc(h.email) + '">' + esc(h.email) + '</a></div>' : '') +
      (h.name ? '<div style="margin-top:4px">' + esc(h.name) + ' · 作品集</div>' : '') +
      '</div></div></div></footer>';
  }

  /* ---------------- 动效脚本 ---------------- */
  function motionScript() {
    return '<script>(function(){' +
      'var els=document.querySelectorAll(".reveal");' +
      'if(!("IntersectionObserver" in window)){els.forEach(function(e){e.classList.add("in")});return;}' +
      'var io=new IntersectionObserver(function(en){' +
      'en.forEach(function(x){if(x.isIntersecting){x.target.classList.add("in");io.unobserve(x.target);}});' +
      '},{threshold:0.08,rootMargin:"0px 0px -40px 0px"});' +
      'els.forEach(function(e,i){e.style.transitionDelay=(Math.min(i,4)*40)+"ms";io.observe(e);});' +
      '})();<\/script>';
  }

  /* ---------------- 主渲染 ---------------- */

  function renderBody(p) {
    return [
      renderHero(p),
      renderMetrics(p),
      renderExperiences(p),
      renderProjects(p),
      renderSkills(p),
      renderEducation(p),
      renderExtras(p),
      renderFooter(p),
    ].join('\n');
  }

  function renderDocument(profile, opts) {
    opts = opts || {};
    var p = JSON.parse(JSON.stringify(profile || emptyProfile()));
    var title = (p.hero && p.hero.name) ? p.hero.name + ' · 作品集' : '我的作品集';
    var desc = [p.hero && p.hero.title, p.hero && p.hero.tagline].filter(Boolean).join(' — ');
    var accent = p.meta.accent || '#2f5eff';

    return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<title>' + esc(title) + '</title>\n' +
      (desc ? '<meta name="description" content="' + esc(desc.slice(0, 150)) + '">\n' : '') +
      '<meta name="theme-color" content="' + esc(accent) + '">\n' +
      '<meta property="og:title" content="' + esc(title) + '">\n' +
      (desc ? '<meta property="og:description" content="' + esc(desc.slice(0, 150)) + '">\n' : '') +
      '<style>\n' + buildCSS(p) + '\n</style>\n' +
      '</head>\n<body>\n' + renderBody(p) + '\n' +
      (opts.motion !== false ? motionScript() : '') +
      '\n</body>\n</html>';
  }

  /* ---------------- 示例 ---------------- */

  function sampleProfile() {
    return {
      meta: { version: 2, updatedAt: new Date().toISOString(), theme: 'aurora', accent: '#2f5eff', showMotion: true },
      hero: {
        name: '林澈', title: '增长产品经理 · 消费与内容方向',
        tagline: '擅长把模糊的增长问题拆成可验证的产品假设。过去三年主导四个从 0 到 1 的实验，其中两个沉淀为公司长期的营收增长线。',
        location: '上海', email: 'linche@example.com', phone: '',
        links: [{ label: '即刻', url: 'https://web.okjike.com' }, { label: '博客', url: 'https://example.com' }],
        avatar: '', available: true, badge: '正在寻找产品经理机会',
      },
      metrics: [
        { value: '+38%', label: '核心转化率提升' },
        { value: '2 条', label: '沉淀为长期增长线' },
        { value: '12 个', label: '主导 A/B 实验' },
        { value: '3 年', label: '产品相关经验' },
      ],
      skills: {
        groups: [
          { name: 'Product', items: ['需求分析', '用户访谈', 'MVP 设计', '指标体系', 'PRD 撰写'] },
          { name: 'Data', items: ['SQL', 'Mixpanel', 'A/B 实验设计', '漏斗归因'] },
          { name: 'Collaboration', items: ['跨团队推进', 'OKR 对齐', '向上沟通'] },
        ],
      },
      experiences: [
        {
          company: '某内容社区公司', role: '增长产品经理', start: '2023.07', end: '', current: true,
          location: '上海', summary: '负责新用户激活与留存链路，向增长负责人汇报。',
          highlights: [
            '拆解新用户 7 日留存漏斗，定位 3 个关键流失节点，设计分群引导策略，7 日留存从 24% 提升至 31%。',
            '主导创作者激励机制改版，联动设计与运营上线，优质内容产出量提升 1.6 倍。',
            '搭建实验看板，把每次灰度从 2 周缩短到 4 天。',
          ],
          tags: ['增长', '留存', '实验平台'],
          metrics: [{ value: '+7pt', label: '7 日留存' }, { value: '×1.6', label: '优质内容产出' }],
        },
        {
          company: '某电商平台', role: '产品运营实习生', start: '2022.06', end: '2022.09',
          current: false, location: '杭州', summary: '大促期间的用户侧活动运营。',
          highlights: [
            '独立负责 3 场站内活动的全流程落地，单场最高带来 18 万次访问。',
            '建立活动复盘模板，被团队沿用为季度标准流程。',
          ],
          tags: ['活动运营', '大促'], metrics: [],
        },
      ],
      projects: [
        {
          name: '新用户引导重构', role: '产品负责人（个人主导）', period: '2024.03 – 2024.08',
          context: '新用户首日流失率长期高于行业均值，团队对原因存在分歧，且缺乏可靠的归因数据。',
          problem: '在不增加投放预算的前提下把首日激活率提上去，并让团队对"流失原因"形成一致判断。',
          approach: '先用 20 场用户访谈加漏斗下钻建立归因假设，再按假设优先级排期做三轮灰度实验，每轮只改一个变量。',
          result: '首日激活率从 41% 提升到 55%，7 日留存提升 7pt，方案被纳入季度核心 OKR。',
          metrics: [
            { value: '+14pt', label: '首日激活率' },
            { value: '+7pt', label: '7 日留存' },
            { value: '3 轮', label: '灰度验证' },
          ],
          tags: ['增长', '实验设计', '用户研究'], link: '', cover: '',
        },
        {
          name: '创作者激励体系改版', role: '产品经理 + 项目协调', period: '2023.11 – 2024.02',
          context: '原激励规则只看播放量，导致创作者产出大量同质化内容，优质率持续下滑。',
          problem: '在预算不变的情况下，让激励真正指向「优质内容」而不是「流量」。',
          approach: '设计多维度质量评分，用历史数据回测不同权重组合，再以小流量验证规则稳定性。',
          result: '优质内容产出量提升 1.6 倍，创作者投诉率下降 40%，规则沿用至今。',
          metrics: [{ value: '×1.6', label: '优质内容产出' }, { value: '-40%', label: '投诉率' }],
          tags: ['机制设计', '数据回测'], link: '', cover: '',
        },
      ],
      education: [
        { school: '某 211 大学', degree: '本科', major: '信息管理与信息系统', start: '2019.09', end: '2023.06', note: 'GPA 3.7/4.0 · 校级优秀毕业生' },
      ],
      extras: [
        { title: 'Awards', detail: '全国大学生商业案例分析大赛 华东赛区二等奖' },
        { title: 'Certificates', detail: 'Google Analytics 认证 · 英语专八' },
      ],
    };
  }

  global.Renderer = {
    emptyProfile: emptyProfile,
    emptyExperience: emptyExperience,
    emptyProject: emptyProject,
    emptyEducation: emptyEducation,
    renderDocument: renderDocument,
    renderBody: renderBody,
    sampleProfile: sampleProfile,
    buildCSS: buildCSS,
    THEMES: THEMES,
    esc: esc,
    nl2p: nl2p,
  };
})(window);
