import type { Bus, BusRule, DataSignal, Signal, TimingProject } from "./timing";

export function generateBusPattern(rule: BusRule, channel: number): string[] {
  return Array.from({ length: rule.length }, (_, slot) =>
    `${rule.prefix}${rule.start + channel * rule.channelStep + slot * rule.timeStep}`,
  );
}

export function createBus(name = "BUS", width = 40, startPs = 0, periodPs = 1000): Bus {
  return {
    id: `bus-${crypto.randomUUID()}`, name, width, visible: true,
    startPs, periodPs,
    rule: { prefix: "D", start: 0, channelStep: 1, timeStep: width, length: 3 },
    displayMode: "all", expandedMode: "all", selectedChannels: [0, 1, 2, 3],
  };
}

export function createBusChannels(bus: Bus, color: string): DataSignal[] {
  return Array.from({ length: bus.width }, (_, index) => ({
    id: `data-${crypto.randomUUID()}`,
    kind: "data" as const,
    name: `${bus.name}〈${index}〉`,
    busId: bus.id, busIndex: index,
    sourceType: "pattern" as const,
    startPs: bus.startPs, periodPs: bus.periodPs,
    pattern: generateBusPattern(bus.rule, index),
    visible: true, color,
  }));
}

export function busChannels(project: TimingProject, busId: string): DataSignal[] {
  return project.signals.filter((signal): signal is DataSignal =>
    signal.kind === "data" && signal.busId === busId,
  ).sort((a, b) => (a.busIndex ?? 0) - (b.busIndex ?? 0));
}

export function applyBusPatterns(project: TimingProject, busId: string, patterns: string[][], indexes: number[], replaceOverrides: boolean, generated: boolean): TimingProject {
  const selected = new Map(indexes.map((index, position) => [index, patterns[position]]));
  const width = project.buses?.find((bus) => bus.id === busId)?.width;
  return { ...project, signals: project.signals.map((signal): Signal => {
    if (signal.kind !== "data" || signal.busId !== busId) return signal;
    const pattern = selected.get(signal.busIndex ?? -1);
    if (!pattern || signal.busOverrides?.pattern && !replaceOverrides) return signal;
    return { ...signal, pattern, patternSegments: undefined, busOverrides: {
      ...signal.busOverrides, pattern: !generated || indexes.length !== width,
    } };
  }) };
}

export function updateBusDefaults(project: TimingProject, busId: string, patch: Partial<Bus>): TimingProject {
  const old = project.buses?.find((bus) => bus.id === busId);
  if (!old) return project;
  const updated = { ...old, ...patch,
    expandedMode: patch.displayMode === "collapsed"
      ? (old.displayMode === "collapsed" ? old.expandedMode : old.displayMode)
      : patch.displayMode ?? old.expandedMode,
  };
  return {
    ...project,
    buses: project.buses?.map((bus) => bus.id === busId ? updated : bus),
    signals: project.signals.map((signal): Signal => {
      if (signal.kind !== "data" || signal.busId !== busId) return signal;
      const overrides = signal.busOverrides ?? {};
      return {
        ...signal,
        name: signal.name === `${old.name}〈${signal.busIndex}〉`
          ? `${updated.name}〈${signal.busIndex}〉` : signal.name,
        startPs: overrides.startPs ? signal.startPs : updated.startPs,
        periodPs: overrides.periodPs ? signal.periodPs : updated.periodPs,
        pattern: overrides.pattern ? signal.pattern : generateBusPattern(updated.rule, signal.busIndex ?? 0),
        patternSegments: overrides.pattern ? signal.patternSegments : undefined,
      };
    }),
  };
}

export function resizeBus(project: TimingProject, busId: string, width: number, color: string): TimingProject {
  const bus = project.buses?.find((item) => item.id === busId);
  if (!bus || !Number.isInteger(width) || width < 1 || width > 256) return project;
  const removed = new Set(project.signals.filter((signal) =>
    signal.kind === "data" && signal.busId === busId && (signal.busIndex ?? 0) >= width,
  ).map((signal) => signal.id));
  const existing = new Set(busChannels(project, busId).map((signal) => signal.busIndex));
  const added = createBusChannels({ ...bus, width }, color).filter((signal) => !existing.has(signal.busIndex));
  const lastIndex = project.signals.reduce((index, signal, current) =>
    signal.kind === "data" && signal.busId === busId ? current : index, -1);
  const signals = project.signals.filter((signal) => !removed.has(signal.id));
  signals.splice(Math.min(lastIndex + 1, signals.length), 0, ...added);
  return {
    ...project,
    buses: project.buses?.map((item) => item.id === busId ? {
      ...item, width, selectedChannels: item.selectedChannels.filter((index) => index < width).length
        ? item.selectedChannels.filter((index) => index < width)
        : Array.from({ length: Math.min(4, width) }, (_, index) => index),
    } : item),
    signals,
    delayLinks: project.delayLinks?.filter((link) => !removed.has(link.sourceSignalId) && !removed.has(link.targetSignalId)),
    timingConstraints: project.timingConstraints?.filter((constraint) =>
      !removed.has(constraint.sourceSignalId) && !removed.has(constraint.targetSignalId)),
  };
}

