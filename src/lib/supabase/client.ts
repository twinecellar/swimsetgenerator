import { createClient } from "@supabase/supabase-js";
import type { AppEnv } from "../../config/env";

export function createSupabaseUserClient(args: { env: AppEnv; accessToken: string }) {
  return createClient(args.env.supabaseUrl, args.env.supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
      },
    },
  });
}
