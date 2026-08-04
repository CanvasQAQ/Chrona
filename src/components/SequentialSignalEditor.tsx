import { SegmentedControl, Select } from "@mantine/core";
import { DelayRangeEditor } from "./DelayRangeEditor";
import {
  type DataSignal,
  type SequentialDerivation,
  type Signal,
} from "../domain/timing";

interface SequentialSignalEditorProps {
  selected: DataSignal & { derivation: SequentialDerivation };
  signals: Signal[];
  error?: string;
  onChange: (derivation: SequentialDerivation) => void;
}

export function SequentialSignalEditor({
  selected,
  signals,
  error,
  onChange,
}: SequentialSignalEditorProps) {
  const derivation = selected.derivation;
  const clockOptions = signals
    .filter((signal) => signal.kind === "clock")
    .map((signal) => ({ value: signal.id, label: signal.name }));
  const dataOptions = signals
    .filter((signal) => signal.kind === "data" && signal.id !== selected.id)
    .map((signal) => ({ value: signal.id, label: signal.name }));
  const patch = (next: Partial<SequentialDerivation>) =>
    onChange({ ...derivation, ...next });

  return (
    <div className="sequential-signal-editor">
      {error && <div className="sequential-error" role="alert">{error}</div>}
      <div className="sequential-field">
        <span>Device</span>
        <SegmentedControl
          fullWidth
          size="xs"
          value={derivation.device}
          data={[
            { value: "dff", label: "DFF" },
            { value: "latch", label: "Latch" },
          ]}
          onChange={(device) =>
            patch(
              device === "dff"
                ? { device: "dff", trigger: "rising", d2q: undefined }
                : {
                    device: "latch",
                    trigger: "high",
                    d2q: derivation.d2q ?? { minPs: 0, currentPs: 20, maxPs: 40 },
                  },
            )
          }
        />
      </div>
      <Select
        label="Clock"
        data={clockOptions}
        value={derivation.clockSignalId}
        allowDeselect={false}
        onChange={(clockSignalId) => clockSignalId && patch({ clockSignalId })}
      />
      <Select
        label="Data"
        data={dataOptions}
        value={derivation.dataSignalId}
        allowDeselect={false}
        onChange={(dataSignalId) => dataSignalId && patch({ dataSignalId })}
      />
      <div className="sequential-field">
        <span>{derivation.device === "dff" ? "Sampling edge" : "Transparent level"}</span>
        <SegmentedControl
          fullWidth
          size="xs"
          value={derivation.trigger}
          data={
            derivation.device === "dff"
              ? [
                  { value: "rising", label: "Rising" },
                  { value: "falling", label: "Falling" },
                ]
              : [
                  { value: "high", label: "High" },
                  { value: "low", label: "Low" },
                ]
          }
          onChange={(trigger) => patch({ trigger: trigger as SequentialDerivation["trigger"] })}
        />
      </div>
      <Select
        label="Initial Q"
        data={["0", "1", "X", "Z"]}
        value={derivation.initialValue}
        allowDeselect={false}
        onChange={(initialValue) => initialValue && patch({ initialValue })}
      />
      <DelayRangeEditor
        label="C→Q delay"
        value={derivation.c2q}
        onChange={(c2q) => patch({ c2q })}
      />
      {derivation.device === "latch" && derivation.d2q && (
        <DelayRangeEditor
          label="D→Q delay"
          value={derivation.d2q}
          onChange={(d2q) => patch({ d2q })}
        />
      )}
      <p className="sequential-helper">
        {derivation.device === "dff"
          ? "Q samples D on the selected clock edge."
          : `Q follows D through D→Q while CLK is ${derivation.trigger.toUpperCase()}.`}
      </p>
    </div>
  );
}
