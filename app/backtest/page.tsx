"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TradeResult, WatchlistSignalSnapshot } from "@/lib/backtest";

type IncludeMode = "both" | "trade" | "watch";

type SavedBacktestConfig = {
  name: string;
  startDate: string;
  endDate: string;
  fixedShares: number;
  atrPeriod: number;
  tpMultiplier: number;
  maxHoldDays: number;
  includeMode: IncludeMode;
  minScore: number;
  topN: number;
  trendFilter: boolean;
  requireBreakout: boolean;
  maxEntryGapPct: number;
  minHoldDays: number;
  sweepMode: boolean;
  scheduleSweep: boolean;
};

type BacktestSummary = {
  totalSignals: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgWinPct: number;
  avgLossPct: number;
  totalRisked: number;
  averageHoldDays: number;
  switchCountsPerTicker: Record<string, { tradeToWatch: number; watchToTrade: number; totalSwitches: number }>;
  switchDistribution: Array<{ switches: number; count: number }>;
};

type BacktestResult = {
  message: string;
  config: Record<string, unknown>;
  summary: BacktestSummary;
  signals: WatchlistSignalSnapshot[];
  trades: TradeResult[];
  sweepResults?: Array<{ config: Record<string, unknown>; result: { summary: BacktestSummary; trades: TradeResult[]; signals: WatchlistSignalSnapshot[] } }>;
};

const LOCAL_STORAGE_KEY = "swingai-backtest-configs";

function fmPercent(value: number) {
  return (value * 100).toFixed(1) + "%";
}

function getRecommendation(summary: BacktestSummary) {
  if (summary.totalTrades === 0) {
    return "No trades were generated in this setup period; consider a wider window or lower threshold.";
  }

  if (summary.winRate >= 0.8) {
    return "Excellent win rate: strong setup for a cautious swing trader. Keep position size manageable.";
  }

  if (summary.winRate >= 0.65) {
    return "Good win rate with moderate trade frequency; this is a solid balanced approach for most swing traders.";
  }

  if (summary.winRate >= 0.5) {
    return "Win rate is okay, but the risk is higher. Try tightening filters (higher minScore) or using trend filter.";
  }

  return "Win rate is low. Consider fewer trades and stricter signal criteria before live deployment.";
}

