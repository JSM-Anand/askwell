import "server-only";
import arcjet, { detectPromptInjection, fixedWindow } from "@arcjet/next";
import type { NextRequest } from "next/server";

export type ProtectResult =
  | { allowed: true }
  | { allowed: false; reason: "rate_limited" | "prompt_injection" };

/** Fixed-window limits (project.md §6.6), counted per route + public key + IP. */
export const WIDGET_CONFIG_LIMIT = { window: "1m", max: 60 } as const;
export const CHAT_LIMIT = { window: "1m", max: 20 } as const;

// `routeKey` is passed on every call as `<route>:<public key>`; `ip.src` is read from the request.
const CHARACTERISTICS = ["ip.src", "routeKey"] as const;

type Route = "widget_config" | "chat";

const ALLOWED: ProtectResult = { allowed: true };

// Built on first use, not at import: `next build` imports route modules without ARCJET_KEY.
function createClients() {
  const key = process.env.ARCJET_KEY;
  if (!key) throw new Error("ARCJET_KEY is not set");

  const base = arcjet({ key, characteristics: CHARACTERISTICS, rules: [] });
  return {
    widgetConfig: base.withRule(
      fixedWindow({ mode: "LIVE", ...WIDGET_CONFIG_LIMIT, characteristics: CHARACTERISTICS }),
    ),
    chat: base.withRule([
      ...fixedWindow({ mode: "LIVE", ...CHAT_LIMIT, characteristics: CHARACTERISTICS }),
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

/** GET /api/widget/config: 60 requests a minute per public key + IP. */
export async function protectWidgetConfig(req: NextRequest, publicKey: string): Promise<ProtectResult> {
  try {
    const decision = await getClients().widgetConfig.protect(req, { routeKey: `widget_config:${publicKey}` });
    return toResult("widget_config", decision);
  } catch (error) {
    return failOpen("widget_config", error);
  }
}

/** POST /api/widget/chat: 20 messages a minute per public key + IP, and prompt-injection detection on the message. */
export async function protectChat(req: NextRequest, publicKey: string, message: string): Promise<ProtectResult> {
  try {
    const decision = await getClients().chat.protect(req, {
      routeKey: `chat:${publicKey}`,
      detectPromptInjectionMessage: message,
    });
    const result = toResult("chat", decision);
    // Phase 4: message_blocked (PostHog event, reason: rate limit or injection) goes here when result.allowed is false.
    return result;
  } catch (error) {
    return failOpen("chat", error);
  }
}
