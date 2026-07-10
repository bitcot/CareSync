# S19 — Trust, Safety, and Eval Closure

> **Slice ID:** s19-trust-eval-closure
> **Branch:** `feature/s19-trust-eval-closure`
> **Status:** Plan ready for review
> **Inputs:** Two binary decisions locked — (a) flip pop-0007 label to match current generator output (path a, the honest fix per the `s13-risk-rubric-reverted.md` memory); (b) clinician outreach email goes out today, so `data/eval/clinician-outreach.json` gets a real `status: 'sent'` entry today.

---

## Context

The fresh 2026-07-10 HL7 evaluation reports four holdbacks clustered under two rubric pillars, plus a new sensitivity regression:

| Reported gap | Pillar | Root cause |
|---|---|---|
| No model card / NIST AI RMF documentation | P4 (4/5) | No reviewer-facing `MODEL_CARD.md` exists; closest is the internal v3 rubric doc |
| 0/26 clinician-validated labels | P4 + P6 (4/5) | `data/eval/clinician-outreach.json.invitations` is `[]`; `s18-clinician-engagement.md` email drafted but never sent |
| Parity measured, not mitigated | P4 | `governance/service.ts:getParityMetrics` computes a snapshot, returns it, stops — no threshold, no escalation, no audit row |
| Care Gap specificity = 0% on 1 negative example | P6 | `labels.json._meta.limitations` self-discloses; procedural generator never seeds baseline Observations, so only `maria-chen` is a true negative |
| Held-out Risk sensitivity structurally N/A | P6 | All 10 held-out patients happen to have `riskScoreFor() < 75`; labeling rule makes the metric undefined rather than failed |
| **New: pop-0007 sensitivity regression (66.7%)** | P4 + P6 | **Label/generator drift**, not a clamp bug. `generatePopulation()[6]` currently produces recency=1500h → `riskScoreFor(3, 1500h) = 72 < 75`, but `labels.json` still records `seedRiskScore: 92` (the 60h assumption). The deterministic clamp at `confidenceScorer.ts:312-330` is correct; the label is wrong for the current generator |

This slice closes all five holdbacks in one PR. After it lands, the rubric is projected to move from **78.8 weighted × 1.15 = 90.6** (current, `2026-07-10-fresh`) to ~**92-93** depending on clinician response. The clamped `clampRiskLevel` safety net stays correct and gains transparency (audit row on each downgrade) — the regression is resolved by repairing the label, not by weakening the clamp.

---

## Recommended Approach

Five threads in one branch, each as 1-2 commits so the diffs stay reviewable. Per the ADLC: `prd-s19.md` → `implementation-plan-s19.md` → code → `verification-s19.md` → `review-s19.md` → PR. No re-architecture; the existing seams in `governance/service.ts`, `confidenceScorer.ts`, and `eval/` are reused; no schema libraries; no schema drift on the committable label files.

### Thread A — MODEL_CARD.md (P4 model-card holdback)

**New file:** `MODEL_CARD.md` at repo root (same location as `HANDOFF.md`, `SUBMISSION.md` — reviewer-facing artifacts live at root).

**Sections, in this order:**
1. **Model identity** — name (CareSync Risk/CareGap/SDOH/ActionPlanner agents), version (gpt-5.5, OpenAI Responses API), date (2026-07-10)
2. **Intended use** — decision-support tool for care coordinators; FHIR Task creation requires human coordinator action; NOT autonomous clinical decision-making
3. **Out-of-scope uses** — diagnostic use, autonomous prescribing, ICU/critical-care monitoring, populations outside US Core demographics
4. **Architecture summary** — 4-agent parallel dispatch; structured-output function tools; deterministic citation validation (`citationValidator.ts`); deterministic confidence scoring (`confidenceScorer.ts`); deterministic `clampRiskLevel` safety net
5. **Training data disclosure** — all patient data is procedural (synthetic); no PHI; Synthea substitution disclosed per `plan.md §3`
6. **Evaluation results** — pointers to `docs/eval-report.md` Status lines + per-pillar breakdown
7. **Risk and limitations** (explicit list) — confidence is a bundle-evidence heuristic not a calibrated probability; clamp is rule-based and conservative (may downgrade true TP cases when evidence is sparse); ground truth is dev-labeled; small n; population cohort is 500 procedural patients not a real clinical sample
8. **NIST AI RMF mapping** — GOVERN (audit trail + role-based scopes), MAP (explicit patient cohort via `getPatientBundle` `$everything`), MEASURE (`computeMetrics` + `getParityMetrics` + `getModelPerformance`), MANAGE (clamp + citation validator + human-in-the-loop Task creation + audit denial logging)
9. **Contact** — submission email; ack section for clinicians who reviewed labels

