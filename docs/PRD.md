# Chrona 产品需求文档（PRD）

> 文档状态：V1 需求基线
> 记录日期：2026-07-27
> 实现状态：V1 开发中
> 原产品工作名：Timing Diagram Editor

> 2026-07-28 修订：输入、Data Pattern、Signal Track Header、Canvas 与动画定义已更新。冲突内容以 [V1 交互修订说明](INTERACTION_SPEC.md) 为准。
>
> 2026-08-01 修订：Timing 功能调整为附着于单个 Signal 的 Delay 与 Setup/Hold 约束，补充多边沿选择、派生 Start、图示标签和 Canvas Settings。

## 1. 产品概述

### 1.1 产品名称

Chrona

### 1.2 产品定位

Chrona 是一个面向硬件设计工程师、验证工程师和系统工程师的桌面级时序绘制与展示工具，用于快速创建、编辑和展示数字系统中的：

- Clock 时钟关系
- Data 数据变化
- Setup/Hold 时序约束
- Timing Window
- Delay 变化造成的边沿关系
- 时序动画扫描

产品帮助工程师在设计、调试和文档沟通阶段清晰表达已知的复杂时序关系。它不替代 STA，也不负责自动定位或判断问题。

### 1.3 一句话定义

> 一个面向硬件工程师的可交互 Timing Diagram 编辑器，将传统静态时序图升级为可计算、可联动、可动画化的工程表达工具。

## 2. 产品背景

工程师目前通常使用 PowerPoint、Visio、Draw.io、波形截图或 EDA 波形查看器处理 Timing Diagram，存在以下问题：

### 2.1 绘制效率低

修改一个 Clock Phase 或 Data Edge 时，往往需要重新调整大量图形。

### 2.2 缺少时序语义

普通绘图工具无法理解 Clock Period、Data Rate、Setup/Hold Window 和 Phase Relationship，因此图形即使看起来正确，也无法保证时序逻辑正确。

### 2.3 缺少联动展示能力

传统工具难以在修改 Delay、Phase 或约束后实时联动相关波形，也难以将这些关系稳定地输出为清晰的矢量示意图。

## 3. 产品目标

打造一个“类似 Figma 的 Timing Diagram 编辑器 + Timing Relationship 引擎”，提供：

- 可视化编辑
- 时序关系联动
- 交互式因果展示
- 工程保存与恢复
- 矢量图导出

## 4. 用户角色

### 4.1 Hardware Design Engineer

典型需求：

- 绘制接口 Timing Diagram
- 分析 Clock/Data Relationship
- 输出设计文档

主要关注快速编辑、图形质量和 SVG 导出。

### 4.2 Verification Engineer

典型需求：

- 根据协议要求绘制 Timing Requirement
- 展示 Setup/Hold 与 Delay 的关系

主要关注 Timing Window、Edge Relationship 和清晰的 SVG 输出。

### 4.3 Application / System Engineer

典型需求：

- 向客户或团队解释接口时序
- 动态演示采样过程

主要关注表达清晰和演示效果。

## 5. 核心使用场景

### 5.1 创建 Clock + Data Timing Diagram

用户创建 Clock，并设置 Period/Frequency、Start 和 Phase；随后创建 Data，并设置 Period/Frequency、Pattern 和 Start。时间与相位、周期与频率都使用可转换的统一输入。

系统自动生成 Clock Edge 和 Data Transition，并计算两者的时间关系。

### 5.2 调整 Clock Phase 并展示影响

用户拖动 Clock Edge 或修改 Phase。

系统实时更新 Waveform 和关联的 Delay / Setup/Hold 图形。

### 5.3 展示 Timing Constraint

用户选中一个目标 Signal，为它建立来自任意 Source Signal 的 Edge Delay。所选边沿作为对齐锚点，Current Delay 换算为目标 Signal 的派生 Start offset，从而平移整条目标波形；Min/Max 作为低对比度范围边界显示。

Setup/Hold Window 是附着在任意目标 Signal 上的独立约束。Reference 与 Constrained 两侧均可选择边沿类型和多个边沿编号；每个 Reference edge 产生独立窗口，任一所选目标 edge 进入时，该窗口以浅色半透明红色反馈，不生成 STA 式诊断文本。

### 5.4 Per-Signal Delay 动态展示

旧版沿时间轴移动 Sampling Point 的 Timing Sweep 不再采用。用户选中某个 Signal，为它设置 Source 和 Current Delay，目标整条波形的派生 Start 与相关 Setup/Hold Window 在画布中实时联动。

### 5.5 导出 Timing Document

用户将当前时序图导出为 SVG，用于设计文档或团队沟通。

PNG 和 PDF 导出属于后续版本。

## 6. V1 功能需求

### 6.1 工程管理

#### 新建工程

创建空白 Timing Project。

#### 保存工程

以 JSON 格式保存：

- Signals
- Delay Links
- Timing Constraints
- Canvas Settings
- View State

#### 打开工程

从 JSON 文件恢复完整编辑状态。

### 6.2 Signal 管理

V1 支持两种 Signal。

#### Clock

