import type { z } from "zod";
import { readSchema, transactionSchema } from "../../../shared/agent-schema.js";
import { createBus, createBusChannels, updateBusDefaults } from "../../domain/bus";
import { clockWavePoints, type Signal, type TimingProject } from "../../domain/timing";
import { resolveProjectTiming } from "../../domain/sequential";

type Transaction = z.infer<typeof transactionSchema>;
export interface SessionSnapshot {
  project: TimingProject;
  sessionId: string;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  activity: string;
}
export class AgentError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new AgentError("INVALID_OPERATION", message);
}

/** Pure candidate construction. No live state is changed until the entire batch passes. */
export function applyOperations(project: TimingProject, operations: Transaction["operations"]): TimingProject {
  let next = structuredClone(project);
  for (const op of operations) {
    const signal = "id" in op ? next.signals.find((item) => item.id === op.id) : undefined;
    switch (op.type) {
      case "create_signal": {
        const input = op.signal;
        requireValue(!next.signals.some((item) => item.id === input.id) && !next.buses?.some((b) => b.id === input.id), `ID already exists: ${input.id}`);
        const created: Signal = input.kind === "derived"
          ? { ...input, kind: "data", sourceType: "sequential", pattern: [input.derivation.initialValue] }
          : input.kind === "data" ? { ...input, sourceType: "pattern" } : input;
        next.signals.push(created);
        break;
      }
      case "update_signal": {
        requireValue(signal, `Unknown signal: ${op.id}`);
        const p = op.patch;
        if (signal.kind === "clock") requireValue(p.pattern === undefined && p.derivation === undefined, "Clock cannot have pattern or derivation");
        else {
          requireValue(p.phasePs === undefined && p.dutyCycle === undefined, "Data cannot have clock fields");
          requireValue(!(signal.sourceType === "sequential" && p.pattern !== undefined), "Edit the derivation or its sources, not the Q pattern");
          requireValue(p.derivation === undefined || signal.sourceType === "sequential", "Only derived Q accepts derivation updates");
        }
        next.signals = next.signals.map((item) => item.id !== op.id ? item : ({ ...item, ...p,
          ...(p.pattern ? { patternSegments: undefined } : {}),
          ...(item.kind === "data" && item.busId ? { busOverrides: { ...item.busOverrides,
            ...(p.pattern ? { pattern: true } : {}), ...(p.startPs !== undefined ? { startPs: true } : {}),
            ...(p.periodPs !== undefined ? { periodPs: true } : {}),
          } } : {}),
        } as Signal));
        break;
      }
      case "delete_signal":
        requireValue(signal, `Unknown signal: ${op.id}`);
        requireValue(!(signal.kind === "data" && signal.busId), "Delete the bus as a whole; individual bus channels cannot be deleted");
        next.signals = next.signals.filter((item) => item.id !== op.id);
        break;
      case "create_bus": {
        const input = op.bus;
        requireValue(!next.signals.some((item) => item.id === input.id) && !next.buses?.some((b) => b.id === input.id), `ID already exists: ${input.id}`);
        const bus = { ...createBus(input.name, input.width, input.startPs, input.periodPs), ...input,
          selectedChannels: Array.from({ length: Math.min(4, input.width) }, (_, i) => i) };
        next.buses = [...(next.buses ?? []), bus];
        next.signals.push(...createBusChannels(bus, "#7950f2"));
        break;
      }
      case "update_bus": {
        const bus = next.buses?.find((item) => item.id === op.id);
        requireValue(bus, `Unknown bus: ${op.id}`);
        requireValue(!op.patch.selectedChannels?.some((i) => i >= bus.width), "Selected channel outside bus width");
        next = updateBusDefaults(next, op.id, op.patch);
        break;
      }
      case "delete_bus":
        requireValue(next.buses?.some((item) => item.id === op.id), `Unknown bus: ${op.id}`);
        next.buses = next.buses?.filter((item) => item.id !== op.id);
        next.signals = next.signals.filter((item) => item.kind !== "data" || item.busId !== op.id);
        break;
      case "put_delay":
        next.delayLinks = [...(next.delayLinks ?? []).filter((item) => item.id !== op.delay.id), op.delay];
        break;
      case "delete_delay":
        requireValue(next.delayLinks?.some((item) => item.id === op.id), `Unknown delay: ${op.id}`);
        next.delayLinks = next.delayLinks?.filter((item) => item.id !== op.id);
        break;
      case "put_constraint":
        next.timingConstraints = [...(next.timingConstraints ?? []).filter((item) => item.id !== op.constraint.id), op.constraint];
        break;
      case "delete_constraint":
        requireValue(next.timingConstraints?.some((item) => item.id === op.id), `Unknown constraint: ${op.id}`);
        next.timingConstraints = next.timingConstraints?.filter((item) => item.id !== op.id);
        break;
      case "update_project": next = { ...next, ...op.patch }; break;
    }
  }
  validateProject(next);
  return next;
}

