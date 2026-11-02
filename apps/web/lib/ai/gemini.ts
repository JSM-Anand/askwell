import "server-only";
import { GoogleGenAI } from "@google/genai";
import { requireEnv } from "../supabase/env";

let client: GoogleGenAI | undefined;

/**
 * The one Gemini client for the app (embeddings and the chat model). Phase 4 wraps
 * `generateAnswer` for PostHog AI tracing, so nothing else should call this directly.
 * It is created on first use, so a missing key fails the call that needs it, not the build.
 */
export function getGemini(): GoogleGenAI {
  client ??= new GoogleGenAI({
    apiKey: requireEnv("GEMINI_API_KEY", process.env.GEMINI_API_KEY),
    httpOptions: { timeout: 60_000 },
  });
  return client;
}
