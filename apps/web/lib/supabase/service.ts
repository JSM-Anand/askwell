import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { requireEnv } from "./env";

/**
 * Server-only client with the secret key. It acts as `service_role` and skips
 * RLS. Use it only after the route has checked ownership and plan. This is the
 * only file that reads SUPABASE_SECRET_KEY.
 */
export function createServiceClient(): SupabaseClient<Database> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const secretKey = requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);

  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
