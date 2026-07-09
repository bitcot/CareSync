# Issues — UI Evaluator Notes (chart captions only)

> **PLAN_ID:** `ui-evaluator-notes`
> Mirror of the file-by-file change list from the operative plan
> (`~/.claude/plans/concurrent-tumbling-taco.md`), revised after the
> page-level "Why this matters" notes were pulled back per user feedback.
> Captions now live ONLY under their chart canvas — not in the page header.

## Issue 1 — New `InfoNote` UI primitive + unit test
- Add `apps/web/src/components/ui/InfoNote.tsx` (InfoNote with `label`,
  `children`, `tone`, `testId`, `className` props; design-token aligned).
- Add `apps/web/src/components/ui/InfoNote.test.tsx` (4 cases).
- **Acceptance:** `npx vitest run src/components/ui/InfoNote.test.tsx` passes.

## Issue 2 — Add optional `caption` prop to 4 chart components
- `apps/web/src/components/PopulationScatterChart.tsx`
- `apps/web/src/components/ParityRadarChart.tsx`
- `apps/web/src/components/QualityGaugeChart.tsx`
- `apps/web/src/components/ConfidenceChart.tsx`
- Each gains `caption?: ReactNode` and renders an `<InfoNote>` under the
  canvas only when supplied. When omitted, render is byte-identical.
- **Acceptance:** existing chart tests still pass; +1 caption test per chart.

## Issue 3 — Pass captions from owning pages to charts
- `pages/Population.tsx` → inline `<InfoNote>` rendered under the page's
  internal `RiskScatterChart` (Population does not import
  `components/PopulationScatterChart.tsx`).
- `pages/Quality.tsx` → `QualityGaugeChart caption=`
- `pages/Governance.tsx` → `ParityRadarChart caption=` + `ConfidenceChart caption=`
- **Acceptance:** the "Reading this chart" label appears under each chart
  in tests.

## Issue 4 — Minimal test assertions in 3 page tests (chart pages only)
- `Quality.test.tsx`, `Population.test.tsx`, `Governance.test.tsx` — each
  asserts `getByText('Reading this chart')` is present.
- **Acceptance:** each page test stays green.

## Issue 5 — Playwright e2e check (3 pages, one per chart)
- `apps/web/e2e/evaluator-notes.spec.ts`
- Visits `/population`, `/governance`, `/quality` and asserts the chart
  caption is visible on each.
- **Acceptance:** 3 tests pass.

## Issue 6 — ADLC artifacts (this file)
- `docs/plans/ui-evaluator-notes/prd.md` (✓)
- `docs/plans/ui-evaluator-notes/issues.md` (this file)
- `docs/plans/ui-evaluator-notes/implementation-plan.md` (pointer to plan)

## Out of scope (revised)

- Page-level "Why this matters" InfoNotes under h1/h2 page headers — pulled
  back after user review; cluttered page chrome without enough width for
  1-line text on all screens.
- Pages without charts (PatientDetail, CostROI, Sdoh, TaskManagement) — no
  InfoNote rendered.
- Hover-only tooltips — rejected in initial scope; remains rejected.