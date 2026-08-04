export type SignalKind = "clock" | "data";
export type EdgePolarity = "rising" | "falling" | "both" | "transition";

export interface SignalBase {
  id: string;
  name: string;
  kind: SignalKind;
  groupId?: string;
  startPs: number;
  visible: boolean;
  color: string;
}

export interface SignalGroup {
  id: string;
  name: string;
}

export interface ClockSignal extends SignalBase {
  kind: "clock";
  periodPs: number;
  phasePs: number;
  dutyCycle: number;
}

export type DataPatternSegment =
  | {
      id: string;
      kind: "range";
      prefix: string;
      from: number;
      to: number;
      step: number;
      repeat: number;
      /** Legacy field kept for loading early pattern-builder drafts. */
      each?: number;
    }
  | {
      id: string;
      kind: "logic";
      values: string;
      repeat: number;
    }
  | {
      id: string;
      kind: "symbols";
      values: string;
      repeat: number;
    };

export interface DataSignal extends SignalBase {
  kind: "data";
  periodPs: number;
  pattern: string[];
  patternSegments?: DataPatternSegment[];
}

export type Signal = ClockSignal | DataSignal;

export interface EdgeDelayLink {
  id?: string;
  label?: string;
  sourceSignalId: string;
  targetSignalId: string;
  /** One-based index into every visible edge, ordered by time. */
  sourceEdge: number;
  /** One-based index into every visible edge, ordered by time. */
  targetEdge: number;
  minPs: number;
  currentPs: number;
  maxPs: number;
}

export interface CanvasSettings {
  showVerticalGrid: boolean;
  gridMode: "auto" | "custom";
  gridIntervalPs: number;
  trackHeight: number;
}

export interface TimingConstraint {
  id: string;
  sourceSignalId: string;
  targetSignalId: string;
  sourceEdge: number;
  targetEdge: number;
  /** Empty arrays mean every visible edge of the selected polarity. */
  sourceEdges?: number[];
  targetEdges?: number[];
  sourceEdgeKind?: EdgePolarity;
  targetEdgeKind?: EdgePolarity;
  setupPs: number;
  holdPs: number;
}

export interface LinkedTiming {
  id: string;
  clock: EdgeDelayLink;
  data: EdgeDelayLink;
  setupPs: number;
  holdPs: number;
}

export interface TimingConstraintDraft {
  setupPs: number;
  holdPs: number;
  status: "awaiting-definition";
}

export interface TimingProject {
  version: 2;
  name: string;
  durationPs: number;
  signals: Signal[];
  signalGroups?: SignalGroup[];
  constraintDraft: TimingConstraintDraft;
  delayLinks?: EdgeDelayLink[];
  timingConstraints?: TimingConstraint[];
  canvasSettings?: CanvasSettings;
  /** Legacy paired illustration, migrated when an older project is opened. */
  linkedTiming?: LinkedTiming;
}

export interface ResolvedEdgeDelay {
  sourceTimePs: number;
  targetBaseTimePs: number;
  targetTimePs: number;
  minTimePs: number;
  maxTimePs: number;
  targetShiftPs: number;
}

export interface ResolvedLinkedTiming {
  clock?: ResolvedEdgeDelay;
  data?: ResolvedEdgeDelay;
  signalShiftsPs: Record<string, number>;
}

export interface ResolvedDelayLinks {
  byId: Record<string, ResolvedEdgeDelay>;
  signalShiftsPs: Record<string, number>;
}

export interface ResolvedConstraintWindow {
  sourceTimePs: number;
  startTimePs: number;
  endTimePs: number;
  isViolated: boolean;
  violatingTargetTimesPs: number[];
}

export interface ResolvedTimingConstraint {
  targetTimesPs: number[];
  windows: ResolvedConstraintWindow[];
}

export interface WavePoint {
  timePs: number;
  value: 0 | 1;
}

export interface PeriodGridMark {
  isMajor: boolean;
  showLabel: boolean;
  timePs: number;
}

export type FrequencyUnit = "MHz" | "GHz";
export type PeriodUnit = "ps" | "ns";

const MIN_DURATION_PS = 1;

