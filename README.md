# ⚡ Portfolio Forge

> 像填一份问卷一样，得到一份完整的在线作品集。零基础也能用。

一个**纯前端、零后端、无需构建**的 AI 作品集生成器。打开网页，回答 20 个问题，右边实时长出你的作品集。最后导出网页 / PDF。

---

## 它解决了什么问题

| 传统做法 | Portfolio Forge |
|---|---|
| 打开 Figma / 模板站，不知道从哪下手 | 一个问题一个屏幕，只让你做当下这一件事 |
| "请描述你的项目" → 憋半天写不出一句话 | 每个问题给例子、给句式、给可点击的候选项 |
| 零经历，没素材可写 | 内置 10 个岗位的「一周可完成小项目」选题 |
| 排版丑、不像"最新的审美" | 4 套主题 + Bento 数据块 + 大字号展示型排版，开箱即用 |
| 导出是假的，只能截图 | html2pdf 真实生成 A4 PDF，或导出独立 HTML 直接部署 |

---

## 三分钟上手

### 方式一：本地直接打开

下载仓库，双击 `index.html`。所有数据存在浏览器 localStorage。

> `file://` 下 PDF 组件可能受限，推荐方式二。

### 方式二：本地起服务

```bash
npx serve .
# 或
python -m http.server 8080
```

### 方式三：GitHub Pages（可分享链接）

1. 推动代码到你的仓库
2. 仓库 **Settings → Pages → Source** 选 `GitHub Actions`
3. 推送后自动部署，地址为 `https://<用户名>.github.io/<仓库名>/`

---

## 怎么用

### 1. 逐个回答（推荐）

左侧一次只问一个问题：

```
STEP 1 · 了解你
你叫什么名字？
[ 王小明                                    ]
（你的名字会出现在作品集最显眼的标题位置，随时可以改）

[上一步]              [跳过]  [下一步 →]
```

**四种问题类型**都做了针对设计：

| 类型 | 交互 |
|---|---|
| `choice` | 单选卡片，点击即选 |
| `multi` | 多选标签，可以全选或只选一个 |
| `text` / `longtext` | 文本框 + 建议句式（📝 可点击插入）+ 候选标签（点一下追加到文本框） |
| `link` | 粘贴链接，自动读取内容（见下） |
| `metric` | 解析 `41%→55%`、`从30人涨到200人`、`300人` 等各种写法 |

### 2. 零经历也能开始

如果第二步回答"我还没有实习经历"，向导不会让你卡死，而是：

1. 让你勾选素材来源：`课程作业` `社团/学生会` `比赛` `自己的小项目` `暂时真的都没有`
2. 根据你的**目标岗位**给出具体选题，例如产品经理：

   > 没有实习经历？做一个「产品分析作业」：挑一个你常用的 App，写一份 3 页的产品分析——用户是谁、核心路径是什么、你觉得最该改的 1 个点是什么、如果改了你预期什么指标会变。**一周可完成。**

3. 你按这个提示回答几道题，作品集里就有一个真实项目了。

### 3. 它会"替你想到"你没说的

回答"你在这件事里做了哪些事"时，右侧不是空白输入框，而是根据你的目标岗位推送候选：

- **产品经理** → 需求调研、PRD 撰写、竞品分析、原型设计、数据看板搭建、跨部门沟通…
- **运营** → 内容策划、活动执行、社群维护、用户调研、数据复盘…
- **数据分析** → 数据清洗、指标体系搭建、SQL 取数、BI 看板、A/B 实验分析…

点一下就直接追加进你的答案里。不确定自己做过什么的时候，这些词能帮你回忆。

### 4. 会读链接

在"项目链接"这一步粘贴 GitHub 仓库或任意网页：

- **GitHub 仓库** → 走官方 API，自动拿到项目名、简介、技术标签
- **其他网页** → 走文本代理抓取正文
- **都失败** → 至少识别出域名，告诉你可以补充什么

### 5. 生成后自己动手改

右上角打开「就地编辑」，预览里任意文字点一下就能改：标题、岗位、每段经历的描述、项目的每个数字。改完自动回写，不用回去重新回答问题。

### 6. 导出