function validateProject(project: TimingProject) {
  requireValue(project.signals.length <= 1024, "Automation limit: 1024 signals");
  requireValue((project.delayLinks?.length ?? 0) + (project.timingConstraints?.length ?? 0) <= 4096, "Automation limit: 4096 relations");
  const byId = new Map(project.signals.map((s) => [s.id, s]));
  const delayBudget = (project.delayLinks ?? []).reduce((sum, link) => sum + Math.abs(link.maxPs), 0);
  let estimatedEvents = 0;
  for (const signal of project.signals) {
    requireValue(Number.isFinite(signal.periodPs) && signal.periodPs > 0, `Invalid period: ${signal.id}`);
    // Existing edge generation also steps through phase/start offsets and propagated delays.
    const offset = Math.abs(signal.startPs) + (signal.kind === "clock" ? Math.abs(signal.phasePs) : 0);
    estimatedEvents += Math.ceil((project.durationPs + offset + delayBudget) / signal.periodPs) * 2;
    if (signal.kind === "data" && signal.sourceType === "sequential") {
      const d = signal.derivation;
      requireValue(d && byId.get(d.clockSignalId)?.kind === "clock" && byId.get(d.dataSignalId)?.kind === "data", `Invalid derived sources: ${signal.id}`);
      requireValue(d.device === "dff" ? ["rising", "falling"].includes(d.trigger) : ["high", "low"].includes(d.trigger), "Trigger does not match device");
      for (const r of [d.c2q, d.d2q].filter((r) => r !== undefined)) requireValue(r.minPs <= r.currentPs && r.currentPs <= r.maxPs, "Expected min <= current <= max");
      requireValue(d.device !== "latch" || d.d2q, "Latch requires d2q delay");
    }
  }
  requireValue(estimatedEvents <= 100000, "Automation limit: estimated waveform events exceed 100000; increase periods or shorten duration");
  const targets = new Set<string>();
  for (const link of project.delayLinks ?? []) {
    requireValue(byId.has(link.sourceSignalId) && byId.has(link.targetSignalId), "Delay references a missing signal; remove dependent relations in the same batch");
    requireValue(!targets.has(link.targetSignalId), "Only one source delay is allowed per target");
    targets.add(link.targetSignalId);
    requireValue(link.minPs <= link.currentPs && link.currentPs <= link.maxPs, "Expected delay min <= current <= max");
  }
  for (const c of project.timingConstraints ?? []) requireValue(byId.has(c.sourceSignalId) && (byId.has(c.targetSignalId) || project.buses?.some(bus => bus.id === c.targetSignalId)), "Constraint references a missing signal; remove dependent relations in the same batch");
  // Inspect the dependency graph independently, including dependencies without resolvable edges.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    requireValue(!visiting.has(id), `Timing dependency cycle: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const signal = byId.get(id);
    if (signal?.kind === "data" && signal.derivation && signal.sourceType === "sequential") {
      visit(signal.derivation.clockSignalId); visit(signal.derivation.dataSignalId);
    }
    for (const link of project.delayLinks ?? []) if (link.targetSignalId === id) visit(link.sourceSignalId);
    visiting.delete(id); visited.add(id);
  };
  project.signals.forEach((s) => visit(s.id));
  const resolved = resolveProjectTiming(project.signals, project.durationPs, project.delayLinks);
  requireValue(!Object.keys(resolved.errors).length, `Timing validation: ${JSON.stringify(resolved.errors)}`);
}

