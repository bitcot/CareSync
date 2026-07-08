# Implementation Plan — S14: Close 4 Secondary Gaps

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PLAN_ID:** `caresync-ai` · **Slice:** S14 · **Date:** 2026-07-08
> **Status:** Ready for implementation (post-grill + post-PRD; awaiting user approval)
> **Specs (in dependency order):** `docs/plans/caresync-ai/grill-secondary-gaps.md` (9-question grill, S14/S15 split), `docs/plans/caresync-ai/prd-s14.md` (PRD D1–D10), `docs/plans/caresync-ai/design-risk-calibration.md` (S13 precedent — read for the "revert-friendly" commit discipline), `docs/plans/caresync-ai/verification-s13.md §6` (LLM-variance debt, owned by S15 — do NOT pull into S14).

**Goal:** Close 4 of the 5 secondary gaps from the HL7 evaluation in a single PR (4 atomic commits): #2 SDOH imbalance, #3 clinician validation apply half, #4 confidence emission, #5 SMART enforcement. Gap #1 (Risk PPV / LLM variance) is out of scope — see S15.

**Architecture:** Three new modules (`apply-clinician-review.ts`, `confidenceScorer.ts`, `smartAuth.ts` middleware); eight modified files (seed-patients.ts, labels.json, agent.ts schema, citationValidator.ts call site, eval.ts disclosure, docker-compose.yml, server.ts middleware mount, package.json). TDD where applicable (#3, #4, #5); data-driven for #2 (no new logic, just new FHIR Observations). The 4 commits are independently revertable — the S13 precedent (`verification-s13.md`) is "one reversion should not take down the other changes."

**Tech Stack delta:** no new external dependencies. Same Jest + Supertest + tsx stack. New token validation uses `jsonwebtoken` (already in `apps/api/package.json` from S1) — no new crypto library.

**Ponytail pass applied:** minimum new seams (3, per `AskUserQuestion` Q1); per-finding schema additions are additive (`?:` not breaking); HAPI config is additive env vars + 1 bind-mount; no speculative work on the gap #1 LLM-variance thread (it stays in S15); confidence scorer is a pure function module with no I/O so it can be unit-tested without mocks; no separate "labels.clinician.json" file (would create two-tier complexity for a POC); no in-app clinician review queue (`review:render` HTML is sufficient).

**Domain source:** `data/eval/labels.json` `_meta.labelingRules.sdoh` (the SDOH labeling rule we update), `apps/api/src/scripts/render-clinician-review.ts` (the apply half's contract — same `buildOutput()` shape inverted), `apps/api/src/agents/agent.ts` (the `*Output` types we add `confidence` to), `apps/api/src/agents/citationValidator.ts` (the seam where the scorer plugs in), `apps/api/src/fhir-data/seed-patients.ts` (the seed schema we extend for negative screenings), `apps/api/src/smart/tokenClient.ts` + `assertion.ts` + `keys.ts` (the SMART plumbing we validate against), `docker-compose.yml` (HAPI container config we extend), `apps/api/src/scripts/eval.ts` (the eval report we extend with confidence buckets + clinician-validated disclosure).

**Branch state:** session opened on `main` per `gitStatus` snapshot — implementation must move to a fresh feature branch (e.g. `feature/s14-secondary-gaps`) per `CLAUDE.md`'s "Repo etiquette" + the skill warning. Implementation tasks below assume the branch already exists and the working tree is clean.

---

## Commit 1 — `feat(S14): rebalance SDOH labels (3 positive + 2 explicit-negative)`

**Goal:** Break the SDOH "1/16 positive, all rest absence-of-screening" distribution that makes the agreement rate trivially gameable. After this commit, the distribution is 4/16 positive (25%), 2/16 explicit-negative (13%), 10/16 absence-of-screening (62%) — and the eval-report SDOH section can show TP/FP/TN/FN for the first time.

**Architecture:** Extend the `SeedPatient` type to carry both positive and negative AHC-HRSN screenings. Update `import-fhir.ts`'s `sdohObservationResource()` to handle both shapes (the FHIR Observation is identical except for `valueString`). Update `data/eval/labels.json`'s `sdoh.expectedHasBarrier` for the 5 touched rows + the `_meta.labelingRules.sdoh` text. No new files; no agent changes; no scorer changes.

**Spec:** `prd-s14.md` D2 + D8. **Decision refs:** D2 (which patients, which domains).

### Phase A — Extend `SeedPatient` schema + importer for negative screenings

- [ ] **A1. Extend the `SeedPatient` interface** in `apps/api/src/fhir-data/seed-patients.ts` to add an `sdohNegative?: { id: string; note: string }` field (mirrors the existing `sdohPositive?: { id: string; note: string }`).
  - *Domain rule:* the FHIR Observation shape for an AHC-HRSN screening is the same whether the note is positive or negative — only `valueString` differs (see `import-fhir.ts:94` `sdohObservationResource`). The seed-schema extension is just a label, not a new resource type.
  - *JSDoc:* explain that `sdohPositive` = "screened, barriers found," `sdohNegative` = "screened, no barriers found." Absence of both = "no screening" (untouched by this slice).
  - *Verify:* `npx tsc --noEmit` clean.

- [ ] **A2. Update `import-fhir.ts:189`** (the `entries.push(sdohObservationResource(...))` call) so both `sdohPositive` and `sdohNegative` push an entry, with the same LOINC code `71802-3` and the same `category: 'sdoh'` — only `valueString` differs.
  - *ponytail:* one helper, two callers — don't duplicate the `sdohObservationResource` function. Pass a small `{ positive: boolean }` flag if the function needs to disambiguate, or just inline the call.
  - *Verify:* `npx tsc --noEmit` clean.

### Phase B — Add screenings to 5 patients in `seed-patients.ts`

- [ ] **B1. Add `sdohPositive: { id: 'james-okafor-sdoh', note: 'AHC-HRSN screening positive: transportation barriers, medication-cost barriers' }`** to the `james-okafor` entry in `PANEL_PATIENTS` (line ~80 area).
  - *Rationale:* COPD + recent inpatient → plausible post-discharge transportation + medication-cost barriers.
  - *Verify:* `grep -n "james-okafor-sdoh" apps/api/src/fhir-data/seed-patients.ts` finds it.

- [ ] **B2. Add `sdohPositive: { id: 'angela-diaz-sdoh', note: 'AHC-HRSN screening positive: mental-health-access barriers, social isolation' }`** to the `angela-diaz` entry in `PANEL_PATIENTS`.
  - *Rationale:* HTN + depression + zero Observations → mental-health-access + social-isolation barriers.

- [ ] **B3. Find `pop-0010` in `apps/api/src/fhir-data/population.ts`** (the procedural generator; it's not in `seed-patients.ts` because procedural patients are generated). Add an `sdohPositive` field to the `pop-0010` generator branch — find by index 9 (the 10th procedural patient; `generatePopulation()[9]`).
  - *Important:* procedural patients are generated, not declared, so the change lives in `population.ts`'s generator, not `seed-patients.ts`. Confirm via `grep -n "pop-0010" apps/api/src/fhir-data/population.ts`.
  - *If the procedural generator does not currently carry an SDOH field,* add one alongside the existing `riskScore`/`conditions`/`sdoh` fields per the same shape as `seed-patients.ts`'s `sdohPositive`. Use id `pop-0010-sdoh` and a note like `'AHC-HRSN screening positive: social-isolation barriers, financial barriers'`.
  - *ponytail:* if 5+ other procedural patients also need SDOH negatives/positives to keep the distribution clean, only add `pop-0010`'s positive for this slice (the explicit-negatives go to `pop-0005` in B5).
  - *Verify:* `grep -n "pop-0010-sdoh" apps/api/src/fhir-data/population.ts` finds it.

- [ ] **B4. Add `sdohNegative: { id: 'robert-kim-sdoh', note: 'AHC-HRSN screening: no social barriers identified' }`** to the `robert-kim` entry in `PANEL_PATIENTS`.
  - *Rationale:* acute hip fracture + otherwise stable demographic — "patient screened, no barriers" is plausible and lets the eval distinguish TN from "agent correctly abstained."

- [ ] **B5. Add `sdohNegative: { id: 'pop-0005-sdoh', note: 'AHC-HRSN screening: no social barriers identified' }`** to the `pop-0005` generator branch in `population.ts` (index 4).
  - *Rationale:* HTN + depression but stable housing + insurance per the procedural generator — same as robert-kim.

### Phase C — Update `labels.json`

- [ ] **C1. Update `data/eval/labels.json`'s `_meta.labelingRules.sdoh`** from the current text to: `"expectedHasBarrier is true if the patient has a seeded AHC-HRSN screening with positive findings (\`sdohPositive\` in seed-patients.ts), false if the patient has a seeded AHC-HRSN screening with negative findings (\`sdohNegative\`), and unlabeled (omitted from this row's `expectedHasBarrier`) if no screening exists. Only patients with one of these screening Observations are labeled for SDOH."`
  - *Domain rule:* the labeling rule is the single source of truth for what `expectedHasBarrier` means; the eval-report's "Status" disclosure references this rule by name.

- [ ] **C2. Update `data/eval/labels.json`'s `james-okafor.sdoh`** row: `expectedHasBarrier: true`, `expectedDomains: ['transportation', 'financial']`, `notes: "Seed AHC-HRSN screening Observation/james-okafor-sdoh added 2026-07-08 — positive for transportation and financial barriers (dev interpretation; profile: COPD + recent inpatient supports post-discharge access barriers)."`
  - *Source field:* stays `"dev"`.

- [ ] **C3. Update `angela-diaz.sdoh`** row: `expectedHasBarrier: true`, `expectedDomains: ['mental-health', 'social-isolation']`, `notes: "Seed AHC-HRSN screening Observation/angela-diaz-sdoh added 2026-07-08 — positive for mental-health-access and social-isolation barriers (dev interpretation)."`

- [ ] **C4. Update `pop-0010.sdoh`** row: `expectedHasBarrier: true`, `expectedDomains: ['social-isolation', 'financial']`, `notes: "Seed AHC-HRSN screening Observation/pop-0010-sdoh added 2026-07-08 — positive for social-isolation and financial barriers (dev interpretation of procedural profile)."`

- [ ] **C5. Update `robert-kim.sdoh`** row: `expectedHasBarrier: false`, `notes: "Seed AHC-HRSN screening Observation/robert-kim-sdoh added 2026-07-08 — explicit negative (screened, no barriers). profile: acute hip fracture + otherwise stable demographic supports plausibility."`

- [ ] **C6. Update `pop-0005.sdoh`** row: `expectedHasBarrier: false`, `notes: "Seed AHC-HRSN screening Observation/pop-0005-sdoh added 2026-07-08 — explicit negative (screened, no barriers)."`

### Phase D — Re-import + verify

- [ ] **D1. Run `npm run import` from `apps/api`.** Should be idempotent (the existing import uses PUT for known ids).
  - *Verify:* "Import complete" message with non-zero FHIR Observation count (5 more than before: 3 positive + 2 negative).
  - *If import fails:* check HAPI is up (`docker compose ps`); check the seed-schema change didn't break TypeScript compilation (`npx tsc --noEmit`).

- [ ] **D2. Spot-check via curl (or via the existing `client.test.ts` pattern) that the new Observations are in HAPI:**
  - `curl -s http://localhost:8080/fhir/Observation/james-okafor-sdoh | jq '.valueString'`
  - Repeat for `angela-diaz-sdoh`, `pop-0010-sdoh`, `robert-kim-sdoh`, `pop-0005-sdoh`.
  - *Verify:* each returns the expected `valueString` (the note).

- [ ] **D3. Commit 1: `git add` the 3 files (`seed-patients.ts`, `population.ts`, `labels.json` + any auto-imported files), commit message:**
  ```
  feat(S14): rebalance SDOH labels (3 positive + 2 explicit-negative)

  Adds AHC-HRSN screening Observations for james-okafor, angela-diaz,
  pop-0010 (positive) and robert-kim, pop-0005 (explicit-negative).
  Brings SDOH distribution from 1/16 positive (trivially gameable) to
  4/16 positive + 2/16 explicit-negative (not gameable). Updates
  labels.json _meta.labelingRules.sdoh to document the new rule.

  Spec: prd-s14.md D2 + grill-secondary-gaps.md §2
  ```

---

## Commit 2 — `feat(S14): review:apply (the missing apply half)`

**Goal:** Ship the script that consumes the `labels.clinician-review.json` file the `review:render` HTML form downloads and writes the reviewer's overrides back into `data/eval/labels.json`. After this commit, a clinician can fill the HTML form, download the JSON, and run one command (`npm run review:apply`) to apply the review.

**Architecture:** New `apps/api/src/scripts/apply-clinician-review.ts` (mirrors the convention of `render-clinician-review.ts` — I/O-heavy script with `main()` guarded by `require.main === module`, no in-script test). New `apply-clinician-review.test.ts` that does the round-trip against a fixture. New `npm run review:apply` script in `package.json`. No agent, scorer, schema, or HAPI changes.

**Spec:** `prd-s14.md` D3 + D8. **Decision refs:** Q5 (script Option A).

### Phase A — TDD scaffolding (RED → GREEN)

- [ ] **A1. Create `apply-clinician-review.test.ts` (RED)** with three fixtures in ONE round-trip test covering the three outcomes — override (flips `source` + mutates value), endorse (records in `clinicianOverride` but keeps `source: "dev"`), abstain (flips `source` but keeps value). Test writes fixtures to `fs.mkdtempSync` (never the committed labels file), invokes `applyReview(reviewPath, labelsPath)`, asserts all three outcomes in one pass.
  - *Verify:* `cd apps/api && npx jest src/scripts/apply-clinician-review.test.ts` → test FAILS (function doesn't exist yet).

- [ ] **A2. Create `apply-clinician-review.ts` (GREEN)** with `applyReview(reviewPath, labelsPath)`:
  - Reads + parses both files; validates (every patient ID in review exists in labels; `choice ∈ {endorse, override, abstain}`; if `override`, `overrideValue ∈ {"true"|"false"|"null"}`). Throws structured error on failure — `labels.json` is NOT mutated.
  - For each row in the review: if any dim is `override` OR `abstain`, set `source: 'clinician'` + populate `clinicianOverride` slot; if `override`, also set the value; if all `endorse`, leave `source: 'dev'` but still record endorsement in `clinicianOverride`.
  - Writes mutated labels (2-space JSON, same style as `render-clinician-review.ts:362`); returns `summary: { updated, endorsed, abstained, errors }`.
  - *Verify:* A1 now PASSES.

- [ ] **A3. Add a second test** in `apply-clinician-review.test.ts`: fixture review with one patient ID not in labels → assert `applyReview()` throws AND `labels.json` is unchanged (round-trip via `fs.readFileSync`).
  - *Verify:* test passes.

### Phase B — CLI + npm script

- [ ] **B1. Add `main()` to `apply-clinician-review.ts`**: cwd for review (`./labels.clinician-review.json`), committed path for labels, prints CHANGELOG summary, guarded by `if (require.main === module) { main(); }`. Add `"review:apply": "tsx src/scripts/apply-clinician-review.ts"` to `package.json` scripts.
  - *Verify:* `npx jest src/scripts/` all green; `npx tsx src/scripts/apply-clinician-review.ts` runs without error on a fresh fixture (no actual apply needed yet).

- [ ] **B2. Commit 2:**
  ```
  feat(S14): review:apply (the missing apply half)

  Adds apps/api/src/scripts/apply-clinician-review.ts that reads
  labels.clinician-review.json (downloaded from the review:render HTML
  form) and writes overrides back into data/eval/labels.json. Sets
  source: "clinician" on touched rows, populates the clinicianOverride
  slot, prints a CHANGELOG summary. New npm run review:apply script.

  The review:render half shipped in S9 C2; this commit closes the
  round-trip so the eval-report "Status" disclosure can move from
  "all dev" to "N clinician-validated (X%), M dev-labeled (Y%)".

  Spec: prd-s14.md D3 + grill-secondary-gaps.md §3
  ```

---

## Commit 3 — `feat(S14): per-finding confidence via bundle-evidence heuristic`

**Goal:** Add a deterministic, auditable `confidence: number` (0-1) to every finding the four agents emit, plus a derived confidence on Action Planner tasks. After this commit, the eval-report's per-agent section can bucket findings by confidence and report accuracy per bucket — the "governance buckets" stop being zero.

**Architecture:** New `apps/api/src/agents/confidenceScorer.ts` (3 pure scoring functions + 1 derivation helper). Schema additions to `apps/api/src/agents/agent.ts` (add `confidence: number` to each finding shape). New `confidenceScorer.test.ts` (4 tests + 1 floor test). Wire the scorer into the citation validator (or the orchestrator's validation step) so the validated output carries `confidence`. No new dependencies, no new routes, no HAPI changes.

**Spec:** `prd-s14.md` D4 + D5 + D8. **Decision refs:** Q6 (Option B — heuristic, not model self-report).

### Phase A — TDD scorers (RED → GREEN)

- [ ] **A1. Create `apps/api/src/agents/confidenceScorer.test.ts`** with 5 test cases FIRST (RED). All tests use fixture bundles (no HAPI I/O):
  - `scoreRiskFlag`: bundle with 1 cited resource + 1 abnormal lab + 0 recent encounters → expected score 0.5 (0.3 + 0.2×1 + 0.2×1 + 0.2×0).
  - `scoreRiskFlag`: bundle with 0 cited resources, no abnormal labs, no recent encounters → expected score 0.3 (floor).
  - `scoreCareGap`: bundle with the cited Condition present and the matching Observation absent → expected score 0.9.
  - `scoreSdohBarrier`: barrier citing an AHC-HRSN Observation (resource type Observation, code 71802-3) → expected score 0.9.
  - `deriveActionPlannerTaskConfidence`: task with 2 contributing findings at confidences 0.7 and 0.4 → expected score 0.4 (min).
  - *Verify:* `cd apps/api && npx jest src/agents/confidenceScorer.test.ts` → all 5 tests FAIL (module doesn't exist).

- [ ] **A2. Create `apps/api/src/agents/confidenceScorer.ts`** (GREEN). Module exports:
  - `scoreRiskFlag(flag: RiskFlag, bundle: PatientBundle): number` — implements the formula `min(0.9, 0.3 + 0.2 × citationCount + 0.2 × hasAbnormalLab + 0.2 × recentEncounter)`. `hasAbnormalLab` checks the bundle for any Observation whose LOINC code is in `{4548-4, 30934-4, 62238-1}` with value `> 9.0` (HbA1c), `> 200` (BNP), or `< 30` (eGFR) respectively. `recentEncounter` checks the bundle for any Encounter whose `period.end` is within the last 30 days.
  - `scoreCareGap(gap: CareGap, bundle: PatientBundle): number` — implements the 0.9 / 0.4 / 0.2 logic per D5.
  - `scoreSdohBarrier(barrier: SdohBarrier, bundle: PatientBundle): number` — implements the 0.9 / 0.4 / 0.2 logic per D5. The "AHC-HRSN Observation with positive screening code" detection: `bundle.resources` includes an Observation with LOINC code `71802-3` whose `valueString` does NOT match `/no barriers/i` (i.e., positive finding).
  - `deriveActionPlannerTaskConfidence(tasks: ActionPlannerTask[], findings: { fhirResourceId: string; confidence: number }[]): number[]` — for each task, return `min(findings.filter(f => task.fhirResources.includes(f.fhirResourceId)).map(f => f.confidence)) || 0.2`.
  - *Domain rule:* pure functions; no I/O; no LLM call; deterministic. The existing `PatientBundle` type from `apps/api/src/fhir/client.ts` is the input shape.
  - *Verify:* test A1 now PASSES (all 5 tests green).

### Phase B — Schema + integration

- [ ] **B1. Update `apps/api/src/agents/agent.ts`** to add `confidence: number` to each finding shape (`RiskOutput.flags[i]`, `CareGapOutput.gaps[i]`, `SdohOutput.barriers[i]`, `ActionPlannerOutput.tasks[i]`) plus the matching `AgentEvent` result variants. Update `apps/api/src/agents/mock-outputs.ts` to fill `confidence: 0.5` placeholders so the type compiles (the real number lands via the scorer in production).
  - *Domain rule:* additive field — existing code keeps working with the placeholder; the scorer rewrites it post-validation.
  - *Verify:* `npx tsc --noEmit` clean.

- [ ] **B2. Wire the scorer into `citationValidator.ts`** (or wherever `validateCitations` is called — check `orchestrator.ts`): after `validateCitations` drops fabricated citations, call `scoreRiskFlag` / `scoreCareGap` / `scoreSdohBarrier` on each surviving finding and write the score into the finding's `confidence` field. For Action Planner, call `deriveActionPlannerTaskConfidence` after collecting all upstream findings. The scorer runs on the validated output, not the raw agent output — dropped flags get no score.
  - *Verify:* existing `citationValidator.test.ts` still passes; `npx jest src/agents/` all green (riskAgent, careGapAgent, sdohAgent, actionPlannerAgent, citationValidator, confidenceScorer).

- [ ] **B5. Commit 3:**
  ```
  feat(S14): per-finding confidence via bundle-evidence heuristic

  Adds apps/api/src/agents/confidenceScorer.ts with 3 pure scoring
  functions (Risk/CareGap/SDOH) + 1 derivation helper (Action Planner
  task confidence = min of contributing findings). Adds confidence: 0-1
  to every finding in apps/api/src/agents/agent.ts (RiskOutput.flags,
  CareGapOutput.gaps, SdohOutput.barriers, ActionPlannerOutput.tasks).
  Wires the scorer into citationValidator.ts so the validated output
  carries confidence.

  Why heuristic, not model self-report: the model is already
  biased on Risk (see verification-s13.md §4 LLM variance); we don't
  compound that with biased self-reported confidence. Heuristic scores
  are auditable, deterministic, and reproducible.

  Spec: prd-s14.md D4 + D5 + grill-secondary-gaps.md §4
  ```

---

## Commit 4 — `feat(S14): SMART enforcement A+B (app middleware + HAPI config)`

**Goal:** Make SMART-on-FHIR actually enforced. After this commit, unauthenticated calls are rejected at the HAPI boundary (real enforcement) AND at the API middleware tier (developer guard), with curl-testable 401/200 evidence.

**Architecture:** New `apps/api/src/middleware/smartAuth.ts` (Express middleware that decodes the JWT Bearer token, verifies signature, checks `exp`/`aud`/`scope`, throws structured 401/403). New `docker-compose.yml` env vars + bind-mount of the public-key counterpart of the existing keypair. New `smartAuth.test.ts` (4 unit tests + 1 integration test). Mount the middleware on HAPI-touching routes in `apps/api/src/server.ts` (or wherever routes are declared). No agent, scorer, or eval changes.

**Spec:** `prd-s14.md` D6 + D7 + D8. **Decision refs:** Q7+Q8 (A+B lightweight).

### Phase A — Extract public key + docker-compose (no TDD — config)

- [ ] **A1. Extract the public key from `apps/api/src/smart/keys.ts`** to `apps/api/src/smart/keys/smart-public.pem` (public-key block only — the private key stays in `keys.ts`). Update `docker-compose.yml` `hapi-fhir`: add `hapi.fhir.security.oauth.enable_jwt_validation: "true"` + `hapi.fhir.security.oauth.public_key_location: file:/keys/smart-public.pem` to `environment`, and `volumes: - ./apps/api/src/smart/keys:/keys:ro` to the service.
  - *Note:* the exact HAPI env-var keys may differ from these placeholders — check `hapiproject/hapi:v7.2.0` source/docs. If wrong, HAPI starts but rejects all requests; Phase D's curl test catches this.
  - *Verify:* `cat apps/api/src/smart/keys/smart-public.pem` shows a valid PEM block; `docker compose config` parses cleanly.

### Phase B — TDD middleware (RED → GREEN)

- [ ] **B1. Create `apps/api/src/middleware/smartAuth.test.ts`** with 5 test cases FIRST (RED):
  - `valid token → next() called, no error thrown` (mint a real token via `mintClientAssertion`, attach to req, assert `next` called once with no arg).
  - `no token → next called with 401 error` (assert `next` called once with an error whose `statusCode === 401` and `body.error === 'smart_auth_failed'`).
  - `tampered token → next called with 401 error` (mint a real token, flip a byte, attach, assert 401).
  - `expired token → next called with 401 error` (mint a token with `exp` in the past — direct JWT construction, not via `mintClientAssertion`; assert 401 with `reason: 'token_expired'`).
  - `wrong scope → next called with 403 error` (mint a token with no `patient/*.write` scope, hit a POST route, assert 403 with `reason: 'insufficient_scope'`).
  - *Domain rule:* these tests need the public key file to exist (A1) and a way to mint tokens; both already exist in `apps/api/src/smart/`.
  - *Verify:* `cd apps/api && npx jest src/middleware/smartAuth.test.ts` → all 5 tests FAIL (module doesn't exist).

- [ ] **B2. Create `apps/api/src/middleware/smartAuth.ts`** (GREEN). Module exports an Express middleware factory:
  - `createSmartAuthMiddleware({ publicKey, audience, requiredScopesByMethod })` returns `(req, res, next) => void`.
  - Reads `Authorization` header; if missing/doesn't start with `Bearer `, throws 401 (`reason: 'missing_token'`).
  - Decodes the JWT (without verifying first — just to inspect structure); if structure invalid, throws 401 (`reason: 'malformed_token'`).
  - Verifies the signature against `publicKey`; if verification fails, throws 401 (`reason: 'invalid_signature'`).
  - Checks `exp` (with 30s safety margin); if expired, throws 401 (`reason: 'token_expired'`).
  - Checks `aud` against the configured audience; if mismatch, throws 401 (`reason: 'wrong_audience'`).
  - Checks `scope` against `requiredScopesByMethod[req.method]`; if insufficient, throws 403 (`reason: 'insufficient_scope'`).
  - On success, attaches `req.smartAuth = { sub, scope, exp }` and calls `next()` with no arg.
  - Errors are thrown as `SmartAuthError extends Error` with a `.statusCode` property; a small `smartAuthErrorHandler` exports the matching Express error handler that sends the JSON response `{ error: 'smart_auth_failed', reason: '...' }`.
  - *Verify:* all 5 tests in B1 now PASS.

### Phase C — Mount middleware

- [ ] **C1. Mount the middleware in `apps/api/src/server.ts`** (or `apps/api/src/index.ts` — wherever the routes are declared). The mount order:
  - Mount `smartAuthErrorHandler` FIRST (catches errors thrown by the middleware).
  - Mount `createSmartAuthMiddleware({ publicKey, audience: process.env.SMART_AUDIENCE, requiredScopesByMethod: { GET: ['patient/*.read'], POST: ['patient/*.write'], PUT: ['patient/*.write'], DELETE: ['patient/*.write'] } })` on every route that touches HAPI.
  - *Identify HAPI-touching routes:* `grep -rn "fhirFetch\|FHIR_BASE\|/api/patients\|/api/analysis" apps/api/src/routes/` to enumerate.
  - *Don't mount on `/api/auth/*` (login doesn't need a SMART token) and `/api/health` (health checks shouldn't auth).*
  - *Domain rule:* the middleware is mounted per-route, not globally — login and health stay open.
  - *Verify:* existing tests for the HAPI-touching routes still pass (with the test fixtures providing a valid Bearer token).

### Phase D — Integration tests (curl, in `verification-s14.md` — not in TDD)

- [ ] **D1. `docker compose up -d hapi-fhir`** (HAPI starts with the new env vars + bind-mount).
  - *Verify:* `docker compose ps` shows `hapi-fhir` healthy.

- [ ] **D2. 401 from HAPI without token.** `curl -i http://localhost:8080/fhir/Patient/maria-chen` → `HTTP/1.1 401 Unauthorized`. If HAPI returns 200: `docker compose logs hapi-fhir` will show why the public key isn't being read.

- [ ] **D3. 200 from HAPI with valid token.** Mint a real token (one-off `tsx` script or extending `tokenClient.test.ts`), `curl -i http://localhost:8080/fhir/Patient/maria-chen -H "Authorization: Bearer <token>"` → `HTTP/1.1 200 OK` with Patient body.

- [ ] **D4. Commit 4:**
  ```
  feat(S14): SMART enforcement A+B (app middleware + HAPI config)

  A (app-side, developer guard): new apps/api/src/middleware/smartAuth.ts
  decodes the Bearer token, verifies signature against the existing
  public key, checks exp/aud/scope, throws 401/403 with structured
  reason codes. Mounted on HAPI-touching routes in server.ts.

  B (HAPI-side, the real fix): new docker-compose.yml env vars
  (hapi.fhir.security.oauth.enable_jwt_validation=true +
  public_key_location) + bind-mount of apps/api/src/smart/keys/
  smart-public.pem. HAPI now rejects unauthenticated calls at the FHIR
  boundary; verification-s14.md documents the curl 401/200 evidence.

  The lightweight B config trusts any token signed by the configured
  public key — correct for the POC's client_credentials flow but not
  the right shape for production multi-actor SMART. verification-s14.md
  notes the production handoff (point HAPI at a real SMART auth server).

  Spec: prd-s14.md D6 + D7 + grill-secondary-gaps.md §5
  ```

---

## Phase E — Verification matrix + verification-s14.md (post-merge)

> These are post-merge verification steps. They run after all 4 commits land on `main`, not as part of any one commit.

- [ ] **E1. Run `npm run eval`** from `apps/api`. Confirm:
  - SDOH agreement rate moved off 100% (target 70-90%).
  - SDOH section shows TP/FP/TN/FN counts (first time ever).
  - Risk / Care Gap sensitivity + specificity + PPV are unchanged from the pre-S14 committed report (S14 doesn't touch the S13 risk agent or Care Gap classification logic).
  - Per-agent section has confidence-bucketed accuracy sub-tables with non-zero buckets.
  - "Status" disclosure reads "X of 16 clinician-validated (Y%), M of 16 dev-labeled (N%)."
  - *Verify:* the regenerated `docs/eval-report.md` exists and contains all 4 signals.

- [ ] **E2. Write `docs/plans/caresync-ai/verification-s14.md`** following the `verification-s13.md` template:
  - Header: PLAN_ID, slice, date, spec sources (grill + prd + this plan).
  - §1: outcome — each of the 4 fixes' status (DONE / NOT-DONE with reason).
  - §2: fresh command evidence (`npx jest`, `tsc --noEmit`, `npm run eval`, the curl tests).
  - §3: TDD evidence (the new tests added in commits 2, 3, 4; their green-after-red traces).
  - §4: live re-eval — what changed in `docs/eval-report.md` (SDOH rate, governance buckets, % clinician-validated).
  - §5: definition-of-done check (the 4-row verification matrix from `prd-s14.md` §Testing Decisions T4).
  - §6: open follow-ups — likely the "long-term production SMART handoff" note + any LLM-variance remnants from S13.

- [ ] **E3. Write `docs/plans/caresync-ai/review-s14.md`** following the `review-s13.md` two-axis pattern (correctness + design).

---

## Rollback / safety

Each of the 4 commits is independently revertable:

| Commit | Revert command | What reverts |
|---|---|---|
| 1 (SDOH) | `git revert <commit-sha>` | Drops the 5 new AHC-HRSN Observations from HAPI (via re-running `npm run import`); reverts labels.json to the 1/16-positive state. The eval-report disclosure returns to "all dev-labeled." |
| 2 (review:apply) | `git revert <commit-sha>` | Removes the `apply-clinician-review.ts` script + tests + npm script. The `review:render` half still works (no change to it). No data reverts. |
| 3 (confidence) | `git revert <commit-sha>` | Removes the `confidenceScorer.ts` + tests + schema additions + citationValidator integration. The agents emit no `confidence` field again — but since the schema addition is additive, the TypeScript types revert to the pre-S14 form. Eval-report governance buckets return to zero. |
| 4 (SMART A+B) | `git revert <commit-sha>` | Removes the middleware + docker-compose changes. HAPI stops validating JWTs (returns to open). The app stops validating tokens at the API tier. The pre-S14 "token minted/attached but HAPI doesn't validate it" gap returns. |

**Safety net: the 4-commit PR can be reverted as a whole** (`git revert <merge-sha>...<tip-sha>`) if any single-commit revert is too surgical. The eval re-run after a full revert reproduces the pre-S14 committed `docs/eval-report.md`.

**Note on Commit 1 specifically:** the seed-schema change (extending `SeedPatient` with `sdohNegative`) is additive — reverting it does NOT break the existing patients, only the 2 negative-screening rows. After a partial revert, `pop-0005` and `robert-kim` lose their explicit-negative screenings and become "absence-of-screening" rows again (a known regression that's smaller than the bug the commit fixes).

---

## Definition of done (S14)

Maps to `issues.md` + `prd-s14.md`:

- [ ] **D1.** `data/eval/labels.json` `sdoh.expectedHasBarrier` updated for 5 rows; `_meta.labelingRules.sdoh` updated to reference both `sdohPositive` and `sdohNegative`.
- [ ] **D2.** `seed-patients.ts` extended with `sdohNegative` field; `population.ts` `pop-0010` and `pop-0005` carry AHC-HRSN screenings (positive / negative respectively).
- [ ] **D3.** `npm run import` succeeds; 5 new Observations are fetchable from HAPI via curl.
- [ ] **D4.** `npm run review:apply` exists, has a round-trip test (override + endorse + abstain in one fixture) + validation-error test, and applies overrides to `labels.json` correctly.
- [ ] **D5.** `confidenceScorer.ts` exists with 3 pure scoring functions + 1 derivation helper; all 5 `confidenceScorer.test.ts` tests pass; `agent.ts` `*Output` types have `confidence: number` on each finding; `citationValidator.ts` writes the score into the validated output.
- [ ] **D6.** `smartAuth.ts` exists with the 5-test unit suite passing; mounted on HAPI-touching routes in `server.ts`; `docker-compose.yml` carries the JWT-validation env vars + public-key bind-mount.
- [ ] **D7.** `npm run eval` regenerated report shows SDOH rate off 100%, governance buckets non-zero, % clinician-validated disclosed.
- [ ] **D8.** `verification-s14.md` + `review-s14.md` written, all 4 verification matrix rows pass (SDOH rate, review:apply round-trip, confidence buckets, 401/200 SMART curl).
- [ ] **D9.** Branch `feature/s14-secondary-gaps` opens PR against `main`; PR description cites `prd-s14.md` and the grill file; merge per `CLAUDE.md` "Repo etiquette" (no direct commits to `main`).

---

## Open follow-ups (deferred — these belong to S15 or later)

1. **Risk agent v2 rubric + LLM-variance root cause** — owned by S15. Per `verification-s13.md §6`. Do NOT pull into S14.
2. **Production SMART handoff** — point HAPI at a real SMART authorization server (Keycloak, SMART authorization sandbox, etc.). Out of scope for S14; `verification-s14.md` should note the gap.
3. **Model-version pin for the LLM API** — cross-cutting concern affecting all 3 classifier agents. Owned by S15.
4. **In-app clinician review queue** — deferred indefinitely. `review:render` HTML is sufficient POC UX.