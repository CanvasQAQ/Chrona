import {
  clampDuration,
  patternForDataSignal,
  signalEdgesByPolarity,
  type ClockSignal,
  type DataSignal,
  type DelayRange,
  type EdgeDelayLink,
  type EdgePolarity,
  type ResolvedEdgeDelay,
  type SequentialDerivation,
  type Signal,
} from "./timing";

export interface ResolvedDataEvent {
  value: string;
  cause: "c2q" | "d2q";
  causeTimePs: number;
  timePs: number;
  minTimePs: number;
  maxTimePs: number;
}

export interface ResolvedDataWaveform {
  initialValue: string;
  events: ResolvedDataEvent[];
  error?: string;
}

export interface ResolvedSequentialSignals {
  bySignalId: Record<string, ResolvedDataWaveform>;
  errors: Record<string, string>;
}

export interface ResolvedProjectTiming extends ResolvedSequentialSignals {
  clockBySignalId: Record<string, ClockSignal>;
  delayById: Record<string, ResolvedEdgeDelay>;
  signalShiftsPs: Record<string, number>;
  edgeTimes: (signalId: string, polarity?: EdgePolarity) => number[];
}

export interface TransparentInterval {
  startPs: number;
  endPs: number;
}

interface SourceEvent {
  timePs: number;
  value: string;
}

function normalizeRange(range: DelayRange): DelayRange {
  const minPs = Math.max(0, Math.min(range.minPs, range.maxPs));
  const maxPs = Math.max(minPs, Math.max(range.minPs, range.maxPs));
  return {
    minPs,
    currentPs: Math.min(maxPs, Math.max(minPs, range.currentPs)),
    maxPs,
  };
}

function patternWaveform(
  signal: DataSignal,
  durationPs: number,
): ResolvedDataWaveform {
  const pattern = patternForDataSignal(signal);
  const periodPs = clampDuration(signal.periodPs);
  const events: ResolvedDataEvent[] = [];
  let previous = pattern[0];
  for (
    let index = 1, timePs = signal.startPs + periodPs;
    timePs <= durationPs;
    index += 1, timePs = signal.startPs + index * periodPs
  ) {
    const value = pattern[index % pattern.length];
    if (value !== previous) {
      events.push({
        value,
        cause: "d2q",
        causeTimePs: timePs,
        timePs,
        minTimePs: timePs,
        maxTimePs: timePs,
      });
    }
    previous = value;
  }
  return { initialValue: pattern[0] ?? "X", events };
}

export function valueAtWaveform(
  waveform: ResolvedDataWaveform,
  timePs: number,
): string {
  let value = waveform.initialValue;
  for (const event of waveform.events) {
    if (event.timePs > timePs) break;
    value = event.value;
  }
  return value;
}

function sourceEvents(waveform: ResolvedDataWaveform): SourceEvent[] {
  return waveform.events.map(({ timePs, value }) => ({ timePs, value }));
}

function pushChangedEvent(
  output: ResolvedDataEvent[],
  event: ResolvedDataEvent,
  initialValue: string,
) {
  const previousValue = output.at(-1)?.value ?? initialValue;
  if (previousValue === event.value) return;
  const previous = output.at(-1);
  if (previous && Math.abs(previous.timePs - event.timePs) < 1e-9) {
    output[output.length - 1] = event;
    return;
  }
  output.push(event);
}

function scheduledEvent(
  cause: "c2q" | "d2q",
  causeTimePs: number,
  value: string,
  range: DelayRange,
): ResolvedDataEvent {
  const normalized = normalizeRange(range);
  return {
    cause,
    causeTimePs,
    value,
    timePs: causeTimePs + normalized.currentPs,
    minTimePs: causeTimePs + normalized.minPs,
    maxTimePs: causeTimePs + normalized.maxPs,
  };
}

