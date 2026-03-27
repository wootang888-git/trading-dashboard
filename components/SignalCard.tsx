"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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

export default function SignalCard({
  ticker,
  score,
  strength,
  price,
  changePct,
  volumeRatio,
  rsi14,
  isAboveMa20,
  isAboveMa50,
  entryNote,
  stopNote,
  strategy,
}: SignalCardProps) {
  const changeColor = changePct >= 0 ? "text-green-400" : "text-red-400";
  const changeSign = changePct >= 0 ? "+" : "";

  return (
    <Card className="bg-gray-900 border-gray-800 hover:border-gray-600 transition-colors">
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg">{ticker}</span>
            <Badge className={`text-xs ${strengthColors[strength]}`}>
              {strength.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-xs text-gray-400">
              {strategy.replace("_", " ")}
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-white font-semibold">${price.toFixed(2)}</div>
            <div className={`text-sm ${changeColor}`}>
              {changeSign}{changePct.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Score bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Signal Score</span>
            <span className="font-bold text-white">{score}/10</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
              style={{ width: `${score * 10}%` }}
            />
          </div>
        </div>

        {/* Indicators */}
        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
          <div className="bg-gray-800 rounded p-2 text-center">
            <div className="text-gray-400">RSI 14</div>
            <div className={`font-bold ${rsi14 >= 50 && rsi14 <= 75 ? "text-green-400" : "text-yellow-400"}`}>
              {rsi14.toFixed(0)}
            </div>
          </div>
          <div className="bg-gray-800 rounded p-2 text-center">
            <div className="text-gray-400">Vol Ratio</div>
            <div className={`font-bold ${volumeRatio >= 1.5 ? "text-green-400" : "text-gray-300"}`}>
              {volumeRatio.toFixed(1)}x
            </div>
          </div>
          <div className="bg-gray-800 rounded p-2 text-center">
            <div className="text-gray-400">MAs</div>
            <div className="font-bold">
              <span className={isAboveMa20 ? "text-green-400" : "text-red-400"}>20</span>
              {" / "}
              <span className={isAboveMa50 ? "text-green-400" : "text-red-400"}>50</span>
            </div>
          </div>
        </div>

        {/* Trade notes */}
        {score >= 5 && (
          <div className="space-y-1 text-xs border-t border-gray-800 pt-2 mt-2">
            <div className="text-green-400">▲ {entryNote}</div>
            <div className="text-red-400">▼ {stopNote}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
