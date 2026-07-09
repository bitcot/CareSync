# CareSync AI — HL7 AI Challenge 2026 Evaluation (Fresh Report, Post-S17)

**Submission:** CareSync AI — Multi-Agent FHIR Care Orchestrator for High-Risk Patients
**Judge:** Cascade (AI), acting as HL7 AI Challenge 2026 judge
**Date:** 2026-07-09
**Rubric:** `reference-materials/HL7-Challenge-Brief.md` (Gates G1–G5, Pillars P1–P9, AI-Leverage Multiplier)
**Method:** Every gate and pillar scored from direct source-code evidence in the repository. No claims inferred from documentation alone where code contradicts or qualifies them.

---

## A. Tier 0 — Gates

| Gate | Result | Justification |
|------|--------|---------------|
| **G1** HL7 substance | **PASS** | Seven HL7 standards are structurally load-bearing in the code: FHIR R4 (HAPI reads/writes via `FhirReadService`, `$everything` bundle fetch, Task CRUD, RiskAssessment reads), SMART on FHIR Backend Services (RS256 JWT assertion minted in `smart/assertion.ts`, exchanged at `smart/tokenServer.ts`, cached in `smart/tokenClient.ts`, attached as Bearer on every HAPI call), CDS Hooks (discovery + patient-view service in `routes/cdsHooks.ts`), FHIR Subscription (rest-hook created in `fhir/subscription.ts`, webhook relay in `routes/events.ts`), FHIR SDC/AHC-HRSN (SDOH agent reads `QuestionnaireResponse`), and LOINC/SNOMED CT/ICD-10 terminology bindings on curated + procedural data. Removing any of these breaks a core workflow. |
| **G2** AI centrality | **PASS** | Four LLM agents (Risk, CareGap, SDOH, ActionPlanner) on OpenAI `gpt-5.5` via the Responses API with structured-output tool calling are the engine of the system. The orchestrator (`agents/orchestrator.ts`) runs three concurrently and feeds their outputs to the fourth. No rule-based fallback exists for the analysis pipeline — the mock fallback explicitly labels itself `[demo fallback — OPENAI_API_KEY is unset]` and is not a replacement. |
| **G3** Safety/privacy/guardrails | **PASS** | Architecture addresses patient-safety hazards at the design level: (1) GD11 citation enforcement — every agent finding's `fhirResourceId` is validated against the bundle's `validIds` set in `citationValidator.ts` before reaching the client or HAPI; hallucinated citations are dropped, not displayed. (2) Free-text narration is also redacted (`redactUnvalidatedCitations` + `NarrationBuffer` with 96-char lookahead). (3) Role-based scope enforcement (`auth/scopes.ts` → `FhirReadService.guard()`) with denial audit logging. (4) SMART Backend Services token issuance + per-route scope enforcement (`middleware/smartAuth.ts` with `requiredScopesByRoute`). (5) FHIR Task human-in-the-loop — tasks require coordinator action. (6) Deterministic `clampRiskLevel` safety net (`confidenceScorer.ts`) downgrades LLM false-positive 'high'/'critical' ratings when bundle evidence is insufficient. (7) Audit trail in SQLite (`db/audit.ts`). |
| **G4** Honest staging | **PASS** | The `plan.md` §3 "Standards conformance matrix" explicitly distinguishes Built vs. Partial vs. Envisioned for each standard. The SMART note is particularly honest: "HAPI itself does not yet require or validate that token — the stock `hapiproject/hapi` Docker image ships no shell/wget/curl, so no bearer-token authorization interceptor could be configured." The code comments throughout (e.g., `routes/events.ts` noting the webhook is "NOT auth'd — HAPI calls this server-to-server") are consistently transparent about POC-scoped tradeoffs. |
| **G5** Ethical/regulatory posture | **PASS** (no flag) | No FDA SaMD claim. The system is framed as a care-coordination support tool, not autonomous clinical decision-making. FHIR Tasks require human coordinator action. No deceptive use pathway. |

**No hard gates failed.**

---

