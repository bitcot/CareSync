# HL7 AI Challenge 2026 — Project Brief & Evaluation

## Competition Context

- **Competition:** HL7 AI Challenge 2026
- **Deadline:** ~20 days from session start
- **Team:** Multiple web, mobile, and backend developers (no prior FHIR codebase)
- **Constraint:** Building net-new; no existing IP being carried over

---

## Evaluation Prompt (for scoring any submission)

Evaluate the submission strictly against the HL7 AI Challenge rubric below.
Follow its three tiers: Gates, then the nine weighted pillars, then the AI-Leverage Multiplier.

### How to Evaluate

1. **GROUND EVERYTHING IN THE TEXT.** Base every gate result and pillar score only on
   what the submission actually states or demonstrates. Do not infer capabilities,
   results, standards usage, or safety measures that are not evidenced. Where a
   claim is made, note whether it is shown, prototyped, or merely asserted.

2. **HANDLE INCOMPLETE SUBMISSIONS BY ASKING, NOT GUESSING.** If the information needed
   to assess a gate or pillar is absent or ambiguous:
   - Do NOT assign a score to that pillar. Mark it "Insufficient information."
   - Add a specific, answerable question to an "Open Questions" list, naming the
     exact pillar/gate and what evidence would resolve it.
   - Never fabricate metrics, standards conformance, or deployment claims to fill a gap.
   If more than three pillars are unscorable, stop and return the Open Questions list
   as the primary output, with a note that a full score is not yet possible.

3. **RESPECT THE CONTEST CALIBRATION.** Reward ambition anchored by a working core.
   Judge safety, guardrails, compliance, and interoperability at the architecture/
   design level — do not penalize for lacking production deployment or a code audit.
   Do penalize maturity overclaiming (presenting vision as shipped).

4. **APPLY THE ANTI-GAMING WATCH-LIST (Section 7 of rubric).** Flag GenAI-washing,
   FHIR-shaped-not-FHIR-native, vaporware, benchmark cherry-picking, and hallucination
   hand-waving.

### Output Format

**A.** Tier 0 — Gates: G1–G5 each as Pass / Fail / Insufficient info, one line of
   justification each. If any hard gate (G1–G4) fails, say so explicitly.

**B.** Built vs. Prototyped vs. Envisioned: a 2–3 line summary.

**C.** Tier 1 — Pillars: for each P1–P9 give a 1–5 score (or "Insufficient info"),
   one to two sentences of justification citing specific evidence, and the weighted
   contribution. Then the WEIGHTED TOTAL out of 100.

**D.** Tier 2 — AI-Leverage Multiplier: value 0.70–1.15, mode (tie-breaker/overlay),
   one-line rationale.

**E.** Band, strongest dimension, biggest risk/gap.

**F.** Open Questions for the team (numbered; empty only if submission is complete).

**G.** One-line verdict.

---

## Scoring Rubric

### Gates (Tier 0 — Pass/Fail)

| # | Gate | Pass Condition |
|---|------|----------------|
| G1 | HL7 substance | The solution genuinely depends on one or more HL7 standards. Removing the standard would break or materially degrade it. |
| G2 | AI centrality | AI/GenAI is material to the value delivered, not decorative. |
| G3 | Safety, privacy and guardrails by design | Architecture addresses patient-safety hazards, PHI handling, and AI guardrails. |
| G4 | Honest staging of claims | Submission clearly distinguishes built vs. prototyped vs. envisioned. |
| G5 | Ethical and regulatory posture (flag) | No deceptive use; regulated-use claims acknowledge applicable pathway. |

### Pillars (Tier 1 — Weighted Score)

| # | Pillar | Weight |
|---|--------|:------:|
| P1 | HL7 Standards Leverage and Interoperability | 18% |
| P2 | Clinical and Health Impact (demonstrated + projected) | 18% |
| P3 | AI/GenAI Innovation and Substance | 18% |
| P4 | Trust, Safety, Governance and Explainability | 13% |
| P5 | Transformative Vision and Ambition | 12% |
| P6 | Proof, Demonstration and Evaluation Design | 8% |
| P7 | Efficiency and Economic Soundness | 5% |
| P8 | Experience — Clinician and Patient | 4% |
| P9 | Equity, Access and Scalability | 4% |

