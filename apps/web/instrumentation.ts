export function register() {}

type RequestInfo = { path: string; method: string };
type ErrorContext = { routerKind: string; routePath: string; routeType: string };

function distinctIdFromCookie(cookieHeader: string | string[] | undefined): string | undefined {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  const match = header?.match(/ph_phc_[^=;]*_posthog=([^;]+)/);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]!)) as { distinct_id?: unknown };
    return typeof parsed.distinct_id === "string" ? parsed.distinct_id : undefined;
  } catch {
    return undefined;
  }
}

export async function onRequestError(
  err: unknown,
  request: RequestInfo & { headers: Record<string, string | string[] | undefined> },
  context: ErrorContext,
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { captureServerException } = await import("./lib/analytics/server");
    await captureServerException(err, distinctIdFromCookie(request.headers.cookie));
  } catch {
    // Analytics must never break the app.
  }
  void context;
}
