import { describe, expect, it } from "vitest";
import { applyBusPatterns, busChannels, busSlotLabel, createBus, createBusChannels, fitBusSlotLabel, generateBusPattern, parseBusSelection, parseBusTable, resizeBus, updateBusDefaults } from "./bus";
import type { TimingProject } from "./timing";
import { resolveProjectTiming } from "./sequential";
import { buildBusSummarySegments } from "../features/canvas/canvasGeometry";

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