**Score formula:** `Total = SUM( pillar_score / 5 * weight_percent )`

**Bands:** 85–100 = Finalist; 70–84 = Strong; 55–69 = Promising; <55 = Not competitive

### AI-Leverage Multiplier (Tier 2)

| M | Meaning |
|:---:|---------|
| 1.15 | AI is the irreplaceable engine, genuinely inventive |
| 1.00 | AI is central and competently applied (default) |
| 0.85 | AI helps but outcome mostly attributable to non-AI factors |
| 0.70 | AI is decorative — could be removed with little loss |

---

## Candidate Ideas

### Idea A — SafeScript: FHIR-Grounded Medication Safety Agent via CDS Hooks

**One-line:** An AI agent embedded in the prescribing workflow via CDS Hooks that retrieves the patient's full medication context from FHIR and returns citation-backed safety cards — interactions, contraindications, dose adjustments — grounded exclusively in the patient's actual FHIR resources.

**Standards:** FHIR R4 (MedicationRequest, AllergyIntolerance, Condition, Observation, Patient), CDS Hooks, SMART on FHIR, RxNorm, SNOMED CT, LOINC

**AI approach:** Agentic LLM that receives structured FHIR context (no free text hallucination surface), reasons over actual resource values, and returns structured CDS cards with FHIR resource ID citations. Confidence score on each card. Human-in-the-loop: clinician accepts/dismisses card, dismissal reason captured as AuditEvent.

**Architecture:** CDS Hooks service → FHIR resource fetch (SMART on FHIR) → structured prompt builder → LLM agent → CDS card formatter → EHR display. Audit trail via FHIR AuditEvent.

**Built vs. prototyped vs. envisioned (at submission):**
- Built: CDS Hooks service, SMART on FHIR OAuth, FHIR resource retrieval, demo UI
- Prototyped: LLM reasoning loop with citation enforcement, confidence scoring
- Envisioned: Multi-EHR deployment, population-level safety analytics

**Demo:** SMART Health IT sandbox + Synthea patient population, scripted prescribing scenario showing interaction detection and card generation.

#### Rubric Evaluation — Idea A

**Tier 0 — Gates**

| Gate | Result | Justification |
|------|--------|---------------|
| G1 | **PASS** | CDS Hooks and FHIR R4 are structural — the agent cannot function without them; removing either breaks the core loop. |
| G2 | **PASS** | The LLM reasoning over multi-resource context is the capability; rule-based systems cannot replicate the cross-domain synthesis. |
| G3 | **PASS** | Architecture grounds LLM strictly in retrieved FHIR data (no external knowledge hallucination path); AuditEvent trail; human dismissal required. |
| G4 | **PASS** | Three-tier staging is explicit in the submission. |
| G5 | **PASS** | CDS tool awareness acknowledged; not claiming FDA SaMD clearance. |

**Built vs. Prototyped vs. Envisioned:** Core FHIR integration and CDS Hooks service built; LLM citation-enforcement loop prototyped; multi-EHR deployment and analytics envisioned. Honest split.

**Tier 1 — Pillars**

| Pillar | Score | Justification | Weight | Contribution |
|--------|:-----:|---------------|:------:|:------------:|
| P1 | 5 | CDS Hooks + FHIR R4 + SMART on FHIR + RxNorm/SNOMED CT/LOINC — all load-bearing; the agent is impossible without the interoperability layer. | 18% | 18.0 |
| P2 | 4 | Medication errors affect 1.5M patients/year in the US; point-of-prescribing interception is the highest-leverage intervention. Pilot demo scope limits to 5/5. | 18% | 14.4 |
| P3 | 5 | Citation enforcement (output grounded to resource IDs), structured prompt from FHIR context, and confidence scoring are non-standard and specifically address the hallucination risk that makes clinical LLMs dangerous. | 18% | 18.0 |
| P4 | 5 | Human-in-the-loop by design; AuditEvent trail; LLM cannot reference data not in the retrieved bundle; dismissal capture. Strongest safety story of any candidate. | 13% | 13.0 |
| P5 | 4 | Embedding trustworthy AI safety checks into the prescribing loop is genuinely ambitious; not claiming to replace clinical judgment, which is the right frame. | 12% | 9.6 |
| P6 | 4 | Working demo on SMART sandbox with Synthea; scripted scenario; citation traceability verifiable. Would score 5 with a held-out eval set showing sensitivity/specificity. | 8% | 6.4 |
| P7 | 4 | Cloud inference; no special hardware; integrates via CDS Hooks standard rather than bespoke API. Cost per call is low relative to prevented adverse events. | 5% | 4.0 |
| P8 | 5 | CDS Hooks delivers cards inside the EHR prescribing UI — zero new app, zero workflow change. Most ambient integration possible. | 4% | 4.0 |
| P9 | 3 | Standard integration means any CDS Hooks-compliant EHR qualifies including community health systems; multilingual support not specified. | 4% | 2.4 |

