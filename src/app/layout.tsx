import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { NavLinks, type NavItem } from "@/components/NavLinks";
import { INDICES } from "@/lib/indices";

export const metadata: Metadata = {
  title: "Marktübersicht",
  description: "Persönliches Markt-Dashboard mit Aktienscreener",
  robots: { index: false, follow: false },
};

const navItems: NavItem[] = [
  { href: "/", label: "Übersicht" },
  { href: "/strategie", label: "Strategie" },
  { href: "/screener", label: "Screener" },
  { label: "Indizes", children: INDICES.filter((i) => i.constituents).map((i) => ({ href: `/index/${i.id}`, label: i.name })) },
  {
    label: "Tools",
    children: [
      { href: "/formationen", label: "Formationen" },
      { href: "/optionen", label: "Optionen" },
    ],
  },
  { href: "/watchlist", label: "★ Watchlist" },
  { href: "/kalender", label: "Kalender" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-surface/85 backdrop-blur">
          <nav className="relative mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-2 sm:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
              <svg viewBox="0 0 24 24" className="size-6 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 17l5-5 4 4 8-9" />
                <path d="M15 7h5v5" />
              </svg>
              Marktübersicht
            </Link>
            <Suspense fallback={<NavLinks items={navItems} />}>
              <NavLinks items={navItems} highlightActive />
            </Suspense>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-8">{children}</main>
        <footer className="mx-auto w-full max-w-[1400px] border-t border-border px-4 py-5 text-xs text-muted sm:px-6">
          Daten: Yahoo Finance (inoffiziell, teils verzögert). Keine Anlageberatung.
        </footer>
      </body>
    </html>
  );
}