export const DATA_TOKEN_COLORS = [
  "#35d6b4",
  "#4db7ff",
  "#ffb45c",
  "#f277a8",
  "#b08cff",
  "#67c96f",
  "#f47d62",
  "#52c7d9",
] as const;

export function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return MIN_DURATION_PS;
  return Math.max(MIN_DURATION_PS, value);
}

export function degreesToPs(degrees: number, periodPs: number): number {
  return (degrees / 360) * clampDuration(periodPs);
}

export function psToDegrees(timePs: number, periodPs: number): number {
  return (timePs / clampDuration(periodPs)) * 360;
}

export function frequencyToPeriodPs(
  frequency: number,
  unit: FrequencyUnit,
): number {
  const value = Math.max(Number.EPSILON, frequency);
  const frequencyHz = unit === "GHz" ? value * 1e9 : value * 1e6;
  return 1e12 / frequencyHz;
}

export function periodPsToFrequency(
  periodPs: number,
  unit: FrequencyUnit,
): number {
  const frequencyHz = 1e12 / clampDuration(periodPs);
  return unit === "GHz" ? frequencyHz / 1e9 : frequencyHz / 1e6;
}

export function periodToDisplayValue(
  periodPs: number,
  unit: PeriodUnit,
): number {
  return unit === "ns" ? periodPs / 1000 : periodPs;
}

export function displayValueToPeriodPs(
  value: number,
  unit: PeriodUnit,
): number {
  return clampDuration(unit === "ns" ? value * 1000 : value);
}

export function buildPeriodGrid(
  durationPs: number,
  periodPs: number,
  timelineWidthPx: number,
  subdivisions = 4,
  minimumLabelSpacingPx = 72,
): PeriodGridMark[] {
  const safeDuration = clampDuration(durationPs);
  const safePeriod = clampDuration(periodPs);
  const safeSubdivisions = Math.max(1, Math.floor(subdivisions));
  const stepPs = safePeriod / safeSubdivisions;
  const pixelsPerPeriod = (safePeriod / safeDuration) * timelineWidthPx;
  const labelEvery = Math.max(
    1,
    Math.ceil(minimumLabelSpacingPx / Math.max(Number.EPSILON, pixelsPerPeriod)),
  );
  const markCount = Math.floor(safeDuration / stepPs);

  return Array.from({ length: markCount + 1 }, (_, index) => {
    const isMajor = index % safeSubdivisions === 0;
    const periodIndex = Math.floor(index / safeSubdivisions);
    return {
      timePs: index * stepPs,
      isMajor,
      showLabel: isMajor && periodIndex % labelEvery === 0,
    };
  });
}

export function normalizeDataPattern(
  input: string | string[],
): string[] {
  const source = Array.isArray(input)
    ? input
    : input.split(/[\s,;|]+/);
  const values = source
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean)
    .map((token) => token.replace(/[^A-Z0-9_+-]/g, ""))
    .filter(Boolean);

  return values.length > 0 ? values : ["D0"];
}

export function expandDataPatternSegments(
  segments: DataPatternSegment[],
): string[] {
  const values: string[] = [];

  for (const segment of segments) {
    if (segment.kind === "range") {
      const prefix = segment.prefix.trim().toUpperCase();
      const step = Math.max(1, Math.floor(segment.step));
      const repeat = Math.max(
        1,
        Math.floor(segment.repeat ?? segment.each ?? 1),
      );
      if (!/^[A-Z_][A-Z0-9_]*$/.test(prefix) || segment.to < segment.from) {
        continue;
      }
      for (let value = segment.from; value <= segment.to; value += step) {
        for (let hold = 0; hold < repeat; hold += 1) {
          values.push(`${prefix}${value}`);
        }
      }
      continue;
    }

    const repeat = Math.max(1, Math.floor(segment.repeat));
    const tokens =
      segment.kind === "logic"
        ? segment.values
            .toUpperCase()
            .split("")
            .filter((token) => ["0", "1", "X", "Z"].includes(token))
        : normalizeDataPattern(segment.values);
    for (let iteration = 0; iteration < repeat; iteration += 1) {
      values.push(...tokens);
    }
  }

  return values.length > 0 ? values : ["D0"];
}

