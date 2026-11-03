import "server-only";
import { after } from "next/server";
import { capture } from "../analytics/server";

/**
 * Who a generation belongs to. `distinctId` is the project owner (visitors are never identified),
 * `traceId` groups the generations of one conversation. A first message has no conversation yet, so
 * `traceId` may be a promise that settles once the conversation exists.
 */
export type TracingContext = {
  distinctId: string;
  projectId: string;
  traceId: string | Promise<string>;
};

/** The part of Gemini's `usageMetadata` the event uses. */
export type GeminiUsage = {
  promptTokenCount?: number;
  toolUsePromptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
};

export type GenerationRecord = { model: string; latencySeconds: number; usage?: GeminiUsage };

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

/**
 * The `$ai_generation` properties (https://posthog.com/docs/llm-analytics/manual-capture), the same
 * ones PostHog's own Gemini wrapper sends, minus `$ai_input` and `$ai_output_choices`: no prompt and
 * no reply text ever leave the app (project.md §9). PostHog prices the call from `$ai_model` and the
 * token counts, so no cost is computed here.
 */
export function generationProperties(ctx: Pick<TracingContext, "projectId">, traceId: string, rec: GenerationRecord) {
  const usage = rec.usage;
  return {
    $ai_lib: "askwell",
    $ai_provider: "gemini",
    $ai_model: rec.model,
    $ai_trace_id: traceId,
    $ai_latency: rec.latencySeconds,
    $ai_http_status: 200,
    $ai_base_url: GEMINI_BASE_URL,
    $ai_input_tokens: (usage?.promptTokenCount ?? 0) + (usage?.toolUsePromptTokenCount ?? 0),
    $ai_output_tokens: usage?.candidatesTokenCount ?? 0,
    ...(usage?.thoughtsTokenCount ? { $ai_reasoning_tokens: usage.thoughtsTokenCount } : {}),
    ...(usage?.cachedContentTokenCount ? { $ai_cache_read_input_tokens: usage.cachedContentTokenCount } : {}),
    project_id: ctx.projectId,
  };
}

async function send(ctx: TracingContext, rec: GenerationRecord): Promise<void> {
  try {
    const traceId = await Promise.resolve(ctx.traceId).catch(() => crypto.randomUUID());
    await capture({
      distinctId: ctx.distinctId,
      event: "$ai_generation",
      properties: generationProperties(ctx, traceId, rec),
    });
  } catch (cause) {
    console.error("AI tracing failed", cause);
  }
}

/**
 * Records one generation. Runs after the response when the platform allows it (the visitor never waits
 * on PostHog), else inline. It never throws and never rejects: a tracing failure is logged and the reply
 * is unaffected.
 */
export function traceGeneration(ctx: TracingContext, rec: GenerationRecord): Promise<void> {
  try {
    after(() => send(ctx, rec));
    return Promise.resolve();
  } catch {
    return send(ctx, rec); // no request scope (a unit test, a script)
  }
}
