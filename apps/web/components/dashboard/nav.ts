export type NavSection = {
  href: string;
  label: string;
};

export const NAV_SECTIONS: readonly NavSection[] = [
  { href: "/dashboard", label: "Projects" },
  { href: "/dashboard/knowledge", label: "Knowledge" },
  { href: "/dashboard/conversations", label: "Conversations" },
  { href: "/dashboard/customize", label: "Customize" },
  { href: "/dashboard/install", label: "Install" },
  { href: "/dashboard/billing", label: "Billing" },
];

/** Projects owns `/dashboard` exactly; other sections own their sub-paths. */
export function isActiveSection(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