function resolveDff(
  clock: ClockSignal,
  data: ResolvedDataWaveform,
  derivation: SequentialDerivation,
  durationPs: number,
): ResolvedDataWaveform {
  const initialValue = derivation.initialValue || "X";
  const polarity = derivation.trigger === "falling" ? "falling" : "rising";
  const output: ResolvedDataEvent[] = [];
  for (const edgeTimePs of signalEdgesByPolarity(clock, durationPs, polarity)) {
    const event = scheduledEvent(
      "c2q",
      edgeTimePs,
      valueAtWaveform(data, edgeTimePs),
      derivation.c2q,
    );
    if (event.timePs <= durationPs) {
      pushChangedEvent(output, event, initialValue);
    }
  }
  return { initialValue, events: output };
}

function clockValueAt(clock: ClockSignal, timePs: number): 0 | 1 {
  const periodPs = clampDuration(clock.periodPs);
  const highPs = periodPs * Math.min(0.95, Math.max(0.05, clock.dutyCycle));
  const phaseStart = clock.startPs + clock.phasePs;
  const relative = ((timePs - phaseStart) % periodPs + periodPs) % periodPs;
  return relative < highPs ? 1 : 0;
}

export function latchTransparentIntervals(
  clock: ClockSignal,
  trigger: "high" | "low",
  durationPs: number,
): TransparentInterval[] {
  const activeValue = trigger === "low" ? 0 : 1;
  const transitions = [
    ...signalEdgesByPolarity(clock, durationPs, "rising").map((timePs) => ({
      timePs,
      value: 1 as const,
    })),
    ...signalEdgesByPolarity(clock, durationPs, "falling").map((timePs) => ({
      timePs,
      value: 0 as const,
    })),
  ].sort((left, right) => left.timePs - right.timePs);
  const intervals: TransparentInterval[] = [];
  let value = clockValueAt(clock, 0);
  let startPs: number | undefined = value === activeValue ? 0 : undefined;
  for (const transition of transitions) {
    if (transition.timePs < 0) continue;
    const wasActive = value === activeValue;
    value = transition.value;
    const isActive = value === activeValue;
    if (!wasActive && isActive) startPs = transition.timePs;
    if (wasActive && !isActive && startPs !== undefined) {
      intervals.push({ startPs, endPs: transition.timePs });
      startPs = undefined;
    }
  }
  if (startPs !== undefined && startPs < durationPs) {
    intervals.push({ startPs, endPs: durationPs });
  }
  return intervals.filter((interval) => interval.endPs > interval.startPs);
}

function resolveLatch(
  clock: ClockSignal,
  data: ResolvedDataWaveform,
  derivation: SequentialDerivation,
  durationPs: number,
): ResolvedDataWaveform {
  const initialValue = derivation.initialValue || "X";
  const activeValue = derivation.trigger === "low" ? 0 : 1;
  const d2q = derivation.d2q ?? derivation.c2q;
  const clockEvents = [
    ...signalEdgesByPolarity(clock, durationPs, "rising").map((timePs) => ({
      timePs,
      value: 1 as const,
    })),
    ...signalEdgesByPolarity(clock, durationPs, "falling").map((timePs) => ({
      timePs,
      value: 0 as const,
    })),
  ].sort((left, right) => left.timePs - right.timePs);
  const dataEvents = sourceEvents(data);
  const times = Array.from(
    new Set([
      ...clockEvents.map((event) => event.timePs),
      ...dataEvents.map((event) => event.timePs),
    ]),
  ).sort((left, right) => left - right);

  const output: ResolvedDataEvent[] = [];
  let pending: ResolvedDataEvent | undefined;
  let clockValue = clockValueAt(clock, -1e-6);
  let dataValue = valueAtWaveform(data, -1e-6);

  const flushPending = (throughPs: number) => {
    if (!pending || pending.timePs > throughPs) return;
    if (pending.timePs <= durationPs) {
      pushChangedEvent(output, pending, initialValue);
    }
    pending = undefined;
  };

  for (const timePs of times) {
    flushPending(timePs);
    const clockEvent = clockEvents.find((event) => event.timePs === timePs);
    const dataEvent = dataEvents.find((event) => event.timePs === timePs);
    const wasActive = clockValue === activeValue;
    if (clockEvent) clockValue = clockEvent.value;
    if (dataEvent) dataValue = dataEvent.value;
    const isActive = clockValue === activeValue;

    let next: ResolvedDataEvent | undefined;
    if (!wasActive && isActive) {
      next = scheduledEvent("c2q", timePs, dataValue, derivation.c2q);
    } else if (wasActive && isActive && dataEvent) {
      next = scheduledEvent("d2q", timePs, dataValue, d2q);
    }
    if (next) pending = next;
  }
  flushPending(Number.POSITIVE_INFINITY);
  return { initialValue, events: output };
}

