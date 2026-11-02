import { ActionIcon, Badge, Button, Checkbox, Slider, TextInput } from "@mantine/core";
import { LiveNumberInput as NumberInput } from "../../components/LiveNumberInput";
import { PanelRightClose } from "lucide-react";
import { ConvertibleTimeInput } from "../../components/ConvertibleTimeInput";
import { DataPatternEditor } from "../../components/DataPatternEditor";
import { RateInput } from "../../components/RateInput";
import { SequentialSignalEditor } from "../../components/SequentialSignalEditor";
import { SignalTimingEditor } from "../../components/SignalTimingEditor";
import {
  isSequentialDataSignal,
  type ClockSignal,
  type Bus,
  type DataPatternSegment,
  type EdgeDelayLink,
  type EdgePolarity,
  type Signal,
  type TimingConstraint,
  type TimingProject,
} from "../../domain/timing";

interface PropertyPanelProps {
  creation?: boolean;
  onCollapse?: () => void;
  constraint?: TimingConstraint;
  delayLink?: EdgeDelayLink;
  edgeTimes: (signal: Signal, polarity: EdgePolarity) => number[];
  onAddConstraint: (sourceSignalId: string) => void;
  onAddDelay: (sourceSignalId: string) => void;
  onChangeConstraint: (patch: Partial<TimingConstraint>) => void;
  onChangeDelay: (patch: Partial<EdgeDelayLink>) => void;
  onRemoveConstraint: () => void;
  onRemoveDelay: () => void;
  onUpdateSelected: (patch: Partial<Signal>) => void;
  project: TimingProject;
  referenceClock?: ClockSignal;
  referencePeriodPs: number;
  selected?: Signal;
  parentBus?: Bus;
  onRestoreBusParameter?: (parameter: "pattern" | "startPs" | "periodPs") => void;
  patternResetVersion?: number;
  sequentialError?: string;
}

