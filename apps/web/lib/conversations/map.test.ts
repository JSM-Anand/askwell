import { describe, expect, it } from "vitest";
import { PREVIEW_LENGTH, previewOf, summarizeThread, toConversationSummary, toMessage } from "./map";
import type { MessageRow } from "./map";

const conversation = { id: "c1", visitor_id: "visitor_1", created_at: "2026-11-02T10:00:00Z" };
const message = (id: string, role: string, body: string, at = "2026-11-02T10:00:01Z"): MessageRow => ({ id, role, body, created_at: at });
const thread = (rows: MessageRow[]) => rows.map(toMessage);

describe("toConversationSummary", () => {
  it("maps an owner_activity row to a ConversationSummary", () => {
    expect(
      toConversationSummary({ id: "c1", visitor_id: "v1", created_at: "2026-11-02T10:00:00Z", message_count: 3, first_message_preview: "Hi there" }),
    ).toEqual({ id: "c1", visitorId: "v1", createdAt: "2026-11-02T10:00:00Z", messageCount: 3, firstMessagePreview: "Hi there" });
  });

  it("keeps a missing preview as null, not undefined or an empty string", () => {
    const summary = toConversationSummary({ id: "c", visitor_id: "v", created_at: "x", message_count: 0, first_message_preview: null });
    expect(summary.firstMessagePreview).toBeNull();
    expect(summary.messageCount).toBe(0);
  });

  it("turns a numeric-string count (a bigint) into a number", () => {
    expect(toConversationSummary({ id: "c", visitor_id: "v", created_at: "x", message_count: "12", first_message_preview: null }).messageCount).toBe(12);
  });

  it("returns only the contract's fields", () => {
    const summary = toConversationSummary({ id: "c", visitor_id: "v", created_at: "x", message_count: 1, first_message_preview: "p", project_id: "secret" } as never);
    expect(Object.keys(summary).sort()).toEqual(["createdAt", "firstMessagePreview", "id", "messageCount", "visitorId"]);
  });
});

describe("toMessage", () => {
  it("maps a row, for both roles", () => {
    expect(toMessage(message("m1", "visitor", "Hi"))).toEqual({ id: "m1", role: "visitor", body: "Hi", createdAt: "2026-11-02T10:00:01Z" });
    expect(toMessage(message("m2", "bot", "Hello")).role).toBe("bot");
  });

  it("refuses a role the contract doesn't know", () => {
    expect(() => toMessage(message("m3", "admin", "x"))).toThrow('Unknown message role "admin"');
  });

  it("passes the body through untouched, even if it looks like HTML (the UI renders it as text)", () => {
    expect(toMessage(message("m4", "visitor", "<script>alert(1)</script>")).body).toBe("<script>alert(1)</script>");
  });
});

describe("previewOf", () => {
  it("cuts to the first 140 characters, and keeps exactly 140 whole", () => {
    expect(PREVIEW_LENGTH).toBe(140);
    expect(previewOf("x".repeat(300))).toBe("x".repeat(140));
    expect(previewOf("a".repeat(140))).toBe("a".repeat(140));
    expect(previewOf("short")).toBe("short");
  });

  it("counts characters, not UTF-16 units: an emoji is one character, like Postgres' left()", () => {
    expect(Array.from(previewOf("😀".repeat(200)))).toHaveLength(140);
    expect(previewOf("😀".repeat(200))).toBe("😀".repeat(140));
    expect(previewOf("é".repeat(200))).toBe("é".repeat(140));
  });
});

describe("summarizeThread", () => {
  it("counts all the messages and previews the earliest visitor message", () => {
    const messages = thread([message("1", "visitor", "Hi there"), message("2", "bot", "Hello!"), message("3", "visitor", "Second question")]);
    expect(summarizeThread(conversation, messages)).toEqual({
      id: "c1", visitorId: "visitor_1", createdAt: "2026-11-02T10:00:00Z", messageCount: 3, firstMessagePreview: "Hi there",
    });
  });

  it("ignores a bot message that comes first", () => {
    const messages = thread([message("1", "bot", "Welcome!"), message("2", "visitor", "Real first message")]);
    expect(summarizeThread(conversation, messages).firstMessagePreview).toBe("Real first message");
  });

  it("has a null preview when there is no visitor message, and 0 when there are no messages", () => {
    expect(summarizeThread(conversation, thread([message("1", "bot", "Anyone there?")])).firstMessagePreview).toBeNull();
    expect(summarizeThread(conversation, [])).toMatchObject({ messageCount: 0, firstMessagePreview: null });
  });

  it("cuts a long first message to 140 characters", () => {
    const messages = thread([message("1", "visitor", "y".repeat(500))]);
    expect(summarizeThread(conversation, messages).firstMessagePreview).toBe("y".repeat(140));
  });
});
