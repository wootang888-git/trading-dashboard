import { NextRequest, NextResponse } from "next/server";
import { getWatchlist, getMlScores, getSignalStreaks, getNotificationsToday, upsertNotificationLog } from "@/lib/supabase";
import { getQuote, getHistorical, HistoricalBar } from "@/lib/yahoo";
import { buildSignal, computeNbaDirective } from "@/lib/signals";
import { SECTOR_ETF } from "@/lib/watchlist";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function _today(): string {
  return new Date().toISOString().split("T")[0];
}

type TriggerType = "SCALE_IN" | "EXIT" | "HARVEST" | "RSI" | "EMA_TOUCH" | "VOL_SPIKE" | "MACD" | "BB_SQUEEZE" | "STOP_NEAR";

interface FiredTrigger {
  ticker: string;
  name: string;
  triggerType: TriggerType;
  detail: string;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scoreDate = _today();
  const watchlist = await getWatchlist();
  const watchlistTickers = watchlist.map((w) => w.ticker);

  const [spyBars, mlScores, signalStreaks, alreadySent] = await Promise.all([
    getHistorical("SPY", 90),
    getMlScores(watchlistTickers),
    getSignalStreaks(watchlistTickers),
    getNotificationsToday(scoreDate),
  ]);

  const neededSectorEtfs = [...new Set(watchlist.map((w) => SECTOR_ETF[w.ticker]).filter(Boolean))];
  const sectorBarMap: Record<string, HistoricalBar[]> = {};
  await Promise.all(neededSectorEtfs.map(async (etf) => { sectorBarMap[etf] = await getHistorical(etf, 90); }));

  const sectorEtfAboveMA20Map: Record<string, boolean> = {};
  for (const etf of neededSectorEtfs) {
    const sBars = sectorBarMap[etf] ?? [];
    sectorEtfAboveMA20Map[etf] = sBars.length >= 20
      ? sBars[sBars.length - 1].close > sBars.slice(-20).reduce((s, b) => s + b.close, 0) / 20
      : true;
  }

  const allFired: FiredTrigger[] = [];

  await Promise.all(
    watchlist.map(async ({ ticker, name, strategy }) => {
      const [quote, bars] = await Promise.all([getQuote(ticker), getHistorical(ticker, 90)]);
      if (!quote || bars.length === 0) return;

      const sectorEtf = SECTOR_ETF[ticker];
      const sectorBars = sectorEtf ? (sectorBarMap[sectorEtf] ?? []) : [];
      const sectorEtfAboveMA20 = sectorEtf ? (sectorEtfAboveMA20Map[sectorEtf] ?? true) : true;
      const signal = buildSignal(ticker, strategy, bars, quote.high52w, spyBars, sectorBars, sectorEtfAboveMA20);

      const mlData = mlScores[ticker];
      const streakData = signalStreaks[ticker];
      const { directive: nbaDirective } = computeNbaDirective({
        mlScorePct: mlData?.ml_score_pct ?? null,
        mlPercentileRank: mlData?.ml_percentile_rank ?? null,
        convictionScore: signal.convictionScore,
        streakDays: streakData?.streak_days ?? 0,
        mlDelta24h: streakData?.ml_delta_24h ?? null,
        tier: signal.tier,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        livePrice: quote.price,
        ema8: signal.indicators.ema8,
        structuralTarget: signal.structuralTarget,
        trailMode: signal.trailMode,
      });

      const ind = signal.indicators;
      const livePrice = quote.price;

      const candidates: { type: TriggerType; detail: string }[] = [];

      // Trigger 1 — SCALE_IN
      if (nbaDirective === "SCALE_IN") {
        const pct = mlData?.ml_percentile_rank ?? mlData?.ml_score_pct ?? null;
        const streak = streakData?.streak_days ?? 0;
        candidates.push({
          type: "SCALE_IN",
          detail: `Conv ${signal.convictionScore}${pct !== null ? ` · ${pct}th pct` : ""}${streak >= 3 ? ` · ${streak}-day streak 🔥` : ""}`,
        });
      }

      // Trigger 2 — EXIT
      if (signal.tier === "EXIT") {
        candidates.push({ type: "EXIT", detail: `Conv ${signal.convictionScore}` });
      }

      // Trigger 3 — RSI extreme
      if (ind.rsi14 < 30 || ind.rsi14 > 70) {
        const label = ind.rsi14 < 30 ? `RSI ${ind.rsi14.toFixed(0)} (oversold)` : `RSI ${ind.rsi14.toFixed(0)} (overbought)`;
        candidates.push({ type: "RSI", detail: label });
      }

      // Trigger 4 — EMA touch (within 1% of MA20)
      if (ind.ma20 > 0 && Math.abs(livePrice - ind.ma20) / livePrice <= 0.01) {
        candidates.push({ type: "EMA_TOUCH", detail: `Price at 20-EMA ($${ind.ma20.toFixed(2)})` });
      }

      // Trigger 5 — Vol spike
      if (ind.volumeRatio > 2.0) {
        candidates.push({ type: "VOL_SPIKE", detail: `Vol ${ind.volumeRatio.toFixed(1)}× avg` });
      }

      // Trigger 6 — MACD accelerating
      if (ind.macdAccelerating) {
        candidates.push({ type: "MACD", detail: "MACD hist rising" });
      }

      // Trigger 7 — BB squeeze
      if (ind.bbSqueeze) {
        candidates.push({ type: "BB_SQUEEZE", detail: "BB squeeze (coiling)" });
      }

      // Trigger 8 — HARVEST (take partial profits)
      if (nbaDirective === "HARVEST") {
        candidates.push({ type: "HARVEST", detail: `Conv ${signal.convictionScore} — take partial profits` });
      }

      // Trigger 9 — Stop approach (within 3% of stop)
      const riskToStop = signal.stopPrice > 0 ? (livePrice - signal.stopPrice) / livePrice : -1;
      if (riskToStop > 0 && riskToStop <= 0.03) {
        candidates.push({ type: "STOP_NEAR", detail: `Within ${(riskToStop * 100).toFixed(1)}% of stop ($${signal.stopPrice.toFixed(2)})` });
      }

      for (const c of candidates) {
        if (!alreadySent.has(`${ticker}:${c.type}`)) {
          allFired.push({ ticker, name, triggerType: c.type, detail: c.detail });
        }
      }
    })
  );

