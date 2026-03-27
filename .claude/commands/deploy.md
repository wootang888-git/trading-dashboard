Run a full deploy of the trading dashboard to production.

Steps:
1. Run `npx tsc --noEmit` to check for TypeScript errors. If there are errors, fix them before continuing.
2. Run `git status` to see what changed.
3. Stage only the relevant changed files (never use `git add -A` blindly — check for .env files first).
4. Write a concise commit message summarizing what changed and why.
5. Run `git push` to push to GitHub. Vercel auto-deploys from the main branch.
6. Confirm the push succeeded and tell the user the live URL: https://tradingdashboard-theta.vercel.app
7. Tell the user to wait ~2 minutes for Vercel to finish building.

Important rules:
- Never commit .env.local or any file containing secrets
- Never use --no-verify
- If TypeScript errors exist, fix them first — do not deploy broken code
