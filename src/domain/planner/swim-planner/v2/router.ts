import type { HistoricSession, SwimPlanInput } from "../types";
import { ARCHETYPES, DISPLAY_NAME_TO_ID } from "./archetypes";
import { buildBlueprintV2 } from "./blueprint";
import type { ArchetypeId, GenerationSpecV2 } from "./types";

const RISK_TAGS = new Set(["pace-too-fast", "long", "tiring"]);
const TAG_ALIASES: Record<string, string> = {
  endurnce: "endurance",
};

function normalizeTags(tags: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of tags) {
    const cleaned = (value ?? "").toString().trim().toLowerCase();
    const canonical = TAG_ALIASES[cleaned] ?? cleaned;
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

function mergedRequestedTags(payload: SwimPlanInput): string[] {
  return normalizeTags([
    ...(payload.session_requested.requested_tags ?? []),
    ...(payload.requested_tags ?? []),
  ]);
}

function hasSensitiveDownFeedback(historicSessions: HistoricSession[]): boolean {
  for (const session of historicSessions) {
    if (session.thumb !== 0) continue;
    const lowered = new Set(normalizeTags(session.tags ?? []));
    if ([...lowered].some((t) => RISK_TAGS.has(t))) return true;
  }
  return false;
}

function extractRecentArchetypeIds(historicSessions: HistoricSession[]): ArchetypeId[] {
  const seen = new Set<ArchetypeId>();
  const result: ArchetypeId[] = [];
  for (let i = historicSessions.length - 1; i >= 0; i -= 1) {
    const title = historicSessions[i]?.session_plan?.sections?.main_set?.title;
    if (typeof title !== "string" || !title.includes("—")) continue;
    const idx = title.indexOf("—");
    const name = title.slice(idx + 1).trim().toLowerCase();
    if (!name) continue;
    const id = DISPLAY_NAME_TO_ID[name];
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result; // most recent first
}

function routeArchetypeId(payload: SwimPlanInput, requestedTags: Set<string>, regenAttempt: number): [ArchetypeId, boolean] {
  const matches = Object.values(ARCHETYPES).filter((a) => {
    for (const t of a.trigger_tags) {
      if (requestedTags.has(t)) return true;
    }
    return false;
  });

  if (matches.length > 0) {
    const recentIds = extractRecentArchetypeIds(payload.historic_sessions ?? []);
    const sorted = [...matches].sort((a, b) => {
      const aIdx = recentIds.indexOf(a.archetype_id);
      const bIdx = recentIds.indexOf(b.archetype_id);
      const aScore = aIdx === -1 ? Infinity : aIdx;
      const bScore = bIdx === -1 ? Infinity : bIdx;
      if (aScore !== bScore) return bScore - aScore; // least recently used first
      return a.routing_priority - b.routing_priority; // tiebreak by priority
    });
    const winner = sorted[regenAttempt % sorted.length];
    let archetypeId = winner.archetype_id;
    if (archetypeId === "stroke_switch_ladder" && payload.session_requested.swim_level === "beginner") {
      archetypeId = "mini_block_roulette";
    }
    return [archetypeId, true];
  }

  return ["flow_reset", false];
}

function rotateIfRepeating(
  archetypeId: ArchetypeId,
  opts: { lastArchetypeId: ArchetypeId | null; forcedByTags: boolean },
): ArchetypeId {
  if (opts.forcedByTags) return archetypeId;
  if (!opts.lastArchetypeId || archetypeId !== opts.lastArchetypeId) return archetypeId;

  const rotation: Partial<Record<ArchetypeId, ArchetypeId>> = {
    mini_block_roulette: "playful_alternator",
    playful_alternator: "mini_block_roulette",
    cruise_builder: "flow_reset",
    flow_reset: "cruise_builder",
  };

  return rotation[archetypeId] ?? archetypeId;
}

export function buildGenerationSpecV2(payload: SwimPlanInput): GenerationSpecV2 {
  const tagsList = mergedRequestedTags(payload);
  const requestedTags = new Set(tagsList);

  const regenAttemptRaw = payload.regen_attempt;
  const regenAttempt =
    typeof regenAttemptRaw === "number" && Number.isFinite(regenAttemptRaw)
      ? Math.max(0, Math.floor(regenAttemptRaw))
      : 0;

  let [archetypeId, forcedByTags] = routeArchetypeId(payload, requestedTags, regenAttempt);

  const sensitive = hasSensitiveDownFeedback(payload.historic_sessions ?? []);
  if (sensitive && (archetypeId === "stroke_switch_ladder" || archetypeId === "punchy_pops")) {
    if (archetypeId === "stroke_switch_ladder" && !requestedTags.has("mixed")) {
      archetypeId = "cruise_builder";
    }
    if (archetypeId === "punchy_pops" && !(requestedTags.has("speed") || requestedTags.has("sprints"))) {
      archetypeId = "flow_reset";
    }
  }

  const recentIds = extractRecentArchetypeIds(payload.historic_sessions ?? []);
  archetypeId = rotateIfRepeating(archetypeId, { lastArchetypeId: recentIds[0] ?? null, forcedByTags });

  const archetype = ARCHETYPES[archetypeId];
  const blueprint = buildBlueprintV2(archetype, payload, { regenerate: regenAttempt > 0, regenAttempt });

  return {
    archetype,
    blueprint,
    requested_tags: tagsList,
    forced_by_tags: forcedByTags,
  };
}
