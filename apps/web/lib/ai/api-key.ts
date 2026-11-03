/**
 * Cleans a secret read from the environment: trims whitespace and newlines, and strips one pair of
 * surrounding quotes. A value pasted into a dashboard often carries a trailing newline or quotes,
 * and Google answers that with "API key not valid". Returns "" when nothing is left.
 */
export function cleanEnvValue(raw: string | undefined): string {
  let value = (raw ?? "").trim();
  const first = value.charAt(0);
  if (value.length >= 2 && (first === '"' || first === "'") && value.endsWith(first)) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

/** The Gemini API key, cleaned. "" if it is missing. */
export const geminiApiKey = (): string => cleanEnvValue(process.env.GEMINI_API_KEY);
