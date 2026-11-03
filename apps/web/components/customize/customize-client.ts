import type { UpdateConfigResponse, WidgetConfig } from "@askwell/shared";

export type SaveResult =
  | { ok: true; config: WidgetConfig }
  | { ok: false; code: string; message: string };

const FALLBACK = "Something went wrong. Try again.";

/** Saves only the fields in `patch`. The server decides everything: the plan, the allowed values, the write. */
export async function saveConfig(projectId: string, patch: Partial<WidgetConfig>): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/projects/${projectId}/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body: unknown = await res.json().catch(() => null);
    // A 2xx whose body isn't a JSON object (a proxy or an HTML page) is a failure, not a save.
    if (res.ok && body !== null && typeof body === "object" && "config" in body) {
      return { ok: true, config: (body as UpdateConfigResponse).config };
    }
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    return { ok: false, code: error?.code ?? "internal_error", message: error?.message ?? FALLBACK };
  } catch {
    return { ok: false, code: "network", message: "Could not reach the server. Check your connection." };
  }
}