export default function BacktestPage() {
  const [startDate, setStartDate] = useState("2026-01-03");
  const [endDate, setEndDate] = useState("2026-02-15");
  const [fixedShares, setFixedShares] = useState(100);
  const [atrPeriod, setAtrPeriod] = useState(14);
  const [tpMultiplier, setTpMultiplier] = useState(1.5);
  const [maxHoldDays, setMaxHoldDays] = useState(30);
  const [includeMode, setIncludeMode] = useState<IncludeMode>("both");
  const [minScore, setMinScore] = useState(4);
  const [topN, setTopN] = useState(3);
  const [trendFilter, setTrendFilter] = useState(false);
  const [requireBreakout, setRequireBreakout] = useState(false);
  const [maxEntryGapPct, setMaxEntryGapPct] = useState(5);
  const [minHoldDays, setMinHoldDays] = useState(0);
  const [sweepMode, setSweepMode] = useState(false);
  const [scheduleSweep, setScheduleSweep] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<SavedBacktestConfig[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        setSavedConfigs(JSON.parse(saved) as SavedBacktestConfig[]);
      } catch {
        setSavedConfigs([]);
      }
    }
    const scheduleSaved = window.localStorage.getItem("swingai-backtest-schedule");
    if (scheduleSaved === "true") {
      setScheduleSweep(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedConfigs));
  }, [savedConfigs]);

  useEffect(() => {
    window.localStorage.setItem("swingai-backtest-schedule", scheduleSweep ? "true" : "false");
  }, [scheduleSweep]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("start", startDate);
    params.set("end", endDate);
    params.set("shares", String(fixedShares));
    params.set("atrPeriod", String(atrPeriod));
    params.set("tp", String(tpMultiplier));
    params.set("maxHoldDays", String(maxHoldDays));
    params.set("includeMode", includeMode);
    params.set("minScore", String(minScore));
    params.set("topN", String(topN));
    params.set("trendFilter", String(trendFilter));
    params.set("requireBreakout", String(requireBreakout));
    params.set("maxEntryGapPct", String(maxEntryGapPct));
    params.set("minHoldDays", String(minHoldDays));
    if (sweepMode) {
      params.set("sweep", "true");
    }
    if (scheduleSweep) {
      params.set("schedule", "true");
    }
    return params;
  }, [startDate, endDate, fixedShares, atrPeriod, tpMultiplier, maxHoldDays, includeMode, minScore, topN, trendFilter, requireBreakout, maxEntryGapPct, minHoldDays, sweepMode, scheduleSweep]);

  const runBacktest = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const resp = await fetch(`/api/backtest?${queryParams.toString()}`);
      if (!resp.ok) {
        throw new Error(`Server error ${resp.status}`);
      }
      const payload: BacktestResult = await resp.json();
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  }, [queryParams]);

  useEffect(() => {
    if (!scheduleSweep) return;
    const intervalId = window.setInterval(() => {
      if (!working) {
        runBacktest();
      }
    }, 24 * 60 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [scheduleSweep, working, runBacktest]);

  const saveCurrentConfig = () => {
    const name = prompt("Enter a name for this strategy configuration:");
    if (!name) return;
    const existing = savedConfigs.filter((item) => item.name !== name);
    setSavedConfigs([
      ...existing,
      {
        name,
        startDate,
        endDate,
        fixedShares,
        atrPeriod,
        tpMultiplier,
        maxHoldDays,
        includeMode,
        minScore,
        topN,
        trendFilter,
        requireBreakout,
        maxEntryGapPct,
        minHoldDays,
        sweepMode,
        scheduleSweep,
      },
    ]);
  };

  const loadConfig = (cfg: SavedBacktestConfig) => {
    setStartDate(String(cfg.startDate ?? startDate));
    setEndDate(String(cfg.endDate ?? endDate));
    setFixedShares(Number(cfg.fixedShares ?? fixedShares));
    setAtrPeriod(Number(cfg.atrPeriod ?? atrPeriod));
    setTpMultiplier(Number(cfg.tpMultiplier ?? tpMultiplier));
    setMaxHoldDays(Number(cfg.maxHoldDays ?? maxHoldDays));
    setIncludeMode((cfg.includeMode as IncludeMode) ?? includeMode);
    setMinScore(Number(cfg.minScore ?? minScore));
    setTopN(Number(cfg.topN ?? topN));
    setTrendFilter(Boolean(cfg.trendFilter ?? trendFilter));
    setRequireBreakout(Boolean(cfg.requireBreakout ?? requireBreakout));
    setMaxEntryGapPct(Number(cfg.maxEntryGapPct ?? maxEntryGapPct));
    setMinHoldDays(Number(cfg.minHoldDays ?? minHoldDays));
    setSweepMode(Boolean(cfg.sweepMode ?? sweepMode));
    setScheduleSweep(Boolean(cfg.scheduleSweep ?? scheduleSweep));
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-3">Backtest Simulation</h1>
      <p className="text-sm text-slate-300 mb-4">Run sweep configurations and review results for intermediate retail swing trading.</p>

      <section className="bg-[#121f1d] border border-[#2f4340] rounded-lg p-4 mb-4">
        <h2 className="font-semibold text-white mb-2">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-slate-200">Start date (inclusive)
            <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">End date (inclusive)
            <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">Include mode
            <select value={includeMode} onChange={(e) => setIncludeMode(e.target.value as IncludeMode)} className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm">
              <option value="both">Both Trade + Watch</option>
              <option value="trade">Trade only</option>
              <option value="watch">Watch only</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1">Trade: strong signal score, Watch: 82% fib alert.</p>
          </label>
            <label className="text-xs text-slate-200">Min score (higher =&gt; fewer signals)
            <input value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} type="number" min={1} max={10} className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">Top N signals (journal pick)
            <input value={topN} onChange={(e) => setTopN(Number(e.target.value))} type="number" min={1} max={10} className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">Trend filter (MA20 &gt; MA50)
            <input type="checkbox" checked={trendFilter} onChange={(e) => setTrendFilter(e.target.checked)} className="ml-2" />
          </label>
          <label className="text-xs text-slate-200">Require breakout
            <input type="checkbox" checked={requireBreakout} onChange={(e) => setRequireBreakout(e.target.checked)} className="ml-2" />
          </label>
          <label className="text-xs text-slate-200">Max entry gap %
            <input value={maxEntryGapPct} onChange={(e) => setMaxEntryGapPct(Number(e.target.value))} type="number" min={0} max={20} step={0.5} className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">Min hold days
            <input value={minHoldDays} onChange={(e) => setMinHoldDays(Number(e.target.value))} type="number" min={0} max={20} className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">Fixed shares
            <input value={fixedShares} onChange={(e) => setFixedShares(Number(e.target.value))} type="number" min={1} max={1000} className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">ATR period
            <input value={atrPeriod} onChange={(e) => setAtrPeriod(Number(e.target.value))} type="number" min={5} max={30} className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">Target multiplier (R)
            <input value={tpMultiplier} onChange={(e) => setTpMultiplier(Number(e.target.value))} type="number" min={1} max={3} step={0.1} className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">Max hold days
            <input value={maxHoldDays} onChange={(e) => setMaxHoldDays(Number(e.target.value))} type="number" min={5} max={90} className="w-full rounded bg-[#1c2c28] border border-[#3f5b51] mt-1 p-2 text-sm" />
          </label>
          <label className="text-xs text-slate-200">Auto sweep run
            <input type="checkbox" checked={sweepMode} onChange={(e) => setSweepMode(e.target.checked)} className="ml-2" />
          </label>
          <label className="text-xs text-slate-200">Schedule auto sweep daily
            <input type="checkbox" checked={scheduleSweep} onChange={(e) => setScheduleSweep(e.target.checked)} className="ml-2" />
            <p className="text-[10px] text-slate-400 mt-1">When enabled, simulation will run every 24 hours while the app is open.</p>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={working} onClick={runBacktest} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded text-white text-sm">
            {working ? "Running..." : sweepMode ? "Run Sweep" : "Run Backtest"}
          </button>
          <button disabled={working} onClick={saveCurrentConfig} className="px-4 py-2 border border-slate-500 rounded text-white text-sm">
            Save Config as Strategy
          </button>
        </div>
      </section>

      <section className="bg-[#121f1d] border border-[#2f4340] rounded-lg p-4 mb-4">
        <h2 className="font-semibold text-white mb-2">Saved Strategies</h2>
        <div className="space-y-2">
          {savedConfigs.length === 0 ? (
            <p className="text-slate-400 text-xs">No saved strategy configs yet.</p>
          ) : (
            savedConfigs.map((cfg) => (
              <div key={cfg.name} className="flex justify-between rounded border border-[#2f4340] p-2 text-sm">
                <span>{cfg.name}</span>
                <button className="text-cyan-300" onClick={() => loadConfig(cfg)}>Load</button>
              </div>
            ))
          )}
        </div>
      </section>

      {error && (
        <div className="bg-[#4f1b1b] border border-[#7d2c2c] rounded p-3 text-sm text-red-200 mb-4">
          {error}
        </div>
      )}

      {result && (
        <section className="bg-[#121f1d] border border-[#2f4340] rounded-lg p-4 mb-4">
          <h2 className="font-semibold text-white mb-2">Result Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-300">
            <div>Total signals: {result.summary.totalSignals}</div>
            <div>Watch-82 alerts: {result.signals.filter((s) => s.isWatch82).length}</div>
            <div>Total trades: {result.summary.totalTrades}</div>
            <div>Win rate: {fmPercent(result.summary.winRate)}</div>
            <div>Net PnL: {result.summary.netPnl.toFixed(2)}</div>
            <div>Avg win %: {result.summary.avgWinPct.toFixed(2)}</div>
            <div>Avg loss %: {result.summary.avgLossPct.toFixed(2)}</div>
            <div>Avg hold: {result.summary.averageHoldDays.toFixed(1)}d</div>
            <div>Total risked: {result.summary.totalRisked.toFixed(2)}</div>
          </div>

          {result.sweepResults && result.sweepResults.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-2">Sweep results</h3>
              <div className="overflow-x-auto rounded border border-[#2f4340]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 border border-[#2f4340]">Config</th>
                      <th className="px-2 py-1 border border-[#2f4340]">Win rate</th>
                      <th className="px-2 py-1 border border-[#2f4340]">Net PnL</th>
                      <th className="px-2 py-1 border border-[#2f4340]">Trades</th>
                      <th className="px-2 py-1 border border-[#2f4340]">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sweepResults.map((item, index) => (
                      <tr key={index} className="hover:bg-[#162d2a]">
                        <td className="px-2 py-1 border border-[#2f4340] whitespace-nowrap">{JSON.stringify(item.config)}</td>
                        <td className="px-2 py-1 border border-[#2f4340]">{fmPercent(item.result.summary.winRate)}</td>
                        <td className="px-2 py-1 border border-[#2f4340]">{item.result.summary.netPnl.toFixed(2)}</td>
                        <td className="px-2 py-1 border border-[#2f4340]">{item.result.summary.totalTrades}</td>
                        <td className="px-2 py-1 border border-[#2f4340]">{getRecommendation(item.result.summary)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Switch counts per ticker</h3>
            <div className="overflow-x-auto rounded border border-[#2f4340]">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr>
                    <th className="px-2 py-1 border border-[#2f4340]">Ticker</th>
                    <th className="px-2 py-1 border border-[#2f4340]">Trade→Watch</th>
                    <th className="px-2 py-1 border border-[#2f4340]">Watch→Trade</th>
                    <th className="px-2 py-1 border border-[#2f4340]">Total switches</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.summary.switchCountsPerTicker).map(([ticker, stats]) => (
                    <tr key={ticker} className="hover:bg-[#162d2a]">
                      <td className="px-2 py-1 border border-[#2f4340]">{ticker}</td>
                      <td className="px-2 py-1 border border-[#2f4340]">{stats.tradeToWatch}</td>
                      <td className="px-2 py-1 border border-[#2f4340]">{stats.watchToTrade}</td>
                      <td className="px-2 py-1 border border-[#2f4340]">{stats.totalSwitches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="bg-[#121f1d] border border-[#2f4340] rounded-lg p-4 text-xs text-slate-300">
        <h2 className="font-semibold text-white mb-2">How to use</h2>
        <ul className="list-disc ml-5 space-y-1">
          <li>Enter a date range to backtest specific market-news windows.</li>
          <li>Set <strong>include mode</strong> to test active trade signals, watch alerts at 82% Fibonacci, or both.</li>
          <li>Use <strong>Auto sweep</strong> to run multiple tuned variations in one click.</li>
          <li>Save a configuration after tuning with &quot;Save Config as Strategy&quot; and load it for repeat runs.</li>
        </ul>
      </section>
    </main>
  );
}
