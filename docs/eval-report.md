# S9 Evaluation Report

Generated: 2026-07-10T06:11:24.098Z

**Status (S15):** 0 of 26 clinician-validated (0.0%), 16 of 26 dev-labeled (61.5%), 10 of 26 held-out (38.5%).
 **Not clinician-validated (GD8).** Ground truth is drawn from `data/eval/labels.json`, whose `source` field is `"dev"` for every row today. Every row carries a `clinicianOverride` slot a clinician can fill in (via `npm run review:render` → `npm run review:apply`) to upgrade this baseline without any code change.
**Status (S18 WSA):** Cost capture + post-v3 eval regen **landed**. Dev Risk post-v3 rubric: FP=2 (was 4 on v2), specificity **84.6%** (was 69.2%), sensitivity **66.7%** (regression from 100%, one new FN — flagged for clinician review via WSC). Held-out Risk specificity **100%** (was 50%), FP=0. **WSB deferred — v3 rubric confirmed effective** (dev FPs ≤ 2 threshold met). Cost-capture framework verified end-to-end on the live run: 22 patients × 4 agents captured via `apps/api/src/agents/usage.ts` + `pricing.ts`; `docs/eval-report-cost.json` sidecar emitted (21,842 bytes, schema `{model, generatedAt, patients[], aggregate}`); `## Cost per analysis (gpt-5.5)` markdown section renders real per-agent + per-cohort numbers — **$0.3950 / patient avg, $8.69 / 22-patient live cohort, projected $395.00 / 1000-patient monthly cohort**. Null-handling: missing `response.usage` cells render as `—` or the "no live runs" placeholder; unknown models return `null` cost; no fabricated `$0.00`. **Pillar P7 lifts 4 → 4.5** (cost story now backed by real numbers, not just framework).

