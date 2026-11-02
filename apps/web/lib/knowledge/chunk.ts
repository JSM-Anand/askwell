export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;

type Unit = { text: string; sep: string };

/** Unix newlines, runs of spaces collapsed, at most one blank line between paragraphs, no NUL (Postgres text rejects it). */
function normalise(text: string): string {
  return text
    .replaceAll("\0", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A run of text longer than `size` with no sentence boundary: pack words, and cut a single over-long word. */
function splitLong(text: string, size: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (word.length > size) {
      if (current) parts.push(current);
      current = "";
      for (let i = 0; i < word.length; i += size) parts.push(word.slice(i, i + size));
    } else if (current && current.length + 1 + word.length > size) {
      parts.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Paragraphs, then sentences for a paragraph that is too long, then words. Each unit fits in `size`. */
function toUnits(text: string, size: number): Unit[] {
  const units: Unit[] = [];
  for (const paragraph of text.split("\n\n")) {
    if (paragraph.length <= size) {
      units.push({ text: paragraph, sep: "\n\n" });
      continue;
    }
    let first = true;
    for (const sentence of paragraph.split(/(?<=[.!?])\s+|\n/)) {
      if (sentence === "") continue;
      for (const piece of sentence.length <= size ? [sentence] : splitLong(sentence, size)) {
        units.push({ text: piece, sep: first ? "\n\n" : " " });
        first = false;
      }
    }
  }
  return units;
}

/** The end of the previous chunk, starting at a word boundary, up to `max` characters. */
function overlapTail(previous: string, max: number): string {
  if (max <= 0 || previous.length <= max) return "";
  const slice = previous.slice(previous.length - max);
  const boundary = slice.search(/\s/);
  return boundary === -1 ? "" : slice.slice(boundary).trimStart();
}

/**
 * Splits text into chunks of about `size` characters (never more) with about
 * `overlap` characters repeated from the end of the previous chunk. It breaks on
 * paragraph, then sentence, then word boundaries. No chunk is empty.
 */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const normalised = normalise(text);
  if (normalised === "") return [];

  const chunks: string[] = [];
  let current = "";
  for (const unit of toUnits(normalised, size)) {
    if (current === "") {
      current = unit.text;
    } else if (current.length + unit.sep.length + unit.text.length <= size) {
      current += unit.sep + unit.text;
    } else {
      chunks.push(current);
      const tail = overlapTail(current, Math.min(overlap, size - unit.sep.length - unit.text.length));
      current = tail ? tail + unit.sep + unit.text : unit.text;
    }
  }
  if (current !== "") chunks.push(current);
  return chunks;
}
