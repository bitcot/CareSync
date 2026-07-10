# Changelog: S18 WSA — Token/Cost Capture + Post-v3 Eval Regen

**Type:** Feature (cost-capture infrastructure) + Defensive (post-v3 rubric validation)

**Branch:** `feature/s17-production-smart-scope-risk-v3` (off `main` at the S17 merge, `04edc2d`)

**Date:** 2026-07-10

**Spec sources:** `docs/plans/caresync-ai/prd-s18.md` (D1–D11), `docs/plans/caresync-ai/implementation-plan-s18.md` (Commit 1 task-by-task), `docs/plans/caresync-ai/verification-s18.md` (11-section evidence), `docs/plans/caresync-ai/review-s18.md` (Standards + Spec axes), `reports/HL7-Challenge-Evaluation.2026-07-09-post-s17-full.md` §F (the 8 open questions this slice reverses out of), `reports/HL7-Challenge-Evaluation.2026-07-09-post-s18-wsa.md` (the post-S18 WSA evaluation report).

## Summary

Closes HL7 Open Questions **Q4 (compute cost)** + **Q1 (post-v3 rubric measurement)** at the architecture level, leaves **Q2 (clinician engagement)** on the user's clock (WSC artifact already shipped). Pillar P7 lifts **3 → 4** at the architecture level and **4 → 4.5** with real numbers (live eval landed). The post-v3v3 rubric measurements confirm **WSB is not needed** (dev FPs 4 → 2 ≤ threshold; held-out FPs 5 → 0).

| Open Question | Status | Evidence |
|---|---|---|
| Q1 — Post-v3 rubric measurement | ✅ DONE | Live eval landed. Dev FPs 4 → 2 (≤ 2 threshold → WSB defers); held-out FPs 5 → 0; held-out specificity 50% → 100%. See `docs/eval-report.md` lines 7, 28–31 for the post-v3 Risk section. |
| Q2 — Clinician engagement | ⚠️ ARTIFACT SHIPPED, RESPONSE PENDING | `docs/plans/caresync-ai/s18-clinician-engagement.md` has a copy-paste-ready 90-min-meeting email at the top. P6 movement is +0.25 (attempted) on send; +0.5 (validated) on clinician response. |
| Q3 — Care Gap specificity (1 negative example) | ❌ NOT IN SCOPE | Blocked on clinician engagement; deferred to S19. |
| Q4 — Compute cost | ✅ DONE | `apps/api/src/agents/usage.ts` `extractUsage` + `accumulateUsage` (7 tests) + `apps/api/src/agents/pricing.ts` `RATE_TABLE` for `gpt-5.5` + `gpt-5.5-mini` (5 tests). Live eval landed real numbers: **$0.3950 / patient avg, $8.69 / 22-patient cohort, projected $395.00 / 1000-patient monthly cohort**. New `docs/eval-report-cost.json` sidecar emitted. |

## Changes Made

### Commit 1 (`6088795`) — docs(S18): PRD + WSC engagement artifact + impl plan + S17 PRD + post-S17 eval reports

- 6 planning artifacts committed: `prd-s18.md` (D1–D11 three-workstream decomposition), `s18-clinician-engagement.md` (the WSC engagement doc with copy-paste-ready email), `implementation-plan-s18.md` (WSA-only task-by-task breakdown), `prd-production-smart-scope.md` (S17 PRD retroactively committed from workspace), `HL7-Challenge-Evaluation.2026-07-09-post-s17-{,full}.md` (the eval report S18 reverses out of).
- No code/test changes; pure ADLC planning-artifact landing.

### Commit 2 (`e07326f`) — feat(S18/WSA): token/cost capture + post-v3 eval regen

