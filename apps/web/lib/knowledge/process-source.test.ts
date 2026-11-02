import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** A tiny in-memory stand-in for the two tables, so "no chunks left" is checked on real state. */
const { db, client, embedTexts, createServiceClient } = vi.hoisted(() => {
  const db = {
    chunks: [] as Record<string, unknown>[],
    sources: [{ id: "s1", project_id: "p1", status: "processing" }] as Record<string, unknown>[],
    insertCalls: 0,
    failInsertOnCall: 0,
    failUpdate: false,
    log: [] as string[],
  };

  const builder = (table: "chunks" | "sources", action: "delete" | "update", patch?: Record<string, unknown>) => {
    const filters: [string, unknown][] = [];
    const run = () => {
      const rows = db[table];
      const match = (row: Record<string, unknown>) => filters.every(([col, val]) => row[col] === val);
      if (action === "delete") db[table] = rows.filter((row) => !match(row));
      else if (db.failUpdate) return { error: { message: "update boom" } };
      else rows.filter(match).forEach((row) => Object.assign(row, patch));
      db.log.push(`${action} ${table} ${JSON.stringify(filters)}${patch ? ` ${JSON.stringify(patch)}` : ""}`);
      return { error: null };
    };
    const chain = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return chain;
      },
      then: (resolve: (value: unknown) => unknown) => resolve(run()),
    };
    return chain;
  };

  const client = {
    from(name: string) {
      const table = name === "knowledge_chunks" ? "chunks" : "sources";
      return {
        insert: async (rows: Record<string, unknown>[]) => {
          db.insertCalls++;
          if (db.failInsertOnCall === db.insertCalls) return { error: { message: "insert boom" } };
          db.chunks.push(...rows);
          return { error: null };
        },
        update: (patch: Record<string, unknown>) => builder(table, "update", patch),
        delete: () => builder(table, "delete"),
      };
    },
  };
  return { db, client, embedTexts: vi.fn(), createServiceClient: vi.fn(() => client) };
});
vi.mock("../ai/embed", () => ({ embedTexts }));
vi.mock("../supabase/service", () => ({ createServiceClient }));

import { STORE_BATCH_SIZE, markSourceFailed, processSource } from "./process-source";

const vec = (n: number) => Array.from({ length: 1536 }, (_, i) => (i === 0 ? n : 0));
const sentence = (n: number) => `This is sentence number ${String(n).padStart(4, "0")}, short and plain.`;
/** Text that chunks into about `n` chunks. */
const textOfChunks = (n: number) => Array.from({ length: n * 17 }, (_, i) => sentence(i)).join(" ");

const sourceStatus = () => db.sources[0]?.status;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.chunks = [];
  db.sources = [{ id: "s1", project_id: "p1", status: "processing" }];
  db.insertCalls = 0;
  db.failInsertOnCall = 0;
  db.failUpdate = false;
  db.log = [];
  embedTexts.mockImplementation(async (texts: string[]) => texts.map((_, i) => vec(i)));
});

describe("processSource: ready path", () => {
  it("stores the chunks with the source's project_id and source_id, then marks it ready", async () => {
    const result = await processSource({ sourceId: "s1", projectId: "p1", text: "Hello world. This is a small document." });
    expect(result).toEqual({ chunks: 1 });
    expect(db.chunks).toHaveLength(1);
    expect(db.chunks[0]).toMatchObject({ project_id: "p1", source_id: "s1", content: "Hello world. This is a small document." });
    expect(sourceStatus()).toBe("ready");
  });

  it("stores each vector as a pgvector literal", async () => {
    await processSource({ sourceId: "s1", projectId: "p1", text: "Some text." });
    const embedding = db.chunks[0]?.embedding as string;
    expect(embedding.startsWith("[1") || embedding.startsWith("[0")).toBe(true);
    expect(JSON.parse(embedding)).toHaveLength(1536);
  });

  it("embeds the chunks, in order, matched to their rows", async () => {
    embedTexts.mockImplementation(async (texts: string[]) => texts.map((text) => vec(text.length)));
    await processSource({ sourceId: "s1", projectId: "p1", text: textOfChunks(3) });
    expect(db.chunks.length).toBeGreaterThan(2);
    for (const row of db.chunks) {
      expect((JSON.parse(row.embedding as string) as number[])[0]).toBe((row.content as string).length);
    }
  });

  it("embeds and stores in batches, so large documents never hold every vector at once", async () => {
    const { chunks } = await processSource({ sourceId: "s1", projectId: "p1", text: textOfChunks(STORE_BATCH_SIZE + 20) });
    expect(chunks).toBeGreaterThan(STORE_BATCH_SIZE);
    expect(embedTexts.mock.calls.length).toBe(Math.ceil(chunks / STORE_BATCH_SIZE));
    expect(embedTexts.mock.calls.every(([batch]) => batch.length <= STORE_BATCH_SIZE)).toBe(true);
    expect(db.insertCalls).toBe(embedTexts.mock.calls.length);
    expect(db.chunks).toHaveLength(chunks);
  });

  it("only touches the status of this source in this project", async () => {
    await processSource({ sourceId: "s1", projectId: "p1", text: "Some text." });
    expect(db.log.at(-1)).toContain('["id","s1"],["project_id","p1"]');
  });
});

