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
