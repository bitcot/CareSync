# Active slice: S14 — Close 4 Secondary Gaps

## Approved: no (awaiting user approval)

Source: `implementation-plan-s14.md` · Spec: `prd-s14.md` (D1–D10) · Decisions: `grill-secondary-gaps.md` (9-question grill, S14/S15 split). Prior slice S11 archived in git history + `verification-s11.md`.

**Goal:** Close 4 of the 5 secondary gaps from the HL7 evaluation in a single PR (4 atomic commits): #2 SDOH imbalance, #3 clinician validation apply half, #4 confidence emission, #5 SMART enforcement. Gap #1 (Risk PPV / LLM variance) is out of scope — see S15.

**Architecture:** 3 new modules (`apply-clinician-review.ts`, `confidenceScorer.ts`, `smartAuth.ts`) + 8 modified files (seed-patients.ts, labels.json, agent.ts schema, citationValidator.ts call site, eval.ts disclosure, docker-compose.yml, server.ts middleware mount, package.json). TDD where applicable (#3, #4, #5); data-driven for #2 (no new logic, just new FHIR Observations).

**Ponytail pass applied:** minimum new seams (3); per-finding schema additions are additive; HAPI config is additive env vars + 1 bind-mount; no speculative work on gap #1; confidence scorer is pure (no I/O); no separate labels.clinician.json (would create two-tier complexity); no in-app clinician review queue.

**Branch state (per skill warning):** implementation must move to a fresh feature branch (e.g. `feature/s14-secondary-gaps`) before any code lands. Do NOT implement from `main`.

---

## Commit 1 — feat(S14): rebalance SDOH labels

- [ ] A1. Extend `SeedPatient` with `sdohNegative?: { id, note }` in `apps/api/src/fhir-data/seed-patients.ts`. `npx tsc --noEmit` clean.
- [ ] A2. Update `import-fhir.ts:189` to push both `sdohPositive` and `sdohNegative` AHC-HRSN Observations (LOINC 71802-3). `npx tsc --noEmit` clean.
- [ ] B1. Add `sdohPositive: { id: 'james-okafor-sdoh', note: 'AHC-HRSN screening positive: transportation barriers, medication-cost barriers' }` to `james-okafor`.
- [ ] B2. Add `sdohPositive: { id: 'angela-diaz-sdoh', note: 'AHC-HRSN screening positive: mental-health-access barriers, social isolation' }` to `angela-diaz`.
- [ ] B3. Add `sdohPositive` to `pop-0010` (index 9) in `population.ts`.
- [ ] B4. Add `sdohNegative: { id: 'robert-kim-sdoh', note: 'AHC-HRSN screening: no social barriers identified' }` to `robert-kim`.
- [ ] B5. Add `sdohNegative` to `pop-0005` (index 4) in `population.ts`.
- [ ] C1. Update `labels.json._meta.labelingRules.sdoh` to reference both `sdohPositive` and `sdohNegative`.
- [ ] C2. Update `james-okafor.sdoh` row: `expectedHasBarrier: true`, `expectedDomains: ['transportation', 'financial']`, rich notes. `source: "dev"` stays.
- [ ] C3. Update `angela-diaz.sdoh` row: `expectedHasBarrier: true`, `expectedDomains: ['mental-health', 'social-isolation']`, rich notes.
- [ ] C4. Update `pop-0010.sdoh` row: `expectedHasBarrier: true`, `expectedDomains: ['social-isolation', 'financial']`, rich notes.
- [ ] C5. Update `robert-kim.sdoh` row: `expectedHasBarrier: false`, rich notes (explicit-negative).
- [ ] C6. Update `pop-0005.sdoh` row: `expectedHasBarrier: false`, rich notes (explicit-negative).
- [ ] D1. `npm run import` (idempotent PUT). Verify HAPI has 5 new Observations.
- [ ] D2. Spot-check via curl: each new Observation returns the expected `valueString`.
- [ ] D3. Commit: `feat(S14): rebalance SDOH labels (3 positive + 2 explicit-negative)`.

**Verify:** `npm run eval` shows SDOH rate off 100%; TP/FP/TN/FN appear for the first time.

---

## Commit 2 — feat(S14): review:apply

- [ ] A1. RED: Create `apply-clinician-review.test.ts` with one round-trip test covering override + endorse + abstain in one fixture. `npx jest` → fails.
- [ ] A2. GREEN: Create `apply-clinician-review.ts` with `applyReview(reviewPath, labelsPath)` (reads, validates, mutates, writes). Round-trip test passes.
- [ ] A3. Add second test: bad patient ID → throws + labels.json untouched. Passes.
- [ ] B1. Add `main()` (cwd review, committed path labels, CHANGELOG summary, `require.main === module` guard) + add `"review:apply": "tsx src/scripts/apply-clinician-review.ts"` to `apps/api/package.json`.
- [ ] B2. Commit: `feat(S14): review:apply (the missing apply half)`.

**Verify:** `npx jest src/scripts/` all green; `npm run review:render` → fill form → download JSON → `npm run review:apply` → labels.json mutated as expected.

---

## Commit 3 — feat(S14): per-finding confidence

- [ ] A1. RED: Create `confidenceScorer.test.ts` with 5 cases (3 scorer functions + Action Planner derivation + 1 more). `npx jest` → fails.
- [ ] A2. GREEN: Create `confidenceScorer.ts` with `scoreRiskFlag`, `scoreCareGap`, `scoreSdohBarrier`, `deriveActionPlannerTaskConfidence`. All 5 tests pass.
- [ ] B1. Update `agent.ts` to add `confidence: number` to each finding shape (RiskOutput.flags, CareGapOutput.gaps, SdohOutput.barriers, ActionPlannerOutput.tasks) + update `mock-outputs.ts` to fill `confidence: 0.5` placeholder. `tsc --noEmit` clean.
- [ ] B2. Wire scorer into `citationValidator.ts`: call scorer after `validateCitations`, write score into the validated finding's `confidence` field.
- [ ] B3. `npx jest src/agents/` all green; no regressions.
- [ ] B4. Commit: `feat(S14): per-finding confidence via bundle-evidence heuristic`.

**Verify:** `npm run eval` shows per-agent confidence-bucketed accuracy sub-tables with non-zero buckets.

---

## Commit 4 — feat(S14): SMART enforcement A+B

- [ ] A1. Extract public key from `apps/api/src/smart/keys.ts` to `apps/api/src/smart/keys/smart-public.pem`. Update `docker-compose.yml` `hapi-fhir`: add `hapi.fhir.security.oauth.enable_jwt_validation: "true"` + `hapi.fhir.security.oauth.public_key_location: file:/keys/smart-public.pem` + bind-mount `./apps/api/src/smart/keys:/keys:ro`. `docker compose config` clean.
- [ ] B1. RED: Create `smartAuth.test.ts` with 5 cases (valid → next; no token → 401; tampered → 401; expired → 401; wrong scope → 403). `npx jest` → fails.
- [ ] B2. GREEN: Create `smartAuth.ts` with `createSmartAuthMiddleware({ publicKey, audience, requiredScopesByMethod })` + `smartAuthErrorHandler`. All 5 tests pass.
- [ ] C1. Mount middleware on HAPI-touching routes in `server.ts` (NOT on `/api/auth/*` or `/api/health`). Existing route tests still pass with valid Bearer tokens in fixtures.
- [ ] D1. `docker compose up -d hapi-fhir`. `curl -i http://localhost:8080/fhir/Patient/maria-chen` → 401 Unauthorized. With valid token: 200 OK with Patient body.
- [ ] D2. Commit: `feat(S14): SMART enforcement A+B (app middleware + HAPI config)`.

**Verify:** 401/200 curl evidence captured in `verification-s14.md`.

---

## Phase E — Post-merge verification

- [ ] E1. `npm run eval` regenerated report shows: SDOH rate off 100% (target 70-90%); SDOH TP/FP/TN/FN visible; per-agent confidence-bucketed tables non-zero; "Status" disclosure reads "X of 16 clinician-validated (Y%), M of 16 dev-labeled (N%)."
- [ ] E2. Write `verification-s14.md` per `verification-s13.md` template (outcome, evidence, TDD, live re-eval, definition-of-done, open follow-ups).
- [ ] E3. Write `review-s14.md` per `review-s13.md` two-axis pattern.

---

## Rollback / safety

| Commit | Revert | Reverts |
|---|---|---|
| 1 (SDOH) | `git revert <sha>` | Drops 5 new AHC-HRSN Observations (re-import); labels.json returns to 1/16-positive. |
| 2 (review:apply) | `git revert <sha>` | Removes script + tests + npm script. `review:render` still works. |
| 3 (confidence) | `git revert <sha>` | Removes scorer + schema + integration. Eval governance buckets return to zero. |
| 4 (SMART A+B) | `git revert <sha>` | Removes middleware + HAPI config. Pre-S14 gap returns. |

**Whole-PR revert:** `git revert <merge-sha>...<tip-sha>` reproduces pre-S14 state.

---

## Definition of done

D1–D9 from `implementation-plan-s14.md` §"Definition of done (S14)". Headline: PR merged, eval report shows the 4 improvements, verification-s14.md + review-s14.md ship.

---

## Open follow-ups (deferred — NOT in this slice)

1. **Risk agent v2 rubric + LLM-variance root cause** — owned by S15. Per `verification-s13.md §6`.
2. **Production SMART handoff** — point HAPI at a real SMART auth server. Noted in `verification-s14.md`.
3. **Model-version pin for the LLM API** — owned by S15 (cross-cutting).
4. **In-app clinician review queue** — deferred indefinitely.