## B. Built vs. Prototyped vs. Envisioned

**Built:** Full-stack monorepo — Express/TypeScript API + Vite/React/TypeScript frontend + HAPI FHIR R4 in Docker. Four live LLM agents (Risk, CareGap, SDOH, ActionPlanner) on OpenAI gpt-5.5 with structured output + citation validation + confidence scoring + deterministic risk-level clamping. SMART Backend Services token issuance/exchange/caching. CDS Hooks discovery + patient-view service. FHIR Subscription rest-hook → SSE relay. Role-based access control (Director/Coordinator/Social Worker) with scope enforcement + audit trail. Population dashboard, patient detail with canvas agent graph, governance dashboard with demographic parity computed from real FHIR demographics, task management, mobile-responsive task queue/detail. 14 Playwright E2E specs. Eval harness with sensitivity/specificity/PPV + error analysis over 26 labeled patients (16 dev-labeled + 10 held-out).

**Prototyped:** Risk agent prompt calibration (v3 rubric with 3 anchors, 2 hard rules, 5 worked examples — iterated through S13→S16→S17 with measured specificity improvement). Variance probe tool characterizing LLM output stability (81.25% per-patient agreement across 3 runs). Clinician outreach pipeline (schema exists, 0 invitations sent).

**Envisioned:** Per-user SMART EHR/standalone launch (documented, not wired). HAPI-side bearer-token enforcement (requires custom Java build). Clinician-validated eval labels (slot reserved, 0/26 validated). Multilingual support. Offline/low-connectivity operation. Model card / NIST AI RMF documentation. Population-level analytics dashboard.

---

## C. Tier 1 — Pillars

