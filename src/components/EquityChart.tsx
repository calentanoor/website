"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, LineStyle, createChart, type UTCTimestamp } from "lightweight-charts";
import { formatNumber } from "@/lib/format";

export function EquityChart({ points, base }: { points: { time: number; value: number }[]; base: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || points.length < 2) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: v("--muted") },
      grid: { vertLines: { color: v("--border") }, horzLines: { color: v("--border") } },
      rightPriceScale: { borderColor: v("--border") },
      timeScale: { borderColor: v("--border") },
      localization: { locale: "de-DE", priceFormatter: (p: number) => formatNumber(p, 0) },
    });
    const up = points[points.length - 1].value >= base;
    const color = up ? v("--up") : v("--down");
    const series = chart.addSeries(AreaSeries, { lineColor: color, topColor: `${color}44`, bottomColor: `${color}05`, lineWidth: 2, priceLineVisible: false });
    series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    series.createPriceLine({ price: base, color: v("--muted"), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "Start" });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points, base]);
  if (points.length < 2) return <p className="py-10 text-center text-sm text-muted">Noch keine abgeschlossenen oder laufenden Trades.</p>;
  return <div ref={ref} className="h-[300px] w-full" />;
}