TDD pins: this is a documentation artifact (no code paths), but I will add a test (`apps/api/test/docs-mode-card.test.ts` or co-located in a verification doc) that asserts the file exists, has all 9 section headers, and links to `docs/eval-report.md` and `docs/SOLUTION_OVERVIEW.md`. This prevents accidental deletion of the artifact.

**No code dependency.** Pure markdown + integrity test.

### Thread B — Parity mitigation path (P4 measurement-without-mitigation holdback)

**Files:**
- `apps/api/src/governance/service.ts` — add `parityMitigationFlags` pure function; extend `getParityMetrics` return shape with `mitigation: MitigationFlag[]`
- `apps/api/src/governance/service.test.ts` — new tests for `parityMitigationFlags` (boundary cases for threshold, small-sample flag)
- `apps/web/src/pages/Governance.tsx` — render new "Mitigation Recommended" tile below the radar chart, only visible when `mitigation.length > 0`
- `apps/web/src/pages/Governance.test.tsx` — tile-appears / tile-hides with empty/non-empty mitigation

**`parityMitigationFlags` contract (pure function, exported for direct unit testing):**
- Input: `ParityResult` (existing shape from `service.ts`)
- Output: `MitigationFlag[]` where each flag is `{ dimension: 'byAgeBand' | 'bySex' | 'byRace' | 'byEthnicity'; severity: 'amber' | 'red'; evidence: string; recommendedAction: 're-run with refreshed cohort' | 'audit rubric for that group' | 'insufficient sample' }`
- Trigger conditions (replaceable constant `PARITY_DELTA_THRESHOLD = 15` at top of file):
  - `Math.abs(maxGroup - minGroup) > PARITY_DELTA_THRESHOLD` → flag with `severity: 'red'`, `recommendedAction: 'audit rubric for that group'`
  - `< 0` AND `n < 3` for any group → flag with `severity: 'amber'`, `recommendedAction: 'insufficient sample'`
- Empty array when no flags trigger (tile stays hidden in UI)

**Audit row on mitigation flag:** the new function does NOT write audit rows itself (pure function). The caller in `getParityMetrics` writes ONE consolidated audit row per call when `mitigation.length > 0`:
```ts
writeAudit(db, {
  actor: 'system',
  action: 'parity-mitigation-recommended',
  fhirResource: 'Governance/parity',
  outcome: 'flagged',
});
```
Detail column is the audit row's `fhir_resource` (the schema `AuditEntry` already carries `action`/`fhirResource`/`outcome`/`actor`). The current `audit_log` schema doesn't have a `details` column, so we encode the flag list in the `fhirResource` field via a structured suffix: `Governance/parity/byRace:delta23`. This stays within the existing 4-field contract.

**Reuse:** `writeAudit` (`apps/api/src/db/audit.ts`); `stratify` (`apps/api/src/governance/service.ts`); `ParityRadarChart` (`apps/web/src/components/ParityRadarChart.tsx`).

### Thread C — Eval data closure (P6 thin-eval-data holdback)

Three sub-changes, each a commit:

**C1 — More negative Care Gap examples.**
**File:** `apps/api/src/fhir-data/population.ts`
- Add `buildObservationsForIndex(i): Observation[] | []` helper, exporting shape compatible with `seed-patients.ts`'s Observation pattern (LOINC codes 4548-4 HbA1c, 30934-4 BNP, 62238-1 eGFR — same constants used in `confidenceScorer.ts`).
- Seed for `i % 7 === 6` (≈71 patients out of 500): if the patient has `E11.9`/`I50.9`/`N18.3`, attach the matching monitoring Observation with a normal-range value (HbA1c 7.2%, BNP 150 pg/mL, eGFR 75 mL/min/1.73m²).
- Add 4-5 patient rows in `data/eval/labels.json` for newly-imaged procedural patients (e.g., `pop-0021..pop-0025`) with `careGap.expectedHasGap: false` and rationale citing the matching Observation on file.

**C2 — Held-out set with at least one positive Risk.**
**File:** `apps/api/src/fhir-data/population.ts` — same generator extension: cycle condition mixes so that within the held-out range `pop-0011..pop-0020`, at least `pop-0014` (i=13 in zero-based) gets the 3-condition mix + recency ≤ 72h. With `(3, 60h)` → `riskScore = 92 ≥ 75`, label becomes `expectedHighRisk: true`.
- Update `labels.json` row `pop-0014` accordingly, with rationale citing the generator output.

