# PRD — UI Evaluator Notes (chart-caption only)

> **PLAN_ID:** `ui-evaluator-notes` · **Status:** Draft → Implemented
> **Author:** Manjula / Bitcot · 2026-07-09
> **Upstream artifacts:** `docs/HANDOFF.md §4` (design tokens), the chart
> components (`PopulationScatterChart.tsx`, `ParityRadarChart.tsx`,
> `QualityGaugeChart.tsx`, `ConfidenceChart.tsx`) and
> `pages/Population.tsx`'s internal `RiskScatterChart`.
> **Operative plan:** `~/.claude/plans/concurrent-tumbling-taco.md`.

---

## Problem Statement

CareSync AI is entering HL7 judge review. External evaluators have ~90 s per
screen to assess rubric pillars P1–P9. The current chart components paint
their visuals but provide zero context — a judge looking at the population
scatter sees dots and axis labels, but no on-canvas explanation of *what
the axes mean, what the quadrants signal, or how to read the data*.

## Solution

**Add a small caption under each chart canvas.** The pattern is: small,
always-visible `ⓘ` glyph + 1-line caption, rendered immediately under the
canvas (no interaction required, no hover, no footnote).

**Mechanism:** a new `components/ui/InfoNote.tsx` primitive + an optional
`caption?: ReactNode` prop on the four chart components. Pages that own a
chart pass the caption text; charts without a caption are byte-identical to
their pre-InfoNote version.

### Scope (revised after user feedback)

**Initial scope was 7 page-level "Why this matters" notes + 4 chart
captions.** During user review, the page-level notes were pulled back —
they cluttered the page headers without enough room for one-line text at
the available widths, and the captions read more naturally next to their
own chart than next to the page title.

**Final scope: chart captions only.**

| Chart | Owner page | Caption |
|---|---|---|
| Population scatter | `Population.tsx` (inline under internal `RiskScatterChart`; `components/PopulationScatterChart.tsx` is not imported by this page) | "Each dot = one patient. X = risk score, Y = urgency." |
| Parity radar | `Governance.tsx` | "Risk-score parity across age/sex/race. ≤ 1.0 = no disparity." |
| Confidence distribution | `Governance.tsx` | "Per-agent self-reported confidence on this analysis." |
| HEDIS quality gauge | `Quality.tsx` | "HEDIS completion vs. NCQA target; below → AI fires FHIR Tasks." |

### Pages out of scope

The following pages had a page-level InfoNote that was removed in the
revision:

- `PatientDetail.tsx` (no chart; agent graph is animated and self-evident)
- `Population.tsx` (page-level note removed; chart caption kept)
- `Governance.tsx` (page-level note removed; both chart captions kept)
- `Quality.tsx` (page-level note removed; gauge caption kept)
- `CostROI.tsx` (no chart)
- `Sdoh.tsx` (no chart)
- `TaskManagement.tsx` (no chart)

## Acceptance Bar

For each of the 4 charts in scope, an evaluator landing on that page at any
time should see:

1. The chart canvas (existing behavior, unchanged).
2. A clearly-visible `ⓘ` glyph plus a 1-line caption directly under the
   canvas.
3. The caption uses domain language already present in `HANDOFF.md` /
   `DESIGN_SPEC.md` — no invented claims, no fabricated statistics.
4. The note does **not** change any other page chrome (KPIs, lists,
   controls, headers); only the area directly under the chart canvas.

## Constraint: No Content Invention

All captions reuse terminology already in the codebase:

- "FHIR R4", "FHIR Task", "FHIR resource ID" — HANDOFF.md §7
- "HEDIS" measures — HANDOFF.md §3 Option B
- Demographic parity axes (age, sex, race, ethnicity) — `parityScore.ts`
- "Confidence distribution" 4-bucket model — `confidenceChartGeometry.ts`
- "risk score (0–100)" and "urgency" axes — `Population.test.tsx`

## Files Touched

### Created
- `apps/web/src/components/ui/InfoNote.tsx`
- `apps/web/src/components/ui/InfoNote.test.tsx`
- `apps/web/e2e/evaluator-notes.spec.ts`
- `docs/plans/ui-evaluator-notes/{prd.md, issues.md, implementation-plan.md}`

### Modified
- `apps/web/src/components/PopulationScatterChart.tsx` (caption prop)
- `apps/web/src/components/ParityRadarChart.tsx` (caption prop)
- `apps/web/src/components/QualityGaugeChart.tsx` (caption prop)
- `apps/web/src/components/ConfidenceChart.tsx` (caption prop)
- `apps/web/src/pages/Population.tsx` (inline caption under scatter)
- `apps/web/src/pages/Governance.tsx` (pass caption= to 2 charts)
- `apps/web/src/pages/Quality.tsx` (pass caption= to gauge)
- 4 chart test files (caption prop tests)
- 3 page test files (kept chart-caption assertions only)

## Verification

1. Vitest unit tests stay green (280 → 280 passing).
2. TypeScript typecheck (`tsc -p tsconfig.app.json --noEmit`) clean.
3. Playwright e2e (`apps/web/e2e/evaluator-notes.spec.ts`) — 3 tests, one
   per chart-owning page, all passing.
4. Visual sanity: each chart renders the note on first paint, no
   interaction required.