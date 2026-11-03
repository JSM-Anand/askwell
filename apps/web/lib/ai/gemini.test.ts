import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { GoogleGenAI } = vi.hoisted(() => ({ GoogleGenAI: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI }));

import { CHAT_FALLBACK_MODEL, CHAT_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models";

async function loadFresh() {
  vi.resetModules();
  return (await import("./gemini")).getGemini;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("getGemini", () => {
  it("creates the client with GEMINI_API_KEY", async () => {
    const getGemini = await loadFresh();
    getGemini();
    expect(GoogleGenAI).toHaveBeenCalledTimes(1);
    expect(GoogleGenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "test-key" }));
  });

  it.each([
    ["trailing newline", "test-key\n", "test-key"],
    ["surrounding spaces", "  test-key  ", "test-key"],
    ["double quotes", '"test-key"', "test-key"],
    ["single quotes", "'test-key'", "test-key"],
    ["quotes and a newline", '"test-key"\r\n', "test-key"],
    ["spaces inside quotes", '" test-key "', "test-key"],
  ])("cleans the key: %s", async (_name, raw, expected) => {
    vi.stubEnv("GEMINI_API_KEY", raw);
    const getGemini = await loadFresh();
    getGemini();
    expect(GoogleGenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: expected }));
  });

  it.each([["   "], ['""'], ["\n"]])("treats %j as missing", async (raw) => {
    vi.stubEnv("GEMINI_API_KEY", raw);
    const getGemini = await loadFresh();
    expect(() => getGemini()).toThrow("Missing environment variable GEMINI_API_KEY");
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it("keeps quotes that are inside the key or unmatched", async () => {
    vi.stubEnv("GEMINI_API_KEY", `ab"cd`);
    const getGemini = await loadFresh();
    getGemini();
    expect(GoogleGenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: `ab"cd` }));
  });

  it("returns the same client every time", async () => {
    const getGemini = await loadFresh();
    expect(getGemini()).toBe(getGemini());
    expect(GoogleGenAI).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when the key is missing, and doesn't create a client", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const getGemini = await loadFresh();
    expect(() => getGemini()).toThrow("Missing environment variable GEMINI_API_KEY");
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it("fails on first use, not on import, so a missing key doesn't break the build", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(loadFresh()).resolves.toBeTypeOf("function");
  });
});

describe("models", () => {
  it("names the models and the vector size", () => {
    expect(EMBEDDING_MODEL).toBe("gemini-embedding-2");
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
    expect(CHAT_MODEL).toBe("gemini-3.1-flash-lite");
    expect(CHAT_FALLBACK_MODEL).toBe("gemini-3.5-flash-lite");
    expect(CHAT_FALLBACK_MODEL).not.toBe(CHAT_MODEL);
  });
});
