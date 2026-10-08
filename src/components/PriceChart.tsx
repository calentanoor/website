"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, type UTCTimestamp } from "lightweight-charts";
import { sma } from "@/lib/indicators";
import { changeColor, formatNumber, formatPercent } from "@/lib/format";
import type { Candle } from "@/lib/types";

type Range = "1d" | "1mo" | "1y" | "5y";

const RANGES: { key: Range; label: string; caption: string }[] = [
  { key: "1d", label: "Intraday", caption: "letzter Handelstag, 5-Minuten-Kerzen" },
  { key: "1mo", label: "30 Tage", caption: "Stundenkerzen" },
  { key: "1y", label: "1 Jahr", caption: "Tageskerzen" },
  { key: "5y", label: "5 Jahre", caption: "Wochenkerzen" },
];

// Moving averages per range: daily SMA 50/200, weekly 10/40 (≈ 50/200 days).
const OVERLAYS: Partial<Record<Range, { label: string; period: number; color: string }[]>> = {
  "1y": [
    { label: "SMA 50", period: 50, color: "#f2a33a" },
    { label: "SMA 200", period: 200, color: "#8b6cf6" },
  ],
  "5y": [
    { label: "SMA 10W", period: 10, color: "#f2a33a" },
    { label: "SMA 40W", period: 40, color: "#8b6cf6" },
  ],
};

const YEAR = 365 * 86400;

// Bars that belong to the visible window (1y data carries extra history for the SMA 200).
function visibleFrom(range: Range, candles: Candle[]) {
  if (range !== "1y" || !candles.length) return 0;
  const start = candles[candles.length - 1].time - YEAR;
  return Math.max(0, candles.findIndex((c) => c.time >= start));
}

export function PriceChart({ symbol, initial }: { symbol: string; initial: Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("1y");
  const [data, setData] = useState<Partial<Record<Range, Candle[]>>>({ "1y": initial });
  const [error, setError] = useState<string | null>(null);
  const candles = data[range];
  const intraday = range === "1d" || range === "1mo";

  useEffect(() => {
    if (data[range]) return;
    let cancelled = false;
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (!cancelled) setData((d) => ({ ...d, [range]: body.candles }));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [range, symbol, data]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !candles?.length) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: v("--muted") },
      grid: { vertLines: { color: v("--border") }, horzLines: { color: v("--border") } },
      rightPriceScale: { borderColor: v("--border") },
      timeScale: { borderColor: v("--border"), timeVisible: intraday, secondsVisible: false },
      localization: { locale: "de-DE", priceFormatter: (p: number) => formatNumber(p) },
    });

    // Lightweight Charts renders timestamps as UTC; shift intraday bars to local time.
    const offset = intraday ? -new Date().getTimezoneOffset() * 60 : 0;
    const time = (c: Candle) => (c.time + offset) as UTCTimestamp;

    chart
      .addSeries(CandlestickSeries, {
        upColor: v("--up"),
        downColor: v("--down"),
        borderVisible: false,
        wickUpColor: v("--up"),
        wickDownColor: v("--down"),
      })
      .setData(candles.map((c) => ({ time: time(c), open: c.open, high: c.high, low: c.low, close: c.close })));

    const closes = candles.map((c) => c.close);
    for (const o of OVERLAYS[range] ?? []) {
      const values = sma(closes, o.period);
      chart
        .addSeries(LineSeries, { color: o.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        .setData(candles.flatMap((c, i) => (Number.isFinite(values[i]) ? [{ time: time(c), value: values[i] }] : [])));
    }

    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(candles.map((c) => ({ time: time(c), value: c.volume, color: c.close >= c.open ? `${v("--up")}55` : `${v("--down")}55` })));

    const from = visibleFrom(range, candles);
    if (from > 0) chart.timeScale().setVisibleLogicalRange({ from, to: candles.length + 2 });
    else chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, range, intraday]);

  const from = candles ? visibleFrom(range, candles) : 0;
  const perf = candles?.length ? candles[candles.length - 1].close / (range === "1d" ? candles[0].open : candles[from].close) - 1 : undefined;
  const active = RANGES.find((r) => r.key === range)!;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => {
                setError(null);
                setRange(r.key);
              }}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                r.key === range ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          {perf != null && <span className={`text-sm font-medium ${changeColor(perf)}`}>{formatPercent(perf * 100)}</span>}
          <span>{active.caption}</span>
          {OVERLAYS[range]?.map((o) => (
            <span key={o.label} style={{ color: o.color }}>
              — {o.label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative h-[420px] w-full">
        <div ref={ref} className="absolute inset-0" />
        {!candles && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            {error ? <span className="text-down">Chart nicht verfügbar: {error}</span> : "Lade Kursdaten …"}
          </div>
        )}
      </div>
    </div>
  );
}
