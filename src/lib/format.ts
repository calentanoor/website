const nf = (digits: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatNumber(v: number | undefined, digits = 2): string {
  return v == null || !Number.isFinite(v) ? "–" : nf(digits).format(v);
}

export function formatPercent(v: number | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v > 0 ? "+" : ""}${nf(digits).format(v)} %`;
}

export function formatBig(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  if (Math.abs(v) >= 1e12) return `${nf(2).format(v / 1e12)} Bio.`;
  if (Math.abs(v) >= 1e9) return `${nf(1).format(v / 1e9)} Mrd.`;
  if (Math.abs(v) >= 1e6) return `${nf(1).format(v / 1e6)} Mio.`;
  return nf(0).format(v);
}

export function formatDate(ms: number | undefined): string {
  return ms == null ? "–" : new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export const changeColor = (v: number | undefined) =>
  v == null || v === 0 ? "text-muted" : v > 0 ? "text-up" : "text-down";
