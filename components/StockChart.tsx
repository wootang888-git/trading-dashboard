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
  const [showFib, setShowFib] = useState(false);
  const [fibHigh, setFibHigh] = useState("");
  const [fibLow, setFibLow] = useState("");

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

    // ── Fibonacci retracement (user-anchored, labels on LEFT axis) ──
    const fh = parseFloat(fibHigh);
    const fl = parseFloat(fibLow);
    if (fh > 0 && fl > 0 && fh > fl) {
      // Attach fib price lines to a hidden series on the LEFT price scale so
      // labels appear on the left (absolute $) axis, keeping the right (%) axis clear.
      const fibAnchor = chart.addSeries(LineSeries, {
        priceScaleId: "left",
        color: "transparent",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fibAnchor.setData(bars.map((b) => ({ time: b.time as any, value: fh })));

      const fibRange = fh - fl;
      [
        { pct: 0.236, label: "23.6%" },
        { pct: 0.382, label: "38.2%" },
        { pct: 0.500, label: "50.0%" },
        { pct: 0.618, label: "61.8%" },
        { pct: 0.786, label: "78.6%" },
      ].forEach(({ pct, label }) => {
        const price = fh - pct * fibRange;
        fibAnchor.createPriceLine({
          price,
          color: `rgba(200,168,75,${pct < 0.4 || pct > 0.7 ? 0.5 : 0.85})`,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `${label} $${price.toFixed(2)}`,
        });
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
  }, [bars, entryPrice, stopPrice, targetPrice, isIntraday, fibHigh, fibLow]);

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
          <button
            onClick={() => {
              setShowFib((v) => {
                if (v) { setFibHigh(""); setFibLow(""); }
                return !v;
              });
            }}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
              showFib && fibHigh && fibLow
                ? "bg-yellow-900/60 text-yellow-300 border border-yellow-800"
                : showFib
                ? "bg-gray-700 text-gray-300"
                : "text-gray-500 hover:text-gray-300"
            }`}
            title="Fibonacci retracement tool"
          >
            Fib
          </button>
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

      {/* Fib anchor inputs */}
      {showFib && (
        <div className="flex items-center gap-2 mb-1.5 text-xs">
          <span className="text-yellow-600 font-medium">Fib</span>
          <label className="flex items-center gap-1 text-gray-500">
            High $
            <input
              type="number"
              value={fibHigh}
              onChange={(e) => setFibHigh(e.target.value)}
              placeholder="0.00"
              className="w-20 bg-gray-800 text-white border border-gray-700 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-yellow-700"
            />
          </label>
          <label className="flex items-center gap-1 text-gray-500">
            Low $
            <input
              type="number"
              value={fibLow}
              onChange={(e) => setFibLow(e.target.value)}
              placeholder="0.00"
              className="w-20 bg-gray-800 text-white border border-gray-700 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-yellow-700"
            />
          </label>
          {(fibHigh || fibLow) && (
            <button
              onClick={() => { setFibHigh(""); setFibLow(""); }}
              className="text-gray-600 hover:text-gray-400 transition-colors"
            >
              Clear
            </button>
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
        {parseFloat(fibHigh) > parseFloat(fibLow) && parseFloat(fibLow) > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t border-dotted border-[#c8a84b]" />
            Fib {fibHigh}–{fibLow}
          </span>
        )}
        {rr && (
          <span className="ml-auto text-gray-600 font-mono">R:R {rr}:1</span>
        )}
      </div>
    </div>
  );
}
