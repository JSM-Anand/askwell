import { PostHog } from "posthog-node";
import { readPostHogConfig } from "./config";

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client === undefined) {
    const config = readPostHogConfig();
    client = config
      ? new PostHog(config.key, { host: config.host, flushAt: 1, flushInterval: 0 })
      : null;
  }
  return client;
}

export function resetServerAnalyticsForTests() {
  client = undefined;
}

async function safeFlush(ph: PostHog) {
  try {
    await ph.flush();
  } catch (err) {
    console.error("PostHog flush failed", err);
  }
}

export async function capture(input: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const ph = getClient();
  if (!ph) return;
  ph.capture(input);
  await safeFlush(ph);
}

export async function captureServerException(err: unknown, distinctId?: string): Promise<void> {
  const ph = getClient();
  if (!ph) return;
  ph.captureException(err, distinctId);
  await safeFlush(ph);
}
