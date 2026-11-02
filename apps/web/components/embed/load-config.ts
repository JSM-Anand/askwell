import { DEFAULT_WIDGET_CONFIG, widgetConfigSchema } from "@askwell/shared";
import type { WidgetConfig } from "@askwell/shared";

export type LoadResult = { status: "ready"; config: WidgetConfig } | { status: "unavailable" };

const unavailable: LoadResult = { status: "unavailable" };
const fallback: LoadResult = { status: "ready", config: DEFAULT_WIDGET_CONFIG };

/**
 * Missing key or a key the server rejects (400/404): the chat isn't available.
 * Any other failure (network, 5xx, odd body): carry on with the defaults.
 */
export async function loadConfig(
  key: string | undefined,
  getJson: typeof fetch = (input, init) => fetch(input, init),
  signal?: AbortSignal,
): Promise<LoadResult> {
  if (!key) return unavailable;
  try {
    const res = await getJson(`/api/widget/config?key=${encodeURIComponent(key)}`, { signal });
    if (res.status === 400 || res.status === 404) return unavailable;
    if (res.status !== 200) return fallback;
    const parsed = widgetConfigSchema.safeParse(await res.json());
    return parsed.success ? { status: "ready", config: parsed.data } : fallback;
  } catch {
    return fallback;
  }
}
