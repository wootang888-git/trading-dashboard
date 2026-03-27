"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import SAModal from "./SAModal";
import StockChart from "./StockChart";

/** Extracts the last dollar amount from a note string, e.g. "Buy stop $0.05 above $212.34..." → 212.34 */
function parseLastPrice(note: string): number | null {
  const matches = note.match(/\$(\d+(?:\.\d+)?)/g);
  if (!matches || matches.length === 0) return null;
  return parseFloat(matches[matches.length - 1].replace("$", ""));
}

interface SAInfo {
  quantRating: string | null;
  analystRating: string | null;
  earningsDays: number | null;
  recentHeadline: string | null;
  newsSentiment: "positive" | "negative" | "neutral" | null;
}

interface SignalCardProps {
  ticker: string;
  score: number;
  strength: string;
  price: number;
  changePct: number;
  volumeRatio: number;
  rsi14: number;
  isAboveMa20: boolean;
  isAboveMa50: boolean;
  entryNote: string;
  stopNote: string;
  strategy: string;
  sa?: SAInfo;
}

const strengthColors: Record<string, string> = {
  strong: "bg-green-500 text-white",
  moderate: "bg-yellow-500 text-black",
  weak: "bg-orange-500 text-white",
  none: "bg-gray-600 text-white",
};

const scoreBarColor = (score: number) => {
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-yellow-400";
  if (score >= 4) return "bg-orange-400";
  return "bg-gray-500";
};

const sentimentBorder: Record<string, string> = {
  positive: "border-l-2 border-green-500 bg-green-950/40 text-green-300",
  negative: "border-l-2 border-red-500 bg-red-950/40 text-red-300",
  neutral:  "border-l-2 border-gray-600 bg-gray-800/40 text-gray-300",
};

export default function SignalCard({
  ticker, score, strength, price, changePct,
  volumeRatio, rsi14, isAboveMa20, isAboveMa50,
  entryNote, stopNote, strategy, sa,
}: SignalCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const changeColor = changePct >= 0 ? "text-green-400" : "text-red-400";

  // Parse trade levels from signal notes
  const entryPrice = parseLastPrice(entryNote);
  const stopPrice = parseLastPrice(stopNote);
  const risk = entryPrice && stopPrice ? Math.abs(entryPrice - stopPrice) : null;
  const targetPrice = entryPrice && risk ? entryPrice + 2 * risk : null;
  const changeSign = changePct >= 0 ? "+" : "";
  const earningsWarning = sa?.earningsDays !== null && sa?.earningsDays !== undefined && sa.earningsDays <= 7;

  return (
    <>
      <Card className="bg-gray-900 border-gray-800 hover:border-gray-600 transition-colors">
        <CardContent className="p-4">

          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-xl">{ticker}</span>
              <Badge className={`text-xs ${strengthColors[strength]}`}>
                {strength.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-xs text-gray-400">
                {strategy.replace(/_/g, " ")}
              </Badge>
              {earningsWarning && (
                <Badge className="text-xs bg-orange-900/60 text-orange-300 border-orange-700">
                  ⚠ Earnings {sa!.earningsDays === 0 ? "today" : `in ${sa!.earningsDays}d`}
                </Badge>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-white font-semibold text-base">${price.toFixed(2)}</div>
              <div className={`text-sm font-medium ${changeColor}`}>
                {changeSign}{changePct.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Score bar */}
          <div className="mb-3">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>Signal Score</span>
              <span className="font-bold text-white text-base">{score}/10</span>
            </div>
            <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
                style={{ width: `${score * 10}%` }}
              />
            </div>
          </div>

          {/* Technical indicators */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-gray-800 rounded p-2 text-center">
              <div className="text-gray-400 text-xs mb-0.5">RSI 14</div>
              <div className={`font-bold text-base ${rsi14 >= 50 && rsi14 <= 75 ? "text-green-400" : "text-yellow-400"}`}>
                {rsi14.toFixed(0)}
              </div>
            </div>
            <div className="bg-gray-800 rounded p-2 text-center">
              <div className="text-gray-400 text-xs mb-0.5">Vol Ratio</div>
              <div className={`font-bold text-base ${volumeRatio >= 1.5 ? "text-green-400" : "text-gray-300"}`}>
                {volumeRatio.toFixed(1)}x
              </div>
            </div>
            <div className="bg-gray-800 rounded p-2 text-center">
              <div className="text-gray-400 text-xs mb-0.5">MAs</div>
              <div className="font-bold text-base">
                <span className={isAboveMa20 ? "text-green-400" : "text-red-400"}>20</span>
                {" / "}
                <span className={isAboveMa50 ? "text-green-400" : "text-red-400"}>50</span>
              </div>
            </div>
          </div>

          {/* SA headline — clickable */}
          {sa?.recentHeadline && (
            <button
              onClick={() => setModalOpen(true)}
              className={`w-full text-left text-sm rounded px-3 py-2 mb-2 transition-opacity hover:opacity-80 ${sentimentBorder[sa.newsSentiment ?? "neutral"]}`}
            >
              <span className="opacity-60 text-xs mr-1">SA ↗</span>
              {sa.recentHeadline}
            </button>
          )}

          {/* Trade notes */}
          {score >= 5 && (
            <div className="space-y-1 border-t border-gray-800 pt-2 mt-2">
              <div className="text-green-400 text-sm font-medium">▲ {entryNote}</div>
              <div className="text-red-400 text-sm font-medium">▼ {stopNote}</div>
            </div>
          )}

          {/* Chart toggle */}
          <button
            onClick={() => setShowChart((v) => !v)}
            className="flex items-center gap-1 mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full"
          >
            {showChart ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showChart ? "Hide chart" : "Show chart"}
          </button>

          {/* Expandable chart */}
          {showChart && (
            <StockChart
              ticker={ticker}
              entryPrice={entryPrice}
              stopPrice={stopPrice}
              targetPrice={targetPrice}
            />
          )}

        </CardContent>
      </Card>

      {sa && (
        <SAModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          ticker={ticker}
          sa={sa}
        />
      )}
    </>
  );
}
