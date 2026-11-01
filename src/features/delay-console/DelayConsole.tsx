import {
  ActionIcon,
  Badge,
  SegmentedControl,
  Select,
  Slider,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { LiveNumberInput as NumberInput } from "../../components/LiveNumberInput";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import {
  isSequentialDataSignal,
  type DelayRange,
  type EdgeDelayLink,
  type EdgePolarity,
  type Signal,
} from "../../domain/timing";

type DelayFilter = "all" | "source" | "derived";
type DerivedDelayKind = "c2q" | "d2q";

type DelayConsoleItem =
  | { kind: "source"; key: string; link: EdgeDelayLink; signal: Signal }
  | {
      kind: "derived";
      key: string;
      c2q: DelayRange;
      d2q?: DelayRange;
      signal: Signal;
    };

interface DelayConsoleProps {
  collapsed: boolean;
  delayLinks: EdgeDelayLink[];
  edgeTimes: (signal: Signal, polarity: EdgePolarity) => number[];
  onAddDelay: (targetSignalId: string, sourceSignalId: string) => void;
  onClose: () => void;
  onRemoveDelay: (targetSignalId: string) => void;
  onSelectSignal: (signalId: string) => void;
  onToggleCollapsed: () => void;
  onUpdateDerivedDelay: (
    signalId: string,
    delayKind: DerivedDelayKind,
    range: DelayRange,
  ) => void;
  onUpdateDelay: (
    targetSignalId: string,
    patch: Partial<EdgeDelayLink>,
  ) => void;
  selectedSignalId: string;
  signals: Signal[];
}

function controlStep(maximum: number): number {
  return Math.max(1, Math.round(maximum / 200));
}

function numeric(value: string | number, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function edgeOptions(
  signal: Signal | undefined,
  edgeTimes: DelayConsoleProps["edgeTimes"],
) {
  if (!signal) return [];
  const polarity = signal.kind === "clock" ? "both" : "transition";
  return edgeTimes(signal, polarity).map((timePs, index) => ({
    value: String(index + 1),
    label: `#${index + 1} · ${Math.round(timePs)} ps`,
  }));
}

interface DelayRangeControlProps {
  label: string;
  value: DelayRange;
  onChange: (range: DelayRange) => void;
}

function DelayRangeControl({
  label,
  value,
  onChange,
}: DelayRangeControlProps) {
  const minimum = Math.max(0, Math.min(value.minPs, value.maxPs));
  const maximum = Math.max(minimum, Math.max(value.minPs, value.maxPs));
  const current = Math.min(maximum, Math.max(minimum, value.currentPs));

  return (
    <div className="delay-control-current">
      <label className="delay-control-bound">
        <span>MIN</span>
        <NumberInput
          size="xs"
          aria-label={`Minimum ${label}`}
          suffix=" ps"
          min={0}
          value={minimum}
          hideControls
          onChange={(next) => {
            const minPs = Math.max(0, numeric(next, minimum));
            onChange({
              minPs,
              currentPs: Math.max(minPs, current),
              maxPs: Math.max(minPs, maximum),
            });
          }}
        />
      </label>
      <div className="delay-control-slider">
        <div className="delay-control-readout">
          <span>Current</span>
          <strong>{Math.round(current)} ps</strong>
        </div>
        <Slider
          aria-label={`Current ${label}`}
          min={minimum}
          max={Math.max(minimum + 1, maximum)}
          step={Math.max(1, controlStep(Math.max(1, maximum - minimum)))}
          value={current}
          disabled={maximum <= minimum}
          label={(next) => `${Math.round(next)} ps`}
          onChange={(currentPs) =>
            onChange({ minPs: minimum, currentPs, maxPs: maximum })
          }
        />
      </div>
      <label className="delay-control-bound">
        <span>MAX</span>
        <NumberInput
          size="xs"
          aria-label={`Maximum ${label}`}
          suffix=" ps"
          min={minimum}
          value={maximum}
          hideControls
          onChange={(next) => {
            const maxPs = Math.max(minimum, numeric(next, maximum));
            onChange({
              minPs: minimum,
              currentPs: Math.min(maxPs, current),
              maxPs,
            });
          }}
        />
      </label>
    </div>
  );
}

export function DelayConsole({
  collapsed,
  delayLinks,
  edgeTimes,
  onAddDelay,
  onClose,
  onRemoveDelay,
  onSelectSignal,
  onToggleCollapsed,
  onUpdateDerivedDelay,
  onUpdateDelay,
  selectedSignalId,
  signals,
}: DelayConsoleProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DelayFilter>("all");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const configuredTargets = new Set(
    delayLinks.map((link) => link.targetSignalId),
  );
  const addableSignals = signals.filter(
    (signal) =>
      !configuredTargets.has(signal.id) &&
      signals.some((source) => source.id !== signal.id),
  );
  const items = useMemo<DelayConsoleItem[]>(() => {
    const linkByTarget = new Map(
      delayLinks.map((link, index) => [
        link.targetSignalId,
        { link, index },
      ]),
    );
    return signals.flatMap((signal) => {
      const signalItems: DelayConsoleItem[] = [];
      const linked = linkByTarget.get(signal.id);
      if (linked) {
        signalItems.push({
          kind: "source",
          key: linked.link.id ?? `source-${linked.index}`,
          link: linked.link,
          signal,
        });
      }
      if (isSequentialDataSignal(signal)) {
        signalItems.push({
          kind: "derived",
          key: `${signal.id}-derived`,
          c2q: signal.derivation.c2q,
          d2q:
            signal.derivation.device === "latch"
              ? signal.derivation.d2q
              : undefined,
          signal,
        });
      }
      return signalItems;
    });
  }, [delayLinks, signals]);
  const sourceCount = items.filter((item) => item.kind === "source").length;
  const derivedCount = items.length - sourceCount;
  const delayCount = items.reduce(
    (count, item) =>
      count + (item.kind === "derived" ? 1 + (item.d2q ? 1 : 0) : 1),
    0,
  );
  const visibleItems = items.filter((item) => {
    if (filter !== "all" && item.kind !== filter) return false;
    if (!normalizedSearch) return true;
    if (item.kind === "source") {
      const source = signals.find(
        (signal) => signal.id === item.link.sourceSignalId,
      );
      return [item.signal.name, source?.name, item.link.label, "source shift"]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalizedSearch));
    }
    const derivation = isSequentialDataSignal(item.signal)
      ? item.signal.derivation
      : undefined;
    const clock = signals.find(
      (signal) => signal.id === derivation?.clockSignalId,
    );
    const data = signals.find(
      (signal) => signal.id === derivation?.dataSignalId,
    );
    return [
      item.signal.name,
      clock?.name,
      data?.name,
      derivation?.device,
      "c2q",
      "c→q",
      item.d2q ? "d2q" : undefined,
      item.d2q ? "d→q" : undefined,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
  });

  return (
    <section
      id="delay-console"
      className={`delay-console ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Delay console"
    >
      <header className="delay-console-header">
        <div className="delay-console-title">
          <span>DELAY CONSOLE</span>
          <Badge size="xs" variant="light" color="violet">
            {delayCount} delays
          </Badge>
          <small>Global signal delay controls</small>
        </div>
        <div className="delay-console-actions">
          {!collapsed && (
            <SegmentedControl
              className="delay-console-filter"
              size="xs"
              aria-label="Delay type filter"
              value={filter}
              data={[
                { value: "all", label: `All ${items.length}` },
                { value: "source", label: `Source ${sourceCount}` },
                { value: "derived", label: `Derived ${derivedCount}` },
              ]}
              onChange={(value) => setFilter(value as DelayFilter)}
            />
          )}
          {!collapsed && delayCount > 3 && (
            <TextInput
              size="xs"
              aria-label="Search delays"
              placeholder="Search delays"
              leftSection={<Search size={13} />}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          )}
          {!collapsed && (
            <Select
              className="delay-console-add"
              size="xs"
              aria-label="Add target delay"
              placeholder="Add target delay"
              leftSection={<Plus size={13} />}
              data={addableSignals.map((signal) => ({
                value: signal.id,
                label: signal.name,
              }))}
              value={null}
              disabled={addableSignals.length === 0}
              searchable
              onChange={(targetSignalId) => {
                if (!targetSignalId) return;
                const source = signals.find(
                  (signal) => signal.id !== targetSignalId,
                );
                if (source) onAddDelay(targetSignalId, source.id);
              }}
            />
          )}
          <Tooltip label={collapsed ? "Expand delay console" : "Collapse delay console"}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={collapsed ? "Expand delay console" : "Collapse delay console"}
              onClick={onToggleCollapsed}
            >
              {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Close delay console">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Close delay console"
              onClick={onClose}
            >
              <X size={15} />
            </ActionIcon>
          </Tooltip>
        </div>
      </header>

      {!collapsed && (
        <div key={filter} className="delay-console-scroll">
          {items.length === 0 ? (
            <div className="delay-console-empty">
              <span>No delays configured.</span>
              <small>Add a Source Delay or create Derived Data to begin.</small>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="delay-console-empty">
              <span>No {filter === "all" ? "delays" : `${filter} delays`} match.</span>
              <small>Change the filter or search text to see other controls.</small>
            </div>
          ) : (
            visibleItems.map((item) => {
              const target = item.signal;

              if (item.kind === "derived") {
                if (!isSequentialDataSignal(target)) return null;
                const derivation = target.derivation;
                const clock = signals.find(
                  (signal) => signal.id === derivation.clockSignalId,
                );
                const data = signals.find(
                  (signal) => signal.id === derivation.dataSignalId,
                );
                const clockCause =
                  derivation.device === "dff"
                    ? `${clock?.name ?? "Clock"} ${derivation.trigger} edge`
                    : `${clock?.name ?? "Clock"} ${derivation.trigger} level`;
                const route = item.d2q
                  ? `${clockCause} + ${data?.name ?? "Data"}`
                  : clockCause;

                return (
                  <article
                    key={item.key}
                    className={`delay-control-strip is-derived ${
                      selectedSignalId === target.id ? "is-selected" : ""
                    }`}
                    style={{ "--delay-signal-color": target.color } as CSSProperties}
                  >
                    <div className="delay-control-meta delay-control-derived-meta">
                      <UnstyledButton
                        className="delay-control-target"
                        aria-label={`Select ${target.name}`}
                        onClick={() => onSelectSignal(target.id)}
                      >
                        <span className="delay-control-dot" />
                        <strong>{target.name}</strong>
                      </UnstyledButton>
                      <ArrowRight size={13} aria-hidden="true" />
                      <Badge size="sm" variant="light" color="cyan">
                        {derivation.device.toUpperCase()}
                      </Badge>
                      <div className="delay-control-route">
                        <span>{route}</span>
                        <ArrowRight size={12} aria-hidden="true" />
                        <strong>Q propagation</strong>
                      </div>
                      <Badge size="xs" variant="outline" color="gray">
                        {item.d2q ? "2 PATHS" : "1 PATH"}
                      </Badge>
                      <span className="delay-control-kind">DERIVED</span>
                    </div>
                    <div
                      className={`delay-derived-controls ${
                        item.d2q ? "has-two" : ""
                      }`}
                    >
                      <div className="delay-derived-channel">
                        <Badge size="sm" variant="light" color="cyan">
                          C→Q
                        </Badge>
                        <DelayRangeControl
                          label={`C to Q delay for ${target.name}`}
                          value={item.c2q}
                          onChange={(range) =>
                            onUpdateDerivedDelay(target.id, "c2q", range)
                          }
                        />
                      </div>
                      {item.d2q && (
                        <div className="delay-derived-channel">
                          <Badge size="sm" variant="light" color="teal">
                            D→Q
                          </Badge>
                          <DelayRangeControl
                            label={`D to Q delay for ${target.name}`}
                            value={item.d2q}
                            onChange={(range) =>
                              onUpdateDerivedDelay(target.id, "d2q", range)
                            }
                          />
                        </div>
                      )}
                    </div>
                  </article>
                );
              }

              const { link } = item;
              const source = signals.find(
                (signal) => signal.id === link.sourceSignalId,
              );
              const sources = signals.filter((signal) => signal.id !== target.id);
              const sourceEdges = edgeOptions(source, edgeTimes);
              const targetEdges = edgeOptions(target, edgeTimes);

              return (
                <article
                  key={item.key}
                  className={`delay-control-strip ${
                    selectedSignalId === target.id ? "is-selected" : ""
                  }`}
                  style={{ "--delay-signal-color": target.color } as CSSProperties}
                >
                  <div className="delay-control-meta">
                    <UnstyledButton
                      className="delay-control-target"
                      aria-label={`Select ${target.name}`}
                      onClick={() => onSelectSignal(target.id)}
                    >
                      <span className="delay-control-dot" />
                      <strong>{target.name}</strong>
                    </UnstyledButton>
                    <ArrowRight size={13} aria-hidden="true" />
                    <Select
                      size="xs"
                      aria-label={`Source signal for ${target.name}`}
                      data={sources.map((signal) => ({
                        value: signal.id,
                        label: signal.name,
                      }))}
                      value={link.sourceSignalId}
                      allowDeselect={false}
                      onChange={(sourceSignalId) =>
                        sourceSignalId &&
                        onUpdateDelay(target.id, {
                          sourceSignalId,
                          sourceEdge: 1,
                        })
                      }
                    />
                    <div className="delay-control-edges">
                      <Select
                        size="xs"
                        aria-label={`Source edge for ${target.name}`}
                        data={sourceEdges}
                        value={String(link.sourceEdge)}
                        allowDeselect={false}
                        onChange={(value) =>
                          value &&
                          onUpdateDelay(target.id, { sourceEdge: Number(value) })
                        }
                      />
                      <ArrowRight size={12} aria-hidden="true" />
                      <Select
                        size="xs"
                        aria-label={`Target edge for ${target.name}`}
                        data={targetEdges}
                        value={String(link.targetEdge)}
                        allowDeselect={false}
                        onChange={(value) =>
                          value &&
                          onUpdateDelay(target.id, { targetEdge: Number(value) })
                        }
                      />
                    </div>
                    <TextInput
                      className="delay-control-label"
                      size="xs"
                      aria-label={`Diagram label for ${target.name}`}
                      value={link.label ?? "t"}
                      maxLength={24}
                      onChange={(event) =>
                        onUpdateDelay(target.id, {
                          label: event.currentTarget.value,
                        })
                      }
                    />
                    <Tooltip label={`Remove ${target.name} delay`}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        aria-label={`Remove ${target.name} delay`}
                        onClick={() => onRemoveDelay(target.id)}
                      >
                        <Trash2 size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </div>
                  <DelayRangeControl
                    label={`source delay for ${target.name}`}
                    value={link}
                    onChange={(range) => onUpdateDelay(target.id, range)}
                  />
                </article>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
