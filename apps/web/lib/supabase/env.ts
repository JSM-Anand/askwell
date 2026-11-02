/** Reads a required env var and throws a clear error if it is missing or empty. */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}
