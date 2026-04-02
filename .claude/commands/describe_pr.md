---
description: Generate a comprehensive PR description for the current branch
---

# Generate PR Description

You are tasked with generating a comprehensive pull request description.

## Steps

1. **Identify the PR to describe:**
   - Check if the current branch has an associated PR: `gh pr view --json url,number,title,state 2>/dev/null`
   - If no PR exists, list open PRs: `gh pr list --limit 10 --json number,title,headRefName`
   - Ask the user which PR they want to describe

2. **Gather comprehensive PR information:**
   - Get the full diff: `gh pr diff {number}`
   - Get commit history: `gh pr view {number} --json commits`
   - Get PR metadata: `gh pr view {number} --json url,title,number,state,baseRefName`

3. **Analyze the changes thoroughly:**
   - Read through the entire diff carefully
   - For context, read any files that are referenced but not shown in the diff
   - Understand the purpose and impact of each change
   - Identify user-facing changes vs internal implementation details
   - Look for breaking changes or migration requirements

4. **Run verification checks:**
   - Run `npm run test` and note pass/fail
   - Run `npm run lint` and note any issues
   - Run `npm run build` to verify it compiles

5. **Generate the description using this template:**

```markdown
## What does this PR do?
[Clear explanation of the problem being solved and the approach taken]

## Changes Made
- [Bullet list of key changes]
- [Focus on the "why" not just the "what"]

## User-Facing Impact
[How does this affect the end user? If none, say "No user-facing changes"]

## Technical Details
[Architecture decisions, trade-offs, notable implementation details]

## How to Test
- [ ] [Step 1 to verify the feature works]
- [ ] [Step 2]
- [ ] [Edge case to test]

## Automated Checks
- [x] Tests pass (`npm run test`)
- [x] Linting passes (`npm run lint`)
- [x] Build succeeds (`npm run build`)

## Notes
[Any additional context, follow-up work, or caveats]
```

6. **Update the PR:**
   - Show the description to the user for review
   - Upon approval: `gh pr edit {number} --body "..."`

## Important Notes
- Be thorough but concise — descriptions should be scannable
- Focus on the "why" as much as the "what"
- Include any breaking changes or migration notes prominently
