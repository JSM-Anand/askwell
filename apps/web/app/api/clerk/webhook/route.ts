import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { ERROR_STATUS } from "@askwell/shared";
import type { ApiError, ClerkWebhookResponse } from "@askwell/shared";
import { syncPlanFromEvent } from "../../../../lib/billing/sync-plan";
import { cleanSecret } from "../../../../lib/env/clean-secret";

// Called by Clerk (Svix), not a browser: no CORS, nothing cached. Public in proxy.ts: the signature is the only check.
const HEADERS = { "Cache-Control": "no-store" };
const SVIX_HEADERS = ["svix-id", "svix-timestamp", "svix-signature"];

const invalidSignature = () =>
  NextResponse.json<ApiError>(
    { error: { code: "invalid_input", message: "The webhook signature is not valid." } },
    { status: ERROR_STATUS.invalid_input, headers: HEADERS },
  );

/** POST /api/clerk/webhook (project.md §6.10): keeps `accounts.plan` in step with Clerk Billing. */
export async function POST(request: NextRequest) {
  // The secret is read here, not by verifyWebhook, so a value pasted with whitespace or quotes still works.
  const signingSecret = cleanSecret(process.env.CLERK_WEBHOOK_SIGNING_SECRET);
  if (!signingSecret) {
    console.error("Clerk webhook cannot run: CLERK_WEBHOOK_SIGNING_SECRET is missing or empty");
    return NextResponse.json<ApiError>(
      { error: { code: "internal_error", message: "Something went wrong." } },
      { status: ERROR_STATUS.internal_error, headers: HEADERS },
    );
  }

  // The signature is verified before anything is read or written. Bad or missing: 400, nothing happens.
  // Only the reason is logged, never the secret or the payload.
  const missing = SVIX_HEADERS.filter((name) => !request.headers.get(name));
  if (missing.length > 0) {
    console.error(`Clerk webhook verification failed: missing headers ${missing.join(", ")}`);
    return invalidSignature();
  }
  let event;
  try {
    event = await verifyWebhook(request, { signingSecret });
  } catch (cause) {
    console.error("Clerk webhook verification failed: bad signature", cause instanceof Error ? cause.name : "unknown error");
    return invalidSignature();
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
