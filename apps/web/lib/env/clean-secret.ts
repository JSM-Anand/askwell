/**
 * Cleans a secret read from the environment: trims whitespace and newlines, and strips one pair of
 * surrounding quotes. A value pasted into a dashboard often carries a trailing newline or quotes.
 * Returns "" when nothing is left. Never log the result.
 */
export function cleanSecret(raw: string | undefined): string {
  let value = (raw ?? "").trim();
  const first = value.charAt(0);
  if (value.length >= 2 && (first === '"' || first === "'") && value.endsWith(first)) {
    value = value.slice(1, -1).trim();
  }
  return value;
}
