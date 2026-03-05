import type { SwimPlanInput, StepKind } from "../types";
import type { ArchetypeContract, BlueprintV2, SectionBlueprint } from "./types";

function sb(steps: number, ...allowed: ReadonlySet<StepKind>[]): SectionBlueprint {
  if (allowed.length !== steps) {
    throw new Error("allowed kinds must be provided for each step position");
  }
  return { steps, allowed_kinds_by_step: allowed };
}

function same(steps: number, allowed: ReadonlySet<StepKind>): ReadonlySet<StepKind>[] {
  return Array.from({ length: steps }, () => allowed);
}

function union<T>(...sets: ReadonlySet<T>[]): ReadonlySet<T> {
  const out = new Set<T>();
  for (const s of sets) for (const v of s) out.add(v);
  return out;
}

function intersect<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): ReadonlySet<T> {
  const out = new Set<T>();
  for (const v of a) if (b.has(v)) out.add(v);
  return out;
}

function pickKindsWithin(
  allowedByArchetype: ReadonlySet<StepKind>,
  desired: ReadonlySet<StepKind>,
): ReadonlySet<StepKind> {
  const x = intersect(allowedByArchetype, desired);
  return x.size > 0 ? x : allowedByArchetype; // never return empty; keep control.
}

/**
 * buildBlueprintV2
 * - Normal generation: stable and archetype-faithful.
 * - Regenerate: broaden step count and step-kind options so rerolls are visibly different.
 */
