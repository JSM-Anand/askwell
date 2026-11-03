import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { ERROR_STATUS } from "@askwell/shared";
import type { ApiError, ClerkWebhookResponse } from "@askwell/shared";
import { syncPlanFromEvent } from "../../../../lib/billing/sync-plan";

// Called by Clerk (Svix), not a browser: no CORS, nothing cached. Public in proxy.ts: the signature is the only check.
const HEADERS = { "Cache-Control": "no-store" };

/** POST /api/clerk/webhook (project.md §6.10): keeps `accounts.plan` in step with Clerk Billing. */
export async function POST(request: NextRequest) {
  // The signature is verified before anything is read or written. Bad or missing: 400, nothing happens.
  let event;
  try {
    event = await verifyWebhook(request);
  } catch (cause) {
    console.error("Clerk webhook verification failed", cause instanceof Error ? cause.message : cause);
    return NextResponse.json<ApiError>(
      { error: { code: "invalid_input", message: "The webhook signature is not valid." } },
      { status: ERROR_STATUS.invalid_input, headers: HEADERS },
    );
  }

  try {
    await syncPlanFromEvent(event);
  } catch (cause) {
    // A 500 makes Svix retry, and the sync is idempotent, so a retry is safe.
    console.error(`Clerk webhook ${event.type} failed`, cause);
    return NextResponse.json<ApiError>(
      { error: { code: "internal_error", message: "Something went wrong." } },
      { status: ERROR_STATUS.internal_error, headers: HEADERS },
    );
  }
  return NextResponse.json<ClerkWebhookResponse>({ received: true }, { headers: HEADERS });
}
