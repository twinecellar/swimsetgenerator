// Port of swim_planner_llm/validator.py

import type {
  Effort,
  HistoricSession,
  LLMPlanDraft,
  Section,
  SessionRequested,
  Step,
  StepKind,
  Stroke,
  SwimPlanResponse,
} from './types';
import { stepDistanceM } from './types';
import { inferPreferVaried } from './style-inference';
import type { GenerationSpecV2 } from './v2/types';

export class ValidationIssue extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationIssue';
  }
}

const ALLOWED_KINDS = new Set<string>([
  'continuous',
  'intervals',
  'pyramid',
  'descending',
  'ascending',
  'build',
  'negative_split',
  'broken',
  'fartlek',
  'time_trial',
]);
const PYRAMID_KINDS = new Set<string>(['pyramid', 'descending', 'ascending']);
const ALLOWED_STROKES = new Set<string>([
  'freestyle',
  'backstroke',
  'breaststroke',
  'butterfly',
  'mixed',
  'choice',
]);
const ALLOWED_EFFORTS = new Set<string>(['easy', 'medium', 'hard']);

// ── Step conversion ───────────────────────────────────────────────────────────

function convertSteps(rawSteps: unknown[] | null | undefined, prefix: string, defaultDesc: string): Step[] {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new ValidationIssue(`${prefix}: no steps provided`);
  }

  return rawSteps.map((s: any, idx) => {
    const stepId = (s?.step_id ?? '').toString().trim() || `${prefix}-${idx + 1}`;
    const description = (s?.description ?? '').toString().trim() || defaultDesc;

    const step: Step = {
      step_id: stepId,
      kind: s?.kind as StepKind,
      reps: s?.reps,
      distance_per_rep_m: s?.distance_per_rep_m,
      stroke: s?.stroke as Stroke,
      rest_seconds: s?.rest_seconds ?? null,
      sendoff_seconds: s?.sendoff_seconds ?? null,
      effort: s?.effort as Effort,
      description,
    };
    if (Array.isArray(s?.pyramid_sequence_m)) step.pyramid_sequence_m = s.pyramid_sequence_m;
    if (Array.isArray(s?.rest_sequence_s)) step.rest_sequence_s = s.rest_sequence_s;
    if (Array.isArray(s?.sendoff_sequence_s)) step.sendoff_sequence_s = s.sendoff_sequence_s;

    // Normalise common pyramid timing mistakes from LLM output:
    // - rest_sequence_s/sendoff_sequence_s must match pyramid_sequence_m length
    // - if using per-rep sequences, rest_seconds/sendoff_seconds must be null
    if (PYRAMID_KINDS.has(step.kind)) {
      const pyramidSeq = step.pyramid_sequence_m;
      if (step.rest_sequence_s) {
        if (!pyramidSeq || step.rest_sequence_s.length !== pyramidSeq.length) {
          delete step.rest_sequence_s;
        } else {
          step.rest_seconds = null;
          step.sendoff_seconds = null;
        }
      }
      if (step.sendoff_sequence_s) {
        if (!pyramidSeq || step.sendoff_sequence_s.length !== pyramidSeq.length) {
          delete step.sendoff_sequence_s;
        } else {
          delete step.rest_sequence_s;
          step.rest_seconds = null;
          step.sendoff_seconds = null;
        }
      }
    }
    if (typeof s?.hypoxic === 'boolean') {
      step.hypoxic = s.hypoxic;
    }
    if (typeof s?.underwater === 'boolean') {
      step.underwater = s.underwater;
    }
    if (typeof s?.fins === 'boolean') {
      step.fins = s.fins;
    }
    if (typeof s?.pull === 'boolean') {
      step.pull = s.pull;
    }
    if (typeof s?.paddles === 'boolean') {
      step.paddles = s.paddles;
    }
    if (typeof s?.broken_pause_s === 'number') {
      step.broken_pause_s = s.broken_pause_s;
    }
    if (typeof s?.target_time_s === 'number') {
      step.target_time_s = s.target_time_s;
    }
    if (typeof s?.split_instruction === 'string' && s.split_instruction.trim()) {
      step.split_instruction = s.split_instruction.trim();
    }
    return step;
  });
}

