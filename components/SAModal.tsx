"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, TrendingUp, TrendingDown, Minus, Calendar, Loader2 } from "lucide-react";

interface Article {
  id: string;
  title: string;
  publishOn: string | null;
  isPaywalled: boolean;
}

interface SAInfo {
  earningsDays: number | null;
  recentHeadline: string | null;
  newsSentiment: "positive" | "negative" | "neutral" | null;
  newsUrl: string | null;
  newsPublisher: string | null;
}

interface SAModalProps {
  open: boolean;
  onClose: () => void;
  ticker: string;
  sa: SAInfo;
}

const sentimentConfig = {
  positive: { icon: TrendingUp, color: "text-green-400", label: "Positive", bg: "bg-green-950/40 border-green-800" },
  negative: { icon: TrendingDown, color: "text-red-400", label: "Negative", bg: "bg-red-950/40 border-red-800" },
  neutral: { icon: Minus, color: "text-gray-400", label: "Neutral", bg: "bg-gray-800 border-gray-700" },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}

export default function SAModal({ open, onClose, ticker, sa }: SAModalProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/sa-articles?ticker=${ticker}`)
      .then((r) => r.json())
      .then((d) => setArticles(d.articles ?? []))
      .finally(() => setLoading(false));
  }, [open, ticker]);

  const sentiment = sa.newsSentiment ?? "neutral";
  const cfg = sentimentConfig[sentiment];
  const SentimentIcon = cfg.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span>{ticker}</span>
            <span className="text-gray-500 font-normal text-sm">· Seeking Alpha</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Sentiment summary */}
          <div className={`flex items-center gap-3 rounded-lg border p-3 ${cfg.bg}`}>
            <SentimentIcon size={20} className={cfg.color} />
            <div>
              <div className={`font-semibold text-sm ${cfg.color}`}>
                {cfg.label} Sentiment
              </div>
              <div className="text-gray-400 text-xs">Based on most recent article</div>
            </div>
          </div>

          {/* Earnings date */}
          {sa.earningsDays !== null && (
            <div className="flex items-center gap-3 bg-orange-950/40 border border-orange-800 rounded-lg p-3">
              <Calendar size={18} className="text-orange-400 shrink-0" />
              <div>
                <div className="text-orange-300 font-semibold text-sm">
                  Earnings in {sa.earningsDays} day{sa.earningsDays !== 1 ? "s" : ""}
                </div>
                <div className="text-gray-400 text-xs">
                  Avoid new entries — hold through earnings only if intentional
                </div>
              </div>
            </div>
          )}

          {/* Recent articles */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Recent Analysis
            </h3>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                <Loader2 size={14} className="animate-spin" />
                Loading articles...
              </div>
            ) : articles.length === 0 ? (
              <p className="text-gray-500 text-sm">No recent articles found.</p>
            ) : (
              <div className="space-y-2">
                {articles.map((article) => (
                  <a
                    key={article.id}
                    href={`https://seekingalpha.com/article/${article.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-500 rounded-lg p-3 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white leading-snug group-hover:text-blue-300 transition-colors">
                        {article.title}
                        {article.isPaywalled && (
                          <span className="ml-1.5 text-xs text-yellow-600 font-medium">PRO</span>
                        )}
                      </p>
                      {article.publishOn && (
                        <p className="text-xs text-gray-500 mt-1">{timeAgo(article.publishOn)}</p>
                      )}
                    </div>
                    <ExternalLink size={12} className="text-gray-600 group-hover:text-blue-400 shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Link to SA */}
          <a
            href={`https://seekingalpha.com/symbol/${ticker}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg py-2 transition-colors"
          >
            <ExternalLink size={13} />
            View {ticker} on Seeking Alpha
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
