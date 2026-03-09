import { getEnv } from "./config/env";
import { buildApp } from "./app";

async function main() {
  const env = getEnv();
  const app = buildApp(env);

  process.on("unhandledRejection", (error) => {
    app.log.error({ error }, "Unhandled promise rejection");
  });

  process.on("uncaughtException", (error) => {
    app.log.error({ error }, "Uncaught exception");
    process.exit(1);
  });

  process.on("SIGTERM", async () => {
    app.log.info("Received SIGTERM, shutting down");
    await app.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    app.log.info("Received SIGINT, shutting down");
    await app.close();
    process.exit(0);
  });

  try {
    app.log.info(
      {
        port: env.port,
        supabaseUrlSet: Boolean(env.supabaseUrl),
        supabaseAnonKeySet: Boolean(env.supabaseAnonKey),
        corsOrigin: env.corsOrigin,
      },
      "Starting swimsetgenerator",
    );
    await app.listen({ port: env.port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
