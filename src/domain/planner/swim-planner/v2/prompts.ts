import type { StepKind, SwimPlanInput } from "../types";
import { distanceGuidance, schemaExcerpt, sectionProportionGuidance, sessionDensityGuidance, swimLevelHint } from "../prompt";
import type { GenerationSpecV2 } from "./types";

export function buildSystemPromptV2(): string {
  return (
    "You design fun-first swimming sessions for recreational swimmers. " +
    "Your sessions feel readable, intentional, and satisfying to complete. " +
    "This is not a performance training plan: avoid test-like language by default. " +
    "Follow the selected session archetype as a mandatory structure. " +
    "Return valid JSON matching the provided schema exactly. " +
    "Do not include markdown, comments, explanations, or extra keys."
  );
}

function blueprintBlock(spec: GenerationSpecV2): string {
  function fmtSection(
    name: string,
    steps: number,
    allowed: ReadonlyArray<ReadonlySet<StepKind>>,
  ): string {
    const parts: string[] = [`- ${name}: exactly ${steps} steps`];
    for (let idx = 0; idx < allowed.length; idx += 1) {
      const kinds = [...allowed[idx]].sort();
      parts.push(`  - step ${idx + 1} allowed kinds: ${JSON.stringify(kinds)}`);
    }
    return parts.join("\n");
  }

  const warm = fmtSection(
    "warm_up",
    spec.blueprint.warm_up.steps,
    spec.blueprint.warm_up.allowed_kinds_by_step,
  );
  const main = fmtSection(
    "main_set",
    spec.blueprint.main_set.steps,
    spec.blueprint.main_set.allowed_kinds_by_step,
  );
  const cool = fmtSection(
    "cool_down",
    spec.blueprint.cool_down.steps,
    spec.blueprint.cool_down.allowed_kinds_by_step,
  );

  return [warm, main, cool].join("\n");
}

function tagModifierHints(tags: string[], archetypeName: string, swimLevel: string | undefined): string {
  const requested = new Set(tags);
  const hints: string[] = [];

  if (requested.has("freestyle")) {
    hints.push("Make freestyle the default stroke unless a tag requires otherwise.");
  }
  if (requested.has("mixed") && archetypeName !== "Stroke-Switch Ladder") {
    hints.push("Include at least two different strokes across the main_set steps (keep it simple).");
  }
  if (requested.has("butterfly")) {
    hints.push("Include butterfly briefly (short reps only), and keep cues simple and relaxed.");
  }
  if (requested.has("kick")) {
    hints.push("Include one kick-focused step (describe it clearly; keep it low-fuss).");
  }

  if (requested.has("fins") || requested.has("pull") || requested.has("paddles")) {
    hints.push("Use only the requested equipment flags; never add gear that wasn't requested.");
  }

  if (requested.has("broken")) {
    hints.push("If you include a broken step, keep it simple and explain the pause clearly.");
  }
  if (requested.has("fartlek")) {
    hints.push("If you include a fartlek step, describe the surge pattern plainly.");
  }
  if (requested.has("golf")) {
    hints.push("If you include a GOLF step, it must be 50m intervals (e.g. 4-10 x 50m). Explain scoring briefly (strokes + seconds).");
  }
  if (requested.has("time_trial")) {
    hints.push("If you include a time_trial step, treat it as top pace for that distance and cue the swimmer to note their time.");
  }

  if (requested.has("hypoxic") && swimLevel === "advanced") {
    hints.push("If you include hypoxic, be conservative and make the breathing pattern crystal clear.");
  }
  if (requested.has("underwater") && swimLevel === "advanced") {
    hints.push("If you include underwater, keep reps short and include generous rest.");
  }
  if (requested.has("fun")) {
    hints.push("Keep tone warm and motivating; fun comes from a clear shape, not extra gimmicks.");
  }

  return hints.length ? hints.join(" ") : "No special tag modifiers required beyond compatibility.";
}

