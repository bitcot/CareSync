# S9 Evaluation Report

Generated: 2026-07-08T13:34:18.044Z

**Status (S14):** 0 of 16 clinician-validated (0.0%), 16 of 16 dev-labeled (100.0%).
 **Not clinician-validated (GD8).** Ground truth is drawn from `data/eval/labels.json`, whose `source` field is `"dev"` for every row today. Every row carries a `clinicianOverride` slot a clinician can fill in (via `npm run review:render` → `npm run review:apply`) to upgrade this baseline without any code change.

**Status (S13b):** The S13 calibration attempt (Risk-prompt rubric mirroring `riskScoreFor()` ≥ 75) was reverted after live re-eval showed it caused the model to over-call (specificity regressed from 30.8% → 0% on the 16-patient held-out set). The follow-up fix in this slice is a single seed-data change — `apps/api/src/fhir-data/seed-patients.ts`'s `samuel-wright` entry now carries the Encounter + Observations his label implied but the seed previously omitted. See `docs/plans/caresync-ai/verification-s13.md` §3 + §6 for the full reversion log. Clinician validation of labels remains the long-term path to a real-clinical rubric.

## Methodology

- 16 labeled patients loaded from `data/eval/labels.json` (6 curated hero/panel patients + 10 deterministic `pop-XXXX` procedural patients — the plan's "~5 curated hero + ~10 Synthea" with the disclosed S5 substitution: no real Synthea/Java in this repo).
- 3 patient(s) scored from the existing S4 `analysis_cache` (no live agent/LLM call this run): maria-chen, james-okafor, linda-torres.
- 0 patient(s) scored from a live orchestrator run (cache miss): none.
- 13 patient(s) failed outright this run (HAPI read error or agent error) and were excluded — see Error Analysis below for detail on each.
- Findings are scored post-`validateCitations` (GD11) — the same citation-gated shape the product actually shows clinicians, not raw/unvalidated agent output.
- The Action Planner's created tasks are read (via the citation gate) but never written to HAPI by this harness (`replacePatientTasks` is deliberately not called) — a read-only, repeatable eval run should not mutate the demo Task list on every invocation.

## Per-agent metrics

### Care Gap (binary: has a monitoring gap)

- Sensitivity: 100.0%
- Specificity: 0.0%
- PPV: 50.0%
- Confusion matrix (n=2): TP=1, TN=0, FP=1, FN=0

### Risk (binary: high/critical readmission risk)

- Sensitivity: 100.0%
- Specificity: 0.0%
- PPV: 33.3%
- Confusion matrix (n=3): TP=1, TN=0, FP=2, FN=0

### SDOH (agreement rate: has an actionable barrier)

- Agreement rate: 66.7% (2/3). S14 rebalance (5 new AHC-HRSN screenings: 3 positive + 2 explicit-negative) breaks the pre-S14 "1 positive, 14 absence-of-screening" distribution that made this rate trivially gameable. The remaining per-dataset caveats from `_meta.limitations` still apply (small n, dev-interpreted domains).
- Confusion matrix (n=3): TP=1, TN=1, FP=0, FN=1

### Action Planner (qualitative — synthesis, not classification)

- **maria-chen**: 8 task(s) created — Complete urgent post-discharge medication reconciliation; Schedule and confirm 7-day heart-failure post-discharge follow-up; Obtain repeat BMP/electrolytes and renal function; Refer for housing stabilization support; Connect to food assistance and heart-failure/diabetes-appropriate nutrition resources; Arrange diabetes follow-up for elevated HbA1c; Order missing diabetes kidney and lipid screening; Complete depression symptom monitoring and engagement check
- **james-okafor**: 4 task(s) created — Expedite urgent pulmonology follow-up; Arrange COPD-focused post-discharge/primary care follow-up; Order or coordinate spirometry/PFT monitoring; Address routine colorectal cancer screening gap
- **linda-torres**: 6 task(s) created — Complete pending BMP and review renal/metabolic stability; Schedule early post-discharge CKD/readmission-risk follow-up; Address CKD monitoring gaps: urine albumin/proteinuria and blood pressure; Arrange colorectal cancer screening; Arrange breast cancer screening; Arrange cervical cancer screening review

## Error analysis (mandatory — GD8, the P6 4→5 lever)

### Care Gap misses (false negatives — agent said no gap, label says there is one)

None.

### Care Gap false positives (agent flagged a gap, label says there isn't one)

- **maria-chen**: agent flagged a gap, label expects none. Label rationale: Diabetes (E11.9) has Observation/maria-chen-hba1c on file; CHF (I50.9) has Observation/maria-chen-bnp on file — both the conditions this dataset's Observation coding actually covers are monitored. Her depression (F33.1) has no corresponding Observation type established anywhere in this codebase, so that dimension is intentionally left out of this boolean rather than guessed at.

### Risk misses (false negatives — agent under-called risk)

None.

### Risk false positives (agent over-called risk)

**Note (S13b):** The S13 risk-rubric was reverted after live re-eval showed it over-called. The remaining false positives above reflect the pre-S13 baseline (seed-derived labels vs the LLM's general clinical priors); see `docs/plans/caresync-ai/verification-s13.md` for the reversion log.

- **james-okafor**: expected low/moderate risk, agent predicted "high". Label rationale: Seed riskScore 62 < 75.
- **linda-torres**: expected low/moderate risk, agent predicted "high". Label rationale: Seed riskScore 71 < 75 (just under threshold).

### SDOH disagreements

- **james-okafor**: expected a barrier, agent predicted no barrier. Label rationale: Seed AHC-HRSN screening Observation/james-okafor-sdoh added 2026-07-08 — positive for transportation and financial barriers (dev interpretation; profile: COPD + recent inpatient supports post-discharge access barriers).

### Data-availability gaps (patient excluded from every dimension this run)

- **robert-kim**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **angela-diaz**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **samuel-wright**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0001**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0002**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0003**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0004**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0005**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0006**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0007**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0008**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0009**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
- **pop-0010**: No findings produced for this patient in this eval run (HAPI read failure, or a live-agent-run failure with no cache fallback) — excluded from every metric dimension, not silently dropped. (error: You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-errors.)