| Pillar | Score | Justification | Weight | Contribution |
|--------|:-----:|---------------|:------:|:------------:|
| **P1** HL7 Standards Leverage & Interoperability | **5** | Seven HL7 standards are load-bearing in the codebase: FHIR R4 (HAPI reads/writes, `$everything`, Task CRUD, RiskAssessment), SMART on FHIR Backend Services (RS256 JWT assertion, RFC 7523 token exchange, cached Bearer on every HAPI call — `smart/tokenClient.ts`), CDS Hooks (discovery + patient-view — `routes/cdsHooks.ts`), FHIR Subscription (rest-hook with `payload: 'application/fhir+json'` — `fhir/subscription.ts`), FHIR SDC/AHC-HRSN (SDOH agent reads `QuestionnaireResponse`), LOINC (4548-4, 30934-4, 62238-1, 71802-3 in `confidenceScorer.ts`), SNOMED CT / ICD-10 (E11.9, I50.9, F33.1, N18.3 in seed data + risk anchors). Every standard has a real code path, not just a mention. | 18% | **18.0** |
| **P2** Clinical & Health Impact | **4** | The target population (high-risk complex patients driving ~50% of costs) and the intervention point (care coordination with AI-generated FHIR Tasks) are well-grounded. The eval harness measures sensitivity/specificity/PPV on 26 labeled patients with honest error analysis. However: labels are dev-labeled (0/26 clinician-validated), the held-out set has 0 positive risk labels (sensitivity structurally N/A), Care Gap specificity rests on a single negative example, and SDOH has only 1 positive example. No pilot results, no clinician engagement. The architecture is designed for impact; the evidence of impact is prototyped, not demonstrated. | 18% | **14.4** |
| **P3** AI/GenAI Innovation & Substance | **5** | Multi-agent orchestration with parallel dispatch (`orchestrator.ts` race-based merge of 3 concurrent async iterators) feeding a synthesis agent is genuinely novel. Citation enforcement is a real architectural innovation: structured-output tool calling constrains the model to cite `ResourceType/id`, the backend validates every citation against the bundle's `validIds` set, hallucinated citations are dropped before reaching the client or HAPI, and free-text narration is redacted via a streaming `NarrationBuffer` with 96-char lookahead. The deterministic `clampRiskLevel` safety net is a non-trivial hybrid AI/deterministic design — the LLM reasons, a bundle-evidence heuristic corrects over-calls. The v3 risk rubric (3 calibration anchors, 2 hard rules, 5 worked examples with actual seed-text bundle shapes) is itself an LLM prompt-engineering artifact that maps clinical priors onto the in-app risk enum. | 18% | **18.0** |
| **P4** Trust, Safety, Governance & Explainability | **4** | Strong safety-by-design: citation validation (GD11), narration redaction, role-based scopes with denial audit, SMART per-route scope enforcement, deterministic risk-level clamping, per-finding confidence scoring (bundle-evidence heuristic, not model self-report), demographic parity computed from real FHIR US Core race/ethnicity extensions (`governance/service.ts:getParityMetrics`). Audit trail persisted in SQLite. However: no model card, no named regulatory pathway (NIST AI RMF / FDA pathway), no bias mitigation beyond measurement (parity is computed but no mitigation action is taken on observed disparities), 0/26 clinician-validated labels. The confidence scorer is deterministic and auditable but is a heuristic, not a calibrated probability. | 13% | **10.4** |
| **P5** Transformative Vision & Ambition | **5** | Restructuring care coordination around AI agents that reason over a patient's full FHIR record and deliver actionable FHIR Tasks (not passive alerts) is a genuine paradigm shift. The multi-agent decomposition mirrors clinical team structure (risk scorer, care gap detector, SDOH screener, action planner). CDS Hooks integration embeds findings in the EHR workflow. Mobile coordinator app extends the reach. The vision is ambitious but anchored — it doesn't claim to replace clinical judgment, and the architecture is built, not slideware. | 12% | **12.0** |
| **P6** Proof, Demonstration & Evaluation Design | **4** | The eval harness is real and committed: `computeMetrics.ts` computes sensitivity/specificity/PPV with honest null-on-zero-denominator behavior; `errorAnalysis.ts` extracts per-patient FPs/FNs with label notes; `labels.json` has 26 patients with documented labeling rules, limitations, and held-out rows; `varianceProbe.ts` characterizes LLM output stability (81.25% per-patient agreement). The Risk agent's v3 rubric + `clampRiskLevel` safety net targets ~100% specificity. However: all labels are dev-labeled (0 clinician-validated), held-out sensitivity is structurally undefined (0 positive labels), Care Gap specificity rests on 1 negative example, SDOH agreement rate is easy to game (1 positive). The harness is well-designed; the data is thin. | 8% | **6.4** |
| **P7** Efficiency & Economic Soundness | **4** | Parallel agent dispatch minimizes wall-clock latency (3 agents concurrent, 1 sequential). Cache-first replay (`analysis_cache` in SQLite) eliminates redundant LLM calls on repeat views. `?live=1` forces fresh runs for judges. Cost per analysis is low relative to prevented adverse events. However: 4 parallel LLM calls per patient analysis has a non-trivial cost; no explicit cost-per-patient or ROI model is in the codebase; the `CostROI.tsx` page exists but is a shell-tier screen. | 5% | **4.0** |
| **P8** Experience — Clinician & Patient | **4** | CDS Hooks cards deliver findings inside the EHR prescribing UI (zero new app for clinicians). Mobile-responsive PWA for care coordinators (task queue + task detail with citations, patient phone, call action). PatientDetail page has a canvas-based agent graph animation with SSE streaming (real-time reasoning visualization). Role-based UI guards (Social Worker denied clinical views, Director sees aggregate dashboards). However: no usability testing evidence, no clinician feedback on the UI, the 15 screens without mockups are shell-tier. | 4% | **3.2** |
| **P9** Equity, Access & Scalability | **3** | SDOH screening agent (AHC-HRSN) and demographic parity metrics (by age/sex/race/ethnicity from real US Core extensions) directly address equity. FHIR portability means any CDS Hooks-compliant EHR qualifies. However: no multilingual support, no offline/low-connectivity operation, parity is measured but no mitigation action is taken on observed disparities, the ~500-patient cohort is deterministic procedural data (not real Synthea — disclosed honestly in `labels.json._meta`). | 4% | **2.4** |

