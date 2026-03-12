import type { HistoricSession } from './types';

// ── Schema example ────────────────────────────────────────────────────────────

export function schemaExcerpt(): string {
  const example = {
    plan_id: 'uuid',
    created_at: 'ISO-8601 datetime',
    duration_minutes: 20,
    estimated_distance_m: 1150,
    sections: {
      warm_up: {
        title: 'Warm-up',
        section_distance_m: 200,
        steps: [
          {
            step_id: 'wu-1',
            kind: 'continuous',
            reps: 1,
            distance_per_rep_m: 200,
            stroke: 'freestyle',
            rest_seconds: null,
            effort: 'easy',
            description: 'Easy relaxed warm-up swim.',
          },
        ],
      },
      main_set: {
        title: 'Main Set',
        section_distance_m: 850,
        steps: [
          {
            step_id: 'main-1',
            kind: 'intervals',
            reps: 4,
            distance_per_rep_m: 100,
            stroke: 'freestyle',
            rest_seconds: null,
            sendoff_seconds: 120,
            effort: 'hard',
            description: 'Hold a strong controlled pace off the 2-minute clock — earn your rest by swimming faster.',
            underwater: false,
            pull: false,
            paddles: false,
            broken_pause_s: null,
            target_time_s: null,
          },
          {
            step_id: 'main-2',
            kind: 'pyramid',
            reps: 5,
            distance_per_rep_m: 50,
            pyramid_sequence_m: [50, 100, 150, 100, 50],
            stroke: 'freestyle',
            rest_seconds: null,
            rest_sequence_s: [10, 15, 20, 15, 10],
            effort: 'medium',
            description: 'Build up and back down — push harder on each rep, then hold your pace on the way back.',
            hypoxic: false,
          },
        ],
      },
      cool_down: {
        title: 'Cool-down',
        section_distance_m: 100,
        steps: [
          {
            step_id: 'cd-1',
            kind: 'continuous',
            reps: 1,
            distance_per_rep_m: 100,
            stroke: 'choice',
            rest_seconds: null,
            effort: 'easy',
            description: 'Easy cooldown.',
          },
        ],
      },
    },
  };
  return JSON.stringify(example, null, 2);
}

// ── History summarisation ─────────────────────────────────────────────────────

function extractDistance(session: HistoricSession): number | null {
  const v = session.session_plan?.estimated_distance_m;
  return typeof v === 'number' && v > 0 ? v : null;
}

function extractMainSetKinds(session: HistoricSession): Set<string> {
  const steps: unknown[] =
    (session.session_plan as any)?.sections?.main_set?.steps ?? [];
  const kinds = new Set<string>();
  for (const s of steps) {
    if (s && typeof s === 'object' && typeof (s as any).kind === 'string') {
      kinds.add((s as any).kind);
    }
  }
  return kinds;
}

function extractMainSetStrokes(session: HistoricSession): Set<string> {
  const steps: unknown[] =
    (session.session_plan as any)?.sections?.main_set?.steps ?? [];
  const strokes = new Set<string>();
  for (const s of steps) {
    if (s && typeof s === 'object' && typeof (s as any).stroke === 'string') {
      strokes.add((s as any).stroke);
    }
  }
  return strokes;
}

