Add a new feature to the trading dashboard. The user will describe what they want — plan and build it.

Context about this project:
- Stack: Next.js 16 App Router, TypeScript, Tailwind CSS, shadcn/ui components
- Database: Supabase (see lib/supabase.ts for client and Trade type)
- Market data: yahoo-finance2 v3 instantiated as `new YF()` (see lib/yahoo.ts)
- Signal engine: lib/signals.ts — scoring logic for momentum breakout strategy
- Watchlist: lib/watchlist.ts — 20 tickers (META, GOOGL, NVDA, RKLB, etc.)
- UI components live in components/ — use shadcn Card, Badge, Table where possible
- Pages live in app/ using Next.js App Router file conventions
- Dark theme throughout: bg-gray-950 background, gray-900 cards, white text

User's trading rules to respect when building features:
- Swing trading only (2-10 day holds) — not day trading
- Max 2% account risk per trade
- Max 3 open positions at once
- No trades when SPY is below its 20-day MA (bear condition)
- Entry: buy stop $0.05 above resistance on volume > 1.5x average
- Stop loss: below recent swing low
- Exit: 2:1 reward/risk target, trailing stop using 10-day MA for the remaining half

Steps:
1. Read the relevant existing files before writing any new code
2. Reuse existing components and utilities — don't duplicate logic already in lib/
3. If the feature needs a new database table, write the SQL and remind the user to run it in Supabase SQL Editor
4. Build the feature, run TypeScript check, then run /deploy when done
