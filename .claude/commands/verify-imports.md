Audit all @/lib/* imports in this Next.js project and verify each resolves to a committed file.

Steps:
1. Find all unique @/lib/<name> import patterns across the app:
   `grep -r 'from "@/lib/' app/ components/ lib/ --include="*.ts" --include="*.tsx" -h 2>/dev/null | sort -u`
2. For each unique lib module found, check two things:
   a. Does the file exist on disk? (`ls lib/<name>.ts` or `lib/<name>/index.ts`)
   b. Is it tracked by git? (`git ls-files lib/<name>.ts`)
3. Report a table:
   | Import       | File exists | Git-tracked | Status                      |
   |--------------|-------------|-------------|-----------------------------|
   | @/lib/finnhub | ✅          | ❌          | BROKEN — not committed      |
   | @/lib/signals | ✅          | ✅          | ✅ OK                       |
4. Flag any row where git-tracked is ❌ as a build-breaking issue and provide the exact
   `git add lib/<name>.ts` command to fix it.
5. If all imports are tracked, report: "✅ All @/lib imports are committed — safe to deploy."

Context: This check exists because lib/finnhub.ts was written and used in production imports
but never committed to git, causing a Vercel build failure with "Module not found" (2026-04-22).
Run this before every deploy to production.
