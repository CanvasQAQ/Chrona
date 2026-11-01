import { describe, expect, it } from "vitest";
import { applyBusPatterns, busChannels, busSlotLabel, createBus, createBusChannels, fitBusSlotLabel, generateBusPattern, parseBusSelection, parseBusTable, resizeBus, updateBusDefaults } from "./bus";
import { resolveConstraintRows, type TimingProject } from "./timing";
import { resolveProjectTiming } from "./sequential";
import { buildBusSummarySegments, busMixedWindows } from "../features/canvas/canvasGeometry";

const projectWithBus = (): TimingProject => {
  const bus = createBus("DATA", 40, 10, 1000);
  return { version: 3, name: "Bus", durationPs: 6000, constraintDraft: { setupPs: 10, holdPs: 10, status: "awaiting-definition" },
    buses: [bus], signals: createBusChannels(bus, "#123456"), delayLinks: [], timingConstraints: [] };
};

describe("Bus data", () => {
  it("generates channel and time steps as abstract item labels", () => {
    const project = projectWithBus();
    expect(busChannels(project, project.buses![0].id)[0].pattern).toEqual(["D0", "D40", "D80"]);
    expect(busChannels(project, project.buses![0].id)[1].pattern).toEqual(["D1", "D41", "D81"]);
    expect(project.buses![0].displayMode).toBe("all");
    expect(buildBusSummarySegments(busChannels(project, project.buses![0].id), 3010).map((segment) => segment.token))
      .toEqual(["D0–D39", "D40–D79", "D80–D119"]);
    expect(generateBusPattern({ prefix: "P", start: 7, channelStep: 2, timeStep: 20, length: 2 }, 3)).toEqual(["P13", "P33"]);
  });

  it("marks a folded Bus violated when only its hidden channel changes inside the window", () => {
    const bus = createBus("DATA", 2);
    bus.displayMode = "collapsed";
    const lanes = createBusChannels(bus, "#123456");
    lanes[0].busOffsetPs = -100;
    lanes[1].busOffsetPs = 10;
    lanes[1].visible = false;
    const project: TimingProject = { ...projectWithBus(), buses: [bus], signals: [
      { kind: "clock", id: "clk", name: "CLK", visible: true, color: "#123456", startPs: 0,
        periodPs: 1000, phasePs: 0, dutyCycle: 0.5 }, ...lanes,
    ] };
    const timing = resolveProjectTiming(project.signals, project.durationPs);
    const rows = resolveConstraintRows(project, { id: "rule", sourceSignalId: "clk", targetSignalId: bus.id,
      sourceEdge: 2, targetEdge: 1, targetEdges: [], setupPs: 20, holdPs: 20,
    }, (signal, polarity) => timing.edgeTimes(signal.id, polarity));
    expect(rows.map(row => [row.constraint.targetSignalId, row.resolved.windows[0].isViolated]))
      .toEqual([[lanes[0].id, false], [lanes[1].id, true], [bus.id, true]]);
  });

  it("marks a mixed-word sample yellow when every lane satisfies setup and hold", () => {
    const bus = createBus("DATA", 2);
    const lanes = createBusChannels(bus, "#123456");
    lanes[0].busOffsetPs = -140;
    lanes[1].busOffsetPs = 180;
    const project: TimingProject = { ...projectWithBus(), buses: [bus], signals: [
      { kind: "clock", id: "clk", name: "CLK", visible: true, color: "#123456", startPs: 0,
        periodPs: 1000, phasePs: 0, dutyCycle: 0.5 }, ...lanes,
    ] };
    const timing = resolveProjectTiming(project.signals, project.durationPs);
    const rows = resolveConstraintRows(project, { id: "rule", sourceSignalId: "clk", targetSignalId: bus.id,
      sourceEdge: 2, targetEdge: 1, targetEdges: [], setupPs: 10, holdPs: 10,
    }, (signal, polarity) => timing.edgeTimes(signal.id, polarity), timing.signalShiftsPs);
    const summary = rows.at(-1)!.resolved.windows[0];
    expect(summary.isViolated).toBe(false);
    expect(summary.isMixed).toBe(true);
  });

  it("clips possible windows, including changes just beyond the project end", () => {
    const channels = createBusChannels(createBus("B", 2), "#123456");
    expect(busMixedWindows(channels, 1975, {}, 50, 20)).toEqual([
      { startPs: 0, endPs: 20, possible: true },
      { startPs: 950, endPs: 1020, possible: true },
      { startPs: 1950, endPs: 1975, possible: true },
    ]);
  });

  it("uses fixed offsets in both mixed windows and constraint edge lookup", () => {
    const channels = createBusChannels(createBus("B", 2), "#123456");
    channels[0].busOffsetPs = -30;
    channels[1].busOffsetPs = 10;
    channels[1].visible = false;
    const timing = resolveProjectTiming(channels, 1500);
    expect(timing.edgeTimes(channels[0].id)).toEqual([970]);
    expect(timing.edgeTimes(channels[1].id)).toEqual([1010]);
    expect(busMixedWindows(channels, 1500, timing.signalShiftsPs, 200, 300)).toEqual([
      { startPs: 0, endPs: 10, possible: false },
      { startPs: 970, endPs: 1010, possible: false },
    ]);
    delete channels[0].busOffsetPs;
    expect(busMixedWindows(channels, 1500, resolveProjectTiming(channels, 1500).signalShiftsPs, 200, 300)[1])
      .toEqual({ startPs: 800, endPs: 1300, possible: true });
  });

  it("uses a neutral label for irregular data and reflects local timing changes", () => {
    expect(busSlotLabel(["A0", "B1", "A2"])).toBe("3 data items");
    expect(busSlotLabel(["D0", null, "D2"])).toBe("2/3 data items");
    const bus = createBus("DATA", 2, 0, 1000);
    const [first, second] = createBusChannels(bus, "#123456");
    second.pattern = ["CUSTOM", "NEXT"];
    second.startPs = 500;
    second.periodPs = 500;
    const segments = buildBusSummarySegments([first, second], 1500, { [first.id]: 100 });
    expect(segments.map(({ startPs, endPs, token }) => [startPs, endPs, token])).toEqual([
      [100, 500, "1/2 data items"],
      [500, 1000, "2 data items"],
      [1000, 1100, "2 data items"],
      [1100, 1500, "2 data items"],
    ]);
    expect(segments[1].detail).toContain("〈1〉 CUSTOM");
  });

  it("fits irregular Bus labels with both ends visible and expands to the full list", () => {
    const tokens = ["D0", "D2", "D4", "D6", "D8", "D10", "D12", "D14"];
    const measure = (label: string) => label.length * 6;
    expect(fitBusSlotLabel(tokens, 1000, measure)).toBe(tokens.join(", "));
    const fitted = fitBusSlotLabel(tokens, 130, measure);
    expect(fitted).toContain("D0, D2");
    expect(fitted).toContain("D12, D14");
    expect(fitted).toContain("…");
    expect(measure(fitted)).toBeLessThanOrEqual(130);
    expect(fitBusSlotLabel(["D0", "D1", "D2"], 130, measure)).toBe("D0–D2");
    expect(fitBusSlotLabel(["D0", null, "D2"], 130, measure)).toBe("2/3 · D0, D2");
  });

  it("updates inherited parameters and preserves each local override", () => {
    let project = projectWithBus();
    const busId = project.buses![0].id;
    const first = busChannels(project, busId)[0];
    project = { ...project, signals: project.signals.map((signal) => signal.id === first.id ? { ...signal, startPs: 99, periodPs: 500, pattern: ["LOCAL"], busOverrides: { startPs: true, periodPs: true, pattern: true } } : signal) };
    project = updateBusDefaults(project, busId, { startPs: 20, periodPs: 2000, rule: { prefix: "X", start: 0, channelStep: 1, timeStep: 40, length: 2 } });
    expect(busChannels(project, busId)[0]).toMatchObject({ startPs: 99, periodPs: 500, pattern: ["LOCAL"] });
    expect(busChannels(project, busId)[1]).toMatchObject({ startPs: 20, periodPs: 2000, pattern: ["X1", "X41"] });
    project = applyBusPatterns(project, busId, [["NEW"]], [0], false, false);
    expect(busChannels(project, busId)[0].pattern).toEqual(["LOCAL"]);
    project = applyBusPatterns(project, busId, [["NEW"]], [0], true, false);
    expect(busChannels(project, busId)[0].pattern).toEqual(["NEW"]);
  });

  it("restores the last user-chosen expansion after folding", () => {
    let project = projectWithBus();
    const id = project.buses![0].id;
    project = updateBusDefaults(project, id, { displayMode: "selected", selectedChannels: [0, 39] });
    project = updateBusDefaults(project, id, { displayMode: "collapsed" });
    expect(project.buses![0]).toMatchObject({ displayMode: "collapsed", expandedMode: "selected", selectedChannels: [0, 39] });
  });

  it("resizes while preserving retained IDs and cleaning removed Timing references", () => {
    let project = projectWithBus();
    const busId = project.buses![0].id;
    const channels = busChannels(project, busId);
    project = { ...project, delayLinks: [{ id: "delay", sourceSignalId: channels[39].id, targetSignalId: channels[0].id, sourceEdge: 1, targetEdge: 1, minPs: 0, currentPs: 10, maxPs: 20 }],
      timingConstraints: [{ id: "setup", sourceSignalId: channels[0].id, targetSignalId: channels[39].id, sourceEdge: 1, targetEdge: 1, setupPs: 10, holdPs: 10 }] };
    project = resizeBus(project, busId, 20, "#123456");
    expect(busChannels(project, busId)).toHaveLength(20);
    expect(busChannels(project, busId)[0].id).toBe(channels[0].id);
    expect(project.delayLinks).toEqual([]);
    expect(project.timingConstraints).toEqual([]);
    project = resizeBus(project, busId, 21, "#123456");
    expect(busChannels(project, busId)[20].pattern).toEqual(["D20", "D60", "D100"]);
  });

  it("parses channel ranges and rejects bad tables before applying", () => {
    expect(parseBusSelection("0–3, 38-39", 40)).toEqual([0, 1, 2, 3, 38, 39]);
    expect(() => parseBusSelection("38-40", 40)).toThrow("within 0–39");
    expect(parseBusTable("D0\tD40\nD1\tD41\n", 2)).toEqual([["D0", "D40"], ["D1", "D41"]]);
    expect(() => parseBusTable("D0\t\nD1\tD41", 2)).toThrow("Row 1, column 2");
    expect(() => parseBusTable("D0\tD40\nD1", 2)).toThrow("Row 2, column 2");
  });

  it("keeps child Delay calculations when Bus is folded or hidden", () => {
    const project = projectWithBus();
    const [source, target] = busChannels(project, project.buses![0].id);
    const links = [{ id: "child-delay", sourceSignalId: source.id, targetSignalId: target.id,
      sourceEdge: 1, targetEdge: 1, minPs: 0, currentPs: 50, maxPs: 100 }];
    const before = resolveProjectTiming(project.signals, project.durationPs, links);
    const folded = { ...project.buses![0], visible: false, displayMode: "collapsed" as const };
    const after = resolveProjectTiming({ ...project, buses: [folded] }.signals, project.durationPs, links);
    expect(after.edgeTimes(target.id)).toEqual(before.edgeTimes(target.id));
    expect(after.signalShiftsPs[target.id]).toEqual(before.signalShiftsPs[target.id]);
  });
});
