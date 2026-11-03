import { APP_NAME } from "@askwell/shared";
import type { WidgetConfig } from "@askwell/shared";
import { textOn } from "./customize-state";

export type WidgetPreviewProps = {
  config: WidgetConfig;
  /** Changes to replay the opening animation (the Replay button). A change of animation or corner replays it too. */
  replayKey?: number;
};

// The opening animations, matching the real widget (apps/widget/src/loader.ts): fade is opacity only, slide moves
// 16px toward the corner it opens from, scale grows from 90%. Switched off for people who prefer reduced motion.
const KEYFRAMES = `
@keyframes aw-preview-fade{from{opacity:0}to{opacity:1}}
@keyframes aw-preview-slide-top{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}
@keyframes aw-preview-slide-bottom{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes aw-preview-scale{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){[data-preview="panel"]{animation:none!important}}
`;

/**
 * A mock of the widget on a customer's site: the button in its corner and the opened panel. It is drawn here in
 * React, not by loading widget.js, and it follows the form as it is typed. The text is always plain text.
 */
export function WidgetPreview({ config, replayKey = 0 }: WidgetPreviewProps) {
  const [vertical, horizontal] = config.position.split("-") as ["top" | "bottom", "left" | "right"];
  const slide = vertical === "top" ? "aw-preview-slide-top" : "aw-preview-slide-bottom";
  const keyframes = config.animation === "slide" ? slide : config.animation === "scale" ? "aw-preview-scale" : "aw-preview-fade";

  return (
    <div
      role="group"
      aria-label="Widget preview"
      className="relative h-[26rem] w-full overflow-hidden rounded-lg border border-border bg-zinc-100 text-zinc-900"
    >
      <style>{KEYFRAMES}</style>

      {/* The "website" behind the widget. */}
      <div aria-hidden="true" className="flex flex-col gap-3 p-4">
        <div className="h-3 w-1/3 rounded bg-zinc-300" />
        <div className="h-2 w-full rounded bg-zinc-200" />
        <div className="h-2 w-5/6 rounded bg-zinc-200" />
        <div className="h-2 w-2/3 rounded bg-zinc-200" />
        <div className="mt-3 h-16 w-full rounded bg-zinc-200" />
      </div>

      <div
        key={`${config.animation}-${config.position}-${replayKey}`}
        data-preview="panel"
        data-animation={config.animation}
        data-position={config.position}
        className="absolute flex flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        style={{
          [vertical]: 64,
          [horizontal]: 16,
          width: "min(300px, calc(100% - 32px))",
          height: "calc(100% - 96px)",
          transformOrigin: `${vertical} ${horizontal}`,
          animation: `${keyframes} 0.35s ease-out both`,
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5">
          <p data-preview="header" className="min-w-0 truncate text-sm font-semibold">
            {config.headerText}
          </p>
          <span aria-hidden="true" className="text-zinc-500">
            ✕
          </span>
        </div>
        <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
          <p className="max-w-[85%] self-start rounded-md bg-zinc-100 px-3 py-2 text-xs">Hi! Ask me anything.</p>
          <p className="max-w-[85%] self-end rounded-md bg-zinc-900 px-3 py-2 text-xs text-white">What are your opening hours?</p>
        </div>
        <div aria-hidden="true" className="px-3 pb-2">
          <div className="h-8 rounded-md border border-zinc-200 bg-white" />
        </div>
        {config.showBadge ? (
          <p data-preview="badge" className="pb-2 text-center text-xs text-zinc-500">
            Powered by {APP_NAME}
          </p>
        ) : null}
      </div>

      <div
        data-preview="button"
        data-position={config.position}
        className="absolute max-w-[calc(100%-2rem)] truncate rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg"
        style={{ [vertical]: 16, [horizontal]: 16, background: config.buttonColor, color: textOn(config.buttonColor) }}
      >
        {config.label}
      </div>
    </div>
  );
}