// ── Normalisation ─────────────────────────────────────────────────────────────

export function enforceAndNormalize(draft: LLMPlanDraft, request: SessionRequested): SwimPlanResponse {
  const secs = draft.sections;
  if (!secs) throw new ValidationIssue('sections missing from LLM output');

  const warmSteps = convertSteps(secs.warm_up?.steps, 'wu', 'Auto-generated warm-up step');
  const mainSteps = convertSteps(secs.main_set?.steps, 'main', 'Auto-generated main step');
  const coolSteps = convertSteps(secs.cool_down?.steps, 'cd', 'Auto-generated cool-down step');

  function makeSection(steps: Step[], fallbackTitle: string, providedTitle?: string | null): Section {
    return {
      title: (providedTitle ?? '').trim() || fallbackTitle,
      steps,
      section_distance_m: steps.reduce((sum, s) => sum + stepDistanceM(s), 0),
    };
  }

  const warm_up = makeSection(warmSteps, 'Warm-Up', secs.warm_up?.title);
  const main_set = makeSection(mainSteps, 'Main Set', secs.main_set?.title);
  const cool_down = makeSection(coolSteps, 'Cool-Down', secs.cool_down?.title);

  const estimated_distance_m =
    warm_up.section_distance_m + main_set.section_distance_m + cool_down.section_distance_m;

  const plan_id = draft.plan_id ?? crypto.randomUUID();
  const created_at = draft.created_at ?? new Date().toISOString();

  return {
    plan_id,
    created_at,
    duration_minutes: request.duration_minutes,
    estimated_distance_m,
    sections: { warm_up, main_set, cool_down },
  };
}

// ── Field validation ──────────────────────────────────────────────────────────