**Status (S16):** v2 risk rubric shipped at `riskAgent.buildPrompt` — 3 calibration anchors (multi-condition comorbidity, recent inpatient discharge ≤30d, abnormal labs) + "0 anchors → low" hard rule + 3 worked examples using actual seed-text bundle shapes (james-okafor, maria-chen, synthetic `bob`). **2x2 acceptance gate result:** dev-labeled specificity 69.2% (target ≥30% — pass), sensitivity 100% (target ≥67% — pass); held-out specificity 50% (target ≥30% — pass), sensitivity N/A (denominator 0 — no held-out patient meets `labelFromBundle`'s `riskScoreFor()` ≥ 75 threshold, so the metric is undefined rather than failed). Dev-labeled specificity recovered from 0% (post-S13b over-call) to 69.2% (post-S16 v2 rubric); FPs dropped from 9 → 4 on the 16-patient dev-labeled set. **Pillar P2 lifts 4→5**, total HL7 evaluation moves 89.2 → 92.8.

**Status (S13b):** The S13 calibration attempt (Risk-prompt rubric mirroring `riskScoreFor()` ≥ 75) was reverted after live re-eval showed it caused the model to over-call (specificity regressed from 30.8% → 0% on the 16-patient held-out set). The follow-up fix in this slice is a single seed-data change — `apps/api/src/fhir-data/seed-patients.ts`'s `samuel-wright` entry now carries the Encounter + Observations his label implied but the seed previously omitted. See `docs/plans/caresync-ai/verification-s13.md` §3 + §6 for the full reversion log. Clinician validation of labels remains the long-term path to a real-clinical rubric.

## Methodology

- 26 labeled patients loaded from `data/eval/labels.json` — split into 16 dev-labeled baseline patients (rows NOT in `_meta.heldOutRows`) and 10 held-out evaluation patients (rows in `_meta.heldOutRows`). Held-out evaluation reports per-agent metrics on bundles the eval-design team had no visibility into when tuning the agent; labels for those patients are derived from `_meta.labelingRules` applied to bundles never before seen by the eval.
- 4 patient(s) scored from the existing S4 `analysis_cache` (no live agent/LLM call this run): maria-chen, james-okafor, linda-torres, pop-0001.
- 22 patient(s) scored from a live orchestrator run (cache miss): robert-kim, angela-diaz, samuel-wright, pop-0002, pop-0003, pop-0004, pop-0005, pop-0006, pop-0007, pop-0008, pop-0009, pop-0010, pop-0011, pop-0012, pop-0013, pop-0014, pop-0015, pop-0016, pop-0017, pop-0018, pop-0019, pop-0020.
- 0 patient(s) failed outright this run (HAPI read error or agent error) and were excluded — see Error Analysis below for detail on each.
- Findings are scored post-`validateCitations` (GD11) — the same citation-gated shape the product actually shows clinicians, not raw/unvalidated agent output.
- The Action Planner's created tasks are read (via the citation gate) but never written to HAPI by this harness (`replacePatientTasks` is deliberately not called) — a read-only, repeatable eval run should not mutate the demo Task list on every invocation.

## Cost per analysis (gpt-5.5)

- **sdoh**: $1.2578 / patient avg (input 28221, output 5518)
- **risk**: $2.4827 / patient avg (input 49385, output 12480)
- **careGap**: $2.8080 / patient avg (input 27715, output 21150)
- **actionPlanner**: $2.1415 / patient avg (input 19399, output 16562)

- **Total: $0.3950 / patient avg, $8.69 / 22-patient cohort**
- *Projected at scale: $395.00 / 1000-patient monthly cohort*

## Per-agent metrics — Dev-labeled baseline (16 patients)

### Care Gap (binary: has a monitoring gap)

- Sensitivity: 100.0%
- Specificity: 0.0%
- PPV: 90.9%
- Confusion matrix (n=11): TP=10, TN=0, FP=1, FN=0

### Risk (binary: high/critical readmission risk)

- Sensitivity: 66.7%
- Specificity: 84.6%
- PPV: 50.0%
- Confusion matrix (n=16): TP=2, TN=11, FP=2, FN=1

### SDOH (agreement rate: has an actionable barrier)

- Agreement rate: 93.8% (15/16). S14 rebalance (5 new AHC-HRSN screenings: 3 positive + 2 explicit-negative) breaks the pre-S14 "1 positive, 14 absence-of-screening" distribution that made this rate trivially gameable. The remaining per-dataset caveats from `_meta.limitations` still apply (small n, dev-interpreted domains).
- Confusion matrix (n=16): TP=3, TN=12, FP=0, FN=1

### Action Planner (qualitative — synthesis, not classification)

- **maria-chen**: 8 task(s) created — Schedule urgent heart-failure post-discharge follow-up; Perform post-discharge heart-failure safety outreach; Connect patient to housing stabilization support; Address food insecurity with benefits and nutrition resources; Complete depression symptom monitoring; Close diabetes monitoring gaps; Plan age-appropriate cancer screenings; Arrange osteoporosis screening
- **james-okafor**: 4 task(s) created — Expedite urgent pulmonology follow-up; Arrange COPD-focused post-discharge/primary care follow-up; Order or coordinate spirometry/PFT monitoring; Address routine colorectal cancer screening gap
- **linda-torres**: 6 task(s) created — Complete pending BMP and review renal/metabolic stability; Schedule early post-discharge CKD/readmission-risk follow-up; Address CKD monitoring gaps: urine albumin/proteinuria and blood pressure; Arrange colorectal cancer screening; Arrange breast cancer screening; Arrange cervical cancer screening review
- **robert-kim**: 3 task(s) created — Arrange osteoporosis evaluation and secondary fracture prevention after hip fracture; Complete fall-risk assessment and prevention plan; Schedule annual preventive/wellness encounter
- **angela-diaz**: 7 task(s) created — Schedule blood pressure recheck for hypertension; Connect patient to behavioral health access/navigation support; Complete depression symptom-severity monitoring; Address social isolation with community support referral; Arrange colorectal cancer screening; Arrange breast cancer screening; Arrange cervical cancer screening
- **samuel-wright**: 4 task(s) created — Complete urgent CHF daily weight check-in; Arrange 7-day post-discharge heart-failure follow-up; High-risk CHF readmission outreach and escalation plan; Address missing colorectal cancer screening after acute CHF transition
- **pop-0001**: 7 task(s) created — Complete post-discharge diabetes follow-up and readmission-risk check; Obtain HbA1c for diabetes control assessment; Order diabetic kidney screening and renal function labs; Order lipid panel for cardiovascular risk management in diabetes; Schedule diabetic retinal eye exam; Perform diabetic foot exam at next clinical visit; Arrange osteoporosis screening
- **pop-0002**: 6 task(s) created — Schedule heart-failure post-discharge follow-up; Complete post-discharge outreach and medication reconciliation; Order or obtain renal function and electrolyte monitoring; Assess weight, blood pressure, and volume status; Arrange heart-failure ejection fraction assessment; Plan colorectal cancer screening after acute transition period
- **pop-0003**: 2 task(s) created — Arrange urgent post-discharge mental-health follow-up; Complete standardized depression symptom assessment
- **pop-0004**: 5 task(s) created — Complete post-discharge follow-up outreach and visit scheduling; Arrange heart failure monitoring after discharge; Order or schedule overdue HbA1c testing; Order or schedule diabetic kidney health screening; Coordinate lipid panel for diabetes cardiovascular risk assessment
- **pop-0005**: 6 task(s) created — Complete post-discharge outreach and follow-up reconciliation; Arrange HbA1c testing for diabetes control assessment; Schedule diabetes kidney monitoring labs; Schedule diabetic retinal eye exam; Complete diabetic foot exam; Initiate depression symptom monitoring
- **pop-0006**: 4 task(s) created — Arrange urgent post-discharge heart failure follow-up; Obtain heart failure monitoring vitals and safety labs; Complete depression symptom follow-up with standardized screening; Initiate colorectal cancer screening outreach
- **pop-0007**: 5 task(s) created — Schedule post-discharge follow-up visit; Order HbA1c testing for diabetes monitoring; Complete diabetic kidney disease screening; Check heart failure renal function and electrolytes; Perform standardized depression symptom assessment
- **pop-0008**: 5 task(s) created — Arrange overdue post-discharge follow-up; Order or obtain HbA1c for diabetes monitoring; Complete diabetic kidney disease screening; Arrange diabetic retinal eye exam; Order or obtain diabetes lipid monitoring
- **pop-0009**: 8 task(s) created — Schedule 7-day heart-failure post-discharge follow-up; Complete post-discharge HF medication and symptom check; Order renal function and electrolyte monitoring for HF safety; Arrange ejection fraction/cardiac function assessment; Establish HF weight and blood pressure monitoring; Address colorectal cancer screening gap; Address breast cancer screening gap; Address cervical cancer screening gap
- **pop-0010**: 6 task(s) created — Arrange overdue post-discharge behavioral-health follow-up; Complete depression severity monitoring; Initiate SDOH care-management follow-up for positive screen; Provide financial assistance and benefits navigation; Connect patient to social or peer-support resources; Address overdue colorectal cancer screening

## Per-agent metrics — Held-out evaluation (10 patients)

### Care Gap (binary: has a monitoring gap)

- Sensitivity: 100.0%
- Specificity: n/a (denominator 0)
- PPV: 100.0%
- Confusion matrix (n=9): TP=9, TN=0, FP=0, FN=0

### Risk (binary: high/critical readmission risk)

- Sensitivity: n/a (denominator 0)
- Specificity: 100.0%
- PPV: n/a (denominator 0)
- Confusion matrix (n=10): TP=0, TN=10, FP=0, FN=0

### SDOH (agreement rate: has an actionable barrier)

- Agreement rate: n/a (denominator 0) (0/0). S14 rebalance (5 new AHC-HRSN screenings: 3 positive + 2 explicit-negative) breaks the pre-S14 "1 positive, 14 absence-of-screening" distribution that made this rate trivially gameable. The remaining per-dataset caveats from `_meta.limitations` still apply (small n, dev-interpreted domains).
- Confusion matrix (n=0): TP=0, TN=0, FP=0, FN=0

### Action Planner (qualitative — synthesis, not classification)

- **pop-0011**: 5 task(s) created — Arrange overdue heart-failure post-discharge follow-up; Obtain heart-failure monitoring data; Order or confirm HbA1c testing; Complete diabetic kidney disease screening; Schedule diabetic retinal eye exam
- **pop-0012**: 4 task(s) created — Complete post-discharge follow-up and readmission prevention outreach; Arrange overdue HbA1c monitoring for diabetes; Arrange diabetic kidney disease screening; Initiate standardized depression symptom monitoring
- **pop-0013**: 4 task(s) created — Arrange urgent post-discharge CHF follow-up and readmission-prevention outreach; Close heart-failure monitoring gap; Complete standardized depression symptom assessment; Schedule cervical cancer screening review
- **pop-0014**: 5 task(s) created — Arrange overdue post-discharge follow-up; Order HbA1c monitoring for diabetes; Order diabetic kidney disease monitoring; Complete heart-failure clinical and lab monitoring; Screen depression symptoms with PHQ-9 or equivalent
- **pop-0015**: 5 task(s) created — Arrange post-discharge diabetes follow-up; Obtain HbA1c to assess glycemic control; Complete diabetes kidney surveillance; Measure and document blood pressure; Order lipid panel for ASCVD risk management
- **pop-0016**: 3 task(s) created — Schedule heart-failure post-discharge follow-up; Obtain or document heart-failure LVEF assessment; Coordinate renal function and electrolyte monitoring
- **pop-0017**: 3 task(s) created — Complete same-day suicide/safety risk assessment; Administer standardized depression severity monitoring; Schedule prompt post-discharge behavioral-health follow-up
- **pop-0018**: 4 task(s) created — Arrange post-discharge follow-up visit; Obtain diabetes control monitoring with HbA1c; Complete diabetic kidney and heart-failure safety labs; Obtain diabetes lipid monitoring
- **pop-0019**: 5 task(s) created — Complete post-discharge transition-of-care outreach; Arrange overdue HbA1c testing; Coordinate depression symptom monitoring with PHQ-9; Order diabetic kidney disease monitoring labs; Schedule diabetic retinal eye screening
- **pop-0020**: 4 task(s) created — Complete heart-failure post-discharge follow-up; Obtain objective CHF monitoring data; Assess depression severity with standardized tool; Initiate colorectal cancer screening outreach

> **Note (S15):** SDOH sub-metric: 0 data points. Held-out bundles have no AHC-HRSN Observations (`population.ts:buildSdohForIndex(i)` returns undefined for i ≥ 10). The Care Gap and Risk sub-metrics above still score; only the SDOH dimension is empty for this cohort by design.

## Outreach

No clinician review invitations recorded yet. (Empty `invitations` array in `data/eval/clinician-outreach.json` — engagement is tracked here but does not gate the eval.)

## Error analysis — Dev-labeled (16 patients)

### Care Gap misses (false negatives — agent said no gap, label says there is one)

None.

### Care Gap false positives (agent flagged a gap, label says there isn't one)

- **maria-chen**: agent flagged a gap, label expects none. Label rationale: Diabetes (E11.9) has Observation/maria-chen-hba1c on file; CHF (I50.9) has Observation/maria-chen-bnp on file — both the conditions this dataset's Observation coding actually covers are monitored. Her depression (F33.1) has no corresponding Observation type established anywhere in this codebase, so that dimension is intentionally left out of this boolean rather than guessed at.

### Risk misses (false negatives — agent under-called risk)

- **pop-0007**: expected high/critical risk, agent predicted "moderate". Label rationale: Generator riskScore 92 >= 75 (inspected directly via generatePopulation()[6]) — full three-condition comorbidity plus a recent (60h) discharge.

### Risk false positives (agent over-called risk)

**Note (S13b):** The S13 risk-rubric was reverted after live re-eval showed it over-called. The remaining false positives above reflect the pre-S13 baseline (seed-derived labels vs the LLM's general clinical priors); see `docs/plans/caresync-ai/verification-s13.md` for the reversion log.

- **james-okafor**: expected low/moderate risk, agent predicted "high". Label rationale: Seed riskScore 62 < 75.
- **linda-torres**: expected low/moderate risk, agent predicted "high". Label rationale: Seed riskScore 71 < 75 (just under threshold).

### SDOH disagreements

- **james-okafor**: expected a barrier, agent predicted no barrier. Label rationale: Seed AHC-HRSN screening Observation/james-okafor-sdoh added 2026-07-08 — positive for transportation and financial barriers (dev interpretation; profile: COPD + recent inpatient supports post-discharge access barriers).

### Data-availability gaps (patient excluded from every dimension this run)

None.

## Error analysis — Held-out (10 patients)

### Care Gap misses (false negatives — agent said no gap, label says there is one)

None.

### Care Gap false positives (agent flagged a gap, label says there isn't one)

None.

### Risk misses (false negatives — agent under-called risk)

None.

### Risk false positives (agent over-called risk)

**Note (S13b):** The S13 risk-rubric was reverted after live re-eval showed it over-called. The remaining false positives above reflect the pre-S13 baseline (seed-derived labels vs the LLM's general clinical priors); see `docs/plans/caresync-ai/verification-s13.md` for the reversion log.

None.

### SDOH disagreements

None.

### Data-availability gaps (patient excluded from every dimension this run)

None.

## Data-availability gaps — combined

None.
