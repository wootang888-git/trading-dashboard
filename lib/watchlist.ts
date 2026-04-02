export type Strategy = "momentum" | "mean_reversion" | "etf_rotation" | "ema_pullback";

export interface WatchlistEntry {
  ticker: string;
  name: string;
  strategy: Strategy;
}

// Maps each ticker to its primary sector ETF for relative strength comparison.
// Sector RS vs SPY tells you if the stock is outperforming the broad market;
// sector RS tells you if it's leading within its own industry group.
export const SECTOR_ETF: Record<string, string> = {
  // Tech / Software
  META:  "XLK",
  GOOGL: "XLK",
  NVDA:  "XLK",
  ARM:   "XLK",
  APP:   "XLK",
  FTNT:  "XLK",
  PANW:  "XLK",
  MU:    "XLK",
  IREN:  "XLK",
  NBIS:  "XLK",
  PLTR:  "XLK",
  // Space / Aerospace & Defense
  RKLB:  "ITA",
  ASTS:  "ITA",
  LUNR:  "ITA",
  RTX:   "ITA",
  // Energy
  USO:   "XLE",
  XOM:   "XLE",
  FANG:  "XLE",
  NLR:   "XLE",
  // Fintech / Finance
  SOFI:  "XLF",
  // Crypto-adjacent
  MSTR:  "QQQ",
  // Broad market ETFs — compare vs themselves (no sector drift)
  SPY:   "SPY",
  QQQ:   "QQQ",
};

// Static fallback — used when Supabase is unavailable or empty
export const WATCHLIST: WatchlistEntry[] = [
  // Tech / Growth
  { ticker: "META",  name: "Meta Platforms",    strategy: "momentum" },
  { ticker: "GOOGL", name: "Alphabet",           strategy: "momentum" },
  { ticker: "NVDA",  name: "NVIDIA",             strategy: "momentum" },
  { ticker: "ARM",   name: "ARM Holdings",       strategy: "momentum" },
  { ticker: "APP",   name: "AppLovin",           strategy: "momentum" },
  { ticker: "FTNT",  name: "Fortinet",           strategy: "momentum" },
  { ticker: "PANW",  name: "Palo Alto Networks", strategy: "momentum" },
  { ticker: "MU",    name: "Micron Technology",  strategy: "momentum" },
  // Space / Speculative
  { ticker: "RKLB",  name: "Rocket Lab",         strategy: "momentum" },
  { ticker: "ASTS",  name: "AST SpaceMobile",    strategy: "momentum" },
  { ticker: "LUNR",  name: "Intuitive Machines", strategy: "momentum" },
  // Energy / Commodities
  { ticker: "USO",   name: "US Oil Fund ETF",    strategy: "momentum" },
  { ticker: "XOM",   name: "ExxonMobil",         strategy: "momentum" },
  { ticker: "FANG",  name: "Diamondback Energy", strategy: "momentum" },
  // Defense / Industrial
  { ticker: "RTX",   name: "RTX Corporation",    strategy: "momentum" },
  { ticker: "NLR",   name: "Nuclear Energy ETF", strategy: "etf_rotation" },
  // AI / Semiconductors
  { ticker: "IREN",  name: "Iris Energy",        strategy: "momentum" },
  { ticker: "NBIS",  name: "Nebius Group",       strategy: "momentum" },
  // Broad Market ETFs
  { ticker: "SPY",   name: "S&P 500 ETF",        strategy: "etf_rotation" },
  { ticker: "QQQ",   name: "Nasdaq 100 ETF",     strategy: "etf_rotation" },
  // Mean Reversion — high-beta oscillators
  { ticker: "PLTR",  name: "Palantir",            strategy: "mean_reversion" },
  { ticker: "SOFI",  name: "SoFi Technologies",  strategy: "mean_reversion" },
  { ticker: "MSTR",  name: "MicroStrategy",      strategy: "mean_reversion" },
];
