import Fastify from "fastify";

import type { AppEnv } from "./config/env";
import { registerPlanRoutes } from "./routes/plans";

export function buildApp(env: AppEnv) {
  const app = Fastify({ logger: true });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", env.corsOrigin);
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    if (request.method === "OPTIONS") {
      reply.code(204).send();
    }
  });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/", async () => ({ ok: true }));

  app.register(async (instance) => {
    await registerPlanRoutes(instance, env);
  });

  return app;
}
