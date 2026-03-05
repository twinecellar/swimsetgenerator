// Port of swim_planner_llm/style_inference.py

import type { HistoricSession } from './types';

const VARIED_REQUEST_TAGS = new Set(['fun', 'mixed', 'technique', 'speed', 'kick']);
const STRAIGHTFORWARD_REQUEST_TAGS = new Set(['recovery', 'steady', 'freestyle']);
const VARIED_HISTORY_TAGS = new Set(['fun', 'mixed', 'varied', 'technique']);

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const cleaned = t.trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export function inferPreferVaried(
  requestedTags: string[],
  historicSessions: HistoricSession[],
): boolean {
  let score = 0;

  for (const tag of normalizeTags(requestedTags)) {
    if (VARIED_REQUEST_TAGS.has(tag)) score += 2;
    if (STRAIGHTFORWARD_REQUEST_TAGS.has(tag)) score -= 1;
  }

  for (const session of historicSessions) {
    const tags = new Set(normalizeTags(session.tags));
    const variedLike = [...tags].some((t) => VARIED_HISTORY_TAGS.has(t));
    if (!variedLike) continue;
    if (session.thumb === 1) score += 1;
    else if (session.thumb === 0) score -= 1;
  }

  return score > 0;
}
