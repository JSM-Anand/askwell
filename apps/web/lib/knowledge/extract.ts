import "server-only";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import type { KnowledgeFileType } from "@askwell/shared";

export type ExtractErrorCode =
  | "not_a_pdf"
  | "unreadable_pdf"
  | "too_many_pages"
  | "invalid_encoding"
  | "empty_text";

/**
 * Most pages a PDF may have. The 10 MB upload limit bounds bytes, not pages, and
 * text extraction starts every page at once, so a small file that declares
 * thousands of pages could exhaust memory inside one request.
 */
export const MAX_PDF_PAGES = 500;

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
  const text = type === "pdf" ? await extractPdf(bytes) : decodeUtf8(bytes);
  if (text.trim() === "") {
    throw new ExtractError("empty_text", "The file has no readable text.");
  }
  return text;
}

/** Strict: malformed bytes are an error, not a silent U+FFFD that would be stored as if the file were fine. */
function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ExtractError("invalid_encoding", "The file is not valid UTF-8 text.");
  }
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  // Check the bytes, not the file name or the declared type: a renamed .txt must not reach the parser.
  if (!isPdf(bytes)) {
    throw new ExtractError("not_a_pdf", "The file is not a PDF.");
  }
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    throw new ExtractError("unreadable_pdf", "The PDF could not be read.");
  }

  // A proxy we create is ours to release, also when extraction fails.
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new ExtractError("too_many_pages", `The PDF has more than ${MAX_PDF_PAGES} pages.`);
    }
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  } catch (cause) {
    if (cause instanceof ExtractError) throw cause;
    throw new ExtractError("unreadable_pdf", "The PDF could not be read.");
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}
