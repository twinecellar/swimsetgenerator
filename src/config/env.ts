export interface AppEnv {
  port: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  generateLimitMax: number;
  generateLimitWindowMs: number;
}

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
    generateLimitMax: parseIntOrDefault(process.env.GENERATE_LIMIT_MAX, 20),
    generateLimitWindowMs: parseIntOrDefault(process.env.GENERATE_LIMIT_WINDOW_MS, 60_000),
  };
}
