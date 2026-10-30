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
  sourceType?: "pattern" | "sequential";
  derivation?: SequentialDerivation;
}

export type Signal = ClockSignal | DataSignal;

export interface DelayRange {
  minPs: number;
  currentPs: number;
  maxPs: number;
}

export type SequentialDevice = "dff" | "latch";
export type SequentialTrigger = "rising" | "falling" | "high" | "low";

export interface SequentialDerivation {
  device: SequentialDevice;
  clockSignalId: string;
  dataSignalId: string;
  trigger: SequentialTrigger;
  c2q: DelayRange;
  d2q?: DelayRange;
  initialValue: string;
}

export function isSequentialDataSignal(
  signal: Signal | undefined,
): signal is DataSignal & { derivation: SequentialDerivation } {
  return Boolean(
    signal?.kind === "data" &&
      signal.sourceType === "sequential" &&
      signal.derivation,
  );
}

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
  waveformPalette?: WaveformPalette;
  clockColorMode?: "single" | "multi";
  clockColorIndex?: number;
  dataLabelSize?: DataLabelSize;
  dataLabelColor?: DataLabelColor;
  waveformGlow?: boolean;
}

export type WaveformPalette =
  | "contrast16"
  | "contrast24"
  | "vivid"
  | "classic"
  | "colorblind"
  | "document"
  | "research"
  | "coastal"
  | "mineral"
  | "graphite"
  | "monochrome";
export type DataLabelSize = "small" | "medium" | "large";
export type DataLabelColor = "token" | "contrast" | "muted";

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
  version: 2 | 3;
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

const CONTRAST_16 = [
  "#2563EB", "#D97706", "#059669", "#DC2626",
  "#7C3AED", "#0F766E", "#C2410C", "#1D4ED8",
  "#BE185D", "#4D7C0F", "#0891B2", "#9333EA",
  "#B45309", "#15803D", "#E11D48", "#334155",
] as const;

const CONTRAST_24 = [
  ...CONTRAST_16,
  "#0369A1", "#CA8A04", "#0D9488", "#A21CAF",
  "#EA580C", "#166534", "#4338CA", "#B91C1C",
] as const;

const CONTRAST_24_DARK = [
  "#7EA8FF", "#F4AE59", "#47D7A6", "#FF7777",
  "#B99BFF", "#58D2BF", "#F49B70", "#89A9FF",
  "#F27CAC", "#B9D46F", "#58C8E4", "#D09BFF",
  "#E8B66C", "#67D38B", "#FF749B", "#ADBED0",
  "#62BCEB", "#E2C45D", "#5ED6C7", "#DF8AE8",
  "#FF985D", "#82C77C", "#A6A0FF", "#F28282",
] as const;

const VIVID_24 = [
  "#6741F2", "#00A67D", "#E26700", "#087DD1",
  "#D63384", "#7A5AF8", "#00A6B8", "#D82B32",
  "#9A5B00", "#17A34A", "#4338CA", "#DF2E8A",
  "#B45309", "#008F75", "#9638E2", "#E11D48",
  "#0B91B7", "#71A500", "#C51658", "#2563EB",
  "#C64A1C", "#0BA59A", "#B623C7", "#4F46E5",
] as const;

const VIVID_24_DARK = [
  "#AA91FF", "#3FE2BA", "#FFAB66", "#62B9FF",
  "#FF78B9", "#B4A0FF", "#4BD9E8", "#FF777D",
  "#E5B057", "#62DB83", "#9A91FF", "#FF8BC7",
  "#F3BD67", "#48D5BA", "#CE91FF", "#FF728F",
  "#65D0F1", "#B3D85C", "#F782AD", "#82ABFF",
  "#FF946D", "#5AE0D1", "#E08CEA", "#A6A2FF",
] as const;

export const WAVEFORM_PALETTES: Record<
  WaveformPalette,
  {
    signal: readonly string[];
    token: readonly string[];
    darkSignal?: readonly string[];
    darkToken?: readonly string[];
  }
