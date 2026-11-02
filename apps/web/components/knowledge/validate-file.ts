import { KNOWLEDGE_FILE_TYPES, MAX_KNOWLEDGE_FILE_BYTES, MAX_TITLE_LENGTH } from "@askwell/shared";
import type { KnowledgeFileType } from "@askwell/shared";

export type FileCheck =
  | { ok: true; fileType: KnowledgeFileType; title: string }
  | { ok: false; message: string };

const MAX_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);

/**
 * A quick check in the browser, so the owner gets a clear message before an upload starts. It is not
 * the security check: the server validates the declared type and size again, and finalize checks the real file.
 */
export function checkFile(file: { name: string; size: number }): FileCheck {
  const dot = file.name.lastIndexOf(".");
  const extension = dot === -1 ? "" : file.name.slice(dot + 1).toLowerCase();
  const fileType = KNOWLEDGE_FILE_TYPES.find((type) => type === extension);
  if (!fileType) return { ok: false, message: "Choose a PDF, Markdown (.md) or text (.txt) file." };
  if (file.size === 0) return { ok: false, message: "That file is empty." };
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return { ok: false, message: `That file is larger than ${MAX_MB} MB.` };

  const base = dot > 0 ? file.name.slice(0, dot) : file.name;
  const title = base.trim().slice(0, MAX_TITLE_LENGTH);
  return { ok: true, fileType, title: title || file.name.slice(0, MAX_TITLE_LENGTH) };
}
