import { describe, expect, it } from "vitest";
import { ProjectSession } from "./projectSession";
import type { TimingProject } from "../../domain/timing";

const empty = (): TimingProject => ({ version: 3, name: "Test", durationPs: 6000, signals: [],
  constraintDraft: { setupPs: 10, holdPs: 10, status: "awaiting-definition" } });
const clk = { type: "create_signal", signal: { id: "clk", name: "CLK", kind: "clock", periodPs: 1000 } };
const data = { type: "create_signal", signal: { id: "d", name: "D", kind: "data", periodPs: 750, pattern: ["0", "1"] } };
const range = { minPs: 10, currentPs: 20, maxPs: 30 };
function request(session: ProjectSession, operations: unknown[], requestId = crypto.randomUUID()) {
  const { sessionId, revision } = session.getSnapshot();
  return { sessionId, expectedRevision: revision, requestId, operations };
}
describe("live engineering session", () => {
  it("tracks the saved contents across editing, undo, an in-flight save and opening another file", () => {
    const session = new ProjectSession(empty());
    session.execute(request(session, [clk]));
    const written = session.getSnapshot().project;
    expect(session.getSnapshot().isDirty).toBe(true);
    session.update(p => ({ ...p, durationPs: 9000 }));
    session.markSaved(written);
    expect(session.getSnapshot().isDirty).toBe(true);
    session.undo();
    expect(session.getSnapshot().isDirty).toBe(false);
    session.redo();
    expect(session.getSnapshot().isDirty).toBe(true);
    session.update(p => ({ ...p, durationPs: written.durationPs }));
    expect(session.getSnapshot().isDirty).toBe(false);
    session.open(empty());
    expect(session.getSnapshot()).toMatchObject({ isDirty: false, canUndo: false });
  });
  it("creates a batch once and one undo restores it; redo and undo advance revisions", () => {
    const session = new ProjectSession(empty());
    const req = request(session, [clk, data]);
    expect(session.execute(req)).toMatchObject({ revision: 1, applied: 2 });
    expect(session.execute(req)).toMatchObject({ revision: 1, replayed: true });
    expect(session.getSnapshot().project.signals).toHaveLength(2);
    session.undo();
    expect(session.getSnapshot()).toMatchObject({ revision: 2, project: { signals: [] } });
    expect(session.execute(req)).toMatchObject({ revision: 1, replayed: true, currentRevision: 2 });
    expect(session.getSnapshot().project.signals).toHaveLength(0);
    session.redo(); expect(session.getSnapshot().revision).toBe(3);
    expect(session.getSnapshot().project.signals).toHaveLength(2);
  });
  it("rejects stale writes after manual edits, even without subscriptions", () => {
    const session = new ProjectSession(empty()); const req = request(session, [clk]);
    session.update((p) => ({ ...p, name: "Manually renamed" }));
    expect(session.handle("apply", req)).toMatchObject({ error: { code: "REVISION_CONFLICT" }, revision: 1 });
    expect(session.getSnapshot().project.signals).toHaveLength(0);
  });
  it("invalidates old requests when opening even the same file", () => {
    const session = new ProjectSession(empty()); const req = request(session, [clk]);
    session.open(empty());
    expect(session.handle("apply", req)).toMatchObject({ error: { code: "SESSION_MISMATCH" } });
    expect(session.getSnapshot().revision).toBe(0);
  });
  it("rejects a reused ID with different contents", () => {
    const session = new ProjectSession(empty()); const req = request(session, [clk]); session.execute(req);
    expect(session.handle("apply", { ...req, operations: [data] })).toMatchObject({ error: { code: "REQUEST_ID_REUSED" } });
  });
  it("rolls back all operations on invalid input or a dependency cycle", () => {
    const session = new ProjectSession(empty());
    const a = { type: "put_delay", delay: { id: "a", sourceSignalId: "clk", targetSignalId: "d", sourceEdge: 1, targetEdge: 1, ...range } };
    const b = { type: "put_delay", delay: { ...a.delay, id: "b", sourceSignalId: "d", targetSignalId: "clk" } };
    expect(session.handle("apply", request(session, [clk, data, a, b]))).toMatchObject({ error: { code: "INVALID_OPERATION" } });
    expect(session.getSnapshot()).toMatchObject({ revision: 0, project: { signals: [] }, canUndo: false });
    expect(session.handle("apply", request(session, [clk, { type: "update_signal", id: "absent", patch: { name: "x" } }]))).toHaveProperty("error");
    expect(session.getSnapshot().project.signals).toHaveLength(0);
  });
  it("creates derived Q, exposes resolved events and rejects direct Q patterns", () => {
    const session = new ProjectSession(empty());
    session.execute(request(session, [clk, data, { type: "create_signal", signal: { id: "q", name: "Q", kind: "derived", periodPs: 1000,
      derivation: { device: "dff", clockSignalId: "clk", dataSignalId: "d", trigger: "rising", c2q: range, initialValue: "0" } } }]));
    const read = session.read({ signalIds: ["q"], waveform: { startPs: 0, endPs: 3000 } });
    expect(read.signals[0]).toMatchObject({ id: "q", sourceType: "sequential" });
    expect(read.waveforms).toEqual(expect.arrayContaining([expect.objectContaining({ signalId: "q", events: expect.any(Array) })]));
    expect(session.handle("apply", request(session, [{ type: "update_signal", id: "q", patch: { pattern: ["1"] } }]))).toHaveProperty("error");
    expect(session.handle("apply", request(session, [{ type: "delete_signal", id: "d" }]))).toHaveProperty("error");
  });
  it("supports Bus defaults while preserving local channel overrides", () => {
    const session = new ProjectSession(empty());
    session.execute(request(session, [{ type: "create_bus", bus: { id: "bus", name: "BUS", width: 2, periodPs: 1000 } }]));
    const channel = session.getSnapshot().project.signals[0].id;
    session.execute(request(session, [{ type: "update_signal", id: channel, patch: { periodPs: 250 } },
      { type: "update_bus", id: "bus", patch: { periodPs: 2000 } }]));
    expect(session.getSnapshot().project.signals.map((s) => s.periodPs)).toEqual([250, 2000]);
    expect(session.handle("apply", request(session, [{ type: "delete_signal", id: channel }]))).toHaveProperty("error");
    session.execute(request(session, [{ type: "delete_bus", id: "bus" }]));
    expect(session.getSnapshot().project.signals).toHaveLength(0);
  });
  it("exposes Bus ranges, uncertainty, fixed offsets, bulk patterns and restoration", () => {
    const session = new ProjectSession(empty());
    session.execute(request(session, [{ type: "create_bus", bus: { id: "bus", name: "data<10:4>", periodPs: 1000,
      earlyPs: 140, latePs: 180 } }]));
    let project = session.getSnapshot().project;
    expect(project.buses?.[0]).toMatchObject({ name: "data", width: 7, channelFirst: 10, channelStep: -1, earlyPs: 140, latePs: 180 });
    expect(project.signals.map(signal => signal.name)).toEqual(["data〈10〉", "data〈9〉", "data〈8〉", "data〈7〉", "data〈6〉", "data〈5〉", "data〈4〉"]);
    const channelId = project.signals[0].id;
    session.execute(request(session, [
      { type: "update_signal", id: channelId, patch: { busOffsetPs: -100 } },
      { type: "apply_bus_patterns", id: "bus", channelIndexes: [0, 1], patterns: [["X", "A"], ["B", "C"]] },
      { type: "update_bus", id: "bus", patch: { earlyPs: 160, latePs: 200, displayMode: "selected", selectedChannels: [0, 6] } },
    ]));
    project = session.getSnapshot().project;
    expect(project.signals[0]).toMatchObject({ busOffsetPs: -100, pattern: ["X", "A"] });
    expect(project.buses?.[0]).toMatchObject({ earlyPs: 160, latePs: 200, selectedChannels: [0, 6] });
    session.execute(request(session, [
      { type: "update_signal", id: channelId, patch: { busOffsetPs: null } },
      { type: "restore_bus_parameter", id: channelId, parameter: "pattern" },
    ]));
    expect(session.getSnapshot().project.signals[0]).toMatchObject({ pattern: ["D0", "D7", "D14"], busOverrides: { pattern: false } });
    expect(session.getSnapshot().project.signals[0]).not.toHaveProperty("busOffsetPs", -100);
    expect(session.read({ includeProject: true }).project?.buses?.[0].channelFirst).toBe(10);
  });
  it("resizes a Bus atomically and rejects dangling derived sources", () => {
    const session = new ProjectSession(empty());
    session.execute(request(session, [clk, { type: "create_bus", bus: { id: "bus", name: "data<2:0>", periodPs: 1000 } }]));
    const sourceId = session.getSnapshot().project.signals.at(-1)!.id;
    session.execute(request(session, [{ type: "create_signal", signal: { id: "q", name: "Q", kind: "derived", periodPs: 1000,
      derivation: { device: "dff", clockSignalId: "clk", dataSignalId: sourceId, trigger: "rising", c2q: range, initialValue: "X" } } }]));
    const revision = session.getSnapshot().revision;
    expect(session.handle("apply", request(session, [{ type: "resize_bus", id: "bus", width: 2 }]))).toHaveProperty("error");
    expect(session.getSnapshot().revision).toBe(revision);
    session.execute(request(session, [{ type: "delete_signal", id: "q" }, { type: "resize_bus", id: "bus", width: 2 },
      { type: "update_bus", id: "bus", patch: { name: "payload<10:9>" } }]));
    expect(session.getSnapshot().project.signals.map(signal => signal.name)).toEqual(["CLK", "payload〈10〉", "payload〈9〉"]);
  });
  it("rejects inconsistent Bus automation input without changing the project", () => {
    const session = new ProjectSession(empty());
    for (const operations of [
      [{ type: "create_bus", bus: { id: "b", name: "data<10:4>", width: 8, periodPs: 1000 } }],
      [{ type: "create_bus", bus: { id: "b", name: "data<10:4>", periodPs: 1000, earlyPs: -1 } }],
      [clk, { type: "update_signal", id: "clk", patch: { busOffsetPs: -5 } }],
      [{ type: "create_bus", bus: { id: "b", name: "B", width: 2, periodPs: 1000 } },
        { type: "apply_bus_patterns", id: "b", channelIndexes: [0, 0], patterns: [["A"], ["B"]] }],
    ]) expect(session.handle("apply", request(session, operations))).toHaveProperty("error");
    expect(session.getSnapshot()).toMatchObject({ revision: 0, project: { signals: [] } });
  });
  it("creates a whole derived Bus in one MCP operation", () => {
    const session = new ProjectSession(empty());
    session.execute(request(session, [clk, { type: "create_bus", bus: { id: "input", name: "D<3:2>", periodPs: 1000, earlyPs: 600 } },
      { type: "create_derived_bus", bus: { id: "output", name: "Q", sourceBusId: "input", clockSignalId: "clk",
        device: "dff", trigger: "falling", c2q: range, initialValue: "X" } }]));
    const project = session.getSnapshot().project;
    expect(project.buses?.map(bus => bus.name)).toEqual(["D", "Q"]);
    expect(project.signals.slice(3).map(signal => signal.kind === "data" && signal.derivation?.dataSignalId))
      .toEqual([project.signals[1].id, project.signals[2].id]);
    expect(session.read({ signalIds: [project.signals[3].id], waveform: { startPs: 0, endPs: 2000 } }).waveforms)
      .toEqual(expect.arrayContaining([expect.objectContaining({ signalId: project.signals[3].id,
        events: expect.arrayContaining([expect.objectContaining({ value: "D0" })]),
        uncertainSamples: expect.arrayContaining([{ sampleTimePs: 500, outputTimePs: 520 }]) })]));
  });
  it("bounds history and request cache, keeping old evicted writes stale", () => {
    const session = new ProjectSession(empty()); const original = request(session, [clk]); session.execute(original);
    for (let i = 0; i < 260; i++) session.execute(request(session, [{ type: "update_project", patch: { name: `P${i}` } }]));
    expect(session.handle("apply", original)).toMatchObject({ error: { code: "REVISION_CONFLICT" } });
    for (let i = 0; i < 50; i++) session.undo();
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(session.getSnapshot().revision).toBe(311);
  });
  it("rejects invalid fields, nonfinite values, conflicting delays and excessive computation", () => {
    const session = new ProjectSession(empty());
    for (const operations of [
      [{ ...clk, signal: { ...clk.signal, periodPs: Infinity } }],
      [{ ...clk, signal: { ...clk.signal, periodPs: 0.00001 } }],
      [clk, { type: "update_signal", id: "clk", patch: { kind: "data" } }],
      [clk, { type: "update_signal", id: "clk", patch: { pattern: ["0"] } }],
    ]) expect(session.handle("apply", request(session, operations))).toHaveProperty("error");
    expect(session.getSnapshot().revision).toBe(0);
  });
  it("summary is compact, full reads are explicit, and unknown IDs/ranges fail", () => {
    const session = new ProjectSession(empty()); session.execute(request(session, [clk, data]));
    expect(session.read({}).signals[0]).toEqual({ id: "clk", name: "CLK", kind: "clock" });
    expect(session.read({ includeProject: true })).toHaveProperty("project.signals");
    expect(session.handle("read", { signalIds: ["missing"] })).toHaveProperty("error");
    expect(session.handle("read", { waveform: { startPs: 300, endPs: 100 } })).toHaveProperty("error");
    const rev = session.getSnapshot().revision;
    session.update((p) => ({ ...p })); expect(session.getSnapshot().revision).toBe(rev);
  });
});
