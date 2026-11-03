import type { GetConversationResponse, ListConversationsResponse } from "@askwell/shared";

export type ClientResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const FALLBACK = "Something went wrong. Try again.";

async function get<T>(url: string): Promise<ClientResult<T>> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);
    // A 2xx whose body isn't a JSON object (a proxy or an HTML page) is a failure, not an empty success.
    if (res.ok && body !== null && typeof body === "object") return { ok: true, data: body as T };

    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    return { ok: false, code: error?.code ?? "internal_error", message: error?.message ?? FALLBACK };
  } catch {
    return { ok: false, code: "network", message: "Could not reach the server. Check your connection." };
  }
}

export const listConversations = (projectId: string) =>
  get<ListConversationsResponse>(`/api/projects/${projectId}/conversations`);

export const getConversation = (id: string) => get<GetConversationResponse>(`/api/conversations/${id}`);

/** The page address for a project, optionally with one conversation open. */
export const conversationsHref = (projectId: string, conversationId?: string) =>
  `/dashboard/conversations?project=${encodeURIComponent(projectId)}${
    conversationId ? `&conversation=${encodeURIComponent(conversationId)}` : ""
  }`;