| 属性 | 说明 |
| --- | --- |
| Period | 周期 |
| Frequency | 频率 |
| Phase | 相位 |
| Start Time | 起始时间 |

#### Data

| 属性 | 说明 |
| --- | --- |
| Period / Frequency | Symbol 周期或等价频率 |
| Pattern | 由 `D0`、`D1`、`D2` 等 Token 组成的数据模式 |
| Start Time | 起始时间 |

### 6.3 Waveform 编辑

#### Signal 操作

- 调整 Signal 顺序
- 显示或隐藏 Signal
- 选择 Signal
- 复制 Signal
- 删除 Signal
- 拖拽调整 Signal 顺序

#### Edge 操作

- 点击选择 Edge
- 查看 Edge 属性
- 拖动 Edge 修改时间

#### Canvas 操作

| 操作 | 行为 |
| --- | --- |
| 时间轴下方鼠标拖动 | 平移水平和垂直视口 |
| 顶部时间轴横向拖动 | 选择时间范围并放大至横向填充 |
| Ctrl + Wheel | 以鼠标所在时间点为锚点，无预设倍率上限地缩放时间轴 |
| Shift + Wheel | 同步调整全部轨道与波形高度 |

### 6.4 时间单位系统

系统内部统一使用 `ps` 作为基础时间单位。

UI 时间输入支持：

- `ps`
- `deg`

角度必须基于关联 Clock 的周期换算。例如，当周期为 1000 ps 时，`-90 deg` 转换为 `-250 ps`。

### 6.5 Per-Signal Timing Illustration

系统支持：

- 选中任意 Signal 后，为其设置任意类型的 Source Signal 和两侧 edge
- Delay 不区分边沿极性，Clock 上升沿/下降沿与 Data transition 均按时间顺序统一编号
- 每条关系的 Min / Current / Max Delay
- 新建 Delay 默认 Min 0 ps、Current 10 ps、Max 20 ps
- 每条 Delay 带可编辑的 Diagram Label，新建时自动按 `t1`、`t2` 等顺序命名
- Current Delay 通过所选边沿锚点计算目标 Signal 的派生 Start offset，并平移整条目标波形
- Target 可继续作为另一条关系的 Source，使多个 Signal Delay 按依赖传播
- Setup/Hold 作为独立约束附着到目标 Signal，两侧均支持 Rising/Falling/All 类型与多个边沿编号
- 新建 Setup/Hold 约束时两侧默认均为 10 ps
- 每个 Reference edge 生成独立窗口；所选 Constrained edges 进入时，对应窗口整体显示浅色半透明红色反馈
- Min/Max 虚线边界、Delay 测量线和 Window 随 SVG 导出
- Signal 轨道最小高度为 48 px，保持较低的波形占高比例；Canvas Settings 可直接设置 48–160 px 的 Track Height，并与 Shift + 滚轮同步
- 延迟后的 Data Start 左侧显示连续引导线与起点标记，避免波形无承接地从空白处开始
- 用户可在画布右上角隐藏纵向网格，或在 Auto Reference 与 Custom Interval 之间切换

系统不自动计算 Margin、Pass/Violation 或 Worst Path。

### 6.6 动画

- 不实现旧版从左到右的扫描动画
- 动态展示围绕各 Signal 的 Current Delay 变化设计
- 动画过程不得改变原始时序数据

### 6.7 导出

V1 支持将当前 Timing Diagram 导出为 SVG。

## 7. UI 需求

### 7.1 总体布局

```text
┌──────────────────────────────────────────┐
│ Toolbar / Signal Visibility              │
├──────────────────────────────┬───────────┤
│ Track Header + Timing Canvas │ Property  │
│                              │ Panel     │
├──────────────────────────────┴───────────┤
│ Status Bar                               │
└──────────────────────────────────────────┘
```

### 7.2 Timing Canvas

Timing Canvas 的体验应接近 Waveform Viewer 与 Vector Editor 的结合，支持：

- 连续横向缩放
- 垂直滚动
- 顶部时间轴拖拽选区并放大至横向填充
- Fit All 恢复完整时间范围
- 由当前选中 Signal Period 驱动的时间网格
- Marker
- Selection

Grid 默认以 `1/4 Period` 划分，Major Grid 为 `1 Period`。缩放倍率不设置产品级上下限，高频 Signal 必须能够继续放大到单边沿可读。

### 7.3 Signal Track Header

不设置独立 Signal List。画布左侧固定的 Track Header 显示 Signal Name、Copy 和 Delete，并支持整行拖拽排序；顺序直接决定波形顺序。Delete 使用原位非模态二次确认。

Signal 显隐通过顶部 Signals 菜单统一管理，菜单始终列出可见与隐藏的所有 Signal。

### 7.4 Property Panel

Property Panel 用于创建对象、编辑对象和查看计算结果，包括：

- Clock：Period、Frequency、Phase、Start Time
- Data：Period/Frequency、Pattern、Start
- Signal Delay：Diagram Label、Source/Target Signal、两侧边沿、Min/Current/Max Delay
- Timing Constraint：Reference/Target Signal、两侧边沿类型与多个边沿编号、Setup/Hold
- Canvas Settings：Track Height、Vertical Grid 显示方式与间隔

