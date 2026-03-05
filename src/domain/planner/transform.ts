import type { PlanSegment } from "../contracts/plan-types";

type PlannerStep = {
  step_id: string;
  kind: string;
  reps: number;
  distance_per_rep_m: number;
  pyramid_sequence_m?: number[] | null;
  stroke: string;
  effort: "easy" | "medium" | "hard";
  rest_seconds: number | null;
  sendoff_seconds?: number | null;
  rest_sequence_s?: number[] | null;
  sendoff_sequence_s?: number[] | null;
  fins?: boolean | null;
  underwater?: boolean | null;
  pull?: boolean | null;
  paddles?: boolean | null;
  broken_pause_s?: number | null;
  target_time_s?: number | null;
  split_instruction?: string | null;
  description: string;
};

type PlannerSection = {
  title: string;
  steps: PlannerStep[];
};

const PYRAMID_KINDS = new Set(["pyramid", "descending", "ascending"]);

function segmentDistanceM(step: PlannerStep): number {
  if (PYRAMID_KINDS.has(step.kind) && step.pyramid_sequence_m?.length) {
    return step.pyramid_sequence_m.reduce((sum, d) => sum + d, 0);
  }
  return step.reps * step.distance_per_rep_m;
}

export function formatStepSummary(step: PlannerStep): string {
  let base: string;
  if (step.kind === "continuous") {
    base = `${segmentDistanceM(step)}m ${step.stroke} ${step.effort}`;
  } else if (PYRAMID_KINDS.has(step.kind) && step.pyramid_sequence_m?.length) {
    base = `${step.kind} [${step.pyramid_sequence_m.join("-")}]m ${step.stroke} ${step.effort}`;
  } else if (step.kind === "build") {
    base = `${step.distance_per_rep_m}m build ${step.stroke} ${step.effort}`;
  } else if (step.kind === "broken") {
    const pause = step.broken_pause_s != null ? `${step.broken_pause_s}s pause` : "pause";
    base =
      step.reps === 1
        ? `${step.distance_per_rep_m}m broken (${pause}) ${step.stroke} ${step.effort}`
        : `${step.reps} x ${step.distance_per_rep_m}m broken (${pause}) ${step.stroke} ${step.effort}`;
  } else if (step.kind === "fartlek") {
    base = `${step.distance_per_rep_m}m fartlek ${step.stroke} ${step.effort}`;
  } else if (step.kind === "time_trial") {
    const target =
      step.target_time_s != null
        ? ` (target ${Math.floor(step.target_time_s / 60)}:${String(step.target_time_s % 60).padStart(2, "0")})`
        : "";
    base = `${step.distance_per_rep_m}m time trial ${step.stroke}${target}`;
  } else if (step.kind === "negative_split") {
    base = `${step.distance_per_rep_m}m negative split ${step.stroke} ${step.effort}`;
  } else {
    base =
      step.reps === 1
        ? `${step.distance_per_rep_m}m ${step.stroke} ${step.effort}`
        : `${step.reps} x ${step.distance_per_rep_m}m ${step.stroke} ${step.effort}`;
  }

  let timing = "";
  if (step.reps > 1) {
    if (step.sendoff_sequence_s?.length) {
      const parts = step.sendoff_sequence_s.map((v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`);
      timing = ` @ [${parts.join("-")}]`;
    } else if (step.rest_sequence_s?.length) {
      timing = ` @ [${step.rest_sequence_s.join("-")}]s rest`;
    } else if (step.sendoff_seconds != null) {
      timing = ` @ ${Math.floor(step.sendoff_seconds / 60)}:${String(step.sendoff_seconds % 60).padStart(2, "0")}`;
    } else if (step.rest_seconds != null) {
      timing = ` @ ${step.rest_seconds}s rest`;
    }
  }

  const badges: string[] = [];
  if (step.pull) badges.push("pull");
  if (step.paddles) badges.push("paddles");
  if (step.fins) badges.push("fins");
  if (step.underwater) badges.push("underwater");
  const badgeStr = badges.length ? ` [${badges.join(", ")}]` : "";

  const desc = (step.description ?? "").trim();
  const split = (step.split_instruction ?? "").trim();
  const extra = split ? ` - ${split}` : "";
  return desc ? `${base}${timing}${badgeStr} - ${desc}${extra}` : `${base}${timing}${badgeStr}${extra}`;
}

export function plannerSectionsToSegments(sections: PlannerSection[]): PlanSegment[] {
  const segments: PlanSegment[] = [];
  for (const section of sections) {
    for (const step of section.steps) {
      segments.push({
        id: step.step_id,
        type: section.title,
        distance_m: segmentDistanceM(step),
        stroke: step.stroke,
        description: formatStepSummary(step),
        effort: step.effort,
        repeats: step.reps,
        rest_seconds: step.reps > 1 ? (step.rest_seconds ?? undefined) : undefined,
        sendoff_seconds: step.reps > 1 ? (step.sendoff_seconds ?? undefined) : undefined,
      });
    }
  }
  return segments;
}
