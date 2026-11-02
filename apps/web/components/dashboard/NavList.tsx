import { NavItem } from "./NavItem";
import { NAV_SECTIONS, isActiveSection } from "./nav";

export type NavListProps = {
  pathname: string;
  onNavigate?: () => void;
};

export function NavList({ pathname, onNavigate }: NavListProps) {
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-1">
      {NAV_SECTIONS.map((section) => (
        <NavItem
          key={section.href}
          href={section.href}
          label={section.label}
          active={isActiveSection(section.href, pathname)}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}
