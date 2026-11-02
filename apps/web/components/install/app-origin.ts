export type OriginSources = {
  /** NEXT_PUBLIC_APP_URL, when set. */
  envUrl: string | undefined;
  /** The request's own host and protocol (forwarded headers first), so each preview shows its own URL. */
  host: string | null;
  proto: string | null;
};

function toOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** Origin to put in the script tag: NEXT_PUBLIC_APP_URL if it is a valid URL, else the request's own origin. */
export function resolveAppOrigin({ envUrl, host, proto }: OriginSources): string {
  const fromEnv = envUrl?.trim() ? toOrigin(envUrl.trim()) : null;
  if (fromEnv) return fromEnv;
  const fromRequest = host ? toOrigin(`${proto === "http" ? "http" : "https"}://${host.split(",")[0]!.trim()}`) : null;
  return fromRequest ?? "http://localhost:3000";
}
