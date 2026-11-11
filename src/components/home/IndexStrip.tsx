import Link from "next/link";
import { connection } from "next/server";
import { INDICES } from "@/lib/indices";
import { getIndexQuote } from "@/lib/market-data";
import { fmtPct } from "@/lib/os/ladder";

// Compact index tiles for the home page.
export async function IndexStrip() {
  await connection();
  const quotes = await Promise.all(INDICES.map((i) => getIndexQuote(i.symbol).catch(() => undefined)));
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted">Indizes</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {INDICES.map((index, k) => {
          const q = quotes[k];
          const body = (
            <div className="flex items-baseline justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span className="truncate">{index.name}</span>
              <span className="text-right tabular-nums">
                <span className="block text-xs">{q ? q.price.toLocaleString("de-DE", { maximumFractionDigits: index.symbol === "^VIX" ? 2 : 0 }) : "–"}</span>
                <span className={`block text-xs ${!q ? "text-muted" : q.changePercent >= 0 ? "text-up" : "text-down"}`}>{q ? fmtPct(q.changePercent) : ""}</span>
              </span>
            </div>
          );
          return index.constituents ? (
            <Link key={index.id} href={`/index/${index.id}`} className="hover:opacity-80">{body}</Link>
          ) : (
            <div key={index.id}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}
