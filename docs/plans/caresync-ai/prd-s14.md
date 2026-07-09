# PRD — S14: Close 4 Secondary Gaps (SDOH Imbalance · Clinician Apply · Confidence · SMART A+B)

> **PLAN_ID:** `caresync-ai` · **Slice:** S14 · **Status:** Ready for `writing-plans` (ADLC: specify → plan)
> **Author:** Manjula / Bitcot · 2026-07-08
> **Upstream artifacts:** `docs/plans/caresync-ai/grill-secondary-gaps.md` (9-question grill, S14/S15 split), `docs/plans/caresync-ai/design-risk-calibration.md` (S13 design + reversion), `docs/plans/caresync-ai/verification-s13.md §6` (LLM-variance debt deferred to S15), `docs/eval-report.md` (the 5 gaps as surfaced).
> **Tracker note:** This POC is Jira-free and file-backed (per `CLAUDE.md`). No issue-tracker publish and no triage labels applied — this file is the artifact. The slice name `S14` continues the existing `S#` convention used by S1–S13.

---

## Problem Statement

The HL7 AI Challenge evaluation report (`docs/eval-report.md`, "Status" + "## Per-agent metrics" sections) surfaced five "secondary gaps" the S13 risk-calibration slice did not address. They are not failure modes of a single feature — they are five independent quality problems with the eval methodology, the agent outputs, and the integration surface. The POC is judged on the eval report and the integration story; the gaps make both look weaker than the implementation actually is.

From a **clinical evaluator's** perspective, four specific findings undermine confidence in the work:

- The SDOH agreement rate is reported as **100%** — but only because the only SDOH-positive example in the ground truth is a single patient. A constant "no barrier" prediction scores 100% on this distribution, so the number is not measuring what it claims to measure. The evaluator can see this in the eval report's "SDOH (agreement rate)" line, and the report's own "Status" paragraph explicitly discloses the gaming problem — but disclosure is not a fix.
- All ground-truth labels are marked `source: "dev"`; the `clinicianOverride` slot exists on every row and is `null`. The infrastructure for clinician review was built (`review:render` produces an editable HTML report) but the **apply half** is missing — the reviewer's downloaded JSON is never written back to `labels.json`. The result is that the entire eval is "dev-labeled baseline" with no path to upgrade a row without code change.
- The agents' structured outputs (`RiskOutput.flags[]`, `CareGapOutput.gaps[]`, `SdohOutput.barriers[]`, `ActionPlannerOutput.tasks[]`) have no per-finding `confidence` field. The governance section of the product claims "confidence distribution across the analyzed cohort" but the eval report's per-agent metrics show **zero** in every governance bucket — because no confidence number is being emitted in the first place. The buckets being honestly zero is worse than the buckets being honestly populated with imperfect numbers.
- The SMART access token is **minted** by the app (`apps/api/src/smart/tokenClient.ts` does a real OAuth2 client_credentials flow with a signed JWT assertion) and **attached** to every HAPI call (`apps/api/src/fhir/client.ts:338` sets `Authorization: Bearer <token>`), but the HAPI container in `docker-compose.yml` is configured to ignore the header. Any client on the network can hit `localhost:8080/fhir/...` and read or write resources. The integration story is "we use SMART" but the boundary is open.

From a **developer / eval-operator** perspective, the gaps are visible as "I can see the problem but the eval report doesn't tell me the system actually fixed it" — the same report that disclosed the gaps also disclosed its own inability to prove the agent's accuracy in any of these dimensions.

The fifth gap (Risk PPV 33.3%, 4 FPs from LLM clinical priors) is structurally different: it's an LLM-side behavior shift between 2026-07-07 and 2026-07-08 that a prompt-only rubric cannot fix. It is **out of scope** for S14 and gets its own slice (S15) where the v2 risk rubric + LLM-variance root-cause investigation get the focused design space they need.

---

## Solution

S14 closes four of the five gaps in a single four-commit PR. Each commit is atomic, the PR is reviewable as a unit, and the verification matrix in §5 is the unified acceptance signal: an `npm run eval` re-run + a `curl` test of the SMART boundary.

The four commits, in order:

