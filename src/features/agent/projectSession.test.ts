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
