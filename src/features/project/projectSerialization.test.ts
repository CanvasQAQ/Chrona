import { describe, expect, it } from "vitest";
import { parseTimingProject } from "./projectSerialization";

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
    expect(result.project.canvasSettings).toEqual(defaults.canvasSettings);
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