describe("processSource: failed path", () => {
  it("an embedding error leaves no chunks, sets failed and rethrows the error", async () => {
    embedTexts.mockRejectedValueOnce(new Error("429 Rate limit"));
    await expect(processSource({ sourceId: "s1", projectId: "p1", text: "Some text." })).rejects.toThrow("429 Rate limit");
    expect(db.chunks).toEqual([]);
    expect(sourceStatus()).toBe("failed");
  });

  it("a failure on a later batch deletes the chunks stored by the earlier ones", async () => {
    db.failInsertOnCall = 2;
    await expect(
      processSource({ sourceId: "s1", projectId: "p1", text: textOfChunks(STORE_BATCH_SIZE + 20) }),
    ).rejects.toThrow("Could not store chunks: insert boom");
    expect(db.insertCalls).toBe(2);
    expect(db.chunks).toEqual([]);
    expect(sourceStatus()).toBe("failed");
  });

  it("a failure after the last insert still leaves no chunks", async () => {
    db.failUpdate = true;
    // The ready update fails, then the cleanup's own update fails too: chunks are still gone.
    await expect(processSource({ sourceId: "s1", projectId: "p1", text: "Some text." })).rejects.toThrow("Could not mark the source ready");
    expect(db.chunks).toEqual([]);
  });

  it("text with nothing in it fails the source without calling OpenAI", async () => {
    await expect(processSource({ sourceId: "s1", projectId: "p1", text: " \n " })).rejects.toThrow("no text to process");
    expect(embedTexts).not.toHaveBeenCalled();
    expect(sourceStatus()).toBe("failed");
  });

  it("deletes only this source's chunks, not another source's in the same project", async () => {
    db.chunks = [{ project_id: "p1", source_id: "other", content: "keep me" }];
    embedTexts.mockRejectedValueOnce(new Error("boom"));
    await expect(processSource({ sourceId: "s1", projectId: "p1", text: "Some text." })).rejects.toThrow("boom");
    expect(db.chunks).toEqual([{ project_id: "p1", source_id: "other", content: "keep me" }]);
  });

  it("throws the original error even when the cleanup itself fails", async () => {
    embedTexts.mockRejectedValueOnce(new Error("original"));
    // The first client is processSource's own; the second is the cleanup's, and it fails.
    let calls = 0;
    createServiceClient.mockImplementation(() => {
      if (++calls === 2) throw new Error("cleanup client failed");
      return client;
    });
    await expect(processSource({ sourceId: "s1", projectId: "p1", text: "Some text." })).rejects.toThrow("original");
    expect(calls).toBe(2);
    createServiceClient.mockImplementation(() => client);
  });
});

describe("markSourceFailed", () => {
  it("deletes the source's chunks and sets failed, for files that can't be read at all", async () => {
    db.chunks = [{ project_id: "p1", source_id: "s1", content: "old" }];
    await markSourceFailed({ sourceId: "s1", projectId: "p1" });
    expect(db.chunks).toEqual([]);
    expect(sourceStatus()).toBe("failed");
  });

  it("never throws", async () => {
    createServiceClient.mockImplementationOnce(() => { throw new Error("no client"); });
    await expect(markSourceFailed({ sourceId: "s1", projectId: "p1" })).resolves.toBeUndefined();
  });
});