export function patternForDataSignal(signal: DataSignal): string[] {
  return signal.patternSegments?.length
    ? expandDataPatternSegments(signal.patternSegments)
    : normalizeDataPattern(signal.pattern);
}

export function colorForDataToken(token: string): string {
  const normalized = token.trim().toUpperCase();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return DATA_TOKEN_COLORS[Math.abs(hash) % DATA_TOKEN_COLORS.length];
}

export function isBinaryPattern(pattern: string[]): boolean {
  return pattern.every((token) => token === "0" || token === "1");
}

export function clockEdges(
  signal: ClockSignal,
  durationPs: number,
): number[] {
  const period = clampDuration(signal.periodPs);
  const edges: number[] = [];
  let edge = signal.startPs + signal.phasePs;

  while (edge > 0) edge -= period;
  while (edge < 0) edge += period;

  for (; edge <= durationPs; edge += period) {
    edges.push(edge);
  }

  return edges;
}

export function dataEdges(
  signal: DataSignal,
  durationPs: number,
): number[] {
  const period = clampDuration(signal.periodPs);
  const pattern = patternForDataSignal(signal);
  const edges: number[] = [];
  let previous = pattern[0];

  for (
    let symbol = 1, time = signal.startPs + period;
    time <= durationPs;
    symbol += 1, time = signal.startPs + symbol * period
  ) {
    const current = pattern[symbol % pattern.length];
    if (current !== previous) edges.push(time);
    previous = current;
  }

  return edges;
}

export function signalEdgesByPolarity(
  signal: Signal,
  durationPs: number,
  polarity: EdgePolarity,
): number[] {
  if (signal.kind === "clock") {
    const rising = clockEdges(signal, durationPs);
    if (polarity === "rising") return rising;
    const period = clampDuration(signal.periodPs);
    const highDuration =
      period * Math.min(0.95, Math.max(0.05, signal.dutyCycle));
    const fallingSignal: ClockSignal = {
      ...signal,
      phasePs: signal.phasePs + highDuration,
    };
    const falling = clockEdges(fallingSignal, durationPs);
    if (polarity === "falling") return falling;
    return [...rising, ...falling].sort((left, right) => left - right);
  }

  if (polarity === "transition" || polarity === "both") {
    return dataEdges(signal, durationPs);
  }

  const period = clampDuration(signal.periodPs);
  const pattern = patternForDataSignal(signal).map((token) =>
    token.trim().toUpperCase(),
  );
  const edges: number[] = [];
  let previous = pattern[0];
  for (
    let symbol = 1, time = signal.startPs + period;
    time <= durationPs;
    symbol += 1, time = signal.startPs + symbol * period
  ) {
    const current = pattern[symbol % pattern.length];
    if (
      (polarity === "rising" && previous === "0" && current === "1") ||
      (polarity === "falling" && previous === "1" && current === "0")
    ) {
      edges.push(time);
    }
    previous = current;
  }
  return edges;
}

export function signalEdges(signal: Signal, durationPs: number): number[] {
  return signal.kind === "clock"
    ? signalEdgesByPolarity(signal, durationPs, "both")
    : dataEdges(signal, durationPs);
}

export function signalEdgeTime(
  signal: Signal,
  durationPs: number,
  oneBasedEdge: number,
): number | undefined {
  const index = Math.max(1, Math.floor(oneBasedEdge)) - 1;
  return signalEdges(signal, durationPs)[index];
}

