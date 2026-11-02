import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getDocumentProxy, extractPdfText, destroy } = vi.hoisted(() => ({
  getDocumentProxy: vi.fn(),
  extractPdfText: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("unpdf", () => ({ getDocumentProxy, extractText: extractPdfText }));

import { ExtractError, MAX_PDF_PAGES, extractText } from "./extract";

const pdfBytes = new TextEncoder().encode("%PDF-1.4\n");
const proxy = (numPages: number) => ({ numPages, loadingTask: { destroy } });

beforeEach(() => {
  vi.clearAllMocks();
  destroy.mockResolvedValue(undefined);
});

describe("extractText: PDF proxy lifecycle", () => {
  it("releases the proxy after a successful extraction", async () => {
    getDocumentProxy.mockResolvedValue(proxy(2));
    extractPdfText.mockResolvedValue({ text: "page text" });
    await expect(extractText(pdfBytes, "pdf")).resolves.toBe("page text");
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("releases the proxy when text extraction fails, and reports unreadable_pdf", async () => {
    getDocumentProxy.mockResolvedValue(proxy(2));
    extractPdfText.mockRejectedValue(new Error("bad page"));
    await expect(extractText(pdfBytes, "pdf")).rejects.toMatchObject({ code: "unreadable_pdf" });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("checks the page count before extracting any text, releases the proxy, and keeps the too_many_pages code", async () => {
    getDocumentProxy.mockResolvedValue(proxy(MAX_PDF_PAGES + 1));
    const error = await extractText(pdfBytes, "pdf").catch((e) => e);
    expect(error).toBeInstanceOf(ExtractError);
    expect(error.code).toBe("too_many_pages");
    expect(extractPdfText).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("reports unreadable_pdf when the document can't be opened, with nothing to release", async () => {
    getDocumentProxy.mockRejectedValue(new Error("Invalid PDF structure"));
    await expect(extractText(pdfBytes, "pdf")).rejects.toMatchObject({ code: "unreadable_pdf" });
    expect(destroy).not.toHaveBeenCalled();
  });

  it("does not let a failing release hide the result or the original error", async () => {
    destroy.mockRejectedValue(new Error("destroy failed"));
    getDocumentProxy.mockResolvedValue(proxy(1));
    extractPdfText.mockResolvedValue({ text: "ok text" });
    await expect(extractText(pdfBytes, "pdf")).resolves.toBe("ok text");
  });
});
