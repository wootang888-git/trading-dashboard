-- Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard → your project → SQL Editor → New query

-- Trade journal
create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  entry_price numeric not null,
  exit_price numeric,
  stop_price numeric,
  shares int not null,
  entry_date date not null,
  exit_date date,
  strategy text default 'momentum',
  notes text,
  user_id uuid references auth.users,   -- nullable: NULL = test data, non-null = owned row
  created_at timestamptz default now()
);

-- Indexes for multi-user performance
create index if not exists idx_trades_user_id on trades(user_id);

-- Enable Row Level Security
alter table trades enable row level security;

-- Testing-safe policy: ownerless rows (user_id IS NULL) visible to anon;
-- once auth is active, rows are scoped to the owning user.
-- ⚠️  DO NOT replace this with "TO authenticated" only — that silently
--     empties the journal when the app uses the anon key without a session.
create policy "Users can manage their own trades"
on trades for all to authenticated, anon
using  ((user_id is null) or (auth.uid() = user_id))
with check ((user_id is null) or (auth.uid() = user_id));

-- Dynamic watchlist (up to 100 tickers)
create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  name text not null,
  strategy text not null default 'momentum',
  user_id uuid references auth.users,   -- nullable: reserved for future multi-user scoping
  created_at timestamptz default now()
);

create index if not exists idx_watchlist_user_id on watchlist(user_id);

alter table watchlist enable row level security;
-- Intentionally wide-open for now (single-user, no sensitive data in watchlist)
create policy "Allow all" on watchlist for all using (true) with check (true);

-- Seed with default 20 tickers
insert into watchlist (ticker, name, strategy) values
  ('META',  'Meta Platforms',    'momentum'),
  ('GOOGL', 'Alphabet',          'momentum'),
  ('NVDA',  'NVIDIA',            'momentum'),
  ('ARM',   'ARM Holdings',      'momentum'),
  ('APP',   'AppLovin',          'momentum'),
  ('FTNT',  'Fortinet',          'momentum'),
  ('PANW',  'Palo Alto Networks','momentum'),
  ('MU',    'Micron Technology', 'momentum'),
  ('RKLB',  'Rocket Lab',        'momentum'),
  ('ASTS',  'AST SpaceMobile',   'momentum'),
  ('LUNR',  'Intuitive Machines','momentum'),
  ('USO',   'US Oil Fund ETF',   'momentum'),
  ('XOM',   'ExxonMobil',        'momentum'),
  ('FANG',  'Diamondback Energy','momentum'),
  ('RTX',   'RTX Corporation',   'momentum'),
  ('NLR',   'Nuclear Energy ETF','etf_rotation'),
  ('IREN',  'Iris Energy',       'momentum'),
  ('NBIS',  'Nebius Group',      'momentum'),
  ('SPY',   'S&P 500 ETF',       'etf_rotation'),
  ('QQQ',   'Nasdaq 100 ETF',    'etf_rotation')
on conflict (ticker) do nothing;

-- Backtest-calibrated indicator weights per strategy
create table if not exists signal_weights (
  id uuid primary key default gen_random_uuid(),
  strategy text not null,
  condition_name text not null,
  win_rate numeric not null default 1.0,
  sample_count int not null default 0,
  computed_at timestamptz default now(),
  unique(strategy, condition_name)
);

alter table signal_weights enable row level security;
create policy "Allow all" on signal_weights for all using (true) with check (true);

-- Signal history log for closed-loop validation
create table if not exists signal_history (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  strategy text not null,
  score int,
  conviction_score int,
  conviction_band text,                 -- 'trade' | 'watch' | 'observe'
  ml_score_pct numeric,                 -- ml_score_pct at time of recording (0–100)
  score_date date,                      -- market date, distinct from recorded_at
  entry_price numeric,
  stop_price numeric,
  recorded_at timestamptz default now()
);

create unique index if not exists signal_history_ticker_date_idx
  on signal_history (ticker, score_date);

alter table signal_history enable row level security;
create policy "Allow all" on signal_history for all using (true) with check (true);

-- Backtest results for strategy tuning
create table if not exists backtest_results (
  id uuid primary key default gen_random_uuid(),
  config jsonb not null,
  summary jsonb not null,
  trades jsonb not null,
  signals jsonb not null,
  run_at timestamptz default now()
);

