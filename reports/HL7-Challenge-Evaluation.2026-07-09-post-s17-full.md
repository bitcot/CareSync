# HL7 AI Challenge 2026 — Competitor Evaluation Report

> **Evaluator:** Judge (critic mode)
> **Submission:** CareSync AI — full project repository
> **Rubric:** `reference-materials/HL7-Challenge-Brief.md` (Idea B rubric)
> **Date:** 2026-07-09
> **Scope:** Full codebase review — `apps/api/`, `apps/web/`, `data/eval/`, `docs/`, `plan.md`, `docker-compose.yml`

---

## A. Tier 0 — Gates

| Gate | Result | Justification |
|------|--------|---------------|
| G1 — HL7 substance | **PASS** | FHIR R4 (HAPI in Docker, real reads/writes), SMART Backend Services (RS256 JWT assertion, RFC 7523 token exchange), CDS Hooks (patient-view discovery + service endpoint), FHIR Task (created by Action Planner, role-filtered queues), FHIR Subscription (HAPI rest-hook → webhook relay → SSE). All five are load-bearing — removing any breaks the core workflow. |
| G2 — AI centrality | **PASS** | Four LLM agents (Risk, CareGap, SDOH, ActionPlanner) on OpenAI gpt-5.5 with structured output via function tools. The multi-agent orchestrator runs three in parallel, then synthesizes via the Action Planner. No rule-based system could replicate the cross-domain synthesis from raw FHIR bundles. |
| G3 — Safety, privacy, guardrails by design | **PASS** | Citation enforcement (GD11): every finding's `fhirResourceId` validated against the retrieved bundle's `validIds` — hallucinated IDs dropped before reaching client or HAPI. Narration buffer redacts unverified `ResourceType/id` mentions in streamed prose. Role→scope enforcement (director/coordinator/social_worker → demographic/clinical/sdoh domains). Audit log records every FHIR read + denial. SMART token client with RS256 signed assertions. Human-in-the-loop: Tasks require coordinator action. |
| G4 — Honest staging of claims | **PASS** | `plan.md` §3 standards-conformance matrix explicitly labels each standard as Built/Partial/Envisioned with evidence. SMART on FHIR honestly noted as "API-side token issuance only" — HAPI doesn't enforce the bearer token in POC mode (stock image limitation). Evaluation labels disclosed as "dev-labeled, not clinician-validated." Governance UI drops mockup elements it can't back with real data rather than fabricating. |
| G5 — Ethical/regulatory posture | **PASS** | Framed as care-coordination support tool, not autonomous clinical decision-making. No FDA SaMD claim. Risk agent includes calibration anchors and deterministic `clampRiskLevel` safety net. Demographic parity computed from real Synthea demographics. |

**No hard gates (G1–G4) fail. All gates pass.**

---

## B. Built vs. Prototyped vs. Envisioned

- **Built (working code):** Full-stack monorepo — Express API + Vite/React frontend + HAPI FHIR R4 in Docker. Four live LLM agents with structured output + citation validation + confidence scoring. SMART Backend Services token issuance/exchange. CDS Hooks patient-view service (discovery + card mapping). FHIR Subscription rest-hook → SSE relay. FHIR Task creation/assignment/transition. Role-based scope enforcement + audit trail. Population dashboard with canvas scatter. Patient detail with animated agent graph + SSE streaming. Governance dashboard (audit trail, confidence distribution, demographic parity, eval tile). Mobile-responsive task queue + task detail. SDOH community resource directory + FHIR ServiceRequest referrals. Evaluation harness (`npm run eval`) with sensitivity/specificity/PPV + error analysis. 26-patient labeled set (16 dev-labeled + 10 held-out). 14 Playwright E2E specs. ~90+ unit/integration test files across API and web.
- **Prototyped:** Risk agent calibration (v3 prompt rubric with 3 anchors, 5 worked examples, deterministic clamp — iterated through S13→S13b→S16→S17, still has 50% specificity on held-out set). SMART scope enforcement at the HAPI level (JWT validation env-vars configured in docker-compose but empirically unverified against the stock image). Clinician outreach pipeline (schema + rendering exists, 0 invitations recorded).
- **Envisioned:** Full per-user SMART EHR/standalone launch. Population-level real-time dashboard. Ambient documentation. Multi-EHR deployment. Clinician-validated labels (slot exists, 0/26 validated). Production HAPI with Keycloak + PostgreSQL (docker-compose blocks commented out).

