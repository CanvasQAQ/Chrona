# Chrona 产品需求文档（PRD）

> 文档状态：V1 需求基线
> 记录日期：2026-07-27
> 实现状态：V1 开发中
> 原产品工作名：Timing Diagram Editor

> 2026-07-28 修订：输入、Data Pattern、Signal Track Header、Canvas 与动画定义已更新。冲突内容以 [V1 交互修订说明](INTERACTION_SPEC.md) 为准。

## 1. 产品概述

### 1.1 产品名称

Chrona

### 1.2 产品定位

Chrona 是一个面向硬件设计工程师、验证工程师和系统工程师的桌面级时序绘制与分析工具，用于快速创建、编辑、分析和展示数字系统中的：

- Clock 时钟关系
- Data 数据变化
- Setup/Hold 时序约束
- Timing Margin
- Timing Violation
- 时序动画扫描

产品帮助工程师在设计、调试和文档沟通阶段快速理解复杂时序关系。

### 1.3 一句话定义

> 一个面向硬件工程师的可交互 Timing Diagram 编辑器，将传统静态时序图升级为可计算、可分析、可动画化的工程工具。

## 2. 产品背景

工程师目前通常使用 PowerPoint、Visio、Draw.io、波形截图或 EDA 波形查看器处理 Timing Diagram，存在以下问题：

### 2.1 绘制效率低

修改一个 Clock Phase 或 Data Edge 时，往往需要重新调整大量图形。

### 2.2 缺少时序语义

普通绘图工具无法理解 Clock Period、Data Rate、Setup/Hold Window 和 Phase Relationship，因此图形即使看起来正确，也无法保证时序逻辑正确。

### 2.3 缺少交互分析能力

传统工具难以支持拖动 Edge 查看 Timing Margin、调整 Phase 后实时观察影响，以及通过动画观察采样窗口。

## 3. 产品目标

打造一个“类似 Figma 的 Timing Diagram 编辑器 + 基础 Timing Analysis 引擎”，提供：

- 可视化编辑
- 时序计算
- 交互分析
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

- 根据协议要求验证 Timing Requirement
- 检查 Setup/Hold Margin

主要关注 Violation 标记、Timing Window 和 Edge Relationship。

### 4.3 Application / System Engineer

典型需求：

- 向客户或团队解释接口时序
- 动态演示采样过程

主要关注表达清晰和演示效果。

## 5. 核心使用场景

### 5.1 创建 Clock + Data Timing Diagram

用户创建 Clock，并设置 Period/Frequency、Start 和 Phase；随后创建 Data，并设置 Period/Frequency、Pattern 和 Start。时间与相位、周期与频率都使用可转换的统一输入。

系统自动生成 Clock Edge 和 Data Transition，并计算两者的时间关系。

### 5.2 调整 Clock Phase 并分析影响

用户拖动 Clock Edge 或修改 Phase。

系统实时更新 Waveform、Sampling Window 和 Timing Margin。

### 5.3 检查 Timing Constraint（待重新定义）

Setup/Hold、Min/Max Delay、不确定性和 Violation 的产品语义需要结合新的动画需求单独定义。在定义完成前，不显示可能误导用户的分析结论。

### 5.4 Delay Uncertainty 动画（待重新定义）

旧版沿时间轴移动 Sampling Point 的 Timing Sweep 不再采用。未来动画用于展示 Clock/Data 不确定性造成的 Min/Max Delay 偏移，以及不同 Delay 对 Violation 的影响。

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
- Constraints
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

### 6.5 Timing Analysis（定义中）

系统自动计算：

- Setup Window
- Setup Margin
- Setup Violation
- Hold Window
- Hold Margin
- Hold Violation

上述结果的精确定义暂缓，等待 Min/Max Delay 与不确定性模型确认后再进入实现。

### 6.6 动画（定义中）

- 不实现旧版从左到右的扫描动画
- 后续动画围绕 Min/Max Delay、不确定性和 Violation 设计
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
- Constraint 与 Analysis Result：待新的 Delay/Violation 模型定义后补充

## 8. 数据模型需求

```text
TimingProject
├── Signal[]
│   ├── Clock
│   └── Data
├── Constraint[]
└── ViewState
```

数据模型应独立于具体 UI 组件，并能够无损序列化为 JSON。

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
3. 用户可以拖动 Edge，且底层时间数据同步更新。
4. 用户可以在 Period/Frequency 之间切换输入，并得到相同的底层时间值。
5. 用户可以在 ps/phase 之间切换输入 Start 和 Clock Phase。
6. 用户可以使用快捷 Token 或批量输入构建 `D0 D1 D2` Pattern。
7. 相同 Data Token 在所有位置使用相同颜色，并始终显示名称。
8. 用户可以拖拽 Signal Track Header 改变波形顺序，并复制 Signal。
9. 用户可以保存工程，重新打开后 Signals 和 View State 正确恢复。
10. 用户可以导出内容完整、可缩放的 SVG。
11. 一个包含 100 个 Signal 的工程仍可完成基本编辑、缩放和滚动。
12. Timing Engine 的单位换算与 Pattern 规则通过自动化测试。

## 12. 产品成功指标

### 12.1 效率

目标用户能够在 5 分钟内完成一个基础接口 Timing Diagram。

### 12.2 正确性

拖动 Edge 或修改时序参数后，Timing Result 自动且正确地更新。

### 12.3 可用性

用户无需学习专业 EDA 软件，即可完成绘制、分析、保存和导出。

## 13. 产品核心原则

1. Timing Diagram 不是图片，而是具有物理意义的数据模型。
2. 所有影响时序的编辑操作都必须经过 Timing Engine。
3. UI 是编辑器，Timing Engine 是可独立测试的时序计算核心。

## 14. 开工前待确认事项

以下事项不阻塞需求归档，但需要在技术设计或首轮迭代拆分时明确：

- 桌面运行时和前端技术栈
- Data Pattern 的 V1 输入格式及合法性规则
- Setup/Hold 的参考 Edge、采样 Edge 和 Margin 计算定义
- Clock/Data 不确定性、Min/Max Delay 与 Violation 动画定义
- 多个 Clock 存在时，`deg` 输入关联哪个 Clock
- Edge 拖动对周期生成波形的影响：修改单个 Edge、调整 Phase，还是改变 Pattern
- Undo/Redo 和 Snap 是否属于首个可发布版本
- 100 Signal 场景对应的目标 Edge 数量及性能门槛
- JSON 工程格式的初始 Schema 和版本迁移策略
