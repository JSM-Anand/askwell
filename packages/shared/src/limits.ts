import type { KnowledgeSourceType } from "./enums";

/** Visitor message length, in characters. */
export const MAX_MESSAGE_LENGTH = 1000;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const KNOWLEDGE_FILE_TYPES = ["pdf", "md", "txt"] as const;
export type KnowledgeFileType = (typeof KNOWLEDGE_FILE_TYPES)[number];

export const KNOWLEDGE_FILE_MIME_TYPES: Record<KnowledgeFileType, string> = {
  pdf: "application/pdf",
  md: "text/markdown",
  txt: "text/plain",
};

export const MAX_TITLE_LENGTH = 200;
export const MAX_PROJECT_NAME_LENGTH = 100;
/** Pasted text, in characters. Not in project.md: keeps a paste well under the 4.5 MB body cap. */
export const MAX_PASTED_TEXT_LENGTH = 100_000;

export function isKnowledgeFileType(type: KnowledgeSourceType): type is KnowledgeFileType {
  return type !== "text";
}
