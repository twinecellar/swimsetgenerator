import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppEnv } from "../config/env";
import type { Effort, GeneratedPlan, PlanRequest } from "../domain/contracts/plan-types";
import {
  findInvalidRequestedTags,
  isDurationMinutes,
  normalizeRequestedTags,
  REQUESTED_TAG_ALLOWLIST,
} from "../domain/contracts/request-options";
import { getLLMFailureResponse } from "../domain/planner/llm-failures";
import { plannerSectionsToSegments } from "../domain/planner/transform";
import { runSwimPlannerLLM, type SwimPlannerPayload } from "../domain/planner/swim_planner_llm";
import { extractBearerToken } from "../lib/http/bearer";
import { isAuthRateLimitError } from "../lib/supabase/auth";
import { createSupabaseUserClient } from "../lib/supabase/client";

type GenerateLimitEntry = { count: number; resetAt: number };

function getAuthHeader(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function createGenerateLimiter(limitMax: number, limitWindowMs: number) {
  const store = new Map<string, GenerateLimitEntry>();

  return {
    isRateLimited(subject: string): boolean {
      const now = Date.now();
      const current = store.get(subject);

      if (!current || now >= current.resetAt) {
        store.set(subject, { count: 1, resetAt: now + limitWindowMs });
        return false;
      }

      if (current.count >= limitMax) return true;
      current.count += 1;
      store.set(subject, current);
      return false;
    },
  };
}

async function getAuthenticatedUserContext(request: FastifyRequest, reply: FastifyReply, env: AppEnv) {
  const accessToken = extractBearerToken(getAuthHeader(request));
  if (!accessToken) {
    reply.code(401).send({ error: "Missing bearer token" });
    return null;
  }

  const supabase = createSupabaseUserClient({ env, accessToken });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError) {
    const status = isAuthRateLimitError(authError) ? 429 : 401;
    reply.code(status).send({ error: status === 429 ? "Too many auth requests" : "Unauthorized" });
    return null;
  }

  const user = authData.user;
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }

  return { user, supabase };
}

