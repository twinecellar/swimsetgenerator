import { generateSwimPlan } from './swim-planner/generate';
import type { SwimPlanInput } from './swim-planner/types';
import type { GenerationSpecV2 } from './swim-planner/v2/types';

// ── Public types (unchanged — consumed by app/api/plans/generate/route.ts) ────

export interface SwimPlannerSessionRequested {
  duration_minutes: number;
  effort: 'easy' | 'medium' | 'hard';
  requested_tags: string[];
  swim_level?: 'beginner' | 'intermediate' | 'advanced';
}

export interface SwimPlannerHistoricSession {
  session_plan: {
    duration_minutes: number;
    estimated_distance_m: number;
    sections?: {
      main_set?: {
        title?: string;
      };
    };
  };
  thumb: 0 | 1;
  tags: string[];
}

export interface SwimPlannerPayload {
  session_requested: SwimPlannerSessionRequested;
  historic_sessions: SwimPlannerHistoricSession[];
  requested_tags: string[];
  regen_attempt?: number;
}

export interface SwimPlannerStep {
  step_id: string;
  kind: 'continuous' | 'intervals' | 'pyramid' | 'descending' | 'ascending' | 'build' | 'negative_split' | 'broken' | 'fartlek' | 'time_trial';
  reps: number;
  distance_per_rep_m: number;
  pyramid_sequence_m?: number[] | null;
  stroke: string;
  rest_seconds: number | null;
  sendoff_seconds?: number | null;
  rest_sequence_s?: number[] | null;
  sendoff_sequence_s?: number[] | null;
  effort: 'easy' | 'medium' | 'hard';
  description: string;
  hypoxic?: boolean | null;
  underwater?: boolean | null;
  fins?: boolean | null;
  pull?: boolean | null;
  paddles?: boolean | null;
  broken_pause_s?: number | null;
  target_time_s?: number | null;
  split_instruction?: string | null;
}

export interface SwimPlannerSection {
  title: string;
  section_distance_m: number;
  steps: SwimPlannerStep[];
}

export interface SwimPlannerResponse {
  plan_id: string;
  created_at: string;
  duration_minutes: number;
  estimated_distance_m: number;
  sections: {
    warm_up: SwimPlannerSection;
    main_set: SwimPlannerSection;
    cool_down: SwimPlannerSection;
  };
}

// ── Implementation ────────────────────────────────────────────────────────────

export async function runSwimPlannerLLM(
  payload: SwimPlannerPayload,
): Promise<{ plan: SwimPlannerResponse; spec: GenerationSpecV2 }> {
  const input: SwimPlanInput = {
    session_requested: payload.session_requested,
    historic_sessions: payload.historic_sessions,
    requested_tags: payload.requested_tags,
    regen_attempt: payload.regen_attempt,
  };
  const { plan, spec } = await generateSwimPlan(input);
  return { plan: plan as SwimPlannerResponse, spec };
}