---

## C. Tier 1 — Pillars

| Pillar | Score | Justification | Weight | Contribution |
|--------|:-----:|---------------|:------:|:------------:|
| P1 — HL7 Standards Leverage & Interoperability | 5 | Five HL7 standards are structurally load-bearing: FHIR R4 (HAPI reads/writes, every recommendation cites a resource ID), SMART Backend Services (RS256 JWT assertion, RFC 7523 token exchange, cached to expiry, Bearer header on every HAPI call), CDS Hooks (patient-view discovery endpoint + service with prefetch), FHIR Task (Action Planner creates Tasks with `meta.tag` domain tagging, `owner.identifier` assignment, `input` citations, status transitions), FHIR Subscription (rest-hook with `payload: application/fhir+json`, HAPI→webhook→SSE relay). Plus LOINC (4548-4, 30934-4, 62238-1, 71802-3), SNOMED CT, ICD-10, RxNorm terminology bindings on seed + population data. US Core race/ethnicity extensions for parity computation. FHIR SDC/AHC-HRSN screening for SDOH. | 18% | 18.0 |
| P2 — Clinical & Health Impact | 5 | Targets the highest-cost, highest-need patient cohort (top 5% complex patients ≈ 50% of healthcare costs). Care gap detection (missing HbA1c/BNP/eGFR monitoring for chronic conditions), 30-day readmission risk stratification, SDOH screening with referral creation, and prioritized task generation directly address preventable readmissions and care gaps. The eval harness demonstrates real sensitivity (100% care gap, 100% risk on dev-labeled) with honest specificity limitations documented. | 18% | 18.0 |
| P3 — AI/GenAI Innovation & Substance | 5 | Multi-agent orchestration with true parallel dispatch (race-based merge of async iterators, not sequential await). Four specialized agents (Risk, CareGap, SDOH, ActionPlanner) each with structured output via function tools. Citation enforcement is a genuine architectural innovation: backend validates every `fhirResourceId` against the bundle's `validIds` Set, drops hallucinated IDs, and redacts unverified citations in streamed narration via a lookahead buffer. Deterministic confidence scoring (heuristic, not model self-report) — the model never sees the confidence number, only the schema slot. Action Planner synthesizes three upstream agents' structured outputs without seeing the raw bundle. Risk calibration iterated through 4 versions (S13→S17) with a deterministic `clampRiskLevel` safety net. | 18% | 18.0 |
| P4 — Trust, Safety, Governance & Explainability | 5 | Human-in-the-loop by design (Tasks require coordinator action before any intervention). Audit trail (SQLite `audit_log`, every FHIR read + denial logged, Director-only governance access). Citation validation (GD11 — no finding reaches client or HAPI with a fabricated resource ID). Narration redaction (streamed prose checked against `validIds`, unverified mentions replaced with `[unverified citation removed]`). Role→scope enforcement (3 roles → 3 domains, enforced API-side, denial audited). Demographic parity computed from real Synthea demographics (age/sex/race/ethnicity stratification of risk scores). Confidence distribution bucketed from real agent outputs. Eval harness with error analysis (false positives/negatives per patient, data gaps reported). Honest disclosure: governance UI explicitly drops mockup elements it can't back with real data. | 13% | 13.0 |
| P5 — Transformative Vision & Ambition | 5 | Restructuring care coordination around AI agents that reason over a patient's full FHIR record and deliver actionable FHIR Tasks (not passive alerts) is a genuine paradigm shift. The multi-agent decomposition mirrors real care team structure (risk stratification, gap detection, social barriers, action planning). SDOH integration with FHIR ServiceRequest referrals bridges clinical and social care. CDS Hooks delivery means findings appear inside the EHR workflow. The architecture is specifically engineered around the LLM's failure mode (hallucination) — citation enforcement is not bolted on, it's the core seam. | 12% | 12.0 |
| P6 — Proof, Demonstration & Evaluation Design | 4 | Evaluation harness is built and runs: `npm run eval` produces a committed report with per-agent sensitivity/specificity/PPV, confusion matrices, and mandatory error analysis. 26 labeled patients (16 dev-labeled + 10 held-out). Honest staging: "dev-labeled, not clinician-validated" with `clinicianOverride` slot for upgrade. Variance probe runs the Risk agent 3× per patient to measure LLM consistency. Results are real but limited: Risk specificity 69.2% dev / 50% held-out (4–5 false positives from 2-anchor-without-labs over-calls). Care Gap specificity 0% dev (1 negative example — acknowledged as illustrative). SDOH agreement 93.8% but only 3 positive examples. The honest error analysis (naming each FP/FN by patient with label rationale) is what pushes this to 4. Would score 5 with clinician-validated labels and richer negative examples. | 8% | 6.4 |
| P7 — Efficiency & Economic Soundness | 3 | Parallel agent dispatch (3 concurrent OpenAI calls + 1 sequential). Cache layer (SQLite `analysis_cache`, replay avoids all orchestrator + HAPI calls). `?live=1` forces fresh run for judges. Cost story is reasonable for a POC (cloud inference, no special hardware). However, 4 LLM calls per patient analysis is expensive at scale, and no explicit cost-per-analysis or cost-avoidance model is provided. The streaming presentation frames latency as a feature (agents "thinking" visibly), which is clever UX but doesn't address the compute cost question for smaller health systems. | 5% | 3.0 |
| P8 — Experience — Clinician & Patient | 4 | CDS Hooks cards deliver findings inside the EHR (zero new app for prescribers). Care coordinator mobile-responsive PWA shows task queue with priority/domain tags, patient condition tags, and citation-backed task detail with call action. Patient detail page has three view modes (Panel, Cinema, Orchestrator) with an animated canvas agent graph showing real-time SSE streaming of agent reasoning. Governance dashboard with confidence chart, parity radar, and audit trail. The UI is polished and faithful to 6 HTML mockup references. However, some mockup elements are dropped rather than replaced (agent accuracy by type, compliance attestations) — honest but leaves the experience slightly thinner than the design vision. | 4% | 3.2 |
| P9 — Equity, Access & Scalability | 4 | SDOH agent + AHC-HRSN screening directly addresses social determinants. FHIR ServiceRequest referrals for community resources (housing, food, transportation). Demographic parity computation surfaces disparities by age/sex/race/ethnicity. FHIR portability means any FHIR R4-compliant server qualifies, including community health systems. PWA (no native app) lowers the access barrier. However, multilingual support is not specified, and the ~500 Synthea patient population is a demo-scale cohort — scaling to real health system volumes is untested. | 4% | 3.2 |

