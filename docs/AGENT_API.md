# 本机 Agent 接入（MCP）

Chrona 桌面版提供可选的本地 MCP Server。外部 Agent 修改的是当前窗口正在编辑的工程，画布沿用现有时序引擎实时更新。无需配置模型密钥或在 Chrona 内运行模型。

## 连接

1. 运行 `npm run dev`，或构建后运行 `npm start` 打开 Electron 桌面应用。
2. 顶部 **Agent → Enable local access**。
3. 点击 **Copy MCP configuration**，在支持 Streamable HTTP、自定义 Authorization header 的 Agent 客户端中添加服务。复制结果采用通用 JSON 形式；客户端配置格式不同时，将 URL 和 header 填入对应字段。

```json
{
  "mcpServers": {
    "chrona": {
      "url": "http://127.0.0.1:<界面显示的端口>/mcp",
      "headers": {
        "Authorization": "Bearer <界面显示的 token>"
      }
    }
  }
}
```

4. 告诉 Agent：“读取 `chrona://guide` 和当前工程，创建一个 1 ns 周期的 CLK 和数据 D。”
5. 画布显示修改结果，底部状态栏显示批次摘要。顶部 Undo/Redo 同时适用于用户与 Agent 的修改。

服务默认关闭，只监听 `127.0.0.1`。每次启用分配随机端口、新 token，因此重新启用后需要更新客户端配置。停用、刷新窗口、关闭窗口或退出应用会清理对应服务。Token 代表对该窗口工程的读写访问，复制的配置也包含它。第一版仅支持原生本机客户端，不接受带 Origin 的浏览器请求，不提供 CORS、远程访问或 stdio 桥接。

`npm run dev:renderer` 打开的网页预览不提供主进程接口；Agent 面板会说明需要桌面版。

## 接口与说明

| 入口 | 用途 |
| --- | --- |
| `chrona://guide` | Agent 操作规则、时间单位和示例 |
| `chrona://project` | 当前工程摘要与修订号 |
| `chrona_read` | 获取摘要、指定信号、完整工程或解析波形 |
| `chrona_apply` | 原子应用一批操作 |

MCP 由官方 `@modelcontextprotocol/sdk` 提供，使用无协议会话的 Streamable HTTP JSON 响应。以下编辑会话 ID 是 Chrona 自己的一致性标识，与 MCP 传输会话无关。

### 读取

`chrona_read({})` 返回 `sessionId`、`revision`、工程名称、时长、信号摘要和 Bus/Delay/约束。选用以下参数：

- `signalIds: ["clk", "d"]`：返回指定信号的完整定义。
- `includeProject: true`：返回完整 `project`，沿用 `.chrona.json` 数据模型。
- `waveform: { startPs: 0, endPs: 3000 }`：返回选中信号在范围内经 Delay/Sequential 解析后的 points/events，以及范围起点的值。DFF 在输入 Bus 混合区采样时，波形仍返回按当前边沿计算的值，并附 `uncertainSamples`（采样时间和输出时间）。默认选中全部信号，建议同时指定 signalIds。
- `sessionId`：可选，要求读取特定编辑会话；不匹配时返回错误。

所有时间均为 ps。周期至少 1 ps，Clock dutyCycle 为 0.05–0.95 的比例值。Waveform 范围必须在工程时长内，起点小于终点。

### 写入

先读取，再使用返回的会话与修订号提交：

```json
{
  "sessionId": "从读取结果取得",
  "expectedRevision": 0,
  "requestId": "unique-request-1",
  "operations": [
    {
      "type": "create_signal",
      "signal": {
        "id": "clk",
        "kind": "clock",
        "name": "CLK",
        "periodPs": 1000
      }
    },
    {
      "type": "create_signal",
      "signal": {
        "id": "d",
        "kind": "data",
        "name": "D",
        "periodPs": 500,
        "pattern": ["0", "1", "1", "0"]
      }
    }
  ]
}
```

由调用方提供新对象 ID；同一批次后续操作可引用它们。Bus 自动生成通道 ID，提交后返回 signal ID 列表。字段定义以 MCP `tools/list` 暴露的 Schema 和 [共享 Schema](../shared/agent-schema.js) 为准。

| 操作 | 参数与语义 |
| --- | --- |
| `create_signal` | `signal`：`kind` 为 clock/data/derived；后者必须提供 derivation，保存为 sequential Data |
| `update_signal` | `id, patch`：修改允许的字段，不能改变 kind；修改 Bus 通道的 pattern/start/period 会设置局部 override；`busOffsetPs` 设置固定偏移，`null` 恢复继承 |
| `delete_signal` | `id`：删除独立信号；同批次需移除或改接依赖 |
| `create_bus` | `bus`：id/name/periodPs；普通名称需要 width，`data<10:4>` 可推导 width=7；可设置 startPs、rule、earlyPs、latePs、channelFirst、channelStep；自动创建通道 |
| `create_derived_bus` | `bus`：id/name/sourceBusId/clockSignalId/device/trigger/c2q/initialValue，Latch 还需 d2q；原子创建与输入同宽、按内部序号对应的输出 Bus |
| `update_bus` | `id, patch`：修改默认参数、earlyPs/latePs、编号、显示模式和精选通道；保留局部 override |
| `resize_bus` | `id, width`：扩缩容，保留存留通道 ID；缩窄会删除被删通道的 Delay/约束，其他派生引用需同批处理 |
| `apply_bus_patterns` | `id, channelIndexes, patterns, replaceOverrides?`：逐路批量设置 Pattern；默认跳过已有局部 Pattern override |
| `restore_bus_parameter` | 通道 `id` 与 `parameter`（pattern/startPs/periodPs）：恢复继承 Bus 默认值 |
| `delete_bus` | `id`：删除 Bus 与其通道，同批次需处理外部依赖 |
| `put_delay` | `delay`：按 ID 创建或替换完整关系；每个目标只允许一个 source delay |
| `delete_delay` | `id` |
| `put_constraint` | `constraint`：按 ID 创建或替换完整 Setup/Hold 约束 |
| `delete_constraint` | `id` |
| `update_project` | `patch`：name/durationPs |

