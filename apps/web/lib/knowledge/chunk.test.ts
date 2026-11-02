import { describe, expect, it } from "vitest";
import { CHUNK_OVERLAP, CHUNK_SIZE, chunkText } from "./chunk";

/** A sentence of about 60 characters, numbered so chunks can be told apart. */
const sentence = (n: number) => `This is sentence number ${String(n).padStart(4, "0")}, short and plain.`;
const paragraph = (n: number, sentences = 6) =>
  Array.from({ length: sentences }, (_, i) => sentence(n * 100 + i)).join(" ");

/** Longest k <= max such that `next` starts with the last k characters of `previous`. */
function overlap(previous: string, next: string, max = 400): number {
  for (let k = Math.min(max, previous.length, next.length); k > 0; k--) {
    if (previous.endsWith(next.slice(0, k))) return k;
  }
  return 0;
}

describe("chunkText: input", () => {
  it("returns nothing for empty or blank text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n \t ")).toEqual([]);
  });

  it("returns one chunk for a tiny text", () => {
    expect(chunkText("Hello there.")).toEqual(["Hello there."]);
  });

  it("returns one chunk for text just under the size, and splits just over it", () => {
    expect(chunkText("a ".repeat(499).trim())).toHaveLength(1);
    expect(chunkText("word ".repeat(300).trim()).length).toBeGreaterThan(1);
  });
});

describe("chunkText: size", () => {
  const text = Array.from({ length: 40 }, (_, i) => paragraph(i)).join("\n\n");
  const chunks = chunkText(text);

  it("never makes a chunk longer than 1,000 characters", () => {
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
  });

  it("fills chunks close to the size, not scraps", () => {
    for (const chunk of chunks.slice(0, -1)) expect(chunk.length).toBeGreaterThan(CHUNK_SIZE * 0.5);
  });

  it("has no empty or whitespace-only chunk", () => {
    for (const chunk of chunks) expect(chunk.trim()).not.toBe("");
  });

  it("honours a custom size", () => {
    for (const chunk of chunkText(text, 300, 50)) expect(chunk.length).toBeLessThanOrEqual(300);
  });
});

describe("chunkText: overlap", () => {
  const chunks = chunkText(Array.from({ length: 30 }, (_, i) => paragraph(i)).join("\n\n"));

  it("repeats about 150 characters from the end of the previous chunk", () => {
    expect(chunks.length).toBeGreaterThan(3);
    for (let i = 1; i < chunks.length; i++) {
      const k = overlap(chunks[i - 1]!, chunks[i]!);
      expect(k, `chunk ${i}`).toBeGreaterThan(CHUNK_OVERLAP * 0.5);
      expect(k, `chunk ${i}`).toBeLessThanOrEqual(CHUNK_OVERLAP);
    }
  });

  it("starts the overlap at a word, not in the middle of one", () => {
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startsWith(" ")).toBe(false);
      expect(chunks[i]!).toMatch(/^[A-Za-z]/);
    }
  });

  it("loses no text: every sentence appears in some chunk", () => {
    const joined = chunks.join("\n");
    for (let p = 0; p < 30; p++) {
      for (let s = 0; s < 6; s++) expect(joined).toContain(sentence(p * 100 + s));
    }
  });

  it("makes progress: no chunk is only the overlap of the one before", () => {
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.length).toBeGreaterThan(overlap(chunks[i - 1]!, chunks[i]!));
    }
  });
});

describe("chunkText: boundaries", () => {
  it("breaks between paragraphs when they fit", () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `Paragraph ${i}. ${"x".repeat(380)}.`);
    const chunks = chunkText(paragraphs.join("\n\n"));
    // 2 whole paragraphs per chunk (~800), never cut through one.
    expect(chunks[0]).toBe(`${paragraphs[0]}\n\n${paragraphs[1]}`);
    expect(chunks[0]!.endsWith(".")).toBe(true);
  });

  it("breaks between sentences inside a paragraph that is too long", () => {
    const longParagraph = Array.from({ length: 40 }, (_, i) => sentence(i)).join(" ");
    const chunks = chunkText(longParagraph);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.trimEnd().endsWith(".")).toBe(true);
    }
  });

  it("cuts a very long word instead of looping or exceeding the size", () => {
    const chunks = chunkText(`start ${"z".repeat(2500)} end`);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
    expect(chunks.join("")).toContain("z".repeat(1000));
  });

  it("handles one huge line with no punctuation", () => {
    const chunks = chunkText("lorem ".repeat(1000));
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
    expect(chunks.length).toBeGreaterThan(5);
  });
});

describe("chunkText: whitespace", () => {
  it("normalises line endings, runs of spaces and blank lines", () => {
    expect(chunkText("one   two\t\tthree\r\nfour\r\n\r\n\r\n\r\nfive")).toEqual(["one two three\nfour\n\nfive"]);
  });

  it("removes NUL characters, which Postgres text can't store", () => {
    expect(chunkText("a\0b\0c d")).toEqual(["abc d"]);
  });

  it("trims each line and the whole text", () => {
    expect(chunkText("  hello   \n   world  ")).toEqual(["hello\nworld"]);
  });

  it("gives the same chunks for the same text", () => {
    const text = Array.from({ length: 12 }, (_, i) => paragraph(i)).join("\n\n");
    expect(chunkText(text)).toEqual(chunkText(text));
  });
});
