import { describe, expect, it } from "vitest";
import { parseTimingProject } from "./projectSerialization";
import { createBus, createBusChannels } from "../../domain/bus";

const defaults = {
  durationPs: 6000,
  canvasSettings: {
    showVerticalGrid: true,
    gridMode: "auto" as const,
    gridIntervalPs: 250,
    trackHeight: 48,
  },
};

describe("project serialization", () => {
  it("normalizes a v3 project with missing optional collections", () => {
    const result = parseTimingProject(
      JSON.stringify({
        version: 3,
        name: "Example",
        durationPs: 1000,
        signals: [],
        constraintDraft: {
          setupPs: 10,
          holdPs: 10,
          status: "awaiting-definition",
        },
      }),
      defaults,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.delayLinks).toEqual([]);
    expect(result.project.timingConstraints).toEqual([]);
    expect(result.project.buses).toEqual([]);
    expect(result.project.canvasSettings).toEqual(defaults.canvasSettings);
  });

  it("round trips Bus display state and child overrides without migrating old Data", () => {
    const bus = { ...createBus("DATA", 2), displayMode: "selected" as const, selectedChannels: [1] };
    const channels = createBusChannels(bus, "#abcdef");
    channels[1].busOverrides = { periodPs: true, pattern: true };
    channels[1].periodPs = 500;
    channels[1].pattern = ["CUSTOM"];
    const result = parseTimingProject(JSON.stringify({ version: 3, name: "Example", durationPs: 1000,
      signals: [{ id: "old", kind: "data", name: "Old Data", startPs: 0, periodPs: 1000, pattern: ["D0"], visible: true, color: "#fff" }, ...channels],
      buses: [bus], constraintDraft: { setupPs: 10, holdPs: 10, status: "awaiting-definition" } }), defaults);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.buses?.[0]).toMatchObject({ displayMode: "selected", selectedChannels: [1] });
    expect(result.project.signals[0]).not.toHaveProperty("busId");
    expect(result.project.signals[2]).toMatchObject({ periodPs: 500, pattern: ["CUSTOM"], busOverrides: { periodPs: true, pattern: true } });
  });

  it("rejects invalid JSON and unsupported schemas", () => {
    expect(parseTimingProject("not json", defaults)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      parseTimingProject(JSON.stringify({ version: 1, signals: [] }), defaults),
    ).toEqual({ ok: false, reason: "unsupported" });
  });
});
