import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./openai", () => ({ getOpenAI: () => ({ embeddings: { create } }) }));

import { EMBEDDING_BATCH_SIZE, embedTexts } from "./embed";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models";

/** A vector whose first element is `n`, so tests can tell vectors apart. */
const vec = (n: number, length = EMBEDDING_DIMENSIONS) => [n, ...Array.from({ length: length - 1 }, () => 0)];

/** Mimics the API: one embedding per input, the vector's first element is the number in the text. */
const echoNumbers = ({ input }: { input: string[] }) => ({
  data: input.map((text, index) => ({ index, embedding: vec(Number(text)) })),
});

beforeEach(() => {
  vi.clearAllMocks();
  create.mockImplementation(async (params) => echoNumbers(params));
});

describe("embedTexts", () => {
  it("returns one 1536-long vector per text", async () => {
    const vectors = await embedTexts(["1", "2"]);
    expect(vectors).toHaveLength(2);
    for (const v of vectors) expect(v).toHaveLength(1536);
  });

  it("asks for the embedding model with 1536 float dimensions", async () => {
    await embedTexts(["1"]);
    expect(create).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["1"],
      dimensions: 1536,
      encoding_format: "float",
    });
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
  });

  it("sends nothing for no texts", async () => {
    await expect(embedTexts([])).resolves.toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("splits a long list into batches", async () => {
    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE * 2 + 50 }, (_, i) => String(i));
    const vectors = await embedTexts(texts);
    expect(create.mock.calls.map(([params]) => params.input.length)).toEqual([EMBEDDING_BATCH_SIZE, EMBEDDING_BATCH_SIZE, 50]);
    expect(vectors).toHaveLength(texts.length);
  });

  it("keeps the order of the texts across batches", async () => {
    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE + 5 }, (_, i) => String(i));
    const vectors = await embedTexts(texts);
    expect(vectors.map((v) => v[0])).toEqual(texts.map(Number));
  });

  it("keeps the order even when the API answers out of order", async () => {
    create.mockImplementationOnce(async ({ input }: { input: string[] }) => ({
      data: input.map((text, index) => ({ index, embedding: vec(Number(text)) })).reverse(),
    }));
    const vectors = await embedTexts(["1", "2", "3"]);
    expect(vectors.map((v) => v[0])).toEqual([1, 2, 3]);
  });

  it("rejects a vector of the wrong length", async () => {
    create.mockResolvedValueOnce({ data: [{ index: 0, embedding: vec(1, 768) }] });
    await expect(embedTexts(["1"])).rejects.toThrow("Expected 1536 dimensions, got 768");
  });

  it.each([
    ["duplicate indices", [1, 1]],
    ["out-of-range indices", [0, 5]],
    ["indices that skip 0", [1, 2]],
    ["negative indices", [-1, 0]],
  ])("rejects %s, since the vectors can't be tied to their texts", async (_label, indices) => {
    create.mockResolvedValueOnce({ data: indices.map((index) => ({ index, embedding: vec(index) })) });
    await expect(embedTexts(["1", "2"])).rejects.toThrow("Embedding indices don't match the inputs");
  });

  it("rejects a response with the wrong number of embeddings", async () => {
    create.mockResolvedValueOnce({ data: [{ index: 0, embedding: vec(1) }] });
    await expect(embedTexts(["1", "2"])).rejects.toThrow("Expected 2 embeddings, got 1");
  });

  it("lets an API error through, and stops sending batches", async () => {
    create.mockResolvedValueOnce(echoNumbers({ input: Array.from({ length: EMBEDDING_BATCH_SIZE }, (_, i) => String(i)) }));
    create.mockRejectedValueOnce(new Error("429 Rate limit reached"));
    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE * 3 }, (_, i) => String(i));
    await expect(embedTexts(texts)).rejects.toThrow("429 Rate limit reached");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each([[""], ["   "], ["\n"]])("refuses an empty text (%j) before calling the API", async (empty) => {
    await expect(embedTexts(["1", empty])).rejects.toThrow("Cannot embed an empty text");
    expect(create).not.toHaveBeenCalled();
  });
});