export function parseBusSelection(input: string, width: number): number[] {
  const chosen = new Set<number>();
  for (const part of input.replace(/[–—]/g, "-").split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error(`Invalid channel range: ${part.trim() || "empty"}`);
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (end < start || end >= width) throw new Error(`Channel range ${part.trim()} must be within 0–${width - 1}`);
    for (let index = start; index <= end; index += 1) chosen.add(index);
  }
  return [...chosen].sort((a, b) => a - b);
}

export function parseBusTable(input: string, width: number): string[][] {
  const rows = input.replace(/(?:\r?\n)+$/, "").split(/\r?\n/);
  if (rows.length !== width) throw new Error(`Expected ${width} rows, found ${rows.length}`);
  const parsed = rows.map((row, rowIndex) => row.split("\t").map((token, columnIndex) => {
    const value = token.trim().toUpperCase();
    if (!/^[A-Z0-9_+-]+$/.test(value)) throw new Error(`Row ${rowIndex + 1}, column ${columnIndex + 1}: invalid or empty data item`);
    return value;
  }));
  const columns = parsed[0]?.length ?? 0;
  parsed.forEach((row, index) => {
    if (row.length !== columns) throw new Error(`Row ${index + 1}, column ${row.length + 1}: expected ${columns} items`);
  });
  return parsed;
}

/** A range is shown only when every channel has a consecutive numeric label. */
function consecutiveBusRange(tokens: (string | null)[]): string | null {
  const active = tokens.filter((token): token is string => token !== null);
  if (active.length === 1 && tokens.length === 1) return active[0];
  if (active.length === tokens.length && active.length > 1) {
    const first = /^(.*?)(\d+)$/.exec(active[0]);
    if (first && active.every((token, index) => {
      const match = /^(.*?)(\d+)$/.exec(token);
      return match?.[1] === first[1] && Number(match[2]) === Number(first[2]) + index;
    })) return `${active[0]}–${active.at(-1)}`;
  }
  return null;
}

export function busSlotLabel(tokens: (string | null)[]): string {
  const range = consecutiveBusRange(tokens);
  if (range) return range;
  const active = tokens.filter((token): token is string => token !== null);
  return active.length === tokens.length
    ? `${active.length} data items`
    : `${active.length}/${tokens.length} data items`;
}

/** Fits the actual channel labels to one time cell without implying an absent range. */
export function fitBusSlotLabel(
  tokens: (string | null)[],
  maxWidthPx: number,
  measureText: (text: string) => number,
): string {
  const active = tokens.filter((token): token is string => token !== null);
  if (!active.length || maxWidthPx <= 0) return "";
  const range = consecutiveBusRange(tokens);
  if (range && measureText(range) <= maxWidthPx) return range;
  const prefix = active.length < tokens.length ? `${active.length}/${tokens.length} · ` : "";
  const full = prefix + active.join(", ");
  if (measureText(full) <= maxWidthPx) return full;

  for (let shown = active.length - 1; shown >= 2; shown -= 1) {
    const front = Math.ceil(shown / 2);
    const back = Math.floor(shown / 2);
    const candidate = `${prefix}${active.slice(0, front).join(", ")} … ${active.slice(-back).join(", ")}`;
    if (measureText(candidate) <= maxWidthPx) return candidate;
  }
  const first = `${prefix}${active[0]} …`;
  if (measureText(first) <= maxWidthPx) return first;
  const count = `${active.length}/${tokens.length}`;
  return measureText(count) <= maxWidthPx ? count : "";
}

// Pair slot boundaries only among channels with the same cadence.
export function busMixedWindows(channels: DataSignal[], duration: number, shifts: Record<string, number>, early: number, late: number) {
  const groups = new Map<number, { first: number; last: number; possible: boolean }>();
  for (const channel of channels) {
    const period = channel.periodPs;
    if (!Number.isFinite(period) || period <= 0) continue;
    const start = channel.startPs + (shifts[channel.id] ?? 0);
    const inherited = channel.busOffsetPs === undefined;
    const first = start - (inherited ? early : 0);
    const last = start + (inherited ? late : 0);
    const group = groups.get(period);
    groups.set(period, { first: Math.min(first, group?.first ?? first), last: Math.max(last, group?.last ?? last),
      possible: Boolean(group?.possible || inherited && (early > 0 || late > 0)) });
  }
  const windows: { startPs: number; endPs: number; possible: boolean }[] = [];
  for (const [period, { first, last, possible }] of groups) {
    if (first >= last) continue;
    for (let slot = Math.max(0, Math.floor(-last / period) + 1); first + slot * period < duration; slot++) {
      windows.push({ startPs: Math.max(0, first + slot * period), endPs: Math.min(duration, last + slot * period), possible });
      if (last - first >= period) { windows[windows.length - 1].endPs = duration; break; }
    }
  }
  const merged: typeof windows = [];
  for (const window of windows.sort((a, b) => a.startPs - b.startPs)) {
    const prev = merged.at(-1);
    if (prev && prev.endPs >= window.startPs) {
      prev.endPs = Math.max(prev.endPs, window.endPs);
      prev.possible ||= window.possible;
    } else merged.push(window);
  }
  return merged;
}
