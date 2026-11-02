import type {
  CreateProjectResponse,
  DeleteProjectResponse,
  ListProjectsResponse,
  RenameProjectResponse,
} from "@askwell/shared";

export type ClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const FALLBACK = "Something went wrong. Try again.";

async function call<T>(url: string, init?: RequestInit): Promise<ClientResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    const body: unknown = await res.json().catch(() => null);
    // A 2xx whose body isn't a JSON object (a proxy or an HTML page) is a failure, not an empty success.
    if (res.ok && body !== null && typeof body === "object") return { ok: true, data: body as T };

    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    return { ok: false, code: error?.code ?? "internal_error", message: error?.message ?? FALLBACK };
  } catch {
    return { ok: false, code: "network", message: "Could not reach the server. Check your connection." };
  }
}

export const listProjects = () => call<ListProjectsResponse>("/api/projects");

export const createProject = (name: string) =>
  call<CreateProjectResponse>("/api/projects", { method: "POST", body: JSON.stringify({ name }) });

export const renameProject = (id: string, name: string) =>
  call<RenameProjectResponse>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });

export const deleteProject = (id: string) =>
  call<DeleteProjectResponse>(`/api/projects/${id}`, { method: "DELETE" });
