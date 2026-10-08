"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Links = { href: string; label: string }[];

// Without highlightActive it renders the static fallback (no pathname access).
export function NavLinks({ links, highlightActive }: { links: Links; highlightActive?: boolean }) {
  return highlightActive ? <ActiveNavLinks links={links} /> : <NavList links={links} pathname={null} />;
}

function ActiveNavLinks({ links }: { links: Links }) {
  return <NavList links={links} pathname={usePathname()} />;
}

function NavList({ links, pathname }: { links: Links; pathname: string | null }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {links.map((l) => {
        const active = pathname != null && (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-border/50 hover:text-foreground"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