function validateStep(step: Step, sectionName: string): void {
  if (!ALLOWED_KINDS.has(step.kind)) {
    throw new ValidationIssue(`${sectionName}.${step.step_id}: invalid kind '${step.kind}'`);
  }
  const descLower = (step.description ?? '').toLowerCase();
  if (step.kind === 'intervals' && step.reps === 1) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: intervals steps must have reps >= 2 (use kind 'continuous' for a single rep)`,
    );
  }
  if (!ALLOWED_STROKES.has(step.stroke)) {
    throw new ValidationIssue(`${sectionName}.${step.step_id}: invalid stroke '${step.stroke}'`);
  }
  if (!ALLOWED_EFFORTS.has(step.effort)) {
    throw new ValidationIssue(`${sectionName}.${step.step_id}: invalid effort '${step.effort}'`);
  }
  if (!(step.reps > 0)) {
    throw new ValidationIssue(`${sectionName}.${step.step_id}: reps must be > 0`);
  }

	  if (PYRAMID_KINDS.has(step.kind)) {
	    const seq = step.pyramid_sequence_m;
	    if (!seq || seq.length === 0) {
	      throw new ValidationIssue(
	        `${sectionName}.${step.step_id}: pyramid_sequence_m is required for kind '${step.kind}'`,
	      );
	    }
	    if (step.reps !== seq.length) {
	      throw new ValidationIssue(
	        `${sectionName}.${step.step_id}: reps must equal pyramid_sequence_m.length`,
	      );
	    }
	    for (const d of seq) {
	      if (d < 50 || d % 50 !== 0) {
	        throw new ValidationIssue(
	          `${sectionName}.${step.step_id}: every pyramid_sequence_m value must be a multiple of 50 and >= 50`,
	        );
	      }
	    }
	    const seqSum = seq.reduce((sum, d) => sum + d, 0);
	    if (seqSum !== stepDistanceM(step)) {
	      throw new ValidationIssue(
	        `${sectionName}.${step.step_id}: pyramid_sequence_m sum must equal computed step distance`,
	      );
	    }
	  } else {
	    if (!(step.distance_per_rep_m > 0)) {
	      throw new ValidationIssue(`${sectionName}.${step.step_id}: distance_per_rep_m must be > 0`);
	    }
	    if (step.distance_per_rep_m % 50 !== 0) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: distance_per_rep_m must be divisible by 50`,
      );
    }
  }

  if (step.rest_sequence_s !== undefined) {
    if (!PYRAMID_KINDS.has(step.kind)) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: rest_sequence_s is only valid for pyramid/descending/ascending kinds`,
      );
    }
    const seq = step.pyramid_sequence_m;
    if (seq && step.rest_sequence_s.length !== seq.length) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: rest_sequence_s length must match pyramid_sequence_m`,
      );
    }
    for (const v of step.rest_sequence_s) {
      if (v < 0) {
        throw new ValidationIssue(`${sectionName}.${step.step_id}: rest_sequence_s values must be >= 0`);
      }
    }
    if (step.rest_seconds !== null && step.rest_seconds !== undefined) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: rest_sequence_s and rest_seconds are mutually exclusive`,
      );
    }
    if (step.sendoff_seconds !== null && step.sendoff_seconds !== undefined) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: rest_sequence_s and sendoff_seconds are mutually exclusive`,
      );
    }
  }

  if (step.sendoff_sequence_s !== undefined) {
    if (!PYRAMID_KINDS.has(step.kind)) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: sendoff_sequence_s is only valid for pyramid/descending/ascending kinds`,
      );
    }
    const seq = step.pyramid_sequence_m;
    if (seq && step.sendoff_sequence_s.length !== seq.length) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: sendoff_sequence_s length must match pyramid_sequence_m`,
      );
    }
    for (const v of step.sendoff_sequence_s) {
      if (v < 1) {
        throw new ValidationIssue(`${sectionName}.${step.step_id}: sendoff_sequence_s values must be >= 1`);
      }
    }
    if (step.sendoff_seconds !== null && step.sendoff_seconds !== undefined) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: sendoff_sequence_s and sendoff_seconds are mutually exclusive`,
      );
    }
    if (step.rest_sequence_s !== undefined) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: rest_sequence_s and sendoff_sequence_s are mutually exclusive`,
      );
    }
  }

  const dist = stepDistanceM(step);
  if (dist <= 0) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: computed step distance must be > 0`,
    );
  }
  if (dist % 50 !== 0) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: computed step distance must be divisible by 50`,
    );
  }
  if (step.rest_seconds !== null && step.rest_seconds !== undefined && step.rest_seconds < 0) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: rest_seconds must be >= 0 or null`,
    );
  }
  if (step.hypoxic === true && sectionName !== 'main_set') {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: hypoxic: true is only permitted on main_set steps`,
    );
  }
  if (step.hypoxic === true && (step.rest_seconds === null || step.rest_seconds < 20)) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: hypoxic steps must have rest_seconds >= 20`,
    );
  }
  if (
    descLower.includes('golf') &&
    !(step.kind === 'intervals' && step.distance_per_rep_m === 50 && step.reps >= 2)
  ) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: GOLF scoring is only permitted on 50m intervals steps (e.g. 4 x 50m)`,
    );
  }
  if (step.underwater === true && sectionName !== 'main_set') {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: underwater: true is only permitted on main_set steps`,
    );
  }
  if (step.underwater === true && step.sendoff_seconds != null) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: underwater steps must use rest_seconds, not sendoff_seconds`,
    );
  }
  if (step.underwater === true && (step.rest_seconds === null || step.rest_seconds < 30)) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: underwater steps must have rest_seconds >= 30`,
    );
  }
  if (step.kind === 'broken') {
    if (step.broken_pause_s === undefined || step.broken_pause_s === null || step.broken_pause_s < 5) {
      throw new ValidationIssue(
        `${sectionName}.${step.step_id}: broken steps must have broken_pause_s >= 5`,
      );
    }
  }
  if (step.kind === 'build' && step.reps !== 1) {
    throw new ValidationIssue(`${sectionName}.${step.step_id}: build steps must have reps == 1`);
  }
  if (step.kind === 'negative_split') {
    if (step.reps !== 1) {
      throw new ValidationIssue(`${sectionName}.${step.step_id}: negative_split steps must have reps == 1`);
    }
    if (!step.split_instruction || !step.split_instruction.trim()) {
      throw new ValidationIssue(`${sectionName}.${step.step_id}: negative_split steps must include split_instruction`);
    }
  }
  if (step.kind === 'fartlek' && step.reps !== 1) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: fartlek steps must have reps == 1`,
    );
  }
  if (step.kind === 'time_trial' && step.reps !== 1) {
    throw new ValidationIssue(
      `${sectionName}.${step.step_id}: time_trial steps must have reps == 1`,
    );
  }
  if (!step.step_id.trim()) {
    throw new ValidationIssue(`${sectionName}: step_id must not be empty`);
  }
  if (!step.description.trim()) {
    throw new ValidationIssue(`${sectionName}.${step.step_id}: description must not be empty`);
  }
}