export function PropertyPanel({
  creation = false,
  onCollapse,
  constraint,
  delayLink,
  edgeTimes,
  onAddConstraint,
  onAddDelay,
  onChangeConstraint,
  onChangeDelay,
  onRemoveConstraint,
  onRemoveDelay,
  onUpdateSelected,
  project,
  referenceClock,
  referencePeriodPs,
  selected,
  parentBus,
  onRestoreBusParameter,
  patternResetVersion,
  sequentialError,
}: PropertyPanelProps) {
  return (
    <aside className="property-panel">
      {!creation && <div className="panel-heading property-heading">
        <div>
          <span className="eyebrow">INSPECTOR</span>
          <h2>Properties</h2>
        </div>
        {selected && (
          <Badge
            variant="light"
            color={selected.kind === "clock" ? "violet" : "teal"}
          >
            {isSequentialDataSignal(selected)
              ? selected.derivation.device
              : selected.kind}
          </Badge>
        )}
        {onCollapse && <ActionIcon variant="subtle" aria-label="Collapse properties" onClick={onCollapse}><PanelRightClose size={16} /></ActionIcon>}
      </div>}

      {selected && (
        <div className="property-content">
          <section className="property-section">
            <div className="section-title">
              <span>Signal</span>
              <span className="section-index">01</span>
            </div>
            <TextInput
              label="Name"
              data-autofocus={creation || undefined}
              value={selected.name}
              onChange={(event) =>
                onUpdateSelected({ name: event.target.value })
              }
            />
            {!isSequentialDataSignal(selected) && (
              <>
              <ConvertibleTimeInput
                label="Start"
                description={`Relative to ${referenceClock?.name ?? "reference clock"}`}
                valuePs={selected.startPs}
                referencePeriodPs={referencePeriodPs}
                onChange={(startPs) => onUpdateSelected({ startPs })}
              />
              {parentBus && selected.kind === "data" && <div className="bus-inheritance">Start: {selected.busOverrides?.startPs ? "Local override" : "Bus default"}{selected.busOverrides?.startPs && <Button size="compact-xs" variant="subtle" onClick={() => onRestoreBusParameter?.("startPs")}>Restore bus default</Button>}</div>}
              </>
            )}
          </section>

          {!isSequentialDataSignal(selected) && (
            <section className="property-section">
              <div className="section-title">
                <span>Timing</span>
                <span className="section-index">02</span>
              </div>
              <RateInput
                periodPs={selected.periodPs}
                onChange={(periodPs) => onUpdateSelected({ periodPs })}
              />
              {parentBus && selected.kind === "data" && <div className="bus-inheritance">Interval: {selected.busOverrides?.periodPs ? "Local override" : "Bus default"}{selected.busOverrides?.periodPs && <Button size="compact-xs" variant="subtle" onClick={() => onRestoreBusParameter?.("periodPs")}>Restore bus default</Button>}</div>}

              {parentBus && selected.kind === "data" && <div className="compound-field">
                <Checkbox label="Fixed channel offset (replaces inherited range)" checked={selected.busOffsetPs !== undefined} onChange={event => onUpdateSelected({ busOffsetPs: event.currentTarget.checked ? 0 : undefined })} />
                {selected.busOffsetPs === undefined
                  ? <small>Inherits possible edge range: −{parentBus.earlyPs ?? 0} to +{parentBus.latePs ?? 0} ps. This does not move the actual edge.</small>
                  : <NumberInput label="Channel offset" description="Negative moves earlier; positive moves later."
                      suffix=" ps" value={selected.busOffsetPs}
                      onChange={busOffsetPs => onUpdateSelected({ busOffsetPs })} />}
              </div>}
              {selected.kind === "clock" && (
                <>
                  <ConvertibleTimeInput
                    label="Clock phase"
                    description="Same value, editable as time or angle"
                    valuePs={selected.phasePs}
                    referencePeriodPs={selected.periodPs}
                    onChange={(phasePs) => onUpdateSelected({ phasePs })}
                  />
                  <div className="slider-field">
                    <div className="slider-label">
                      <span>Duty cycle</span>
                      <strong>{Math.round(selected.dutyCycle * 100)}%</strong>
                    </div>
                    <Slider
                      min={10}
                      max={90}
                      step={5}
                      value={selected.dutyCycle * 100}
                      label={(value) => `${value}%`}
                      onChange={(value) =>
                        onUpdateSelected({ dutyCycle: value / 100 })
                      }
                    />
                  </div>
                </>
              )}
            </section>
          )}

          {selected.kind === "data" && !isSequentialDataSignal(selected) && (
            <section className="property-section pattern-section">
              <div className="section-title">
                <span>Pattern builder</span>
                <span className="section-index">03</span>
              </div>
              <DataPatternEditor
                key={`${selected.id}-${patternResetVersion ?? 0}`}
                pattern={selected.pattern}
                segments={selected.patternSegments}
                onChange={(
                  pattern: string[],
                  patternSegments: DataPatternSegment[],
                ) => onUpdateSelected({ pattern, patternSegments })}
              />
              {parentBus && <div className="bus-inheritance">Pattern: {selected.busOverrides?.pattern ? "Local override" : "Bus rule"}{selected.busOverrides?.pattern && <Button size="compact-xs" variant="subtle" onClick={() => onRestoreBusParameter?.("pattern")}>Restore bus default</Button>}</div>}
            </section>
          )}

          {isSequentialDataSignal(selected) && (
            <section className="property-section sequential-section">
              <div className="section-title">
                <span>Sequential logic</span>
                <span className="section-index">02</span>
              </div>
              <SequentialSignalEditor
                selected={selected}
                signals={project.signals}
                error={sequentialError}
                onChange={(derivation) =>
                  onUpdateSelected({ derivation } as Partial<Signal>)
                }
              />
            </section>
          )}

          {!creation && <section className="property-section linked-timing-section">
            <div className="section-title">
              <span>Signal timing</span>
              <span className="section-index">04</span>
            </div>
            <SignalTimingEditor
              durationPs={project.durationPs}
              signals={project.signals}
              selected={selected}
              edgeTimes={edgeTimes}
              delayLink={delayLink}
              constraint={constraint}
              onAddDelay={onAddDelay}
              onChangeDelay={onChangeDelay}
              onRemoveDelay={onRemoveDelay}
              onAddConstraint={onAddConstraint}
              onChangeConstraint={onChangeConstraint}
              onRemoveConstraint={onRemoveConstraint}
            />
          </section>}
        </div>
      )}
    </aside>
  );
}