export function resolveEdgeDelay(
  signals: Signal[],
  durationPs: number,
  link: EdgeDelayLink,
  signalShiftsPs: Record<string, number> = {},
): ResolvedEdgeDelay | undefined {
  const source = signals.find((signal) => signal.id === link.sourceSignalId);
  const target = signals.find((signal) => signal.id === link.targetSignalId);
  if (!source || !target) return undefined;

  const sourceBaseTimePs = signalEdgeTime(source, durationPs, link.sourceEdge);
  const targetBaseTimePs = signalEdgeTime(target, durationPs, link.targetEdge);
  if (sourceBaseTimePs === undefined || targetBaseTimePs === undefined) {
    return undefined;
  }
  const sourceTimePs =
    sourceBaseTimePs + (signalShiftsPs[source.id] ?? 0);

  const minDelayPs = Math.max(0, Math.min(link.minPs, link.maxPs));
  const maxDelayPs = Math.max(minDelayPs, Math.max(link.minPs, link.maxPs));
  const currentDelayPs = Math.min(
    maxDelayPs,
    Math.max(minDelayPs, link.currentPs),
  );

  return {
    sourceTimePs,
    targetBaseTimePs,
    targetTimePs: sourceTimePs + currentDelayPs,
    minTimePs: sourceTimePs + minDelayPs,
    maxTimePs: sourceTimePs + maxDelayPs,
    targetShiftPs: sourceTimePs + currentDelayPs - targetBaseTimePs,
  };
}

export function resolveLinkedTiming(
  signals: Signal[],
  durationPs: number,
  timing: LinkedTiming,
): ResolvedLinkedTiming {
  const signalShiftsPs: Record<string, number> = {};
  const resolved: Partial<Record<"clock" | "data", ResolvedEdgeDelay>> = {};
  const pending: Array<"clock" | "data"> = ["clock", "data"];

  while (pending.length > 0) {
    const unresolvedTargets = new Set(
      pending.map((kind) => timing[kind].targetSignalId),
    );
    const readyIndex = pending.findIndex((kind) => {
      const link = timing[kind];
      return (
        link.sourceSignalId === link.targetSignalId ||
        !unresolvedTargets.has(link.sourceSignalId)
      );
    });
    // A circular pair has no dependency-safe order. Resolve it deterministically
    // from the base waveforms so the canvas remains stable and editable.
    const index = readyIndex >= 0 ? readyIndex : 0;
    const [kind] = pending.splice(index, 1);
    const link = timing[kind];
    const result = resolveEdgeDelay(
      signals,
      durationPs,
      link,
      signalShiftsPs,
    );
    if (!result) continue;
    resolved[kind] = result;
    signalShiftsPs[link.targetSignalId] = result.targetShiftPs;
  }

  return {
    clock: resolved.clock,
    data: resolved.data,
    signalShiftsPs,
  };
}

export function resolveDelayLinks(
  signals: Signal[],
  durationPs: number,
  links: EdgeDelayLink[],
): ResolvedDelayLinks {
  const signalShiftsPs: Record<string, number> = {};
  const byId: Record<string, ResolvedEdgeDelay> = {};
  const pending = links.map((link, index) => ({
    link,
    key: link.id ?? `delay-${index}`,
  }));

  while (pending.length > 0) {
    const unresolvedTargets = new Set(
      pending.map(({ link }) => link.targetSignalId),
    );
    const readyIndex = pending.findIndex(({ link }) =>
      link.sourceSignalId === link.targetSignalId ||
      !unresolvedTargets.has(link.sourceSignalId),
    );
    const index = readyIndex >= 0 ? readyIndex : 0;
    const [{ link, key }] = pending.splice(index, 1);
    const resolved = resolveEdgeDelay(
      signals,
      durationPs,
      link,
      signalShiftsPs,
    );
    if (!resolved) continue;
    byId[key] = resolved;
    signalShiftsPs[link.targetSignalId] = resolved.targetShiftPs;
  }

  return { byId, signalShiftsPs };
}

