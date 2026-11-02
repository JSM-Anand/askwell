import { describe, expect, it } from "vitest";
import { generatePublicKey } from "./public-key";

describe("generatePublicKey", () => {
  it("is pk_ plus 24 random bytes as hex", () => {
    expect(generatePublicKey()).toMatch(/^pk_[0-9a-f]{48}$/);
  });

  it("is different every time", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generatePublicKey()));
    expect(keys.size).toBe(200);
  });

  it("fits the widget route's key limit (100 characters)", () => {
    expect(generatePublicKey().length).toBeLessThanOrEqual(100);
  });
});
