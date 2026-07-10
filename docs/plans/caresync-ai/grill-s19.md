# Grill — S19 Trust, Safety, and Eval Closure

> **PLAN_ID:** `caresync-ai` · **Date:** 2026-07-10
> **Trigger:** The fresh 2026-07-10 HL7 evaluation reports four P4 holdbacks (no model card, parity measured not mitigated, 0/26 clinician-validated, safety-net regression) and two P6 holdbacks (thin eval data — 1 Care Gap negative, held-out sensitivity undefined). The risk regression (Risk sensitivity 100% → 66.7%) is a new finding from the post-v3 eval regen. This grill re-derives S19's scope as the single slice that closes all five.

---

## 1. The biggest-risk decomposition (verbatim from §E)

> **Biggest risk/gap: P4 (Trust, Safety, Governance)** — four holdbacks:
> 1. **No model card / NIST AI RMF / named regulatory pathway.** Strong safety-by-design but no formal governance documentation.
> 2. **0/26 clinician-validated eval labels.** All ground truth is dev-labeled.
> 3. **Parity measured, not mitigated.** Demographic parity is computed from real FHIR demographics but no action is taken on observed disparities — measurement without mitigation.
> 4. **Sensitivity regression from clamp.** pop-0007 (riskScore 92) was under-called as "moderate" by the deterministic clamp. A safety net that suppresses genuine high-risk findings is itself a safety concern.
>
> Secondary risk: **P6 eval data thinness** — Care Gap specificity rests on 1 negative example, held-out risk sensitivity is structurally undefined.

Five distinct surfaces. S19 owns all five in one slice.

---

## 2. Cross-cut 1 — Is the clamp over-correcting?

**Decision: NO. The clamp is correct. The label is wrong.**

Reading `confidenceScorer.ts:312-330`:
```
if (output.riskLevel !== 'high' && output.riskLevel !== 'critical') return output;
const deterministicScore = riskScoreFor(conditionCount, recencyHours);
if (deterministicScore >= CRITICAL_RISK_THRESHOLD) return output;       // 75
if (bundleHasAbnormalLab && bundleHasRecentEncounter) return output;
return { ...output, riskLevel: 'moderate' };
```

For pop-0007 (3-condition comorbidity, encounter 1500h ago, no Observations):
- `conditionCount = 3`
- `recencyHours = 1500`
- `riskScoreFor(3, 1500) = 0.10 + 0.54 + 0 + 0.08 = 0.72 → riskScore 72 < 75` → **first preservation fails**
- `bundleHasAbnormalLab(pop-0007) = false` (no Observations seeded) → **second preservation fails**
- Clamp downgrades to 'moderate'. Correct behavior given the bundle evidence.

The HL7 evaluator's "the clamp may be over-correcting" framing is wrong. The actual cause is a label/generator drift: `data/eval/labels.json` records `seedRiskScore: 92` for pop-0007 (which assumes recency=60h), but the current generator produces recency=1500h → riskScore=72. The label is stale; the bundle is real; the clamp did the right thing on the bundle.

**Implication for S19:** repair the label (C3), not the clamp. The clamp is the deterministic safety net we explicitly built and need to keep.

---

## 3. Cross-cut 2 — What should "parity mitigation" actually do?

**Decision: threshold-triggered audit row + visible tile. No model retraining, no re-weighting.**

The HL7 evaluator's framing — "no mitigation action is taken on observed disparities" — implies some active intervention. But the project is at POC scope with a 500-patient procedural cohort. "Mitigation" at this level means **escalation**, not correction:

- A defined threshold (e.g., `PARITY_DELTA_THRESHOLD = 15` absolute risk-score delta between max and min group) flags a disparity as "concerning."
- A "concerning" flag writes a single audit row (`action: 'parity-mitigation-recommended'`, `outcome: 'flagged'`) and renders a tile on the Governance page.
- The tile recommends an action: "audit rubric for that group", "re-run with refreshed cohort", or "insufficient sample" (when any group has n<3).

This is the **honest** scope: parity mitigation at POC scale is *escalation*, not intervention. Saying anything stronger (re-train, re-weight, etc.) is aspirational; the project hasn't shipped anything that would actually change model behavior on the basis of parity observations.

**Audit row encoding:** The schema's `AuditEntry` is `(actor, action, fhirResource, outcome)` — no `details` column. Encoding the flag list in `fhirResource` via a structured suffix (`Governance/parity/byRace:delta23`) keeps within the 4-field contract without a schema migration.

---

## 4. Cross-cut 3 — Care Gap specificity is unfixable without more negative labels

**Decision: seed more monitoring-on-file procedural patients.**

`labels.json._meta.limitations` self-discloses: *"Care Gap ground truth is skewed positive (10 true / 1 false / 5 unlabeled) ... there is only one real negative example (maria-chen, who has both her HbA1c and BNP on file)."*

