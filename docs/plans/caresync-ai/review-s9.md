# Code Review — CareSync AI, S9 (Evaluation harness + report)

> **PLAN_ID:** `caresync-ai` · **Slice:** S9 · **Date:** 2026-07-06
> **Diff:** `main` (`d219b9c`) `...HEAD` (`73abcce` at review time), 4 commits.
> **Spec sources:** `docs/plans/caresync-ai/issues.md` S9, `implementation-plan.md` Iteration 9,
> `verification-s9.md`. This repo has no `CODING_STANDARDS.md`/`CONTRIBUTING.md` and `CLAUDE.md`'s
> "Code style" section is an empty placeholder — the Standards axis instead measured the diff against
> the closest established sibling modules (`agents/citationValidator.ts`'s pure-Seam-module convention,
> `governance/service.ts`'s exported-pure-helper convention) plus the fixed Fowler smell baseline.
> Prior review preserved at `review-s8.md`.

## Standards

**Convention match: strong.** `apps/api/src/eval/computeMetrics.ts` and `errorAnalysis.ts` follow the
established Seam-module pattern exactly: pure functions, no I/O, otherwise-private helpers exported
specifically for direct unit testing (`tallyConfusionMatrix`, `classificationMetricsFromMatrix`), the
same "Domain rule:"/rationale-comment density as `citationValidator.ts` and `governance/service.ts`,
and the same "`null`-not-fabricated" honesty convention for unlabeled/undecidable cases. `scripts/eval.ts`
mirrors `scripts/import-fhir.ts`'s CLI-script wiring (`tsx`, workspace `package.json` script → root
passthrough) precisely.

**Hard finding, fixed during this review:** `errorAnalysis.ts` duplicated `computeMetrics.ts`'s
`HIGH_RISK_LEVELS` constant verbatim, justified by an in-code comment claiming the constant was
"intentionally private." It wasn't private for a documented reason — it was the same domain decision
(what counts as "high risk") needed in two files, i.e. Fowler's Duplicated Code. Left as-is, a future
change to the risk-level threshold (e.g. adding `'severe'`) could silently drift between the two files
with nothing enforcing consistency. **Fixed:** exported `HIGH_RISK_LEVELS` from `computeMetrics.ts`,
`errorAnalysis.ts` now imports it. Re-verified: `tsc --noEmit` clean, 187/187 API tests pass
(commit `73abcce`).

**Baseline smells found, left as-is (judgement calls, not fixed):**
- **Duplicated Code (structural, not the constant above)** — `computeMetrics.ts` and `errorAnalysis.ts`
  each independently loop over `labels` and re-derive the same three per-dimension predicates
  (`careGap.findings.length > 0`, `HIGH_RISK_LEVELS.has(riskLevel)`, `sdoh.findings.length > 0`) in their
  own pass, despite `errorAnalysis.ts`'s own doc comment describing them as "driven off one shared
  harness pass." A `classifyPatient(label, findings)` helper returning `{expected, predicted}` per
  dimension would remove the twin loops. Not fixed in this pass: it's a real but moderate-size
  refactor (touches both modules' internals, both already reviewed/approved once), and the two
  modules' outputs are independently tested against fixed fixtures, so the duplication is a
  maintainability cost, not a correctness risk today. Worth revisiting if a fifth eval dimension is
  ever added.
- **Long Function / low cohesion (borderline Divergent Change)** — `scripts/eval.ts` (421 lines) mixes
  label loading, live-agent orchestration, cache deserialization, the run loop, ~150 lines of Markdown
  rendering, and JSON-summary shaping in one file. Each concern would change for a different reason
  (label schema vs. report wording vs. orchestrator wiring). Mitigated by extensive comments and by
  following `import-fhir.ts`'s existing single-script-file convention (no sibling CLI script in this
  repo splits its rendering/glue into separate files either) — left as a documented judgement call
  rather than a unilateral refactor that would make this script inconsistent with its nearest sibling.
- **Data Clumps (mild)** — `CareGapErrorEntry`/`SdohDisagreementEntry` in `errorAnalysis.ts` share an
  identical `{patientId, expected, predicted, labelNotes}` shape (only `RiskErrorEntry` differs). Minor;
  each type is domain-named per-dimension, which the baseline itself treats as mitigating.

Not flagged, considered and dismissed: `scripts/eval.ts`'s cache-vs-live branching isn't a Repeated
Switch risk (it's one two-way branch, not a recurring cascade); the generated `docs/eval-report.md`/
`.json` being committed alongside source is a deliberate plan requirement (C1), not accidental
build-artifact drift.

## Spec

**Verdict: clean.** No missing/partial requirements, no scope creep, no wrong-implementation findings
survive verification.

- **All five S9 acceptance bullets (`issues.md`) are genuinely implemented, not stubbed** — the
  committed label file has real `source: "dev"` / `clinicianOverride: null` rows (not just claimed);
  `npm run eval` was run for real (16/16 patients, 0 failures, live FHIR + live LLM calls, not mocked);
  `computeMetrics` is genuinely pure (no `fs`/`path`/network imports, verified by reading the source);
  the JSON summary lands at `governance/service.ts`'s exact `EVAL_REPORT_PATH` and was proven consumed
  live via a direct `getEvalSummary()` call against the real DB and the real generated file.
- **"~5 curated hero + ~10 Synthea" (plan line 528/538)**: the label file uses all 6 `ALL_PATIENTS` +
  `pop-0001..pop-0010`. The "Synthea" substitution (no real Synthea data exists in this repo) is
  disclosed explicitly in three places — the plan's own A1 deviation note, `labels.json`'s `_meta`
  block, and the rendered report's Methodology section — matching the precedent S5 already set, not a
  silently reinterpreted requirement.
- **"Mandatory error-analysis section" (plan line 547)**: substantive, not a stub — `docs/eval-report.md`
  names 9 specific risk false positives and 1 care-gap false positive by patient ID with per-patient
  rationale.
- **A real, honest eval finding surfaced by the harness itself** (not a code defect): Risk specificity
  is low (30.8%, 9 false positives). This is disclosed in `labels.json`'s `_meta.limitations` and the
  report, consistent with GD8's "honest dev-labeled baseline" framing rather than smoothed over.
- **No scope creep** — the diff is additive only (new `eval/` module, `scripts/eval.ts`, label file,
  generated reports, two `package.json` script entries); `governance/service.ts` and all other S8 files
  are untouched, honoring the cross-slice contract read-only from S9's side.

No discrepancies found between `verification-s9.md`'s narrative and the actual diff contents.

## Summary

**Standards:** 1 hard finding (fixed in this review — duplicated `HIGH_RISK_LEVELS` constant), 3
baseline smells (judgement calls, left as-is — a structural duplicated-loop pattern across the two eval
modules, `scripts/eval.ts`'s multi-concern length, a mild data-clump). Worst issue: the duplicated
constant, now fixed.
**Spec:** 0 findings. Worst issue: none.

## Next step

`finishing-a-development-branch` — push, open the PR against `main`, and merge.