function shiftWaveform(
  waveform: ResolvedDataWaveform,
  shiftPs: number,
): ResolvedDataWaveform {
  if (shiftPs === 0) return waveform;
  return {
    ...waveform,
    events: waveform.events.map((event) => ({
      ...event,
      causeTimePs: event.causeTimePs + shiftPs,
      timePs: event.timePs + shiftPs,
      minTimePs: event.minTimePs + shiftPs,
      maxTimePs: event.maxTimePs + shiftPs,
    })),
  };
}

function dataEdgesFromWaveform(
  waveform: ResolvedDataWaveform,
  polarity: EdgePolarity,
  durationPs: number,
): number[] {
  let previous = waveform.initialValue.toUpperCase();
  const result: number[] = [];
  for (const event of waveform.events) {
    const current = event.value.toUpperCase();
    const matches =
      polarity === "transition" ||
      polarity === "both" ||
      (polarity === "rising" && previous === "0" && current === "1") ||
      (polarity === "falling" && previous === "1" && current === "0");
    if (matches && event.timePs >= 0 && event.timePs <= durationPs) {
      result.push(event.timePs);
    }
    previous = current;
  }
  return result;
}

interface SignalResolution {
  clock?: ClockSignal;
  data?: ResolvedDataWaveform;
}

export function resolveProjectTiming(
  signals: Signal[],
  durationPs: number,
  links: EdgeDelayLink[] = [],
): ResolvedProjectTiming {
  const bySignalId: Record<string, ResolvedDataWaveform> = {};
  const clockBySignalId: Record<string, ClockSignal> = {};
  const delayById: Record<string, ResolvedEdgeDelay> = {};
  const signalShiftsPs: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const resolved = new Map<string, SignalResolution>();
  const visiting = new Set<string>();
  const linkByTarget = new Map(
    links.map((link, index) => [
      link.targetSignalId,
      { link, key: link.id ?? `delay-${index}` },
    ]),
  );

  const edgesFor = (
    resolution: SignalResolution,
    polarity: EdgePolarity = "both",
  ): number[] => {
    if (resolution.clock) {
      return signalEdgesByPolarity(
        resolution.clock,
        durationPs,
        polarity === "transition" ? "both" : polarity,
      );
    }
    return resolution.data
      ? dataEdgesFromWaveform(resolution.data, polarity, durationPs)
      : [];
  };

  const fallbackFor = (signal: Signal): SignalResolution =>
    signal.kind === "clock"
      ? { clock: signal }
      : {
          data:
            signal.sourceType === "sequential" && signal.derivation
              ? { initialValue: signal.derivation.initialValue || "X", events: [] }
              : patternWaveform(signal, durationPs),
        };

  const resolveSignal = (signalId: string): SignalResolution | undefined => {
    const cached = resolved.get(signalId);
    if (cached) return cached;
    const signal = signals.find((item) => item.id === signalId);
    if (!signal) return undefined;
    if (visiting.has(signalId)) {
      errors[signalId] = "Timing dependency cycle";
      return fallbackFor(signal);
    }
    visiting.add(signalId);

    let base: SignalResolution;
    if (signal.kind === "clock") {
      base = { clock: signal };
    } else if (signal.sourceType !== "sequential" || !signal.derivation) {
      base = { data: patternWaveform(signal, durationPs) };
    } else {
      const clockResolution = resolveSignal(signal.derivation.clockSignalId);
      const dataResolution = resolveSignal(signal.derivation.dataSignalId);
      if (!clockResolution?.clock || !dataResolution?.data) {
        errors[signal.id] = "Missing clock or data source";
        base = {
          data: {
            initialValue: signal.derivation.initialValue || "X",
            events: [],
            error: errors[signal.id],
          },
        };
      } else {
        base = {
          data:
            signal.derivation.device === "dff"
              ? resolveDff(
                  clockResolution.clock,
                  dataResolution.data,
                  signal.derivation,
                  durationPs,
                )
              : resolveLatch(
                  clockResolution.clock,
                  dataResolution.data,
                  signal.derivation,
                  durationPs,
                ),
        };
      }
    }

    let final = base;
    const linked = linkByTarget.get(signalId);
    if (linked) {
      const source =
        linked.link.sourceSignalId === signalId
          ? base
          : resolveSignal(linked.link.sourceSignalId);
      const sourceTimePs = source
        ? edgesFor(source)[Math.max(1, Math.floor(linked.link.sourceEdge)) - 1]
        : undefined;
      const targetBaseTimePs =
        edgesFor(base)[Math.max(1, Math.floor(linked.link.targetEdge)) - 1];
      if (sourceTimePs !== undefined && targetBaseTimePs !== undefined) {
        const range = normalizeRange(linked.link);
        const targetShiftPs = sourceTimePs + range.currentPs - targetBaseTimePs;
        const delay: ResolvedEdgeDelay = {
          sourceTimePs,
          targetBaseTimePs,
          targetTimePs: sourceTimePs + range.currentPs,
          minTimePs: sourceTimePs + range.minPs,
          maxTimePs: sourceTimePs + range.maxPs,
          targetShiftPs,
        };
        delayById[linked.key] = delay;
        signalShiftsPs[signalId] = targetShiftPs;
        if (base.clock) {
          final = {
            clock: { ...base.clock, startPs: base.clock.startPs + targetShiftPs },
          };
        } else if (base.data) {
          final = {
            data:
              signal.kind === "data" && signal.sourceType !== "sequential"
                ? patternWaveform(
                    { ...signal, startPs: signal.startPs + targetShiftPs },
                    durationPs,
                  )
                : shiftWaveform(base.data, targetShiftPs),
          };
        }
      } else {
        errors[signalId] = "Delay link has no resolvable edge";
      }
    }

    resolved.set(signalId, final);
    visiting.delete(signalId);
    if (final.clock) clockBySignalId[signalId] = final.clock;
    if (final.data) bySignalId[signalId] = final.data;
    return final;
  };

  signals.forEach((signal) => resolveSignal(signal.id));
  return {
    bySignalId,
    clockBySignalId,
    delayById,
    signalShiftsPs,
    errors,
    edgeTimes: (signalId, polarity = "both") => {
      const resolution = resolved.get(signalId);
      return resolution ? edgesFor(resolution, polarity) : [];
    },
  };
}

export function resolveSequentialSignals(
  signals: Signal[],
  durationPs: number,
): ResolvedSequentialSignals {
  const { bySignalId, errors } = resolveProjectTiming(signals, durationPs);
  return { bySignalId, errors };
}

export function segmentsForResolvedWaveform(
  waveform: ResolvedDataWaveform,
  durationPs: number,
): Array<{ startPs: number; endPs: number; token: string }> {
  const segments: Array<{ startPs: number; endPs: number; token: string }> = [];
  let startPs = 0;
  let token = waveform.initialValue;
  for (const event of waveform.events) {
    if (event.timePs < 0) {
      token = event.value;
      continue;
    }
    if (event.timePs > durationPs) break;
    if (event.timePs > startPs) {
      segments.push({ startPs, endPs: event.timePs, token });
    }
    startPs = event.timePs;
    token = event.value;
  }
  if (startPs < durationPs) segments.push({ startPs, endPs: durationPs, token });
  return segments;
}
