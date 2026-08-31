import {
  patternForDataSignal,
  type DataSignal,
  type Signal,
  type WavePoint,
} from "../../domain/timing";

export const MIN_TRACK_HEIGHT = 48;
export const MAX_TRACK_HEIGHT = 160;
export const AXIS_HEIGHT = 42;
export const CANVAS_GUTTER = 18;
export const DEFAULT_LABEL_WIDTH = 196;
export const MIN_LABEL_WIDTH = 136;
export const MAX_LABEL_WIDTH = 420;
export const CANVAS_BASE_WIDTH = 1120;

export interface DataSegment {
  endPs: number;
  startPs: number;
  token: string;
}

export interface TrackLayout {
  height: number;
  signal: Signal;
  y: number;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
  );
  return sorted[index];
}

export function autoLabelWidth(signals: Signal[]): number {
  if (signals.length === 0 || typeof document === "undefined") {
    return DEFAULT_LABEL_WIDTH;
  }
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return DEFAULT_LABEL_WIDTH;
  context.font = "700 11px Inter, system-ui, sans-serif";
  const nameWidth = percentile(
    signals.map((signal) => context.measureText(signal.name).width),
    0.85,
  );
  return Math.round(
    Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, nameWidth + 58)),
  );
}

export function pathForPoints(
  points: WavePoint[],
  durationPs: number,
  width: number,
  y: number,
  rowHeight: number,
): string {
  const amplitude = Math.max(18, rowHeight * 0.44);
  const center = y + rowHeight / 2;
  const high = center - amplitude / 2;
  const low = center + amplitude / 2;
  return points
    .map((point, index) => {
      const x =
        CANVAS_GUTTER +
        (point.timePs / durationPs) * (width - CANVAS_GUTTER * 2);
      const py = point.value ? high : low;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${py}`;
    })
    .join(" ");
}

export function formatAxisTime(timePs: number): string {
  if (Math.abs(timePs) < 1000) {
    const digits = Math.abs(timePs) < 100 ? 2 : 1;
    return `${Number(timePs.toFixed(digits))} ps`;
  }
  const timeNs = timePs / 1000;
  const digits = Math.abs(timeNs) < 10 ? 3 : 2;
  return `${Number(timeNs.toFixed(digits))} ns`;
}

export function buildDataSegments(
  signal: DataSignal,
  durationPs: number,
): DataSegment[] {
  const pattern = patternForDataSignal(signal);
  const segments: DataSegment[] = [];
  const startIndex = Math.floor(-signal.startPs / signal.periodPs);
  const firstIndex = Math.max(0, startIndex);
  const count = Math.ceil((durationPs - signal.startPs) / signal.periodPs) + 1;

  for (let index = firstIndex; index < count; index += 1) {
    const rawStart = signal.startPs + index * signal.periodPs;
    const rawEnd = rawStart + signal.periodPs;
    if (rawEnd <= 0 || rawStart >= durationPs) continue;
    const startPs = Math.max(0, rawStart);
    const endPs = Math.min(durationPs, rawEnd);
    const token = pattern[index % pattern.length];
    const previous = segments[segments.length - 1];
    if (
      previous?.token === token &&
      Math.abs(previous.endPs - startPs) < 1e-6
    ) {
      previous.endPs = endPs;
    } else {
      segments.push({ startPs, endPs, token });
    }
  }

  return segments;
}