The labeling rule `expectedHasGap := Condition present AND no matching LOINC Observation on file` is correct. The bottleneck is the **generator** — `generatePopulation()` never seeds baseline monitoring Observations for pop-XXXX patients. Mar-001..mar-005 (maria-chen style) need to exist in the procedural cohort too.

Adding `buildObservationsForIndex(i)` that seeds matching HbA1c/BNP/eGFR Observations on a deterministic subset (e.g., `i % 7 == 6` → ~71 of 500 procedural patients) gives the eval ~5-10 more true-negative cases. The Care Gap specificity metric becomes defined rather than "0% on 1 negative."

**Why not just flip some labels to false?** The labels are derived from the bundle evidence (no HbA1c on file → has gap). Flipping without seeding the bundle evidence is fabrication. The honest fix is to extend the generator.

---

## 5. Cross-cut 4 — Held-out sensitivity becoming defined

**Decision: schedule pop-0014 (i=13) for the 3-condition mix + recency ≤ 72h.**

`riskScoreFor(3, 60) = 0.10 + 0.54 + 0.20 + 0.08 = 0.92 → 92 ≥ 75`. Held-out row gets `expectedHighRisk: true`. Held-out sensitivity is now defined (denominator > 0).

This is a 1-line generator change (the condition mix cycles naturally; we just verify that one specific index lands on the 3-condition combo) plus a label row update. No new architecture.

**Why not lower the threshold?** `riskScoreFor ≥ 75` is `CRITICAL_RISK_THRESHOLD`, used everywhere else in the codebase. Lowering it for one slice would break the cross-references in `confidenceScorer.ts`, `governance/service.ts`, and `population.ts`. The label rule stays; the generator gets a deterministic nudge.

---

## 6. Cross-cut 5 — Model card surface area

**Decision: 9 NIST AI RMF-aligned sections, repo root, no separate NIST AI RMF doc.**

A "model card" is a well-known pattern (Mitchell et al. 2019); NIST AI RMF (2023) is the regulatory-adjacent framework. The HL7 judge's open question Q3 names both. Putting the model card at the repo root (alongside `HANDOFF.md`, `SUBMISSION.md`) makes it discoverable for reviewers without a separate compliance doc.

**Sections (in this order):**
1. Model identity
2. Intended use
3. Out-of-scope uses
4. Architecture summary
5. Training data disclosure
6. Evaluation results (link to `docs/eval-report.md`)
7. Risk and limitations (explicit list — confidence is heuristic, clamp is conservative, ground truth is dev-labeled)
8. NIST AI RMF mapping (GOVERN / MAP / MEASURE / MANAGE → concrete code paths)
9. Contact + ack

The risk-and-limitations section is the one that earns reviewer trust: it states *what this system can't do* explicitly. That's the same posture `SUBMISSION.md §3.2` takes for "decision-support, not autonomous decision-making."

**No separate NIST AI RMF doc** — the mapping table in §8 is enough at POC scope. A standalone compliance doc would be aspirational at this stage.

---

## 7. Slice structure (final)

| Thread | File footprint | Verifies |
|---|---|---|
| A — MODEL_CARD.md | 1 new file + 1 test | File existence + 9-section headers; reviewer-facing artifact |
| B — Parity mitigation | `governance/service.ts`, `Governance.tsx`, 2 tests | Threshold boundaries, tile shows/hides, audit row on flag |
| C — Eval data closure | `population.ts`, `labels.json`, 1 test | Generator behavior; pop-0007 flip on audit trail |
| D — Safety-net transparency | `confidenceScorer.ts`, `eval.ts`, 1 test | Clamp sentinel; eval-report new section |
| E — Outreach log helper | `log-outreach.ts`, `outreach.json`, 1 test | Schema-validated entry; today's `status: 'sent'` |

Five commits in one branch. One PR.

---

## 8. Open questions deferred (not in S19)

- **Q5 (S18 §F) — SMART enforcement verification on HAPI side.** Single `curl` test; deferred to S19b or later.
- **Q8 (S18 §F) — Multilingual support.** Post-challenge; different problem space.
- **HAPI-side bearer-token interceptor.** Requires custom Java build; post-challenge.
- **Per-user SMART EHR/standalone launch.** Different architecture; post-challenge.

These were already named in `HL7-Challenge-Evaluation.2026-07-09-post-s18-wsa.md §A` as deferred. S19 inherits those deferrals.

---

## Status

This grill closes here. The next ADLC step is `writing-plans`, which reads this file + `prd-s19.md` and produces `implementation-plan-s19.md` (already drafted at `/Users/manju/.claude/plans/ancient-greeting-fountain.md` — see plan-mode artifact). Code work follows.