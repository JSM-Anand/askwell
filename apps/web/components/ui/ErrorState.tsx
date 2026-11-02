import type { ReactNode } from "react";

export type ErrorStateProps = {
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-start gap-2 rounded-md border border-danger bg-danger-soft p-4 ${className}`}
    >
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <p className="text-sm text-fg">{message}</p>
      {action}
    </div>
  );
}