alter table backtest_results enable row level security;
create policy "Allow all" on backtest_results for all using (true) with check (true);

-- ML scores: one row per ticker per day, with feature snapshot
create table if not exists ml_scores (
  id              uuid primary key default gen_random_uuid(),
  ticker          text not null,
  score_date      date not null,
  ml_score        numeric(6,4) not null,   -- 0.0–1.0 raw probability
  ml_rank         int not null,            -- 1 = highest score today
  ml_score_pct    int not null,            -- 0–100 for display
  ml_percentile_rank int,                  -- 0–100 true percentile within daily scored universe
  feature_snapshot jsonb,                  -- {RSI_14: 67.2, High52w_Pct: -0.03, ...}
  fwd_pe          numeric(8,2),            -- forward P/E ratio (null if unavailable)
  market_cap_b    numeric(8,2),            -- market cap in $B
  garch_vol            numeric(6,4),       -- 1-day forward volatility in % pts (GARCH 1,1)
  gap_pct_live         numeric,            -- actual 9:30 gap vs prev close (pulse_premarket.py)
  pm_vol_ratio_live    numeric,            -- pre-market vol / 20d avg vol (pulse_premarket.py)
  open_930_live        numeric,            -- actual 9:30 open price (for entry recalibration)
  pulse_confirmed_at   timestamptz,        -- when pulse last wrote this row
  computed_at          timestamptz default now(),
  unique(ticker, score_date)
);

alter table ml_scores enable row level security;
create policy "public read ml_scores" on ml_scores for select using (true);
create policy "service write ml_scores" on ml_scores for all using (true);

create index if not exists ml_scores_date_rank_idx on ml_scores (score_date desc, ml_rank asc);

-- Notifications log: deduplication table for Telegram alerts (Phase E)
create table if not exists notifications_log (
  id           uuid primary key default gen_random_uuid(),
  ticker       text not null,
  trigger_type text not null,  -- 'SCALE_IN' | 'EXIT' | 'RSI' | 'EMA_TOUCH' | 'VOL_SPIKE' | 'MACD' | 'BB_SQUEEZE'
  sent_at      timestamptz not null default now(),
  score_date   date not null
);
create index if not exists notifications_log_date_idx on notifications_log (score_date, ticker, trigger_type);
alter table notifications_log enable row level security;
create policy "service role only" on notifications_log for all using (false);

-- ML performance: actual 5-day returns for past discoveries
create table if not exists ml_performance (
  id              uuid primary key default gen_random_uuid(),
  ticker          text not null,
  score_date      date not null,           -- date the score was computed
  check_date      date not null,           -- date return was measured (score_date + 5 bdays)
  ml_score        numeric(6,4) not null,
  ml_rank         int not null,
  return_5d       numeric(8,4),            -- actual 5-day return (e.g. 0.0312 = +3.12%)
  spy_return_5d   numeric(8,4),            -- SPY return same period
  beat_spy        boolean,                 -- return_5d > spy_return_5d
  spy_regime      text,                    -- 'bull' | 'sideways' | 'bear' at check time
  vix_close       numeric(6,2),            -- VIX closing value on check_date
  checked_at      timestamptz default now(),
  unique(ticker, score_date)
);

alter table ml_performance enable row level security;
create policy "public read ml_performance" on ml_performance for select using (true);
create policy "service write ml_performance" on ml_performance for all using (true);

create index if not exists ml_performance_date_rank_idx on ml_performance (score_date desc, ml_rank asc);