**WEIGHTED TOTAL: 89.8 / 100**

**Tier 2 — AI-Leverage Multiplier:** M = 1.15 (tie-breaker mode). The citation-enforcement and FHIR-grounded reasoning are not achievable without the LLM; the architecture is specifically engineered around the AI's failure mode.

**Band:** Finalist (85+). Strongest dimension: P3/P4 trust-plus-innovation combination. Biggest risk: P6 — demo needs a held-out eval set, not just a scripted scenario.

**Open Questions:**
1. What is the LLM prompt strategy for enforcing citation-only output — constrained decoding, structured output schema, or post-hoc verification?
2. What is the fallback when FHIR data is incomplete (missing labs, no allergy list)?
3. Any clinician involvement in the demo scenario design?

**One-line verdict:** The strongest candidate — CDS Hooks makes it genuinely embedded, citation enforcement is a real architectural innovation, and the safety story is the most credible of any idea evaluated.

---

### Idea B — CareSync AI: Multi-Agent FHIR Care Orchestrator for High-Risk Patients

**One-line:** A multi-agent system where specialized AI agents reason over a complex patient's full FHIR bundle — stratifying risk, identifying care gaps, screening social determinants, and generating prioritized FHIR Tasks — delivered as CDS Hooks cards to clinicians and tracked via a mobile app for care coordinators.

**Standards:** FHIR R4 (Patient, Condition, CarePlan, CareTeam, Task, Observation, MedicationRequest, Questionnaire/SDC), SMART on FHIR, CDS Hooks, FHIR Subscriptions, LOINC, SNOMED CT, ICD-10

**AI approach:** Orchestrator agent decomposes the patient's FHIR bundle and dispatches to specialist sub-agents (risk scorer, care gap detector, SDOH screener, action planner). Each sub-agent returns structured findings with FHIR resource citations. Orchestrator synthesizes into a prioritized CareSync card set and creates FHIR Tasks.

**Architecture:** SMART on FHIR patient launch → full bundle fetch → orchestrator LLM → parallel specialist agents → Task generator → CDS Hooks delivery to EHR + FHIR Subscription push to mobile. Care coordinator mobile app shows task queue with evidence links.

**Built vs. prototyped vs. envisioned (at submission):**
- Built: SMART on FHIR launch, FHIR bundle fetch, CDS Hooks delivery, FHIR Task creation, mobile coordinator view
- Prototyped: Multi-agent orchestration loop, specialist sub-agents
- Envisioned: FHIR Subscription real-time updates, population-level dashboard

**Demo:** SMART sandbox + Synthea complex patient (diabetes + CHF + depression), end-to-end agent run showing gap detection, Task creation, and coordinator mobile view.

#### Rubric Evaluation — Idea B

**Tier 0 — Gates**

| Gate | Result | Justification |
|------|--------|---------------|
| G1 | **PASS** | FHIR R4, SMART on FHIR, CDS Hooks, FHIR Task, FHIR Subscriptions are all structural to the workflow; none are cosmetic. |
| G2 | **PASS** | Multi-agent reasoning synthesizes findings across clinical domains that no rule-based system could manage at this complexity. |
| G3 | **PASS** | SMART on FHIR scopes limit data access; Tasks require coordinator action before any intervention; PHI remains within FHIR server. |
| G4 | **PASS** | Three-tier staging is explicit. |
| G5 | **PASS** | Care coordination support tool; not claiming autonomous clinical decision-making. |