### WEIGHTED TOTAL: 86.8 / 100

---

## D. Tier 2 — AI-Leverage Multiplier

**M = 1.15** (tie-breaker mode)

**Rationale:** The multi-agent architecture with citation enforcement is not achievable without LLMs — the specialist sub-agent decomposition mirroring clinical team structure, the structured output via function tools with FHIR resource ID citations, and the deterministic confidence scoring that is immune to model self-report bias are genuinely inventive. The entire architecture is engineered around the AI's failure mode (hallucination), making AI the irreplaceable engine, not a decorative layer.

---

## E. Band, Strongest Dimension, Biggest Risk/Gap

- **Band:** **Finalist** (85+)
- **Strongest dimension:** P1/P3/P4 triad — the widest standards footprint (5 load-bearing HL7 standards) combined with citation enforcement as a genuine architectural innovation and the most credible safety/governance story (audit trail, parity computation, honest eval with error analysis).
- **Biggest risk/gap:** P6 — the evaluation is real but small-scale and dev-labeled. Risk specificity is 50% on held-out (5/10 false positives), Care Gap specificity rests on a single negative example, and SDOH has only 3 positive examples. The `clampRiskLevel` deterministic safety net and v3 prompt rubric are mitigations, but the underlying LLM over-calling pattern is not fully resolved. No clinician has validated any label.

---

## F. Open Questions

