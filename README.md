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
