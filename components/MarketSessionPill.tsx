"use client";

import { useEffect, useState } from "react";

interface Session {
  label: string;
  sub: string;
  color: string;
  dot: string;
}

function getETSession(): Session {
  const now = new Date();

  // Use Intl API for reliable DST-aware ET conversion
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const totalMin = h * 60 + m;

  const isWeekend = wd === "Sat" || wd === "Sun";

  if (isWeekend || totalMin < 4 * 60 || totalMin >= 20 * 60) {
    return { label: "Market Closed", sub: "Opens Mon 9:30 AM ET", color: "text-gray-500 bg-gray-900/40 border-gray-800", dot: "bg-gray-600" };
  }
  if (totalMin < 9 * 60 + 30) {
    const minsUntil = 9 * 60 + 30 - totalMin;
    return { label: "Pre-Market", sub: `Opens in ${minsUntil}m`, color: "text-yellow-400 bg-yellow-900/30 border-yellow-800", dot: "bg-yellow-400" };
  }
  if (totalMin < 10 * 60) {
    const minsLeft = 10 * 60 - totalMin;
    return { label: "First 30 min", sub: `Wait ${minsLeft}m — volatile open`, color: "text-orange-400 bg-orange-900/30 border-orange-800", dot: "bg-orange-400 animate-pulse" };
  }
  if (totalMin < 16 * 60) {
    const closeAt = 16 * 60 - totalMin;
    const closeH = Math.floor(closeAt / 60);
    const closeM = closeAt % 60;
    const closeStr = closeH > 0 ? `${closeH}h ${closeM}m` : `${closeM}m`;
    return { label: "Regular Hours", sub: `Closes in ${closeStr}`, color: "text-[#43ed9e] bg-[#1a2e1e] border-[#2d4a32]", dot: "bg-[#43ed9e]" };
  }
  return { label: "After-Hours", sub: "Closes 8:00 PM ET", color: "text-gray-400 bg-gray-900/40 border-gray-700", dot: "bg-gray-500" };
}

export default function MarketSessionPill() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(getETSession());
    const id = setInterval(() => setSession(getETSession()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!session) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${session.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${session.dot}`} />
      {session.label}
      <span className="opacity-60 font-normal hidden sm:inline">· {session.sub}</span>
    </span>
  );
}
