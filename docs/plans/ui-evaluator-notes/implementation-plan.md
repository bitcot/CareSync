# Implementation Plan — UI Evaluator Notes (chart captions only)

> **PLAN_ID:** `ui-evaluator-notes`

The operative implementation plan lives at:

**`~/.claude/plans/concurrent-tumbling-taco.md`** (Claude Code session plan).

This file is the ADLC artifact pointer — see that file for:

- Approach (one-new-primitive + caption props on charts + page-level JSX
  caption under the Population scatter)
- Critical files to create (4 new) and modify (10 modified)
- Existing utilities reused (`clsx`, `Badge.tsx` props pattern, design tokens)
- Verification (unit tests, typecheck, Playwright e2e)
- Out-of-scope (no page-level notes — chart captions only)

## Slice status (revised)

After the user pulled back the page-level "Why this matters" notes during
review, the slice shipped chart-caption-only:

- [x] InfoNote primitive + test — `apps/web/src/components/ui/InfoNote.{tsx,test.tsx}`
- [x] Optional `caption` prop on 4 chart components
- [x] Captions passed from owning pages to charts (3 charts; Population
  uses internal RiskScatterChart, caption rendered directly under it)
- [x] Minimal test assertions in 3 chart-page tests (Quality, Population,
  Governance)
- [x] ADLC artifacts — `prd.md`, `issues.md`, this pointer file
- [x] Playwright e2e check (3 tests) — `apps/web/e2e/evaluator-notes.spec.ts`
- [x] Full verification (build, all 280 unit tests, 3 e2e tests)

## Out of scope (final)

- Page-level InfoNotes under h1/h2 page headers (removed per user)
- Pages without charts (PatientDetail, CostROI, Sdoh, TaskManagement)
- Hover-only tooltips (rejected in initial scope)