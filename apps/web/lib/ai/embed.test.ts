import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { embedContent } = vi.hoisted(() => ({ embedContent: vi.fn() }));
vi.mock("./gemini", () => ({ getGemini: () => ({ models: { embedContent } }) }));

import { EMBEDDING_BATCH_SIZE, embedQuery, embedTexts } from "./embed";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models";
import { AiRateLimitError, RATE_LIMIT_RETRY_DELAY_MS } from "./rate-limit";

type Params = { model: string; contents: { parts: { text: string }[] }[]; config: { outputDimensionality: number } };

/** A vector whose first element is `n`, so tests can tell vectors apart. */
const vec = (n: number, length = EMBEDDING_DIMENSIONS) => [n, ...Array.from({ length: length - 1 }, () => 0)];

/** The text a Content object carries. */
const textOf = ({ contents }: Params) => contents.map((c) => c.parts[0]!.text);

/** Mimics the API: one embedding per input, in order. The vector's first element is the number inside the text. */
const echoNumbers = (params: Params) => ({
  embeddings: textOf(params).map((text) => ({ values: vec(Number(text.match(/\d+/)?.[0])) })),
});

const documents = (...numbers: number[]) => numbers.map(String);

beforeEach(() => {
  vi.clearAllMocks();
  embedContent.mockImplementation(async (params: Params) => echoNumbers(params));
});
afterEach(() => vi.useRealTimers());

describe("embedTexts", () => {
  it("returns one 1536-long vector per text", async () => {
    const vectors = await embedTexts(documents(1, 2));
    expect(vectors).toHaveLength(2);
    for (const v of vectors) expect(v).toHaveLength(1536);
  });

  it("asks for the embedding model with 1536 dimensions", async () => {
    await embedTexts(["7"]);
    expect(embedContent).toHaveBeenCalledTimes(1);
    const params = embedContent.mock.calls[0]![0] as Params;
    expect(params.model).toBe("gemini-embedding-2");
    expect(params.config).toEqual({ outputDimensionality: 1536 });
    expect(EMBEDDING_MODEL).toBe("gemini-embedding-2");
  });

  it("sends each text as its own Content object, so Gemini returns separate vectors", async () => {
    await embedTexts(documents(1, 2, 3));
    const params = embedContent.mock.calls[0]![0] as Params;
    expect(params.contents).toHaveLength(3);
    for (const content of params.contents) expect(content.parts).toHaveLength(1);
  });

  it("marks stored text as a document (title: none | text: ...) without changing what is returned", async () => {
    await embedTexts(["Opening hours are 9 to 5."]);
    expect(textOf(embedContent.mock.calls[0]![0] as Params)).toEqual(["title: none | text: Opening hours are 9 to 5."]);
  });

  it("sends nothing for no texts", async () => {
    await expect(embedTexts([])).resolves.toEqual([]);
    expect(embedContent).not.toHaveBeenCalled();
  });

  it("splits a long list into batches", async () => {
    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE * 2 + 50 }, (_, i) => String(i));
    const vectors = await embedTexts(texts);
    expect(embedContent.mock.calls.map(([params]) => (params as Params).contents.length)).toEqual([
      EMBEDDING_BATCH_SIZE,
      EMBEDDING_BATCH_SIZE,
      50,
    ]);
    expect(vectors).toHaveLength(texts.length);
  });

  it("keeps the order of the texts across batches", async () => {
    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE + 5 }, (_, i) => String(i));
    const vectors = await embedTexts(texts);
    expect(vectors.map((v) => v[0])).toEqual(texts.map(Number));
  });

  it("rejects a vector of the wrong length", async () => {
    embedContent.mockResolvedValueOnce({ embeddings: [{ values: vec(1, 768) }] });
    await expect(embedTexts(["1"])).rejects.toThrow("Expected 1536 dimensions, got 768");
  });

  it("rejects an embedding with no values", async () => {
    embedContent.mockResolvedValueOnce({ embeddings: [{}] });
    await expect(embedTexts(["1"])).rejects.toThrow("Expected 1536 dimensions, got 0");
  });

  it("rejects a response with the wrong number of embeddings (e.g. one aggregated vector for many texts)", async () => {
    embedContent.mockResolvedValueOnce({ embeddings: [{ values: vec(1) }] });
    await expect(embedTexts(["1", "2"])).rejects.toThrow("Expected 2 embeddings, got 1");
    embedContent.mockResolvedValueOnce({});
    await expect(embedTexts(["1", "2"])).rejects.toThrow("Expected 2 embeddings, got 0");
  });

  it("lets an API error through, and stops sending batches", async () => {
    embedContent.mockImplementationOnce(async (params: Params) => echoNumbers(params));
    embedContent.mockRejectedValueOnce(new ApiError({ message: "bad request", status: 400 }));
    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE * 3 }, (_, i) => String(i));
    await expect(embedTexts(texts)).rejects.toThrow("bad request");
    expect(embedContent).toHaveBeenCalledTimes(2);
  });

  it.each([[""], ["   "], ["\n"]])("refuses an empty text (%j) before calling the API", async (empty) => {
    await expect(embedTexts(["1", empty])).rejects.toThrow("Cannot embed an empty text");
    expect(embedContent).not.toHaveBeenCalled();
  });

  describe("rate limits", () => {
    beforeEach(() => vi.useFakeTimers());

    it("retries a 429 once after a pause and returns the vectors", async () => {
      embedContent.mockRejectedValueOnce(new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 }));
      const result = embedTexts(["5"]);
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAY_MS);
      const vectors = await result;
      expect(vectors.map((v) => v[0])).toEqual([5]);
      expect(embedContent).toHaveBeenCalledTimes(2);
    });

    it("throws an AiRateLimitError after a second 429", async () => {
      embedContent.mockRejectedValue(new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 }));
      const result = embedTexts(["5"]);
      const assertion = expect(result).rejects.toBeInstanceOf(AiRateLimitError);
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAY_MS);
      await assertion;
      expect(embedContent).toHaveBeenCalledTimes(2);
    });
  });
});