Bus 的 `channelIndexes` 和 `selectedChannels` 始终使用从 0 开始的内部序号；`data<10:4>` 的显示编号则为 10、9、…、4。新建时若同时给 `width`，须与名称区间一致。修改已有 Bus 的名称区间时须先把 Bus 调整到相同宽度。`earlyPs`/`latePs` 是非负的不确定性范围；固定 `busOffsetPs` 可为负，且取代该通道继承的范围。MCP 读取工程及波形时使用相同的计算结果；X 纹理、调色板与混合区虚线由画布自动绘制。

示例：

```json
{"sessionId":"FROM_READ","expectedRevision":0,"requestId":"bus-example-1","operations":[
  {"type":"create_bus","bus":{"id":"data_bus","name":"data<10:4>","periodPs":1000,"earlyPs":140,"latePs":180}},
  {"type":"update_bus","id":"data_bus","patch":{"displayMode":"selected","selectedChannels":[0,6]}}
]}
```

创建后先用 `chrona_read` 获取新通道 ID，再用 `update_signal` 设置单路固定偏移或用 `apply_bus_patterns` 批量设置数据。派生 Bus 示例：`{"type":"create_derived_bus","bus":{"id":"q_bus","name":"Q","sourceBusId":"data_bus","clockSignalId":"clk","device":"dff","trigger":"rising","c2q":{"minPs":0,"currentPs":10,"maxPs":20},"initialValue":"X"}}`。

Delay 边沿编号从 1 开始，延迟范围满足 `0 <= minPs <= currentPs <= maxPs`。DFF 使用 rising/falling，Latch 使用 high/low 且必须提供 d2q。派生 Q 必须编辑 derivation 或输入源，禁止直接设置 pattern。共享依赖图检测循环和缺失源。

## 一致性与恢复

- Chrona 是权威状态源，所有已提交的手动/Agent 变更经 `ProjectSession.update` 同步提交。只读、平移、缩放、选择不递增修订；已保存的画布设置会递增。
- 每次有效提交递增 revision，一批操作对应一次提交和一次 Undo。撤销/重做也递增，绝不退回旧修订号。没有改变内容的提交不递增。
- `REVISION_CONFLICT`：用户或其他 Agent 已修改。重新读取、重新判断需求，然后用新的 requestId 提交；不能只替换版本号盲目重放。
- `SESSION_MISMATCH`：工程重新打开。丢弃旧计划，读取新会话。
- 网络超时后：使用**完全相同的 requestId 和参数**重试。最近成功请求保留去重结果，最多 256 个且估算总大小不超过 8 MiB；同 ID 不同内容返回 `REQUEST_ID_REUSED`。缓存淘汰后旧 expectedRevision 仍然不能覆盖新内容。
- 重放结果有 `replayed: true` 和 `currentRevision`，原始 `revision` 是当时提交的版本；原始效果可能已被用户撤销，不能据此假定当前内容。
- 非法操作或最终依赖图校验失败则整个批次零写入。删除依赖源时必须在同一批次显式处理相关 Delay/Constraint/Derived Q。
- 暂无推送订阅。版本检查在执行时发生，不依赖客户端是否刷新上下文。

修订号、去重记录和撤销历史只在内存。打开工程重新生成 sessionId、从 revision 0 开始；不修改 `.chrona.json` 格式。Undo/Redo 合计最多保留 50 步且快照序列化后的估算总大小不超过 16 MiB（实际对象堆占用不同）；不提供跨会话撤销或选择性“只撤销某个 Agent”的操作。保存仍使用现有 Save 按钮。

## 第一版限制

每批至多 100 个操作，工程至多 1024 个信号、4096 条关系，Pattern 至多 4096 项。为避免阻塞画布，Agent 提交/波形读取还会限制估算的波形计算步数为 100000（含偏移与 Delay），每次返回最多 5000 个波形点/事件；超限需缩小范围或调整工程。手动编辑不受自动化接口这些额度的限制。

HTTP 请求限制为 1 MiB，同时最多 32 个请求。主进程等待 Renderer 15 秒，过期请求不再执行；不确定的超时结果应沿用 requestId 重试。

尚未暴露分组、图片预览、文件读写、自动保存和导出。多路 Derived Data 可用 `create_derived_bus` 一次创建；输出 Bus 宽度与 Pattern 不能直接改动，派生通道仍可逐路编辑。DFF 在输入 Bus 混合区内采样时保留按当前边沿计算的值，并附黄色提示；直接 Setup/Hold 违例仍为红色且不叠加黄色提示；Latch 的透明窗口仍按现有单路模型计算。Chrona 用于调试示意，不替代 STA。

## 实现与验证

- `shared/agent-schema.js`：主进程和 Renderer 共用的参数 Schema。
- `src/features/agent/projectSession.ts`：会话、提交、撤销、批次校验与读取。
- `electron/agent-service.cjs`：可独立测试的 MCP 服务。
- `electron/agent-ipc.cjs`、`preload.cjs`：窗口生命周期和受限桥接。
- `src/features/agent/AgentPanel.tsx`：启停、配置和活动状态。

运行 `npm test`（包含临时 loopback 监听的真实 MCP 客户端测试）和 `npm run build`。在限制本地端口的沙箱中运行测试，需要允许 loopback 监听。
