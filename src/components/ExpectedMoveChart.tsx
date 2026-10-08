"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, LineSeries, LineStyle, createChart, type UTCTimestamp } from "lightweight-charts";
import { formatNumber } from "@/lib/format";
import type { Candle } from "@/lib/types";

export type ConePoint = { time: number; mid: number; up1: number; down1: number; up2: number; down2: number }; // time in unix seconds
export type Level = { price: number; label: string; color: string };

export function ExpectedMoveChart({ candles, cone, levels }: { candles: Candle[]; cone: ConePoint[]; levels: Level[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !candles.length) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: v("--muted") },
      grid: { vertLines: { color: v("--border") }, horzLines: { color: v("--border") } },
      rightPriceScale: { borderColor: v("--border") },
      timeScale: { borderColor: v("--border") },
      localization: { locale: "de-DE", priceFormatter: (p: number) => formatNumber(p) },
    });
    const t = (s: number) => s as UTCTimestamp;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: v("--up"), downColor: v("--down"), borderVisible: false, wickUpColor: v("--up"), wickDownColor: v("--down"),
    });
    candleSeries.setData(candles.map((c) => ({ time: t(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));

    const line = (key: keyof Omit<ConePoint, "time">, color: string, style: LineStyle, width: 1 | 2 = 1) =>
      chart
        .addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false })
        .setData(cone.map((p) => ({ time: t(p.time), value: p[key] })));
    const accent = v("--accent");
    line("up2", `${accent}66`, LineStyle.Dotted);
    line("down2", `${accent}66`, LineStyle.Dotted);
    line("up1", accent, LineStyle.Dashed, 2);
    line("down1", accent, LineStyle.Dashed, 2);

    for (const l of levels) {
      candleSeries.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: l.label });
    }

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, cone, levels]);

  return <div ref={ref} className="h-[440px] w-full" />;
}
