# Chrona V1 交互修订说明

> 状态：已进入实现
> 日期：2026-07-27

## 1. 桌面运行形态

Chrona 使用 Electron 封装。React/Vite 仅作为 Renderer，Electron Main Process 负责窗口生命周期。

安全基线：

- Renderer 不启用 Node Integration
- 开启 Context Isolation
- 开启 Renderer Sandbox
- 外部链接不在 Chrona 窗口内打开

## 2. 时间与相位输入

### Start

Clock 和 Data 的 `Start` 使用同一种可转换输入：

- `ps`：直接输入绝对时间
- `phase`：基于参考 Clock Period 输入角度

切换标签只改变输入和显示方式，不创建两份状态；内部始终保存为 `ps`。

### Clock Phase

Clock Phase 与 Phase Angle 合并为一个输入：

- `ps`
- `phase (deg)`

两种方式编辑同一个 `phasePs`。

## 3. Period 与 Frequency 输入

Clock Period 与 Data Symbol Duration 统一为同一个 `periodPs` 概念，并使用同一种输入组件：

- Period：`ps` / `ns`
- Frequency：`MHz` / `GHz`

切换 Period/Frequency 时实时换算，内部始终保存为 `ps`。

## 4. Data Pattern Builder

Data Pattern 由有序 Symbol Token 构成，例如：

```text
D0 D1 D2 D1
```

输入方式：

1. 点击快捷 Token：`0`、`1`、`D0`、`D1`、`D2`、`X`
2. 输入单个自定义 Token，例如 `D3`
3. 通过空格、逗号或分号批量输入，例如 `D3 D4 D5`
4. 点击序列中的 Token 将其删除

颜色规则：

- Token 名称经过规范化后参与确定性颜色映射
- 相同名称在所有 Data Signal 和所有位置始终使用同一种颜色
- 不同名称优先使用不同颜色
- 颜色之外始终显示 Token 文本，不能只用颜色表达值

## 5. Signal Track Header

独立的左侧 Signal List 已删除。画布左侧固定的 Track Header 统一承担 Signal 管理：

- 点击 Signal Name 选择 Signal
- 拖拽整行调整顺序，排序结果直接决定波形行顺序
- Copy 创建当前 Signal 的独立副本，并插入到原 Signal 后
- Delete 保留垃圾桶图标；点击后在原位显示非模态的小型确认框，确认后才真正删除

Signal 的显示与隐藏统一放在画布顶部的 Signals 菜单中。菜单列出所有 Signal，并提供 Show All / Hide All；隐藏的 Signal 不出现在 Track Header 和画布中，但始终可以从该菜单恢复。

Signals 菜单升级为 Signal Manager：

- 支持按名称实时搜索 Signal
- 支持创建/删除分组，并将 Signal 移入分组或移回 Ungrouped
- 每个分组可折叠，并可批量显示/隐藏组内 Signal
- 全局 Show All / Hide All 保留
- 分组信息随 `.chrona.json` 项目文件保存

Track Header 的 Copy / Delete 操作覆盖浮出在行尾，仅在鼠标悬浮或键盘聚焦时显示，不参与 Signal Name 的宽度计算。Signal 列默认按名称渲染宽度的 85 分位数自动适配；用户可拖拽列分隔线手动调整，双击分隔线或聚焦后按 `Home` 恢复自动适配。

键盘替代操作：

- `Alt + Arrow Up`
- `Alt + Arrow Down`

Lock 已删除。

## 6. Timing Canvas

- 左侧 Signal Name 固定，不随横向时间轴滚动
- 标签顺序与 Track Header 顺序一致
- Data 使用带 Token 名称的总线式 Symbol Cell
- Clock 保持数字方波表现
- 在时间轴下方的画布区域按住鼠标左键拖动，可同时平移水平和垂直视口
- 波形本身不响应单击选中，也不显示悬停或选中高亮；Signal 通过 Track Header 选中
- 抓取平移使用 Pointer Capture，拖动离开波形区域后仍保持连续，直到松开鼠标

### 6.1 时间轴缩放

- Zoom 不设置产品级最大或最小倍率
- 工具栏不显示缩放百分比，也不提供 Zoom In/Out；只保留 Fit All 复位按钮，将完整时间范围适配到横向视口
- 在顶部时间轴按住鼠标左键横向拖拽可选择时间范围；松开后，选区自动放大并填充横向视口
- `Ctrl + Mouse Wheel` 连续缩放时间横轴
- 缩放以鼠标所在时间点为锚点，缩放前后的观察位置保持稳定
- 横向滚动只改变观察窗口，不改变 Signal 的时间数据

该行为必须能够放大 16 GHz 等高频 Signal，直至用户可以观察单个边沿与单个 Symbol。

### 6.2 Period Grid

- 时间横轴和 Grid 由当前选中 Signal 的 Period 驱动
- Major Grid 间隔为 `1 × Period`
- Minor Grid 默认将一个 Period 划分为 4 份
- Period 在当前倍率下过密时，Major Grid 仍保留，但文字标签自动稀疏，避免重叠
- 时间标签根据精度自动使用 `ps` 或 `ns`

### 6.3 轨道高度

- `Shift + Mouse Wheel` 在画布任意位置同步调整全部轨道高度
- 所有 Signal 始终使用同一个轨道高度，不提供单轨独立高度
- 初始轨道高度与最小高度均为 48 px，使默认画布保持紧凑
- Clock 振幅和 Data Symbol 高度随轨道高度连续变化
- 不设置最大轨道高度

### 6.4 项目时长与 SVG 导出

- 工具栏提供项目总时长输入，内部仍以 `durationPs` 保存
- SVG 导出提供三种范围：当前画布 View、自定义起止时间、全部项目时长
- 当前 View 按可见横向视口计算，不受固定 Signal 列遮挡影响
- 自定义范围必须满足 End 大于 Start，并限制在项目总时长内
- 导出继续包含当前可见 Signal 的名称与波形，Signal 列使用当前自动或手动宽度

## 7. Setup/Hold 与动画

旧版从左向右扫描的 Timing Sweep 已删除，不作为兼容目标。

Setup/Hold 计算与动画暂缓，等待重新定义：

- Clock/Data 不确定性模型
- Min/Max Delay
- Delay 分布或边界
- Sampling Edge
- Violation 判定
- 动画如何展示不同 Delay 对 Margin 的影响

在语义确认前，UI 不显示可能产生误导的 Pass/Violation 结果。
