// Port of swim_planner_llm/llm_client_claude.py + wrapper.py
// Anthropic client is a module-level singleton — created once, reused across requests.

import Anthropic from '@anthropic-ai/sdk';
import type { LLMPlanDraft, SwimPlanInput, SwimPlanResponse } from './types';
import { summarizeHistory } from './prompt';
import { checkDistanceConstraint, enforceAndNormalize, ValidationIssue, validateInvariants } from './validate';
import { buildGenerationSpecV2 } from './v2/router';
import type { GenerationSpecV2 } from './v2/types';
import { buildRepairPromptV2, buildSystemPromptV2, buildUserPromptV2 } from './v2/prompts';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.SWIM_PLANNER_CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001';

// ── Markdown fence stripping (Claude sometimes wraps output in ``` fences) ────

function stripMarkdownFences(text: string): string {
  const stripped = text.trim();
  if (!stripped.startsWith('```')) return stripped;
  const firstNewline = stripped.indexOf('\n');
  if (firstNewline === -1) return stripped;
  let inner = stripped.slice(firstNewline + 1);
  if (inner.endsWith('```')) {
    inner = inner.slice(0, inner.lastIndexOf('```'));
  }
  return inner.trim();
}

// ── LLM call ──────────────────────────────────────────────────────────────────

async function claudeCompletion(system: string, user: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is missing');
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
  if (!content) throw new ValidationIssue('Model returned empty response');
  return stripMarkdownFences(content);
}

// ── Parse + validate ──────────────────────────────────────────────────────────

function buildValidPlanFromLLM(rawText: string, payload: SwimPlanInput, spec: GenerationSpecV2): SwimPlanResponse {
  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch (e: any) {
    throw new ValidationIssue(`json parse failed: ${e?.message ?? e}`);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ValidationIssue('llm output must be a single JSON object');
  }

  const draft = data as LLMPlanDraft;
  const plan = enforceAndNormalize(draft, payload.session_requested);
  plan.sections.main_set.title = `Main Set — ${spec.archetype.display_name}`;
  validateInvariants(
    plan,
    payload.session_requested,
    payload.historic_sessions,
    payload.requested_tags,
    spec,
  );
  return plan;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function generateSwimPlan(
  payload: SwimPlanInput,
): Promise<{ plan: SwimPlanResponse; spec: GenerationSpecV2; distanceConstraintMet: boolean }> {
  const historySummary = summarizeHistory(payload.historic_sessions);
  const spec = buildGenerationSpecV2(payload);
  const system = buildSystemPromptV2();
  const user = buildUserPromptV2(payload, historySummary, spec);

  let firstRaw = '';
  let firstError = '';
  let firstValidPlan: SwimPlanResponse | null = null;

  // First attempt
  try {
    firstRaw = await claudeCompletion(system, user);
    const plan = buildValidPlanFromLLM(firstRaw, payload, spec);
    if (checkDistanceConstraint(plan, payload.session_requested)) {
      return { plan, spec, distanceConstraintMet: true };
    }
    // Structurally valid but outside the requested distance range — save as fallback and try repair
    firstValidPlan = plan;
    firstError = `Distance constraint not met: generated ${plan.estimated_distance_m}m`;
  } catch (err: any) {
    firstError = err?.message ?? String(err);
  }

  // Repair attempt
  try {
    const repairUser = buildRepairPromptV2(firstRaw || '<empty>', firstError, spec);
    const repairRaw = await claudeCompletion(system, repairUser);
    const plan = buildValidPlanFromLLM(repairRaw, payload, spec);
    const distanceConstraintMet = checkDistanceConstraint(plan, payload.session_requested);
    return { plan, spec, distanceConstraintMet };
  } catch (repairErr: any) {
    // If we have a structurally valid plan from the first attempt (distance range miss only),
    // return it rather than 500-ing — the constraint wasn't met but the plan is usable.
    if (firstValidPlan) {
      return { plan: firstValidPlan, spec, distanceConstraintMet: false };
    }
    throw new ValidationIssue(
      `Plan generation failed after initial call and one repair attempt. ` +
        `Initial error: ${firstError}. Repair error: ${repairErr?.message ?? repairErr}`,
    );
  }
}
