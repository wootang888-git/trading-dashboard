"use client";

import { useState, useRef } from "react";
import { Minus, Plus } from "lucide-react";

interface StepperInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  /** If true, display value with 1 decimal place */
  decimal?: boolean;
}

export default function StepperInput({
  label, value, onChange, min, max, step = 1, hint, decimal = false,
}: StepperInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function clamp(v: number) {
    return Math.min(max, Math.max(min, v));
  }

  function decrement() {
    onChange(clamp(parseFloat((value - step).toFixed(10))));
  }

  function increment() {
    onChange(clamp(parseFloat((value + step).toFixed(10))));
  }

  function startEdit() {
    setDraft(String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) onChange(clamp(parsed));
    setEditing(false);
  }

  const displayValue = decimal ? value.toFixed(1) : String(value);

  return (
    <div>
      <label className="block text-xs text-[#bacbbd] mb-1.5">{label}</label>
      <div className="flex items-center rounded-lg bg-[#161c22] border border-[#3c4a40]/30 overflow-hidden">
        {/* Decrement */}
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          className="flex items-center justify-center w-11 h-11 shrink-0 text-[#bacbbd] hover:text-[#dde3ec] hover:bg-[#252b31] active:bg-[#2f353c] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={`Decrease ${label}`}
        >
          <Minus size={14} />
        </button>

        {/* Value display / inline edit */}
        <div className="flex-1 flex items-center justify-center h-11">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode={decimal ? "decimal" : "numeric"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full text-center text-sm font-mono font-bold text-[#dde3ec] bg-transparent outline-none border-none"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="w-full h-full flex items-center justify-center text-sm font-mono font-bold text-[#dde3ec] hover:text-white transition-colors"
              aria-label={`Edit ${label}`}
            >
              {displayValue}
            </button>
          )}
        </div>

        {/* Increment */}
        <button
          type="button"
          onClick={increment}
          disabled={value >= max}
          className="flex items-center justify-center w-11 h-11 shrink-0 text-[#bacbbd] hover:text-[#dde3ec] hover:bg-[#252b31] active:bg-[#2f353c] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={`Increase ${label}`}
        >
          <Plus size={14} />
        </button>
      </div>
      {hint && (
        <p className="text-[10px] text-[#bacbbd]/40 mt-1">{hint}</p>
      )}
    </div>
  );
}