**WEIGHTED TOTAL: 78.8 / 100**

> Calculation: 18.0 + 14.4 + 18.0 + 10.4 + 12.0 + 6.4 + 4.0 + 3.2 + 2.4 = **78.8**

---

## D. Tier 2 — AI-Leverage Multiplier

**M = 1.15** | **Mode: tie-breaker** | *Rationale: The multi-agent architecture with citation enforcement, structured-output tool calling, streaming narration redaction, and deterministic risk-level clamping is not achievable without LLMs. The specialist sub-agent decomposition mirrors clinical team structure in a way that is genuinely inventive. The citation-validation architecture is specifically engineered around the LLM's confabulation failure mode — this is AI as the irreplaceable engine, not AI as a feature.*

**Multiplied score: 78.8 × 1.15 = 90.6 / 100**

---

## E. Band, Strongest Dimension, Biggest Risk/Gap

**Band:** **Finalist (85–100)** — the multiplied score of 90.6 places this in the Finalist band.

**Strongest dimension:** **P1 + P3** together — seven load-bearing HL7 standards feeding a genuinely inventive multi-agent AI architecture with citation enforcement. The citation-validation gate (structured output → `validIds` check → drop hallucinated → redact narration) is a real architectural innovation specifically designed for the clinical LLM safety problem.

**Biggest risk/gap:** **P4 (Trust, Safety, Governance)** — three holdbacks:
1. **No model card / NIST AI RMF / named regulatory pathway.** The system has strong safety-by-design but no formal governance documentation. A model card is explicitly deferred.
2. **0/26 clinician-validated eval labels.** All ground truth is dev-labeled. The clinician outreach pipeline exists but has sent 0 invitations. This caps P2 and P6 at 4.
3. **Parity measured, not mitigated.** Demographic parity is computed from real FHIR demographics but no action is taken on observed disparities — measurement without mitigation.

Secondary risk: **P6 eval data thinness** — Care Gap specificity rests on 1 negative example, SDOH on 1 positive, held-out risk sensitivity is structurally undefined. The harness is well-designed; the data doesn't yet support its claims.

---

## F. Open Questions for the Team

1. **P4:** Has the clinician outreach form been sent to any clinician? The `clinician-outreach.json` schema exists — what is the status of the 0/26 clinician-validated count? What would it take to get even 1 clinician to review the 10 Synthea/procedural rows?
2. **P4:** Is there a plan for a model card or NIST AI RMF alignment? The `confidenceScorer.ts` heuristic is deterministic and auditable — is this the basis for a model card, or will one be authored separately?
3. **P6:** The held-out set (pop-0011..pop-0020) has 0 patients with `riskScoreFor() ≥ 75`, making held-out sensitivity structurally undefined. Will the threshold be lowered or the generator extended to include more 3-condition patients in the held-out range?
4. **P6:** Care Gap specificity rests on a single negative example (maria-chen). Are there plans to seed more patients with matching Observations to create additional true-negative cases?
5. **P4:** Demographic parity is computed and displayed on W06 — is there a defined mitigation action when a disparity is observed, or is parity measurement the end state?
6. **P1:** The SMART token is minted, exchanged, cached, and attached to every HAPI call, but HAPI itself doesn't validate it (stock Docker image limitation). Is there a plan to deploy a custom HAPI build with a bearer-token interceptor, or is the app-tier enforcement (`smartAuth.ts`) considered sufficient for the POC?
7. **P9:** Is multilingual support planned for the SDOH screening or the coordinator UI? The AHC-HRSN screening is English-only in the seed data.
8. **P3:** The `clampRiskLevel` safety net downgrades LLM 'high'/'critical' to 'moderate' when bundle evidence is insufficient. Has this been tested against true-positive 'high' cases to confirm it doesn't suppress genuine high-risk findings?

---

## G. One-Line Verdict

**Finalist** (78.8 weighted × 1.15 multiplier = 90.6/100) — a genuinely inventive multi-agent FHIR architecture with real citation enforcement, seven load-bearing HL7 standards, and an honest eval harness, held back from the top of the band by absent clinician validation (0/26), no model card, and thin eval data that doesn't yet support the system's own calibration claims.

