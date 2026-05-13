-- Migration 003: Earnings Catalyst Shadow Tracker
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS / IF NOT EXISTS guards)

create table if not exists earnings_shadow (
  id                      uuid primary key default gen_random_uuid(),
  ticker                  text not null,
  earnings_date           date not null,
  observation_date        date not null,
  dte                     int,
  timing                  text,
  streak_confirmed        boolean,
  streak_quality_score    float,
  sector_relative_2d      float,
  ml_score                float,
  ml_score_pct            float,
  ml_rank                 int,
  price_at_observation    float,
  volume_ratio            float,
  regime                  text,
  price_at_t1             float,
  price_at_earnings_open  float,
  pre_earnings_return_pct float,
  earnings_gap_pct        float,
  beat_miss               text,
  created_at              timestamptz default now(),
  unique (ticker, observation_date)
);

alter table earnings_shadow enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'earnings_shadow' and policyname = 'public read earnings_shadow'
  ) then
    create policy "public read earnings_shadow"   on earnings_shadow for select using (true);
    create policy "service write earnings_shadow" on earnings_shadow for all    using (true);
  end if;
end $$;

create index if not exists earnings_shadow_earnings_date_idx    on earnings_shadow (earnings_date);
create index if not exists earnings_shadow_observation_date_idx on earnings_shadow (observation_date desc);
