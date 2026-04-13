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
  entry_price numeric,
  stop_price numeric,
  recorded_at timestamptz default now()
);

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
  feature_snapshot jsonb,                  -- {RSI_14: 67.2, High52w_Pct: -0.03, ...}
  fwd_pe          numeric(8,2),            -- forward P/E ratio (null if unavailable)
  market_cap_b    numeric(8,2),            -- market cap in $B
  computed_at     timestamptz default now(),
  unique(ticker, score_date)
);

alter table ml_scores enable row level security;
create policy "public read ml_scores" on ml_scores for select using (true);
create policy "service write ml_scores" on ml_scores for all using (true);

create index if not exists ml_scores_date_rank_idx on ml_scores (score_date desc, ml_rank asc);

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
  checked_at      timestamptz default now(),
  unique(ticker, score_date)
);

alter table ml_performance enable row level security;
create policy "public read ml_performance" on ml_performance for select using (true);
create policy "service write ml_performance" on ml_performance for all using (true);

create index if not exists ml_performance_date_rank_idx on ml_performance (score_date desc, ml_rank asc);
