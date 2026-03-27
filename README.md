# Trading Dashboard

A mobile-responsive swing trading signal dashboard for retail investors. Scans a watchlist of US stocks and ETFs daily, scores each setup using momentum breakout signals, and tracks trades in a built-in journal.

## Stack

- **Next.js 14** + TypeScript + Tailwind CSS
- **Supabase** — trade journal database
- **Yahoo Finance** — free market data (15-min delayed)
- **Vercel** — hosting

## Strategies

- Momentum Breakout (primary)
- Mean Reversion on quality stocks
- ETF Sector Rotation

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in your Supabase keys
2. Run `npm install`
3. Run `npm run dev` → open [http://localhost:3000](http://localhost:3000)
4. Run the SQL in `supabase/schema.sql` in your Supabase SQL Editor