function validateSection(section: Section, sectionName: string): number {
  if (!section.title.trim()) {
    throw new ValidationIssue(`${sectionName}: title must not be empty`);
  }
  if (!section.steps || section.steps.length === 0) {
    throw new ValidationIssue(`${sectionName}: must contain at least one step`);
  }

  let stepSum = 0;
  for (const step of section.steps) {
    validateStep(step, sectionName);
    stepSum += stepDistanceM(step);
  }

  if (section.section_distance_m <= 0) {
    throw new ValidationIssue(`${sectionName}: section_distance_m must be > 0`);
  }
  if (section.section_distance_m % 50 !== 0) {
    throw new ValidationIssue(`${sectionName}: section_distance_m must be divisible by 50`);
  }
  if (stepSum !== section.section_distance_m) {
    throw new ValidationIssue(`${sectionName}: section_distance_m does not match step sum`);
  }

  return stepSum;
}

// ── Sensitive feedback detection ──────────────────────────────────────────────

function hasSensitiveDownFeedback(historicSessions: HistoricSession[]): boolean {
  const riskTags = new Set(['pace-too-fast', 'long', 'tiring']);
  for (const session of historicSessions) {
    if (session.thumb !== 0) continue;
    const tags = new Set(session.tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
    if ([...tags].some((t) => riskTags.has(t))) return true;
  }
  return false;
}

// ── Step signature (for style check) ─────────────────────────────────────────

function stepSignature(step: Step): string {
  return JSON.stringify([
    step.kind,
    step.reps,
    step.distance_per_rep_m,
    step.stroke,
    step.rest_seconds,
    step.effort,
  ]);
}

// ── Public invariant check ────────────────────────────────────────────────────

export function validateInvariants(
  plan: SwimPlanResponse,
  request: SessionRequested,
  historicSessions: HistoricSession[],
  requestedTags: string[],
  opts?: { version?: 'v1' | 'v2'; v2Spec?: GenerationSpecV2 },
): void {
  const warmSum = validateSection(plan.sections.warm_up, 'warm_up');
  const mainSum = validateSection(plan.sections.main_set, 'main_set');
  const coolSum = validateSection(plan.sections.cool_down, 'cool_down');

  const total = warmSum + mainSum + coolSum;
  if (total !== plan.estimated_distance_m) {
    throw new ValidationIssue('estimated_distance_m does not match total section distances');
  }
  if (plan.estimated_distance_m <= 0) {
    throw new ValidationIssue('estimated_distance_m must be > 0');
  }
  if (plan.estimated_distance_m % 50 !== 0) {
    throw new ValidationIssue('estimated_distance_m must be divisible by 50');
  }
  if (plan.duration_minutes <= 0) {
    throw new ValidationIssue('duration_minutes must be > 0');
  }
  if (plan.duration_minutes !== request.duration_minutes) {
    throw new ValidationIssue('duration_minutes must match requested duration_minutes');
  }

  const version = opts?.version ?? 'v1';

  if (version === 'v1') {
    const mergedTags = [...request.requested_tags, ...requestedTags];
    const preferVaried = inferPreferVaried(mergedTags, historicSessions);

    if (!preferVaried) {
      const signatures = new Set(plan.sections.main_set.steps.map(stepSignature));
      if (signatures.size > 1) {
        throw new ValidationIssue(
          'straightforward style requires one main_set pattern signature',
        );
      }
    }

    if (preferVaried && plan.sections.main_set.steps.length < 2) {
      throw new ValidationIssue('varied style should include at least 2 main_set steps');
    }
  } else if (version === 'v2') {
    const v2Spec = opts?.v2Spec;
    if (!v2Spec) throw new ValidationIssue('v2Spec is required for v2 validation');
    validateV2ArchetypeContract(plan, request, requestedTags, v2Spec);
  } else {
    throw new ValidationIssue(`unknown validation version '${version}'`);
  }

  if (hasSensitiveDownFeedback(historicSessions)) {
    for (const step of plan.sections.main_set.steps) {
      if (
        step.kind === 'continuous' &&
        step.effort === 'hard' &&
        stepDistanceM(step) > 500
      ) {
        throw new ValidationIssue(
          'main_set contains long hard continuous block despite sensitive thumbs-down history',
        );
      }
    }
  }
}

function validateV2ArchetypeContract(
  plan: SwimPlanResponse,
  request: SessionRequested,
  requestedTags: string[],
  spec: GenerationSpecV2,
): void {
  const tags = new Set(
    [...request.requested_tags, ...requestedTags]
      .map((t) => (t ?? '').toString().trim().toLowerCase())
      .filter(Boolean),
  );
  const archetype = spec.archetype;

  // Locked blueprint: exact step counts per section.
  if (plan.sections.warm_up.steps.length !== spec.blueprint.warm_up.steps) {
    throw new ValidationIssue('v2 blueprint mismatch: warm_up step count differs');
  }
  if (plan.sections.main_set.steps.length !== spec.blueprint.main_set.steps) {
    throw new ValidationIssue('v2 blueprint mismatch: main_set step count differs');
  }
  if (plan.sections.cool_down.steps.length !== spec.blueprint.cool_down.steps) {
    throw new ValidationIssue('v2 blueprint mismatch: cool_down step count differs');
  }

  // Archetype contract: main_set step count bounds + allowed kinds.
  const mainSteps = plan.sections.main_set.steps;
  if (!(archetype.min_main_steps <= mainSteps.length && mainSteps.length <= archetype.max_main_steps)) {
    throw new ValidationIssue('v2 archetype contract violation: main_set step count out of bounds');
  }

  for (let idx = 0; idx < mainSteps.length; idx += 1) {
    const step = mainSteps[idx];
    if (!archetype.allowed_main_kinds.has(step.kind)) {
      throw new ValidationIssue(
        `v2 archetype contract violation: main_set step ${idx + 1} kind '${step.kind}' not allowed`,
      );
    }
  }

  // Per-step allowed kinds from blueprint (positionally).
  for (let idx = 0; idx < plan.sections.warm_up.steps.length; idx += 1) {
    const step = plan.sections.warm_up.steps[idx];
    const allowed = spec.blueprint.warm_up.allowed_kinds_by_step[idx];
    if (!allowed.has(step.kind)) {
      throw new ValidationIssue(
        `v2 blueprint violation: warm_up step ${idx + 1} kind '${step.kind}' not allowed`,
      );
    }
  }
  for (let idx = 0; idx < plan.sections.main_set.steps.length; idx += 1) {
    const step = plan.sections.main_set.steps[idx];
    const allowed = spec.blueprint.main_set.allowed_kinds_by_step[idx];
    if (!allowed.has(step.kind)) {
      throw new ValidationIssue(
        `v2 blueprint violation: main_set step ${idx + 1} kind '${step.kind}' not allowed`,
      );
    }
  }
  for (let idx = 0; idx < plan.sections.cool_down.steps.length; idx += 1) {
    const step = plan.sections.cool_down.steps[idx];
    const allowed = spec.blueprint.cool_down.allowed_kinds_by_step[idx];
    if (!allowed.has(step.kind)) {
      throw new ValidationIssue(
        `v2 blueprint violation: cool_down step ${idx + 1} kind '${step.kind}' not allowed`,
      );
    }
  }

  // Gear rules: never enable gear unless requested; gear only in main_set for v2.
  const requestedGear = new Set(['fins', 'pull', 'paddles']);
  const hasAnyRequestedGear = [...requestedGear].some((g) => tags.has(g));

  for (const [sectionName, section] of [
    ['warm_up', plan.sections.warm_up],
    ['cool_down', plan.sections.cool_down],
  ] as const) {
    for (const step of section.steps) {
      if (step.fins || step.pull || step.paddles) {
        throw new ValidationIssue(`v2 gear rule violation: gear used in ${sectionName}`);
      }
    }
  }

  for (const step of plan.sections.main_set.steps) {
    if (step.fins && !tags.has('fins')) {
      throw new ValidationIssue("v2 gear rule violation: fins used without 'fins' tag");
    }
    if (step.pull && !tags.has('pull')) {
      throw new ValidationIssue("v2 gear rule violation: pull used without 'pull' tag");
    }
    if (step.paddles && !tags.has('paddles')) {
      throw new ValidationIssue("v2 gear rule violation: paddles used without 'paddles' tag");
    }

    const gearCount = [step.fins, step.pull, step.paddles].filter(Boolean).length;
    if (gearCount > 1) {
      throw new ValidationIssue('v2 gear rule violation: multiple gear flags set on one step');
    }
  }

  if (archetype.archetype_id === 'gear_change_up') {
    if (!hasAnyRequestedGear) {
      throw new ValidationIssue('v2 gear_change_up requires an explicit gear tag');
    }
    const anyGear = plan.sections.main_set.steps.some((s) => Boolean(s.fins || s.pull || s.paddles));
    if (!anyGear) {
      throw new ValidationIssue('v2 gear_change_up requires at least one main_set gear step');
    }
  }

  // Safety: hypoxic/underwater only when explicitly requested and archetype allows.
  if (plan.sections.main_set.steps.some((s) => s.hypoxic === true)) {
    if (!tags.has('hypoxic')) {
      throw new ValidationIssue("v2 safety rule violation: hypoxic used without 'hypoxic' tag");
    }
    if (!archetype.allow_hypoxic_if_tagged) {
      throw new ValidationIssue('v2 safety rule violation: hypoxic not allowed for this archetype');
    }
  }
  if (plan.sections.main_set.steps.some((s) => s.underwater === true)) {
    if (!tags.has('underwater')) {
      throw new ValidationIssue("v2 safety rule violation: underwater used without 'underwater' tag");
    }
    if (!archetype.allow_underwater_if_tagged) {
      throw new ValidationIssue('v2 safety rule violation: underwater not allowed for this archetype');
    }
  }

  // Archetype-specific rules.
  if (archetype.archetype_id === 'playful_alternator') {
    if (plan.sections.main_set.steps[0]?.kind !== 'intervals') {
      throw new ValidationIssue("v2 playful_alternator requires first main_set step kind 'intervals'");
    }
    if (plan.sections.main_set.steps.length === 2) {
      const step2 = plan.sections.main_set.steps[1];
      if (step2.kind !== 'continuous' || step2.effort !== 'easy') {
        throw new ValidationIssue('v2 playful_alternator second step must be an easy continuous reset');
      }
    }
  }

  if (archetype.archetype_id === 'stroke_switch_ladder') {
    const hasPyramidKind = plan.sections.main_set.steps.some((s) =>
      s.kind === 'pyramid' || s.kind === 'ascending' || s.kind === 'descending',
    );
    if (!hasPyramidKind) {
      const hasMapping = plan.sections.main_set.steps.some((s) => {
        const desc = (s.description ?? '').toLowerCase();
        return s.stroke === 'mixed' && desc.includes('odd') && desc.includes('even');
      });
      if (!hasMapping) {
        throw new ValidationIssue(
          'v2 stroke_switch_ladder requires a ladder-like step or an odd/even stroke mapping',
        );
      }
    }
  }

  if (archetype.archetype_id === 'choice_session') {
    const hasChoice = plan.sections.main_set.steps.some((s) => s.stroke === 'choice');
    if (!hasChoice) {
      throw new ValidationIssue("v2 choice_session requires at least one main_set step with stroke 'choice'");
    }
  }

  if (archetype.archetype_id === 'benchmark_lite') {
    let challenge = 0;
    for (const s of plan.sections.main_set.steps) {
      if (s.kind === 'broken' || s.kind === 'time_trial') challenge += 1;
      else if (
        (s.description ?? '').toLowerCase().includes('golf') &&
        s.kind === 'intervals' &&
        s.distance_per_rep_m === 50 &&
        s.reps >= 2
      ) {
        challenge += 1;
      }
    }
    if (challenge !== 1) {
      throw new ValidationIssue('v2 benchmark_lite requires exactly one challenge element step');
    }
  }
}
