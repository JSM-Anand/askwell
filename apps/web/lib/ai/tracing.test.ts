import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const capture = vi.hoisted(() => vi.fn());
vi.mock("../analytics/server", () => ({ capture }));

import { generationProperties, traceGeneration } from "./tracing";

const rec = {
  model: "gemini-3.1-flash-lite",
  latencySeconds: 1.25,
  usage: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 5, cachedContentTokenCount: 10 },
};

beforeEach(() => {
  capture.mockReset();
  capture.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("traceGeneration", () => {
  it("captures one $ai_generation with the IDs, model, tokens and latency", async () => {
    await traceGeneration({ distinctId: "owner_1", projectId: "p1", traceId: "conv-1" }, rec);
    expect(capture).toHaveBeenCalledTimes(1);
    const call = capture.mock.calls[0]![0];
    expect(call.distinctId).toBe("owner_1");
    expect(call.event).toBe("$ai_generation");
    expect(call.properties).toMatchObject({
      $ai_provider: "gemini",
      $ai_model: "gemini-3.1-flash-lite",
      $ai_trace_id: "conv-1",
      $ai_latency: 1.25,
      $ai_input_tokens: 120,
      $ai_output_tokens: 30,
      $ai_reasoning_tokens: 5,
      $ai_cache_read_input_tokens: 10,
      project_id: "p1",
    });
  });

  it("sends no prompt or reply text", async () => {
    await traceGeneration({ distinctId: "o", projectId: "p1", traceId: "c" }, rec);
    const props = capture.mock.calls[0]![0].properties as Record<string, unknown>;
    expect(props).not.toHaveProperty("$ai_input");
    expect(props).not.toHaveProperty("$ai_output_choices");
  });

  it("waits for a trace ID that settles later (a first message)", async () => {
    let settle!: (id: string) => void;
    const traceId = new Promise<string>((r) => (settle = r));
    const done = traceGeneration({ distinctId: "o", projectId: "p1", traceId }, rec);
    await Promise.resolve();
    expect(capture).not.toHaveBeenCalled();
    settle("conv-new");
    await done;
    expect(capture.mock.calls[0]![0].properties.$ai_trace_id).toBe("conv-new");
  });

  it("leaves token counts out when Gemini reported no usage", () => {
    const props = generationProperties({ projectId: "p" }, "t", { model: "m", latencySeconds: 1 });
    expect(props).not.toHaveProperty("$ai_input_tokens");
    expect(props).not.toHaveProperty("$ai_output_tokens");
  });

  it("keeps a reported zero, and omits only the count that is missing", () => {
    const props = generationProperties({ projectId: "p" }, "t", { model: "m", latencySeconds: 1, usage: { candidatesTokenCount: 0 } });
    expect(props).toHaveProperty("$ai_output_tokens", 0);
    expect(props).not.toHaveProperty("$ai_input_tokens");
  });

  it("never rejects when capture fails", async () => {
    capture.mockRejectedValue(new Error("down"));
    await expect(traceGeneration({ distinctId: "o", projectId: "p1", traceId: "c" }, rec)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
