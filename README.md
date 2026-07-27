# Chrona

Chrona 是一款面向硬件设计、验证和系统工程师的可交互 Timing Diagram 编辑器。

当前阶段：V1 垂直切片开发中。

## 项目文档

- [产品需求文档（PRD）](docs/PRD.md)
- [工程约定](docs/CONVENTIONS.md)

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

## 交互设计

- [V1 交互修订说明](docs/INTERACTION_SPEC.md)

## 示例工程

- [Generic Timing Example](examples/generic-timing-example.chrona.json)

常用画布操作：

- `Mouse Drag`：抓取并平移画布
- `Time Axis Drag`：横向选择时间范围并放大到填满视口
- `Ctrl + Mouse Wheel`：以鼠标所在时间点为中心缩放
- `Shift + Mouse Wheel`：同步调整全部轨道与波形高度
- `Fit All`：恢复并横向显示完整时间范围
