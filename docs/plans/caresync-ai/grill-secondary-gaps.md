# Grill — S14 Secondary Gaps (5 evaluation gaps, 2 slices)

> **PLAN_ID:** `caresync-ai` · **Date:** 2026-07-08
> **Trigger:** the 5 "secondary gaps" listed in `HL7-Challenge-Evaluation.md` and re-surfaced in `docs/eval-report.md` (the "Status" header + the "## Per-agent metrics" section) that the S13 risk-calibration slice did not address.
> **Status of this doc:** shared-understanding artifact — the next ADLC step is `to-prd`, which reads this file and `design-risk-calibration.md` to draft `prd.md` (or `prd-s14.md` + `prd-s15.md`).

---

## 0. The 5 gaps (verbatim from the evaluator)

1. Risk PPV 33.3% — 4 false positives from LLM clinical priors vs. seed-heuristic labels; the rubric fix attempt made it worse, seed fix only addresses 1 FN.
2. SDOH class imbalance — 1 positive / 15 negatives; 100% agreement is trivially gameable.
3. No clinician validation — all labels dev-labeled; clinicianOverride slots unfilled.
4. Confidence not emitted — agents don't produce per-finding confidence; governance buckets show zero (honestly).
5. SMART not enforced by HAPI — token minted/attached but HAPI doesn't validate it.

---

## 1. Slice structure (Q1, Q2)

| Slice | Gaps | Posture |
|---|---|---|
| **S14** | #2, #3, #4, #5 (all four "medium") | One PR, 4 atomic commits, single eval re-run + verification matrix |
| **S15** | #1 (the complex one) | Separate slice — owns the v2 risk rubric + LLM-variance investigation tracked in `verification-s13.md §6` |

**Rationale for splitting S14 vs S15.** S13 already taught us that bundling an LLM-side investigation with surgical fixes makes the audit trail unreadable: when the rubric reversion happened, every change in the S13 PR was implicated. Gap #1 has the same shape (LLM variance + heuristic design), so it gets its own slice where a fresh `design-risk-calibration-v2.md` and a dedicated `verification-s15.md` can isolate what was tried and why. The other four gaps are "wire something that exists to a real output" — confidence emitted, SMART validated, clinician override applied, SDOH labels rebalanced. They're independent enough to land as 4 commits in one PR without one regression shadowing another.

---

## 2. #2 SDOH imbalance (Q3, Q4a, Q4b)

**Decision: enrich existing patients with new AHC-HRSN screenings (option A from Q3).** Re-import FHIR via `npm run import`; update `data/eval/labels.json` `sdoh.expectedHasBarrier` for the touched rows; leave `source: "dev"` (the disclosure stays accurate — these are still dev-labeled, just on richer FHIR evidence).

**Q4a — new positive screenings (3 picks, 1/16 → 4/16):**

| Patient | Why this patient | SDOH domain positive | Rationale |
|---|---|---|---|
| `james-okafor` | COPD + recent inpatient discharge; plausible post-discharge transportation + medication-cost barriers | transportation, financial | Curated-physical axis; recent admission is the strongest real-world predictor |
| `angela-diaz` | HTN + depression with zero Observations; mental-health-access support likely absent | mental-health, social-isolation | Curated-mental-health axis; gap in observation coverage is itself a barrier signal |
| `pop-0010` | Procedural depression + no Observations; demographics consistent with low income + limited English | social-isolation, financial | Procedural axis; completes the panel coverage |

**Q4b — explicit-negative screenings (2 picks, 0/16 → 2/16):**

| Patient | Why this patient | Rationale |
|---|---|---|
| `robert-kim` | Acute hip fracture, otherwise stable demographic (insured, stable housing per procedural profile) | A patient screened, no barriers — distinguishes "TN" from "agent correctly abstained" |
| `pop-0005` | HTN + depression but stable housing + insurance (per procedural generator) | Same as robert-kim — explicit negative for the same reason |

**Final SDOH distribution: 4/16 positive (25%), 2/16 explicit-negative (13%), 10/16 absence-of-screening (62%).** The 100%-agreement game is broken: the SDOH agent now has to actually detect positives in the bundle (4 to find), correctly abstain on the explicit-negatives (2 to not over-call), and not over-call on the absence-of-screening rows (10).

