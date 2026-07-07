# Verification — CareSync AI, S9 (Evaluation harness + report)

> **PLAN_ID:** `caresync-ai` · **Slice:** S9 · **Date:** 2026-07-06
> **Stage:** Phase 5 (`verification-before-completion`), run on `feature/caresync-s9-eval-harness`
> (base `d219b9c` = `main`, tip `206d924`, 2 commits: `da61229` Phase A — labels + Seam 4
> `computeMetrics`, `206d924` Phase B — `npm run eval` harness + report). Read
> `docs/plans/caresync-ai/implementation-plan.md` Iteration 9 and `docs/plans/caresync-ai/issues.md`
> S9 for the plan this verifies against — not re-derived here. Built via `subagent-driven-development`:
> one implementer subagent per phase, one independent reviewer subagent per phase (not the implementer
> grading its own work, each reviewer re-ran commands and cross-checked source data itself rather than
> trusting the implementer's report), both re-confirmed again in this consolidated pass.

## 0. Pre-implementation plan correction (before any code was written)

A research pass against the live codebase, run before dispatching either phase, found the plan's prose
described the codebase slightly differently than it actually is. None of these blocked implementation;
all were folded into the implementer prompts up front rather than discovered mid-build:

- **No real Synthea data exists in this repo.** The plan's "~10 Synthea patients" is `pop-0001..pop-0010`
  from `population.ts`'s deterministic PRNG generator — the same disclosed substitution S5 already made.
- **No `HERO_PATIENT_IDS` constant exists.** "~5 curated hero" patients are all 6 of `ALL_PATIENTS`
  (Maria Chen + 5 panel patients) from `seed-patients.ts`.
- **No standalone "run agents + validate + cache" function exists** — only the raw `orchestrate()`
  generator and route-embedded `validateCitations` glue in `routes/analysis.ts`. The harness replicates
  that glue rather than scoring unvalidated raw agent output.
- **S8's eval-tile coupling is looser than the plan's prose implies** — only the file path
  `docs/eval-report.json` and an optional top-level `headline: string` are load-bearing (confirmed by
  reading `Governance.tsx`'s `EvalSummaryContent` directly); no other field names matter to the consumer.

## 1. Fresh command evidence (this session, 2026-07-06)

Re-run fresh in this final consolidated pass, on top of each phase's independent reviewer's own run:

| Command | Result |
|---|---|
| `cd apps/api && npx jest --runInBand` | **31 suites / 187 tests passed** |
| `cd apps/api && npx tsc --noEmit` | exit 0 |
| `npm run eval` (repo root, live FHIR + live LLM calls) | **16/16 labeled patients scored, 0 failed** |
| `docs/eval-report.json` / `.md` valid, headline present | confirmed by direct read |

No `apps/web`/E2E re-run — S9 makes no frontend or screen-behavior change (backend script + committed
data file only), so `frontend-e2e-verification` does not apply per this repo's own trigger rule.

**Real, reproduced ordering hazard**: running the full `apps/api` Jest suite deletes
`docs/eval-report.json` via a pre-existing S8 test's `afterEach` (`routes/governance.test.ts`, not S9's
code). Observed directly in this pass: ran the suite, confirmed `docs/eval-report.json` was gone
(`git status` showed it deleted), then ran `git checkout -- docs/eval-report.json` and confirmed it was
restored byte-for-byte because the file is now committed (`206d924`). This is the reason C1's "commit
the eval run as evidence" requirement is load-bearing and not just a nice-to-have — an uncommitted
artifact would have been unrecoverably lost by the next `npm run test:api`.

## 2. Definition-of-done check (S9 acceptance, `issues.md`)

All 5 acceptance bullets confirmed against the actual code and this session's fresh evidence:

1. **Committed label file with clinician-overridable rows** — `data/eval/labels.json`, 16 rows (6
   curated + `pop-0001..pop-0010`), each with `source: "dev"` and a `clinicianOverride: null` slot, plus
   a `_meta` block stating the GD8 dev-labeled/not-clinician-validated disclosure. Independently
   cross-checked by the Phase A reviewer against the real seed data and a live `generatePopulation()`
   run — no fabricated labels found; unlabeled dimensions (`null`) used where the codebase has no
   established observation/LOINC convention (e.g. COPD, HTN, depression) rather than guessed values.
2. **`npm run eval` runs agents over all labeled patients, computes per-agent metrics** —
   `apps/api/src/scripts/eval.ts`, wired as `npm run eval` (root) → `--workspace apps/api`. Cache-first
   (`readAnalysisCache`) with a live `orchestrate()` + `validateCitations` fallback, matching the
   product's own validated-findings shape (`AnalysisResultJson`), not raw/unvalidated agent output. This
   session's live run: 16/16 scored (1 from cache, 15 live), 0 failures.
3. **Report includes an explicit error-analysis section** — `docs/eval-report.md` names specific
   patient IDs with predicted-vs-labeled detail (e.g. 9 named risk false positives, 1 named care-gap
   false positive), extracted by a new pure `computeErrorAnalysis` (Seam-style, TDD, colocated test).
   The Phase B reviewer cross-checked 6 of the reported false positives directly against
   `data/eval/labels.json`'s stored fields and confirmed each matches verbatim — not fabricated.
4. **JSON summary produced and consumed by the S8 governance tile** — `docs/eval-report.json` written
   to the exact `EVAL_REPORT_PATH` `governance/service.ts` reads (`path.resolve(__dirname,
   '../../../../docs/eval-report.json')`, same 4-directory-up walk from the same source depth,
   confirmed identical in both files). The Phase B reviewer proved consumption live — not by
   description — by calling `getEvalSummary()` directly against the real DB and the real generated file
   and observing `{available: true, summary: {headline: "...", ...}}` returned.
5. **Metric computation tested against a fixed fixture with known output (Seam 4)** —
   `apps/api/src/eval/computeMetrics.ts` + `computeMetrics.test.ts`: a hand-built 5-patient fixture,
   `toEqual` exact-value assertions, hand-recomputed by the Phase A reviewer for every dimension
   (careGap 0.5/0.5/0.5, risk 1/1/1, SDOH agreement 0.75) and matched exactly. `computeErrorAnalysis`
   (Phase B's new pure module) has its own separate 5-case fixture, independently hand-recomputed for
   4 of 5 cases by the Phase B reviewer with the same result.

No drift between what's claimed done and what the code does.

## 3. Spec-drift check (issues.md / implementation-plan.md vs. code)

Real plan-vs-reality mismatches, all caught during pre-implementation research or by the reviewers
(§0 above), resolved honestly rather than silently:

- **"~10 Synthea patients" corrected to `pop-0001..pop-0010`** (no real Synthea data in this repo —
  same disclosed S5 substitution). Documented in the plan's A1 deviation note (see the checked-off
  implementation-plan.md).
- **"reuses the S3 orchestrator" is true but incomplete** — the harness had to additionally replicate
  `routes/analysis.ts`'s citation-validation glue itself, since no reusable "run + validate" function
  existed to import. This is a pragmatic, ponytail-consistent duplication of ~20-30 lines, not a new
  agent path, and was a deliberate choice flagged up front rather than discovered as a surprise gap.
- **The plan's B1 line ("a JSON summary") undersold how loose S8's actual consumer contract is** —
  confirmed only `docs/eval-report.json`'s path and an optional `headline: string` matter; the rest of
  the JSON's shape was designed freely by the Phase B implementer (per-agent metrics, error analysis,
  patient counts) with no risk of breaking S8's already-shipped tile.
