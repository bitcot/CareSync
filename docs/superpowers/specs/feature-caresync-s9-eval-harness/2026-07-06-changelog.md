# Changelog: S9 — Evaluation harness + report

**Type:** Feature

**Branch:** `feature/caresync-s9-eval-harness` (branched off `main` at the S8 merge, `d219b9c`)

**Date:** 2026-07-06

## Summary

Delivers the P6 lever (GD8): a runnable `npm run eval` that scores the four agents (Care Gap, Risk,
SDOH, Action Planner) against a committed, dev-labeled ground-truth set — 6 curated patients + 10
deterministic procedural patients — and produces a Markdown methodology report with a mandatory
error-analysis section, plus a JSON summary consumed by S8's previously-placeholder governance eval
tile. Ships explicitly as a **dev-labeled ~P6 4 baseline** (not clinician-validated), with a
clinician-override slot on every label row that upgrades it to 5 with no code change.

## Changes Made

### Backend — Ground-truth labels + Seam 4 pure metrics (A1, A2)

- **Before:** No eval labels, no metric-computation module.
- **After:** `data/eval/labels.json` — 16 rows (`ALL_PATIENTS` from `seed-patients.ts` + `pop-0001`
  through `pop-0010` from `population.ts`'s deterministic generator), each carrying `source: "dev"`
  and a `clinicianOverride: null` slot, plus a `_meta` block disclosing the GD8 dev-labeled status and
  known limitations. **Plan-vs-reality correction**: the plan's "~10 Synthea patients" doesn't exist in
  this codebase — there is no real Synthea import, only `population.ts`'s procedural generator — so the
  10 rows are `pop-XXXX` ids, the same disclosed substitution S5 already established. Ground truth for
  Care Gap is restricted to conditions with an established Observation/LOINC convention already present
  elsewhere in the codebase (diabetes→HbA1c, CHF→BNP, CKD→eGFR); everything else is honestly left `null`
  ("no confident ground truth") rather than guessed.
  `apps/api/src/eval/computeMetrics.ts` — pure `computeMetrics(labels, findings)` → sensitivity/
  specificity/PPV for Care Gap + Risk, an agreement rate for SDOH, qualitative notes for Action Planner.
  TDD: hand-built 5-patient fixture, exact-value assertions, independently hand-recomputed twice
  (once per phase reviewer) with matching results.
- **Files changed:** `data/eval/labels.json`, `apps/api/src/eval/{computeMetrics,computeMetrics.test}.ts`.

### Backend — `npm run eval` harness + report (B1)

- **Before:** No way to run the four-agent pipeline over the labeled set and no eval report existed.
- **After:** `apps/api/src/scripts/eval.ts` (wired as `npm run eval`, mirroring `import-fhir.ts`'s
  `tsx`-script convention): for each labeled patient, reads `analysis_cache` if present, else runs the
  S3 `orchestrate()` generator live and applies the existing `validateCitations` (Seam 2) to assemble
  the same validated `AnalysisResultJson`-shaped findings the product actually shows users — not raw,
  unvalidated agent output. Scores via `computeMetrics` + a new pure `computeErrorAnalysis` (TDD,
  `apps/api/src/eval/errorAnalysis.ts`) extracting the specific per-patient misses/false-positives the
  aggregated confusion matrix collapses into counts. Writes `docs/eval-report.md` (methodology + a
  **mandatory error-analysis section** naming specific patients and predicted-vs-labeled detail — the
  plan's explicit 4→5 lever) and `docs/eval-report.json` at the exact `EVAL_REPORT_PATH`
  `governance/service.ts` already reads (S8 shipped this endpoint with a documented placeholder path;
  S9 is the first slice to actually populate it). Per-patient failures are caught and reported as data
  gaps rather than crashing the run.
- **Files changed:** `apps/api/src/scripts/eval.ts`, `apps/api/src/eval/{errorAnalysis,errorAnalysis.test}.ts`,
  `apps/api/package.json` (`eval` script), root `package.json` (`eval` script passthrough).

### Verification — Real live run + cross-slice proof

- `npm run eval` was run for real against the local Docker HAPI stack with live LLM calls (not mocked):
  16/16 labeled patients scored, 0 failures. Result: Care Gap sensitivity 100%, Risk sensitivity 100%,
  SDOH agreement 100%, but Risk specificity only 30.8% (9 false positives) and Care Gap specificity 0%
  off a single negative example — an honest finding about the live agents' behavior against a dev-labeled
  baseline, disclosed in the report itself, not smoothed over.
- Cross-slice consumption (S9→S8) proved live, not by description: `getEvalSummary()` called directly
  against the real DB with the real generated file on disk returned `{available: true, summary: {...}}`.
- **Real, reproduced operational hazard**: a pre-existing S8 test (`routes/governance.test.ts`) deletes
  `docs/eval-report.json` in its `afterEach` as part of its own fixture cleanup. Running the full
  `apps/api` Jest suite after `npm run eval` destroys the JSON evidence file. Mitigated by committing the
  generated artifacts (satisfying the plan's own C1 requirement) so `git checkout -- docs/eval-report.json`
  recovers it, and documented inline in `eval.ts`'s doc comment.

## Files Modified

| File | Change Description |
|------|---------------------|
| `data/eval/labels.json` | New — dev-labeled ground truth, 16 patients, clinician-override slots |
| `apps/api/src/eval/computeMetrics.ts` | New — Seam 4 pure metric computation |
| `apps/api/src/eval/computeMetrics.test.ts` | New — fixed-fixture TDD tests |
| `apps/api/src/eval/errorAnalysis.ts` | New — pure per-patient miss/false-positive extraction |
| `apps/api/src/eval/errorAnalysis.test.ts` | New — fixed-fixture TDD tests |
| `apps/api/src/scripts/eval.ts` | New — `npm run eval` CLI harness |
| `apps/api/package.json` | `eval` script |
| `package.json` | `eval` script passthrough |
| `docs/eval-report.md` | New — generated methodology report + error analysis, committed as evidence |
| `docs/eval-report.json` | New — generated JSON summary, committed as evidence, consumed by S8's tile |
| `docs/plans/caresync-ai/{implementation-plan,issues}.md` | S9 task/AC checkboxes corrected to done |
| `docs/plans/caresync-ai/{verification-s9,review-s9}.md` | S9 verification + code-review gates recorded |

## Commits

| Commit | Description |
|--------|-------------|
| `da61229` | feat(S9): A — eval label file + Seam 4 computeMetrics |
| `206d924` | feat(S9): B — npm run eval harness + report |
| `08942c6` | docs(S9): verification-before-completion pass |
| `73abcce` | fix(S9): export HIGH_RISK_LEVELS instead of duplicating it |
| `0527d1e` | docs(S9): two-axis code-review artifact (Standards + Spec) |

## Testing & Verification

**How to verify this works:**
- `docker compose up -d hapi-fhir && npm run fhir:import` (fresh seed)
- `npm run eval` (repo root) — writes `docs/eval-report.md` + `docs/eval-report.json`
- `cd apps/api && npx jest --runInBand`
- `cd apps/web && npx vitest run`
- `npx tsc --noEmit` in both `apps/api` and `apps/web`
- `npm run lint --workspace apps/api` / `--workspace apps/web`

**Test results (this session, 2026-07-06, fresh, re-confirmed before finishing):** API **31 suites /
187 tests passed**, web unit **19 files / 177 tests passed** (S9 makes no frontend change; run as a
regression check only), both `tsc --noEmit` exit 0, both lint clean (0 errors; 13 pre-existing api
warnings + 6 pre-existing web warnings, none in S9 files, matching prior slices' baselines). No E2E
run — S9 has no screen or user-facing-behavior change (backend script + committed data files only), so
this repo's own `frontend-e2e-verification` trigger doesn't apply.

## Notes

- **Three plan-prose-vs-reality corrections, all caught before/during implementation, not after**: no
  real Synthea data exists (procedural generator substitution, S5 precedent); no reusable "run + validate"
  function existed to reuse (the harness replicates `routes/analysis.ts`'s validation glue rather than
  scoring raw agent output); S8's actual eval-tile contract is looser than the plan's prose implied (only
  the file path + an optional `headline` string are load-bearing). All three documented in
  `verification-s9.md` §0/§3.
- **One Standards-review finding, fixed within this branch**: `errorAnalysis.ts` had duplicated
  `computeMetrics.ts`'s `HIGH_RISK_LEVELS` constant instead of importing it — fixed in `73abcce`.
- **Evidence strength:** local mock / packaged script — Jest suites plus one real `npm run eval` run
  against a local Docker HAPI container with live LLM calls. Not target-environment or client-accepted.
  The eval's own headline numbers are against **dev-labeled, not clinician-validated** ground truth
  (GD8) and should not be read as a clinical accuracy claim.
- **Branch is local-only as of this changelog** — PR not yet opened.
