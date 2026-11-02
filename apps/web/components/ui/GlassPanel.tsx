import type { HTMLAttributes } from "react";

export type GlassPanelProps = HTMLAttributes<HTMLDivElement>;

export function GlassPanel({ className = "", ...props }: GlassPanelProps) {
  return (
    <div
      className={`rounded-lg border border-glass-border bg-glass p-6 text-fg shadow-glass backdrop-blur-(--blur-glass) ${className}`}
      {...props}
    />
  );
}