**C3 — Repair pop-0007 label.**
**File:** `data/eval/labels.json`
- For `pop-0007`, flip `risk.expectedHighRisk` from `true` to `false`. Update `risk.notes` to read: *"Generator riskScore 72 < 75 (inspected directly via generatePopulation()[6] — recency 1500h places this patient past the 720h recency-bonus threshold; the v3 rubric Rule 1 applies, 1 anchor met → moderate). The previously-recorded seedRiskScore 92 reflected an earlier generator state; this row was repaired 2026-07-10 in S19."*
- Update `risk.seedRiskScore: 92 → 72`.
- Add a `changeLog` entry in `labels.json._meta` so the flip is on the audit trail: `{date: '2026-07-10', slice: 'S19', change: 'pop-0007 risk label repaired to match current generatePopulation() output (recency 1500h, riskScore 72 — < 75 threshold). Previously recorded seedRiskScore=92 was stale.'}`.

This is a label-only edit. The deterministic clamp at `confidenceScorer.ts:312-330` is NOT touched here (Thread D adds transparency without changing behavior).

**TDD pins:** `apps/api/src/fhir-data/population.test.ts` gets new tests for `buildObservationsForIndex` and the held-out-positive patient; `data/eval/labels.json._meta._selfCheck` (new field; see Thread D extension) reads each `seedRiskScore` and verifies it against current generator output.

### Thread D — Safety-net transparency (regression honest disclosure)

Two sub-changes:

**D1 — Audit-row on clamp downgrade.**
**Files:**
- `apps/api/src/agents/confidenceScorer.ts` — modify `clampRiskLevel` return shape to attach a sentinel: returning `{ ...output, riskLevel: 'moderate', _safetyNetApplied: { kind: 'risk-level-clamped', from: output.riskLevel, to: 'moderate' as const, deterministicScore, conditionCount, recencyHours } }` when a downgrade occurs.
- `apps/api/src/agents/confidenceScorer.test.ts` — new test pinning the pop-0007 case (LLM says 'high' → clamp returns `{riskLevel: 'moderate', _safetyNetApplied: {...}}`; deterministicScore 72 documented in the assert).
- `apps/api/src/agents/citationValidator.ts` (or wherever the orchestrator merges per-agent output) — surface `_safetyNetApplied` into the cached `analysis_cache.result_json` so downstream eval-report renders can read it.
- `apps/api/src/eval/eval.ts` — extend error-analysis section with `## Safety-net activity` listing per-patient `(from, to)` pairs.

**D2 — Unit test for the FN-bundle clamp behavior.**
**File:** `apps/api/src/agents/confidenceScorer.test.ts`
- Pop-0007 bundle fixture (3-condition comorbidity, encounter 1500h ago, no Observations) + LLM `riskLevel: 'high'` → expect clamp output to surface the audit info.
- Companion test: pop-0007 bundle + LLM `riskLevel: 'moderate'` → expect unchanged output (clamp is a no-op for non-high/critical levels).
- Companion test: `riskLevel: 'critical'` bundle where the deterministic score IS ≥ 75 → expect unchanged (the existing preservation path keeps working).

