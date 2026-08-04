import {
  Button,
  MultiSelect,
  NumberInput,
  Select,
  Slider,
  TextInput,
} from "@mantine/core";
import { Link2, ShieldAlert, Trash2 } from "lucide-react";
import {
  signalEdges,
  signalEdgesByPolarity,
  type EdgeDelayLink,
  type EdgePolarity,
  type Signal,
  type TimingConstraint,
} from "../domain/timing";

interface SignalTimingEditorProps {
  constraint?: TimingConstraint;
  delayLink?: EdgeDelayLink;
  durationPs: number;
  selected: Signal;
  signals: Signal[];
  edgeTimes?: (signal: Signal, polarity: EdgePolarity) => number[];
  onAddConstraint: (sourceSignalId: string) => void;
  onAddDelay: (sourceSignalId: string) => void;
  onChangeConstraint: (patch: Partial<TimingConstraint>) => void;
  onChangeDelay: (patch: Partial<EdgeDelayLink>) => void;
  onRemoveConstraint: () => void;
  onRemoveDelay: () => void;
}

function numericValue(value: string | number, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function edgeCount(
  signal: Signal | undefined,
  durationPs: number,
  edgeTimes?: (signal: Signal, polarity: EdgePolarity) => number[],
): number {
  return signal
    ? Math.max(
        1,
        edgeTimes
          ? edgeTimes(signal, signal.kind === "clock" ? "both" : "transition").length
          : signalEdges(signal, durationPs).length,
      )
    : 1;
}

function defaultPolarity(signal?: Signal): EdgePolarity {
  return signal?.kind === "clock" ? "rising" : "transition";
}

function polarityOptions(signal?: Signal) {
  return signal?.kind === "clock"
    ? [
        { value: "rising", label: "Rising" },
        { value: "falling", label: "Falling" },
        { value: "both", label: "Both" },
      ]
    : [
        { value: "transition", label: "Any" },
        { value: "rising", label: "Rising 0→1" },
        { value: "falling", label: "Falling 1→0" },
      ];
}

function edgeOptions(
  signal: Signal | undefined,
  durationPs: number,
  polarity: EdgePolarity,
  edgeTimes?: (signal: Signal, polarity: EdgePolarity) => number[],
) {
  if (!signal) return [];
  return (edgeTimes
    ? edgeTimes(signal, polarity)
    : signalEdgesByPolarity(signal, durationPs, polarity)
  ).map(
    (timePs, index) => ({
      value: String(index + 1),
      label: `#${index + 1} · ${Math.round(timePs)} ps`,
    }),
  );
}

export function SignalTimingEditor({
  constraint,
  delayLink,
  durationPs,
  selected,
  signals,
  edgeTimes,
  onAddConstraint,
  onAddDelay,
  onChangeConstraint,
  onChangeDelay,
  onRemoveConstraint,
  onRemoveDelay,
}: SignalTimingEditorProps) {
  const sourceSignals = signals.filter((signal) => signal.id !== selected.id);
  const sourceOptions = sourceSignals.map((signal) => ({
    value: signal.id,
    label: signal.name,
  }));
  const defaultSourceId = sourceSignals[0]?.id;
  const delaySource = signals.find(
    (signal) => signal.id === delayLink?.sourceSignalId,
  );
  const constraintSource = signals.find(
    (signal) => signal.id === constraint?.sourceSignalId,
  );

  const renderDelay = () => {
    if (!delayLink) {
      return (
        <div className="signal-timing-empty">
          <p>Shift this entire waveform from an edge on another signal.</p>
          <Button
            fullWidth
            variant="light"
            size="sm"
            leftSection={<Link2 size={14} />}
            disabled={!defaultSourceId}
            onClick={() => defaultSourceId && onAddDelay(defaultSourceId)}
          >
            Add source delay
          </Button>
        </div>
      );
    }

    const minimum = Math.max(0, Math.min(delayLink.minPs, delayLink.maxPs));
    const maximum = Math.max(minimum + 1, Math.max(delayLink.minPs, delayLink.maxPs));
    const current = Math.min(maximum, Math.max(minimum, delayLink.currentPs));
    const sourceEdgeCount = edgeCount(delaySource, durationPs, edgeTimes);
    const targetEdgeCount = edgeCount(selected, durationPs, edgeTimes);

    return (
      <div className="signal-timing-form">
        <div className="signal-delay-meta">
          <TextInput
            label="Diagram label"
            value={delayLink.label ?? "t"}
            maxLength={24}
            onChange={(event) => onChangeDelay({ label: event.currentTarget.value })}
          />
          <div className="signal-delay-current">
            <span>Current</span>
            <strong>{Math.round(current)} ps</strong>
          </div>
        </div>
        <Select
          label="Source signal"
          data={sourceOptions}
          value={delayLink.sourceSignalId}
          allowDeselect={false}
          onChange={(sourceSignalId) =>
            sourceSignalId && onChangeDelay({ sourceSignalId, sourceEdge: 1 })
          }
        />
        <div className="timing-field-pair">
          <NumberInput
            label="Source edge"
            min={1}
            max={sourceEdgeCount}
            step={1}
            allowDecimal={false}
            value={delayLink.sourceEdge}
            onChange={(value) =>
              onChangeDelay({
                sourceEdge: Math.max(
                  1,
                  Math.min(sourceEdgeCount, numericValue(value, 1)),
                ),
              })
            }
          />
          <NumberInput
            label="Target edge"
            min={1}
            max={targetEdgeCount}
            step={1}
            allowDecimal={false}
            value={delayLink.targetEdge}
            onChange={(value) =>
              onChangeDelay({
                targetEdge: Math.max(
                  1,
                  Math.min(targetEdgeCount, numericValue(value, 1)),
                ),
              })
            }
          />
        </div>
        <div className="timing-field-pair timing-delay-bounds">
          <NumberInput
            label="Minimum"
            suffix=" ps"
            min={0}
            value={delayLink.minPs}
            onChange={(value) => {
              const minPs = Math.max(0, numericValue(value, 0));
              onChangeDelay({
                minPs,
                currentPs: Math.max(minPs, delayLink.currentPs),
                maxPs: Math.max(minPs, delayLink.maxPs),
              });
            }}
          />
          <NumberInput
            label="Maximum"
            suffix=" ps"
            min={0}
            value={delayLink.maxPs}
            onChange={(value) => {
              const maxPs = Math.max(0, numericValue(value, delayLink.maxPs));
              onChangeDelay({
                maxPs,
                minPs: Math.min(delayLink.minPs, maxPs),
                currentPs: Math.min(maxPs, delayLink.currentPs),
              });
            }}
          />
        </div>
        <Slider
          aria-label="Current source delay"
          min={minimum}
          max={maximum}
          step={Math.max(1, Math.round((maximum - minimum) / 100))}
          value={current}
          label={(value) => `${Math.round(value)} ps`}
          onChange={(currentPs) => onChangeDelay({ currentPs })}
        />
        <Button
          fullWidth
          variant="subtle"
          color="red"
          size="compact-sm"
          leftSection={<Trash2 size={13} />}
          onClick={onRemoveDelay}
        >
          Remove delay
        </Button>
      </div>
    );
  };

  const renderConstraint = () => {
    if (!constraint) {
      return (
        <div className="signal-timing-empty">
          <p>Show a setup / hold window from another signal's edge.</p>
          <Button
            fullWidth
            variant="light"
            size="sm"
            leftSection={<ShieldAlert size={14} />}
            disabled={!defaultSourceId}
            onClick={() => defaultSourceId && onAddConstraint(defaultSourceId)}
          >
            Add timing constraint
          </Button>
        </div>
      );
    }

    const sourceEdgeKind =
      constraint.sourceEdgeKind ?? defaultPolarity(constraintSource);
    const targetEdgeKind =
      constraint.targetEdgeKind ?? defaultPolarity(selected);
    const sourceValues = (constraint.sourceEdges ?? [constraint.sourceEdge]).map(
      String,
    );
    const targetValues = (constraint.targetEdges ?? [constraint.targetEdge]).map(
      String,
    );
    return (
      <div className="signal-timing-form constraint-form">
        <div className="constraint-edge-group">
          <div className="constraint-edge-heading">Reference</div>
          <div className="constraint-source-row">
            <Select
              aria-label="Reference signal"
              data={sourceOptions}
              value={constraint.sourceSignalId}
              allowDeselect={false}
              onChange={(sourceSignalId) => {
                if (!sourceSignalId) return;
                const nextSource = signals.find(
                  (signal) => signal.id === sourceSignalId,
                );
                onChangeConstraint({
                  sourceSignalId,
                  sourceEdge: 1,
                  sourceEdges: [],
                  sourceEdgeKind: defaultPolarity(nextSource),
                });
              }}
            />
            <Select
              aria-label="Reference edge type"
              data={polarityOptions(constraintSource)}
              value={sourceEdgeKind}
              allowDeselect={false}
              onChange={(value) =>
                value &&
                onChangeConstraint({
                  sourceEdgeKind: value as EdgePolarity,
                  sourceEdges: [],
                })
              }
            />
          </div>
          <MultiSelect
            aria-label="Reference edge numbers"
            data={edgeOptions(
              constraintSource,
              durationPs,
              sourceEdgeKind,
              edgeTimes,
            )}
            value={sourceValues}
            placeholder="All visible edges"
            clearable
            searchable
            hidePickedOptions
            maxDropdownHeight={180}
            onChange={(values) =>
              onChangeConstraint({ sourceEdges: values.map(Number) })
            }
          />
        </div>
        <div className="constraint-edge-group">
          <div className="constraint-edge-heading">Constrained · {selected.name}</div>
          <div className="constraint-target-row">
            <Select
              aria-label="Constrained edge type"
              data={polarityOptions(selected)}
              value={targetEdgeKind}
              allowDeselect={false}
              onChange={(value) =>
                value &&
                onChangeConstraint({
                  targetEdgeKind: value as EdgePolarity,
                  targetEdges: [],
                })
              }
            />
            <MultiSelect
              aria-label="Constrained edge numbers"
              data={edgeOptions(selected, durationPs, targetEdgeKind, edgeTimes)}
              value={targetValues}
              placeholder="All visible edges"
              clearable
              searchable
              hidePickedOptions
              maxDropdownHeight={180}
              onChange={(values) =>
                onChangeConstraint({ targetEdges: values.map(Number) })
              }
            />
          </div>
        </div>
        <div className="timing-field-pair">
          <NumberInput
            label="Setup"
            suffix=" ps"
            min={0}
            value={constraint.setupPs}
            onChange={(value) =>
              onChangeConstraint({
                setupPs: Math.max(0, numericValue(value, 0)),
              })
            }
          />
          <NumberInput
            label="Hold"
            suffix=" ps"
            min={0}
            value={constraint.holdPs}
            onChange={(value) =>
              onChangeConstraint({
                holdPs: Math.max(0, numericValue(value, 0)),
              })
            }
          />
        </div>
        <Button
          fullWidth
          variant="subtle"
          color="red"
          size="compact-sm"
          leftSection={<Trash2 size={13} />}
          onClick={onRemoveConstraint}
        >
          Remove constraint
        </Button>
      </div>
    );
  };

  return (
    <div className="signal-timing-editor">
      <div className="signal-timing-block">
        <div className="signal-timing-title">Source delay</div>
        {renderDelay()}
      </div>
      <div className="signal-timing-block">
        <div className="signal-timing-title">Setup / hold constraint</div>
        {renderConstraint()}
      </div>
    </div>
  );
}