export function summarizeHistory(historicSessions: HistoricSession[]): string {
  const upDistances: number[] = [];
  const downDistances: number[] = [];
  const upTags = new Set<string>();
  const downTags = new Set<string>();
  let dislikedLongHardContinuous = false;
  let likedIntervalSessions = 0;
  let likedContinuousSessions = 0;
  const likedStrokeCounts = new Map<string, number>();

  for (const item of historicSessions) {
    const d = extractDistance(item);
    const tags = new Set(item.tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
    const kinds = extractMainSetKinds(item);
    const strokes = extractMainSetStrokes(item);

    if (item.thumb === 1) {
      if (d !== null) upDistances.push(d);
      tags.forEach((t) => upTags.add(t));
      if (kinds.has('intervals')) likedIntervalSessions += 1;
      else if (kinds.has('continuous')) likedContinuousSessions += 1;
      for (const stroke of strokes) {
        if (stroke !== 'mixed' && stroke !== 'choice') {
          likedStrokeCounts.set(stroke, (likedStrokeCounts.get(stroke) ?? 0) + 1);
        }
      }
    } else {
      if (d !== null) downDistances.push(d);
      tags.forEach((t) => downTags.add(t));
      if (['pace-too-fast', 'long', 'tiring'].some((r) => tags.has(r))) {
        dislikedLongHardContinuous = true;
      }
    }
  }

  function range(values: number[]): string {
    if (values.length === 0) return 'none';
    return `${Math.min(...values)}-${Math.max(...values)}m`;
  }

  const guidance: string[] = [];

  if (upDistances.length > 0) {
    guidance.push(`Prefer volume near ${range(upDistances)}.`);
  } else {
    guidance.push('No positive volume signal available.');
  }

  if (downDistances.length > 0) {
    guidance.push(`Avoid volume near ${range(downDistances)} unless strongly required.`);
  }

  if (upTags.size > 0) {
    guidance.push(`Positive themes: ${JSON.stringify([...upTags].sort())}.`);
  }

  if (downTags.size > 0) {
    guidance.push(`Negative themes: ${JSON.stringify([...downTags].sort())}.`);
  }

  if (dislikedLongHardContinuous) {
    guidance.push('Avoid long hard continuous main sets; prefer intervals instead.');
  }

  if (likedIntervalSessions > likedContinuousSessions) {
    guidance.push('Historic preference: interval-based main sets over continuous.');
  } else if (likedContinuousSessions > likedIntervalSessions) {
    guidance.push('Historic preference: continuous main sets over intervals.');
  }

  if (likedStrokeCounts.size > 0) {
    const topStrokes = [...likedStrokeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([stroke]) => stroke);
    guidance.push(`Preferred strokes in liked sessions: ${JSON.stringify(topStrokes)}.`);
  }

  return guidance.join(' ');
}

// ── Swim level guidance ───────────────────────────────────────────────────────

export function swimLevelHint(level: string): string {
  const map: Record<string, string> = {
    beginner:
      'This swimmer is new to structured swim training. ' +
      'Use simple, familiar formats only — continuous swims and straightforward intervals. ' +
      'No pyramids, descending sets, or multi-step main sets. ' +
      'Keep rest generous (30-45s between intervals). ' +
      'Step descriptions must be especially clear and encouraging — avoid any assumed knowledge. ' +
      'Favour shorter rep distances (50-100m per rep). ' +
      'Do not use drill names without explaining them briefly in the description.',
    intermediate:
      'This swimmer understands basic interval formats and rest-based sets. ' +
      'Standard interval structures, continuous swims, and simple pyramids are all appropriate. ' +
      'Rest can be moderate (15-30s). ' +
      'Step descriptions can assume basic swim literacy (e.g. the swimmer knows what a pull buoy is). ' +
      'Avoid highly technical drill circuits unless the technique tag is requested.',
    advanced:
      'This swimmer is comfortable with interval training, understands pace and effort, ' +
      'and can follow complex set structures. ' +
      'Pyramids, descending sets, ascending sets, negative splits, and drill circuits are all appropriate. ' +
      'Rest periods can be shorter (10-20s for hard efforts). ' +
      'Step descriptions can be concise and technically precise. ' +
      'Challenge the swimmer — do not over-simplify.',
  };
  return map[level] ?? '';
}

// ── Natural metres-per-minute by effort ───────────────────────────────────────

const NATURAL_DPM: Record<string, number> = { easy: 37, medium: 33, hard: 27 };

// ── Distance guidance ─────────────────────────────────────────────────────────

export function distanceGuidance(
  durationMinutes: number,
  effort: string,
  distanceMin?: number,
  distanceMax?: number,
): string {
  if (distanceMin !== undefined && distanceMax !== undefined) {
    return (
      `Target estimated_distance_m: ${distanceMin}–${distanceMax}m. ` +
      `Use the SESSION DENSITY guidance to structure reps and rest to reach this target.`
    );
  }
  if (distanceMin !== undefined) {
    return (
      `Target estimated_distance_m: at least ${distanceMin}m. ` +
      `Use the SESSION DENSITY guidance to structure reps and rest to reach this target.`
    );
  }
  if (distanceMax !== undefined) {
    return (
      `Target estimated_distance_m: at most ${distanceMax}m. ` +
      `Use the SESSION DENSITY guidance to structure reps and rest within this cap.`
    );
  }

  const ppmByEffort: Record<string, [number, number]> = {
    easy: [32, 42],
    medium: [28, 38],
    hard: [22, 32],
  };

  const [loPpm, hiPpm] = ppmByEffort[effort] ?? [28, 38];

  const roundTo50 = (m: number) => Math.round(m / 50) * 50;

  const lo = roundTo50(durationMinutes * loPpm);
  const hi = roundTo50(durationMinutes * hiPpm);

  return (
    `Target estimated_distance_m for this request: ${lo}–${hi}m ` +
    `(derived from duration=${durationMinutes} and effort=${effort}; ` +
    `easy tends to be higher-volume, hard tends to be lower-volume).`
  );
}

// ── Session density guidance ──────────────────────────────────────────────────

export function sessionDensityGuidance(
  durationMinutes: number,
  effort: string,
  distanceMin?: number,
  distanceMax?: number,
): string {
  if (distanceMin === undefined && distanceMax === undefined) return '';

  const natural = NATURAL_DPM[effort] ?? 33;

  // Use midpoint for density calculation; skew toward the binding bound when only one is given
  let targetM: number;
  if (distanceMin !== undefined && distanceMax !== undefined) {
    targetM = (distanceMin + distanceMax) / 2;
  } else if (distanceMin !== undefined) {
    targetM = distanceMin * 1.05; // aim slightly above the floor
  } else {
    targetM = distanceMax! * 0.92; // aim slightly below the ceiling
  }

  const targetDpm = targetM / durationMinutes;
  const densityRatio = targetDpm / natural;
  const targetRounded = Math.round(targetM / 50) * 50;
  const dpmRounded = Math.round(targetDpm);

  const header =
    `SESSION DENSITY: ~${targetRounded}m in ${durationMinutes}min ≈ ${dpmRounded}m/min ` +
    `(natural for ${effort}: ~${Math.round(natural)}m/min).`;

  if (densityRatio >= 1.2) {
    const pct = Math.round((densityRatio - 1) * 100);
    return (
      `${header} HIGH-density (+${pct}% — more volume, less rest).\n` +
      `To accumulate the required distance within the time limit:\n` +
      `- Prefer more reps of shorter distances (e.g. 10×50m rather than 4×100m).\n` +
      `- Use sendoff_seconds (not rest_seconds) on all interval steps; sendoffs keep the clock moving.\n` +
      `- Sendoff reference: 50m → 50–65s | 100m → 1:40–2:00 | 200m → 3:20–3:50.\n` +
      `- Keep warm-up and cool-down compact; assign the bulk of distance to the main set.\n` +
      `- Continuous steps are appropriate to accumulate volume efficiently.`
    );
  }

  if (densityRatio <= 0.8) {
    const pct = Math.round((1 - densityRatio) * 100);
    return (
      `${header} LOW-density (−${pct}% — fewer metres, more recovery time).\n` +
      `To spread the session across the reduced distance:\n` +
      `- Use lower rep counts; prefer fewer, longer reps.\n` +
      `- Use rest_seconds (not sendoff_seconds); rest generously: 40–90s between efforts.\n` +
      `- Allow full recovery between main-set efforts — quality matters more than volume.\n` +
      `- Warm-up and cool-down may be proportionally generous; this is a quality-focused session.`
    );
  }

  return (
    `${header} Normal density — apply standard EFFORT EXPRESSION guidelines above.`
  );
}

// ── Section proportion guidance ───────────────────────────────────────────────

export function sectionProportionGuidance(
  effort: string,
  durationMinutes: number,
  distanceMin?: number,
  distanceMax?: number,
  poolLength?: 25 | 50,
): string {
  const poolMultiple = poolLength === 25 ? 25 : 50;
  const roundToMultiple = (m: number) => Math.round(m / poolMultiple) * poolMultiple;

  const ppmByEffort: Record<string, [number, number]> = {
    easy: [32, 42],
    medium: [28, 38],
    hard: [22, 32],
  };

  const [loPpm, hiPpm] = ppmByEffort[effort] ?? [28, 38];

  const hasDistanceConstraint = distanceMin !== undefined || distanceMax !== undefined;

  let target: number;
  if (distanceMin !== undefined && distanceMax !== undefined) {
    target = roundToMultiple((distanceMin + distanceMax) / 2);
  } else if (distanceMin !== undefined) {
    target = roundToMultiple(distanceMin * 1.1);
  } else if (distanceMax !== undefined) {
    target = roundToMultiple(distanceMax * 0.9);
  } else {
    target = roundToMultiple(durationMinutes * (loPpm + hiPpm) / 2);
  }

  // Density-aware section fractions: high density compresses warm/cool to give more to main set
  const natural = NATURAL_DPM[effort] ?? 33;
  const densityRatio = (target / durationMinutes) / natural;

  let warmFrac: number;
  let coolFrac: number;
  if (densityRatio >= 1.2) {
    warmFrac = 0.14;
    coolFrac = 0.08;
  } else if (densityRatio <= 0.8) {
    warmFrac = effort === 'easy' ? 0.22 : 0.24;
    coolFrac = 0.16;
  } else {
    warmFrac = effort === 'easy' ? 0.20 : effort === 'medium' ? 0.22 : 0.28;
    coolFrac = 0.14;
  }

  const warm = Math.max(roundToMultiple(target * warmFrac), poolMultiple * 2);
  const cool = Math.max(roundToMultiple(target * coolFrac), poolMultiple * 2);

  let main = target - warm - cool;

  if (main < poolMultiple * 2) {
    const deficit = poolMultiple * 2 - main;

    const warmSlack = Math.max(0, warm - poolMultiple * 2);
    const takeFromWarm = Math.min(warmSlack, deficit);
    const newWarm = warm - takeFromWarm;

    const remaining = deficit - takeFromWarm;
    const coolSlack = Math.max(0, cool - poolMultiple * 2);
    const takeFromCool = Math.min(coolSlack, remaining);
    const newCool = cool - takeFromCool;

    main = target - newWarm - newCool;
    const total = newWarm + main + newCool;

    const rangeNote = hasDistanceConstraint
      ? ` — total ${total}m must stay within the required distance range`
      : '';
    return (
      `Section distances (all must be exact multiples of ${poolMultiple}m): ` +
      `warm_up ${newWarm}m, main_set ${main}m, cool_down ${newCool}m ` +
      `(total ${total}m${rangeNote}).`
    );
  }

  const total = warm + main + cool;
  const rangeNote = hasDistanceConstraint
    ? ` — total ${total}m must stay within the required distance range`
    : '';
  return (
    `Section distances (all must be exact multiples of ${poolMultiple}m): ` +
    `warm_up ${warm}m, main_set ${main}m, cool_down ${cool}m ` +
    `(total ${total}m${rangeNote}).`
  );
}
