# Changelog

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
