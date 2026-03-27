Test the trading signal pipeline end-to-end and report results.

Steps:
1. Check if the local dev server is running by hitting http://localhost:3000/api/signals. If it's not running, start it with `npm run dev` in the background.
2. Fetch the signals from the local API: `curl -s http://localhost:3000/api/signals`
3. Parse and display the results in a clean table showing:
   - Market condition (bull/bear/neutral) and what it means for trading today
   - Top 5 signals by score with: ticker, score/10, strength, price, RSI, volume ratio
   - Count of strong (≥8), moderate (5-7), and watch (<5) setups
4. Flag any tickers that returned null/empty data (Yahoo Finance fetch failures)
5. Cross-check the #1 signal: confirm the entry note and stop loss note make sense given the current price
6. Tell the user whether market conditions support taking trades today (bear = reduce size or stay flat per their rules)

The watchlist is defined in lib/watchlist.ts.
The signal scoring logic is in lib/signals.ts.
