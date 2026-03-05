import type { DurationMinutes } from "./plan-types";

export const DURATION_MINUTES_OPTIONS: DurationMinutes[] = [
  15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
];

export const REQUESTED_TAG_OPTIONS = [
  "technique",
  "speed",
  "endurance",
  "recovery",
  "fun",
  "steady",
  "freestyle",
  "mixed",
  "kick",
  "fins",
  "pull",
  "paddles",
  "golf",
  "broken",
  "fartlek",
  "time_trial",
] as const;

// UI chips intentionally remain stable; the API can accept additional tags as the
// planner evolves (e.g. v2 archetypes / safety flags).
export const REQUESTED_TAG_ALLOWLIST = [
  ...REQUESTED_TAG_OPTIONS,
  "sprints",
  "hypoxic",
  "underwater",
  "choice",
  "benchmark",
] as const;

const REQUESTED_TAG_SET = new Set<string>(REQUESTED_TAG_ALLOWLIST);
const DURATION_SET = new Set<number>(DURATION_MINUTES_OPTIONS);

export function isDurationMinutes(value: number): value is DurationMinutes {
  return DURATION_SET.has(value);
}

export function normalizeRequestedTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== "string") continue;

    const cleaned = item.trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    if (!REQUESTED_TAG_SET.has(cleaned)) continue;

    seen.add(cleaned);
    normalized.push(cleaned);
  }

  return normalized;
}

export function findInvalidRequestedTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    if (!REQUESTED_TAG_SET.has(cleaned)) {
      invalid.push(cleaned);
    }
  }

  return invalid;
}
