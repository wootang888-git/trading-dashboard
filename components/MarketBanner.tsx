"use client";

type Condition = "bull" | "bear" | "neutral";

export default function MarketBanner({ condition }: { condition: Condition }) {
  const config = {
    bull: {
      bg: { backgroundColor: "rgba(67, 237, 158, 0.08)" },
      dot: "#43ed9e",
      label: "BULL MARKET",
      desc: "SPY is above its 20-day MA. Conditions favor long trades.",
    },
    bear: {
      bg: { backgroundColor: "rgba(255, 179, 174, 0.08)" },
      dot: "#ffb3ae",
      label: "BEAR / CHOPPY",
      desc: "SPY is below its 20-day MA. Reduce position sizes or stay flat.",
    },
    neutral: {
      bg: { backgroundColor: "var(--surface-low)" },
      dot: "#bacbbd",
      label: "LOADING...",
      desc: "Fetching market data.",
    },
  }[condition];

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={config.bg}
    >
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse"
        style={{ backgroundColor: config.dot }}
      />
      <div>
        <span
          className="font-semibold text-sm tracking-widest"
          style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)", color: config.dot }}
        >
          {config.label}
        </span>
        <span className="text-sm ml-2" style={{ color: "var(--on-surface-variant)" }}>
          {config.desc}
        </span>
      </div>
    </div>
  );
}
