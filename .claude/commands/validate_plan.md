---
description: Validate implementation against plan, verify success criteria, identify issues
---

# Validate Plan

You are tasked with validating that an implementation plan was correctly executed, verifying all success criteria and identifying any deviations or issues.

## Initial Setup

When invoked:
1. **Determine context** — Are you in an existing conversation or starting fresh?
   - If existing: Review what was implemented in this session
   - If fresh: Discover what was done through git and codebase analysis

2. **Locate the plan**:
   - If plan path provided, use it
   - Otherwise ask the user which plan to validate

3. **Gather implementation evidence**:
   ```bash
   git log --oneline -n 20
   git diff HEAD~N..HEAD  # Where N covers implementation commits
   npm run test
   npm run lint
   ```

## Validation Process

### Step 1: Context Discovery

1. **Read the implementation plan** completely
2. **Identify what should have changed**:
   - List all files that should be modified
   - Note all success criteria (automated and manual)
   - Identify key functionality to verify

3. **Spawn parallel research tasks**:
   ```
   Task 1 — Verify code changes:
   Find all modified files related to [feature].
   Compare actual changes to plan specifications.
   Return: File-by-file comparison of planned vs actual

   Task 2 — Verify test coverage:
   Check if tests were added/modified as specified.
   Run test commands and capture results.
   Return: Test status and any missing coverage
   ```

### Step 2: Systematic Validation

For each phase in the plan:

1. **Check completion status** — Look for checkmarks (- [x]), verify code matches
2. **Run automated verification** — Execute each command from the plan
3. **Assess manual criteria** — List what needs manual testing
4. **Think deeply about edge cases** — Error handling, missing validations, regressions

### Step 3: Generate Validation Report

```markdown
## Validation Report: [Plan Name]

### Implementation Status
✓ Phase 1: [Name] - Fully implemented
✓ Phase 2: [Name] - Fully implemented
⚠️ Phase 3: [Name] - Partially implemented (see issues)

### Automated Verification Results
✓ Build passes: `npm run build`
✓ Tests pass: `npm run test`
✗ Linting issues: `npm run lint` (3 warnings)

### Code Review Findings

#### Matches Plan:
- [List what was correctly implemented]

#### Deviations from Plan:
- [List differences, noting if they're improvements or problems]

#### Potential Issues:
- [List concerns or risks]

### Manual Testing Required:
1. UI functionality:
   - [ ] Verify [feature] appears correctly
   - [ ] Test error states with invalid input

### Recommendations:
- [Actionable next steps]
```

## Important Guidelines

1. **Be thorough but practical** — Focus on what matters
2. **Run all automated checks** — Don't skip verification commands
3. **Document everything** — Both successes and issues
4. **Think critically** — Question if the implementation truly solves the problem
5. **Consider maintenance** — Will this be maintainable long-term?

## Validation Checklist

Always verify:
- [ ] All phases marked complete are actually done
- [ ] Automated tests pass
- [ ] Code follows existing patterns
- [ ] No regressions introduced
- [ ] Error handling is robust
- [ ] Manual test steps are clear