- **New, real finding from the eval run itself (not a code defect)**: Risk agent specificity came out
  low (30.8%, 9 of 16 patients flagged "high" risk against the seeded/generated `riskScore < 75`
  threshold). This is exactly the kind of result S9 exists to surface honestly — recorded in
  `docs/eval-report.md`'s error-analysis section as a real finding about the live agent's behavior, not
  smoothed over or hidden.

Other checks:
- **No new persisted state** — `apps/api/src/db/index.ts`'s `migrate()` unchanged. S9 adds a read-only
  script + two generated/committed files; no schema change.
- **`implementation-plan.md` Iteration 9's checkboxes** — A1-A2, B1, C1-C2, and the Definition-of-done
  bullets are now all `[x]` (this session), matching the actual committed state.

## 4. Review notes

Both phases were built by an implementer subagent under an explicit TDD requirement (failing test
first, confirmed red for the right reason, then green), and **each phase's implementer report was
independently re-verified by a separate reviewer subagent** — not the same agent grading its own work.
Both reviewers went beyond re-running tests: the Phase A reviewer independently ran
`generatePopulation()` itself and cross-checked all 16 label rows against real source data (seed
patients' actual embedded FHIR resources and the generator's live output), and the Phase B reviewer
independently called `getEvalSummary()` against the real DB and cross-checked 6 reported error-analysis
entries against the label file's raw fields. Both phases returned **APPROVE**.

