# 界面验证截图

这些截图用于证明 PRD 中标注为【已验证】的界面部分确实成立。全部由脚本生成，可复现。

## 复现方式

```bash
# 1. 首屏工作台截图
node .preview/shot.js .preview/final-ui.png

# 2. 渲染层截图（用示例 profile 离线渲染 + 浏览器截图）
node .preview/render-shot.js
node .preview/shot.js .preview/v3-rendered4.png \
  "file:///<项目绝对路径>/.preview/v3-rendered.html" "1280,3400"
```

脚本位于 `.preview/`（不纳入版本控制，属于临时验证目录）。

> 注：截图脚本需要本机安装 Edge（路径硬编码为 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`）。如果路径不同需改脚本。

## 截图清单

| 文件 | 证明什么 |
|---|---|
| `01-wizard-first-step.png` | 工作台布局；问题卡的「为什么问这个」；主题已收缩为 Aurora / Paper 两套；右上角「事实检查」入口存在 |
| `02-rendered-portfolio-full.png` | 渲染层：项目卡的「面向用户 / 我的分析 / 未采用的方案 / 我做了什么（贡献度表）/ 局限 / 下一步（计划中徽标）/ 证据材料」全部正确输出 |

## 尚未有截图的界面（对应 PRD 第 10 章 G2-G4）

- 事实检查面板打开状态（需要 DOM 交互，headless 截图无法点击）
- 缺口清单 chips 的展示
- 隐私面板
- 移动端 375px 视图
- PDF 导出结果

**这些界面目前没有视觉证据，因此在 PRD 中标记为【已实现·未验证】。**