**No logic change to the clamp itself** — this thread only adds observability. The existing behavior is correct (verified by the pop-0007 bundle's actual `riskScoreFor = 72`).

### Thread E — Clinician outreach log update (P6 0/26 → ≥0)

**Files:**
- `data/eval/clinician-outreach.json` — add one entry today with `status: 'sent'`, `reviewer: '[redacted until consent]'` (or alias per `_meta.consentBoundary`), `channel: 'email'`, `sentAt: '2026-07-10T...Z'`, `labelsAffected: 0`.
- `apps/api/src/scripts/outreach-validate.ts` — no code change; the file validates whatever shape `eval/outreachSchema.ts` requires.
- New commit helper: `scripts/log-outreach.ts` (a 30-line `npm run outreach:log -- --reviewer "..." --channel email --sent-at 2026-07-10T...Z` script that appends a validated entry to `clinician-outreach.json`). Mirrors the `apply-clinician-review.ts` pattern (path from `__dirname`, `require.main === module`, validate-before-write).

**Action required from user (out of session):** send the email per `s18-clinician-engagement.md` §1, then run `npm run outreach:log` to capture the audit-trail entry. The slice ships the tooling; the action is on the user's clock.

**Caveat:** the `s18-clinician-engagement.md` schema (S15's `outreachSchema.ts`) uses fields `reviewer / sentAt / channel / status / labelsAffected` — these are the schema-locked fields. The §4 protocol in `s18-clinician-engagement.md` mentions richer fields (`id / sentTs / sentTo / respondedTs / validatedCount / declineReason / notes`) that don't exist in the schema. **The plan uses the schema-locked fields only**; the richer fields stay in the engagement artifact as the protocol, and get added to the schema in S20 if needed (post-challenge).

---

## Critical Files (modified or created)

**Created:**
- `MODEL_CARD.md` (repo root)
- `apps/api/test/docs-model-card.test.ts` — integrity test (file exists, 9 section headers present)
- `apps/api/src/scripts/log-outreach.ts` — append one entry to outreach log

**Modified:**
- `data/eval/labels.json` — pop-0007 risk flip + pop-0014 positive-risk + 4-5 new negative-care-gap patients; new `_meta.changeLog` and `_meta._selfCheck`
- `apps/api/src/fhir-data/population.ts` — extend `generatePopulation()` with `buildObservationsForIndex` and the held-out-positive scheduling
- `apps/api/src/fhir-data/population.test.ts` — new tests pinning both
- `apps/api/src/governance/service.ts` — add `parityMitigationFlags`, extend `getParityMetrics` return shape, emit `parity-mitigation-recommended` audit row when flags > 0
- `apps/api/src/governance/service.test.ts` — new tests for `parityMitigationFlags`
- `apps/web/src/pages/Governance.tsx` — Mitigation Recommended tile (conditional render)
- `apps/web/src/pages/Governance.test.tsx` — tile shows / hides
- `apps/api/src/agents/confidenceScorer.ts` — `clampRiskLevel` return shape carries `_safetyNetApplied` when applicable
- `apps/api/src/agents/confidenceScorer.test.ts` — pop-0007 clamp-behavior tests (D2)
- `apps/api/src/eval/eval.ts` (or `errorAnalysis.ts`) — surface `_safetyNetApplied` per patient in `## Safety-net activity` section
- `data/eval/clinician-outreach.json` — append `status: 'sent'` entry

**ADLC artifacts (under `docs/plans/caresync-ai/`):**
- `prd-s19.md`
- `grill-s19.md` (single grill session covering all 5 threads; cross-cuts: clamp behavior, eval-label drift, parity mitigation threshold)
- `implementation-plan-s19.md` (this file's content, condensed)
- `verification-s19.md` (post-implementation; produced during Thread verification)
- `review-s19.md` (post-implementation; produced during Thread review)

---

## Reused Functions / Utilities (do not duplicate)

| Function / module | Location | Reused by |
|---|---|---|
| `writeAudit` | `apps/api/src/db/audit.ts:12` | Thread B (parity escalation row) |
| `readAuditTrail` | `apps/api/src/db/audit.ts:48` | Reads parity-mitigation rows back into governance UI |
| `stratify` | `apps/api/src/governance/service.ts:234` | Thread B input |
| `ageFromBirthDate`, `ageBandFor` | `apps/api/src/governance/service.ts:210,222` | Thread B input (no change) |
| `validateOutreach` | `apps/api/src/eval/outreachSchema.ts:138` | `scripts/log-outreach.ts` (Thread E) |
| `readAndValidateOutreach` | `apps/api/src/scripts/outreach-validate.ts:36` | Reused by eval-report renderer |
| `applyReview` | `apps/api/src/scripts/apply-clinician-review.ts:163` | Unchanged; Thread E uses outreach-validate convention only |
| `tallyConfusionMatrix` / `classificationMetricsFromMatrix` | `apps/api/src/eval/computeMetrics.ts:144,161` | Thread C — adding more negative label rows makes these meaningful |
| `HBA1C_LOINC` / `BNP_LOINC` / `EGFR_LOINC` constants | `apps/api/src/agents/confidenceScorer.ts:28-30` | Thread C1 imports these constants rather than redeclaring |
| `riskScoreFor` / `CRITICAL_RISK_THRESHOLD` | `apps/api/src/fhir-data/population.ts:127,22` | Thread C3 (label flip references real generator output); Thread D2 (test fixture) |
| `LOINC_TO_HBA1C` / condition→LOINC mapping | `confidenceScorer.ts:47-51` (`CONDITION_TO_REQUIRED_LOINC`) | Thread C1 `buildObservationsForIndex` uses the same mapping |
| `ParityRadarChart` | `apps/web/src/components/ParityRadarChart.tsx` | Thread B — new tile sits beside existing radar |
| `StatTile` | `apps/web/src/components/StatTile.tsx` | Thread B "Mitigation Recommended" tile |

No new abstractions; no helper consolidation; no schema library.

---

## Verification (test-first per slice, end-to-end after)

### Per-thread (sub-agent-driven-development + TDD)
- **Thread A:** jest unit test asserts MODEL_CARD.md exists with the 9 section headers in order. Failure message lists the missing section. Other verification is visual review by the user against `reference-materials/HL7-Challenge-Brief.md`.
- **Thread B:** `governance/service.test.ts` pins `parityMitigationFlags` for: empty input, single-dimension 0-delta, threshold-exact boundary, n<3 small-sample flag, multi-dimensional flag list, audit row written when flags > 0.
- **Thread C:** `population.test.ts` pins that `generatePopulation()[6]` (pop-0007) returns `riskScore === 72` (not 92) AND that pop-0014 (i=13) has `riskScore >= 75`. `labels.json._meta._selfCheck` test parses labels and re-derives every `seedRiskScore` against the current generator; any mismatch fails the test.
- **Thread D:** `confidenceScorer.test.ts` pins the pop-0007 LLM-says-high → clamp-returns-moderate + `_safetyNetApplied` case.
- **Thread E:** round-trip test: `scripts/log-outreach.ts` writes a new entry; `readAndValidateOutreach` reads the file back and finds it; validate fails on bad input (channel=invalid).

### Slice-level (verification-before-completion)
1. Run the eval: `cd apps/api && npx tsx src/scripts/eval.ts` — confirm `docs/eval-report.md` regenerates with:
   - Risk FN drops from 1 to 0 (the pop-0007 flip unblocks the FN)
   - Care Gap specificity becomes defined (TN > 0)
   - Held-out Risk sensitivity becomes defined (denominator > 0)
   - New `## Safety-net activity` section renders non-empty
2. Run the audit-script checks: `npx tsx src/scripts/outreach-validate.ts` — exits 0; entry present.
3. Run the full test suite: `npm test --workspaces` — all green.
4. Front-end e2e (only Governance.tsx changes UI): run `cd apps/web && npx playwright test governance` — passes.
5. Manual check: open `apps/web/src/pages/Governance.tsx`, confirm tile-hide-when-empty + tile-show-on-flag behavior with mocked data.

### Rubric-level (verification, post-merge)
- Re-run the live HL7 evaluation regen (`cd apps/api && npx tsx src/scripts/eval.ts && npx tsx src/scripts/outreach-validate.ts`); update `reports/HL7-Challenge-Evaluation.S19.md`.
- Spot-check that `MODEL_CARD.md` is at repo root, the 9 sections render, and links resolve.
- Confirm `data/eval/labels.json._meta.changeLog` has the S19 entry.

The slice ships when all of the above are green. `verification-s19.md` is produced inline during verification; `review-s19.md` follows the S18 pattern (`docs/plans/caresync-ai/review-s18.md`) and is the post-merge artifact that closes the loop.

---

## Out of Scope (explicit)

- Per-agent model swaps (gpt-5.5 → gpt-5-mini etc.) — separate slice (S19b)
- HAPI-side bearer-token interceptor — separate slice (post-challenge)
- Multilingual support — separate slice
- Per-patient SMART EHR/standalone launch — separate slice

These are the same exclusions the S18 WSA snapshot listed; no scope creep.

---

## ADLC Artifacts Produced

Under `docs/plans/caresync-ai/`:
1. `prd-s19.md` — the work spec (Threads A-E with acceptance criteria)
2. `grill-s19.md` — single grill session with cross-cuts
3. `implementation-plan-s19.md` — this plan, condensed
4. `verification-s19.md` — produced during verification
5. `review-s19.md` — produced during code review

Plus end-state files:
- `MODEL_CARD.md` (repo root)
- Updated `data/eval/labels.json` (committable, with `_meta.changeLog`)
- Updated `apps/api/src/fhir-data/population.ts`
- Updated `apps/api/src/governance/service.ts`
- Updated `apps/web/src/pages/Governance.tsx`
- Updated `data/eval/clinician-outreach.json` (today's entry)
- `reports/HL7-Challenge-Evaluation.S19.md` (post-merge regen)
