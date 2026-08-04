# Chrona

Chrona 是一款面向硬件设计、验证和系统工程师的可交互 Timing Diagram 编辑器。

当前版本：v0.2.0。

## 当前能力

- 创建并编辑 Clock / Data 波形，使用统一的 `ps` 时间模型
- 从指定 Clock 与 Data 实时派生 DFF / Latch 输出；支持采样边沿或透明电平，以及 C→Q / D→Q 的 Min / Current / Max 延迟
- 为任意目标 Signal 配置来自任意 Source Signal 的 Delay，并通过锚点边沿联动整条目标波形
- 使用 Min / Current / Max 表达 Delay 范围，并为图中测量线设置 `t1`、`t2` 等自定义名称
- 为任意 Signal 添加多边沿 Setup/Hold 约束；目标边沿进入窗口时，以低干扰的半透明红色区域反馈
- 调整轨道高度、纵向网格和网格间隔，并随工程保存
- 保存/打开 `.chrona.json` 工程，导出包含波形、Delay 与约束窗口的 SVG

Chrona 的 Timing 功能用于制作清晰、可复现的调试示意图，不替代 STA，也不自动判断路径、裕量或问题来源。

## Sequential Derived Data

当工程中至少存在一个 Clock 和一个 Data 后，可从 `Add → Derived data` 创建持续联动的 Q：

- DFF 支持 Rising/Falling 采样边沿和 C→Q Min/Current/Max
- Latch 支持 High/Low 透明电平，并分别设置 C→Q、D→Q Min/Current/Max
- Current 生成实际 Q 波形；Min/Max 在每个输出边沿显示可能到达范围
- Q 可以继续参与 Delay、Setup/Hold，或作为下一级 DFF/Latch 的 Data 输入
- Delay 与 Sequential Derivation 使用统一依赖图，延迟后的 CLK、Data、Q 会继续向下游传播

## 项目文档

- [产品需求文档（PRD）](docs/PRD.md)
- [V1 交互修订说明](docs/INTERACTION_SPEC.md)
- [工程约定](docs/CONVENTIONS.md)
- [版本记录](CHANGELOG.md)

## 本地运行

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动 Vite Renderer 和 Electron 桌面窗口。只调试网页 Renderer 时可使用：

```bash
npm run dev:renderer
```

## 验证

```bash
npm test
npm run build
```

## 桌面安装包

GitHub Actions 会在提交到 `main`、向 `main` 提交 Pull Request，或手动触发工作流时，
自动构建以下安装包，并保留为工作流产物：

- Windows x64（NSIS `.exe`）
- Linux x64（`.AppImage` 和 `.deb`）
- macOS Intel 与 Apple Silicon（`.dmg`）

创建并推送以 `v` 开头的 Git 标签（例如 `v0.1.0`）后，工作流还会自动创建
GitHub Release，并把以上安装包上传到该 Release。

本地构建 Linux 安装包：

```bash
npm run package:linux
```

## 示例工程

- [Generic Timing Example](examples/generic-timing-example.chrona.json)

常用画布操作：

- `Mouse Drag`：抓取并平移画布
- `Time Axis Drag`：横向选择时间范围并放大到填满视口
- `Ctrl + Mouse Wheel`：以鼠标所在时间点为中心缩放
- `Shift + Mouse Wheel`：同步调整全部轨道与波形高度
- `Fit All`：恢复并横向显示完整时间范围
- `Canvas Settings`：设置 48–160 px 轨道高度，以及纵向网格显示方式和间隔
