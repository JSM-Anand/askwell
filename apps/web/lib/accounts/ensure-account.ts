import "server-only";
import { createServiceClient } from "../supabase/service";

/**
 * Creates the `accounts` row (plan `free`) for a Clerk user. Owners can't insert
 * under RLS, so this uses the service client. Pass an ID that came from the
 * verified Clerk session, never from the request.
 *
 * `ignoreDuplicates` makes it `on conflict do nothing`: a second call, or two
 * first loads at once, neither error nor touch an existing row (so a Pro plan
 * is never reset to free).
 */
export async function ensureAccount(clerkUserId: string): Promise<void> {
  const { error } = await createServiceClient()
    .from("accounts")
    .upsert(
      { clerk_user_id: clerkUserId, plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );

  if (error) {
    throw new Error(`Could not create the account row: ${error.message}`);
  }
}