**Source field.** Stays `"dev"` for all rows; the new rows' `notes` field will read e.g. *"Added 2026-07-08 to address SDOH imbalance — AHC-HRSN screening positive for transportation/financial barriers (dev interpretation of seeded data, not clinician-validated)."* The `_meta.clinicianStatus` disclosure covers it.

---

## 3. #3 Clinician validation apply half (Q5)

**Decision: ship a `review:apply` script (Option A from Q5).** `npm run review:apply` reads `labels.clinician-review.json` (the file the `review:render` HTML form downloads), validates it, and applies it to `data/eval/labels.json`:

- For each patient row in the review file: if the row's `*Dim.choice === 'override'`, update the corresponding `expectedHasGap / expectedHighRisk / expectedHasBarrier` in `labels.json` to the override value; if `choice === 'endorse'`, leave the label as-is; if `choice === 'abstain'`, leave as-is and record the abstention.
- For every row touched (any dim with a non-`endorse` choice or any non-empty notes), set `source: "clinician"` and populate the existing `clinicianOverride` slot with `{ reviewer, reviewedAt, dims: { careGap, risk, sdoh } }`.
- Untouched rows pass through unchanged.
- Print a CHANGELOG-style summary: "N rows updated by reviewer X, M rows endorsed, K rows abstained."

**What this does NOT do (intentionally):**
- Does not add an in-app review queue (deferred indefinitely; the `review:render` HTML is sufficient for POC).
- Does not introduce a separate `labels.clinician.json` "blessed" file (would create a "which file wins" complexity for a POC).

**Downstream effect on the eval.** `eval.ts` already reports the "DEV-LABELED BASELINE" status from `_meta.clinicianStatus`. After this slice, the same disclosure can read: *"X of 16 labels are clinician-validated (Y%), M of 16 are dev-labeled (N%)."* The single number makes the S14 disclosure genuinely better than today's blanket "all dev."

---

## 4. #4 Confidence emission (Q6)

**Decision: per-agent heuristic from bundle evidence (Option B from Q6).** No model self-report. The score is deterministic and auditable; the model can't bias it.

**Architecture.** A new `apps/api/src/agents/confidenceScorer.ts` exposes one function per agent output type, each tuned to the evidence the agent's dimension actually weighs:

- `scoreRiskFlag(flag, bundle)` — Risk flag confidence: 0.3 baseline + 0.2×citationCount + 0.2×hasAbnormalLab + 0.2×recentEncounter, capped at 0.9.
- `scoreCareGap(gap, bundle)` — Care Gap confidence: 0.9 if `Condition` is in the bundle AND the matching `Observation` is absent (the gap is real and explicit); 0.4 if only one signal present; 0.2 if neither (the agent inferred from absence-of-other-evidence).
- `scoreSdohBarrier(barrier, bundle)` — SDOH confidence: 0.9 if the cited resource is an AHC-HRSN Observation with a positive screening code; 0.4 if the citation is a Patient/condition observation; 0.2 if no real citation.

Action Planner task confidence is **derived** (not scored) — `task.confidence = min(contributingFindings.map(f => f.confidence))`. The synthesis step should not invent confidence the upstream findings don't support.

**Schema change.** All four `*Output` types in `apps/api/src/agents/agent.ts` get per-finding `confidence: number` (0-1) added:
- `RiskOutput.flags[i].confidence`
- `CareGapOutput.gaps[i].confidence`
- `SdohOutput.barriers[i].confidence`
- `ActionPlannerOutput.tasks[i].confidence` (derived)

**Citation validator integration.** The existing `citationValidator.ts` runs after the agent; the new scorer runs alongside it (or as a step within it) and writes the `confidence` field into the validated output. No new HTTP surface; the existing agent pipeline gets richer.

**TDD.** Three new scorer unit tests (one per agent) pinned to specific bundles — the deterministic scores are the regression guard for any future bundle-evidence schema change.

---

## 5. #5 SMART enforcement (Q7, Q8)

**Decision: A+B (app middleware + lightweight HAPI config).** Per Q8, the user's question "if we choose A, does it solve the issue suggested by rubric?" surfaced that A alone is a partial fix — it makes the *app* validate, but HAPI itself still accepts unauthenticated calls. The HL7 evaluator with curl + `localhost:8080` could demonstrate the gap in 30 seconds. B is the real fix and is now ~3-4 env vars in `docker-compose.yml`, no separate auth server needed.

