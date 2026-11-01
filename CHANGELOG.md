# Changelog

## v0.3.1 — 2026-11-01

### Added

- Bus 混合区显示、逐路固定 skew 与整条 Bus 的共享 Setup/Hold 约束；采样落在混合区但未直接违例时标黄
- 四路 Bus skew 示例工程与本地预览

### Fixed

- 数字输入允许暂时清空并保持逐键实时反馈，避免自动补零、改动其他边界值和焦点跳转
- 红色及黄色约束提示绘制在 Bus 波形之上

### Validation

- Bus 相关 12 项测试及生产构建通过

## v0.3.0 — 2026-11-01

### Added

- 多通道 Bus 编辑、批量生成/粘贴数据、通道局部覆盖及折叠/精选/全部展示
- 桌面版可选本地 MCP 服务及 Agent 连接面板，支持读取工程与解析波形、批量创建和编辑 Signal/Bus/Delay/Setup-Hold/Derived Q
- 内存编辑会话与修订校验，避免 Agent 的旧上下文覆盖手动修改；原子批次、请求去重与计算额度限制
- 手动和 Agent 编辑共享的 Undo/Redo，以及有界的内存历史
- Agent 操作指南与本机接入文档

### Changed

- 改进信号创建流程、波形配色与数据标签展示，支持更紧凑的波形视图

### Validation

- 全量 48 项测试与生产构建通过
- Electron + 真实 MCP 客户端联调通过：画布更新、撤销重做、手动编辑冲突、重新打开会话失效及端口关闭

## v0.2.0 — 2026-08-04

### Added

- Sequential Derived Data，可从指定 Clock 与 Data 实时生成 DFF/Latch 输出 Q
- DFF Rising/Falling 采样边沿与 C→Q Min/Current/Max
- Latch High/Low 透明电平，以及独立的 C→Q、D→Q Min/Current/Max
- Q 边沿的延迟范围、C→Q/D→Q 来源标签和 Latch 透明区间
- Derived Data 的多级依赖与循环检测

### Changed

- 工程格式升级为 schema v3，并继续兼容 v2 工程
- Delay、Setup/Hold 与 Sequential Derivation 统一使用最终解析后的波形边沿
- Derived Data 可以作为 Delay Source/Target 和 Setup/Hold Reference/Constrained Signal
- 延迟后的 Clock、Data 和 Q 会继续驱动下游 Sequential Data

### Validation

- 新增 DFF、Latch、Delay 兼容、Setup/Hold 兼容和跨类型循环依赖测试
- 全量自动化测试和生产构建通过
