import { describe, expect, it } from "vitest";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_MESSAGE_LENGTH,
  chatRequestSchema,
  createProjectSchema,
  finalizeKnowledgeSchema,
  idParamSchema,
  pasteKnowledgeSchema,
  renameProjectSchema,
  updateConfigSchema,
  uploadUrlSchema,
  widgetConfigQuerySchema,
} from "./index";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe("idParamSchema", () => {
  it("accepts a uuid", () => expect(ok(idParamSchema, { id: uuid })).toBe(true));
  it("rejects anything else", () => expect(ok(idParamSchema, { id: "1" })).toBe(false));
});

describe("widgetConfigQuerySchema", () => {
  it("accepts a key", () => expect(ok(widgetConfigQuerySchema, { key: "pk_abc" })).toBe(true));
  it("rejects a missing or empty key", () => {
    expect(ok(widgetConfigQuerySchema, {})).toBe(false);
    expect(ok(widgetConfigQuerySchema, { key: "" })).toBe(false);
  });
});

describe("chatRequestSchema", () => {
  const base = { key: "pk_abc", visitorId: "v1", message: "Hi" };
  it("accepts a message, with or without a conversation", () => {
    expect(ok(chatRequestSchema, base)).toBe(true);
    expect(ok(chatRequestSchema, { ...base, conversationId: uuid })).toBe(true);
  });
  it("accepts exactly the max length and rejects one more", () => {
    expect(ok(chatRequestSchema, { ...base, message: "a".repeat(MAX_MESSAGE_LENGTH) })).toBe(true);
    expect(ok(chatRequestSchema, { ...base, message: "a".repeat(MAX_MESSAGE_LENGTH + 1) })).toBe(false);
  });
  it("rejects an empty or blank message, a bad conversation id and a missing key", () => {
    expect(ok(chatRequestSchema, { ...base, message: "   " })).toBe(false);
    expect(ok(chatRequestSchema, { ...base, conversationId: "nope" })).toBe(false);
    expect(ok(chatRequestSchema, { visitorId: "v1", message: "Hi" })).toBe(false);
  });
});

describe("createProjectSchema / renameProjectSchema", () => {
  for (const [name, schema] of [
    ["create", createProjectSchema],
    ["rename", renameProjectSchema],
  ] as const) {
    it(`${name}: accepts a name`, () => expect(ok(schema, { name: "Docs bot" })).toBe(true));
    it(`${name}: rejects empty, blank and too long names`, () => {
      expect(ok(schema, { name: "" })).toBe(false);
      expect(ok(schema, { name: "  " })).toBe(false);
      expect(ok(schema, { name: "a".repeat(101) })).toBe(false);
    });
  }
});

describe("pasteKnowledgeSchema", () => {
  it("accepts a title and text", () =>
    expect(ok(pasteKnowledgeSchema, { title: "FAQ", content: "Open 9-5" })).toBe(true));
  it("rejects missing or empty fields", () => {
    expect(ok(pasteKnowledgeSchema, { title: "FAQ", content: "" })).toBe(false);
    expect(ok(pasteKnowledgeSchema, { content: "x" })).toBe(false);
  });
});

describe("uploadUrlSchema", () => {
  const base = { title: "Guide", fileType: "pdf", size: 1024 };
  it("accepts pdf, md and txt up to the size limit", () => {
    for (const fileType of ["pdf", "md", "txt"]) expect(ok(uploadUrlSchema, { ...base, fileType })).toBe(true);
    expect(ok(uploadUrlSchema, { ...base, size: MAX_FILE_SIZE_BYTES })).toBe(true);
  });
  it("rejects other types, oversize, zero and fractional sizes", () => {
    expect(ok(uploadUrlSchema, { ...base, fileType: "exe" })).toBe(false);
    expect(ok(uploadUrlSchema, { ...base, size: MAX_FILE_SIZE_BYTES + 1 })).toBe(false);
    expect(ok(uploadUrlSchema, { ...base, size: 0 })).toBe(false);
    expect(ok(uploadUrlSchema, { ...base, size: 1.5 })).toBe(false);
  });
});

describe("finalizeKnowledgeSchema", () => {
  it("accepts a source id", () => expect(ok(finalizeKnowledgeSchema, { sourceId: uuid })).toBe(true));
  it("rejects a bad id", () => expect(ok(finalizeKnowledgeSchema, { sourceId: "x" })).toBe(false));
});

describe("updateConfigSchema", () => {
  it("accepts any subset", () => {
    expect(ok(updateConfigSchema, { label: "Help" })).toBe(true);
    expect(ok(updateConfigSchema, { buttonColor: "#ff0000", position: "top-left", showBadge: false })).toBe(true);
  });
  it("rejects an empty patch", () => expect(ok(updateConfigSchema, {})).toBe(false));
  it("rejects bad values", () => {
    expect(ok(updateConfigSchema, { buttonColor: "red" })).toBe(false);
    expect(ok(updateConfigSchema, { position: "middle" })).toBe(false);
    expect(ok(updateConfigSchema, { animation: "spin" })).toBe(false);
    expect(ok(updateConfigSchema, { label: "" })).toBe(false);
    expect(ok(updateConfigSchema, { showBadge: "no" })).toBe(false);
  });
});
