import { getEnv } from "./config/env";
import { buildApp } from "./app";

async function main() {
  const env = getEnv();
  const app = buildApp(env);

  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
