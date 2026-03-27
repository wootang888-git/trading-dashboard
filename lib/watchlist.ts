export const WATCHLIST = [
  // Tech / Growth
  { ticker: "META",  name: "Meta Platforms",   strategy: "momentum" },
  { ticker: "GOOGL", name: "Alphabet",          strategy: "momentum" },
  { ticker: "NVDA",  name: "NVIDIA",            strategy: "momentum" },
  { ticker: "ARM",   name: "ARM Holdings",      strategy: "momentum" },
  { ticker: "APP",   name: "AppLovin",          strategy: "momentum" },
  { ticker: "FTNT",  name: "Fortinet",          strategy: "momentum" },
  { ticker: "PANW",  name: "Palo Alto Networks",strategy: "momentum" },
  { ticker: "MU",    name: "Micron Technology", strategy: "momentum" },

  // Space / Speculative
  { ticker: "RKLB",  name: "Rocket Lab",        strategy: "momentum" },
  { ticker: "ASTS",  name: "AST SpaceMobile",   strategy: "momentum" },
  { ticker: "LUNR",  name: "Intuitive Machines", strategy: "momentum" },

  // Energy / Commodities
  { ticker: "USO",   name: "US Oil Fund ETF",   strategy: "momentum" },
  { ticker: "XOM",   name: "ExxonMobil",        strategy: "momentum" },
  { ticker: "FANG",  name: "Diamondback Energy",strategy: "momentum" },

  // Defense / Industrial
  { ticker: "RTX",   name: "RTX Corporation",   strategy: "momentum" },
  { ticker: "NLR",   name: "Nuclear Energy ETF",strategy: "etf_rotation" },

  // AI / Semiconductors
  { ticker: "IREN",  name: "Iris Energy",       strategy: "momentum" },
  { ticker: "NBIS",  name: "Nebius Group",      strategy: "momentum" },

  // Broad Market ETFs
  { ticker: "SPY",   name: "S&P 500 ETF",       strategy: "etf_rotation" },
  { ticker: "QQQ",   name: "Nasdaq 100 ETF",    strategy: "etf_rotation" },
] as const;

export type Ticker = typeof WATCHLIST[number]["ticker"];
export type Strategy = "momentum" | "mean_reversion" | "etf_rotation";
