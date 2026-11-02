import { SegmentedControl, Select, TextInput } from "@mantine/core";
import { DelayRangeEditor } from "./DelayRangeEditor";
import { formatBusName } from "../domain/bus";
import type { DerivedBusOptions } from "../domain/derivedBus";
import type { TimingProject } from "../domain/timing";

interface Props {
  project: TimingProject;
  value: DerivedBusOptions;
  onChange: (value: DerivedBusOptions) => void;
}

export function DerivedBusEditor({ project, value, onChange }: Props) {
  const patch = (next: Partial<DerivedBusOptions>) => onChange({ ...value, ...next });
  const source = project.buses?.find(bus => bus.id === value.sourceBusId);
  return <div className="sequential-signal-editor">
    <TextInput label="Output Bus name and bit range" description="A range such as Q<10:4> must match the input Bus width." value={value.name} onChange={event => patch({ name: event.currentTarget.value })} />
    <Select label="Input Bus" data={(project.buses ?? []).map(bus => ({ value: bus.id, label: formatBusName(bus) }))}
      value={value.sourceBusId} allowDeselect={false} onChange={sourceBusId => sourceBusId && patch({ sourceBusId })} />
    <Select label="Clock" data={project.signals.filter(signal => signal.kind === "clock").map(signal => ({ value: signal.id, label: signal.name }))}
      value={value.clockSignalId} allowDeselect={false} onChange={clockSignalId => clockSignalId && patch({ clockSignalId })} />
    <div className="sequential-field"><span>Device</span><SegmentedControl fullWidth size="xs" value={value.device}
      data={[{ value: "dff", label: "DFF" }, { value: "latch", label: "Latch" }]}
      onChange={device => patch(device === "dff" ? { device: "dff", trigger: "rising", d2q: undefined }
        : { device: "latch", trigger: "high", d2q: { minPs: 0, currentPs: 20, maxPs: 40 } })} /></div>
    <div className="sequential-field"><span>{value.device === "dff" ? "Sampling edge" : "Transparent level"}</span>
      <SegmentedControl fullWidth size="xs" value={value.trigger}
        data={value.device === "dff" ? [{ value: "rising", label: "Rising" }, { value: "falling", label: "Falling" }]
          : [{ value: "high", label: "High" }, { value: "low", label: "Low" }]}
        onChange={trigger => patch({ trigger: trigger as DerivedBusOptions["trigger"] })} /></div>
    <Select label="Initial Q" data={["0", "1", "X", "Z"]} value={value.initialValue} allowDeselect={false}
      onChange={initialValue => initialValue && patch({ initialValue })} />
    <DelayRangeEditor label="C→Q delay" value={value.c2q} onChange={c2q => patch({ c2q })} />
    {value.device === "latch" && value.d2q && <DelayRangeEditor label="D→Q delay" value={value.d2q} onChange={d2q => patch({ d2q })} />}
    <p className="sequential-helper">Creates {source?.width ?? 0} independent Q channels, matched to input channels by position. Each Q can be edited afterward. DFF samples inside an input mixed-data interval keep the current-edge value and show a yellow warning.</p>
  </div>;
}
