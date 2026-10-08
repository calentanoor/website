"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers, type ISeriesApi, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { sma } from "@/lib/indicators";
import { changeColor, formatNumber, formatPercent } from "@/lib/format";
import type { Candle } from "@/lib/types";
import type { Level, Pattern } from "@/lib/patterns";

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

const DIRECTION_COLOR = { bullish: "#12955f", bearish: "#d23c3c", neutral: "#2b6ef2" };

// Pattern lines, target segments, labels and support/resistance levels
// (computed on daily candles, so only drawn in the 1-year view).
function drawPatterns(chart: IChartApi, candles: ISeriesApi<"Candlestick">, patterns: Pattern[], levels: Level[]) {
  const ts = (s: number) => s as UTCTimestamp;
  for (const p of patterns) {
    const color = DIRECTION_COLOR[p.direction];
    for (const l of p.lines) {
      if (l.to.time <= l.from.time) continue;
      chart
        .addSeries(LineSeries, { color, lineWidth: l.kind === "pattern" ? 2 : 1, lineStyle: l.kind === "trigger" ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        .setData([{ time: ts(l.from.time), value: l.from.price }, { time: ts(l.to.time), value: l.to.price }]);
    }
    if (p.target) {
      chart
        .addSeries(LineSeries, { color, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: "Ziel" })
        .setData([{ time: ts(p.endTime), value: p.target }, { time: ts(p.endTime + 20 * 86400), value: p.target }]);
    }
  }
  createSeriesMarkers(
    candles,
    patterns
      .map((p) => ({
        time: ts(p.endTime),
        position: p.direction === "bearish" ? ("aboveBar" as const) : ("belowBar" as const),
        shape: p.direction === "bearish" ? ("arrowDown" as const) : p.direction === "bullish" ? ("arrowUp" as const) : ("circle" as const),
        color: DIRECTION_COLOR[p.direction],
        text: p.label,
      }))
      .sort((a, b) => a.time - b.time),
  );
  for (const l of levels) {
    candles.createPriceLine({ price: l.price, color: l.kind === "support" ? "#12955f99" : "#d23c3c99", lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: false, title: `${l.kind === "support" ? "U" : "W"} ×${l.touches}` });
  }
}

export function PriceChart({ symbol, initial, patterns = [], levels = [] }: { symbol: string; initial: Candle[]; patterns?: Pattern[]; levels?: Level[] }) {
  const [showPatterns, setShowPatterns] = useState(true);
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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: v("--up"),
      downColor: v("--down"),
      borderVisible: false,
      wickUpColor: v("--up"),
      wickDownColor: v("--down"),
    });
    candleSeries.setData(candles.map((c) => ({ time: time(c), open: c.open, high: c.high, low: c.low, close: c.close })));

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

    if (range === "1y" && showPatterns) {
      drawPatterns(chart, candleSeries, patterns.slice(0, 3), levels.slice(0, 4));
    }

    const from = visibleFrom(range, candles);
    // Extra space on the right for pattern labels and target segments
    const right = range === "1y" && showPatterns && patterns.length ? 18 : 2;
    if (from > 0) chart.timeScale().setVisibleLogicalRange({ from, to: candles.length + right });
    else chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, range, intraday, showPatterns, patterns, levels]);

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
          {range === "1y" && (patterns.length > 0 || levels.length > 0) && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={showPatterns} onChange={(e) => setShowPatterns(e.target.checked)} className="accent-[var(--accent)]" />
              Formationen
            </label>
          )}
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
