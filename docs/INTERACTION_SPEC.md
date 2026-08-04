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
- Canvas Settings 可直接输入 48–160 px；`Shift + Mouse Wheel` 使用相同范围

### 6.4 项目时长与 SVG 导出

- 工具栏提供项目总时长输入，内部仍以 `durationPs` 保存
- SVG 导出提供三种范围：当前画布 View、自定义起止时间、全部项目时长
- 当前 View 按可见横向视口计算，不受固定 Signal 列遮挡影响
- 自定义范围必须满足 End 大于 Start，并限制在项目总时长内
- 导出继续包含当前可见 Signal 的名称与波形，Signal 列使用当前自动或手动宽度

## 7. Signal Delay、Setup/Hold 与反馈

Signal Timing 用于制作能够解释 Delay 和约束关系的 Timing Diagram 和 SVG，不承担自动定位问题、路径排名或 STA 报告职责。

### 7.1 基础波形与边沿联动

- Signal 的 Start、Period、Phase 和 Pattern 先生成基础波形
- 用户先选中目标 Signal，再为它添加 Source Delay
- 每条关系分别指定任意类型的 Source Signal/edge，以及当前目标 Signal/edge
- Delay 不区分边沿极性：Clock 的上升沿与下降沿、Data 的所有 transition 均按时间顺序统一编号，直接指定 Source 第几个边沿到 Target 第几个边沿
- 每条 Edge Delay 保存 Min、Current 和 Max
- 新建 Delay 的默认范围为 0–20 ps，Current 默认为 10 ps
- 每条 Delay 保存独立的 Diagram Label；新建关系按 `t1`、`t2`、`t3` 自动命名，用户可改为任意短名称
- 选中的边沿是计算锚点：目标锚点时间等于 Source edge 时间加 Current Delay
- 锚点结果被换算为目标 Signal 的派生 Start offset，目标整条波形随之平移，而不是只推动一个边沿
- Delay 不覆盖目标 Signal 保存的基础 Start，也不自动生成新的 Signal
- Source 与 Target 均不受 Clock/Data 类型组合限制；Clock 可以源自 Data，Data 也可以源自 Clock
- 当一条关系的 Target 又是另一条关系的 Source 时，后一级使用已经平移后的 Source edge，实时传播两级 Delay

Delay 配置附着在目标 Signal，而不是项目级 Clock/Data 配对。工程文件用 `delayLinks[]` 保存每个目标 Signal 的来源、边沿序号和 Delay 范围。

### 7.2 Min/Max 表达

Min/Max 只在目标 Signal 轨道显示为低对比度虚线边界：

- 不显示 Min/Max 文字标签
- 不使用高饱和状态颜色
- Current edge 仍由正常波形实线表达
- 边界和 Delay 测量线随 SVG 一起导出
- Delay 测量线在画布和 SVG 中显示 Diagram Label，实际 Current Delay 保留为该图形元素的提示信息

### 7.3 Setup/Hold Window

Setup/Hold Constraint 同样从当前选中的目标 Signal 添加，并独立于 Delay：

- 用户选择任意类型的 Reference Signal，并分别设置 Reference 与 Constrained 的边沿类型
- Clock 支持 Rising、Falling 或 Both；Data 支持 Any transition，并对逻辑 0/1 支持 Rising/Falling
- Reference 与 Constrained 两侧都支持多选边沿编号；编号留空表示全部可见边沿
- 每个被选择的 Reference edge 生成一个 Window，Window 随该 edge（包括其派生 Delay）实时移动
- Setup 位于 Reference edge 左侧，Hold 位于右侧
- 新建约束的 Setup 与 Hold 默认值均为 10 ps
- 正常时使用统一的中性、低对比度区域，不分别着色
- 不显示 Sampling Edge、Overlap、Pass 或 Violation 文本
- 任一被选择的 Constrained edge 进入某个 Window 时，仅该 Window 切换为浅色、半透明红色，作为图形反馈
- 工程文件用 `timingConstraints[]` 保存约束，不要求 Reference 或 Target 必须是 Clock/Data 中的特定一种

### 7.4 轨道间距、起点与网格

- Signal 轨道默认和最小高度为 48 px，波形主体只占轨道中部约 44%
- Canvas Settings 显示当前 Track Height 数值，允许在 48–160 px 之间直接输入；该值与 Shift + 滚轮调整实时同步并随工程保存
- Data Signal 在有效 Start 之前显示低对比度的连续引导线，并在 Start 位置显示竖向起点线；该表达随 SVG 导出
- 画布工具栏右侧提供 Vertical Grid 设置，可隐藏纵向网格
- Grid 支持跟随当前参考 Signal 自动细分，或使用自定义 ps 间隔

### 7.5 Delay 动画

旧版从左向右扫描的 Timing Sweep 已删除，不作为兼容目标。新的动态效果由用户调整各 Signal 的 Current Delay 产生；动画或拖动只改变 Delay 参数和渲染时的派生 Start offset，不覆盖 Signal 的基础时序数据。

## 8. Sequential Derived Data

- Add 菜单在工程至少存在一个 Clock 和一个 Data 后开放 Derived Data
- 新建输出默认使用当前选中的 Data 和第一个 Clock，并立即选中新 Q
- 属性面板用 DFF/Latch 分段控件切换器件；DFF 显示 Sampling Edge 和 C→Q，Latch 显示 Transparent Level、C→Q 与 D→Q
- 每个 Delay Range 使用 Min、Current、Max 数值输入和 Current 滑块，始终满足 `0 ≤ Min ≤ Current ≤ Max`
- 派生 Data 不显示 Start、Rate 或 Pattern Builder；其波形由源信号和衍生参数实时计算
- 仅选中派生 Latch 时显示低对比度透明区间；每个输出边沿以文本和图形共同标识 C→Q 或 D→Q
- 切换到 DFF 时移除 D→Q 配置；切回 Latch 时创建默认 D→Q 范围
- 缺失来源或循环依赖在属性面板原位显示可恢复错误，不导致画布崩溃
- 派生 Data 保留 Signal Timing 区块；Delay 和 Setup/Hold 的边沿列表来自最终解析后的 Q events
- Derived Data 作为 Delay/Constraint 来源或目标时，画布、属性面板和 SVG 使用同一组最终边沿
