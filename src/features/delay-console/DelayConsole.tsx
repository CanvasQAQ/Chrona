import {
  ActionIcon,
  Badge,
  NumberInput,
  Select,
  Slider,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
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
import type { EdgeDelayLink, EdgePolarity, Signal } from "../../domain/timing";

interface DelayConsoleProps {
  collapsed: boolean;
  delayLinks: EdgeDelayLink[];
  edgeTimes: (signal: Signal, polarity: EdgePolarity) => number[];
  onAddDelay: (targetSignalId: string, sourceSignalId: string) => void;
  onClose: () => void;
  onRemoveDelay: (targetSignalId: string) => void;
  onSelectSignal: (signalId: string) => void;
  onToggleCollapsed: () => void;
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

export function DelayConsole({
  collapsed,
  delayLinks,
  edgeTimes,
  onAddDelay,
  onClose,
  onRemoveDelay,
  onSelectSignal,
  onToggleCollapsed,
  onUpdateDelay,
  selectedSignalId,
  signals,
}: DelayConsoleProps) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const configuredTargets = new Set(
    delayLinks.map((link) => link.targetSignalId),
  );
  const addableSignals = signals.filter(
    (signal) =>
      !configuredTargets.has(signal.id) &&
      signals.some((source) => source.id !== signal.id),
  );
  const orderedLinks = useMemo(() => {
    const order = new Map(signals.map((signal, index) => [signal.id, index]));
    return [...delayLinks].sort(
      (left, right) =>
        (order.get(left.targetSignalId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.targetSignalId) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [delayLinks, signals]);
  const visibleLinks = orderedLinks.filter((link) => {
    if (!normalizedSearch) return true;
    const target = signals.find((signal) => signal.id === link.targetSignalId);
    const source = signals.find((signal) => signal.id === link.sourceSignalId);
    return [target?.name, source?.name, link.label]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(normalizedSearch));
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
            {delayLinks.length} configured
          </Badge>
          <small>Global signal delay controls</small>
        </div>
        <div className="delay-console-actions">
          {!collapsed && delayLinks.length > 3 && (
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
        <div className="delay-console-scroll">
          {delayLinks.length === 0 ? (
            <div className="delay-console-empty">
              <span>No source delays configured.</span>
              <small>Choose a target above to create its control strip.</small>
            </div>
          ) : visibleLinks.length === 0 ? (
            <div className="delay-console-empty">
              <span>No delays match “{search}”.</span>
            </div>
          ) : (
            visibleLinks.map((link) => {
              const target = signals.find(
                (signal) => signal.id === link.targetSignalId,
              );
              const source = signals.find(
                (signal) => signal.id === link.sourceSignalId,
              );
              if (!target) return null;
              const sources = signals.filter((signal) => signal.id !== target.id);
              const minimum = Math.max(0, Math.min(link.minPs, link.maxPs));
              const maximum = Math.max(minimum, Math.max(link.minPs, link.maxPs));
              const current = Math.min(
                maximum,
                Math.max(minimum, link.currentPs),
              );
              const sourceEdges = edgeOptions(source, edgeTimes);
              const targetEdges = edgeOptions(target, edgeTimes);

              return (
                <article
                  key={link.id ?? target.id}
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

                  <div className="delay-control-current">
                    <label className="delay-control-bound">
                      <span>MIN</span>
                      <NumberInput
                        size="xs"
                        aria-label={`Minimum delay for ${target.name}`}
                        suffix=" ps"
                        min={0}
                        value={minimum}
                        hideControls
                        onChange={(value) => {
                          const minPs = Math.max(0, numeric(value, minimum));
                          onUpdateDelay(target.id, {
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
                        aria-label={`Current delay for ${target.name}`}
                        min={minimum}
                        max={Math.max(minimum + 1, maximum)}
                        step={Math.max(1, controlStep(Math.max(1, maximum - minimum)))}
                        value={current}
                        disabled={maximum <= minimum}
                        label={(value) => `${Math.round(value)} ps`}
                        onChange={(currentPs) =>
                          onUpdateDelay(target.id, { currentPs })
                        }
                      />
                    </div>
                    <label className="delay-control-bound">
                      <span>MAX</span>
                      <NumberInput
                        size="xs"
                        aria-label={`Maximum delay for ${target.name}`}
                        suffix=" ps"
                        min={minimum}
                        value={maximum}
                        hideControls
                        onChange={(value) => {
                          const maxPs = Math.max(
                            minimum,
                            numeric(value, maximum),
                          );
                          onUpdateDelay(target.id, {
                            minPs: minimum,
                            currentPs: Math.min(maxPs, current),
                            maxPs,
                          });
                        }}
                      />
                    </label>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
