import Link from "next/link";
import type { ReactNode } from "react";

export type CtaLinkProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
};

const variants = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-border bg-surface-raised text-fg hover:bg-glass",
} as const;

export function CtaLink({ href, children, variant = "primary", className = "" }: CtaLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
