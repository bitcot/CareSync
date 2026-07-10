# PRD — S19: Trust, Safety, and Eval Closure

> **Status:** Ready for `writing-plans` (ADLC: specify → plan)
> **PLAN_ID:** `caresync-ai` · **Slice:** S19 · **Branch:** `feature/s19-trust-eval-closure`
> **Author:** Manjula / Bitcot · 2026-07-10
> **Inputs locked:** (a) pop-0007 label flips from `expectedHighRisk: true` → `false` (honest fix per `s13-risk-rubric-reverted.md`); (b) clinician outreach email goes out today, so `data/eval/clinician-outreach.json` gets a real `status: 'sent'` entry on merge.
>
> **Upstream artifacts:**
> - `reports/HL7-Challenge-Evaluation.2026-07-10-fresh.md` §E (biggest risk/gap, 4 P4 holdbacks), §F (open questions Q1-Q8)
> - `reports/HL7-Challenge-Evaluation.2026-07-09-post-s18-wsa.md` (S18 WSA snapshot — pre-S19 baseline)
> - `docs/eval-report.md` line 8 (post-S18 WSA numbers; Risk sensitivity 66.7% with pop-0007 FN; Care Gap specificity 0% on 1 negative)
> - `docs/plans/caresync-ai/s18-clinician-engagement.md` (drafted WSC email; awaits `status: 'sent'` entry)
> - `apps/api/src/agents/confidenceScorer.ts:312-330` (`clampRiskLevel` safety net; verified correct for pop-0007 bundle)
> - `apps/api/src/fhir-data/population.ts:127-134` (`riskScoreFor`; `generatePopulation()[6]` produces riskScore 72, not 92)
> - `apps/api/src/governance/service.ts:260-291` (`getParityMetrics`; computes snapshot but emits no mitigation)
> - `data/eval/labels.json._meta` (limitations disclosure; heldOutRows; labelingRules)
>
> **Memory anchors:** `s13-risk-rubric-reverted.md` (no prompt-only fixes for real failures — repair the world, not the rubric), `never-override-real-with-fake.md` (no fabricated cost / parity numbers; honest nulls).
>
> **Tracker note:** This POC is Jira-free and file-backed. Slice name `S19` continues the existing `S#` convention used by S1–S18.

---

## Problem Statement

The fresh 2026-07-10 HL7 evaluation identifies four holdbacks clustered under P4 (Trust/Safety) and P6 (Proof/Eval), plus a new sensitivity regression (Risk 66.7%, pop-0007 FN). The pre-S19 score is **78.8 weighted × 1.15 = 90.6/100** (Finalist band, but capped).

| Open question | Pillar | Diagnosed cause |
|---|---|---|
| Q1 — Risk sensitivity regression | P2 + P4 + P6 | **Label/generator drift**, not a clamp bug. `labels.json:pop-0007` says `seedRiskScore: 92` (60h assumption); current `generatePopulation()[6]` produces recency=1500h → `riskScoreFor(3, 1500h) = 72 < 75`. The clamp at `confidenceScorer.ts:312-330` is correct; the label is wrong. |
| Q2 — Clinician engagement | P4 + P6 | `s18-clinician-engagement.md` email drafted; `data/eval/clinician-outreach.json.invitations = []`; engagement awaits send. |
| Q3 — Model card / NIST AI RMF | P4 | No reviewer-facing `MODEL_CARD.md`; closest is the internal v3 rubric doc. |
| Q4 — Parity mitigation | P4 | `getParityMetrics` computes a snapshot, returns it, stops. No threshold, no escalation, no audit row. |
| Q5 — Care Gap specificity = 0% on 1 negative | P6 | `_meta.limitations` self-discloses; procedural generator never seeds baseline Observations. |
| Q6 — Held-out sensitivity N/A | P6 | All 10 held-out patients happen to have `riskScoreFor() < 75`; labeling rule makes the metric undefined rather than failed. |

From a **submission reviewer**'s perspective, P4's "no model card" + "parity measured not mitigated" holdbacks are explicitly named in §E as the biggest risk/gap. From a **clinical evaluator**'s perspective, the pop-0007 regression looks like a clamp bug; reading `confidenceScorer.ts`, the clamp is correct, but the audit trail is silent — there's no row showing the clamp downgraded a 'high' to 'moderate' and why. From a **hospital CIO**'s perspective, "parity measured, not mitigated" reads as performative governance.

S19 closes all six in one PR.

---

## Solution

Five threads, one branch, sequenced so each commit is reviewable in isolation. Per ADLC, the lifecycle is `prd-s19.md` → `grill-s19.md` → `implementation-plan-s19.md` → code → `verification-s19.md` → `review-s19.md` → PR.

| Thread | Outcome | Commit | Acceptance criteria |
|---|---|---|---|
| **A — MODEL_CARD.md** | Repo-root artifact with 9 NIST AI RMF-aligned sections. | Commit 1 (docs + integrity test) | File exists; 9 sections present in order; integrity test passes; references `docs/eval-report.md` + `docs/SOLUTION_OVERVIEW.md`. |
| **B — Parity mitigation path** | `parityMitigationFlags` pure function; tile in Governance.tsx; audit row on flag. | Commit 2 | Threshold boundary tests pass; tile shows when flags > 0, hides when empty; `Governance.test.tsx` passes; `service.test.ts` pins `getParityMetrics` shape. |
| **C — Eval data closure** | More negative Care Gap labels; one positive held-out Risk label; pop-0007 label flip. | Commits 3, 4, 5 | `population.test.ts` pins new generator behavior; `labels.json._meta.changeLog` records the pop-0007 flip; `eval.ts` regen shows Risk FN 1→0 and held-out sensitivity becomes defined. |
| **D — Safety-net transparency** | `clampRiskLevel` returns `_safetyNetApplied` when downgrade occurs; eval-report adds `## Safety-net activity` section. | Commit 6 | `confidenceScorer.test.ts` pins pop-0007 case (LLM 'high' → clamp 'moderate' + sentinel); eval-report regen shows the section. |
| **E — Outreach log helper + entry** | `scripts/log-outreach.ts`; today's `status: 'sent'` entry appended. | Commit 7 | Schema-validated entry appended; `outreach:validate` exits 0; round-trip test passes. |

