import "server-only";
import OpenAI from "openai";
import { requireEnv } from "../supabase/env";

let client: OpenAI | undefined;

/**
 * The one OpenAI client for the app (Lane A embeds chunks, Lane B embeds the
 * question and asks the chat model). Phase 4 wraps this client for PostHog AI
 * tracing, so everything gets it from here. It is created on first use, so a
 * missing key fails the call that needs it, not the build.
 */
export function getOpenAI(): OpenAI {
  client ??= new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY),
    timeout: 60_000,
    maxRetries: 2,
  });
  return client;
}
