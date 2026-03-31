"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  BaselineSeries,
  LineSeries,
  ColorType,
  PriceScaleMode,
  LineStyle,
  type IChartApi,
} from "lightweight-charts";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Calculate EMA series from bar close prices */
function calcEMAFromBars(bars: Bar[], period: number): number[] {
  if (bars.length === 0) return [];
  const k = 2 / (period + 1);
  const seed = bars.slice(0, Math.min(period, bars.length))
    .reduce((s, b) => s + b.close, 0) / Math.min(period, bars.length);
  let ema = seed;
  return bars.map((b) => { ema = b.close * k + ema * (1 - k); return ema; });
}

/** Calculate Bollinger Bands (20-period SMA ± 2 std dev) from bar close prices */
function calcBBFromBars(bars: Bar[], period = 20): { upper: number[]; lower: number[] } {
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const slice = bars.slice(Math.max(0, i - period + 1), i + 1).map((b) => b.close);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    upper.push(mean + 2 * std);
    lower.push(mean - 2 * std);
  }
  return { upper, lower };
}


type Range = "1d" | "5d" | "10d" | "1mo";
type IntradayInterval = "1m" | "2m" | "5m" | "15m" | "30m" | "1h";
type MultiInterval = "daily" | "30m" | "1h" | "2h" | "4h";

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
const INTRADAY_INTERVALS: IntradayInterval[] = ["1m", "2m", "5m", "15m", "30m", "1h"];
const MULTI_INTERVALS: Record<Range, MultiInterval[]> = {
  "1d": [],
  "5d":  ["daily", "30m", "1h"],
  "10d": ["daily", "30m", "1h", "2h"],
  "1mo": ["daily", "1h", "2h", "4h"],
};
const MULTI_LABEL: Record<MultiInterval, string> = {
  daily: "D", "30m": "30m", "1h": "1h", "2h": "2h", "4h": "4h",
};

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
  const [interval, setInterval] = useState<IntradayInterval>("5m");
  const [multiInterval, setMultiInterval] = useState<MultiInterval>("daily");
  const [bars, setBars] = useState<Bar[]>([]);
  const [isIntraday, setIsIntraday] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showBB, setShowBB] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ ticker, range });
      if (range === "1d") {
        params.set("interval", interval);
      } else if (multiInterval !== "daily") {
        params.set("interval", multiInterval);
      }
      const res = await fetch(`/api/chart-data?${params}`);
      const d = await res.json();
      setBars(d.bars ?? []);
      setIsIntraday(d.isIntraday ?? false);
    } finally {
      setLoading(false);
    }
  }, [ticker, range, interval, multiInterval]);

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
        background: { type: ColorType.Solid, color: "#090f15" },
        textColor: "#bacbbd",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(60,74,64,0.15)" },
        horzLines: { color: "rgba(60,74,64,0.15)" },
      },
      leftPriceScale: {
        visible: true,
        borderColor: "rgba(60,74,64,0.3)",
        textColor: "#bacbbd",
      },
      rightPriceScale: {
        mode: PriceScaleMode.Percentage,
        borderColor: "rgba(60,74,64,0.3)",
      },
      timeScale: {
        borderColor: "rgba(60,74,64,0.3)",
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
    // bottomFillColor fills below the data line (target → entry), which is the reward band
    if (entryPrice && targetPrice && targetPrice > entryPrice) {
      const rewardS = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: entryPrice },
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        topLineColor: "transparent",
        bottomFillColor1: "rgba(34,197,94,0.22)",
        bottomFillColor2: "rgba(34,197,94,0.07)",
        bottomLineColor: "transparent",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rewardS.setData(bars.map((b) => ({ time: b.time as any, value: targetPrice })));
    }

    // ── Risk zone (stop → entry, red shading) ──
    // topFillColor fills above the data line (stop → entry), which is the risk band
    if (entryPrice && stopPrice && stopPrice < entryPrice) {
      const riskS = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: entryPrice },
        topFillColor1: "rgba(239,68,68,0.22)",
        topFillColor2: "rgba(239,68,68,0.07)",
        topLineColor: "transparent",
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
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

    // ── EMA lines (only for daily bars — intraday is too noisy) ──
    if (!isIntraday) {
      const ema8Values = calcEMAFromBars(bars, 8);
      const ema8Series = chart.addSeries(LineSeries, {
        color: "#00e7f6",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: "8 EMA",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ema8Series.setData(bars.map((b, i) => ({ time: b.time as any, value: ema8Values[i] })));

      const ema20Values = calcEMAFromBars(bars, 20);
      const ema20Series = chart.addSeries(LineSeries, {
        color: "rgba(200,168,75,0.6)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: "20 EMA",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ema20Series.setData(bars.map((b, i) => ({ time: b.time as any, value: ema20Values[i] })));
    }

    // ── Bollinger Bands (20-period SMA ± 2 std dev, daily only) ──
    if (!isIntraday && showBB && bars.length >= 20) {
      const { upper, lower } = calcBBFromBars(bars);
      const bbUpperSeries = chart.addSeries(LineSeries, {
        color: "rgba(139,92,246,0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: "BB+",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bbUpperSeries.setData(bars.map((b, i) => ({ time: b.time as any, value: upper[i] })));

      const bbLowerSeries = chart.addSeries(LineSeries, {
        color: "rgba(139,92,246,0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: "BB−",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bbLowerSeries.setData(bars.map((b, i) => ({ time: b.time as any, value: lower[i] })));
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
  }, [bars, entryPrice, stopPrice, targetPrice, isIntraday, showBB]);

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
              onClick={() => { setRange(r); setMultiInterval("daily"); }}
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
          {!isIntraday && (
            <button
              onClick={() => setShowBB((v) => !v)}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                showBB
                  ? "bg-purple-900/60 text-purple-300 border border-purple-800"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title="Toggle Bollinger Bands (20-period ±2σ)"
            >
              BB
            </button>
          )}
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="text-gray-500 hover:text-white transition-colors p-0.5"
            title={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Row 2: Interval selector */}
      {range === "1d" && (
        <div className="flex gap-1 mb-1.5">
          {INTRADAY_INTERVALS.map((iv) => (
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
      {range !== "1d" && (
        <div className="flex gap-1 mb-1.5">
          {MULTI_INTERVALS[range].map((iv) => (
            <button
              key={iv}
              onClick={() => setMultiInterval(iv)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                multiInterval === iv
                  ? "bg-blue-900/60 text-blue-300 border border-blue-800"
                  : "text-gray-500 hover:text-gray-300 border border-transparent"
              }`}
            >
              {MULTI_LABEL[iv]}
            </button>
          ))}
          {multiInterval !== "daily" && (
            <span className="ml-1 text-xs text-gray-600 self-center">ET</span>
          )}
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
        {!isIntraday && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-[#00e7f6]" />
              8 EMA
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-[#c8a84b] opacity-60" />
              20 EMA
            </span>
          </>
        )}
        {!isIntraday && showBB && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t border-dashed border-purple-400 opacity-50" />
            BB ±2σ
          </span>
        )}
        {rr && (
          <span className="ml-auto text-gray-600 font-mono">R:R {rr}:1</span>
        )}
      </div>
    </div>
  );
}
