# 记忆卡片LaTeX支持、快捷键切换卡片、GitHub更新、窗口按钮修复

## Goal

为 DreamCode 添加四项功能改进：(1) 记忆卡片支持 LaTeX 公式渲染；(2) 新增快捷键切换指定记忆卡片；(3) 重构帮助页为"关于"页并添加 GitHub Release 在线更新；(4) 修复窗口最小化和全屏按钮。

## What I already know

### 现有代码结构
- 记忆卡片使用 `MarkdownRenderer` 组件渲染，底层是 `react-markdown` + `remark-gfm` + `rehype-highlight`
- 快捷键系统在 `src/main/shortcuts.ts` 中通过 `globalShortcut.register` 注册，前端 store 在 `src/renderer/src/lib/store/shortcuts.ts`
- 自动更新已有 `electron-updater` 依赖，但 macOS 下被跳过（`auto-updater.ts` 第 5 行 `if (process.platform === 'darwin') return`）
- 窗口在 `main-window.ts` 中配置为 `frame: false`（无边框），左上角三个按钮是自定义 HTML 按钮（`AppHeader.tsx`），最小化和全屏按钮没有绑定实际功能
- 帮助页 (`help/index.tsx`) 包含：简介、快速开始、快捷键、FAQ、联系支持

### 技术约束
- Electron 37, React 19, electron-vite 4
- 已有依赖：react-markdown, remark-gfm, rehype-highlight
- 窗口属性：transparent: true, frame: false, alwaysOnTop: true
- macOS 上 autoUpdater 被禁用（可能因为没有代码签名/公证）

## Assumptions (temporary)

- LaTeX 渲染使用 KaTeX（轻量、渲染快、适合 Electron 环境）
- 快捷键切换卡片数量上限为 9（1-9）
- GitHub Release 更新检查使用 electron-updater 现有机制，macOS 也启用（或使用 GitHub API 检查 + 打开下载链接）
- 全屏按钮改为最大化/还原切换

## Open Questions

(none)

## Decision (ADR-lite)

**Context**: macOS 上 electron-updater 需要代码签名才能自动更新，当前项目未签名。
**Decision**: Windows 使用 electron-updater 自动下载安装；macOS 使用 GitHub API 检测新版本，发现后弹窗提示并打开 GitHub Release 页面让用户手动下载。
**Consequences**: macOS 用户需要手动下载 DMG 安装，但避免了代码签名的复杂性。未来如果添加签名可以升级为全自动。

## Requirements (evolving)

### Feature 1: 记忆卡片 LaTeX 支持
- 在 MarkdownRenderer 中集成 KaTeX 渲染
- 支持行内公式 `$...$` 和块级公式 `$$...$$`
- 记忆卡片的编辑模式和阅读模式都能正确显示 LaTeX
- AI 解答区域也同步支持 LaTeX（共用 MarkdownRenderer）

### Feature 2: 快捷键切换指定记忆卡片
- 默认快捷键：macOS `Command+1~9`，Windows `Alt+1~9`，切换到指定序号的记忆卡片预览页
- 新增"返回主解题页"快捷键：默认 `Command+W`（macOS）/ `Alt+W`（Windows），从任意卡片页切回主解题页
- 删除原有的 `openMemoryCards`（Cmd+R）快捷键
- 如果已在记忆卡片页则仅切换选中卡片
- 设置页面可自定义每个卡片的快捷键绑定及返回主页快捷键
- 卡片不存在时忽略

### Feature 3: 帮助页重构为"关于"页 + GitHub 更新
- 右上角 HelpCircle 图标替换为 GitHub 图标
- 页面标题改为"关于"
- 页面内容：
  - "关于"模块：项目名称 + 当前版本号 + 项目 GitHub 地址链接 + 开源协议 + 检查更新按钮
  - "快捷键"模块：保留现有快捷键列表
- 移除原有的"简介""快速开始""常见问题""联系支持"
- 更新检测逻辑：
  - 启动时自动检查（所有平台）
  - 手动点击"检查更新"按钮
  - 检测到新版本时弹出提示
  - Windows：使用 electron-updater 下载安装
  - macOS：打开 GitHub Release 页面下载

### Feature 4: 窗口按钮修复
- 最小化按钮（黄色）：点击后隐藏窗口（与 Alt+H 行为一致）
- 全屏/最大化按钮（绿色）：点击后切换窗口最大化/还原状态

## Acceptance Criteria (evolving)

- [ ] 记忆卡片中输入 `$E=mc^2$` 能正确渲染为行内公式
- [ ] 记忆卡片中输入 `$$\int_0^1 x^2 dx$$` 能正确渲染为块级公式
- [ ] AI 解答区域也能渲染 LaTeX 公式
- [ ] macOS 按 Cmd+1 切换到第一张记忆卡片
- [ ] Windows 按 Alt+1 切换到第一张记忆卡片
- [ ] 设置页面能自定义卡片快捷键
- [ ] 右上角显示 GitHub 图标，点击进入"关于"页
- [ ] "关于"页显示版本号和项目地址
- [ ] 点击"检查更新"能检测 GitHub Release 最新版本
- [ ] 有新版本时弹出提示
- [ ] 最小化按钮点击后窗口隐藏
- [ ] 全屏按钮点击后窗口最大化/还原

## Definition of Done

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope

- LaTeX 编辑器（实时预览分屏）— 只做渲染
- 记忆卡片导出为 PDF
- Linux 平台自动更新
- 快捷键冲突检测的高级 UI

## Technical Notes

- MarkdownRenderer: `src/renderer/src/components/MarkdownRenderer.tsx`
- 快捷键注册: `src/main/shortcuts.ts`
- 快捷键 store: `src/renderer/src/lib/store/shortcuts.ts`
- 自动更新: `src/main/auto-updater.ts`
- 窗口创建: `src/main/main-window.ts`
- 帮助页: `src/renderer/src/help/index.tsx`
- AppHeader: `src/renderer/src/coder/AppHeader.tsx`
- 记忆卡片页: `src/renderer/src/memory-cards/index.tsx`
- package.json version: 1.2.1
- electron-builder publish: github (owner: dream-rec, repo: dreamcode)
