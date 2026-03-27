"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  BaselineSeries,
  ColorType,
  PriceScaleMode,
  LineStyle,
  type IChartApi,
} from "lightweight-charts";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";

type Range = "1d" | "5d" | "10d" | "1mo";
type Interval = "1m" | "2m" | "5m" | "15m" | "30m";

interface Bar {
  // string "YYYY-MM-DD" for daily, number (Unix seconds ET-adjusted) for intraday
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface StockChartProps {
  ticker: string;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
}

const RANGES: Range[] = ["1d", "5d", "10d", "1mo"];
const RANGE_LABEL: Record<Range, string> = { "1d": "1D", "5d": "5D", "10d": "10D", "1mo": "1M" };
const INTERVALS: Interval[] = ["1m", "2m", "5m", "15m", "30m"];

export default function StockChart({
  ticker,
  entryPrice,
  stopPrice,
  targetPrice,
}: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [range, setRange] = useState<Range>("10d");
  const [interval, setInterval] = useState<Interval>("5m");
  const [bars, setBars] = useState<Bar[]>([]);
  const [isIntraday, setIsIntraday] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ ticker, range });
      if (range === "1d") params.set("interval", interval);
      const res = await fetch(`/api/chart-data?${params}`);
      const d = await res.json();
      setBars(d.bars ?? []);
      setIsIntraday(d.isIntraday ?? false);
    } finally {
      setLoading(false);
    }
  }, [ticker, range, interval]);

  useEffect(() => {
    load();
  }, [load]);

  // Rebuild chart when bars or price levels change
  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#030712" },
        textColor: "#6b7280",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#111827" },
        horzLines: { color: "#111827" },
      },
      leftPriceScale: {
        visible: true,
        borderColor: "#1f2937",
        textColor: "#9ca3af",
      },
      rightPriceScale: {
        mode: PriceScaleMode.Percentage,
        borderColor: "#1f2937",
      },
      timeScale: {
        borderColor: "#1f2937",
        timeVisible: isIntraday,
        secondsVisible: false,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: { color: "#4b5563", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "#4b5563", width: 1, style: LineStyle.Dashed },
      },
      handleScale: { pinch: true, mouseWheel: true },
      handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 240,
    });

    chartRef.current = chart;

    // ── Reward zone (entry → target, green shading) ──
    if (entryPrice && targetPrice && targetPrice > entryPrice) {
      const rewardS = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: entryPrice },
        topFillColor1: "rgba(34,197,94,0.15)",
        topFillColor2: "rgba(34,197,94,0.04)",
        topLineColor: "transparent",
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
        bottomLineColor: "transparent",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rewardS.setData(bars.map((b) => ({ time: b.time as any, value: targetPrice })));
    }

    // ── Risk zone (stop → entry, red shading) ──
    if (entryPrice && stopPrice && stopPrice < entryPrice) {
      const riskS = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: entryPrice },
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        topLineColor: "transparent",
        bottomFillColor1: "rgba(239,68,68,0.15)",
        bottomFillColor2: "rgba(239,68,68,0.04)",
        bottomLineColor: "transparent",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      riskS.setData(bars.map((b) => ({ time: b.time as any, value: stopPrice })));
    }

    // ── Candlesticks (on top of shading) ──
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candles.setData(bars as any);

    // ── Price lines ──
    if (entryPrice) {
      candles.createPriceLine({
        price: entryPrice,
        color: "#3b82f6",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "Entry",
      });
    }
    if (targetPrice) {
      candles.createPriceLine({
        price: targetPrice,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Target",
      });
    }
    if (stopPrice) {
      candles.createPriceLine({
        price: stopPrice,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Stop",
      });
    }

    chart.timeScale().fitContent();

    // ── OHLC tooltip on crosshair move ──
    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        tooltip.style.display = "none";
        return;
      }
      const data = param.seriesData.get(candles) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!data) { tooltip.style.display = "none"; return; }

      const isUp = data.close >= data.open;
      tooltip.innerHTML = `
        <div class="flex gap-2 items-center text-xs font-mono">
          <span class="${isUp ? "text-green-400" : "text-red-400"} font-semibold">
            ${isUp ? "▲" : "▼"} C ${data.close.toFixed(2)}
          </span>
          <span class="text-gray-400">O ${data.open.toFixed(2)}</span>
          <span class="text-green-300">H ${data.high.toFixed(2)}</span>
          <span class="text-red-300">L ${data.low.toFixed(2)}</span>
        </div>`;
      tooltip.style.display = "block";
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, entryPrice, stopPrice, targetPrice, isIntraday]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (chartRef.current && el) {
        chartRef.current.applyOptions({
          width: el.clientWidth,
          height: el.clientHeight || 240,
        });
        chartRef.current.timeScale().fitContent();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rr =
    entryPrice && targetPrice && stopPrice && entryPrice - stopPrice > 0
      ? ((targetPrice - entryPrice) / (entryPrice - stopPrice)).toFixed(1)
      : null;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 bg-gray-950 flex flex-col p-3"
          : "mt-3 border-t border-gray-800 pt-3"
      }
    >
      {/* Row 1: Range + fullscreen */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                range === r
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw size={10} className="animate-spin text-gray-500" />}
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="text-gray-500 hover:text-white transition-colors p-0.5"
            title={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Row 2: Interval selector — only visible in 1D mode */}
      {range === "1d" && (
        <div className="flex gap-1 mb-1.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                interval === iv
                  ? "bg-blue-900/60 text-blue-300 border border-blue-800"
                  : "text-gray-500 hover:text-gray-300 border border-transparent"
              }`}
            >
              {iv}
            </button>
          ))}
          <span className="ml-1 text-xs text-gray-600 self-center">ET</span>
        </div>
      )}

      {/* Chart + OHLC tooltip */}
      <div className="relative">
        <div
          ref={tooltipRef}
          style={{ display: "none" }}
          className="absolute top-1 left-1/2 -translate-x-1/2 z-10 bg-gray-900/90 border border-gray-700 rounded px-2 py-1 pointer-events-none"
        />
        <div
          ref={containerRef}
          className="w-full rounded overflow-hidden"
          style={{ height: fullscreen ? "calc(100dvh - 100px)" : "240px" }}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
        {entryPrice && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-blue-500" />
            Entry ${entryPrice.toFixed(2)}
          </span>
        )}
        {targetPrice && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t border-green-500 border-dashed" />
            Target ${targetPrice.toFixed(2)}
          </span>
        )}
        {stopPrice && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t border-red-500 border-dashed" />
            Stop ${stopPrice.toFixed(2)}
          </span>
        )}
        {rr && (
          <span className="ml-auto text-gray-600 font-mono">R:R {rr}:1</span>
        )}
      </div>
    </div>
  );
}
