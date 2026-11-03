import { describe, expect, it } from "vitest";
import { MAX_POLLS, planFacts, upgradeStatus } from "./billing-state";

describe("upgradeStatus", () => {
  it("is none when the owner did not just check out", () => {
    expect(upgradeStatus({ plan: "free", checkedOut: false, polls: 0 })).toBe("none");
    expect(upgradeStatus({ plan: "pro", checkedOut: false, polls: 0 })).toBe("none");
  });
  it("waits while our database still says free", () => {
    expect(upgradeStatus({ plan: "free", checkedOut: true, polls: 0 })).toBe("waiting");
    expect(upgradeStatus({ plan: "free", checkedOut: true, polls: MAX_POLLS - 1 })).toBe("waiting");
  });
  it("stalls after the last poll", () => {
    expect(upgradeStatus({ plan: "free", checkedOut: true, polls: MAX_POLLS })).toBe("stalled");
  });
  it("is done only when the database says pro, even after stalling", () => {
    expect(upgradeStatus({ plan: "pro", checkedOut: true, polls: 0 })).toBe("done");
    expect(upgradeStatus({ plan: "pro", checkedOut: true, polls: MAX_POLLS })).toBe("done");
  });
});

describe("planFacts", () => {
  it("lists the Free limits from PLAN_LIMITS", () => {
    expect(planFacts("free")).toEqual([
      "1 project",
      "100 messages a month per project",
      "3 knowledge sources per project",
      "Default button color, label and header",
      "Bottom-right button",
      "Fade animation",
      "“Powered by” badge shown",
    ]);
  });
  it("lists the Pro limits from PLAN_LIMITS", () => {
    expect(planFacts("pro")).toEqual([
      "5 projects",
      "2,000 messages a month per project",
      "25 knowledge sources per project",
      "Custom button color, label and header",
      "Any button corner",
      "Fade, slide or scale animation",
      "Hide the “Powered by” badge",
    ]);
  });
});