describe("embedQuery", () => {
  it("returns one 1536-long vector", async () => {
    const vector = await embedQuery("What are your hours? 4");
    expect(vector).toHaveLength(1536);
    expect(vector[0]).toBe(4);
  });

  it("marks the text as a question (task: question answering | query: ...), not as a document", async () => {
    await embedQuery("When do you open?");
    const sent = textOf(embedContent.mock.calls[0]![0] as Params);
    expect(sent).toEqual(["task: question answering | query: When do you open?"]);
    expect(sent[0]).not.toContain("title:");
  });

  it("uses the same model and 1536 dimensions as the stored chunks", async () => {
    await embedQuery("hi");
    const params = embedContent.mock.calls[0]![0] as Params;
    expect(params.model).toBe(EMBEDDING_MODEL);
    expect(params.config).toEqual({ outputDimensionality: 1536 });
    expect(params.contents).toHaveLength(1);
  });

  it("rejects a vector of the wrong length", async () => {
    embedContent.mockResolvedValueOnce({ embeddings: [{ values: vec(1, 3072) }] });
    await expect(embedQuery("hi")).rejects.toThrow("Expected 1536 dimensions, got 3072");
  });

  it("rejects an empty question before calling the API", async () => {
    await expect(embedQuery("  ")).rejects.toThrow("Cannot embed an empty text");
    expect(embedContent).not.toHaveBeenCalled();
  });

  it("retries a 429 once, then throws an AiRateLimitError", async () => {
    vi.useFakeTimers();
    embedContent.mockRejectedValue(new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 }));
    const result = embedQuery("hi");
    const assertion = expect(result).rejects.toBeInstanceOf(AiRateLimitError);
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAY_MS);
    await assertion;
    expect(embedContent).toHaveBeenCalledTimes(2);
  });
});