export function buildUserPromptV2(payload: SwimPlanInput, historySummary: string, spec: GenerationSpecV2): string {
  const req = payload.session_requested;
  const requestedTags = [...spec.requested_tags];

  const schema = schemaExcerpt();
  const distance = distanceGuidance(req.duration_minutes, req.effort, req.distance_min, req.distance_max);
  const density = sessionDensityGuidance(req.duration_minutes, req.effort, req.distance_min, req.distance_max);
  const proportions = sectionProportionGuidance(req.effort, req.duration_minutes, req.distance_min, req.distance_max, req.pool_length);

  const archetype = spec.archetype;
  const hasGolfTag = requestedTags.includes("golf");
  const benchmarkRule =
    archetype.archetype_id === "benchmark_lite"
      ? hasGolfTag
        ? "- benchmark_lite special rule: include exactly one challenge element in main_set, and it must be a single GOLF step using 50m intervals; do not use time_trial/broken as the challenge when 'golf' is requested.\n"
        : "- benchmark_lite special rule: include exactly one challenge element in main_set (kind 'time_trial' or 'broken', or a single GOLF step using 50m intervals); all other main_set steps must be non-challenge.\n"
      : "";
  const archetypeContract =
    `Selected archetype: ${archetype.display_name}\n` +
    `- main_set steps must be ${archetype.min_main_steps}-${archetype.max_main_steps}\n` +
    `- allowed main_set kinds: ${JSON.stringify([...archetype.allowed_main_kinds].sort())}\n` +
    `- one main idea only: do not add extra mechanics outside this archetype\n` +
    benchmarkRule;

  const swimLevelBlock = req.swim_level
    ? `SWIM LEVEL:\nThe swimmer's level is '${req.swim_level}'.\n${swimLevelHint(req.swim_level)}\n\n`
    : "";

  const tagHints = tagModifierHints(requestedTags, archetype.display_name, req.swim_level);

  return (
    "Generate a personalised swim session plan.\n\n" +
    "DECISION PRIORITY (follow in this order):\n" +
    "1. Return valid JSON matching the schema exactly.\n" +
    "2. Follow the selected archetype contract (mandatory structure).\n" +
    "3. Follow the locked blueprint (exact step counts + allowed kinds).\n" +
    (req.distance_min !== undefined || req.distance_max !== undefined
      ? "4. Hit the requested distance range (hard constraint — overrides effort-based volume defaults).\n" +
        "5. Match requested duration_minutes and effort (secondary guide after distance).\n" +
        "6. Apply tags as modifiers only (do not change the session shape).\n" +
        "7. Use history to avoid disliked mechanics and repetition.\n\n"
      : "4. Match requested duration_minutes and effort.\n" +
        "5. Apply tags as modifiers only (do not change the session shape).\n" +
        "6. Use history to avoid disliked mechanics and repetition.\n\n") +
    "REQUEST:\n" +
    `${JSON.stringify(req)}\n\n` +
    swimLevelBlock +
    "REQUESTED TAGS (modifiers only):\n" +
    `${JSON.stringify(requestedTags)}\n` +
    `${tagHints}\n\n` +
    "HISTORIC GUIDANCE:\n" +
    `${historySummary}\n\n` +
    "ARCHETYPE CONTRACT (MANDATORY):\n" +
    `${archetypeContract}\n` +
    "LOCKED BLUEPRINT (DO NOT CHANGE STEP COUNTS):\n" +
    `${blueprintBlock(spec)}\n\n` +
    "EFFORT EXPRESSION:\n" +
    "- easy: smooth, comfortable; longer repeats with rest_seconds (20-30s).\n" +
    "- medium: steady, repeatable; prefer sendoff_seconds for intervals (e.g. 4×100m on 2:00 → sendoff_seconds: 120, rest_seconds: null).\n" +
    "- hard: quality-focused; prefer sendoff_seconds with tight windows (e.g. 6×50m on 1:30 → sendoff_seconds: 90, rest_seconds: null); include warm-up activation.\n\n" +
    "STYLE / READABILITY RULES:\n" +
    "- Step descriptions must be one brief sentence with one key cue.\n" +
    "- Use plain, everyday language.\n" +
    "- Do not write test-like or race-like instructions unless explicitly requested.\n" +
    "- Do not reference metres, distances, or rep lengths in descriptions; cue effort and feel instead.\n\n" +
    "DISTANCE GUIDANCE:\n" +
    `${distance}\n\n` +
    (density ? `${density}\n\n` : "") +
    (req.distance_min !== undefined || req.distance_max !== undefined
      ? "SECTION DISTANCES (derived from required range — use these as targets):\n"
      : "SECTION PROPORTIONS:\n") +
    `${proportions}\n\n` +
    "HARD CONSTRAINTS:\n" +
    "- Return exactly ONE JSON object.\n" +
    "- Do not include markdown.\n" +
    "- Do not include comments.\n" +
    "- Do not include explanations.\n" +
    "- Do not include extra keys.\n" +
    "- Include sections.warm_up, sections.main_set, sections.cool_down.\n" +
    "- Every section must include title, section_distance_m, and steps.\n" +
    "- Every step must include all required fields.\n" +
    "- Sum of all step distances must equal section_distance_m.\n" +
    "- Sum of all sections must equal estimated_distance_m.\n" +
    (req.pool_length === 25
      ? "- Pool length is 25m. All distances must be exact multiples of 25 (25, 50, 75, 100, ...): distance_per_rep_m, section_distance_m, estimated_distance_m, and pyramid_sequence_m values.\n" +
        "- Minimum distance_per_rep_m is 25m.\n"
      : "- All distances must be exact multiples of 50 (50, 100, 150, ...): distance_per_rep_m, section_distance_m, estimated_distance_m, and pyramid_sequence_m values.\n" +
        "- Minimum distance_per_rep_m is 50m. Never use 25m or any non-multiple of 50.\n") +
    (req.distance_min !== undefined && req.distance_max !== undefined
      ? `- estimated_distance_m MUST be >= ${req.distance_min}m AND <= ${req.distance_max}m. This is a hard constraint.\n`
      : req.distance_min !== undefined
        ? `- estimated_distance_m MUST be >= ${req.distance_min}m. This is a hard constraint.\n`
        : req.distance_max !== undefined
          ? `- estimated_distance_m MUST be <= ${req.distance_max}m. This is a hard constraint.\n`
          : "") +
    "- reps must be > 0.\n" +
    "- kind: 'intervals' must have reps >= 2. If reps == 1, use kind: 'continuous' (or 'build' / 'negative_split' / 'fartlek' / 'time_trial' when appropriate).\n" +
    "- build: reps must be 1.\n" +
    "- negative_split: reps must be 1; include split_instruction.\n" +
    "- Use either rest_seconds or sendoff_seconds on a step, not both. Set the unused one to null.\n" +
    "- rest_seconds must be null or >= 0.\n" +
    "- sendoff_seconds must be null or >= 1.\n" +
    "- Allowed kind values: continuous, intervals, pyramid, descending, ascending, build, negative_split, broken, fartlek, time_trial.\n" +
    "- broken: must have broken_pause_s >= 5; description must mention pausing at the halfway wall.\n" +
    "- fartlek: reps must be 1; description must describe the surge pattern clearly.\n" +
    "- golf: only valid as 50m intervals (kind 'intervals', distance_per_rep_m: 50, reps >= 2); do not attach GOLF scoring to time_trial/continuous.\n" +
    "- time_trial: reps must be 1; do not set rest_seconds or sendoff_seconds; this is a top-pace effort for the set distance; description should explicitly cue the swimmer to note their time.\n" +
    "- When kind is pyramid/descending/ascending: pyramid_sequence_m is required; reps must equal pyramid_sequence_m length.\n" +
    "- For pyramid/descending/ascending: if you include rest_sequence_s or sendoff_sequence_s, its length must equal pyramid_sequence_m length; do not also set rest_seconds/sendoff_seconds (prefer rest_seconds unless per-rep timing is essential).\n" +
    "- hypoxic: true only permitted in main_set; requires rest_seconds >= 20.\n" +
    "- underwater: true only permitted in main_set; requires rest_seconds >= 30; never use sendoff_seconds on underwater steps.\n" +
    "- fins: true may only be set when 'fins' is in requested_tags.\n" +
    "- pull: true may only be set when 'pull' is in requested_tags.\n" +
    "- paddles: true may only be set when 'paddles' is in requested_tags.\n\n" +
    "OUTPUT SHAPE EXAMPLE:\n" +
    `${schema}\n\n` +
    "Return the final JSON object only."
  );
}

