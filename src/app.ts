import Fastify from "fastify";

import type { AppEnv } from "./config/env";
import { registerPlanRoutes } from "./routes/plans";

export function buildApp(env: AppEnv) {
  const app = Fastify({ logger: true });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/", async () => ({ ok: true }));

  app.register(async (instance) => {
    await registerPlanRoutes(instance, env);
  });

  return app;
}
