import { describe, expect, it } from "vitest";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { checkFile } from "./validate-file";

describe("checkFile", () => {
  it.each([
    ["guide.pdf", "pdf"],
    ["notes.md", "md"],
    ["readme.txt", "txt"],
    ["LOUD.PDF", "pdf"],
    ["Mixed.Md", "md"],
  ])("accepts %s as %s", (name, fileType) => {
    expect(checkFile({ name, size: 1024 })).toMatchObject({ ok: true, fileType });
  });

  it.each(["virus.exe", "photo.png", "doc.docx", "archive.zip", "noextension", "trailingdot.", ".pdf.exe", "notes.markdown"])(
    "refuses %s before any upload",
    (name) => {
      const result = checkFile({ name, size: 1024 });
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ message: "Choose a PDF, Markdown (.md) or text (.txt) file." });
    },
  );

  it("accepts a file at exactly 10 MB and refuses one byte over", () => {
    expect(checkFile({ name: "a.pdf", size: MAX_KNOWLEDGE_FILE_BYTES }).ok).toBe(true);
    expect(checkFile({ name: "a.pdf", size: MAX_KNOWLEDGE_FILE_BYTES + 1 })).toEqual({
      ok: false,
      message: "That file is larger than 10 MB.",
    });
  });

  it("refuses an empty file", () => {
    expect(checkFile({ name: "a.txt", size: 0 })).toEqual({ ok: false, message: "That file is empty." });
  });

  it("checks the type before the size", () => {
    expect(checkFile({ name: "big.exe", size: MAX_KNOWLEDGE_FILE_BYTES + 1 })).toMatchObject({
      message: "Choose a PDF, Markdown (.md) or text (.txt) file.",
    });
  });

  it("titles the source with the file name without its extension", () => {
    expect(checkFile({ name: "Opening hours.pdf", size: 10 })).toMatchObject({ title: "Opening hours" });
    expect(checkFile({ name: "a.b.c.md", size: 10 })).toMatchObject({ title: "a.b.c" });
  });

  it("keeps the title within the 200-character limit", () => {
    const result = checkFile({ name: `${"x".repeat(300)}.txt`, size: 10 });
    expect(result.ok && result.title).toHaveLength(200);
  });

  it("falls back to the file name when there is nothing before the extension", () => {
    expect(checkFile({ name: ".md", size: 10 })).toMatchObject({ ok: true, title: ".md" });
  });
});