1. **`feat(S14): rebalance SDOH labels — 3 positive + 2 explicit-negative screenings`**. Adds new AHC-HRSN screening Observations to 5 patients in `seed-patients.ts` (3 positive: james-okafor, angela-diaz, pop-0010; 2 explicit-negative: robert-kim, pop-0005), re-imports FHIR, updates the corresponding `sdoh.expectedHasBarrier` rows in `data/eval/labels.json`. Brings the SDOH distribution from 1/16 positive (trivially gameable) to 4/16 positive + 2/16 explicit-negative (not gameable). Source stays `dev`; notes are updated to reflect the dev interpretation.
2. **`feat(S14): review:apply — round-trip the review:render JSON back into labels.json`**. New `apps/api/src/scripts/apply-clinician-review.ts` script. Reads `labels.clinician-review.json` (downloaded by the clinician from the `review:render` HTML form), validates the file, mutates `data/eval/labels.json` (sets `source: "clinician"` on touched rows, populates the `clinicianOverride` slot with `{ reviewer, reviewedAt, dims }`), prints a CHANGELOG-style summary. The eval-report disclosure becomes "X of 16 clinician-validated (Y%), M of 16 dev-labeled (N%)" — a real number replacing the blanket "all dev."
3. **`feat(S14): per-finding confidence via bundle-evidence heuristic`**. New `apps/api/src/agents/confidenceScorer.ts` (3 small functions: `scoreRiskFlag`, `scoreCareGap`, `scoreSdohBarrier`). New `confidence: number` field on each finding in the four `*Output` types. Action Planner task confidence is **derived** (not scored): `task.confidence = min(contributingFindings.map(f => f.confidence))`. The citation validator runs the scorer alongside itself and writes `confidence` into the validated output. No model self-report — the score is deterministic and the model can't bias it.
4. **`feat(S14): SMART enforcement A+B — app middleware + HAPI config`**. New `apps/api/src/middleware/smartAuth.ts` (JWT decode + signature verify against the public key + `exp`/`aud`/`scope` checks, throws 401 with clear error). New env vars in `docker-compose.yml`'s `hapi-fhir.environment` (`hapi.fhir.security.oauth.enable_jwt_validation: "true"`, public-key path, plus a bind-mount of the public-key file). HAPI now rejects unauthenticated calls at the FHIR boundary; the app middleware catches the developer bug of "forgot to attach the token" at the API tier.

The eval re-run after the four commits produces a `docs/eval-report.md` in which:
- SDOH agreement is no longer 100% — it moves to a non-trivial number (target 70-90%) and the report narrates the new TP/FP/TN/FN breakdown.
- The disclosure banner reads "X clinician-validated of 16."
- The per-agent section has a confidence-bucketed accuracy table (high ≥0.8, medium 0.5-0.8, low <0.5), with non-zero buckets.
- A 401/200 curl test is documented in `verification-s14.md`.

---

## User Stories

### Gap #2: SDOH imbalance

1. As a **clinical evaluator** reading the eval report, I want the SDOH agreement rate to be measured against a distribution with at least 3 positive and 2 explicit-negative labels, so that the metric is not trivially gameable by a constant "no barrier" predictor.
2. As a **clinical evaluator** reading the eval report, I want the SDOH section to show TP / FP / TN / FN counts separately, so that I can see where the agent finds positives it shouldn't and misses positives it should find.
3. As a **clinical evaluator** reading the eval report, I want the SDOH section to disclose the new positive/negative count (1/16 → 4/16 positive, 0/16 → 2/16 explicit-negative), so that the metric change is interpretable.
4. As a **developer** running the eval, I want the new AHC-HRSN Observations to be re-imported via `npm run import` with no manual seed re-write, so that the seed-to-FHIR path remains idempotent and the eval is reproducible.
5. As a **clinical evaluator**, I want the new SDOH-positive screenings to be defensible — each new positive patient should have a profile-level reason (recent discharge, mental health access gap, social isolation, etc.) recorded in the label `notes`, so that the positives are not arbitrary.
6. As a **clinical evaluator**, I want the explicit-negative screenings (robert-kim, pop-0005) to be distinguishable from "absence of screening" patients, so that the agent's TN count reflects real "correctly said no" judgments.

