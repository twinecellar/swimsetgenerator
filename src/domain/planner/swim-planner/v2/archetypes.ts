import type { StepKind } from "../types";
import type { ArchetypeContract, ArchetypeId } from "./types";

function kinds(...values: StepKind[]): ReadonlySet<StepKind> {
  return new Set(values);
}

function tags(...values: string[]): ReadonlySet<string> {
  return new Set(values);
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeContract> = {
  flow_reset: {
    archetype_id: "flow_reset",
    display_name: "Flow Reset",
    min_main_steps: 1,
    max_main_steps: 5,
    allowed_main_kinds: kinds("continuous", "intervals", "build"),
    trigger_tags: tags("recovery"),
    routing_priority: 80,
    allow_hypoxic_if_tagged: false,
    allow_underwater_if_tagged: false,
  },
  cruise_builder: {
    archetype_id: "cruise_builder",
    display_name: "Cruise Builder",
    min_main_steps: 2,
    max_main_steps: 6,
    allowed_main_kinds: kinds("intervals", "build", "negative_split", "continuous"),
    trigger_tags: tags("steady", "endurance"),
    routing_priority: 70,
    allow_hypoxic_if_tagged: true,
    allow_underwater_if_tagged: false,
  },
  playful_alternator: {
    archetype_id: "playful_alternator",
    display_name: "Playful Alternator",
    min_main_steps: 3,
    max_main_steps: 5,
    allowed_main_kinds: kinds("intervals", "continuous"),
    trigger_tags: tags("fun","mixed","speed"),
    routing_priority: 100,
    allow_hypoxic_if_tagged: true,
    allow_underwater_if_tagged: false,
  },
  mini_block_roulette: {
    archetype_id: "mini_block_roulette",
    display_name: "Mini Block Roulette",
    min_main_steps: 3,
    max_main_steps: 6,
    allowed_main_kinds: kinds("intervals", "continuous", "build", "broken", "fartlek"),
    trigger_tags: tags("fun","mixed","speed"),
    routing_priority: 90,
    allow_hypoxic_if_tagged: true,
    allow_underwater_if_tagged: false,
  },
  stroke_switch_ladder: {
    archetype_id: "stroke_switch_ladder",
    display_name: "Stroke-Switch Ladder",
    min_main_steps: 1,
    max_main_steps: 2,
    allowed_main_kinds: kinds("pyramid", "ascending", "descending", "intervals"),
    trigger_tags: tags("mixed","fun"),
    routing_priority: 50,
    allow_hypoxic_if_tagged: true,
    allow_underwater_if_tagged: false,
  },
  punchy_pops: {
    archetype_id: "punchy_pops",
    display_name: "Punchy Pops",
    min_main_steps: 1,
    max_main_steps: 2,
    allowed_main_kinds: kinds("intervals", "build", "broken"),
    trigger_tags: tags("speed", "sprints","fun"),
    routing_priority: 60,
    allow_hypoxic_if_tagged: true,
    allow_underwater_if_tagged: true,
  },
  gear_change_up: {
    archetype_id: "gear_change_up",
    display_name: "Gear Change-Up",
    min_main_steps: 2,
    max_main_steps: 6,
    allowed_main_kinds: kinds("intervals", "continuous", "build"),
    trigger_tags: tags("fins", "pull", "paddles"),
    routing_priority: 20,
    allow_hypoxic_if_tagged: false,
    allow_underwater_if_tagged: false,
  },
  technique_refresh: {
    archetype_id: "technique_refresh",
    display_name: "Technique Refresh",
    min_main_steps: 2,
    max_main_steps: 4,
    allowed_main_kinds: kinds("intervals", "continuous", "build"),
    trigger_tags: tags("technique"),
    routing_priority: 10,
    allow_hypoxic_if_tagged: false,
    allow_underwater_if_tagged: false,
  },
  choice_session: {
    archetype_id: "choice_session",
    display_name: "Choice Session",
    min_main_steps: 2,
    max_main_steps: 3,
    allowed_main_kinds: kinds("intervals", "continuous"),
    trigger_tags: tags("choice"),
    routing_priority: 40,
    allow_hypoxic_if_tagged: false,
    allow_underwater_if_tagged: false,
  },
  benchmark_lite: {
    archetype_id: "benchmark_lite",
    display_name: "Benchmark Lite",
    min_main_steps: 3,
    max_main_steps: 4,
    allowed_main_kinds: kinds("intervals", "build", "broken", "time_trial"),
    trigger_tags: tags("time_trial", "golf", "benchmark"),
    routing_priority: 30,
    allow_hypoxic_if_tagged: false,
    allow_underwater_if_tagged: false,
  },
};

export const DISPLAY_NAME_TO_ID: Record<string, ArchetypeId> = Object.fromEntries(
  Object.entries(ARCHETYPES).map(([id, contract]) => [contract.display_name.toLowerCase(), id as ArchetypeId]),
) as Record<string, ArchetypeId>;
