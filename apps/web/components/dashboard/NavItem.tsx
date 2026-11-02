import Link from "next/link";

export type NavItemProps = {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
};

export function NavItem({ href, label, active, onNavigate }: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
        active ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-glass hover:text-fg"
      }`}
    >
      {label}
    </Link>
  );
}