- **导出网页** → 下载一个自包含的 `.html` 文件，双击就能看，也可以直接丢到任何静态托管
- **导出 PDF** → html2pdf 渲染 A4，带分页控制（卡片不会被切断）

---

## 四套主题

| 主题 | 气质 | 适合 |
|---|---|---|
| `aurora` | 现代科技，Bento 栅格，大字号展示 | 互联网 / 产品 / 数据 |
| `paper` | 编辑质感，衬线标题，留白克制 | 咨询 / 内容 / 品牌 |
| `mono` | 极简黑白，强对比 | 设计 / 建筑 / 学术 |
| `noir` | 深色高级感 | 创意 / 技术 |

主色（accent）可以随时切换 6 种预设，或输入任意 hex。

---

## AI 设置（可选）

**不填 Key 也能完整使用。** 内置规则引擎负责解析、抽取数字、按权重追问。

想要更自然的理解和润色，右上角「AI 设置」填任意 **OpenAI 兼容接口**：

| 服务商 | 接口地址 | 模型 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

> 🔒 Key 只存在本机 localStorage，直连你自己填的接口，不经过任何第三方。

---

## 工作原理

```
用户回答一个问题的答案
        │
        ▼
┌──────────────────────────────────────────┐
│  wizard-engine.js   逐个提问 · 状态机      │
│  · nextStep(profile)  找出下一个缺口       │
│  · applyAnswer(profile, step, answer)     │
│    → 写回 profile 的正确条目（按 index）    │
└──────────────────────────────────────────┘
        │  岗位相关的候选由 role-kit.js 提供
        ▼
┌──────────────────────────────────────────┐
│  role-kit.js   10 个岗位的知识库           │
│  tools / methods / metrics / tasks        │
│  starter（零经历时的小项目选题）            │
└──────────────────────────────────────────┘
        │  profile JSON
        ▼
┌──────────────────────────────────────────┐
│  renderer.js   纯函数渲染                  │
│  profile JSON → 自包含 HTML 文档字符串      │
│  4 主题 · Bento 栅格 · IntersectionObserver │
│  @page A4 · break-inside:avoid            │
└──────────────────────────────────────────┘
        │
        ├─ 写入 iframe 实时预览
        ├─ inline-edit.js 就地编辑（contenteditable + data-iedit 路径映射）
        ├─ 导出独立 HTML
        └─ 导出 PDF（html2pdf，打印兜底）
```

### 项目结构

```
├── index.html                  # 主界面：向导 + 预览工作台
├── src/
│   ├── renderer.js             # 渲染引擎（4 主题、Bento、动效、打印样式）
│   ├── role-kit.js             # 岗位知识库：工具/方法/指标/任务/入门项目
│   ├── wizard-engine.js        # 向导引擎：提问状态机、答案写回、链接读取、指标解析
│   ├── interview-engine.js     # v2 追问引擎（保留：完整度评分模型、LLM 通道）
│   └── inline-edit.js          # 就地编辑
├── vendor/
│   └── html2pdf.bundle.min.js  # PDF 导出（本地打包，离线可用）
├── legacy/                     # v1 表单版（不再维护，可删）
├── PRD.md                      # 产品需求文档
└── .github/workflows/deploy.yml
```

### 数据模型（Profile v2）

```js
{
  meta: { version, updatedAt, theme, accent, showMotion, stage, srcScanned, sources },
  hero: { name, title, tagline, location, email, phone, links[], avatar, available, badge },
  metrics: [],                          // 顶部 Bento 数据条（可从经历自动推导）
  skills: { groups: [{ name, items[] }] },
  experiences: [{ org, role, start, end, current, context, highlights[], metrics[], tags[] }],
  projects: [{ name, link, role, period, context, problem, approach, result, metrics[], tags[] }],
  education: [{ school, degree, major, start, end, note }],
  extras: []
}
```

一条项目经历的核心结构是 **PSR**：`problem`（问题）→ `approach`（做法）→ `result`（结果）。向导就是按这个顺序问的，因为这是招聘方真正想看的东西。

---

## 隐私

- 所有数据只存浏览器 localStorage
- 纯静态页面，无后端、无埋点、无账号
- 只在你主动粘贴链接时才会发起外部请求（GitHub API / 文本代理）
- 若配置了 LLM，只有你提交的文本会发到你自己填的接口

## License

MIT
