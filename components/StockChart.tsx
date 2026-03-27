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

type Range = "5d" | "10d" | "1mo";

interface Bar {
  time: string;
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

const RANGES: Range[] = ["5d", "10d", "1mo"];
const RANGE_LABEL: Record<Range, string> = { "5d": "5D", "10d": "10D", "1mo": "1M" };

export default function StockChart({
  ticker,
  entryPrice,
  stopPrice,
  targetPrice,
}: StockChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [range, setRange] = useState<Range>("10d");
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chart-data?ticker=${ticker}&range=${range}`);
      const d = await res.json();
      setBars(d.bars ?? []);
    } finally {
      setLoading(false);
    }
  }, [ticker, range]);

  useEffect(() => {
    load();
  }, [load]);

  // Build chart whenever bars or price levels change
  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    // Remove previous chart
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
      rightPriceScale: {
        mode: PriceScaleMode.Percentage,
        borderColor: "#1f2937",
      },
      timeScale: {
        borderColor: "#1f2937",
        timeVisible: false,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: { color: "#4b5563", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "#4b5563", width: 1, style: LineStyle.Dashed },
      },
      handleScale: { pinch: true, mouseWheel: true },
      handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 220,
    });

    chartRef.current = chart;

    // ── Reward zone (entry → target) ──
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
      rewardS.setData(bars.map((b) => ({ time: b.time, value: targetPrice })));
    }

    // ── Risk zone (stop → entry) ──
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
      riskS.setData(bars.map((b) => ({ time: b.time, value: stopPrice })));
    }

    // ── Candlestick series (rendered on top of shading) ──
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candles.setData(bars);

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

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, entryPrice, stopPrice, targetPrice]);

  // Resize observer — keeps chart sized to container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (chartRef.current && el) {
        chartRef.current.applyOptions({
          width: el.clientWidth,
          height: el.clientHeight || 220,
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
      ref={wrapperRef}
      className={
        fullscreen
          ? "fixed inset-0 z-50 bg-gray-950 flex flex-col p-3 safe-area-inset"
          : "mt-3 border-t border-gray-800 pt-3"
      }
    >
      {/* Controls */}
      <div className="flex items-center justify-between mb-2">
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

      {/* Chart */}
      <div
        ref={containerRef}
        className="w-full rounded overflow-hidden"
        style={{ height: fullscreen ? "calc(100dvh - 80px)" : "220px" }}
      />

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
