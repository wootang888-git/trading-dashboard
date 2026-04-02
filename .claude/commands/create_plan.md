---
description: Create a comprehensive implementation plan through research and iteration
---

# Create Implementation Plan

You are tasked with creating a detailed, well-researched implementation plan.

## Process

### Step 1: Context Gathering
- Read all mentioned files IMMEDIATELY and FULLY before doing anything else
- Spawn parallel research tasks using specialized agents:
  - `codebase-locator`: Find where relevant code lives
  - `codebase-pattern-finder`: Find existing patterns to reuse
  - `web-search-researcher`: Research external APIs, libraries, or approaches

### Step 2: Research & Discovery
- Conduct parallel investigations into different aspects of the problem
- Verify your understanding through code inspection
- Present findings with design options to the user
- Ask clarifying questions before proceeding

### Step 3: Plan Structure Development
- Create an outline with implementation phases
- Seek approval on the structure before writing details
- Identify success criteria (automated and manual)

### Step 4: Detailed Plan Writing
Create a comprehensive plan with:

```markdown
# Plan: [Feature/Fix Name]

## Context
[Why this change is needed, what problem it solves]

## Approach
[High-level strategy and key decisions]

## Implementation Phases

### Phase 1: [Name]
- [ ] Step 1
- [ ] Step 2

**Automated Verification:**
- Run: `npm run test`
- Run: `npm run lint`

**Manual Verification:**
- [ ] Test X in UI

### Phase 2: [Name]
[Continue pattern...]

## Files to Modify
- `path/to/file.ts` — what changes
- `path/to/other.ts` — what changes

## Open Questions
[None — all questions must be resolved before finalizing]
```

### Step 5: Review & Iterate
- Present the plan to the user
- Iterate based on feedback
- Ensure NO OPEN QUESTIONS remain before finalizing

## Key Principles

- **Skeptical**: Question vague requirements, verify facts through code
- **Interactive**: Seek incremental feedback rather than presenting full plan at once
- **Thorough**: Read complete files, use specific file:line references, define measurable criteria
- **No Open Questions**: Every decision must be resolved before finalizing

## Critical Requirement

**No Open Questions in Final Plan** — every decision must be resolved before finalization. If something is unclear, ask the user before writing the plan.