> = {
  contrast16: { signal: CONTRAST_16, token: CONTRAST_16, darkSignal: CONTRAST_24_DARK.slice(0, 16), darkToken: CONTRAST_24_DARK.slice(0, 16) },
  contrast24: { signal: CONTRAST_24, token: CONTRAST_24, darkSignal: CONTRAST_24_DARK, darkToken: CONTRAST_24_DARK },
  vivid: {
    signal: VIVID_24,
    token: VIVID_24,
    darkSignal: VIVID_24_DARK,
    darkToken: VIVID_24_DARK,
  },
  classic: {
    signal: ["#8b7cff", "#35d6b4", "#ffb45c", "#4db7ff", "#f277a8"],
    token: DATA_TOKEN_COLORS,
  },
  colorblind: {
    signal: ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00"],
    token: ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#f0e442", "#332288"],
  },
  document: {
    signal: ["#475569", "#2563eb", "#0f766e", "#64748b", "#6d5b8c", "#9a6a35"],
    token: ["#475569", "#2563eb", "#0f766e", "#64748b", "#6d5b8c", "#9a6a35", "#334155", "#155e75"],
  },
  research: {
    signal: ["#234c70", "#ad5b31", "#287868", "#76588a", "#555f70", "#a16c29"],
    token: ["#234c70", "#ad5b31", "#287868", "#76588a", "#555f70", "#a16c29", "#315f83", "#80514d"],
    darkSignal: ["#8bbde0", "#e6a17e", "#7ed2ba", "#baa1d0", "#adb9ca", "#dfb574"],
    darkToken: ["#8bbde0", "#e6a17e", "#7ed2ba", "#baa1d0", "#adb9ca", "#dfb574", "#91c7e6", "#d29a94"],
  },
  coastal: {
    signal: ["#1d4e68", "#087d84", "#b5654d", "#517396", "#6f677f", "#b18b40"],
    token: ["#1d4e68", "#087d84", "#b5654d", "#517396", "#6f677f", "#b18b40", "#377b8b", "#8d5972"],
    darkSignal: ["#82b8d1", "#75cbd1", "#e3a18d", "#9abadd", "#b9aeca", "#e5c888"],
    darkToken: ["#82b8d1", "#75cbd1", "#e3a18d", "#9abadd", "#b9aeca", "#e5c888", "#8cc8d2", "#d4a3bc"],
  },
  mineral: {
    signal: ["#5b4d70", "#9b6136", "#44746a", "#4c6680", "#8b5b68", "#716741"],
    token: ["#5b4d70", "#9b6136", "#44746a", "#4c6680", "#8b5b68", "#716741", "#366978", "#82664f"],
    darkSignal: ["#baa8d0", "#dfaa7f", "#91c9b9", "#a0bdd5", "#d5a6b1", "#c9be85"],
    darkToken: ["#baa8d0", "#dfaa7f", "#91c9b9", "#a0bdd5", "#d5a6b1", "#c9be85", "#90c7d0", "#cfb294"],
  },
  graphite: {
    signal: ["#333b47", "#526b82", "#77736c", "#3e6b70", "#675e78", "#8a6f56"],
    token: ["#333b47", "#526b82", "#77736c", "#3e6b70", "#675e78", "#8a6f56", "#4f6173", "#646d64"],
    darkSignal: ["#d5dce4", "#a8bfd1", "#bcb9b2", "#9bc3c5", "#b9afc8", "#ceb79f"],
    darkToken: ["#d5dce4", "#a8bfd1", "#bcb9b2", "#9bc3c5", "#b9afc8", "#ceb79f", "#b0bdcc", "#b4c0b3"],
  },
  monochrome: {
    signal: ["#111111"],
    token: ["#111111"],
    darkSignal: ["#ffffff"],
    darkToken: ["#ffffff"],
  },
};

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

export function colorForDataToken(
  token: string,
  palette: WaveformPalette = "classic",
  dark = false,
): string {
  const normalized = token.trim().toUpperCase();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const selectedPalette = WAVEFORM_PALETTES[palette];
  const colors = dark ? selectedPalette.darkToken ?? selectedPalette.token : selectedPalette.token;
  return colors[Math.abs(hash) % colors.length];
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
  edgeTimes?: (signal: Signal, polarity: EdgePolarity) => number[],
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
    const times = edgeTimes
      ? edgeTimes(signal, polarity)
      : signalEdgesByPolarity(signal, durationPs, polarity);
    const indices =
      selectedEdges === undefined ? [legacyEdge] : selectedEdges;
    const selectedTimes =
      indices.length === 0
        ? times
        : indices
            .map((edge) => times[Math.max(1, Math.floor(edge)) - 1])
            .filter((time): time is number => time !== undefined);
    const shiftPs = edgeTimes ? 0 : (signalShiftsPs[signal.id] ?? 0);
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
