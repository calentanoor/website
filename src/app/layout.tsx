import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marktübersicht",
  description: "Persönliches Markt-Dashboard mit Aktienscreener",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-surface">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Marktübersicht
            </Link>
            <Link href="/" className="text-sm text-muted hover:text-foreground">
              Indizes
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
        <footer className="mx-auto w-full max-w-7xl px-4 py-6 text-xs text-muted">
          Daten: Yahoo Finance (inoffiziell, teils verzögert). Keine Anlageberatung.
        </footer>
      </body>
    </html>
  );
}
