import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { requireEnv } from "./env";

/**
 * Server-side client acting as the signed-in owner: it sends their Clerk
 * session token, so Postgres RLS applies. Use it for every owner read.
 */
export function createOwnerClient(): SupabaseClient<Database> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = requireEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return createClient<Database>(url, publishableKey, {
    // Read per request, so the token is never stale or shared between users.
    accessToken: async () => (await auth()).getToken(),
  });
}