## 8. 数据模型需求

```text
TimingProject
├── Signal[]
│   ├── Clock
│   └── Data
├── EdgeDelayLink[]
├── TimingConstraint[]
├── CanvasSettings
└── ViewState
```

数据模型应独立于具体 UI 组件，并能够无损序列化为 JSON。旧版 `linkedTiming` 仅用于打开历史工程时迁移，不再作为新工程的写入结构。

## 9. 非功能需求

### 9.1 性能

- 单个工程至少支持 100 个 Signal
- 支持大量 Edge 的绘制与交互
- 连续缩放和拖动时保持可用的交互流畅度

V1 在技术方案确定后补充可量化的帧率、Edge 数量和加载时间指标。

### 9.2 可维护性

- 业务逻辑与 UI 分离
- Timing Calculation 必须位于可独立测试的共享核心模块
- UI 层只负责渲染、交互和用户输入编排
- 工程文件格式需要版本号，以便后续迁移

### 9.3 正确性

- 所有时间计算统一使用 `ps`
- 角度与时间单位转换必须可重复且无歧义
- 所有影响时序的编辑操作必须触发 Timing Engine 重新计算
- Timing Engine 必须具备自动化测试

## 10. 版本范围与优先级

### 10.1 V1 / P0：首个可用版本

- Clock 创建与编辑
- Data 创建与编辑
- Waveform 渲染
- Edge 选择与拖动
- Data Symbol Pattern Builder
- Signal 拖拽排序
- 固定在画布左侧的 Signal Label
- JSON 保存与打开
- SVG 导出
- Per-Signal Delay 与多级联动
- 多边沿 Setup/Hold 约束及图形反馈
- Canvas Settings

### 10.2 V1 增强项

- Shortcut：Delete、Undo、Copy/Paste
- Snap：Edge Snap、Clock Snap

Shortcut 和 Snap 是否纳入首个 V1 发布里程碑，在开发排期时确认。

### 10.3 V2 / P1：编辑能力增强

- Annotation：Text、Arrow、Measurement
- Bus，例如 `DATA[7:0]`

### 10.4 V2 / P2：输出能力增强

- PNG 导出
- PDF 导出
- 图片模板

## 11. V1 验收标准

V1 达到以下条件时视为可验收：

1. 用户可以从空白工程创建至少一个 Clock 和一个 Data Signal。
2. 修改 Signal 参数后，波形和时间位置立即正确更新。
3. 用户可以为任意 Signal 配置跨类型 Source Delay，修改 Current 后整条目标波形及后级 Delay 实时联动。
4. 用户可以在 Period/Frequency 之间切换输入，并得到相同的底层时间值。
5. 用户可以在 ps/phase 之间切换输入 Start 和 Clock Phase。
6. 用户可以使用快捷 Token 或批量输入构建 `D0 D1 D2` Pattern。
7. 相同 Data Token 在所有位置使用相同颜色，并始终显示名称。
8. 用户可以拖拽 Signal Track Header 改变波形顺序，并复制 Signal。
9. 用户可以保存工程，重新打开后 Signals 和 View State 正确恢复。
10. 用户可以导出内容完整、可缩放的 SVG。
11. 一个包含 100 个 Signal 的工程仍可完成基本编辑、缩放和滚动。
12. Timing Engine 的单位换算与 Pattern 规则通过自动化测试。
13. 用户可以在约束两侧选择边沿类型和多个边沿；目标边沿进入窗口时，仅对应窗口显示半透明红色反馈。
14. Track Height 与 Vertical Grid 设置保存后可以正确恢复，并出现在 SVG 中。

## 12. 产品成功指标

### 12.1 效率

目标用户能够在 5 分钟内完成一个基础接口 Timing Diagram。

### 12.2 正确性

修改 Signal、Delay 或 Constraint 参数后，对应波形和图形关系自动且正确地更新。

### 12.3 可用性

用户无需学习专业 EDA 软件，即可完成绘制、关系展示、保存和导出。

## 13. 产品核心原则

1. Timing Diagram 不是图片，而是具有物理意义的数据模型。
2. 所有影响时序的编辑操作都必须经过 Timing Engine。
3. UI 是编辑器，Timing Engine 是可独立测试的时序计算核心。

## 14. 开工前待确认事项

以下事项不阻塞需求归档，但需要在技术设计或首轮迭代拆分时明确：

- 桌面运行时和前端技术栈
- Data Pattern 的 V1 输入格式及合法性规则
- Delay 依赖形成环路时的阻止与解释方式
- 很长的 Delay 链同时存在时的关系筛选与排版方式
- 多个 Clock 存在时，`deg` 输入关联哪个 Clock
- Edge 拖动对周期生成波形的影响：修改单个 Edge、调整 Phase，还是改变 Pattern
- Undo/Redo 和 Snap 是否属于首个可发布版本
- 100 Signal 场景对应的目标 Edge 数量及性能门槛
- JSON 工程格式的初始 Schema 和版本迁移策略
