import fs from "node:fs";
import path from "node:path";

export interface AppEnv {
  port: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  corsOrigin: string;
  generateLimitMax: number;
  generateLimitWindowMs: number;
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] != null) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    const quote = value[0];
    if ((quote === `"` || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function bootstrapEnv(): void {
  const root = process.cwd();
  loadEnvFile(path.join(root, ".env"));
  loadEnvFile(path.join(root, ".env.local"));
}

bootstrapEnv();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  throw new Error(`Missing environment variable ${name}`);
}

function parseIntOrDefault(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function getEnv(): AppEnv {
  return {
    port: parseIntOrDefault(process.env.PORT, 3000),
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseAnonKey: requireEnv("SUPABASE_ANON_KEY"),
    corsOrigin: process.env.CORS_ORIGIN?.trim() || "*",
    generateLimitMax: parseIntOrDefault(process.env.GENERATE_LIMIT_MAX, 20),
    generateLimitWindowMs: parseIntOrDefault(process.env.GENERATE_LIMIT_WINDOW_MS, 60_000),
  };
}