export function buildBlueprintV2(
  archetype: ArchetypeContract,
  payload: SwimPlanInput,
  opts?: { regenerate?: boolean; regenAttempt?: number },
): BlueprintV2 {
  const regenAttemptRaw = opts?.regenAttempt;
  const regenAttempt =
    typeof regenAttemptRaw === "number" && Number.isFinite(regenAttemptRaw)
      ? Math.max(0, Math.floor(regenAttemptRaw))
      : 0;

  const regenerate = Boolean(opts?.regenerate ?? regenAttempt > 0);
  const regenFlip = regenerate && regenAttempt % 2 === 1;
  const alt = <T,>(a: T, b: T): T => (regenFlip ? b : a);

  const effort = payload.session_requested.effort;
  const duration = payload.session_requested.duration_minutes;
  const level = payload.session_requested.swim_level;

  const requestedTags = new Set(
    [
      ...(payload.session_requested.requested_tags ?? []),
      ...(payload.requested_tags ?? []),
    ]
      .map((t) => (t ?? "").toString().trim().toLowerCase())
      .filter(Boolean),
  );

  const archetypeId = archetype.archetype_id;

  // ── Warm-up / cool-down ────────────────────────────────────────────────────
  // Normal: intentionally stable for readability.
  // Regenerate: allow a small amount of variation to avoid identical starts/finishes.
  // - Use regenAttempt parity so rerolls are stable-but-different without randomness.
  const warm =
    effort === "hard"
      ? (regenerate
          ? alt(
              sb(
                2,
                new Set<StepKind>(["continuous", "build"]), // still readable
                new Set<StepKind>(["intervals", "build"]), // activation can vary
              ),
              sb(
                2,
                new Set<StepKind>(["continuous", "intervals"]),
                new Set<StepKind>(["build", "intervals"]),
              ),
            )
          : sb(2, new Set<StepKind>(["continuous"]), new Set<StepKind>(["intervals"])))
      : (regenerate
          ? (duration >= 25
              ? alt(
                  sb(2, new Set<StepKind>(["continuous"]), new Set<StepKind>(["intervals", "build"])),
                  sb(2, new Set<StepKind>(["continuous", "build"]), new Set<StepKind>(["intervals"])),
                )
              : alt(
                  sb(1, new Set<StepKind>(["continuous"])),
                  sb(1, new Set<StepKind>(["continuous", "build"])),
                ))
          : sb(1, new Set<StepKind>(["continuous"])));

  const cool =
    regenerate && duration >= 25 && effort !== "hard"
      ? alt(
          sb(2, new Set<StepKind>(["continuous"]), new Set<StepKind>(["continuous", "build"])),
          sb(2, new Set<StepKind>(["continuous", "build"]), new Set<StepKind>(["continuous"])),
        )
      : sb(1, new Set<StepKind>(["continuous"]));

  // ── Main set ───────────────────────────────────────────────────────────────
  // Regenerate strategy:
  // - loosen step count (within safe bounds)
  // - allow more kind variety per step position (especially step 1)
  // - keep everything inside archetype.allowed_main_kinds unless explicitly constrained
  let main: SectionBlueprint;

  // Helper: step-1 “opener” variety that still stays in the archetype’s kind set.
  const openerDesired = alt(
    new Set<StepKind>(["intervals", "build", "ascending", "descending", "pyramid", "fartlek"]),
    new Set<StepKind>(["intervals", "continuous", "build", "negative_split", "broken", "time_trial"]),
  );
  const openerKinds = pickKindsWithin(archetype.allowed_main_kinds, openerDesired);

  // Helper: a “reset” step variety (often continuous/build) inside allowed kinds.
  const resetDesired = alt(
    new Set<StepKind>(["continuous", "build", "intervals"]),
    new Set<StepKind>(["continuous", "build", "negative_split", "broken"]),
  );
  const resetKinds = pickKindsWithin(archetype.allowed_main_kinds, resetDesired);

  if (archetypeId === "flow_reset") {
    // Normal: 1 (or sometimes 2).
    // Regenerate: allow 1–2 even more often; allow opener variation but keep it calm.
    const mainSteps =
      regenerate
        ? (alt(duration >= 25, duration >= 30) ? 2 : 1)
        : (effort === "hard" && duration >= 25 ? 2 : 1);

    const calmDesired = alt(
      new Set<StepKind>(["continuous", "intervals", "build", "fartlek"]),
      new Set<StepKind>(["continuous", "build", "intervals"]),
    );
    const calmKinds = pickKindsWithin(archetype.allowed_main_kinds, calmDesired);

    main =
      mainSteps === 1
        ? sb(1, calmKinds)
        : sb(2, calmKinds, calmKinds);
  }

  else if (archetypeId === "cruise_builder") {
    // Normal: 2 (or 3 if long).
    // Regenerate: allow 2–3 more flexibly, and vary opener.
    const mainSteps =
      regenerate
        ? (alt(duration >= 30, duration >= 35) ? 3 : 2)
        : (duration >= 35 ? 3 : 2);

    const cruiseDesired = alt(
      new Set<StepKind>(["intervals", "build", "negative_split", "continuous"]),
      new Set<StepKind>(["negative_split", "intervals", "continuous", "build"]),
    );
    const cruiseKinds = pickKindsWithin(archetype.allowed_main_kinds, cruiseDesired);

    main =
      mainSteps === 2
        ? sb(2, openerKinds, cruiseKinds)
        : sb(3, openerKinds, cruiseKinds, cruiseKinds);
  }

  else if (archetypeId === "playful_alternator") {
    // This archetype gets very samey if it always becomes 1 step for short sessions.
    // Regenerate: bias towards 2 steps whenever possible.
    const mainSteps =
      regenerate
        ? (alt(duration >= 20, duration >= 25) ? 2 : 1)
        : (duration >= 30 ? 2 : 1);

    if (mainSteps === 1) {
      main = alt(
        sb(1, new Set<StepKind>(["intervals"])),
        sb(1, new Set<StepKind>(["intervals", "continuous"])),
      );
    } else {
      // Let the "reset" vary: continuous OR a light build OR short intervals.
      const reset = alt(
        new Set<StepKind>(["continuous", "build", "intervals"]),
        new Set<StepKind>(["continuous", "intervals"]),
      );
      main = sb(2, new Set<StepKind>(["intervals"]), reset);
    }
  }

  else if (archetypeId === "mini_block_roulette") {
    // Normal: 3–4 blocks.
    // Regenerate: allow 3–5 blocks (bounded), and vary step positions more.
    let mainSteps = duration >= 35 ? 4 : 3;
    if (level === "beginner") mainSteps = 3;

    if (regenerate) {
      if (alt(duration >= 40, duration >= 45) && level !== "beginner") mainSteps = 5;
      else if (duration >= 30) mainSteps = Math.max(3, mainSteps); // keep 3–5 window
    }

    const rouletteDesired = alt(
      new Set<StepKind>(["intervals", "build", "continuous", "fartlek", "broken"]),
      new Set<StepKind>(["broken", "intervals", "build", "fartlek", "continuous"]),
    );
    const rouletteKinds = pickKindsWithin(archetype.allowed_main_kinds, rouletteDesired);

    // Regenerate: make step 1 more variable; make last step more likely a “reset”.
    if (!regenerate) {
      main = sb(mainSteps, ...same(mainSteps, archetype.allowed_main_kinds));
    } else {
      const allowedByPos: ReadonlySet<StepKind>[] = [];
      for (let i = 0; i < mainSteps; i++) {
        if (i === 0) allowedByPos.push(openerKinds);
        else if (i === mainSteps - 1) allowedByPos.push(resetKinds);
        else allowedByPos.push(rouletteKinds);
      }
      main = sb(mainSteps, ...allowedByPos);
    }
  }

  else if (archetypeId === "stroke_switch_ladder") {
    // Normal: 1–2 steps.
    // Regenerate: allow a second step more often, and broaden ladder kinds.
    const mainSteps =
      regenerate
        ? (alt(duration >= 25, duration >= 30) ? 2 : 1)
        : (duration >= 35 ? 2 : 1);

    const ladderDesired = alt(
      new Set<StepKind>(["pyramid", "ascending", "descending", "intervals"]),
      new Set<StepKind>(["ascending", "descending", "pyramid", "intervals"]),
    );
    const ladderKinds = pickKindsWithin(archetype.allowed_main_kinds, ladderDesired);

    main =
      mainSteps === 1
        ? sb(1, ladderKinds)
        : sb(2, ladderKinds, resetKinds);
  }

  else if (archetypeId === "punchy_pops") {
    // Normal: 1–2.
    // Regenerate: encourage 2 steps more often (except beginner), and allow opener variety.
    let mainSteps = duration >= 30 ? 2 : 1;
    if (level === "beginner") mainSteps = 1;

    if (regenerate && level !== "beginner" && alt(duration >= 20, duration >= 25)) mainSteps = 2;

    const punchyDesired = alt(
      new Set<StepKind>(["intervals", "build", "broken"]),
      new Set<StepKind>(["broken", "intervals", "build"]),
    );
    const punchyKinds = pickKindsWithin(archetype.allowed_main_kinds, punchyDesired);

    main =
      mainSteps === 1
        ? sb(1, punchyKinds)
        : sb(2, punchyKinds, punchyKinds);
  }

  else if (archetypeId === "gear_change_up") {
    // Normal: fixed 2 steps.
    // Regenerate: still 2 steps, but widen kind options by position.
    const gearDesired = alt(
      new Set<StepKind>(["intervals", "build", "continuous"]),
      new Set<StepKind>(["build", "continuous", "intervals"]),
    );
    const gearKinds = pickKindsWithin(archetype.allowed_main_kinds, gearDesired);

    main = regenerate
      ? sb(2, openerKinds, gearKinds)
      : sb(2, ...same(2, archetype.allowed_main_kinds));
  }

  else if (archetypeId === "technique_refresh") {
    // Normal: 2–3.
    // Regenerate: allow 2–4 (bounded) to reduce repetition, while staying technique-ish.
    let mainSteps = 2;
    if (level === "advanced" && duration >= 35) mainSteps = 3;

    if (regenerate && alt(duration >= 30, duration >= 35)) {
      if (level === "advanced" && alt(duration >= 40, duration >= 45)) mainSteps = 4;
      else if (mainSteps === 2 && duration >= 35 && regenFlip) mainSteps = 3;
      else mainSteps = Math.max(2, mainSteps);
    }

    const techDesired = alt(
      new Set<StepKind>(["intervals", "build", "continuous"]),
      new Set<StepKind>(["build", "intervals", "continuous"]),
    );
    const techKinds = pickKindsWithin(archetype.allowed_main_kinds, techDesired);

    if (!regenerate) {
      main = sb(mainSteps, ...same(mainSteps, archetype.allowed_main_kinds));
    } else {
      const allowedByPos: ReadonlySet<StepKind>[] = [];
      for (let i = 0; i < mainSteps; i++) {
        if (i === 0) allowedByPos.push(openerKinds);
        else allowedByPos.push(techKinds);
      }
      main = sb(mainSteps, ...allowedByPos);
    }
  }

  else if (archetypeId === "choice_session") {
    // Normal: 2–3.
    // Regenerate: 2–4, with opener variation.
    const mainSteps =
      regenerate
        ? alt(duration < 30 ? 2 : duration < 40 ? 3 : 4, duration < 35 ? 2 : duration < 45 ? 3 : 4)
        : (duration < 35 ? 2 : 3);

    const choiceDesired = alt(
      new Set<StepKind>(["intervals", "continuous"]),
      new Set<StepKind>(["continuous", "intervals"]),
    );
    const choiceKinds = pickKindsWithin(archetype.allowed_main_kinds, choiceDesired);

    if (!regenerate) {
      main = sb(mainSteps, ...same(mainSteps, archetype.allowed_main_kinds));
    } else {
      const allowedByPos: ReadonlySet<StepKind>[] = [];
      for (let i = 0; i < mainSteps; i++) {
        if (i === 0) allowedByPos.push(openerKinds);
        else if (i === mainSteps - 1) allowedByPos.push(resetKinds);
        else allowedByPos.push(choiceKinds);
      }
      main = sb(mainSteps, ...allowedByPos);
    }
  }

  else if (archetypeId === "benchmark_lite") {
    // Keep benchmark structure fairly stable, but allow the “challenge” slot to vary more on regenerate.
    const steadyKinds = new Set<StepKind>(["intervals", "build"]);
    const challengeKindsBase = requestedTags.has("golf")
      ? new Set<StepKind>(["intervals"])
      : new Set<StepKind>(["broken", "time_trial"]);

    const challengeKinds = regenerate
      ? (regenFlip
          ? archetype.allowed_main_kinds
          : union(challengeKindsBase, new Set<StepKind>(["intervals", "build"]))) // still bounded
      : challengeKindsBase;

    if (duration < 35) {
      main = sb(3, steadyKinds, challengeKinds, steadyKinds);
    } else {
      main = sb(4, steadyKinds, steadyKinds, challengeKinds, steadyKinds);
    }
  }

  else {
    // Fallback: regenerate widens step count by +1 and opener variation.
    const steps = regenerate
      ? Math.min(archetype.min_main_steps + (regenFlip ? 2 : 1), 5)
      : archetype.min_main_steps;
    if (!regenerate) {
      main = sb(steps, ...same(steps, archetype.allowed_main_kinds));
    } else {
      const allowedByPos: ReadonlySet<StepKind>[] = [];
      for (let i = 0; i < steps; i++) {
        if (i === 0) allowedByPos.push(openerKinds);
        else if (i === steps - 1) allowedByPos.push(resetKinds);
        else allowedByPos.push(archetype.allowed_main_kinds);
      }
      main = sb(steps, ...allowedByPos);
    }
  }

  return { warm_up: warm, main_set: main, cool_down: cool };
}
