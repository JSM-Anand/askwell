import { describe, expect, it } from "vitest";

import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { ExtractError, MAX_PDF_PAGES, extractText } from "./extract";

const bytes = (text: string) => new TextEncoder().encode(text);

/** A minimal PDF with `pages` pages that all show `lines`, with a correct xref table. */
function makePdf(lines: string[], pages = 1): Uint8Array {
  const content = lines.length
    ? `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `(${l}) Tj T*`).join(" ")} ET`
    : "";
  const pageIds = Array.from({ length: pages }, (_, i) => 5 + i);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pageIds.map(
      () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 3 0 R /Resources << /Font << /F1 4 0 R >> >> >>",
    ),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return bytes(pdf);
}

describe("extractText: txt and md", () => {
  it("decodes TXT as UTF-8", async () => {
    await expect(extractText(bytes("Plain text.\nSecond line."), "txt")).resolves.toBe("Plain text.\nSecond line.");
  });

  it("decodes Markdown as UTF-8, keeping the markup", async () => {
    await expect(extractText(bytes("# Title\n\n- item"), "md")).resolves.toBe("# Title\n\n- item");
  });

  it("decodes multi-byte characters", async () => {
    await expect(extractText(bytes("Café ☕ 日本語"), "txt")).resolves.toBe("Café ☕ 日本語");
  });

  it("drops a UTF-8 byte order mark", async () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("Hello")]);
    await expect(extractText(withBom, "txt")).resolves.toBe("Hello");
  });

  it.each([
    ["a stray continuation byte", [0x48, 0x69, 0x80, 0x21]],
    ["an overlong encoding", [0xc0, 0xaf]],
    ["a truncated multi-byte character", [0x48, 0xe2, 0x82]],
    ["Latin-1 text (a lone 0xE9)", [0x43, 0x61, 0x66, 0xe9]],
  ])("rejects malformed UTF-8 (%s) instead of storing replacement characters", async (_label, raw) => {
    for (const type of ["txt", "md"] as const) {
      await expect(extractText(new Uint8Array(raw), type)).rejects.toMatchObject({ code: "invalid_encoding" });
    }
  });

  it("still accepts valid UTF-8, including a byte order mark", async () => {
    await expect(extractText(new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0xa9]), "txt")).resolves.toBe("é");
  });

  it.each([["empty", ""], ["whitespace only", " \n\t \n"]])("throws empty_text for %s", async (_label, text) => {
    await expect(extractText(bytes(text), "txt")).rejects.toMatchObject({ code: "empty_text" });
  });
});

describe("extractText: pdf", () => {
  it("extracts the text of a real PDF", async () => {
    const text = await extractText(makePdf(["Hello from a PDF", "Second line of text"]), "pdf");
    expect(text).toContain("Hello from a PDF");
    expect(text).toContain("Second line of text");
  });

  it("rejects a .txt posing as a PDF with a typed not_a_pdf error, before parsing", async () => {
    const error = await extractText(bytes("Just some plain text, renamed to .pdf"), "pdf").catch((e) => e);
    expect(error).toBeInstanceOf(ExtractError);
    expect(error.code).toBe("not_a_pdf");
  });

  it.each([
    ["an empty file", new Uint8Array()],
    ["fewer bytes than the signature", bytes("%PDF")],
    ["the signature in the wrong place", bytes(" %PDF-1.4")],
    ["a different file type (PNG)", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ])("rejects %s as not_a_pdf", async (_label, data) => {
    await expect(extractText(data, "pdf")).rejects.toMatchObject({ code: "not_a_pdf" });
  });

  it("rejects a file that starts like a PDF but can't be parsed as unreadable_pdf", async () => {
    await expect(extractText(bytes("%PDF-1.4\nthis is not a real pdf body"), "pdf")).rejects.toMatchObject({
      code: "unreadable_pdf",
    });
  });

  it("throws empty_text for a PDF with no text", async () => {
    await expect(extractText(makePdf([]), "pdf")).rejects.toMatchObject({ code: "empty_text" });
  });

  it("accepts a PDF at the page limit and rejects one page over it, as too_many_pages", async () => {
    await expect(extractText(makePdf(["Page text"], MAX_PDF_PAGES), "pdf")).resolves.toContain("Page text");
    const error = await extractText(makePdf(["Page text"], MAX_PDF_PAGES + 1), "pdf").catch((e) => e);
    expect(error).toBeInstanceOf(ExtractError);
    expect(error.code).toBe("too_many_pages");
  }, 30_000);

  it("does not check the %PDF- signature for txt or md", async () => {
    await expect(extractText(bytes("%PDF- is just text here"), "txt")).resolves.toBe("%PDF- is just text here");
  });
});
