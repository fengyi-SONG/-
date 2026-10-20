# Portfolio Forge 产品需求文档（PRD）

> 版本 v3.0 · 2026-10-20 · 纯前端开源工具

---

## 1. 产品概述

### 1.1 一句话定位

一个**纯前端、零后端、开箱即用**的 AI 作品集生成工作台：通过逐题引导式问答，把任何水平用户（包括零经历学生）的经历变成一份可分享的网页作品集和可投递的 PDF。

### 1.2 要解决的问题

| 现状痛点                 | Portfolio Forge 的方案                       |
| -------------------- | ----------------------------------------- |
| 不会写作品集：不知道放什么、怎么描述   | 逐题引导 + 岗位工具库自动给选项                         |
| 零经历 / 零基础：没什么可讲的     | 素材盘点覆盖课程/社团/比赛/自制项目；完全空白时提供"一周可完成"的造项目选题  |
| 一让说经历就卡壳（"笼统问一长串"）   | **一次只问一个问题**，每个问题带示例句式、快捷填空和可勾选建议         |
| 描述没数字，没有说服力          | 岗位常用指标提示（如产品岗：留存率/转化率/DAU），引导用户给出哪怕估计值    |
| 项目信息散落在 GitHub/文章链接里 | 粘贴链接自动读取（GitHub API / 只读代理），自动回填项目名、描述、标签 |
| 做完不能改，只能重新生成         | 就地编辑：预览区点哪改哪，失焦即存                         |

### 1.3 目标用户（Persona）

- **P1 主用户：零经历在校生**（找实习）。不会写、没素材、怕麻烦。核心诉求：有人带着问、告诉我放什么。
- **P2 次用户：1-3 年职场人**（跳槽）。有素材但表达不成体系。核心诉求：快速结构化 + 量化润色。
- **P3 轻用户：转行者**。有可迁移能力但无对口经历。核心诉求：帮我把已有的事"翻译"成目标岗位语言。

### 1.4 产品原则

1. **一次只问一个问题**——永远不让用户面对空白输入框发呆
2. **能点选的不打字**——所有开放问题尽量提供可勾选项
3. **不编造事实**——AI 只润色表达、补充表达框架，数字必须来自用户或标注"约"
4. **本地优先**——无 Key 全功能可用，数据不出浏览器
5. **生成即可改**——没有"最终版"概念，随时就地编辑

---

## 2. 功能规格

### 2.1 模块总览

```
┌─────────────────────────────────────────────────────┐
│                    index.html 工作台                  │
│  左：逐题向导（一问一答）   │   右：实时预览 + 就地编辑  │
└─────────────────────────────────────────────────────┘
        │                │              │             │
   wizard-engine    role-kit       inline-edit    renderer
   （流程编排）    （岗位知识库）   （就地编辑）    （渲染引擎）
        │
   interview-engine（追问权重评分 / LLM 通道，自由模式复用）
```

### 2.2 F1 逐题引导式访谈（核心）

**目标**：用户平均 15-20 个问题内完成一份完整作品集。

**流程状态机**：

```
了解你 → 素材盘点 → 经历(逐条×N) → 项目(逐个×N) → 技能 → 教育 → 联系 → 完成
```

| #  | 步骤 ID               | 问题     | 输入形式   | 关键设计                    |
| -- | ------------------- | ------ | ------ | ----------------------- |
| 1  | name                | 怎么称呼你  | 文本     | —                       |
| 2  | targetRole          | 想找什么方向 | 单选+自定义 | 选项来自岗位库（10 类）           |
| 3  | year                | 所处阶段   | 单选     | 「转行/零经验」触发差异化路径         |
| 4  | hasExp              | 素材盘点   | **多选** | 实习/课设/社团/比赛/自制；全空→造项目路径 |
| 5+ | exp.*               | 逐条经历   | 混合     | 公司→岗位→时间→勾选任务→讲细节→给数字   |
| …  | proj.*              | 逐个项目   | 混合     | 名称→**读链接**→问题→做法→结果→数字  |
| …  | skills              | 用过哪些工具 | **多选** | 选项=该岗位常用工具+方法           |
| …  | education / contact | 教育/联系  | 结构化表单  | —                       |

**每个问题必须包含**：

- 标题 + 一句说明（为什么问 / 什么算好答案）
- 输入控件（choice / multi / text / longtext / date / metric / link / confirm）
- 可跳过时明确显示「跳过」按钮
- 必答缺失时不允许进入下一题（toast 提示）

**长文本题（detail / problem / approach / result）额外提供**：

- 示例句式（📝 建议句式：当时【遇到什么问题】，我【怎么做的】，最后【结果】）
- 岗位相关的可点击补充词（点一下追加到输入框）
- Ctrl+Enter 快速提交

**上一步**：每一步的 profile 快照入栈，可无限回退修改。

### 2.3 F2 岗位工具箱知识库（role-kit）

内置 10 类岗位的静态知识库：

| 字段        | 内容            | 用在哪                 |
| --------- | ------------- | ------------------- |
| `tools`   | 8-14 个常用工具    | 技能题选项               |
| `methods` | 6-8 个方法论/工作动作 | 做法、任务题的建议 chips     |
| `metrics` | 5-7 个常用指标     | 数字题的提示（"这个岗位常用的指标"） |
| `tasks`   | 4-5 个典型工作内容   | 经历"你做了什么"的多选选项      |
| `starter` | 零经历造项目选题      | 素材盘点为空时主动给出         |

岗位识别：别名匹配（如"新媒体运营"→运营），未命中走通用兜底库。

**验收**：`RK.match('新媒体运营').key === '运营'`；`RK.metricHints('产品经理')` 返回含"留存率"。

