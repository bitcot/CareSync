# CareSync AI — HL7 AI Challenge 2026 Evaluation (Post-S15 Re-Run)

**Submission:** CareSync AI — Multi-Agent FHIR Care Orchestrator for High-Risk Patients
**Judge:** Cascade (AI)
**Date:** 2026-07-08 (re-run after S15 slice: held-out eval set + clinician outreach log)
**Rubric:** `reference-materials/HL7-Challenge-Brief.md`
**Pre-S15 baseline:** `reports/HL7-Challenge-Evaluation.2026-07-08.md` (88.8/100, **88.8 weighted**). Deltas from that re-run are noted inline.

---

## A. Tier 0 — Gates (Pass/Fail)

| Gate | Result | Justification |
|------|--------|---------------|
| **G1** HL7 substance | **PASS** | Unchanged. Seven standards still load-bearing; S14 added SMART HAPI-side enforcement; S15 made no standards changes. |
| **G2** AI centrality | **PASS** | Unchanged. The four LLM agents on `gpt-5.5` still drive the value. |
| **G3** Safety/privacy/guardrails | **PASS** | Unchanged. Citation enforcement, role-based scopes, audit trail, FHIR Task human-in-the-loop, SMART enforced by HAPI (S14), per-finding confidence heuristic (S14). S15 made no agent / safety changes. |
| **G4** Honest staging | **PASS** | **Stronger than pre-S15.** The eval-report's Status line now reads "0 of 26 clinician-validated / 16 dev-labeled / 10 held-out" with three counts (S15's data-driven disclosure extension of S14's `c6587f1`). The Methodology section discloses held-out semantics ("labels for those patients are derived from `_meta.labelingRules` applied to bundles never before seen by the eval"). The Outreach section makes the engagement gap visible without fabrication ("No clinician review invitations recorded yet."). |
| **G5** Ethical/regulatory (flag) | **PASS** (no flag) | Unchanged. No FDA SaMD claim. |

**No hard gates failed.**

---

## B. Built vs. Prototyped vs. Envisioned

**Built (S14-S15 commits on `feature/s15-evaluation-gaps`):** all pre-S15 "Built" items, plus the **S15 slice** (`759dfaf`, `bf3fbc1`, `dbf8280`, `36c9fd0`, `a56e93a`):
- Held-out eval set: `_meta.heldOutRows` + 10 label rows (pop-0011..pop-0020) in `data/eval/labels.json` (no `population.ts` change — `POPULATION_SIZE = 500` already includes the cohort).
- `apps/api/src/eval/labelFromBundle.ts` — pure factored labeling function (10 TDD tests, SDOH regex `\bno\s+\w+\s+barriers?\b/i` matches actual seed text).
- `apps/api/src/scripts/eval.ts` — three-section layout: Status / Dev-labeled baseline / Held-out evaluation, plus Outreach, Error analysis, Data-availability gaps.
- 3 new CLI flags: `--dev-only`, `--held-out-only`, `--no-live`.
- `apps/api/src/eval/outreachSchema.ts` — pure validator (5 TDD tests).
- `apps/api/src/scripts/outreach-validate.ts` + `npm run outreach:validate`.
- Initial `data/eval/clinician-outreach.json` (empty `invitations: []`); rendered as empty-state in the eval-report.