export async function registerPlanRoutes(app: FastifyInstance, env: AppEnv) {
  const limiter = createGenerateLimiter(env.generateLimitMax, env.generateLimitWindowMs);

  async function handleGenerate(request: FastifyRequest, reply: FastifyReply) {
    const ctx = await getAuthenticatedUserContext(request, reply, env);
    if (!ctx) return;
    const { user, supabase } = ctx;

    if (limiter.isRateLimited(user.id)) {
      reply.code(429).send({ error: "Too many generate requests", code: "RATE_LIMITED" });
      return;
    }

    const rawBody = request.body;
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      reply.code(400).send({ error: "request body must be a JSON object" });
      return;
    }

    const body = rawBody as {
      duration_minutes?: number;
      effort?: Effort;
      requested_tags?: unknown;
      regen_attempt?: unknown;
      fun_mode?: unknown;
    };

    if (Object.prototype.hasOwnProperty.call(body, "fun_mode")) {
      reply.code(400).send({ error: "fun_mode is no longer supported" });
      return;
    }

    if (!isDurationMinutes(body.duration_minutes ?? NaN)) {
      reply.code(400).send({ error: "duration_minutes must be one of 15,20,25,30,35,40,45,50,55,60" });
      return;
    }

    if (!["easy", "medium", "hard"].includes(body.effort ?? "")) {
      reply.code(400).send({ error: "effort must be one of 'easy', 'medium', or 'hard'" });
      return;
    }

    const invalidTags = findInvalidRequestedTags(body.requested_tags);
    if (invalidTags.length > 0) {
      reply
        .code(400)
        .send({ error: `requested_tags must only include: ${REQUESTED_TAG_ALLOWLIST.join(", ")}` });
      return;
    }

    let regenAttempt = 0;
    if (body.regen_attempt != null) {
      const n = typeof body.regen_attempt === "number" ? body.regen_attempt : Number(body.regen_attempt);
      if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0 || n > 50) {
        reply.code(400).send({ error: "regen_attempt must be an integer between 0 and 50" });
        return;
      }
      regenAttempt = n;
    }

    const requestedTags = normalizeRequestedTags(body.requested_tags);
    const durationMinutes = body.duration_minutes as PlanRequest["duration_minutes"];
    const effort = body.effort as Effort;

    const [{ data: profileRow }, { data: completions }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("plan_completions")
        .select("*")
        .eq("user_id", user.id)
        .in("rating", [0, 1])
        .order("completed_at", { ascending: false })
        .limit(30),
    ]);

    if (!profileRow) {
      reply.code(400).send({ error: "Profile required", code: "NO_PROFILE" });
      return;
    }

    const requestInput: PlanRequest = {
      duration_minutes: durationMinutes,
      effort,
      requested_tags: requestedTags,
    };

    const completionPlanIds = (completions ?? [])
      .map((completion) => completion.plan_id as string)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const { data: completionPlans } = completionPlanIds.length
      ? await supabase.from("plans").select("id, plan").eq("user_id", user.id).in("id", completionPlanIds)
      : { data: [] as any[] };

    const planById = new Map<string, any>(
      (completionPlans ?? [])
        .filter((plan) => plan && typeof plan.id === "string")
        .map((plan) => [plan.id as string, plan.plan]),
    );

    type HistoricSessionPayload = {
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
    };

    const payload: SwimPlannerPayload = {
      session_requested: {
        duration_minutes: requestInput.duration_minutes,
        effort: requestInput.effort,
        requested_tags: requestInput.requested_tags ?? [],
        swim_level: profileRow.swim_level ?? undefined,
      },
      historic_sessions: (completions ?? [])
        .map((completion): HistoricSessionPayload | null => {
          const linkedPlan = planById.get(completion.plan_id as string);
          const duration = linkedPlan?.duration_minutes;
          const distance = linkedPlan?.estimated_distance_m;
          const archetypeName = linkedPlan?.metadata?.archetype_name;
          const rating = completion.rating as 0 | 1;
          const tags = (completion.tags as string[]) ?? [];

          if (typeof duration !== "number" || typeof distance !== "number") return null;
          if (rating !== 0 && rating !== 1) return null;

          const inferredMainTitle =
            typeof archetypeName === "string" && archetypeName.trim().length > 0
              ? `Main Set — ${archetypeName.trim()}`
              : undefined;

          return {
            session_plan: {
              duration_minutes: duration,
              estimated_distance_m: distance,
              ...(inferredMainTitle ? { sections: { main_set: { title: inferredMainTitle } } } : {}),
            },
            thumb: rating,
            tags,
          };
        })
        .filter((value): value is HistoricSessionPayload => value !== null),
      requested_tags: [],
      regen_attempt: regenAttempt,
    };

    try {
      const { plan: llmPlan, spec } = await runSwimPlannerLLM(payload);
      const segments = plannerSectionsToSegments([
        llmPlan.sections.warm_up,
        llmPlan.sections.main_set,
        llmPlan.sections.cool_down,
      ]);
      const totalDistanceM = segments.reduce((sum, segment) => sum + segment.distance_m, 0);

      const plan: GeneratedPlan = {
        duration_minutes: llmPlan.duration_minutes,
        estimated_distance_m: totalDistanceM,
        segments,
        metadata: {
          version: "llm_v2",
          swim_level: profileRow.swim_level,
          input_effort: requestInput.effort,
          archetype_id: spec.archetype.archetype_id,
          archetype_name: spec.archetype.display_name,
          forced_by_tags: spec.forced_by_tags,
        },
      };

      reply.send({ plan, request: requestInput });
    } catch (error) {
      request.log.error({ error }, "LLM generation failed");
      reply.code(500).send(getLLMFailureResponse(error));
    }
  }

  async function handleAccept(request: FastifyRequest, reply: FastifyReply) {
    const ctx = await getAuthenticatedUserContext(request, reply, env);
    if (!ctx) return;
    const { user, supabase } = ctx;

    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      reply.code(400).send({ error: "request body must be a JSON object" });
      return;
    }

    const payload = body as { request: Record<string, unknown>; plan: Record<string, unknown> };

    if (!payload.request || typeof payload.request !== "object") {
      reply.code(400).send({ error: "request payload is required" });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(payload.request, "fun_mode")) {
      reply.code(400).send({ error: "fun_mode is no longer supported" });
      return;
    }

    const normalizedRequest = {
      ...payload.request,
      requested_tags: normalizeRequestedTags(payload.request.requested_tags),
    };

    const generatorVersion =
      payload.plan &&
      typeof payload.plan === "object" &&
      typeof (payload.plan as any).metadata?.version === "string"
        ? ((payload.plan as any).metadata.version as string)
        : "unknown";

    const { data, error } = await supabase
      .from("plans")
      .insert({
        user_id: user.id,
        status: "accepted",
        request: normalizedRequest,
        plan: payload.plan,
        generator_version: generatorVersion,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      reply.code(400).send({ error: error.message });
      return;
    }

    reply.send({ plan: data });
  }

  async function handleComplete(
    request: FastifyRequest<{ Params: { id: string }; Body: { rating?: 0 | 1 | null; tags?: string[]; notes?: string | null } }>,
    reply: FastifyReply,
  ) {
    const ctx = await getAuthenticatedUserContext(request, reply, env);
    if (!ctx) return;
    const { user, supabase } = ctx;

    const planId = request.params.id;
    const body = request.body ?? {};
    const rating = body.rating ?? null;

    if (rating !== null && rating !== 0 && rating !== 1) {
      reply.code(400).send({ error: "Rating must be 0 (thumbs down) or 1 (thumbs up)." });
      return;
    }

    const { data: existingPlan, error: planError } = await supabase.from("plans").select("*").eq("id", planId).maybeSingle();

    if (planError || !existingPlan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }

    const { data: completion, error: completionError } = await supabase
      .from("plan_completions")
      .insert({
        plan_id: planId,
        user_id: user.id,
        rating,
        tags: body.tags ?? [],
        notes: body.notes ?? null,
      })
      .select("*")
      .maybeSingle();

    if (completionError) {
      reply.code(400).send({ error: completionError.message });
      return;
    }

    const { error: updateError } = await supabase.from("plans").update({ status: "completed" }).eq("id", planId);

    if (updateError) {
      reply.code(400).send({ error: updateError.message });
      return;
    }

    reply.send({ completion });
  }

  app.post("/v1/plans/generate", handleGenerate);
  app.post("/api/mobile/plans/generate", handleGenerate);

  app.post("/v1/plans/accept", handleAccept);
  app.post("/api/plans/accept", handleAccept);

  app.post("/v1/plans/:id/complete", handleComplete);
  app.post("/api/plans/:id/complete", handleComplete);
}