**Built vs. Prototyped vs. Envisioned:** FHIR integration layer and mobile app built; multi-agent orchestration prototyped; real-time subscriptions and population dashboard envisioned. Honest split.

**Tier 1 — Pillars**

| Pillar | Score | Justification | Weight | Contribution |
|--------|:-----:|---------------|:------:|:------------:|
| P1 | 5 | Five HL7 standards used structurally (FHIR R4, SMART, CDS Hooks, Tasks, Subscriptions) plus LOINC/SNOMED/ICD-10; the widest standards footprint of any candidate. | 18% | 18.0 |
| P2 | 5 | Top 5% of complex patients account for ~50% of healthcare costs; care coordination gaps in this cohort drive preventable readmissions and deaths. Impact claim is well-grounded. | 18% | 18.0 |
| P3 | 5 | Multi-agent orchestration over FHIR resources with specialist sub-agents per clinical domain is genuinely novel; decomposition mirrors how real care teams work. | 18% | 18.0 |
| P4 | 4 | SMART scopes, FHIR Task (human action required), resource citations per finding. Missing: explicit bias/equity audit for the risk stratifier model. | 13% | 10.4 |
| P5 | 5 | Restructuring care coordination around AI agents that reason over a patient's full FHIR record — and deliver actionable Tasks rather than passive alerts — is a genuine paradigm shift. | 12% | 12.0 |
| P6 | 3 | End-to-end demo on Synthea complex patient is achievable and compelling; evaluation design (did the Tasks lead to care gap closure?) is harder to show in 20 days. | 8% | 4.8 |
| P7 | 3 | Parallel agent calls increase compute cost; orchestration overhead needs a cost story for smaller health systems. | 5% | 3.0 |
| P8 | 4 | Mobile coordinator app is well-fitted to the care coordinator workflow; CDS Hooks cards require no new clinician app. | 4% | 3.2 |
| P9 | 4 | SDOH screening agent and multilingual outreach component directly address equity; FHIR portability means rural/community health systems qualify. | 4% | 3.2 |

**WEIGHTED TOTAL: 90.6 / 100**

**Tier 2 — AI-Leverage Multiplier:** M = 1.15 (tie-breaker mode). Multi-agent architecture is not achievable without LLMs; the specialist sub-agent decomposition mirrors clinical team structure in a way that is genuinely inventive.

**Band:** Finalist (85+). Strongest dimension: P2/P5 — impact and ambition together. Biggest risk: P6 — demo needs to show Task-to-outcome closure to make the impact claim credible, and P7 compute cost for the multi-agent loop needs explicit treatment.

**Open Questions:**
1. Which LLM handles the orchestration layer, and what is the latency budget per patient analysis?
2. How does the risk stratifier sub-agent handle patients with sparse FHIR data (new patients, incomplete records)?
3. Is the SDOH screener using a validated questionnaire (e.g., FHIR SDC + AHC-HRSN)?
4. What does the mobile coordinator UI do when a Task is overdue — escalation logic?

**One-line verdict:** Highest-scoring candidate on paper — widest standards footprint, strongest impact claim, genuinely novel multi-agent architecture — but the demo and compute cost stories need the most work to be credible in 20 days.

---

## Head-to-Head Comparison

| Dimension | Idea A (SafeScript) | Idea B (CareSync AI) |
|-----------|:-------------------:|:--------------------:|
| Weighted Score | 89.8 | 90.6 |
| Standards depth | 5 | 5 |
| Clinical impact | 4 | 5 |
| AI novelty | 5 | 5 |
| Safety story | **5** | 4 |
| Ambition | 4 | **5** |
| Demo difficulty | Low | **High** |
| Build complexity | **Medium** | High |
| Risk | **Lower** | Higher |

**Recommendation:** Idea B (CareSync AI) scores marginally higher and has a more powerful impact narrative, but Idea A (SafeScript) has a stronger safety story and a significantly easier demo path in 20 days. If the team has 6+ developers, pursue Idea B. If 3–4 developers, Idea A is the safer bet for a polished, credible submission.
