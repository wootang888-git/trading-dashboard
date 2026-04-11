"use client";

import { MlPerformanceRow } from "@/lib/supabase";

function mean(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function formatPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function ReturnPill({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
        positive ? "bg-[#45dfa4]/10 text-[#45dfa4]" : "bg-[#ffb3ae]/10 text-[#ffb3ae]"
      }`}
    >
      {formatPct(value)}
    </span>
  );
}

interface MlTrackRecordProps {
  performance: MlPerformanceRow[];
}

export default function MlTrackRecord({ performance }: MlTrackRecordProps) {
  if (performance.length === 0) {
    return (
      <div className="rounded-xl bg-[rgba(53,53,52,0.4)] border border-white/10 px-5 py-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-[#f9bd22]" />
          <span className="font-bold text-[#e5e2e1] font-['Space_Grotesk'] text-sm">ML Track Record</span>
        </div>
        <p className="text-[11px] text-[#666] ml-5">
          No performance data yet — check back in 5 trading days after the scorer first runs.
        </p>
      </div>
    );
  }

  // Top-10 picks only for the summary
  const top10 = performance.filter((r) => r.ml_rank <= 10);
  const returns = top10.map((r) => r.return_5d).filter((v) => v != null) as number[];
  const spyReturns = top10.map((r) => r.spy_return_5d).filter((v) => v != null) as number[];
  const avgReturn = mean(returns);
  const avgSpy = mean(spyReturns);
  const beatCount = top10.filter((r) => r.beat_spy === true).length;
  const beatPct = top10.length > 0 ? Math.round((beatCount / top10.length) * 100) : 0;

  // Most recent 10 rows for the table
  const recent = performance.slice(0, 10);

  // Group by score_date to show most recent week at top
  const dateGroups: Record<string, MlPerformanceRow[]> = {};
  for (const row of recent) {
    if (!dateGroups[row.score_date]) dateGroups[row.score_date] = [];
    dateGroups[row.score_date].push(row);
  }
  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

  return (
    <div className="rounded-xl bg-[rgba(53,53,52,0.4)] border border-white/10 overflow-hidden">
      {/* Summary header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-2 h-2 rounded-full bg-[#f9bd22]" />
          <span className="font-bold text-[#e5e2e1] font-['Space_Grotesk'] text-sm">ML Track Record</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-[#f9bd22]/10 text-[#f9bd22] border border-[#f9bd22]/15 font-bold">
            Top-10 picks
          </span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-[10px] text-[#666] uppercase tracking-wider mb-0.5">Avg 5-day return</p>
            <ReturnPill value={avgReturn} />
          </div>
          {spyReturns.length > 0 && (
            <div>
              <p className="text-[10px] text-[#666] uppercase tracking-wider mb-0.5">vs SPY avg</p>
              <ReturnPill value={avgSpy} />
            </div>
          )}
          <div>
            <p className="text-[10px] text-[#666] uppercase tracking-wider mb-0.5">Beat SPY</p>
            <span className={`font-mono text-[11px] font-bold ${beatPct >= 60 ? "text-[#45dfa4]" : beatPct >= 40 ? "text-[#f9bd22]" : "text-[#ffb3ae]"}`}>
              {beatPct}%
            </span>
          </div>
          <div>
            <p className="text-[10px] text-[#666] uppercase tracking-wider mb-0.5">Periods tracked</p>
            <span className="font-mono text-[11px] font-bold text-[#adc6ff]">{top10.length}</span>
          </div>
        </div>
      </div>

      {/* Recent picks table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[#444] uppercase tracking-widest border-b border-white/5">
              <th className="text-left px-5 py-2 font-normal">Date</th>
              <th className="text-left px-3 py-2 font-normal">Ticker</th>
              <th className="text-left px-3 py-2 font-normal">Rank</th>
              <th className="text-right px-3 py-2 font-normal">5-day return</th>
              <th className="text-right px-5 py-2 font-normal">vs SPY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedDates.map((d) =>
              dateGroups[d].map((row, i) => (
                <tr key={`${row.ticker}-${row.score_date}`} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-2 text-[#555]">{i === 0 ? d : ""}</td>
                  <td className="px-3 py-2 font-bold text-[#e5e2e1] font-['Space_Grotesk']">{row.ticker}</td>
                  <td className="px-3 py-2 text-[#adc6ff] font-mono">#{row.ml_rank}</td>
                  <td className="px-3 py-2 text-right">
                    {row.return_5d != null ? <ReturnPill value={row.return_5d} /> : <span className="text-[#444]">—</span>}
                  </td>
                  <td className="px-5 py-2 text-right">
                    {row.beat_spy != null ? (
                      <span className={row.beat_spy ? "text-[#45dfa4]" : "text-[#ffb3ae]"}>
                        {row.beat_spy ? "✓ Beat" : "✗ Missed"}
                      </span>
                    ) : (
                      <span className="text-[#444]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
