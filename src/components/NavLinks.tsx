"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string } | { label: string; children: { href: string; label: string }[] };

const isGroup = (i: NavItem): i is Extract<NavItem, { children: unknown }> => "children" in i;
const matches = (href: string, pathname: string | null) => pathname != null && (href === "/" ? pathname === "/" : pathname.startsWith(href));

// Without highlightActive it renders the static fallback (no pathname access).
export function NavLinks({ items, highlightActive }: { items: NavItem[]; highlightActive?: boolean }) {
  return highlightActive ? <ActiveNav items={items} /> : <Nav items={items} pathname={null} />;
}

function ActiveNav({ items }: { items: NavItem[] }) {
  return <Nav items={items} pathname={usePathname()} />;
}

const linkClass = (active: boolean) =>
  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-border/50 hover:text-foreground"}`;

function Nav({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpenGroup(null);
    setMobileOpen(false);
  };

  // close dropdowns on outside clicks
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  return (
    <div ref={ref} className="flex flex-1 items-center justify-end md:justify-start">
      {/* desktop */}
      <div className="hidden items-center gap-1 md:flex">
        {items.map((item) =>
          isGroup(item) ? (
            <div key={item.label} className="relative">
              <button onClick={() => setOpenGroup(openGroup === item.label ? null : item.label)} className={linkClass(item.children.some((c) => matches(c.href, pathname)))} aria-expanded={openGroup === item.label}>
                {item.label} <span className="text-[10px]">▾</span>
              </button>
              {openGroup === item.label && (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-44 rounded-lg border border-border bg-surface p-1 shadow-lg">
                  {item.children.map((c) => (
                    <Link key={c.href} href={c.href} onClick={close} className={`block ${linkClass(matches(c.href, pathname))}`}>
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link key={item.href} href={item.href} onClick={close} className={linkClass(matches(item.href, pathname))}>
              {item.label}
            </Link>
          ),
        )}
      </div>

      {/* mobile: menu button with all entries */}
      <button onClick={() => setMobileOpen((o) => !o)} className="rounded-md p-2 text-muted hover:bg-border/50 md:hidden" aria-label="Menü" aria-expanded={mobileOpen}>
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {mobileOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-30 border-b border-border bg-surface px-4 pb-4 pt-2 shadow-lg md:hidden">
          {items.map((item) =>
            isGroup(item) ? (
              <div key={item.label} className="mt-2">
                <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{item.label}</div>
                <div className="grid grid-cols-2 gap-1">
                  {item.children.map((c) => (
                    <Link key={c.href} href={c.href} onClick={close} className={`block py-2 ${linkClass(matches(c.href, pathname))}`}>
                      {c.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link key={item.href} href={item.href} onClick={close} className={`block py-2.5 text-base ${linkClass(matches(item.href, pathname))}`}>
                {item.label}
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}
