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

  it("emits symbolic data transitions only when the value changes", () => {
    expect(dataEdges(data, 4000)).toEqual([1600, 3200, 4000]);
  });
});
