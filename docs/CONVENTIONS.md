# Chrona 工程约定

## UI 基础设施

- 使用 Mantine 作为稳定的基础 UI 组件库。
- 表单、按钮、菜单、弹窗、Tooltip、Badge 等通用组件优先使用组件库，不在业务代码中重复实现。
- 使用 Mantine 的 Color Scheme 系统支持浅色、深色和跟随系统三种模式。
- 使用 Lucide React 作为统一图标库；界面结构性图标不得使用 Emoji。
- 自定义 CSS 仅用于 Timing Canvas、编辑器布局和 Chrona 品牌视觉等产品专属部分。

## 视觉与交互

- 所有颜色通过语义化 CSS Token 定义，并分别适配明暗主题。
- 图标按钮必须提供可访问名称和 Tooltip。
- 键盘焦点必须清晰可见。
- 动画时长控制在 150–300 ms，并尊重 `prefers-reduced-motion`。
- 通用交互目标不小于 36 px；关键操作目标不小于 44 px。
- 组合滚轮手势使用 `{ passive: false }` 的原生 `wheel` 监听，确保 Electron/Chromium 可以阻止浏览器默认缩放。
- Timeline Zoom 必须以指针所在时间为锚点，不能在缩放时使用户正在观察的边沿跳离视口。
- Track Height 使用全局统一状态；`Shift + Wheel` 在画布任意位置同步调整全部 Signal。

## 架构

- `electron`：桌面窗口生命周期与受限系统能力。
- `src/domain`：与 UI 无关的时序数据模型和计算逻辑。
- `src/components`：可复用的业务组件。
- `src/App.tsx`：当前 V1 垂直切片的状态编排；功能扩展后再拆分为 feature 模块。
- Timing Engine 不得依赖 React 或 Mantine，并必须具备自动化测试。

Renderer 禁止启用 Node Integration；系统能力必须通过受控的 Preload/API 暴露。
