import { describe, expect, it } from "vitest";
import {
  buildPeriodGrid,
  clockEdges,
  colorForDataToken,
  dataEdges,
  degreesToPs,
  expandDataPatternSegments,
  frequencyToPeriodPs,
  normalizeDataPattern,
  periodPsToFrequency,
  resolveDelayLinks,
  resolveEdgeDelay,
  resolveLinkedTiming,
  resolveTimingConstraint,
  signalEdges,
  signalEdgesByPolarity,
  type ClockSignal,
  type DataSignal,
} from "./timing";

const clock: ClockSignal = {
  id: "clk",
  kind: "clock",
  name: "CLK",
  startPs: 0,
  periodPs: 1000,
  phasePs: 0,
  dutyCycle: 0.5,
  visible: true,
  color: "#8b7cff",
};

const data: DataSignal = {
  id: "data",
  kind: "data",
  name: "DATA",
  startPs: 0,
  periodPs: 800,
  pattern: ["D0", "D0", "D1", "D1", "D0", "D2"],
  visible: true,
  color: "#35d6b4",
};

describe("timing engine", () => {
  it("converts phase degrees into picoseconds", () => {
    expect(degreesToPs(-90, 1000)).toBe(-250);
  });

  it("round-trips period and frequency", () => {
    expect(frequencyToPeriodPs(1, "GHz")).toBe(1000);
    expect(periodPsToFrequency(1000, "GHz")).toBe(1);
    expect(periodPsToFrequency(1000, "MHz")).toBe(1000);
  });

  it("builds a period-aligned grid with quarter-period subdivisions", () => {
    const grid = buildPeriodGrid(4000, 1000, 800);
    expect(grid.map((mark) => mark.timePs)).toEqual([
      0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500,
      2750, 3000, 3250, 3500, 3750, 4000,
    ]);
    expect(grid.filter((mark) => mark.isMajor).map((mark) => mark.timePs)).toEqual([
      0, 1000, 2000, 3000, 4000,
    ]);
  });

  it("reduces period labels when periods are too dense", () => {
    const grid = buildPeriodGrid(6000, 62.5, 1120);
    const labeled = grid.filter((mark) => mark.showLabel);
    expect(labeled.length).toBeLessThan(20);
    expect(labeled[0]?.timePs).toBe(0);
  });

  it("normalizes symbolic data input", () => {
    expect(normalizeDataPattern("d0, d1 D2 invalid!")).toEqual([
      "D0",
      "D1",
      "D2",
      "INVALID",
    ]);
  });

  it("expands ordered mixed data pattern segments", () => {
    expect(
      expandDataPatternSegments([
        {
          id: "range",
          kind: "range",
          prefix: "D",
          from: 0,
          to: 4,
          step: 2,
          repeat: 2,
        },
        {
          id: "logic",
          kind: "logic",
          values: "01XZ",
          repeat: 1,
        },
        {
          id: "symbols",
          kind: "symbols",
          values: "idle read",
          repeat: 1,
        },
      ]),
    ).toEqual([
      "D0",
      "D0",
      "D2",
      "D2",
      "D4",
      "D4",
      "0",
      "1",
      "X",
      "Z",
      "IDLE",
      "READ",
    ]);
  });

  it("assigns the same color to the same data token", () => {
    expect(colorForDataToken("D0")).toBe(colorForDataToken("d0"));
    expect(colorForDataToken("D0")).not.toBe(colorForDataToken("D1"));
  });

  it("generates clock sampling edges", () => {
    expect(clockEdges(clock, 3000)).toEqual([0, 1000, 2000, 3000]);
  });

  it("numbers every clock edge chronologically for delay links", () => {
    expect(signalEdges(clock, 2200)).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it("emits symbolic data transitions only when the value changes", () => {
    expect(dataEdges(data, 4000)).toEqual([1600, 3200, 4000]);
  });

  it("resolves a current edge from a source edge and bounded delay", () => {
    const resolved = resolveEdgeDelay([clock, { ...clock, id: "capture" }], 4000, {
      sourceSignalId: "clk",
      targetSignalId: "capture",
      sourceEdge: 2,
      targetEdge: 2,
      minPs: 80,
      currentPs: 140,
      maxPs: 220,
    });

    expect(resolved).toEqual({
      sourceTimePs: 500,
      targetBaseTimePs: 500,
      targetTimePs: 640,
      minTimePs: 580,
      maxTimePs: 720,
      targetShiftPs: 140,
    });
  });

  it("allows a data transition to drive a clock start offset", () => {
    const resolved = resolveEdgeDelay([clock, data], 4000, {
      sourceSignalId: "data",
      targetSignalId: "clk",
      sourceEdge: 1,
      targetEdge: 2,
      minPs: 100,
      currentPs: 200,
      maxPs: 300,
    });

    expect(resolved?.sourceTimePs).toBe(1600);
    expect(resolved?.targetTimePs).toBe(1800);
    expect(resolved?.targetShiftPs).toBe(1300);
  });

  it("propagates an upstream whole-signal shift into the next delay", () => {
    const capture = { ...clock, id: "capture" };
    const resolved = resolveLinkedTiming([clock, capture, data], 4000, {
      id: "linked",
      clock: {
        sourceSignalId: "clk",
        targetSignalId: "capture",
        sourceEdge: 2,
        targetEdge: 2,
        minPs: 80,
        currentPs: 140,
        maxPs: 220,
      },
      data: {
        sourceSignalId: "capture",
        targetSignalId: "data",
        sourceEdge: 2,
        targetEdge: 1,
        minPs: 100,
        currentPs: 200,
        maxPs: 300,
      },
      setupPs: 100,
      holdPs: 100,
    });

    expect(resolved.signalShiftsPs.capture).toBe(140);
    expect(resolved.data?.sourceTimePs).toBe(640);
    expect(resolved.data?.targetTimePs).toBe(840);
    expect(resolved.signalShiftsPs.data).toBe(-760);
  });

  it("resolves independent per-signal delay relationships", () => {
    const capture = { ...clock, id: "capture" };
    const resolved = resolveDelayLinks([clock, capture, data], 4000, [
      {
        id: "capture-delay",
        sourceSignalId: "clk",
        targetSignalId: "capture",
        sourceEdge: 2,
        targetEdge: 2,
        minPs: 100,
        currentPs: 150,
        maxPs: 200,
      },
      {
        id: "data-delay",
        sourceSignalId: "capture",
        targetSignalId: "data",
        sourceEdge: 2,
        targetEdge: 1,
        minPs: 100,
        currentPs: 250,
        maxPs: 300,
      },
    ]);

    expect(resolved.byId["capture-delay"].targetShiftPs).toBe(150);
    expect(resolved.byId["data-delay"].sourceTimePs).toBe(650);
    expect(resolved.byId["data-delay"].targetTimePs).toBe(900);
  });

  it("flags a constrained edge inside its setup and hold window", () => {
    const resolved = resolveTimingConstraint([clock, data], 4000, {
      id: "constraint",
      sourceSignalId: "clk",
      targetSignalId: "data",
      sourceEdge: 3,
      targetEdge: 1,
      setupPs: 450,
      holdPs: 100,
    });

    expect(resolved).toEqual({
      targetTimesPs: [1600],
      windows: [
        {
          sourceTimePs: 2000,
          startTimePs: 1550,
          endTimePs: 2100,
          isViolated: true,
          violatingTargetTimesPs: [1600],
        },
      ],
    });
  });

  it("enumerates clock rising, falling, and both edge polarities", () => {
    expect(signalEdgesByPolarity(clock, 2200, "rising")).toEqual([
      0, 1000, 2000,
    ]);
    expect(signalEdgesByPolarity(clock, 2200, "falling")).toEqual([
      500, 1500,
    ]);
    expect(signalEdgesByPolarity(clock, 2200, "both")).toEqual([
      0, 500, 1000, 1500, 2000,
    ]);
  });

  it("creates one window per selected source edge and checks many target edges", () => {
    const logicData: DataSignal = {
      ...data,
      id: "logic-data",
      periodPs: 500,
      pattern: ["0", "1", "1", "0"],
    };
    const resolved = resolveTimingConstraint([clock, logicData], 3000, {
      id: "multi-edge",
      sourceSignalId: "clk",
      targetSignalId: "logic-data",
      sourceEdge: 1,
      targetEdge: 1,
      sourceEdgeKind: "falling",
      targetEdgeKind: "rising",
      sourceEdges: [1, 2],
      targetEdges: [],
      setupPs: 100,
      holdPs: 100,
    });

    expect(resolved?.targetTimesPs).toEqual([500, 2500]);
    expect(resolved?.windows).toEqual([
      {
        sourceTimePs: 500,
        startTimePs: 400,
        endTimePs: 600,
        isViolated: true,
        violatingTargetTimesPs: [500],
      },
      {
        sourceTimePs: 1500,
        startTimePs: 1400,
        endTimePs: 1600,
        isViolated: false,
        violatingTargetTimesPs: [],
      },
    ]);
  });
});
