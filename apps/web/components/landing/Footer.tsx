import Link from "next/link";
import { APP_NAME } from "@askwell/shared";

export function Footer() {
  return (
    <footer className="border-t border-border px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-fg-muted sm:flex-row">
        <span>{APP_NAME}</span>
        <nav aria-label="Footer" className="flex gap-6">
          <Link href="/sign-in" className="hover:text-fg">
            Sign in
          </Link>
          <Link href="/sign-up" className="hover:text-fg">
            Sign up
          </Link>
        </nav>
      </div>
    </footer>
  );
}