1. **P6/Risk calibration:** The v3 rubric + `clampRiskLevel` reduced dev-labeled FPs from 9→4, but held-out specificity is still 50% (5 FPs, all 2-anchor-without-labs cases). Is there a plan for a v4 rubric or a more aggressive clamp that preserves sensitivity while eliminating the remaining over-call pattern?

2. **P6/Clinician validation:** The `clinicianOverride` slot exists on all 26 label rows but 0 have been validated. Has any clinician been engaged for the ~90 minutes the plan estimates for review? If not, what is the timeline?

3. **P6/Care Gap specificity:** The eval report acknowledges specificity is 0% on dev-labeled (1 negative example — maria-chen). The label file's `_meta.limitations` flags this as "illustrative, not statistically robust." Are there plans to seed more negative examples (patients with conditions AND matching Observations) to make this metric meaningful?

4. **P7/Compute cost:** Four LLM calls per patient (3 parallel + 1 sequential) at the gpt-5.5 tier. What is the estimated cost per patient analysis, and is there a fallback to a cheaper model (the plan mentions Haiku 4.5) for the classifier agents?

5. **P1/SMART enforcement:** The plan honestly notes that HAPI's stock Docker image doesn't enforce the bearer token (curl with no Authorization header returns 200). The docker-compose now includes JWT validation env-vars (`hapi.fhir.security.oauth.enable_jwt_validation`). Has this been empirically verified — does a curl without a valid token now return 401?

6. **P4/SDOH bias audit:** The demographic parity computation is on the Governance dashboard, but is there an explicit bias/equity audit for the SDOH agent's barrier detection? The SDOH agent reasons over AHC-HRSN screenings, but only 5 of 26 labeled patients have screenings — does the agent's behavior on patients without screenings introduce a systematic bias?

7. **P8/Patient experience:** The submission focuses on clinician and care coordinator experience. Is there any patient-facing surface (e.g., a patient portal view of their Tasks, SDOH referral status), or is the patient experience entirely mediated through the care team?

8. **P9/Multilingual support:** The SDOH agent and outreach schema reference social domains, but no multilingual support is mentioned. For community health systems serving non-English-speaking populations, is there a plan for localized screening or task descriptions?

---

## G. One-Line Verdict

A genuinely strong submission — the widest load-bearing standards footprint of any candidate, citation enforcement as a real architectural innovation (not asserted), and the most honest evaluation harness in the field — held back from a clean finalist score only by the unresolved risk over-calling pattern and the absence of clinician-validated labels.

---

## Anti-Gaming Watch-List Assessment

| Flag | Status | Evidence |
|------|--------|----------|
| GenAI-washing | **Clear** | Four agents make real OpenAI gpt-5.5 calls with structured output. Mock fallback only activates when `OPENAI_API_KEY` is unset, and is explicitly labeled `[demo fallback]` in the stream. The eval harness refuses to run without a real key. |
| FHIR-shaped-not-FHIR-native | **Clear** | Real HAPI FHIR R4 in Docker. Every recommendation cites a `ResourceType/id` validated against the bundle. Tasks are real FHIR Task resources with `meta.tag`, `owner.identifier`, `input` citations. Subscriptions are real HAPI rest-hook resources. SMART token is RFC 7523 compliant. |
| Vaporware | **Clear** | Working code for all demo-critical screens. 14 E2E specs. 90+ test files. `npm run eval` produces a committed report. The honest staging matrix in `plan.md` §3 distinguishes Built/Partial/Envisioned with specific evidence. |
| Benchmark cherry-picking | **Watch** | The eval report honestly discloses limitations (Care Gap specificity 0% on 1 negative example, SDOH 3 positive examples, Risk 50% held-out specificity). The held-out set is genuinely unseen. However, the dev-labeled set's ground truth is "definitional" (team authored the hero patients' gaps) — acknowledged in `plan.md` GD8 but worth noting. |
| Hallucination hand-waving | **Clear** | Citation enforcement is real, tested code (`citationValidator.ts`, `citationValidator.test.ts`). The `NarrationBuffer` with lookahead redacts unverified citations in streamed prose. Dropped citations are counted and surfaced in the SSE stream (`droppedCount`). The eval report's error analysis section names each FP/FN by patient. |
