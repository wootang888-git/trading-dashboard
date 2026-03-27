-- Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard → your project → SQL Editor → New query

-- Trade journal
create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  entry_price numeric not null,
  exit_price numeric,
  shares int not null,
  entry_date date not null,
  exit_date date,
  strategy text default 'momentum',
  notes text,
  created_at timestamptz default now()
);

-- Enable Row Level Security (makes it safe to use the public anon key)
alter table trades enable row level security;

-- Allow all operations for now (single-user app)
create policy "Allow all" on trades for all using (true) with check (true);

-- Dynamic watchlist (up to 100 tickers)
create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  name text not null,
  strategy text not null default 'momentum',
  created_at timestamptz default now()
);

alter table watchlist enable row level security;
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
