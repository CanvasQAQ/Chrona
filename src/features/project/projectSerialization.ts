import type { CanvasSettings, TimingProject } from "../../domain/timing";

interface ProjectDefaults {
  canvasSettings: CanvasSettings;
  durationPs: number;
}

export type ProjectParseResult =
  | { ok: true; project: TimingProject }
  | { ok: false; reason: "invalid" | "unsupported" };

function isTimingProject(value: unknown): value is TimingProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<TimingProject>;
  return (
    (project.version === 2 || project.version === 3) &&
    Array.isArray(project.signals)
  );
}

export function parseTimingProject(
  text: string,
  defaults: ProjectDefaults,
): ProjectParseResult {
  let loaded: unknown;
  try {
    loaded = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!isTimingProject(loaded)) {
    return { ok: false, reason: "unsupported" };
  }

  const project: TimingProject = {
    ...loaded,
    version: 3,
    durationPs: Math.max(1, loaded.durationPs || defaults.durationPs),
    signals: loaded.signals.map((signal) =>
      signal.kind === "data"
        ? { ...signal, sourceType: signal.sourceType ?? "pattern" }
        : signal,
    ),
    signalGroups: loaded.signalGroups ?? [],
    delayLinks: (
      loaded.delayLinks ??
      (loaded.linkedTiming
        ? [loaded.linkedTiming.clock, loaded.linkedTiming.data]
        : [])
    ).map((link, index) => ({
      ...link,
      id: link.id ?? crypto.randomUUID(),
      label: link.label?.trim() || `t${index + 1}`,
    })),
    timingConstraints:
      loaded.timingConstraints ??
      (loaded.linkedTiming
        ? [
            {
              id: crypto.randomUUID(),
              sourceSignalId: loaded.linkedTiming.clock.targetSignalId,
              targetSignalId: loaded.linkedTiming.data.targetSignalId,
              sourceEdge: loaded.linkedTiming.clock.targetEdge,
              targetEdge: loaded.linkedTiming.data.targetEdge,
              setupPs: loaded.linkedTiming.setupPs,
              holdPs: loaded.linkedTiming.holdPs,
            },
          ]
        : []),
    linkedTiming: undefined,
    canvasSettings: {
      ...defaults.canvasSettings,
      ...(loaded.canvasSettings ?? {}),
    },
  };

  return { ok: true, project };
}

export function downloadTextFile(
  name: string,
  content: string,
  type: string,
) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