### Gap #3: Clinician validation apply half

7. As a **clinician** who has just used the `review:render` HTML form to fill in overrides, I want to run one command (`npm run review:apply`) to have my selections written back to `data/eval/labels.json`, so that I don't have to manually edit JSON.
8. As a **clinician**, I want my reviewer name and timestamp to be recorded in the `clinicianOverride` slot on every row I touch, so that the audit trail is real and queryable.
9. As a **clinician**, I want my "Endorse" selections to leave the label as-is but still record the endorsement in the `clinicianOverride` slot, so that downstream readers can distinguish "endorsed by Dr. X on date Y" from "never reviewed."
10. As a **clinician**, I want my "Abstain" selections to leave the label and the row source unchanged, so that deferring a row to another reviewer doesn't accidentally mark it as dev-validated.
11. As a **clinician**, I want the `review:apply` script to print a CHANGELOG-style summary ("N rows updated by reviewer X, M rows endorsed, K rows abstained"), so that I can verify the apply was correct before committing.
12. As a **developer** maintaining the eval harness, I want `review:apply` to validate the review JSON's structure (right patient IDs, right enum values) before mutating `labels.json`, so that a typo in the review file can't silently corrupt the ground truth.
13. As an **eval operator**, I want the eval report to disclose "N of 16 labels clinician-validated (X%), M of 16 dev-labeled (Y%)," so that the disclosure is honest about provenance per-row.
14. As a **test author**, I want a unit test that takes a fixture `labels.clinician-review.json` through the full apply round-trip, so that any future change to the apply logic is regression-guarded.

### Gap #4: Confidence emission

15. As a **clinician using the care-coordination UI**, I want each finding (risk flag, care gap, SDOH barrier, action-planner task) to have a confidence indicator, so that I can prioritize my attention on low-confidence items.
16. As a **clinical evaluator** reading the eval report, I want each agent's per-agent section to include a confidence-bucketed accuracy table (high ≥0.8, medium 0.5-0.8, low <0.5), so that I can see whether high-confidence findings are actually high-accuracy.
17. As a **clinical evaluator**, I want the governance section of the eval report to show a non-zero distribution across the confidence buckets, so that the "confidence distribution" claim is real, not vacuous.
18. As a **developer** maintaining the agents, I want the confidence number to be derived from objective bundle evidence (citation count, abnormal-lab presence, recent-encounter presence, AHC-HRSN screening positivity), not from model self-report, so that the score is auditable and the model can't bias it.
19. As a **developer**, I want each scoring function to be a small pure function (3-5 lines, no I/O, no LLM call) that takes a finding and a bundle and returns a `number` in [0, 1], so that the function is unit-testable with deterministic fixtures.
20. As a **developer**, I want the Care Gap scorer to give high confidence (0.9) when a `Condition` is in the bundle AND the matching `Observation` is absent (the gap is real and explicit), and lower confidence otherwise, so that the most defensible gap findings have the highest score.
21. As a **developer**, I want the SDOH scorer to give high confidence (0.9) when the cited resource is an AHC-HRSN Observation with a positive screening code, and lower confidence otherwise, so that the most defensible barrier findings have the highest score.
22. As a **developer**, I want the Risk scorer to combine citation count + abnormal-lab presence + recent-encounter presence into a single number capped at 0.9, so that a finding with more supporting evidence is more confident.
23. As a **developer**, I want the Action Planner task confidence to be derived as `min(contributingFindings.map(f => f.confidence))`, so that a synthesized task cannot have higher confidence than the findings it synthesizes.
24. As a **test author**, I want a per-scorer unit test that pins the score for a specific bundle-evidence combination, so that any future schema change to the bundle or the scoring formula is regression-guarded.

### Gap #5: SMART enforcement A+B