export function resolveTimingConstraint(
  signals: Signal[],
  durationPs: number,
  constraint: TimingConstraint,
  signalShiftsPs: Record<string, number> = {},
): ResolvedTimingConstraint | undefined {
  const source = signals.find(
    (signal) => signal.id === constraint.sourceSignalId,
  );
  const target = signals.find(
    (signal) => signal.id === constraint.targetSignalId,
  );
  if (!source || !target) return undefined;

  const sourceKind =
    constraint.sourceEdgeKind ??
    (source.kind === "clock" ? "rising" : "transition");
  const targetKind =
    constraint.targetEdgeKind ??
    (target.kind === "clock" ? "rising" : "transition");
  const selectTimes = (
    signal: Signal,
    polarity: EdgePolarity,
    selectedEdges: number[] | undefined,
    legacyEdge: number,
  ) => {
    const times = signalEdgesByPolarity(signal, durationPs, polarity);
    const indices =
      selectedEdges === undefined ? [legacyEdge] : selectedEdges;
    const selectedTimes =
      indices.length === 0
        ? times
        : indices
            .map((edge) => times[Math.max(1, Math.floor(edge)) - 1])
            .filter((time): time is number => time !== undefined);
    const shiftPs = signalShiftsPs[signal.id] ?? 0;
    return selectedTimes.map((time) => time + shiftPs);
  };

  const sourceTimesPs = selectTimes(
    source,
    sourceKind,
    constraint.sourceEdges,
    constraint.sourceEdge,
  );
  const targetTimesPs = selectTimes(
    target,
    targetKind,
    constraint.targetEdges,
    constraint.targetEdge,
  );
  if (sourceTimesPs.length === 0 || targetTimesPs.length === 0) {
    return undefined;
  }

  const setupPs = Math.max(0, constraint.setupPs);
  const holdPs = Math.max(0, constraint.holdPs);
  return {
    targetTimesPs,
    windows: sourceTimesPs.map((sourceTimePs) => {
      const startTimePs = sourceTimePs - setupPs;
      const endTimePs = sourceTimePs + holdPs;
      const violatingTargetTimesPs = targetTimesPs.filter(
        (timePs) => timePs >= startTimePs && timePs <= endTimePs,
      );
      return {
        sourceTimePs,
        startTimePs,
        endTimePs,
        isViolated: violatingTargetTimesPs.length > 0,
        violatingTargetTimesPs,
      };
    }),
  };
}

export function clockWavePoints(
  signal: ClockSignal,
  durationPs: number,
): WavePoint[] {
  const period = clampDuration(signal.periodPs);
  const highDuration = period * Math.min(0.95, Math.max(0.05, signal.dutyCycle));
  const phaseStart = signal.startPs + signal.phasePs;
  const points: WavePoint[] = [];

  const valueAt = (time: number): 0 | 1 => {
    const relative = ((time - phaseStart) % period + period) % period;
    return relative < highDuration ? 1 : 0;
  };

  points.push({ timePs: 0, value: valueAt(0) });

  let cycleStart = phaseStart;
  while (cycleStart > 0) cycleStart -= period;
  while (cycleStart + period < 0) cycleStart += period;

  for (; cycleStart <= durationPs; cycleStart += period) {
    const rise = cycleStart;
    const fall = cycleStart + highDuration;

    if (rise > 0 && rise <= durationPs) {
      points.push({ timePs: rise, value: 0 });
      points.push({ timePs: rise, value: 1 });
    }
    if (fall > 0 && fall <= durationPs) {
      points.push({ timePs: fall, value: 1 });
      points.push({ timePs: fall, value: 0 });
    }
  }

  points.push({ timePs: durationPs, value: valueAt(durationPs) });
  return points.sort((a, b) => a.timePs - b.timePs);
}

export function binaryDataWavePoints(
  signal: DataSignal,
  durationPs: number,
): WavePoint[] {
  const period = clampDuration(signal.periodPs);
  const pattern = patternForDataSignal(signal);
  const points: WavePoint[] = [];

  if (!isBinaryPattern(pattern)) return points;

  const valueAt = (time: number): 0 | 1 => {
    const index = Math.max(0, Math.floor((time - signal.startPs) / period));
    return pattern[index % pattern.length] === "1" ? 1 : 0;
  };

  points.push({ timePs: 0, value: valueAt(0) });

  for (
    let symbol = 1, time = signal.startPs + period;
    time <= durationPs;
    symbol += 1, time = signal.startPs + symbol * period
  ) {
    const before = pattern[(symbol - 1) % pattern.length] === "1" ? 1 : 0;
    const after = pattern[symbol % pattern.length] === "1" ? 1 : 0;
    if (before !== after) {
      points.push({ timePs: time, value: before });
      points.push({ timePs: time, value: after });
    }
  }

  points.push({ timePs: durationPs, value: valueAt(durationPs) });
  return points;
}
