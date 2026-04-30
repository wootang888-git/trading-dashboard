"use client";

export interface SectorPulseData {
  etf: string;
  avgGap: number;      // mean gap_pct_live for tickers in this sector
  pctPositive: number; // fraction of tickers gapping up
  direction: "hot" | "warm" | "neutral" | "cold";
}

function directionColor(d: SectorPulseData["direction"]) {
  return {
    hot:     { text: "#43ed9e", bg: "rgba(67, 237, 158, 0.10)", border: "rgba(67, 237, 158, 0.20)" },
    warm:    { text: "#c8a84b", bg: "rgba(200, 168, 75, 0.10)",  border: "rgba(200, 168, 75, 0.20)" },
    neutral: { text: "#bacbbd", bg: "rgba(186, 203, 189, 0.06)", border: "rgba(186, 203, 189, 0.12)" },
    cold:    { text: "#ffb3ae", bg: "rgba(255, 179, 174, 0.10)", border: "rgba(255, 179, 174, 0.20)" },
  }[d];
}

const ETF_LABEL: Record<string, string> = {
  XLK: "Tech",
  ITA: "Defense",
  XLE: "Energy",
  XLF: "Finance",
  QQQ: "Nasdaq",
  SPY: "S&P 500",
};

export default function SectorPulseBanner({ sectors }: { sectors: SectorPulseData[] }) {
  if (!sectors || sectors.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-widest text-[#555] shrink-0">
        Sectors
      </span>
      {sectors.map((s) => {
        const colors = directionColor(s.direction);
        const arrow = s.avgGap > 0.005 ? "↑" : s.avgGap < -0.005 ? "↓" : "→";
        const gapLabel = `${s.avgGap > 0 ? "+" : ""}${(s.avgGap * 100).toFixed(1)}%`;

        return (
          <div
            key={s.etf}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
            style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
          >
            <span>{arrow}</span>
            <span>{ETF_LABEL[s.etf] ?? s.etf}</span>
            <span className="opacity-70 font-mono">{gapLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