### Score-card delta (predicted)

| Pillar | Pre-S19 | Post-S19 (engagement attempted only) | Post-S19 (clinician validates ≥5) |
|---|:---:|:---:|:---:|
| P2 (Clinical Impact) | 4 | 4.5 (pop-0007 flip clears the regression) | 5 |
| P4 (Trust/Safety) | 4 | 5 (model card + parity mitigation + safety-net transparency) | 5 |
| P6 (Proof/Eval) | 4 | 4.25 (engagement attempted + eval data closure) | 4.5 (≥5 labels validated) |
| **Weighted** | **78.8 → 90.6** | **~92** | **~93** |

The 92-93 ceiling is the Finalist band's upper region. Holding back from the 95+ band requires HAPI-side bearer-token enforcement, multilingual support, and per-user SMART launch — all post-challenge.

### Why one slice, not two

The five threads share a single architectural decision (the safety net is correct; the labels were wrong; this changes how the next round of engagement talks about the rubric). Splitting into S19a/S19b would re-create the audit-trail blur S13 left behind. One slice, one PR, one story.

### Why no S19-lite / 6th agent node

Same reasoning as S18 §"Why not S18-lite": the Safety Officer pattern requires a 5th LLM call (worsens P7), architectural surface in `analysisGraph.ts` (more code to maintain), and a narrative commitment the demo must lean into. None of these move the rubric. Deferred post-challenge.

---

## Critical Files

**Created:**
- `MODEL_CARD.md` (repo root)
- `apps/api/src/scripts/log-outreach.ts` (entry-append helper, mirrors `apply-clinician-review.ts` pattern)
- `apps/api/test/docs-model-card.test.ts` (integrity test)

**Modified:**
- `data/eval/labels.json` (pop-0007 flip; pop-0014 positive-risk; pop-0021..pop-0025 negative-care-gap; `_meta.changeLog`)
- `apps/api/src/fhir-data/population.ts` (`buildObservationsForIndex`; held-out-positive scheduling)
- `apps/api/src/fhir-data/population.test.ts` (new pins)
- `apps/api/src/governance/service.ts` (`parityMitigationFlags`; `getParityMetrics` return shape; `parity-mitigation-recommended` audit row)
- `apps/api/src/governance/service.test.ts` (new pins)
- `apps/web/src/pages/Governance.tsx` (Mitigation Recommended tile)
- `apps/web/src/pages/Governance.test.tsx` (tile-shows/hides)
- `apps/api/src/agents/confidenceScorer.ts` (`clampRiskLevel` return shape carries `_safetyNetApplied`)
- `apps/api/src/agents/confidenceScorer.test.ts` (pop-0007 clamp tests)
- `apps/api/src/eval/eval.ts` (`## Safety-net activity` section)
- `data/eval/clinician-outreach.json` (today's `status: 'sent'` entry)

---

## Out of Scope (explicit)

- Per-agent model swaps (gpt-5.5 → gpt-5-mini etc.) — separate slice (S19b)
- HAPI-side bearer-token interceptor — separate slice (post-challenge)
- Multilingual support — separate slice (post-challenge)
- Per-patient SMART EHR/standalone launch — separate slice (post-challenge)
- Schema-locked-field expansion for `clinician-outreach.json` (the richer §4 fields in `s18-clinician-engagement.md` stay in the engagement artifact; schema stays at S15's 5-field contract for this slice)

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Adding more negative Care Gap labels could regress specificity in the opposite direction (true negatives are now real, not a single point) | The new labels are seeded by the deterministic generator and pinned by `population.test.ts`. Specificity will become defined but not necessarily >0% on first run; that is the honest state. |
| pop-0007 label flip changes the eval baseline downstream of `docs/eval-report.md`'s Status line | The Status line at `eval.ts:461-466` references the changeLog entry in `labels.json._meta`; reviewers can audit the flip. The eval regen prints the new metrics with a "S19 label flip" annotation. |
| `clampRiskLevel` shape change (`_safetyNetApplied` field) ripples through `RiskOutput` consumers | Field is namespaced with `_` (underscore prefix) — convention used elsewhere in the codebase for tool-internal fields. `RiskOutput` interface gains an optional field; all existing readers (orchestrator, eval, frontend) ignore unknown fields by design. |
| Today's outreach entry uses `[redacted until consent]` placeholder for `reviewer` | Per `s18-clinician-engagement.md` §4 protocol — the schema's `_meta.consentBoundary` is "only set after confirming the clinician is OK with their name appearing in a public eval artifact." Until then, alias placeholder. |
| Thread A integrity test could fail on file path resolution | Test uses `path.resolve(__dirname, '../../../../MODEL_CARD.md')` — same convention `apply-clinician-review.ts` and `outreach-validate.ts` use. |