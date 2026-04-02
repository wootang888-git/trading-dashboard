"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function CalculatorPage() {
  const [account, setAccount] = useState("10000");
  const [riskPct, setRiskPct] = useState("2");
  const initialQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const [entry, setEntry] = useState(initialQuery?.get("entry") || "");
  const [stop, setStop] = useState(initialQuery?.get("stop") || "");

  const accountNum = parseFloat(account) || 0;
  const riskPctNum = parseFloat(riskPct) || 0;
  const entryNum = parseFloat(entry) || 0;
  const stopNum = parseFloat(stop) || 0;

  const valid = accountNum > 0 && riskPctNum > 0 && entryNum > 0 && stopNum > 0 && stopNum < entryNum;

  const riskPerShare = valid ? entryNum - stopNum : null;
  const dollarRisk = valid ? accountNum * (riskPctNum / 100) : null;
  const shareCount = valid ? Math.floor(dollarRisk! / riskPerShare!) : null;
  const positionValue = valid ? shareCount! * entryNum : null;
  const portfolioPct = valid ? (positionValue! / accountNum) * 100 : null;
  const target = valid ? entryNum + 3 * riskPerShare! : null;
  const potentialGain = valid ? shareCount! * (target! - entryNum) : null;

  const warnings: string[] = [];
  if (valid) {
    if (riskPctNum > 2) warnings.push("Exceeds the 2% rule — consider smaller size");
    if (portfolioPct! > 30) warnings.push("Large position — consider splitting entry");
    if ((riskPerShare! / entryNum) * 100 > 10) warnings.push("Wide stop — tighten entry or reduce shares");
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: "var(--surface)", color: "var(--on-surface)" }}>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/" className="transition-colors hover:brightness-125" style={{ color: "var(--on-surface-variant)" }}>
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}
            >
              Position Size Calculator
            </h1>
            <p className="text-sm" style={{ color: "var(--on-surface-variant)" }}>Risk-based share sizing</p>
          </div>
        </div>

        {/* Inputs */}
        <Card className="border-0" style={{ backgroundColor: "var(--surface-container)" }}>
          <CardContent className="p-4 space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--on-surface-variant)" }}>Inputs</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Account Size ($)</label>
                <input
                  type="number"
                  min="1"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                  style={{ backgroundColor: "var(--surface-high)", color: "var(--on-surface)" }}
                  placeholder="10000"
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--on-surface-variant)" }}>Max Risk (%)</label>
                <input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={riskPct}
                  onChange={(e) => setRiskPct(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                  style={{ backgroundColor: "var(--surface-high)", color: "var(--on-surface)" }}
                  placeholder="2"
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--on-surface-variant)" }}>Entry Price ($)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                  style={{ backgroundColor: "var(--surface-high)", color: "var(--on-surface)" }}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--on-surface-variant)" }}>Stop Loss ($)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={stop}
                  onChange={(e) => setStop(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm focus:outline-none"
                  style={{ backgroundColor: "var(--surface-high)", color: "var(--on-surface)" }}
                  placeholder="0.00"
                />
              </div>
            </div>
            {stopNum > 0 && entryNum > 0 && stopNum >= entryNum && (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle size={12} />
                Stop loss must be below entry price
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="border-0" style={{ backgroundColor: valid ? "var(--surface-container)" : "var(--surface-low)" }}>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--on-surface-variant)" }}>Results</h2>
            {!valid ? (
              <p className="text-sm text-center py-4" style={{ color: "var(--outline)" }}>
                Enter account size, risk %, entry, and stop to calculate
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--on-surface-variant)" }}>Risk per share</span>
                  <span className="font-mono" style={{ color: "var(--on-surface)" }}>${riskPerShare!.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--on-surface-variant)" }}>Dollar risk</span>
                  <span className="font-mono" style={{ color: "var(--on-surface)" }}>
                    ${dollarRisk!.toFixed(2)}
                    <span className="ml-1" style={{ color: "var(--outline)" }}>({riskPctNum}% of ${accountNum.toLocaleString()})</span>
                  </span>
                </div>

                <div className="pt-3 space-y-3" style={{ borderTop: "1px solid rgba(60,74,64,0.3)" }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--on-surface-variant)" }}>Share count</span>
                    <span
                      className="font-bold font-mono text-base"
                      style={{ color: "var(--on-surface)", fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}
                    >
                      {shareCount!.toLocaleString()} shares
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--on-surface-variant)" }}>Position value</span>
                    <span className="font-mono" style={{ color: "var(--on-surface)" }}>
                      ${positionValue!.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      <span className="ml-1" style={{ color: "var(--outline)" }}>({portfolioPct!.toFixed(1)}%)</span>
                    </span>
                  </div>
                </div>

                <div className="pt-3 space-y-3" style={{ borderTop: "1px solid rgba(60,74,64,0.3)" }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--on-surface-variant)" }}>Target (3:1 R:R)</span>
                    <span className="font-mono" style={{ color: "#43ed9e" }}>${target!.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--on-surface-variant)" }}>Potential gain</span>
                    <span className="font-mono" style={{ color: "#43ed9e" }}>
                      +${potentialGain!.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div className="pt-3 space-y-1.5" style={{ borderTop: "1px solid rgba(60,74,64,0.3)" }}>
                    {warnings.map((w) => (
                      <div key={w} className="flex items-start gap-2 text-xs" style={{ color: "#ffb3ae" }}>
                        <AlertCircle size={12} className="mt-0.5 shrink-0" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