### 2.4 F3 链接读取

| 场景          | 实现                                            | 降级                |
| ----------- | --------------------------------------------- | ----------------- |
| GitHub 仓库链接 | 公开 API（无需 Key）→ 仓库名/描述/语言/topics/star         | —                 |
| 其他网页        | `r.jina.ai` 只读代理取 markdown → 抽标题/描述/正文前 400 字 | 失败→只解析域名，提示用户手动补充 |

读取结果以卡片展示（✓ 已读取 / ⚠ 只拿到域名），自动建议回填：项目名、背景、标签。用户确认后才写入。

**验收**：贴 `github.com/facebook/react` → 自动填入项目名 `react`、描述、标签含 `react/javascript`。

### 2.5 F4 就地编辑

- 预览 iframe 内所有关键文本（姓名、定位、要点、项目数据…）绑定 `data-iedit` 路径
- 开启编辑模式后 contenteditable，失焦写回 profile 并持久化
- 特殊字段：日期（`2023.07 – 至今` 自动拆 start/end/current）、教育（`本科 · 专业` 拆两字段）

### 2.6 F5 自由输入模式（老手通道）

右上角「⏭ 我要一次性说」：整段粘贴 → 正则拆解（姓名/公司/岗位/时间/要点/数字/技能）→ 一次性填充 → 回到逐题模式补缺口。

### 2.7 F6 渲染与导出

- **4 主题**：Aurora / Paper / Mono / Noir；**6 主色**即时切换
- 布局：超大字 Hero、Bento 数据条、项目卡（问题→做法→结果+指标网格）、技能卡、响应式
- 导出 HTML：单文件、内联全部样式、含 meta/og 标签、滚动动效
- 导出 PDF：html2pdf.js（本地打包）生成 A4；失败自动降级 `window.print()`（已内置 `@page` 与分页避免规则）

### 2.8 F7 可选 LLM 增强

任意 OpenAI 兼容接口（DeepSeek/通义/OpenAI）。Key 仅存本机 localStorage。  
LLM 用于：自由文本更自然的解析、扩写润色。**本地规则引擎与逐题向导完全离线可用**——LLM 是增强而非依赖。

---

## 3. 数据结构

### 3.1 Profile（v2 schema，localStorage 持久化）

```js
{
  meta: { version:2, theme:'aurora', accent:'#2f5eff', stage:'', srcScanned:false,
          sources:[], expDone/projDone/skillDone/eduDone/contactDone:bool },
  hero: { name, title, tagline, location, email, phone, links:[{label,url}], available },
  metrics: [{value,label}],          // 顶部数据条（自动 derive + 可手改）
  experiences: [{ company, role, start, end, current, summary,
                  highlights:[], tags:[], metrics:[{value,label}] }],
  projects:  [{ name, role, period, context, problem, approach, result,
                metrics:[], tags:[], link, cover }],
  skills: { groups:[{name, items:[]}] },
  education: [{ school, degree, major, start, end, note }],
  extras: [{ title, detail }],
}
```

### 3.2 Step（向导题目对象）

```js
{ id, phase, title, subtitle, tip,
  input:'choice|multi|text|longtext|date|metric|link|confirm',
  options:[{label,value,hint}], allowCustom, customPlaceholder,
  metricHints:[], suggestions:[], fields:[{key,placeholder}],
  skippable, index, targetType, isNew }
```

---

## 4. 非功能需求

| 项   | 要求                                           |
| --- | -------------------------------------------- |
| 隐私  | 数据仅 localStorage；无后端、无埋点；Key 不上传             |
| 离线  | 断网时除"链接读取/LLM"外全部可用                          |
| 性能  | 首屏 < 1s（无框架、无构建）；预览防抖 160ms                  |
| 兼容  | Chrome/Edge/Firefox/Safari 近两年版本             |
| 无障碍 | 选项为 `<button>` 可键盘操作；Ctrl+Enter 提交、Ctrl+E 编辑 |
| 安全  | 所有用户输入渲染前 HTML 转义（XSS 测试覆盖）                  |

---

## 5. 验收标准

- [x] 零经历用户走完向导能产出完整作品集（含自动造项目建议）
- [x] 全流程 20 步内可完成；每步可回退
- [x] 数字解析覆盖：`41%→55%`、`从30人涨到200人`、`提升14pt`、`300人`
- [x] GitHub 链接自动回填项目信息
- [x] 就地编辑修改即保存
- [x] PDF 真实导出（非仅打印预览）
- [x] 主色/主题点击即时生效且有文字标签说明
- [x] 自动化测试 49 项全通过（含端到端零基础用户路径）

---

## 6. 路线图（Backlog）

| 优先级 | 功能          | 说明                         |
| --- | ----------- | -------------------------- |
| P1  | LLM 润色接入逐题流 | 用户答完 detail 后可选"帮我改写得更专业"  |
| P1  | 项目封面图       | 本地上传 / 自动抓取链接 og:image     |
| P2  | 简历 PDF 导入   | pdf.js 解析已有简历 → 预填充        |
| P2  | 多语言作品集      | 同一 profile 生成中/英双版         |
| P3  | 模板市场        | 社区贡献行业专属渲染模板               |
| P3  | 匿名分享链接      | 可选加密同步（需引入极小后端或静态 JSON 托管） |

---

## 7. 仓库与部署

```
git remote add origin https://github.com/<user>/portfolio-forge.git
git push -u origin main
# Settings → Pages → Source: GitHub Actions → 自动部署
```

交付物：`index.html` + `src/`（4 个引擎模块）+ `vendor/`（html2pdf 本地打包）+ `.github/workflows/deploy.yml` + README / LICENSE(MIT)。
