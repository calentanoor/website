"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/types";

type Overlay = { label: string; color: string; values: number[] };

export function PriceChart({ candles, overlays }: { candles: Candle[]; overlays: Overlay[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: v("--muted") },
      grid: { vertLines: { color: v("--border") }, horzLines: { color: v("--border") } },
      rightPriceScale: { borderColor: v("--border") },
      timeScale: { borderColor: v("--border") },
    });

    const time = (c: Candle) => c.time as UTCTimestamp;
    chart
      .addSeries(CandlestickSeries, {
        upColor: v("--up"),
        downColor: v("--down"),
        borderVisible: false,
        wickUpColor: v("--up"),
        wickDownColor: v("--down"),
      })
      .setData(candles.map((c) => ({ time: time(c), open: c.open, high: c.high, low: c.low, close: c.close })));

    for (const o of overlays) {
      chart
        .addSeries(LineSeries, { color: o.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: o.label })
        .setData(candles.flatMap((c, i) => (Number.isFinite(o.values[i]) ? [{ time: time(c), value: o.values[i] }] : [])));
    }

    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(
      candles.map((c) => ({ time: time(c), value: c.volume, color: c.close >= c.open ? `${v("--up")}55` : `${v("--down")}55` })),
    );

    chart.timeScale().setVisibleLogicalRange({ from: candles.length - 252, to: candles.length + 3 });
    return () => chart.remove();
  }, [candles, overlays]);

  return <div ref={ref} className="h-[420px] w-full" />;
}
