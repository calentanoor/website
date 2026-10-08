"use client";

import { useRouter } from "next/navigation";
import { SymbolSearch } from "@/components/SymbolSearch";

export function OptionsSearch() {
  const router = useRouter();
  return <SymbolSearch onSelect={(s) => router.push(`/optionen/${encodeURIComponent(s)}`)} placeholder="US-Aktie oder ETF suchen …" />;
}
