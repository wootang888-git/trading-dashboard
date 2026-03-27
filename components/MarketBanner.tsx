"use client";

type Condition = "bull" | "bear" | "neutral";

export default function MarketBanner({ condition }: { condition: Condition }) {
  const config = {
    bull: {
      bg: "bg-green-900/40 border-green-700",
      dot: "bg-green-400",
      label: "BULL MARKET",
      desc: "SPY is above its 20-day MA. Conditions favor long trades.",
    },
    bear: {
      bg: "bg-red-900/40 border-red-700",
      dot: "bg-red-400",
      label: "BEAR / CHOPPY",
      desc: "SPY is below its 20-day MA. Reduce position sizes or stay flat.",
    },
    neutral: {
      bg: "bg-gray-800 border-gray-600",
      dot: "bg-yellow-400",
      label: "LOADING...",
      desc: "Fetching market data.",
    },
  }[condition];

  return (
    <div className={`border rounded-lg px-4 py-3 flex items-center gap-3 ${config.bg}`}>
      <span className={`w-3 h-3 rounded-full shrink-0 animate-pulse ${config.dot}`} />
      <div>
        <span className="font-bold text-sm tracking-wider">{config.label}</span>
        <span className="text-gray-400 text-sm ml-2">{config.desc}</span>
      </div>
    </div>
  );
}