export function buildRepairPromptV2(originalText: string, errorText: string, spec: GenerationSpecV2): string {
  const archetype = spec.archetype;
  const hasGolfTag = (spec.requested_tags ?? []).includes("golf");
  const benchmarkRepairRule =
    archetype.archetype_id === "benchmark_lite"
      ? hasGolfTag
        ? "- benchmark_lite requires exactly one challenge element in main_set, and it must be one GOLF step using 50m intervals\n"
        : "- benchmark_lite requires exactly one challenge element in main_set (kind 'time_trial' or 'broken', or one GOLF step using 50m intervals)\n"
      : "";
  const poolMultiple = spec.pool_length === 25 ? 25 : 50;

  let distanceRepairBlock = "";
  if (spec.distance_min !== undefined || spec.distance_max !== undefined) {
    const rangeDesc =
      spec.distance_min !== undefined && spec.distance_max !== undefined
        ? `between ${spec.distance_min}m and ${spec.distance_max}m (inclusive)`
        : spec.distance_min !== undefined
          ? `at least ${spec.distance_min}m`
          : `at most ${spec.distance_max}m`;
    distanceRepairBlock =
      `DISTANCE CONSTRAINT (hard requirement):\n` +
      `- estimated_distance_m MUST be ${rangeDesc}.\n` +
      `- To fix this: adjust distance_per_rep_m or reps on existing steps to reach the required total.\n` +
      `- Do NOT add or remove steps — keep the locked blueprint step counts exactly.\n` +
      `- All distances must remain exact multiples of ${poolMultiple}m.\n\n`;
  }

  return (
    "Your previous response was invalid.\n\n" +
    "TASK:\n" +
    "Return a corrected version of the JSON only.\n" +
    "Do not explain the error.\n" +
    "Do not include markdown.\n" +
    "Do not include any text before or after the JSON.\n\n" +
    distanceRepairBlock +
    "IMPORTANT:\n" +
    `- Selected archetype is mandatory: ${archetype.display_name}\n` +
    `- main_set steps must be ${archetype.min_main_steps}-${archetype.max_main_steps}\n` +
    `- allowed main_set kinds: ${JSON.stringify([...archetype.allowed_main_kinds].sort())}\n` +
    "- intervals must have reps >= 2 (if reps == 1, use another valid kind).\n" +
    "- build and negative_split must have reps == 1 (negative_split also requires split_instruction).\n" +
    "- golf scoring is only valid on 50m intervals: kind 'intervals', distance_per_rep_m: 50, reps >= 2.\n" +
    "- time_trial must have reps == 1, with no rest_seconds/sendoff_seconds.\n" +
    benchmarkRepairRule +
    "- Follow the locked blueprint exactly (do not change step counts).\n" +
    `${blueprintBlock(spec)}\n\n` +
    "VALIDATION ERROR:\n" +
    `${errorText}\n\n` +
    "PREVIOUS OUTPUT:\n" +
    `${originalText}\n\n` +
    "Return one corrected JSON object only."
  );
}
