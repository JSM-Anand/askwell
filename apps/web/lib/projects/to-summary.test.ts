import { describe, expect, it } from "vitest";
import { PROJECT_COLUMNS, toProjectSummary } from "./to-summary";

describe("toProjectSummary", () => {
  it("maps a row to a ProjectSummary", () => {
    expect(
      toProjectSummary({
        id: "p1",
        name: "Docs bot",
        public_key: "pk_abc",
        messages_used: 7,
        period_start: "2026-11-01T00:00:00Z",
        created_at: "2026-10-01T00:00:00Z",
      }),
    ).toEqual({
      id: "p1",
      name: "Docs bot",
      publicKey: "pk_abc",
      messagesUsed: 7,
      periodStart: "2026-11-01T00:00:00Z",
      createdAt: "2026-10-01T00:00:00Z",
    });
  });

  it("drops anything that isn't in a ProjectSummary, such as owner_id", () => {
    const summary = toProjectSummary({
      id: "p1",
      name: "n",
      public_key: "pk",
      messages_used: 0,
      period_start: "x",
      created_at: "y",
      owner_id: "user_1",
    } as Parameters<typeof toProjectSummary>[0]);
    expect(Object.keys(summary).sort()).toEqual(
      ["createdAt", "id", "messagesUsed", "name", "periodStart", "publicKey"].sort(),
    );
  });

  it("selects exactly the columns it maps, never owner_id", () => {
    expect(PROJECT_COLUMNS.split(",").map((c) => c.trim())).toEqual([
      "id", "name", "public_key", "messages_used", "period_start", "created_at",
    ]);
  });
});
