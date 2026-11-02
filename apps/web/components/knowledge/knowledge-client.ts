import { KNOWLEDGE_FILE_MIME_TYPES } from "@askwell/shared";
import type {
  FinalizeKnowledgeResponse,
  KnowledgeFileType,
  PasteKnowledgeResponse,
  UploadUrlResponse,
} from "@askwell/shared";

export type ClientResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const FALLBACK = "Something went wrong. Try again.";

async function call<T>(url: string, init: RequestInit): Promise<ClientResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
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

export const pasteText = (projectId: string, title: string, content: string) =>
  call<PasteKnowledgeResponse>(`/api/projects/${projectId}/knowledge`, {
    method: "POST",
    body: JSON.stringify({ title, content }),
  });

export const requestUpload = (projectId: string, title: string, fileType: KnowledgeFileType, size: number) =>
  call<UploadUrlResponse>(`/api/projects/${projectId}/knowledge/upload-url`, {
    method: "POST",
    body: JSON.stringify({ title, fileType, size }),
  });

export const finalizeUpload = (projectId: string, sourceId: string) =>
  call<FinalizeKnowledgeResponse>(`/api/projects/${projectId}/knowledge/finalize`, {
    method: "POST",
    body: JSON.stringify({ sourceId }),
  });

export const deleteSource = (id: string) => call<{ ok: true }>(`/api/knowledge/${id}`, { method: "DELETE" });

/**
 * Sends the file straight to Storage with the one-time signed URL. It never goes through our API (a
 * request body is capped at 4.5 MB there). XMLHttpRequest, because fetch can't report upload progress.
 */
export function putFile(
  url: string,
  file: File,
  fileType: KnowledgeFileType,
  onProgress: (percent: number) => void,
): Promise<{ ok: boolean }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // The bucket only takes the three types; the extension, not the browser's guess, decides.
    xhr.setRequestHeader("Content-Type", KNOWLEDGE_FILE_MIME_TYPES[fileType]);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300 });
    xhr.onerror = () => resolve({ ok: false });
    xhr.onabort = () => resolve({ ok: false });
    xhr.send(file);
  });
}
