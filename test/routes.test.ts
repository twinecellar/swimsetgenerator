import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseUserClientMock, runSwimPlannerLLMMock } = vi.hoisted(() => ({
  createSupabaseUserClientMock: vi.fn(),
  runSwimPlannerLLMMock: vi.fn(async () => ({
    plan: {
      duration_minutes: 30,
      estimated_distance_m: 1200,
      sections: {
        warm_up: { title: "Warm Up", section_distance_m: 300, steps: [] },
        main_set: { title: "Main Set", section_distance_m: 700, steps: [] },
        cool_down: { title: "Cool Down", section_distance_m: 200, steps: [] },
      },
    },
    spec: {
      archetype: { archetype_id: "flow_reset", display_name: "Flow Reset" },
      forced_by_tags: false,
    },
  })),
}));

vi.mock("../src/domain/planner/swim_planner_llm", () => ({
  runSwimPlannerLLM: runSwimPlannerLLMMock,
}));

vi.mock("../src/lib/supabase/client", () => ({
  createSupabaseUserClient: createSupabaseUserClientMock,
}));

import { buildApp } from "../src/app";

function chain<T>(value: T) {
  return {
    eq: () => chain(value),
    in: () => chain(value),
    order: () => chain(value),
    limit: async () => value,
    maybeSingle: async () => value,
    select: () => chain(value),
    insert: () => chain(value),
    update: () => chain(value),
  } as any;
}

function makeSupabase(overrides?: {
  profile?: any;
  completions?: any[];
  plansInsert?: any;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: (table: string) => {
      if (table === "profiles") return { select: () => chain({ data: overrides?.profile ?? null, error: null }) };
      if (table === "plan_completions") {
        return {
          select: () => chain({ data: overrides?.completions ?? [], error: null }),
          insert: () => chain({ data: { id: "c1" }, error: null }),
        };
      }
      if (table === "plans") {
        return {
          select: () => chain({ data: [], error: null }),
          insert: () => chain({ data: overrides?.plansInsert ?? { id: "p1" }, error: null }),
          update: () => chain({ error: null }),
        };
      }
      return { select: () => chain({ data: null, error: null }) };
    },
  };
}

const env = {
  port: 3000,
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "anon",
  generateLimitMax: 20,
  generateLimitWindowMs: 60_000,
};

describe("routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthz", async () => {
    const app = buildApp(env);
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it("returns validation error for invalid duration on both route families", async () => {
    createSupabaseUserClientMock.mockReturnValue(makeSupabase({ profile: { swim_level: "intermediate" } }));
    const app = buildApp(env);

    const payload = { duration_minutes: 33, effort: "medium", requested_tags: [] };
    const headers = { authorization: "Bearer token" };

    const modern = await app.inject({ method: "POST", url: "/v1/plans/generate", headers, payload });
    const compat = await app.inject({ method: "POST", url: "/api/mobile/plans/generate", headers, payload });

    expect(modern.statusCode).toBe(400);
    expect(compat.statusCode).toBe(400);
    expect(modern.json().error).toContain("duration_minutes");
    expect(compat.json().error).toContain("duration_minutes");

    await app.close();
  });

  it("returns NO_PROFILE when profile missing", async () => {
    createSupabaseUserClientMock.mockReturnValue(makeSupabase({ profile: null }));
    const app = buildApp(env);

    const res = await app.inject({
      method: "POST",
      url: "/v1/plans/generate",
      headers: { authorization: "Bearer token" },
      payload: { duration_minutes: 30, effort: "medium", requested_tags: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("NO_PROFILE");
    await app.close();
  });
});