export class ProjectSession {
  private snapshot: SessionSnapshot;
  private listeners = new Set<() => void>();
  private undoStack: TimingProject[] = [];
  private redoStack: TimingProject[] = [];
  private requests = new Map<string, { fingerprint: string; result: Record<string, unknown>; bytes: number }>();
  private requestBytes = 0;
  private projectSizes = new WeakMap<TimingProject, number>();
  constructor(project: TimingProject) {
    this.snapshot = { project, sessionId: crypto.randomUUID(), revision: 0, canUndo: false, canRedo: false, activity: "Engineering session ready" };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(project: TimingProject, activity: string) {
    this.snapshot = { ...this.snapshot, project, revision: this.snapshot.revision + 1,
      canUndo: !!this.undoStack.length, canRedo: !!this.redoStack.length, activity };
    this.listeners.forEach((listener) => listener());
  }
  private trimHistory() {
    const sizeOf = (project: TimingProject) => {
      let size = this.projectSizes.get(project);
      if (size === undefined) { size = JSON.stringify(project).length * 2; this.projectSizes.set(project, size); }
      return size;
    };
    let size = [...this.undoStack, ...this.redoStack].reduce((sum, p) => sum + sizeOf(p), 0);
    while (this.undoStack.length + this.redoStack.length > 50 || size > 16 * 1024 * 1024) {
      const removed = this.undoStack.shift() ?? this.redoStack.shift();
      if (!removed) break;
      size -= sizeOf(removed);
    }
  }
  update = (action: TimingProject | ((current: TimingProject) => TimingProject), activity = "User edited the project") => {
    const current = this.snapshot.project;
    const next = typeof action === "function" ? action(current) : action;
    if (next === current || JSON.stringify(next) === JSON.stringify(current)) return;
    this.undoStack.push(current); this.redoStack = []; this.trimHistory();
    this.publish(next, activity);
  };
  open = (project: TimingProject) => {
    this.undoStack = []; this.redoStack = []; this.requests.clear(); this.requestBytes = 0;
    this.snapshot = { project, sessionId: crypto.randomUUID(), revision: 0, canUndo: false, canRedo: false, activity: "Project opened · new editing session" };
    this.listeners.forEach((listener) => listener());
  };
  undo = () => {
    const previous = this.undoStack.pop(); if (!previous) return;
    this.redoStack.push(this.snapshot.project); this.trimHistory(); this.publish(previous, "Undo");
  };
  redo = () => {
    const next = this.redoStack.pop(); if (!next) return;
    this.undoStack.push(this.snapshot.project); this.trimHistory(); this.publish(next, "Redo");
  };
  execute = (input: unknown): Record<string, unknown> => {
    const request = transactionSchema.parse(input);
    const { sessionId, revision } = this.snapshot;
    if (request.sessionId !== sessionId) throw new AgentError("SESSION_MISMATCH", "The project was reopened. Read the new session before editing.");
    const fingerprint = JSON.stringify(request);
    const cached = this.requests.get(request.requestId);
    if (cached) {
      if (cached.fingerprint !== fingerprint) throw new AgentError("REQUEST_ID_REUSED", "Use a new requestId for different operations.");
      return { ...cached.result, replayed: true, currentRevision: revision };
    }
    if (request.expectedRevision !== revision) throw new AgentError("REVISION_CONFLICT", "The project changed. Read current state and reconsider the operations with a new requestId.");
    const next = applyOperations(this.snapshot.project, request.operations);
    this.update(next, `Agent applied ${request.operations.length} operation(s)`);
    const result = { sessionId, revision: this.snapshot.revision, applied: request.operations.length,
      changed: this.snapshot.revision !== revision, summary: this.snapshot.activity,
      signals: next.signals.map(({ id, name, kind }) => ({ id, name, kind })) };
    const bytes = (fingerprint.length + JSON.stringify(result).length) * 2;
    this.requests.set(request.requestId, { fingerprint, result, bytes }); this.requestBytes += bytes;
    while (this.requests.size > 256 || this.requestBytes > 8 * 1024 * 1024) {
      const key = this.requests.keys().next().value!;
      this.requestBytes -= this.requests.get(key)!.bytes; this.requests.delete(key);
    }
    return result;
  };
  read = (input: unknown) => {
    const request = readSchema.parse(input);
    const { project, sessionId, revision, activity } = this.snapshot;
    if (request.sessionId && request.sessionId !== sessionId) throw new AgentError("SESSION_MISMATCH", "Read the current session again.");
    const selected = request.signalIds ? project.signals.filter((s) => request.signalIds!.includes(s.id)) : project.signals;
    if (request.signalIds) requireValue(request.signalIds.every((id) => selected.some((s) => s.id === id)), "Unknown signalIds");
    let waveforms: unknown;
    if (request.waveform) {
      const { startPs, endPs } = request.waveform;
      requireValue(startPs < endPs && endPs <= project.durationPs, "Waveform range must lie inside project duration");
      validateProject(project);
      const timing = resolveProjectTiming(project.signals, project.durationPs, project.delayLinks);
      let returnedPoints = 0;
      waveforms = selected.map((signal) => {
        const clock = timing.clockBySignalId[signal.id];
        if (clock) {
          const points = clockWavePoints(clock, project.durationPs);
          const visible = points.filter((p) => p.timePs >= startPs && p.timePs <= endPs);
          returnedPoints += visible.length;
          requireValue(returnedPoints <= 5000, "Waveform response exceeds 5000 points/events; narrow the range or signalIds");
          return { signalId: signal.id, initialValue: points.filter((p) => p.timePs <= startPs).at(-1)?.value ?? 0, points: visible };
        }
        const data = timing.bySignalId[signal.id];
        const events = data?.events.filter((e) => e.timePs >= startPs && e.timePs <= endPs) ?? [];
        returnedPoints += events.length;
        requireValue(returnedPoints <= 5000, "Waveform response exceeds 5000 points/events; narrow the range or signalIds");
        return { signalId: signal.id,
          initialValue: data?.events.filter((e) => e.timePs <= startPs).at(-1)?.value ?? data?.initialValue,
          events };
      });
    }
    return { sessionId, revision, activity, name: project.name, durationPs: project.durationPs, timeUnit: "ps",
      signals: request.signalIds ? selected : selected.map(({ id, name, kind }) => ({ id, name, kind })),
      buses: project.buses ?? [], delayLinks: project.delayLinks ?? [], timingConstraints: project.timingConstraints ?? [],
      ...(request.includeProject ? { project } : {}), ...(waveforms ? { waveforms } : {}) };
  };
  handle = (method: string, input: unknown) => {
    try {
      if (method === "read") return this.read(input);
      if (method === "apply") return this.execute(input);
      throw new AgentError("UNKNOWN_METHOD", "Unsupported automation method");
    } catch (error) {
      return { error: { code: error instanceof AgentError ? error.code : "INVALID_INPUT", message: error instanceof Error ? error.message : String(error) },
        sessionId: this.snapshot.sessionId, revision: this.snapshot.revision };
    }
  };
}