25. As a **security reviewer** reading the HAPI config, I want the HAPI container to be configured to require a valid JWT Bearer token, so that the FHIR boundary is enforced and unauthenticated clients on the network cannot read or write resources.
26. As a **security reviewer**, I want a `curl -i http://localhost:8080/fhir/Patient/maria-chen` to return `401 Unauthorized`, so that I can demonstrate the boundary enforcement in 30 seconds.
27. As a **security reviewer**, I want a `curl -i http://localhost:8080/fhir/Patient/maria-chen -H "Authorization: Bearer <valid-token>"` to return `200`, so that the enforcement doesn't break the legitimate path.
28. As a **developer** working in the API service, I want a middleware on every route that touches HAPI to validate the Bearer token (decode + signature verify + `exp`/`aud`/`scope` checks) before the HAPI call is attempted, so that the developer error of "forgot to attach the token" is caught at the API tier with a clear error, not at HAPI with a 401.
29. As a **developer**, I want the middleware to throw a clear, structured error (not a raw JWT library error) when the token is missing, expired, mis-audienced, or mis-scoped, so that the error message helps me debug.
30. As a **test author**, I want a unit test that mints a real token, calls the middleware, asserts pass; then tampers with one byte of the token, calls again, asserts fail, so that the middleware's signature-verification path is regression-guarded.
31. As a **test author**, I want an integration test that exercises the full A+B path: mint a real token via `SmartTokenClient`, attach it as a Bearer, hit a HAPI-backed route, assert 200; then omit the token, assert 401 from the app middleware before HAPI is touched.
32. As a **deployer**, I want the HAPI config to use the public-key counterpart of the private key already in `apps/api/src/smart/keys.ts` (no new keypair, no new auth server), so that the change is a docker-compose env-var addition plus a public-key bind-mount, not a new infrastructure dependency.
33. As a **security reviewer**, I want a clear note in `verification-s14.md` that the long-term production fix is to point HAPI at a SMART authorization server (the lightweight B config trusts any token signed by the configured public key, which is correct for the POC's client_credentials flow but not the right shape for a real multi-actor SMART deployment), so that the POC fix doesn't get mistaken for the production fix.

### Cross-cutting

34. As a **reviewer** of the S14 PR, I want the four commits to be independently reviewable and individually revertable, so that if any one fix turns out to be wrong, it can be reverted without taking down the other three.
35. As a **release engineer**, I want the eval re-run after S14 to produce a `docs/eval-report.md` that is *strictly more informative* than the pre-S14 report (SDOH rate no longer 100%, governance buckets non-zero, % clinician-validated disclosed, 401/200 SMART curl documented), so that the S14 PR is provably an improvement, not a side-grade.

---

## Implementation Decisions

### D1. Slice structure
S14 covers gaps #2, #3, #4, #5 in a single four-commit PR. Gap #1 (Risk PPV / LLM variance) is **out of scope** and gets its own slice (S15) with a fresh `design-risk-calibration-v2.md` and a dedicated `verification-s15.md`. Rationale: gap #1 is the only gap whose root cause is LLM-side (model version, system prompt, temperature default) rather than product-side; bundling it with four product-side fixes would re-create the S13 audit-trail problem (one reversion implicates every change in the PR).

### D2. #2 SDOH: which patients get new AHC-HRSN screenings
- 3 new positive screenings: `james-okafor` (COPD + recent inpatient → transportation + financial barriers), `angela-diaz` (HTN + depression + no Observations → mental-health-access + social-isolation barriers), `pop-0010` (procedural depression + no Observations → social-isolation + financial barriers).
- 2 new explicit-negative screenings: `robert-kim` (acute hip fracture + otherwise stable demographic — "patient screened, no barriers"), `pop-0005` (HTN + depression + stable housing/insurance per procedural generator).
- Source field on all 5 rows stays `"dev"`. `notes` field updated to reflect the new screening and the dev interpretation.
- Final distribution: 4/16 positive (25%), 2/16 explicit-negative (13%), 10/16 absence-of-screening (62%).
- The 100%-agreement game is broken: the SDOH agent now has to detect positives in the bundle (4 to find), correctly abstain on the explicit-negatives (2 to not over-call), and not over-call on the absence-of-screening rows (10).

### D3. #3 Clinician apply: shape of `review:apply`
- New `apps/api/src/scripts/apply-clinician-review.ts` (no test file for the script itself — I/O-heavy, same convention as `render-clinician-review.ts`).
- One new `npm` script: `"review:apply": "tsx src/scripts/apply-clinician-review.ts"`.
- The script reads `./labels.clinician-review.json` from the current working directory (the file `review:render`'s HTML form downloads), validates structure (right patient IDs, right enum values), mutates `data/eval/labels.json` (per the per-dim logic in user stories 9-12), and prints a CHANGELOG summary.
- `data/eval/labels.json` `clinicianOverride` slot already exists on every row (`null` today) and is the target for the apply. The shape gets richer: from `null` to `{ reviewer, reviewedAt, dims: { careGap, risk, sdoh } }` where each `dim` is `{ endorsed: bool, abstained: bool, overrideValue?, notes }`.
- The eval-report "Status" disclosure is updated by `eval.ts` to read: *"X of 16 labels are clinician-validated (Y%), M of 16 are dev-labeled (N%)."* This is computed from the `source` field counts at the top of `eval.ts`.

### D4. #4 Confidence: schema change
- `RiskOutput.flags[i].confidence: number` (0-1)
- `CareGapOutput.gaps[i].confidence: number` (0-1)
- `SdohOutput.barriers[i].confidence: number` (0-1)
- `ActionPlannerOutput.tasks[i].confidence: number` (0-1, **derived** — not scored by the model)
- One new module: `apps/api/src/agents/confidenceScorer.ts` exporting three pure functions: `scoreRiskFlag(flag, bundle)`, `scoreCareGap(gap, bundle)`, `scoreSdohBarrier(barrier, bundle)`. Plus one helper: `deriveActionPlannerTaskConfidence(tasks, upstreamFindings)` returning the `min`-of-contributing-findings per task.
- The scorer is called by `citationValidator.ts` (or alongside it in the orchestrator's validation step) and writes the `confidence` field into the validated output. No new HTTP surface, no new agent event type, no new route.
- TDD surface: 3 new unit tests (one per scorer function) + 1 unit test for the Action Planner derivation, all using fixture bundles with deterministic expected scores.

### D5. #4 Confidence: scoring formulas
- **Risk flag** — `min(0.9, 0.3 + 0.2 × citationCount + 0.2 × hasAbnormalLab + 0.2 × recentEncounter)`. `hasAbnormalLab` is true if the bundle contains any Observation whose code is in the "abnormal labs" set used by the existing risk rubric (BNP > 200, HbA1c > 9.0, eGFR < 30) — same source of truth, no duplication. `recentEncounter` is true if any Encounter in the bundle ended within the last 30 days.
- **Care Gap** — `0.9` if the gap's cited `Condition` is in the bundle AND the matching `Observation` (by LOINC code per `data/eval/labels.json._meta.labelingRules.careGap`) is absent; `0.4` if only the Condition or only the absence is present; `0.2` if neither signal is in the bundle.
- **SDOH barrier** — `0.9` if the cited `fhirResourceId` is an AHC-HRSN Observation with a positive screening code; `0.4` if the citation is a Patient/condition observation; `0.2` if no real citation.
- **Action Planner task** — `min(tasks[i].fhirResources.map(rid => correspondingFinding.confidence))`. If a task cites no findings, confidence is `0.2` (the "synthesized without direct evidence" floor).

### D6. #5 SMART: A+B scope
- **B (HAPI-side, the real fix)**: add to `docker-compose.yml`'s `hapi-fhir.environment`:
  - `hapi.fhir.security.oauth.enable_jwt_validation: "true"`
  - `hapi.fhir.security.oauth.public_key_location: file:/keys/smart-public.pem`
  - bind-mount `apps/api/src/smart/keys/smart-public.pem` (extracted from the existing keypair) into `/keys/smart-public.pem` on the HAPI container.
- **A (app-side, the developer guard)**: new `apps/api/src/middleware/smartAuth.ts` exporting an Express middleware that reads `Authorization: Bearer <token>`, decodes the JWT, verifies the signature against the public key (same key HAPI trusts), checks `exp` (not expired, with 30s safety margin), `aud` (matches configured HAPI audience), and `scope` (contains the required scopes per HTTP method). Throws a structured `401` with a JSON body `{ error: "smart_auth_failed", reason: "..." }` on any failure. Mounted on all routes that touch HAPI in `apps/api/src/server.ts` (or wherever the route surface is currently declared).
- **Scope check policy**: GETs require `patient/*.read`; POST/PUT/DELETE require `patient/*.write`. If the token has the wrong scope for the HTTP method, the middleware throws 403 (not 401 — auth vs authz).
- **What this does NOT do**: does not point HAPI at a SMART authorization server (no Keycloak, no Photon). The lightweight B trusts any token signed by the configured public key, which is correct for the POC's client_credentials backend flow. `verification-s14.md` will note the production handoff (point HAPI at a real SMART auth server when the deployment is multi-actor).

### D7. #5 SMART: token format
- The middleware does NOT depend on the token being a SMART access token in the strict HL7 sense — it just validates the JWT (signature + `exp` + `aud` + `scope`). The existing `SmartTokenClient` mints tokens with `grant_type: client_credentials` and a signed `client_assertion`; those tokens have all four required claims.
- For tests, the existing `mintClientAssertion` in `apps/api/src/smart/assertion.ts` is the path to produce a valid token without making a network call.

### D8. File-level change set
**New files (3):**
- `apps/api/src/scripts/apply-clinician-review.ts`
- `apps/api/src/agents/confidenceScorer.ts`
- `apps/api/src/middleware/smartAuth.ts`

**New test files (2):**
- `apps/api/src/scripts/apply-clinician-review.test.ts` (one round-trip test + one validation-error test)
- `apps/api/src/agents/confidenceScorer.test.ts` (one test per scorer function + one for the Action Planner derivation)

**Modified files (no seam changes):**
- `apps/api/src/agents/agent.ts` — add `confidence: number` to each `*Output` finding shape
- `apps/api/src/agents/citationValidator.ts` (or the orchestrator's validation step) — call the scorer and write `confidence` into the validated output
- `apps/api/src/scripts/eval.ts` — add the confidence-bucketed accuracy table; update the "Status" disclosure to include % clinician-validated; narrate the new SDOH distribution
- `apps/api/src/fhir-data/seed-patients.ts` — add AHC-HRSN Observations for 5 patients
- `data/eval/labels.json` — update `sdoh` rows for 5 patients with new `expectedHasBarrier` + `notes`
- `docker-compose.yml` — add 2 env vars + public-key bind-mount
- `apps/api/src/server.ts` (or equivalent route declaration) — mount the `smartAuth` middleware on HAPI-touching routes
- `apps/api/package.json` — add `"review:apply"` script

**New fixtures (no production code):**
- `data/eval/labels.clinician-review.fixture.json` — fixture for the `review:apply` round-trip test
- 3 bundle fixtures (one per scorer) for the confidence tests

### D9. What the orchestration surface looks like
The orchestrator (`apps/api/src/agents/orchestrator.ts`) is unchanged in flow. The only change is that the per-finding `confidence` field now exists on the outputs the orchestrator already collects. The orchestrator does not need to thread the `confidence` field; it just passes the structured output through to the citation validator as today, and the citation validator now also runs the scorer.

### D10. Eval re-run expectations
After S14 lands, `npm run eval` re-run produces:
- SDOH agreement rate: moves off 100% to a non-trivial number in the 70-90% range (depending on whether the SDOH agent finds the 4 new positives correctly, doesn't over-call the 2 explicit-negatives, and doesn't over-call the 10 absence-of-screening patients).
- Risk / Care Gap metrics: unchanged from the pre-S14 baseline (S14 doesn't touch the S13 risk agent or the Care Gap agent's classification logic — only adds per-finding `confidence`).
- Per-agent section: each agent now has a confidence-bucketed accuracy sub-table.
- Status disclosure: "X of 16 clinician-validated (Y%), M of 16 dev-labeled (N%)" (where X=0 today, may move to 1-N depending on whether anyone has run `review:apply` with real overrides before the next eval).

---

## Testing Decisions

### T1. What makes a good test for S14
- **External behavior only** — test the *output shape* of each scorer, the *file-mutation* result of `review:apply`, the *HTTP 401/200* result of the SMART boundary, and the *eval-report* content after re-run. Do not test internal orchestration, internal token caching, or internal scorer intermediate values.
- **Real HAPI for the SMART tests** — the 401/200 curl test runs against `localhost:8080` after `docker-compose up`, not against a mock. The point of A+B is the FHIR boundary; testing it against a mock would prove nothing.
- **No live LLM call in the confidence tests** — the scorers are pure functions; fixtures are sufficient.
- **Round-trip test for `review:apply`** — start with a known `labels.json`, generate a review JSON via the render-side `buildOutput()` (or a hard-coded fixture), run apply, assert the new `labels.json` matches the expected shape byte-for-byte (or JSON-structurally — whitespace is allowed to differ).

### T2. Prior art
- **Per-agent TDD**: `apps/api/src/agents/{riskAgent,careGapAgent,sdohAgent,actionPlannerAgent}.test.ts` are the existing per-agent test files. The new `confidenceScorer.test.ts` follows the same fixture pattern.
- **Citation validator TDD**: `apps/api/src/agents/citationValidator.test.ts` is the closest analog to a "validate the agent output shape" test. The new `apply-clinician-review.test.ts` follows the same pattern.
- **FHIR client TDD against real HAPI**: `apps/api/src/fhir/client.test.ts` has the precedent for "test against the disposable HAPI container, not a mock." The new SMART integration test follows the same pattern.
- **`review:render` no-test convention**: `render-clinician-review.ts` is I/O-heavy and has no unit test. `apply-clinician-review.ts` is similarly I/O-heavy, so the round-trip test goes in a separate `.test.ts` file (not a `main()`-guarded test) and the script itself has no test inside it.

### T3. What gets tested in each new file
- `apps/api/src/agents/confidenceScorer.test.ts`:
  - 1 test per scorer function (3 total) — fixture bundle + fixture finding, assert exact score.
  - 1 test for the Action Planner derivation — fixture task list + fixture upstream findings, assert `min`-of-contributing.
  - 1 test for the "no citation" floor — finding with no `fhirResourceId` gets confidence 0.2.
- `apps/api/src/scripts/apply-clinician-review.test.ts`:
  - 1 round-trip test — start with fixture `labels.json`, fixture `labels.clinician-review.json`, run apply, assert output `labels.json` matches expected.
  - 1 endorsement-only test — review with all `endorse` choices, assert `source` flips to `clinician` but no values change.
  - 1 abstention-only test — review with all `abstain` choices, assert source stays `dev` but `clinicianOverride` is populated.
  - 1 validation-error test — malformed `labels.clinician-review.json` (missing patient, wrong enum), assert apply throws and `labels.json` is not mutated.

### T4. Integration tests in `verification-s14.md`
- 1 SMART 401 test (no token → 401 from HAPI).
- 1 SMART 200 test (valid token → 200 from HAPI).
- 1 SMART app-side test (no token → 401 from app middleware before HAPI is touched).
- 1 eval re-run command + diff of the eval report (`docs/eval-report.md` before vs. after — must show SDOH rate moved off 100%, governance buckets non-zero, % clinician-validated disclosed).
- 1 `review:apply` round-trip command + diff of `data/eval/labels.json` before vs. after.

### T5. What does NOT get tested
- The internal orchestration changes (orchestrator.ts is untouched).
- The new env vars in `docker-compose.yml` (validated by the HAPI container starting successfully; if the public key file is missing HAPI will refuse to start, which is itself the test).
- The LLM-side behavior (no live LLM call anywhere in the S14 tests).
- The existing risk-rubric logic (unchanged from S13b revert).

---

## Out of Scope

- **Gap #1 (Risk PPV 33.3% / LLM variance) — S15.** Deferred. Tracked in `docs/plans/caresync-ai/verification-s13.md §6` as cross-slice debt. The S15 design thread is intentionally not started by this PRD; the user can kick it off with a separate grill when ready.
- **v2 risk-agent rubric.** S15.
- **LLM-variance root cause (model version, system prompt, temperature default).** S15.
- **In-app clinician review queue.** Deferred indefinitely. The `review:render` HTML is sufficient POC UX; a real product would integrate review into the running app, but the POC doesn't.
- **Two-tier label system** (`labels.clinician.json` "blessed" file as a separate source of truth). Not needed for POC; `data/eval/labels.json` with the `source` field on every row is the single source of truth.
- **Pointing HAPI at a real SMART authorization server (Keycloak, Photon, etc.).** The lightweight B config trusts any token signed by the configured public key, which is correct for the POC's client_credentials backend flow. Production handoff is documented in `verification-s14.md` as a follow-up, not built.
- **Clinician review of the SDOH-positive labels themselves.** S14 makes the *path* work; it does not require a real clinician to fill the path. The labels stay `source: "dev"` until a clinician runs `review:apply`.
- **A model-version pin for the LLM API.** This is a cross-cutting concern that affects all three classifier agents, not just Risk. It's part of the S15 LLM-variance investigation.

---

## Further Notes

### Sequencing within S14
The four commits land in the order: #2 (SDOH) → #3 (review:apply) → #4 (confidence) → #5 (SMART A+B). Rationale:
- #2 is the largest data change (FHIR re-import + label updates); doing it first means the re-import is the first thing the PR does and the eval re-run at the end has the most stable baseline.
- #3 is the smallest change (one script + one test); doing it second gets a quick win and lets the eval-report disclosure improve immediately on re-run.
- #4 is the second-largest change (new scorer + schema + 4 unit tests); doing it third means the eval re-run can populate the governance buckets while the data and labels are stable.
- #5 is the most environment-dependent (docker-compose + middleware + new mount); doing it last means the integration test runs against the most stable possible state.

This order is the *recommended* merge order; if the user prefers a different order, the verification matrix is the same.

### Upstream dependencies
- `docs/plans/caresync-ai/grill-secondary-gaps.md` (the shared-understanding artifact this PRD is derived from).
- `docs/plans/caresync-ai/design-risk-calibration.md` (the S13 design that established the reversion precedent for S14's "S15-separate" decision).
- `docs/plans/caresync-ai/verification-s13.md §6` (the LLM-variance debt that S15 will own).
- `docs/eval-report.md` (the 5 gaps as surfaced, the eval report that the S14 re-run must improve).
- `apps/api/src/agents/agent.ts` (the shared `*Output` type module that gets the `confidence` field additions).
- `apps/api/src/agents/citationValidator.ts` (the validation step that calls the new scorer).
- `apps/api/src/scripts/render-clinician-review.ts` (the `review:render` half; S14 ships the `apply` half).
- `apps/api/src/smart/tokenClient.ts` + `assertion.ts` + `keys.ts` (the existing SMART plumbing; S14 adds the validation middleware + the HAPI config).
- `docker-compose.yml` (HAPI container config; S14 adds 2 env vars + 1 bind-mount).
- `data/eval/labels.json` (ground truth; S14 updates 5 rows).
- `data/fhir-data/seed-patients.ts` (or wherever the seed patients are defined — S14 adds 5 new AHC-HRSN Observations).

### Downstream artifacts (S14 commits, in order)
1. `feat(S14): rebalance SDOH labels` — seed-patients.ts + labels.json + eval-report.md disclosure update + new "## SDOH" subsection in the eval report.
2. `feat(S14): review:apply` — apply-clinician-review.ts + apply-clinician-review.test.ts + package.json script + eval-report.md "Status" disclosure update.
3. `feat(S14): per-finding confidence` — confidenceScorer.ts + confidenceScorer.test.ts + agent.ts (schema) + citationValidator.ts (call site) + eval-report.md per-agent confidence tables.
4. `feat(S14): SMART enforcement A+B` — smartAuth.ts + docker-compose.yml (env vars + bind mount) + server.ts (middleware mount) + verification-s14.md SMART curl tests.

### Post-merge follow-up (S15)
- Open a new grill for S15 (Risk v2 rubric + LLM-variance root cause) with a fresh `design-risk-calibration-v2.md` + `prd-s15.md` + `verification-s15.md`.
- If the LLM-variance investigation finds a model-version pin, that change also lands in S15, not S14.