The Phase B reviewer surfaced one real, non-blocking gap (the eval-report.json test-cleanup deletion
hazard, §1) that the implementer had itself already flagged as a to-decide item rather than hidden —
resolved in this consolidated pass by (a) committing the generated artifacts as required by C1 and
(b) adding an explicit doc-comment in `eval.ts` recording the hazard and its `git checkout` mitigation.

No `NEEDS_CONTEXT` escalations were raised by either implementer.

## 5. Domain-term documentation check

New domain concepts introduced by S9 — the `apps/api/src/eval/` module (`computeMetrics`,
`computeErrorAnalysis`, Seam 4), the `data/eval/labels.json` dev-labeled/clinician-override row
convention (GD8), and the `docs/eval-report.json`/`.md` generated-and-committed-evidence pair — are
documented inline via doc comments at their introduction point (`computeMetrics.ts`,
`errorAnalysis.ts`, `eval.ts`, `labels.json`'s `_meta` block), consistent with the "Domain rule:"
convention established since S2. `docs/agents/domain.md` and `docs/agents/issue-tracker.md` still don't
exist — the same pre-existing, deferred gap noted in every prior slice's verification (S5, S7, S8),
unchanged by S9.

## 6. Evidence-boundary labeling (CLAUDE.md)

Per CLAUDE.md's evidence-boundaries rule: all evidence in this document is **local mock / packaged
script strength** — Jest suites and one real `npm run eval` run against the local Docker HAPI container
and live LLM calls from this development machine. This proves the harness actually reads real patient
bundles, actually invokes the real four-agent pipeline with real citation validation, and actually
produces a file the real S8 endpoint reads — but it is **not** target-environment, client-accepted, or
production-hardware evidence, and the labels themselves are explicitly **dev-labeled, not
clinician-validated** (GD8) — the eval's own headline numbers (e.g. 100% Care Gap/Risk/SDOH figures
against dev labels) should not be read as a clinically validated accuracy claim.

## 7. Gate outcome

**PASS.** All fresh command evidence is green (§1). Definition-of-done (§2) and spec-drift (§3) checks
found several real plan-prose-vs-reality corrections (Synthea substitution, no reusable validated-run
function, looser-than-stated S8 coupling) and one real operational hazard (test-cleanup deleting the
committed evidence file) — all resolved honestly and documented rather than papered over. No
product-behavior defects remain open, and no fabricated labels or fabricated report numbers were found
anywhere in the shipped label file or generated report (independently cross-checked against source data
by both phase reviewers, not just internally consistency-checked).

## Next step

`code-review`, covering the full branch diff since `main` along the Standards and Spec axes.
