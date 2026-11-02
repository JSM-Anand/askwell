import "server-only";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import type { KnowledgeFileType } from "@askwell/shared";

export type ExtractErrorCode = "not_a_pdf" | "unreadable_pdf" | "empty_text";

/** A file that can't give us text. The route turns the code into a message for the owner. */
export class ExtractError extends Error {
  constructor(
    readonly code: ExtractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

const isPdf = (bytes: Uint8Array) => PDF_MAGIC.every((byte, i) => bytes[i] === byte);

/**
 * The text of an uploaded file. PDF goes through `unpdf`; Markdown and TXT are
 * decoded as UTF-8. The text is document content, never instructions: callers
 * store it as chunks and the chat prompt treats it as data.
 */
export async function extractText(bytes: Uint8Array, type: KnowledgeFileType): Promise<string> {
  const text = type === "pdf" ? await extractPdf(bytes) : new TextDecoder("utf-8").decode(bytes);
  if (text.trim() === "") {
    throw new ExtractError("empty_text", "The file has no readable text.");
  }
  return text;
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  // Check the bytes, not the file name or the declared type: a renamed .txt must not reach the parser.
  if (!isPdf(bytes)) {
    throw new ExtractError("not_a_pdf", "The file is not a PDF.");
  }
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  } catch {
    throw new ExtractError("unreadable_pdf", "The PDF could not be read.");
  }
}
