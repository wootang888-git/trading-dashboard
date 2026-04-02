"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Dashboard" },
  { href: "/journal", label: "Journal" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/backtest", label: "Backtest Simulation" },
  { href: "/calculator", label: "Calculator" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <header
      className="sticky top-0 z-40 border-b border-[#3c4a40]/30 backdrop-blur-md"
      style={{ backgroundColor: "#0e141af2" }}
    >
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <span
          className="text-base font-bold"
          style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)", color: "var(--primary)" }}
        >
          SwingAI{" "}
          <span className="text-[10px] font-normal opacity-40">[beta]</span>
        </span>
        <nav className="flex items-center gap-1">
          {tabs.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  backgroundColor: active ? "var(--surface-container-high)" : "transparent",
                  color: active ? "var(--on-surface)" : "var(--on-surface-variant)",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