**B — HAPI-side (the real fix).** Add to `docker-compose.yml`'s `hapi-fhir.environment`:
```
hapi.fhir.security.oauth.enable_jwt_validation: "true"
hapi.fhir.security.oauth.public_key_location: file:/keys/smart-public.pem
```
(Plus bind-mount the public-key counterpart of the private key in `apps/api/src/smart/keys.ts`. HAPI v7.2 supports this mode: any incoming Bearer is validated as a JWT signed by the public key, then the request is accepted.) HAPI returns `401 Unauthorized` for unauthenticated calls and `200` for valid-token calls. The `SmartTokenClient` already mints tokens with the matching private key, so all existing demo + test paths continue to work — they just become *enforced* paths.

**A — App-side (the developer guard).** New middleware in `apps/api/src/middleware/smartAuth.ts` that:
- Reads the `Authorization: Bearer <token>` header on routes that touch HAPI (`/api/analysis`, `/api/patients/:id`, etc.).
- Decodes the JWT, verifies the signature against the public key (same key HAPI trusts).
- Checks `exp` not expired, `aud` matches the configured HAPI audience, `scope` contains the required scopes (`patient/*.read` for GETs, `patient/*.write` for writes).
- Throws `401` with a clear error if any check fails.

This catches the developer bug of "I forgot to attach the token" at the API tier before the HAPI call is even attempted, and is the unit-test target for S14.

**Why not just B?** B alone would work for the FHIR boundary, but in dev/CI a developer could still call into the HAPI call site without going through the auth middleware. A is a defense-in-depth check at the API tier.

---

## 6. Verification matrix (Q9)

The S14 acceptance signal is the four-row matrix below, not "tests pass + eval re-runs." All four signals must be present in `verification-s14.md`.

| Fix | Verification signal | Pass condition |
|---|---|---|
| **#2 SDOH imbalance** | `npm run eval` re-run, SDOH agreement rate moves off 100% | Agreement rate in the 70-90% range; report narrates "1/16 → 4/16 positives, 0/16 → 2/16 explicit-negative, agreement X% with breakdown of TP/FP/TN/FN for the first time" |
| **#3 Clinician apply** | `review:apply` round-trip on a fixture `labels.clinician-review.json` | Unit test asserts `labels.json` `source: "clinician"` for touched rows, `clinicianOverride` slot populated, untouched rows pass through. Eval report shows "N clinician-validated rows" disclosure. |
| **#4 Confidence emission** | `npm run eval` re-run, governance buckets populate | Eval report's per-agent section adds confidence-bucketed accuracy table ("high ≥0.8: X% accurate, medium 0.5-0.8: Y% accurate, low <0.5: Z% accurate"). Buckets are non-zero. |
| **#5 SMART A+B** | Two curl tests against `localhost:8080` and `localhost:3001` | `curl -i http://localhost:8080/fhir/Patient/maria-chen` → `401 Unauthorized` (HAPI). `curl -i http://localhost:3001/api/patients/maria-chen` without auth → `401` (app). With a valid token, both return `200`. |

The verification artifact is `verification-s14.md` (same convention as S13b) and `docs/eval-report.md` regenerated by `npm run eval`. The CHANGELOG entry for S14 names all four signals as acceptance criteria.

---

## 7. Out of scope (explicit)

- **Risk agent v2 rubric (S15).** Tracked in `verification-s13.md §6`. Will get its own `design-risk-calibration-v2.md` + `prd-s15.md` + `verification-s15.md`.
- **LLM-variance root cause (S15).** The 2026-07-07 → 07-08 behavior shift is the open question. S15 owns the investigation and the model-version pin.
- **In-app clinician review queue.** Deferred indefinitely. The `review:render` HTML is sufficient POC UX.
- **Two-tier label system (Option B from Q5).** Not needed for POC.

---

## Next step (ADLC)

`to-prd` — produces `prd-s14.md` (covering #2, #3, #4, #5 with the 4-commit structure above) and starts the S15 design thread in parallel (deferred to its own grill). Inputs to `to-prd`: this file, `docs/eval-report.md`, `docs/plans/caresync-ai/design-risk-calibration.md`, and `docs/plans/caresync-ai/verification-s13.md §6`.
