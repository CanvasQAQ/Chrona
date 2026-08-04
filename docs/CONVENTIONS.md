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
- Track Height 使用全局统一状态并保存在 `canvasSettings`；Canvas Settings 和 `Shift + Wheel` 在 48–160 px 范围内同步调整全部 Signal。
- Signal Delay 和 Setup/Hold 的编辑入口附着于当前选中的目标 Signal，不使用项目级 Clock/Data 配对表单。
- Delay、约束窗口和冲突反馈都应以低干扰图形表达为主，不生成 STA 式结论文本。

## 架构

- `electron`：桌面窗口生命周期与受限系统能力。
- `src/domain`：与 UI 无关的时序数据模型和计算逻辑。
- `src/components`：可复用的业务组件。
- `src/App.tsx`：当前 V1 垂直切片的状态编排；功能扩展后再拆分为 feature 模块。
- Timing Engine 不得依赖 React 或 Mantine，并必须具备自动化测试。
- Sequential 仿真逻辑放在独立领域模块中；工程只保存衍生配方，解析后的 Q events 作为运行时数据。
- Sequential Derived Data 必须通过 Signal ID 引用 Clock/Data，并在解析时检测循环依赖。
- Delay Link、Sequential Derivation 与 Timing Constraint 必须消费统一解析后的 Signal 边沿；不得再从衍生 Signal 的占位 Pattern 推导边沿。
- 新工程分别使用 `delayLinks[]` 和 `timingConstraints[]` 保存关系；`linkedTiming` 仅作为历史工程的读取迁移入口。
- Delay 的计算结果是目标 Signal 的派生 Start offset，不得覆盖 Signal 保存的基础 Start。
- `canvasSettings` 保存轨道高度与纵向网格设置；缺省值必须由领域层统一补齐。

Renderer 禁止启用 Node Integration；系统能力必须通过受控的 Preload/API 暴露。
