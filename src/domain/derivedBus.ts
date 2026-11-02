import { busChannels, createBus, createBusChannels, parseBusName } from "./bus";
import type { Bus, ClockSignal, DataSignal, DelayRange, SequentialDevice, SequentialTrigger, TimingProject } from "./timing";
import type { ResolvedDataWaveform } from "./sequential";

export interface DerivedBusOptions {
  id?: string;
  name: string;
  sourceBusId: string;
  clockSignalId: string;
  device: SequentialDevice;
  trigger: SequentialTrigger;
  c2q: DelayRange;
  d2q?: DelayRange;
  initialValue: string;
}

export function createDerivedBus(project: TimingProject, options: DerivedBusOptions, color: string): { bus: Bus; channels: DataSignal[] } {
  const source = project.buses?.find(bus => bus.id === options.sourceBusId);
  const clock = project.signals.find((signal): signal is ClockSignal => signal.id === options.clockSignalId && signal.kind === "clock");
  if (!source || !clock) throw new Error("Choose an existing Bus and Clock");
  const inputs = busChannels(project, source.id);
  if (inputs.length !== source.width || inputs.some((input, index) => input.busIndex !== index)) throw new Error("Input Bus must have one signal for every channel");
  const namedRange = parseBusName(options.name);
  if (namedRange && namedRange.width !== source.width) throw new Error("Output name range must match input Bus width");
  if (options.device === "dff" && !["rising", "falling"].includes(options.trigger) ||
      options.device === "latch" && (!["high", "low"].includes(options.trigger) || !options.d2q)) throw new Error("Trigger or delay does not match the device");
  const bus = { ...createBus(options.name, source.width, 0, clock.periodPs),
    id: options.id ?? `bus-${crypto.randomUUID()}`, width: source.width,
    channelFirst: namedRange?.channelFirst ?? source.channelFirst ?? 0,
    channelStep: namedRange?.channelStep ?? source.channelStep ?? 1,
    rule: { prefix: "Q", start: 0, channelStep: 1, timeStep: source.width, length: 1 },
  };
  const channels = createBusChannels(bus, color).map((channel, index): DataSignal => ({ ...channel,
    sourceType: "sequential", pattern: [options.initialValue],
    derivation: { device: options.device, clockSignalId: clock.id, dataSignalId: inputs[index].id,
      trigger: options.trigger, c2q: { ...options.c2q }, d2q: options.d2q ? { ...options.d2q } : undefined,
      initialValue: options.initialValue },
  }));
  return { bus, channels };
}

/** Q events sharing a cause time form one possible Bus transition. */
export function derivedBusMixedWindows(channels: DataSignal[], waveforms: Record<string, ResolvedDataWaveform>, durationPs: number) {
  const byCause = new Map<number, { startPs: number; endPs: number; possible: boolean }>();
  for (const channel of channels) for (const event of waveforms[channel.id]?.events ?? []) {
    const previous = byCause.get(event.causeTimePs);
    const startPs = Math.min(event.minTimePs, previous?.startPs ?? Infinity);
    const endPs = Math.max(event.maxTimePs, previous?.endPs ?? -Infinity);
    byCause.set(event.causeTimePs, { startPs, endPs,
      possible: Boolean(previous?.possible || event.minTimePs !== event.maxTimePs) });
  }
  const merged: { startPs: number; endPs: number; possible: boolean }[] = [];
  for (const window of [...byCause.values()].sort((a, b) => a.startPs - b.startPs)) {
    const startPs = Math.max(0, window.startPs);
    const endPs = Math.min(durationPs, window.endPs);
    if (endPs <= startPs) continue;
    const previous = merged.at(-1);
    if (previous && previous.endPs >= startPs) {
      previous.endPs = Math.max(previous.endPs, endPs);
      previous.possible ||= window.possible;
    } else merged.push({ startPs, endPs, possible: window.possible });
  }
  return merged;
}
