"use client";

import { useState, useEffect } from "react";
import { AlertCircle, Minus, X } from "lucide-react";

interface CalculatorModalProps {
  entry?: number | null;
  stop?: number | null;
  onClose: () => void;
}

export default function CalculatorModal({ entry: initialEntry, stop: initialStop, onClose }: CalculatorModalProps) {
  const [minimized, setMinimized] = useState(false);
  const [account, setAccount] = useState("10000");
  const [riskPct, setRiskPct] = useState("2");
  const [entry, setEntry] = useState(initialEntry ? String(initialEntry) : "");
  const [stop, setStop] = useState(initialStop ? String(initialStop) : "");

  // Update fields when pre-fill values change (e.g. clicking Size on a different card)
  useEffect(() => {
    // Note: setState in effect is used here to update state when props change, accepted for this use case
    if (initialEntry) setEntry(String(initialEntry)); // eslint-disable-line react-hooks/set-state-in-effect
    if (initialStop) setStop(String(initialStop)); // eslint-disable-line react-hooks/set-state-in-effect
    setMinimized(false);
  }, [initialEntry, initialStop]);

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
  const target = valid ? entryNum + 2 * riskPerShare! : null;
  const potentialGain = valid ? shareCount! * (target! - entryNum) : null;

  const warnings: string[] = [];
  if (valid) {
    if (riskPctNum > 2) warnings.push("Exceeds 2% rule");
    if (portfolioPct! > 30) warnings.push("Large position — consider splitting");
    if ((riskPerShare! / entryNum) * 100 > 10) warnings.push("Wide stop — tighten entry");
  }

  const inputCls = "w-full rounded px-2 py-1.5 text-sm focus:outline-none";
  const inputStyle = { backgroundColor: "var(--surface-high)", color: "var(--on-surface)" };
  const labelStyle = { color: "var(--on-surface-variant)" };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-xl shadow-2xl overflow-hidden"
      style={{
        width: "320px",
        backgroundColor: "var(--surface-container)",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ backgroundColor: "var(--surface-high)" }}
      >
        {/* Left: minimize + close */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMinimized((v) => !v)}
            className="w-5 h-5 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ backgroundColor: "#c8a84b" }}
            title="Minimize"
          >
            <Minus size={10} color="#003920" strokeWidth={3} />
          </button>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ backgroundColor: "#ffb3ae" }}
            title="Close"
          >
            <X size={10} color="#690005" strokeWidth={3} />
          </button>
        </div>

        {/* Title */}
        <span
          className="text-xs font-semibold tracking-wide"
          style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)", color: "var(--on-surface-variant)" }}
        >
          Position Calculator
        </span>

        {/* Spacer to balance title */}
        <div className="w-12" />
      </div>

      {/* Body — hidden when minimized */}
      {!minimized && (
        <div className="p-3 space-y-3">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={labelStyle}>Account ($)</label>
              <input type="number" value={account} onChange={(e) => setAccount(e.target.value)}
                className={inputCls} style={inputStyle} min="1" placeholder="10000" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={labelStyle}>Risk (%)</label>
              <input type="number" value={riskPct} onChange={(e) => setRiskPct(e.target.value)}
                className={inputCls} style={inputStyle} min="0.1" max="10" step="0.1" placeholder="2" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={labelStyle}>Entry ($)</label>
              <input type="number" value={entry} onChange={(e) => setEntry(e.target.value)}
                className={inputCls} style={inputStyle} min="0.01" step="0.01" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={labelStyle}>Stop ($)</label>
              <input type="number" value={stop} onChange={(e) => setStop(e.target.value)}
                className={inputCls} style={inputStyle} min="0.01" step="0.01" placeholder="0.00" />
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px solid rgba(60,74,64,0.3)" }} />

          {/* Results */}
          {!valid ? (
            <p className="text-xs text-center py-2" style={{ color: "var(--outline)" }}>
              {stopNum >= entryNum && stopNum > 0
                ? "Stop must be below entry"
                : "Fill in all fields to calculate"}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span style={labelStyle}>Shares</span>
                <span
                  className="font-bold text-sm"
                  style={{ color: "var(--on-surface)", fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}
                >
                  {shareCount!.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={labelStyle}>Dollar risk</span>
                <span style={{ color: "var(--on-surface)" }} className="font-mono">
                  ${dollarRisk!.toFixed(2)}
                  <span className="ml-1 text-xs" style={{ color: "var(--outline)" }}>({riskPctNum}%)</span>
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={labelStyle}>Position value</span>
                <span style={{ color: "var(--on-surface)" }} className="font-mono">
                  ${positionValue!.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  <span className="ml-1" style={{ color: "var(--outline)" }}>({portfolioPct!.toFixed(1)}%)</span>
                </span>
              </div>

              <div style={{ borderTop: "1px solid rgba(60,74,64,0.3)" }} className="pt-2 space-y-2">
                <div className="flex justify-between text-xs">
                  <span style={labelStyle}>Target (2:1)</span>
                  <span className="font-mono" style={{ color: "#43ed9e" }}>${target!.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={labelStyle}>Potential gain</span>
                  <span className="font-mono" style={{ color: "#43ed9e" }}>
                    +${potentialGain!.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="pt-1 space-y-1">
                  {warnings.map((w) => (
                    <div key={w} className="flex items-center gap-1.5 text-xs" style={{ color: "#ffb3ae" }}>
                      <AlertCircle size={10} className="shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
