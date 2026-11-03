import { describe, expect, it } from "vitest";
import { createBus, createBusChannels } from "./bus";
import { createDerivedBus, derivedBusMixedWindows } from "./derivedBus";
import { resolveProjectTiming } from "./sequential";
import { buildBusSummarySegments } from "../features/canvas/canvasGeometry";
import type { TimingProject } from "./timing";

describe("derived Bus", () => {
  const makeProject = (): TimingProject => {
    const source = createBus("D<3:2>", 2, 0, 1000);
    const channels = createBusChannels(source, "#123456");
    channels[0].pattern = ["A", "B"];
    channels[1].pattern = ["C", "D"];
    return { version: 3, name: "Derived", durationPs: 3000, buses: [source],
      signals: [{ id: "clk", name: "CLK", kind: "clock", color: "#123456", visible: true,
        startPs: 0, periodPs: 1000, phasePs: 0, dutyCycle: 0.5 }, ...channels],
      constraintDraft: { setupPs: 10, holdPs: 10, status: "awaiting-definition" } };
  };

  it("maps each input channel to its own Q and summarizes resolved output events", () => {
    const project = makeProject();
    const { bus, channels } = createDerivedBus(project, { name: "Q", sourceBusId: project.buses![0].id,
      clockSignalId: "clk", device: "dff", trigger: "falling", initialValue: "X",
      c2q: { minPs: 10, currentPs: 20, maxPs: 30 } }, "#654321");
    expect(channels.map(channel => [channel.name, channel.derivation?.dataSignalId]))
      .toEqual([["Q〈3〉", project.signals[1].id], ["Q〈2〉", project.signals[2].id]]);
    const timing = resolveProjectTiming([...project.signals, ...channels], project.durationPs);
    const summary = buildBusSummarySegments(channels, project.durationPs, timing.signalShiftsPs, timing.bySignalId);
    expect(summary[0]).toMatchObject({ startPs: 0, token: "X" });
    expect(summary.some(segment => segment.tokens[0] === "A" && segment.tokens[1] === "C")).toBe(true);
    expect(bus.width).toBe(2);
    expect(derivedBusMixedWindows(channels, timing.bySignalId, project.durationPs)).toContainEqual({
      startPs: 510, endPs: 530, possible: true,
    });
  });

  it("rejects an output range with a different width", () => {
    const project = makeProject();
    expect(() => createDerivedBus(project, { name: "Q<7:0>", sourceBusId: project.buses![0].id,
      clockSignalId: "clk", device: "dff", trigger: "rising", initialValue: "X",
      c2q: { minPs: 0, currentPs: 10, maxPs: 20 } }, "#654321")).toThrow("width");
  });

  it("keeps only the late input lane unknown on the first sampled word", () => {
    const project = makeProject();
    const late = project.signals[2];
    if (late.kind !== "data") throw new Error("Expected input channel");
    late.busOffsetPs = 501;
    const { bus, channels } = createDerivedBus(project, { name: "Q", sourceBusId: project.buses![0].id,
      clockSignalId: "clk", device: "dff", trigger: "falling", initialValue: "X",
      c2q: { minPs: 10, currentPs: 20, maxPs: 30 } }, "#654321");
    const timing = resolveProjectTiming([...project.signals, ...channels], project.durationPs, [], [...project.buses!, bus]);
    const summary = buildBusSummarySegments(channels, project.durationPs, timing.signalShiftsPs, timing.bySignalId);
    expect(summary.slice(0, 3).map(({ startPs, tokens }) => [startPs, tokens])).toEqual([
      [0, ["X", "X"]], [520, ["A", "X"]], [1520, ["B", "C"]],
    ]);
  });

  it("keeps the current DFF value and records a warning for mixed-input sampling", () => {
    const project = makeProject();
    const { channels } = createDerivedBus(project, { name: "Q", sourceBusId: project.buses![0].id,
      clockSignalId: "clk", device: "dff", trigger: "falling", initialValue: "X",
      c2q: { minPs: 10, currentPs: 20, maxPs: 30 } }, "#654321");
    const signals = [...project.signals, ...channels];
    const baseline = resolveProjectTiming(signals, project.durationPs, [], project.buses).bySignalId[channels[0].id];
    expect(baseline.events[0].value).toBe("A");
    expect(baseline.uncertainSamples).toBeUndefined();
    const buses = [{ ...project.buses![0], earlyPs: 600 }];
    const uncertain = resolveProjectTiming(signals, project.durationPs, [], buses).bySignalId[channels[0].id];
    expect(uncertain.events[0].value).toBe("A");
    expect(uncertain.uncertainSamples?.[0]).toEqual({ sampleTimePs: 500, outputTimePs: 520 });
  });
});
