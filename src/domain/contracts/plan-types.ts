export type Effort = "easy" | "medium" | "hard";
export type PlanStatus = "generated" | "accepted" | "completed";
export type DurationMinutes = 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60;

export interface PlanRequest {
  duration_minutes: DurationMinutes;
  effort: Effort;
  requested_tags?: string[];
}

export interface PlanSegment {
  id: string;
  type: string;
  distance_m: number;
  stroke: string;
  description: string;
  effort: Effort;
  repeats?: number;
  rest_seconds?: number;
  sendoff_seconds?: number;
}

export interface GeneratedPlan {
  duration_minutes: number;
  estimated_distance_m: number;
  segments: PlanSegment[];
  metadata: {
    version: string;
    swim_level: string;
    input_effort: Effort;
    archetype_id?: string;
    archetype_name?: string;
    forced_by_tags?: boolean;
  };
}

export interface PlanRow {
  id: string;
  created_at: string;
  status: Exclude<PlanStatus, "generated">;
  request: PlanRequest;
  plan: GeneratedPlan;
}

export interface CompletionRow {
  plan_id: string;
  rating: 0 | 1 | null;
  tags: string[];
  notes: string | null;
  completed_at: string;
}
