import { describe, expect, it } from "vitest";
import { cleanEnvValue } from "./api-key";

describe("cleanEnvValue", () => {
  it("returns an empty string for undefined", () => expect(cleanEnvValue(undefined)).toBe(""));
  it("leaves a clean value alone", () => expect(cleanEnvValue("AIza123")).toBe("AIza123"));
  it("trims whitespace and newlines", () => expect(cleanEnvValue(" \tAIza123\r\n")).toBe("AIza123"));
  it("strips one pair of quotes", () => expect(cleanEnvValue(`"AIza123"`)).toBe("AIza123"));
  it("strips only one pair", () => expect(cleanEnvValue(`""AIza""`)).toBe(`"AIza"`));
  it("does not strip mismatched quotes", () => expect(cleanEnvValue(`"AIza123'`)).toBe(`"AIza123'`));
  it("is empty for a lone quote or an empty pair", () => {
    expect(cleanEnvValue(`"`)).toBe(`"`);
    expect(cleanEnvValue(`""`)).toBe("");
  });
});