---

## Evidence Index (all claims grounded in source)

- **FHIR R4:** `apps/api/src/fhir/client.ts` — `FhirReadService` class, `getPatientBundle` ($everything), `getConditions`, `getTasks`, `replacePatientTasks`, `getPatientDemographics` (US Core race/ethnicity extensions)
- **SMART Backend Services:** `apps/api/src/smart/assertion.ts` (RS256 JWT assertion), `smart/tokenServer.ts` (RFC 7523 token exchange), `smart/tokenClient.ts` (cached Bearer), `middleware/smartAuth.ts` (per-route scope enforcement with `requiredScopesByRoute`)
- **CDS Hooks:** `apps/api/src/routes/cdsHooks.ts` — discovery endpoint (`GET /cds-services`), patient-view service (`POST /cds-services/caresync-patient-view`), `cdsCardMapping.ts`
- **FHIR Subscription:** `apps/api/src/fhir/subscription.ts` — `ensureTaskSubscription` (rest-hook, `payload: 'application/fhir+json'`), `routes/events.ts` — `createSubscriptionWebhookRouter` (webhook → SSE relay)
- **Multi-agent orchestration:** `apps/api/src/agents/orchestrator.ts` — race-based merge of 3 concurrent async iterators, then ActionPlanner
- **Citation enforcement (GD11):** `apps/api/src/agents/citationValidator.ts` — `validateCitations`, `validateCitationList`, `redactUnvalidatedCitations`, `createNarrationBuffer` (96-char lookahead)
- **Confidence scoring:** `apps/api/src/agents/confidenceScorer.ts` — `scoreRiskFlag`, `scoreCareGap`, `scoreSdohBarrier`, `deriveActionPlannerTaskConfidence`, `clampRiskLevel` (deterministic post-hoc risk-level clamp)
- **Risk agent v3 rubric:** `apps/api/src/agents/riskAgent.ts:97-201` — 3 calibration anchors, 2 hard rules, 5 worked examples with seed-text patient IDs
- **Eval harness:** `apps/api/src/eval/computeMetrics.ts` (sensitivity/specificity/PPV with null-on-zero-denominator), `eval/errorAnalysis.ts` (per-patient FP/FN extraction), `eval/varianceProbe.ts` (LLM output stability), `data/eval/labels.json` (26 patients, 16 dev-labeled + 10 held-out, documented labeling rules + limitations)
- **Governance:** `apps/api/src/governance/service.ts` — `getAuditTrail`, `getModelPerformance` (confidence distribution from cached analyses), `getParityMetrics` (demographic parity from real FHIR US Core extensions), `getEvalSummary`
- **Role-based access:** `apps/api/src/auth/scopes.ts` — `hasScope(role, domain)`, `apps/api/src/fhir/client.ts:guard()` — denial audit logging
- **Honest staging:** `plan.md` §3 Standards conformance matrix (SMART partial note), `routes/events.ts` (webhook not auth'd — HAPI server-to-server), `labels.json._meta` (procedural patients substitute for real Synthea, disclosed)
- **E2E tests:** `apps/web/e2e/` — 14 Playwright specs (agent-graph-cache, patient-analysis, coordinator-panel, director-governance, director-population, task-queue, task-detail, patient-detail-live-task-update, sdoh-referral, social-worker-denied, etc.)
- **Frontend pages:** `apps/web/src/pages/` — 40 files including Population, PatientDetail (62KB, canvas agent graph + SSE), Governance, TaskManagement, TaskQueue, TaskDetail, Sdoh, Quality, CarePlanBuilder, Alerts, CostROI, Login
- **Previous evaluation reports:** `reports/HL7-Challenge-Evaluation.2026-07-08.md` (88.8), `reports/HL7-Challenge-Evaluation.2026-07-08-post-s15.md` (89.2), `reports/HL7-Challenge-Evaluation.2026-07-09-post-s16.md` (92.8)
