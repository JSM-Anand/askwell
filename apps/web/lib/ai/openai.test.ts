import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { OpenAI } = vi.hoisted(() => ({ OpenAI: vi.fn() }));
vi.mock("openai", () => ({ default: OpenAI }));

import { CHAT_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models";

async function loadFresh() {
  vi.resetModules();
  return (await import("./openai")).getOpenAI;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
});
afterEach(() => vi.unstubAllEnvs());

describe("getOpenAI", () => {
  it("creates the client with OPENAI_API_KEY", async () => {
    const getOpenAI = await loadFresh();
    getOpenAI();
    expect(OpenAI).toHaveBeenCalledTimes(1);
    expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-test" }));
  });

  it("returns the same client every time", async () => {
    const getOpenAI = await loadFresh();
    expect(getOpenAI()).toBe(getOpenAI());
    expect(OpenAI).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when the key is missing, and doesn't create a client", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const getOpenAI = await loadFresh();
    expect(() => getOpenAI()).toThrow("Missing environment variable OPENAI_API_KEY");
    expect(OpenAI).not.toHaveBeenCalled();
  });

  it("fails on first use, not on import, so a missing key doesn't break the build", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(loadFresh()).resolves.toBeTypeOf("function");
  });
});

describe("models", () => {
  it("names the models and the vector size", () => {
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
    expect(CHAT_MODEL).toBe("gpt-6-luna");
  });
});
