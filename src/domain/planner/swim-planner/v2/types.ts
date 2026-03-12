import type { StepKind } from "../types";

export type ArchetypeId =
  | "flow_reset"
  | "cruise_builder"
  | "playful_alternator"
  | "mini_block_roulette"
  | "stroke_switch_ladder"
  | "punchy_pops"
  | "gear_change_up"
  | "technique_refresh"
  | "choice_session"
  | "benchmark_lite";

export interface ArchetypeContract {
  archetype_id: ArchetypeId;
  display_name: string;
  min_main_steps: number;
  max_main_steps: number;
  allowed_main_kinds: ReadonlySet<StepKind>;
  trigger_tags: ReadonlySet<string>;
  routing_priority: number;
  allow_hypoxic_if_tagged: boolean;
  allow_underwater_if_tagged: boolean;
}

export interface SectionBlueprint {
  steps: number;
  allowed_kinds_by_step: ReadonlyArray<ReadonlySet<StepKind>>;
}

export interface BlueprintV2 {
  warm_up: SectionBlueprint;
  main_set: SectionBlueprint;
  cool_down: SectionBlueprint;
}

export interface GenerationSpecV2 {
  archetype: ArchetypeContract;
  blueprint: BlueprintV2;
  requested_tags: ReadonlyArray<string>;
  forced_by_tags: boolean;
  pool_length?: 25 | 50;
  distance_min?: number;
  distance_max?: number;
}