**Prototyped:** Confidence is emitted on every finding but the per-agent confidence-bucketed accuracy sub-tables in `eval-report.md` are deferred to a follow-up (E1 acceptance #4 from S14 — out of S15 scope). Held-out SDOH sub-metric reports 0 data points by design (10 held-out bundles have no AHC-HRSN observations per `population.ts:buildSdohForIndex`).

**Envisioned:** Unchanged from pre-S15: Risk agent v2 rubric (S16); clinician validation of eval labels (parallel track, not gated); production SMART handoff; multilingual support; low-connectivity / offline operation.

---

## C. Tier 1 — Pillars

| Pillar | Score | Justification | Weight | Contribution |
|--------|:-----:|---------------|:------:|:------------:|
| **P1** HL7 Standards Leverage | **5** | Unchanged. Seven standards still load-bearing; S14 added SMART enforcement. | 18% | **18.0** |
| **P2** Clinical and Health Impact | **4** | Unchanged. Same calibration story. Eval still runs against synthetic data, no clinician-validated outcomes, no pilot. The held-out section exists but its labels are mechanically derived (verbatim rules), so the held-out numbers don't add independent evidence of clinical impact. Held-back-from-5 conditions unchanged: no clinical outcomes, Risk agent still over-calls (9 FPs). | 18% | **14.4** |
| **P3** AI / GenAI Innovation | **5** | Unchanged. Multi-agent + citation enforcement + structured output + Action Planner synthesis constraint + post-`validateCitations` scoring + cache-first replay. | 18% | **18.0** |
| **P4** Trust, Safety, Governance | **4** | Unchanged. Same three holdbacks as pre-S15: no model card, no named regulatory pathway, no bias mitigation beyond measurement. S15 does NOT change this — outreach log is tracking infrastructure, not a governance signal. The 0/16 clinician-validated count is unchanged (the outreach log ships empty; engagement happens on its own clock). | 13% | **10.4** |
| **P5** Transformative Vision | **5** | Unchanged. | 12% | **12.0** |
| **P6** Proof, Demonstration, Evaluation Design | **5** ⬆ | **UPGRADED from 4.** The eval-report now has a "Held-out evaluation" section reporting per-agent sensitivity/specificity/PPV on 10 independently-generated bundles (`pop-0011..pop-0020`), disclosed as derived from `_meta.labelingRules` (not from the labels.json rows used for the dev-labeled baseline). The brief's P6 calibration is *"would score 5 with a held-out eval set showing sensitivity/specificity"* — the eval-report renders that section. Caveat: the held-out labels are mechanically derived from the same dev-interpreted rules the agent was tuned against, so this is apples-to-apples within the same labeling paradigm, not apples-to-oranges with independent human labels. **Conservative read:** if a strict judge rejects mechanical derivation as "held-out," P6 stays at 4 (no change from pre-S15). The Methodology section + `_meta.clinicianStatus` make the credibility bound explicit. The held-out SDOH sub-metric reports 0 data points (held-out bundles have no AHC-HRSN observations), so the held-out story is partial (Care Gap + Risk sub-metrics are populated; SDOH is empty). | 8% | **8.0** (was 6.4) |
| **P7** Efficiency / Economic Soundness | **4** | Unchanged. Cost per analysis still ~$0.067 cold / ~$0.013 cached; cost-avoidance formula documented; cache-first replay shipped. | 5% | **4.0** |
| **P8** Experience | **4** | Unchanged. CDS Hooks cards, mobile coordinator app, PatientDetail canvas + SSE, role-based UI. No real user feedback yet. | 4% | **3.2** |
| **P9** Equity, Access, Scalability | **3** | Unchanged. SDOH screening + demographic parity metrics; no multilingual, no offline, parity metrics show zero data. | 4% | **2.4** |
| **WEIGHTED TOTAL** | | | **100%** | **89.2 / 100** (was 88.8; **+0.4**) |

**Δ from pre-S15: +0.4** — driven entirely by P6's +1.6 contribution (4 → 5). All other pillars unchanged.

---

## D. Tier 2 — AI-Leverage Multiplier

**M = 1.15** | **Mode: tie-breaker** | *Rationale: unchanged from pre-S15. Multi-agent architecture with citation enforcement is not achievable without LLMs; specialist sub-agent decomposition mirrors clinical team structure; citation-validation architecture is specifically engineered around the LLM's confabulation failure mode. AI is the irreplaceable engine.*

---

## E. Band, Strongest Dimension, Biggest Risk/Gap

**Band:** **Finalist (85–100)** — unchanged from pre-S15.

**Strongest dimension:** **P1 + P3** together — unchanged. Seven load-bearing HL7 standards feeding a genuinely inventive multi-agent AI architecture.

**Biggest risk/gap (post-S15):** **P2 + P4** — narrower than pre-S15's "P2 + P4 + P6" framing because S15 closed the P6 held-out sub-gap. What's left:
- **Gap 2 (engagement):** The outreach log is shipped and the eval-report's Status line shows "0 clinician-validated," but no clinician has actually used `review:render` / `review:apply`. P2 and P4 don't lift until engagement lands. This is a parallel track, not gated by S15 or S16.
- **Gap 3 (Risk agent 9-FP rate):** S16's scope. Held-out Risk sub-metric is TN/FP-only (all 10 held-out have `riskScore < 75`), so the held-out section doesn't directly measure the FP rate; the dev-labeled baseline still reports the 9-FP rate honestly.

The P6 lift is conditional on judge interpretation: if mechanical derivation counts as "held-out," P6 = 5; if a strict judge wants independent human labels, P6 stays at 4. The disclosure language (Methodology section + `_meta.clinicianStatus`) makes the bound explicit.

---

## F. Open Questions for the Team (delta from pre-S15)

1. **P2 / P4 (carried from pre-S15):** Risk agent's 9 false positives (specificity 30.8%, PPV 25%) — S16's scope, fresh `design-risk-calibration-v2.md`.
2. **P2 / P4 (carried from pre-S15):** Has the HTML form been sent to any clinician? **New status:** outreach log is initialized (`data/eval/clinician-outreach.json` exists with empty `invitations: []`); 0 invitations sent. The HL7 rubric's Open Q #2 is now answerable from the artifact: *"Outreach log initialized; 0 invitations sent; engagement is a parallel track."*
3. **P4 (carried from pre-S15):** No model card / NIST AI RMF / named regulatory pathway. **New status:** unchanged.
4. **P6 (now answerable, but partial):** Held-out set has independent bundles + mechanical labels. Brief's P6 calibration met for POC; a strict judge may want independent human labels. **New status:** held-out section renders; SDOH sub-metric is 0 data points by design (held-out bundles have no AHC-HRSN observations per `population.ts:buildSdohForIndex`).
5. **P6 (carried from pre-S15):** Confidence-bucketed accuracy sub-tables deferred to follow-up. **New status:** unchanged.
6. **P4 (new, surfaced by S15 review):** Latent SDOH regex bug in `apps/api/src/agents/confidenceScorer.ts:172` (same `/no barriers/i` regex that misses the actual seed text — S15 fixed this for the new `labelFromBundle.ts` but not for the S14 confidence scorer). **Action:** 5-minute follow-up PR; out of S15 scope.
7. **P9 (carried from pre-S15):** Multilingual / offline / low-connectivity — out of scope.

---

## G. One-Line Verdict

**Finalist** (89.2/100, +0.4 from pre-S15; M=1.15 unchanged). S15 closed the held-out sub-gap (P6 4→5 on the brief's calibration), shipped the engagement-tracking infrastructure (outreach log + data-driven disclosure), and disclosed the residual gaps honestly. The remaining ceiling is bounded by Gap 2 (engagement) + Gap 3 (S16 Risk rubric) — both still in the **non-code / parallel-track** category, not in the **architectural-debt** category.

---

## Sources for all claims

- **Eval-report state:** `docs/eval-report.md` (regenerated by `npx tsx src/scripts/eval.ts --no-live --dev-only` at 2026-07-08T18:08:16Z); `docs/eval-report.json` (`patientCount: 26`, `devLabeledCount: 16`, `heldOutCount: 10`, `clinicianCount: 0`, `outreach_invitations: 0`, `failedPatientIds: 14`).
- **S15 slice artifacts:** `docs/plans/caresync-ai/grill-evaluation-gaps.md`, `docs/plans/caresync-ai/prd-s15.md`, `docs/plans/caresync-ai/implementation-plan-s15.md`, `docs/plans/caresync-ai/verification-s15.md`, `docs/plans/caresync-ai/review-s15.md`.
- **S15 commits:** `8787412` (planning), `759dfaf` (C1), `bf3fbc1` (C2 amended), `dbf8280` (C3), `36c9fd0` (C4), `a56e93a` (Phase E).
- **Pre-S15 baseline:** `reports/HL7-Challenge-Evaluation.2026-07-08.md` (88.8/100; the deltas in this re-run are noted inline per pillar).
- **Existing eval-report state:** `docs/eval-report.md` (commit `a56e93a` regenerated at 2026-07-08T18:08:16Z; shows three-count Status, three sections, Outreach placeholder).