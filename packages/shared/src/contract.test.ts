import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  DEFAULT_WIDGET_CONFIG,
  ERROR_CODES,
  ERROR_STATUS,
  KNOWLEDGE_FILE_MIME_TYPES,
  KNOWLEDGE_FILE_TYPES,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_MESSAGE_LENGTH,
  MESSAGE_ROLES,
  widgetConfigSchema,
} from "./index";

describe("constants", () => {
  it("keeps APP_NAME", () => {
    expect(APP_NAME).toBe("Askwell");
  });

  it("matches §7 and §9", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(1000);
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(KNOWLEDGE_FILE_TYPES).toEqual(["pdf", "md", "txt"]);
    expect(KNOWLEDGE_FILE_MIME_TYPES.pdf).toBe("application/pdf");
    expect(KNOWLEDGE_SOURCE_TYPES).toEqual(["text", "pdf", "md", "txt"]);
    expect(KNOWLEDGE_SOURCE_STATUSES).toEqual(["uploading", "processing", "ready", "failed"]);
    expect(MESSAGE_ROLES).toEqual(["visitor", "bot"]);
  });

  it("defaults to a black, bottom-right, fade button with the badge", () => {
    expect(DEFAULT_WIDGET_CONFIG).toMatchObject({
      buttonColor: "#000000",
      position: "bottom-right",
      animation: "fade",
      showBadge: true,
    });
    expect(widgetConfigSchema.safeParse(DEFAULT_WIDGET_CONFIG).success).toBe(true);
  });

  it("gives every error code a status", () => {
    for (const code of ERROR_CODES) expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    expect(ERROR_STATUS.plan_required).toBe(402);
  });
});
