import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import type { Plan } from "@askwell/shared";
import { ensureAccount } from "../accounts/ensure-account";
import { trackUpgraded } from "../analytics/events";
import { createServiceClient } from "../supabase/service";

/** The slug of the paid plan in Clerk Billing. Events for any other plan are ignored. */
export const PRO_PLAN_SLUG = "pro";

/** Item states that still entitle the owner to Pro. `canceled` keeps Pro until the paid period ends; `past_due` is Clerk's grace period (it sends `ended` if payment never comes). */
const ENTITLED_STATUSES = new Set(["active", "past_due", "canceled"]);

type SubscriptionItemEvent = Extract<WebhookEvent, { type: `subscriptionItem.${string}` }>;

const isItemEvent = (evt: WebhookEvent): evt is SubscriptionItemEvent => evt.type.startsWith("subscriptionItem.");

/** Does this item grant Pro right now? */
export function grantsPro(
  item: { id: string; status: string; planSlug: string | undefined; periodEnd: number | null },
  options: { now: number; endedItemId?: string },
): boolean {
  if (item.planSlug !== PRO_PLAN_SLUG) return false;
  if (item.id === options.endedItemId) return false;
  if (!ENTITLED_STATUSES.has(item.status)) return false;
  return item.periodEnd === null || item.periodEnd > options.now;
}

/**
 * Brings `accounts.plan` in line with Clerk Billing for the user an event is about. Returns what
 * happened, for the response log and the tests.
 *
 * Only `subscriptionItem.active` and `subscriptionItem.ended` for the Pro plan act. Everything else,
 * `subscriptionItem.canceled` included (a cancellation keeps Pro until the paid period ends, then Clerk
 * sends `ended`), is ignored.
 *
 * Idempotent and order-proof: the plan is not taken from the event but from Clerk's current state for
 * that user (Backend API). Two deliveries of one event, or an old event arriving after a newer one,
 * all end on the same current state. (An event timestamp would need a "last event" column; the schema
 * has none.) The one thing taken from the event is an `ended` item's ID, so a read that is still
 * catching up can't keep that item alive.
 */
export async function syncPlanFromEvent(evt: WebhookEvent): Promise<"ignored" | "unchanged" | "pro" | "free"> {
  if (!isItemEvent(evt)) return "ignored";
  if (evt.type !== "subscriptionItem.active" && evt.type !== "subscriptionItem.ended") return "ignored";
  if (evt.data.plan?.slug !== PRO_PLAN_SLUG) return "ignored";

  // Only personal subscriptions: an organization's subscription has no account here.
  const userId = evt.data.payer?.user_id;
  if (!userId) return "ignored";

  const client = await clerkClient();
  const subscription = await client.billing.getUserBillingSubscription(userId);
  const now = Date.now();
  const plan: Plan = subscription.subscriptionItems.some((item) =>
    grantsPro(
      { id: item.id, status: item.status, planSlug: item.plan?.slug, periodEnd: item.periodEnd },
      { now, endedItemId: evt.type === "subscriptionItem.ended" ? evt.data.id : undefined },
    ),
  )
    ? "pro"
    : "free";

  // The row may not exist yet (paid before ever opening the dashboard). A no-op when it does.
  await ensureAccount(userId);

  // One conditional update: only a real change writes, and only the call that made the change sees a row
  // back, so concurrent duplicates fire `upgraded` once.
  const { data, error } = await createServiceClient()
    .from("accounts")
    .update({ plan })
    .eq("clerk_user_id", userId)
    .neq("plan", plan)
    .select("clerk_user_id");
  if (error) throw new Error(`Could not update the plan: ${error.message}`);
  if (!data || data.length === 0) return "unchanged";

  if (plan === "pro") await trackUpgraded(userId, "pro");
  return plan;
}