-- Daily model health summary: one row per scoring day
-- Answers: regime performance, failure detection, overconfidence monitoring
create table if not exists ml_health (
  id                    uuid primary key default gen_random_uuid(),
  score_date            date not null unique,
  spy_regime            text not null,              -- 'bull' | 'sideways' | 'bear'
  vix_close             numeric(6,2),               -- VIX on score_date
  n_scored              int not null,               -- tickers scored today
  mean_score            numeric(6,4),               -- mean ml_score across all scored tickers
  pct_above_70          numeric(5,2),               -- % scoring >= 0.70 (overconfidence flag)
  rolling_10d_n         int,                        -- # performance outcomes in last 10 trading days
  rolling_10d_beat_spy  numeric(5,2),               -- % that beat SPY (null until 10 days of data)
  rolling_10d_brier     numeric(6,4),               -- mean((ml_score - outcome)^2) — calibration
  top_third_return      numeric(8,4),               -- mean return_5d for top-ranked third
  bot_third_return      numeric(8,4),               -- mean return_5d for bottom-ranked third
  calibration_flag      text,                       -- 'OVERCONFIDENT' | 'UNDERPERFORMING' | 'OK' | null
  breadth_score         numeric,                    -- fraction of tickers with positive gap (0.0–1.0)
  breadth_flag          text,                       -- 'accumulation' | 'neutral' | 'distribution'
  discovery_source      text default 'skipped',     -- 'google_sheet' | 'fallback_static' | 'skipped'
  computed_at           timestamptz default now()
);

alter table ml_health enable row level security;
create policy "public read ml_health"   on ml_health for select using (true);
create policy "service write ml_health" on ml_health for all    using (true);

create index if not exists ml_health_date_idx on ml_health (score_date desc);

-- Sheet-sourced discovery results: tickers outside S&P 500 that passed the Google Sheet
-- conviction filter (col Q = "SCALE ...") and were scored by XGBoost.
create table if not exists ml_discoveries (
  id                  bigserial primary key,
  ticker              text not null,
  score_date          date not null,
  ml_score            numeric(6,4) not null,
  ml_score_pct        int,
  ml_percentile_rank  int,
  conviction_score    int,
  nba_directive       text,
  feature_snapshot    jsonb,
  source              text default 'google_sheet',
  created_at          timestamptz default now(),
  unique(ticker, score_date)
);

alter table ml_discoveries enable row level security;
create policy "public read ml_discoveries"   on ml_discoveries for select using (true);
create policy "service write ml_discoveries" on ml_discoveries for all    using (true);

create index if not exists ml_discoveries_date_idx on ml_discoveries (score_date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Earnings Catalyst Shadow Tracker (migration 003)
-- Hypothesis: volume-confirmed 2-day streak at T-10 predicts pre-earnings drift.
-- Logs both streak-confirmed AND control tickers so a t-test can be run after
-- 30+ earnings events. Zero interference with XGBoost / GARCH pipeline.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists earnings_shadow (
  id                      uuid primary key default gen_random_uuid(),
  ticker                  text not null,
  earnings_date           date not null,
  observation_date        date not null,
  dte                     int,                   -- calendar days to earnings at observation
  timing                  text,                  -- 'AMC' | 'BMO' | 'unknown'
  streak_confirmed        boolean,               -- volume-confirmed 2-day streak: close>open + vol>1.5x avg, both days
  streak_quality_score    float,                 -- 0–1: avg vol ratio normalized, 0 if streak_confirmed=false
  sector_relative_2d      float,                 -- ticker 2d return minus SPY 2d return (market-relative)
  ml_score                float,                 -- from today's ml_scores run
  ml_score_pct            float,
  ml_rank                 int,
  price_at_observation    float,                 -- close on observation_date (entry price for T-10 entry strategy)
  volume_ratio            float,                 -- avg of last 2 days vol / 20d avg vol
  regime                  text,                  -- 'bull' | 'sideways' | 'bear' at observation
  -- retroactive columns (filled after earnings_date passes):
  price_at_t1             float,                 -- close on last trading day before earnings (T-1 exit price)
  price_at_earnings_open  float,                 -- open on first trading day after announcement (gap measurement)
  pre_earnings_return_pct float,                 -- (price_at_t1 - price_at_observation) / price_at_observation * 100
  earnings_gap_pct        float,                 -- (price_at_earnings_open - price_at_t1) / price_at_t1 * 100
  beat_miss               text,                  -- 'beat' | 'miss' | 'inline' | null (populated manually post-event)
  created_at              timestamptz default now(),
  unique (ticker, observation_date)
);

alter table earnings_shadow enable row level security;
create policy "public read earnings_shadow"   on earnings_shadow for select using (true);
create policy "service write earnings_shadow" on earnings_shadow for all    using (true);

create index if not exists earnings_shadow_earnings_date_idx  on earnings_shadow (earnings_date);
create index if not exists earnings_shadow_observation_date_idx on earnings_shadow (observation_date desc);
