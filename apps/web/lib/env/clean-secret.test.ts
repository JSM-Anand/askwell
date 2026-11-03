import { describe, expect, it } from "vitest";
import { cleanSecret } from "./clean-secret";

describe("cleanSecret", () => {
  it("returns an empty string for undefined", () => expect(cleanSecret(undefined)).toBe(""));
  it("leaves a clean value alone", () => expect(cleanSecret("whsec_abc=")).toBe("whsec_abc="));
  it("trims whitespace and newlines", () => expect(cleanSecret(" \twhsec_abc\r\n")).toBe("whsec_abc"));
  it("strips one pair of quotes", () => expect(cleanSecret(`"whsec_abc"`)).toBe("whsec_abc"));
  it("strips single quotes and the space inside them", () => expect(cleanSecret(`' whsec_abc '`)).toBe("whsec_abc"));
  it("strips only one pair", () => expect(cleanSecret(`""abc""`)).toBe(`"abc"`));
  it("does not strip mismatched quotes", () => expect(cleanSecret(`"abc'`)).toBe(`"abc'`));
  it("is empty for an empty pair, and keeps a lone quote", () => {
    expect(cleanSecret(`""`)).toBe("");
    expect(cleanSecret(`"`)).toBe(`"`);
  });
});
