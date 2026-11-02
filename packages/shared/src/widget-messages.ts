// postMessage contract between the loader (widget.js) and the panel (/embed iframe).
// No imports: the loader bundles this file and must stay small.

export type WidgetMessage =
  | { type: "close" }
  | { type: "resize"; height: number }
  | { type: "unread"; count: number };

/** True only for a well-formed message. Anything else is ignored by both sides. */
export function isWidgetMessage(value: unknown): value is WidgetMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  switch (m.type) {
    case "close":
      return true;
    case "resize":
      return typeof m.height === "number" && Number.isFinite(m.height) && m.height > 0;
    case "unread":
      return typeof m.count === "number" && Number.isInteger(m.count) && m.count >= 0;
    default:
      return false;
  }
}