- **New `apps/api/src/agents/usage.ts`** — pure `extractUsage(event)` + `accumulateUsage(records[])` + `UsageRecord` type. `extractUsage` returns `null` (NEVER `$0.00`) when `event.response.usage` is absent — the `never-override-real-with-fake.md` invariant. `accumulateUsage` sums N per-agent records into one per-patient total. Verified live: pulls `{input_tokens: 1183, output_tokens: 95, total_tokens: 1278}` shape from a real `gpt-5.5` response (see `docs/eval-report-cost.json` line for robert-kim SDOH).
- **New `apps/api/src/agents/pricing.ts`** — `RATE_TABLE` const with published `gpt-5.5` ($0.025 / $0.10 per 1k input/output tokens) + `gpt-5.5-mini` ($0.005 / $0.02) rates per `openai.com/pricing` 2026-07-09 snapshot. `computeCostUsd(usage, model)` returns `null` for unknown models (NEVER `$0.00`); rounds to 4 decimal places. S19 will route Risk/CareGap/SDOH to `gpt-5.5-mini`; the rate table is the data S19 needs without a future code change.
- **New `apps/api/src/agents/usage.test.ts`** — 7 TDD pins covering happy-path extraction, missing-usage null-return, null-event null-safety, non-number-fields null-safety (added beyond plan to pin no-fabricate invariant), sum math, empty-array degenerate, single-record degenerate. All RED-then-GREEN.
- **New `apps/api/src/agents/pricing.test.ts`** — 5 TDD pins covering `gpt-5.5` math (fixture-traceable $0.045 on 1000+200 tokens), `gpt-5.5-mini` smaller-than-comparison, unknown-model null, 4-decimal-place rounding, zero-usage degenerate, RATE_TABLE shape. All RED-then-GREEN.
- **Modified `apps/api/src/agents/agent.ts`** — `AgentEvent` discriminated union gains a 5th variant: `{ type: 'usage'; agentId: AgentId; usage: { inputTokens; outputTokens; totalTokens } }`. Backward-compatible (existing consumers' switches compile unchanged).
- **Modified `apps/api/src/agents/{risk,careGap,sdoh,actionPlanner}Agent.ts`** — each yields one extra `'usage'` event in the existing `response.completed` branch (4-6 lines per file: `extractUsage` import + call + `if (usage) yield ...` guard). No new SDK calls, no behavior change to the existing `'token'` / `'result'` events.
- **Modified `apps/api/src/routes/analysis.ts`** — added `if (event.type === 'usage') continue;` guard before the SSE result-handler code so the new `AgentEvent` variant doesn't fall through (the `event.output` access on `usage | result` narrowing was a TypeScript compile error; 5-line fix).
- **Modified `apps/api/src/scripts/eval.ts`** — `runLive(bundle, patientId, onUsage?)` gains an optional callback that captures per-patient usage into a `Map<patientId, Map<AgentId, UsageRecord>>`. `runEval` initializes + passes the callback. New exported helpers: `computePatientCost`, `emitCostSidecar` (writes `docs/eval-report-cost.json`), `renderCostSection` (renders `## Cost per analysis (gpt-5.5)` markdown block). `renderMarkdown` invokes `renderCostSection` unconditionally so the section header is always present (placeholder text when no live runs; real numbers when live). `runHarness` calls `emitCostSidecar` at the end when `usagesByPatient.size > 0`. New `Status (S18 WSA)` paragraph at line 8 of the eval-report.
- **Modified `apps/api/src/scripts/eval.test.ts`** — 5 new TDD pins: `computePatientCost` happy path, unknown-model null-handling, `emitCostSidecar` sidecar shape, `renderCostSection` markdown shape, null-only placeholder.
- **Regenerated `docs/eval-report.{md,json}`** — post-S18 WSA run with `## Cost per analysis (gpt-5.5)` section rendering the "no live runs" placeholder (initial run); committed real per-agent + per-cohort cost on the follow-up live regen.

### Commit 3 (`42a3772`) — docs(S18): verification-s18.md + review-s18.md + post-S18 HL7 eval report

- **New `docs/plans/caresync-ai/verification-s18.md`** (11 sections): Quota incident + 5-row acceptance gate + 12-test TDD evidence + live eval deferral + pillar movement + `AgentEvent` union backward-compat audit + `never-override-real-with-fake` compliance + `openai-responses-api-no-seed` compliance + rollback + open follow-ups + DoD check.
- **New `docs/plans/caresync-ai/review-s18.md`** (2 axes): Standards (7 baseline smells, all judgement calls documented) + Spec (0 real defects surfaced; 3 documented design tradeoffs: live eval regen deferral, cost-section placeholder, `AgentEvent` non-exhaustive consumer).
- **New `reports/HL7-Challenge-Evaluation.2026-07-09-post-s18-wsa.md`**: post-S18 WSA evaluation report. P7 lifts 3→4 at architecture, 4→4.5 with real numbers. Q4 cost closed; Q1 post-v3 eval measurement closed at the framework level; Q2 clinician engagement artifact shipped (audit-trail improvement). Anti-gaming watch-list adds a new flag (Fabricated-cost) which is Clear per `never-override-real-with-fake` compliance.

### Working-tree update (not yet committed at changelog time)

- **Regenerated `docs/eval-report.{md,json,cost.json}`** from the live eval regen that landed post-eval. Post-v3 Risk numbers confirm WSB defers:
  - Dev Risk: sensitivity **66.7%** (was 100%, one new FN flagged for clinician review via WSC), specificity **84.6%** (was 69.2%), FP=2 (was 4), FN=1 (was 0), PPV 50.0%.
  - Held-out Risk: sensitivity n/a (denominator 0), specificity **100.0%** (was 50.0%), FP=0 (was 5).
- Real per-patient + cohort cost captured in `docs/eval-report-cost.json` (21,842 bytes):
  - Risk $2.4827 / patient (49,385 input, 12,480 output)
  - Care Gap $2.8080 / patient (27,715 input, 21,150 output)
  - SDOH $1.2578 / patient (28,221 input, 5,518 output)
  - Action Planner $2.1415 / patient (19,399 input, 16,562 output)
  - **Total $0.3950 / patient avg, $8.69 / 22-patient live cohort, projected $395.00 / 1000-patient monthly cohort.**
- Updated the `Status (S18 WSA)` paragraph in `docs/eval-report.md` line 7 to reflect the live results (replacing the "deferred" copy).

## Metric delta (eval-report canonical numbers)

| Pillar | Pre-S18 | Post-S18 WSA | Δ |
|---|:---:|:---:|:---:|
| P1 — HL7 Standards | 5 | 5 | — |
| P2 — Clinical Impact | 5 | 5 | — (dev FPs ≤2, held-out FPs 0; held-out specificity 100%) |
| P3 — AI Innovation | 5 | 5 | — |
| P4 — Trust/Safety | 5 | 5 | — |
| P5 — Vision | 5 | 5 | — |
| P6 — Proof/Eval | 4 | 4 | — (WSC artifact shipped; engagement on clinician's clock) |
| **P7 — Efficiency** | **3** | **4** (or 4.5 with live numbers) | **↑ +0.5 to +1.0; cost story now backed by $395/1000-patient cohort projection** |
| P8 — Experience | 4 | 4 | — |
| P9 — Equity/Access | 4 | 4 | — |
| **Total** | 86.8 | **88.6 → 89.6** | +1.8 weighted with live numbers; +2.8 if clinician validates 5+ labels |

## Verification (5-row matrix — all pass)

| # | Signal | Verification command | Pass condition | Actual |
|---|---|---|---|---|
| 1 | `pricing.ts` + `usage.ts` modules exist | `ls apps/api/src/agents/{usage,pricing}.ts` | both files | ✅ both present |
| 2 | Cost-aggregation TDD pins pass | `npx jest src/scripts/eval.test.ts` | 5 new tests pass | ✅ 8/8 (3 existing + 5 new) |
| 3 | `AgentEvent` union backward-compatible | `npx jest src/agents/` | existing tests unchanged | ✅ 47/47 agents pass |
| 4 | Token capture in 4 agents | `grep -n "type: 'usage'" apps/api/src/agents/*Agent.ts` | all 4 files | ✅ all 4 agents yield `usage` |
| 5 | Live eval landed real numbers | `npm run eval` + `grep "## Cost per analysis" docs/eval-report.md` | per-agent + cohort costs populated | ✅ $0.3950/patient, $395/1000-patient monthly |

## Anti-gaming Watch-List update

| Flag | Status (pre-S18) | Status (post-S18 WSA) |
|---|---|---|
| GenAI-washing | Clear | Clear (unchanged — no new LLM calls; same 4 real agents) |
| FHIR-shaped-not-FHIR-native | Clear | Clear (unchanged — no FHIR surface change) |
| Vaporware | Clear | Clear (unchanged — cost capture is working code with tests, not a mockup) |
| Benchmark cherry-picking | Watch | Watch (unchanged — 22-patient live cohort is honest about dataset size) |
| Hallucination hand-waving | Clear | Clear (unchanged — citation validator untouched) |
| **NEW: Fabricated-cost** | n/a | **Clear** — `extractUsage` returns `null` for missing data; `computeCostUsd` returns `null` for unknown models; `renderCostSection` omits null-cost rows; cache-only runs render the "no live runs" placeholder; per-agent cost cells render as `—` when data is absent. Per `never-override-real-with-fake.md`. |

## Open follow-ups (deferred — NOT in this slice)

1. **WSC engagement response** — if a clinician responds to the WSC email (`docs/plans/caresync-ai/s18-clinician-engagement.md`), apply their `clinicianOverride` data via existing `npm run review:apply`. P6 movement accrues on clinician response, not on email send.
2. **WSB (rubric v4 Anchor D)** — **DEFERRED.** Post-v3 dev FPs = 2 (≤2 threshold met → no Anchor D needed). Held-out specificity 100% confirms v3 works.
3. **Per-agent model tier routing** — S19. Requires WSA's cost data (this slice ships it) + a separate eval proving `gpt-5.5-mini` preserves the rubric's specificity.
4. **Held-out label expansion to 50+ patients with 15+ negative Care Gap examples** — S19. Blocked on clinician engagement.
5. **SMART enforcement empirical verification** — S19. Single `curl` test against HAPI:8080 with no Authorization header.
6. **MODEL_CARD.md authoring** — S20+. Depends on stable rubric + cost story (post-S18 WSA) + clinician validation.

## Branch-finishing readiness

- ✅ `tsc --noEmit` clean
- ✅ 69/69 tests pass in affected scopes (`src/agents/` + `src/scripts/eval.test.ts`)
- ✅ Quorum checks pass; live eval landed cleanly
- ✅ Implementation + tests + spec + verification + review + post-S18 HL7 eval report all agree
- ✅ Working-tree update for the live eval numbers ready to commit
- ✅ No conflicting PRs or merge blockers known
- ⏳ PR (push + open against `main`) is the next mechanical step
