-- Migration 002: Pulse data + conviction history columns
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query

-- ─── ml_scores: pulse columns (written by pulse_premarket.py at 9:15 AM ET) ───
ALTER TABLE ml_scores ADD COLUMN IF NOT EXISTS gap_pct_live      NUMERIC;        -- actual 9:30 gap vs prev close (e.g. 0.018 = +1.8%)
ALTER TABLE ml_scores ADD COLUMN IF NOT EXISTS pm_vol_ratio_live NUMERIC;        -- pre-market vol / 20d avg vol (e.g. 2.3 = 2.3×)
ALTER TABLE ml_scores ADD COLUMN IF NOT EXISTS open_930_live     NUMERIC;        -- actual 9:30 open price (for entry recalibration)
ALTER TABLE ml_scores ADD COLUMN IF NOT EXISTS pulse_confirmed_at TIMESTAMPTZ;  -- when pulse wrote this row

-- ─── ml_health: market breadth (written by pulse_premarket.py) ───────────────
ALTER TABLE ml_health ADD COLUMN IF NOT EXISTS breadth_score NUMERIC;   -- fraction of tickers with positive gap (0.0–1.0)
ALTER TABLE ml_health ADD COLUMN IF NOT EXISTS breadth_flag  TEXT;      -- 'accumulation' | 'neutral' | 'distribution'

-- ─── signal_history: conviction band + date for transition detection ─────────
ALTER TABLE signal_history ADD COLUMN IF NOT EXISTS conviction_band TEXT;    -- 'trade' | 'watch' | 'observe'
ALTER TABLE signal_history ADD COLUMN IF NOT EXISTS ml_score_pct   NUMERIC; -- ml_score_pct at time of recording (0–100)
ALTER TABLE signal_history ADD COLUMN IF NOT EXISTS score_date      DATE;   -- market date (YYYY-MM-DD), distinct from recorded_at

-- Unique index for idempotent daily upsert (one row per ticker per day)
CREATE UNIQUE INDEX IF NOT EXISTS signal_history_ticker_date_idx
  ON signal_history (ticker, score_date);
