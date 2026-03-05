import { describe, expect, it } from "vitest";

import { formatStepSummary, plannerSectionsToSegments } from "../src/domain/planner/transform";

describe("transform", () => {
  it("formats step summary with timing and badges", () => {
    const summary = formatStepSummary({
      step_id: "x",
      kind: "intervals",
      reps: 4,
      distance_per_rep_m: 100,
      stroke: "freestyle",
      effort: "medium",
      rest_seconds: 20,
      fins: true,
      description: "hold form",
    });

    expect(summary).toContain("4 x 100m freestyle medium");
    expect(summary).toContain("20s rest");
    expect(summary).toContain("[fins]");
  });

  it("converts planner sections to segments", () => {
    const segments = plannerSectionsToSegments([
      {
        title: "Warm Up",
        steps: [
          {
            step_id: "1",
            kind: "intervals",
            reps: 2,
            distance_per_rep_m: 100,
            stroke: "freestyle",
            effort: "easy",
            rest_seconds: 15,
            description: "easy",
          },
        ],
      },
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].distance_m).toBe(200);
  });
});
