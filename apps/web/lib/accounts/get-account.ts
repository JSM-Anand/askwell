import "server-only";
import { PLANS } from "@askwell/shared";
import type { Plan } from "@askwell/shared";
import { createOwnerClient } from "../supabase/owner";

export type Account = {
  clerkUserId: string;
  plan: Plan;
  createdAt: string;
};

const isPlan = (value: string): value is Plan => (PLANS as readonly string[]).includes(value);

/** "Free plan", "Pro plan". */
export const planLabel = (plan: Plan): string => `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;

/**
 * The signed-in owner's account, read with the owner client. RLS scopes the
 * query to their own row, so there is no owner filter here. The plan comes from
 * the database, never from the client. Returns null if there is no visible row.
 */
export async function getAccount(): Promise<Account | null> {
  const { data, error } = await createOwnerClient()
    .from("accounts")
    .select("clerk_user_id, plan, created_at")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read the account: ${error.message}`);
  }
  if (!data) return null;
  if (!isPlan(data.plan)) {
    throw new Error(`Unknown plan "${data.plan}" on the account row`);
  }
  return { clerkUserId: data.clerk_user_id, plan: data.plan, createdAt: data.created_at };
}
