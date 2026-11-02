import type { ReactNode } from "react";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, text, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-3 px-4 py-12 text-center ${className}`}>
      {icon ? (
        <div aria-hidden="true" className="text-fg-muted">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {text ? <p className="max-w-sm text-sm text-fg-muted">{text}</p> : null}
      {action}
    </div>
  );
}
