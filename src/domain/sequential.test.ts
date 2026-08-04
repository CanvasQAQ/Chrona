import { describe, expect, it } from "vitest";
import { resolveProjectTiming, resolveSequentialSignals } from "./sequential";
import { resolveTimingConstraint } from "./timing";
import type { ClockSignal, DataSignal, Signal } from "./timing";

const clock: ClockSignal = {
  id: "clk",
  kind: "clock",
  name: "CLK",
  startPs: 0,
  periodPs: 100,
  phasePs: 0,
  dutyCycle: 0.5,
  visible: true,
  color: "#8b7cff",
};

const data: DataSignal = {
  id: "d",
  kind: "data",
  name: "D",
  startPs: 0,
  periodPs: 25,
  pattern: ["0", "1", "0", "1", "1", "0"],
  visible: true,
  color: "#35d6b4",
};

function output(
  derivation: NonNullable<DataSignal["derivation"]>,
): DataSignal {
  return {
    id: "q",
    kind: "data",
    name: "Q",
    startPs: 0,
    periodPs: 100,
    pattern: ["X"],
    sourceType: "sequential",
    derivation,
    visible: true,
    color: "#ffb45c",
  };
}

describe("sequential derived data", () => {
  it("samples D on DFF edges and applies the C→Q range", () => {
    const signals: Signal[] = [
      clock,
      data,
      output({
        device: "dff",
        clockSignalId: "clk",
        dataSignalId: "d",
        trigger: "falling",
        c2q: { minPs: 5, currentPs: 10, maxPs: 15 },
        initialValue: "X",
      }),
    ];
    const resolved = resolveSequentialSignals(signals, 240).bySignalId.q;
    expect(resolved.events[0]).toMatchObject({
      cause: "c2q",
      causeTimePs: 50,
      timePs: 60,
      minTimePs: 55,
      maxTimePs: 65,
      value: "0",
    });
  });

  it("uses C→Q on latch opening and D→Q while transparent", () => {
    const signals: Signal[] = [
      clock,
      data,
      output({
        device: "latch",
        clockSignalId: "clk",
        dataSignalId: "d",
        trigger: "high",
        c2q: { minPs: 4, currentPs: 8, maxPs: 12 },
        d2q: { minPs: 2, currentPs: 6, maxPs: 10 },
        initialValue: "X",
      }),
    ];
    const events = resolveSequentialSignals(signals, 140).bySignalId.q.events;
    expect(events[0]).toMatchObject({ cause: "c2q", timePs: 8, value: "0" });
    expect(events[1]).toMatchObject({ cause: "d2q", timePs: 31, value: "1" });
    expect(events.every((event) => event.causeTimePs !== 50)).toBe(true);
  });

  it("reports a cycle instead of recursing forever", () => {
    const q1 = output({
      device: "dff",
      clockSignalId: "clk",
      dataSignalId: "q2",
      trigger: "rising",
      c2q: { minPs: 0, currentPs: 10, maxPs: 20 },
      initialValue: "X",
    });
    const q2 = {
      ...output({
        device: "dff",
        clockSignalId: "clk",
        dataSignalId: "q",
        trigger: "rising",
        c2q: { minPs: 0, currentPs: 10, maxPs: 20 },
        initialValue: "X",
      }),
      id: "q2",
    };
    const resolved = resolveSequentialSignals([clock, q1, q2], 200);
    expect(Object.keys(resolved.errors).length).toBeGreaterThan(0);
  });

  it("uses a derived Q edge as a legacy delay source", () => {
    const q = output({
      device: "latch",
      clockSignalId: "clk",
      dataSignalId: "d",
      trigger: "high",
      c2q: { minPs: 4, currentPs: 8, maxPs: 12 },
      d2q: { minPs: 2, currentPs: 6, maxPs: 10 },
      initialValue: "X",
    });
    const target = { ...data, id: "target", name: "TARGET" };
    const resolved = resolveProjectTiming([clock, data, q, target], 240, [
      {
        id: "q-delay",
        sourceSignalId: "q",
        targetSignalId: "target",
        sourceEdge: 1,
        targetEdge: 1,
        minPs: 20,
        currentPs: 30,
        maxPs: 40,
      },
    ]);
    expect(resolved.delayById["q-delay"]).toMatchObject({
      sourceTimePs: 8,
      targetBaseTimePs: 25,
      targetTimePs: 38,
      targetShiftPs: 13,
    });
  });

  it("lets a delayed clock drive a derived DFF", () => {
    const q = output({
      device: "dff",
      clockSignalId: "clk",
      dataSignalId: "d",
      trigger: "rising",
      c2q: { minPs: 5, currentPs: 10, maxPs: 15 },
      initialValue: "X",
    });
    const signals: Signal[] = [clock, data, q];
    const resolved = resolveProjectTiming(signals, 240, [
      {
        id: "clock-delay",
        sourceSignalId: "d",
        targetSignalId: "clk",
        sourceEdge: 1,
        targetEdge: 1,
        minPs: 5,
        currentPs: 10,
        maxPs: 15,
      },
    ]);
    expect(resolved.signalShiftsPs.clk).toBe(35);
    expect(resolved.bySignalId.q.events[0]).toMatchObject({
      causeTimePs: 35,
      timePs: 45,
      value: "1",
    });
  });

  it("resolves setup/hold windows from derived signal edges", () => {
    const q = output({
      device: "latch",
      clockSignalId: "clk",
      dataSignalId: "d",
      trigger: "high",
      c2q: { minPs: 4, currentPs: 8, maxPs: 12 },
      d2q: { minPs: 2, currentPs: 6, maxPs: 10 },
      initialValue: "X",
    });
    const signals: Signal[] = [clock, data, q];
    const timing = resolveProjectTiming(signals, 240);
    const constraint = resolveTimingConstraint(
      signals,
      240,
      {
        id: "q-constraint",
        sourceSignalId: "q",
        targetSignalId: "d",
        sourceEdge: 1,
        targetEdge: 1,
        sourceEdgeKind: "transition",
        targetEdgeKind: "transition",
        sourceEdges: [1],
        targetEdges: [1],
        setupPs: 20,
        holdPs: 20,
      },
      {},
      (signal, polarity) => timing.edgeTimes(signal.id, polarity),
    );
    expect(constraint?.windows[0]).toMatchObject({
      sourceTimePs: 8,
      startTimePs: -12,
      endTimePs: 28,
      isViolated: true,
    });
  });

  it("detects a cycle spanning a delay link and a derivation", () => {
    const q = output({
      device: "dff",
      clockSignalId: "clk",
      dataSignalId: "d",
      trigger: "rising",
      c2q: { minPs: 0, currentPs: 10, maxPs: 20 },
      initialValue: "X",
    });
    const resolved = resolveProjectTiming([clock, data, q], 240, [
      {
        id: "cycle-delay",
        sourceSignalId: "q",
        targetSignalId: "d",
        sourceEdge: 1,
        targetEdge: 1,
        minPs: 0,
        currentPs: 10,
        maxPs: 20,
      },
    ]);
    expect(Object.values(resolved.errors)).toContain("Timing dependency cycle");
  });
});
