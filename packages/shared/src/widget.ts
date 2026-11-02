import { z } from "zod";

export const WIDGET_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
] as const;
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];

export const WIDGET_ANIMATIONS = ["fade", "slide", "scale"] as const;
export type WidgetAnimation = (typeof WIDGET_ANIMATIONS)[number];

export const MAX_WIDGET_LABEL_LENGTH = 40;
export const MAX_WIDGET_HEADER_LENGTH = 60;

export type WidgetConfig = {
  buttonColor: string;
  position: WidgetPosition;
  label: string;
  animation: WidgetAnimation;
  headerText: string;
  showBadge: boolean;
};

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  buttonColor: "#000000",
  position: "bottom-right",
  label: "Ask us",
  animation: "fade",
  headerText: "Chat with us",
  showBadge: true,
};

export const widgetConfigSchema = z.object({
  buttonColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #000000"),
  position: z.enum(WIDGET_POSITIONS),
  label: z.string().trim().min(1).max(MAX_WIDGET_LABEL_LENGTH),
  animation: z.enum(WIDGET_ANIMATIONS),
  headerText: z.string().trim().min(1).max(MAX_WIDGET_HEADER_LENGTH),
  showBadge: z.boolean(),
}) satisfies z.ZodType<WidgetConfig>;
