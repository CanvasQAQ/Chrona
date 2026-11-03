# 快速入门：打开示例、调整 Delay 并导出 SVG

在这篇练习中，你会让数据相对时钟晚到 200 ps，并导出一张可以插入设计文档的时序图。

准备好 Chrona 桌面版和[基础时序示例](../examples/generic-timing-example.chrona.json)。如果从 GitHub 获取示例，请下载原始 JSON 文件；如果已克隆仓库，文件就在 `examples/` 目录。桌面安装包和源码启动命令见 [README](../README.md)。

## 打开示例

1. 打开 Chrona，在顶部工具栏选择文件夹图标 **Open project**。
2. 选择 `generic-timing-example.chrona.json`。打开后，画布左侧会列出 **CLK**、**AUX_CLK**、**DATA_BUS** 等信号，工具栏的 **Duration** 为 12000 ps。

## 让数据晚到 200 ps

1. 在画布上方选择 **Delays**，打开底部的延迟控制台。找到目标为 **DATA_BUS**、来源为 **AUX_CLK**、测量线名称为 **t2** 的一行。
2. 确认这一行的 **Current** 为 **420 ps**。把中间的滑块拖到最右端，直到读数为 **620 ps**。保留两侧的 **MIN**（180 ps）和 **MAX**（620 ps）。
3. 对照画布起点附近的 **t2** 测量线：时钟端不动，数据端向右移动，**DATA_BUS** 进入第一个 **X** 的边沿从 420 ps 移到 620 ps。另一条关系 **t1** 仍为 250 ps。如果两条边沿靠得太近，在顶部时间轴横向拖选起始区间即可放大查看。

## 导出完整时序图

1. 在窗口顶部选择 **Export SVG**。在弹出的面板中选择 **All time**，这样即使刚才放大了局部，导出范围仍是完整的 0–12000 ps。
2. 选择面板底部的 **Export SVG**。状态栏会显示 **SVG exported** 和导出时间范围。
3. 打开导出的 `generic-timing-example.svg`，确认图中包含 **AUX_CLK**、**DATA_BUS** 和标为 **t2** 的测量线。SVG 用于分享图形；要保留可继续编辑的练习工程，请用顶部的 **Save project as…** 将其另存为新的 `.chrona.json` 文件。

接下来可以打开[四路偏移示例](../examples/bus-skew.chrona.json)，对照[总线的混合区与逐路偏移](BUS.md#混合区与逐路偏移)，观察多条通道的边沿如何组成一个换拍区间。
