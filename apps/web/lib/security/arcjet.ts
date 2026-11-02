import "server-only";
import arcjet, { detectPromptInjection, fixedWindow } from "@arcjet/next";
import type { NextRequest } from "next/server";

export type ProtectResult =
  | { allowed: true }
  | { allowed: false; reason: "rate_limited" | "prompt_injection" };

/** Fixed-window limits (project.md §6.6), counted per route + public key + IP. */
export const WIDGET_CONFIG_LIMIT = { window: "1m", max: 60 } as const;
export const CHAT_LIMIT = { window: "1m", max: 20 } as const;

/**
 * A second limit per route + IP only. The limits above count per public key, and the key is
 * caller-chosen: sending a different key on every request would start a fresh counter each time and
 * reach the database unthrottled. These caps stop that. They are not in project.md; they are set
 * above the per-key limits (5x each) so several widgets behind one office IP still fit. The route is
 * part of the key so config traffic doesn't use up the chat budget.
 *
 * Arcjet's counters are eventually consistent: a burst of concurrent requests can be over-admitted
 * (measured against the real service with a limit of 12: 20 to 23 of 40 requests got through at
 * concurrency 10 to 25), and requests are blocked once the count catches up. Sequential traffic is
 * enforced exactly (the 301st request in a minute is the first one denied). So these are throttles,
 * not exact quotas; the monthly message quota in Postgres is the exact limit.
 */
export const WIDGET_CONFIG_IP_LIMIT = { window: "1m", max: 300 } as const;
export const CHAT_IP_LIMIT = { window: "1m", max: 100 } as const;

// `routeKey` is passed on every call as `<route>:<public key>` and `route` as `<route>`; `ip.src` is
// read from the request.
const PER_KEY = ["ip.src", "routeKey"] as const;
const PER_IP = ["ip.src", "route"] as const;

type Route = "widget_config" | "chat";

const ALLOWED: ProtectResult = { allowed: true };

// Built on first use, not at import: `next build` imports route modules without ARCJET_KEY.
function createClients() {
  const key = process.env.ARCJET_KEY;
  if (!key) throw new Error("ARCJET_KEY is not set");

  const base = arcjet({ key, characteristics: PER_KEY, rules: [] });
  return {
    widgetConfig: base.withRule([
      ...fixedWindow({ mode: "LIVE", ...WIDGET_CONFIG_LIMIT, characteristics: PER_KEY }),
      ...fixedWindow({ mode: "LIVE", ...WIDGET_CONFIG_IP_LIMIT, characteristics: PER_IP }),
    ]),
    chat: base.withRule([
      ...fixedWindow({ mode: "LIVE", ...CHAT_LIMIT, characteristics: PER_KEY }),
      ...fixedWindow({ mode: "LIVE", ...CHAT_IP_LIMIT, characteristics: PER_IP }),
      ...detectPromptInjection({ mode: "LIVE" }),
    ]),
  };
}

let clients: ReturnType<typeof createClients> | undefined;
const getClients = () => (clients ??= createClients());

type Decision = Awaited<ReturnType<ReturnType<typeof createClients>["chat"]["protect"]>>;

// Fails open (project.md §3): when Arcjet itself errors or times out the request goes through, and
// the reason is logged. Only a real rate-limit or injection verdict blocks.
function toResult(route: Route, decision: Decision): ProtectResult {
  if (decision.isErrored()) {
    console.error(`Arcjet error on ${route}, allowing the request:`, decision.reason.message);
    return ALLOWED;
  }
  if (decision.isDenied()) {
    return { allowed: false, reason: decision.reason.isPromptInjection() ? "prompt_injection" : "rate_limited" };
  }
  return ALLOWED;
}

function failOpen(route: Route, error: unknown): ProtectResult {
  console.error(`Arcjet failed on ${route}, allowing the request:`, error instanceof Error ? error.message : error);
  return ALLOWED;
}

/** GET /api/widget/config: 60 requests a minute per public key + IP, and 300 per IP whatever the key. */
export async function protectWidgetConfig(req: NextRequest, publicKey: string): Promise<ProtectResult> {
  try {
    const decision = await getClients().widgetConfig.protect(req, {
      routeKey: `widget_config:${publicKey}`,
      route: "widget_config",
    });
    return toResult("widget_config", decision);
  } catch (error) {
    return failOpen("widget_config", error);
  }
}

/** POST /api/widget/chat: 20 messages a minute per public key + IP, 100 per IP whatever the key, and prompt-injection detection on the message. */
export async function protectChat(req: NextRequest, publicKey: string, message: string): Promise<ProtectResult> {
  try {
    const decision = await getClients().chat.protect(req, {
      routeKey: `chat:${publicKey}`,
      route: "chat",
      detectPromptInjectionMessage: message,
    });
    const result = toResult("chat", decision);
    // Phase 4: message_blocked (PostHog event, reason: rate limit or injection) goes here when result.allowed is false.
    return result;
  } catch (error) {
    return failOpen("chat", error);
  }
}