  if (allFired.length === 0) {
    return NextResponse.json({ sent: 0, triggered: [] });
  }

  // Format message
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const lines: string[] = [`📈 <b>SwingAI — ${dateStr}</b>`, ""];

  const HIGH_PRIORITY = ["SCALE_IN", "EXIT", "HARVEST"];
  const scaleIns = allFired.filter((f) => f.triggerType === "SCALE_IN");
  const harvests = allFired.filter((f) => f.triggerType === "HARVEST");
  const exits = allFired.filter((f) => f.triggerType === "EXIT");
  const watchSignals = allFired.filter((f) => !HIGH_PRIORITY.includes(f.triggerType));

  const tickerLabel = (f: FiredTrigger) => `${f.ticker} (${f.name})`;

  if (scaleIns.length > 0) {
    lines.push("🟢 <b>SCALE IN</b>");
    for (const f of scaleIns) lines.push(`  ${tickerLabel(f)} · ${f.detail}`);
    lines.push("");
  }

  if (harvests.length > 0) {
    lines.push("🟡 <b>HARVEST</b>");
    for (const f of harvests) lines.push(`  ${tickerLabel(f)} · ${f.detail}`);
    lines.push("");
  }

  if (exits.length > 0) {
    lines.push("🔴 <b>EXIT</b>");
    for (const f of exits) lines.push(`  ${tickerLabel(f)} · ${f.detail}`);
    lines.push("");
  }

  if (watchSignals.length > 0) {
    // Group watch signals by type and show counts to stay under Telegram 4096 char limit
    const byType: Record<string, string[]> = {};
    for (const f of watchSignals) {
      if (!byType[f.triggerType]) byType[f.triggerType] = [];
      byType[f.triggerType].push(f.ticker);
    }
    const TYPE_LABEL: Record<string, string> = {
      RSI: "RSI extreme", EMA_TOUCH: "EMA touch", VOL_SPIKE: "Vol spike",
      MACD: "MACD accel", BB_SQUEEZE: "BB squeeze", STOP_NEAR: "Stop approach",
    };
    lines.push("📊 <b>Watch signals</b>");
    for (const [type, tickers] of Object.entries(byType)) {
      const label = TYPE_LABEL[type] ?? type;
      const shown = tickers.slice(0, 8).join(", ");
      const extra = tickers.length > 8 ? ` +${tickers.length - 8} more` : "";
      lines.push(`  ${label}: ${shown}${extra}`);
    }
    lines.push("");
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://swingai.vercel.app";
  lines.push(`<a href="${dashboardUrl}">View dashboard →</a>`);

  // Telegram hard limit is 4096 chars — truncate safely if needed
  let text = lines.join("\n");
  if (text.length > 4000) text = text.slice(0, 4000) + "\n…(truncated)";

  await sendTelegramMessage(text);

  await upsertNotificationLog(
    allFired.map((f) => ({ ticker: f.ticker, trigger_type: f.triggerType, score_date: scoreDate }))
  );

  return NextResponse.json({ sent: 1, triggered: allFired.map((f) => `${f.ticker}:${f.triggerType}`) });
}
