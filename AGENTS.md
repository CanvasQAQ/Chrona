# Chrona 仓库文档维护指南

本指南适用于在本仓库开发或修改功能的 Agent。动手前阅读[工程约定](docs/CONVENTIONS.md)，再按本次改动影响的读者选取文档。把文档更新和功能改动放在同一批变更中。

## 文档如何组织

[README](README.md) 是公共入口，按画图用户、MCP 接入者和项目维护者组织。画图操作和可观察结果写在用户指南中，MCP 的请求与响应写在接口参考中，架构和工程规则写在工程约定中。新增页面时，放进对应的阅读路径，让读者能从首页或相关主题找到它。

## 功能变更后更新哪里

| 改动影响 | 更新位置与核对事项 |
| --- | --- |
| 打开工程、调整 Delay、导出 SVG | 对照[时序图快速入门](docs/quickstart-timing-diagram.md)，核对控件名称、操作顺序、示例读数和导出结果。教程使用[基础时序示例](examples/generic-timing-example.chrona.json)。 |
| Bus、通道偏移、派生采样或警告 | 更新[总线与通道](docs/BUS.md)中的操作和波形含义。检查 [examples](examples/) 中对应的工程能否演示新行为。若 MCP 也暴露了这项能力，同时更新接口说明。 |
| 增加其他画图任务或改变交互 | 优先更新讲解该任务的现有页面。缺少合适页面时，在 `docs/` 新建任务指南，从 README 的“使用 Chrona 画图”或相关主题链接过去。 |
| MCP 工具、字段、错误、限制或重试行为 | 更新[接入与 API 参考](docs/AGENT_API.md)。字段与示例须符合[共享 Schema](shared/agent-schema.js)。外部 Agent 通过 `chrona://guide` 获取的操作规则来自[运行时指南](shared/agent-guide.js)，受影响的规则也要同步。 |
| 工程格式、迁移、模块职责或开发规范 | 更新[工程约定](docs/CONVENTIONS.md)。格式变更还要核对[工程文件解析器](src/features/project/projectSerialization.ts)与受影响的示例，保留用于演示旧格式兼容性的样本。 |
| 安装、启动、打包或新增示例入口 | 更新 [README](README.md) 的对应路径。运行命令对照 [package.json](package.json)，安装包和发布条件对照[桌面构建工作流](.github/workflows/build-desktop.yml)。 |
| 用户在升级时需要知道的新增功能、行为变化或修复 | 在[版本记录](CHANGELOG.md)的目标版本下说明用户能观察到的变化。版本尚未确定时归入“未发布”。 |

例如，为派生总线增加一种可由 MCP 查询的采样警告时，画图用户需要知道何时出现警告、怎样在示例中看到它。接入者需要知道哪个字段返回该警告，同时核对运行时指南对采样结果的解释。两处通过链接关联，共用同一份字段定义。

## 设计与交付记录

[产品需求基线](docs/PRD.md)和 [V1 交互修订](docs/INTERACTION_SPEC.md)记录需求、取舍与验收标准。变更这些决定时，保留原有背景并补充修订说明。[Agent 首版实施计划](docs/AGENT_INTEGRATION_PLAN.md)和[早期视觉探索稿](design-system/chrona/MASTER.md)是带有历史背景的记录。当前用法应发布在上表对应的指南或参考页。

## 提交前核对

从受影响的 README 入口进入文档，检查相对链接、章节锚点和示例路径。对照实际界面或接口核对名称、默认值、单位和限制。修改教程步骤时，用随文示例复核预期结果，并在交付说明中写明验证方式。
