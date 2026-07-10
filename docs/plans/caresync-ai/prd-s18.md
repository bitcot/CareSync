# PRD — S18: Cost Profiling, Risk Calibration v4 (Conditional), Clinician Engagement

> **Status:** Draft · 2026-07-09
> **PLAN_ID:** `caresync-ai` · **Slice:** S18 · **Status:** Ready for `writing-plans` (ADLC: specify → plan)
> **Author:** Manjula / Bitcot · 2026-07-09
> **Upstream artifacts:**
> - `reports/HL7-Challenge-Evaluation.2026-07-09-post-s17-full.md` §F (8 open questions), §E (P6 = biggest gap, P7 = lowest pillar)
> - `docs/eval-report.md` (current eval — line 8 shows **post-S16 v2** numbers, NOT post-S17 v3 — see `rubric-eval-result.md §"Recovery steps deferred to post-merge"`)
> - `docs/plans/caresync-ai/prd-s16.md` (v2 rubric PRD — the prior calibration artifact)
> - `docs/plans/caresync-ai/prd-production-smart-scope.md` (S17 — v3 rubric + deterministic `clampRiskLevel` shipped)
> - `docs/plans/caresync-ai/rubric-eval-result.md` §"Quota-exhaustion incident" + §"Specificity lift on the four FP patients" (the 4 v2 FPs all 2-anchor-without-labs)
> - `docs/plans/caresync-ai/review-s16.md` §"Documented design tradeoff — not a defect" #1 (the held-out sensitivity undefined gap)
> - `apps/api/src/agents/riskAgent.ts` (current v3 rubric at lines 67-201; `MODEL = 'gpt-5.5'` const at line 11)
> - `apps/api/src/agents/confidenceScorer.ts` (the S17 deterministic `clampRiskLevel` safety net — 330 lines)
> - `apps/api/src/scripts/eval.ts:461-466` (Status lines; the post-v3 eval was never re-run)
> - `apps/api/src/eval/varianceProbe.ts` (S16 commit 2 observability tool — 81.25% per-patient agreement)
> - `apps/api/src/eval/labelFromBundle.ts` (riskScoreFor ≥ 75 threshold)
> - `data/eval/clinician-outreach.json` (S15's outreach log mechanism — empty `invitations[]`)
> - `data/eval/labels.json` (26 labeled patients; 16 dev-labeled + 10 held-out; held-out has 0 positive Risk labels per `riskScoreFor ≥ 75`)
>
> **Tracker note:** This POC is Jira-free and file-backed (per `CLAUDE.md`). No issue-tracker publish and no triage labels applied — this file is the artifact. The slice name `S18` continues the existing `S#` convention used by S1–S17. Slice numbering, NOT version numbering: the Risk rubric's prompt history remains **v0 (post-S13b revert) → v2 (S16) → v3 (S17) → v4 (S18 WSB, conditional)**. S18 introduces **WSB** as the Workstream B naming convention because three workstreams share the slice.
>
> **Memory anchors:** `never-override-real-with-fake.md` (no fabricated costs / no fabricated eval numbers), `openai-responses-api-no-seed.md` (the API constraint that disqualifies temperature+seed pinning — confirms S18 cannot rely on variance collapse).

---

## Problem Statement

The HL7 evaluation report (2026-07-09 §F) names 8 open questions. S18 closes **three** of them and makes partial progress on **two more**. The three primary ones, mapped to eval-report weaknesses:

1. **Open Question 4 (cost)** — *"Four LLM calls per patient (3 parallel + 1 sequential) at the gpt-5.5 tier. What is the estimated cost per patient analysis?"* → **S18 WSA**. Pillar P7 sits at **3/5**, the lowest in the score-card (5% weight × 0.40 gap = +1.0 weighted ceiling). The cost story is missing entirely. No `pricing.ts`, no token-capture, no per-patient cost line in `docs/eval-report.md`.

2. **Open Question 1 (calibration follow-up)** — *"v3 rubric + `clampRiskLevel` reduced dev-labeled FPs from 9→4, but held-out specificity is still 50% (5 FPs, all 2-anchor-without-labs cases). Is there a plan for a v4 rubric or a more aggressive clamp?"* → **S18 WSB (conditional)**. The eval report's current `docs/eval-report.md:8` shows **post-S16 v2 numbers** (69.2% / 50%), not post-S17 v3 — the regeneration was deferred after the `quota-exhaustion incident` (`rubric-eval-result.md`). **Whether v3 actually fixed the FP pattern is currently unknown.** WSB is conditional on WSA's measurement.

3. **Open Question 2 (clinician validation)** — *"`clinicianOverride` slot exists on all 26 label rows but 0 have been validated. Has any clinician been engaged?"* → **S18 WSC**. Pillar P6 sits at **4/5** (8% weight × 0.20 gap = +1.6 weighted ceiling). The engagement log (`data/eval/clinician-outreach.json`) has an empty `invitations[]` array — the *mechanism* exists from S15, the *initiation* does not.

Two additional questions get partial progress:

4. **Open Question 3 (Care Gap specificity)** — *"Specificity is 0% on dev-labeled (1 negative example — maria-chen). Are there plans to seed more negative examples?"* → **NOT in S18 scope** (blocked on clinician engagement; the 15+ negative examples require a clinician's "no gap expected" judgment, not a procedural-generator tweak). S18's PRD explicitly defers this to **S19** (clinician-track expansion).

5. **Open Question 5 (SMART enforcement)** — *"Has HAPI's JWT validation been empirically verified?"* → **NOT in S18 scope**. The docker-compose env-vars (`hapi.fhir.security.oauth.enable_jwt_validation: "true"`) are configured but unverified. This is a single `curl` test against HAPI:8080. Defer to **S19** as part of the eval-expansion slice.

The three S18 actions (cost profile + clinician outreach + conditional v4) are the "What to start today" recommendations from the prior planning turn — they are the highest-EV unsexy work the rubric still requires. S18 does **not** ship the S18-lite Safety Officer / 6th agent node / Black Box replay features from the prior turn; those are explicitly deferred to a later slice because they are demo-positioning, not rubric-movers.

From a **clinical evaluator's** perspective: the eval-report currently shows whether the rubric *moved* (it did — 9→4 dev FPs) but not whether the rubric *currently works* (post-v3 is unknown). Clinicians reading the eval can't tell whether the 4 remaining FPs are real over-calls or rubric drift. S18 WSA closes that information gap by re-running the eval against the shipped v3 rubric.

From a **hospital CIO's** perspective: *"Show me the cost."* P7 at 3/5 is the only place where the submission says "we don't know what this costs at scale." Pillar P7 at 3/5 means even at perfect scores elsewhere (89.2 + 1.0 + 1.6 + 0.4 + 0.4 + 0.4 = 93.8 theoretical max), the floor is pinned by missing economics. Cost profiling is the lever that lifts the floor.

From a **submission reviewer / judge**'s perspective: P6 at 4/5 with 0 clinician-validated labels is the risk-surface flagged in §E ("Biggest risk/gap"). The label row carries the `clinicianOverride` slot; the slot is empty. Even an attempted engagement that returned 0 labels is better than no engagement — the audit-trail improvement moves P6 from "0/0 attempted" to "≥1/26 attempted" which is a defensible first step.

---

## Solution

S18 is **three workstreams in one slice**, sequenced so they don't block each other:

| Workstream | Outcome | Commit | Blocks? |
|---|---|---|---|
| **WSA** — Post-v3 eval regen + token/cost capture | `docs/eval-report.md` shows real v3 numbers + a "Cost per analysis" section. `pricing.ts` + `usage.ts` modules shipped. Eval pipeline emits `docs/eval-report-cost.json`. | Commit 1 | None |
| **WSB** — Risk rubric v4 (conditional) | If post-v3 eval shows dev FPs ≥4 OR held-out FPs ≥5: rewrite `buildPrompt` with an **Anchor D: missing-data-state** rule + worked examples. If post-v3 eval shows the rubric works: **DEFERRED**. | Commit 2 (conditional) | Blocked on WSA |
| **WSC** — Clinician engagement draft | New artifact `docs/plans/caresync-ai/s18-clinician-engagement.md` (outreach email template + 90-minute meeting agenda + outreach-log update protocol). No code. No test. | Commit 3 | None |

WSA and WSC run in parallel; WSB is gated on WSA's result so the v4 design is informed by the actual post-v3 numbers (per `never-override-real-with-fake.md` — no v4 design without measurement). The three commits land as **one PR** with WSB possibly absent (squash-merged or omitted per WSA result).

### Score-card delta (predicted)

| Pillar | Pre-S18 | Post-S18 (WSB deferred — v3 works) | Post-S18 (WSB lands — v3 failed) |
|---|:---:|:---:|:---:|
| P2 (Clinical Impact) | 5 | 5 | 5 |
| P6 (Eval) — by +0.5 if clinician responds within window, +0.25 if just attempted | 4 | **4.25** | 4.25 |
| P7 (Efficiency) — by cost profile landed | 3 | **4** | 4 |
| P9 (Equity) — none | 4 | 4 | 4 |
| **Total** | **86.8** | **~89.4** | **~89.4** |

If a clinician validates even 5 labels within the engagement window: P6 moves to 4.5 → total **~89.8**. If 15+ labels validated: P6 moves to 5 → total **~90.6**. The 90+ threshold is reachable **only** with clinician engagement landing; S18 WSC is the highest-leverage single deliverable in the slice by score-card math.

### Why not S18-lite (Safety Officer / 6th agent node)

The prior planning turn proposed a 6th agent node as a demo-positioning play. S18 explicitly **does not** include it. Rationale (carried over from the prior planning turn, restated for traceability): the Safety Officer pattern requires (a) a 5th LLM call (worsens P7), (b) architectural surface in `analysisGraph.ts` + `agentGraphGeometry.ts`, and (c) a narrative commitment the demo must lean into. None of these move the rubric. They are deferred to a post-evaluation slice once the rubric is closer to 90+.

---

## User Stories

### WSA — Post-v3 eval regen + token/cost capture

1. As an **eval operator**, when I run `npm run eval` after quota refresh, the regenerated `docs/eval-report.md` line 8 shows the **actual** post-S17 v3 Risk numbers (replacing the currently-committed post-S16 v2 numbers), so I can verify whether S17's v3 rubric + `clampRiskLevel` reduced the 4 dev-labeled FPs and 5 held-out FPs to the target ≤1 dev / ≤3 held-out.
2. As a **submission reviewer**, when I open `docs/eval-report.md`, I see a new `## Cost per analysis` section with: per-agent input/output token counts (4 agents × 26 patients), cost per agent (using published `gpt-5.5` rates), total cost per patient analysis (~$X.XX), and a comparable table for `gpt-5.5-mini` (the cheaper tier the rubric-preservation eval in S19 will test).
3. As a **developer**, the eval pipeline emits a stable cost-capture schema (`docs/eval-report-cost.json`) with `{ patients: [{ patientId, agents: [{ agentId, inputTokens, outputTokens, costUsd }], totalCostUsd }] }`, so a future slice can diff cost between model tiers without re-engineering the capture.
4. As a **release engineer**, the cost capture TDD pins include 1 test that `extractUsage()` handles a stub `response.completed` event with `.usage`, and 1 test that it returns `null` when `.usage` is absent — so the streaming-consumer code change is regression-safe.
5. As a **hospital CIO** reading the eval report, I see a single sentence: *"At $X per 26-patient cohort, $Y per 1000-patient monthly cohort — well within care-management operating budgets."* So the economic story is one paragraph in the report, not a chapter.

### WSB — Risk rubric v4 (conditional)

6. As a **clinical evaluator**, IF the post-v3 eval (WSA) shows the same 4 dev-labeled FPs and 5 held-out FPs as v2, I want the rubric to add an **Anchor D: missing-data-state** rule that explicitly disallows assuming labs are normal when they're absent from the retrieved bundle, so 2-anchor-without-labs patients map to a clear "moderate (data-limited)" sublevel rather than the model's clinical-prior "high."
7. As a **clinical evaluator**, the new rule is paired with **1-2 worked examples** using the actual 4 dev-labeled FPs (james-okafor, linda-torres, pop-0004, pop-0005) as the reference patients, so the rubric's examples match the eval-cohort bundle shapes.
8. As an **eval operator**, the v4 rubric's 2x2 gate is: dev-labeled specificity ≥85% (target: lift from current 69.2% post-v3 → 85% post-v4) AND held-out specificity ≥70% (target: lift from 50% post-v3 → 70% post-v4), without regressing dev-labeled sensitivity below 100%.
9. As a **release engineer**, if v4 overshoots (e.g., dev-specificity ≥85% but held-out stays low), the slice ships commit 2 only and **does not** add a v3-commit-fixup — the reversion path is `git revert`, same as S16 commit 3.
10. As a **reviewer**, if WSA shows the v3 rubric already works (dev FPs ≤2, held-out FPs ≤3), WSB does not land at all — the slice closes with WSA + WSC only. No `designed-v4-but-skipped` artifact in the working tree.

### WSC — Clinician engagement

11. As a **project lead**, I have a drafted outreach email template (3 paragraphs: who we are, what we're building, ask for 90-minute review) that I can copy-paste and send to one clinician this week. The cost of drafting is ≤1 hour; the cost of waiting for a clinician to volunteer is unbounded.
12. As a **clinician invited to review**, the 90-minute meeting agenda has 5 phases (10-min walkthrough + 20-min Risk rubric + 20-min Care Gap rubric + 20-min SDOH rubric + 20-min labeled-set review) so the engagement is time-bounded and outcome-tractable.
13. As a **release engineer**, the outreach-log update protocol documents exactly which fields to write to `data/eval/clinician-outreach.json`'s `invitations[]` array when a clinician responds (sent / responded / declined / validated), so the S15 audit-trail mechanism stays intact.
14. As a **release engineer**, no code or test accompanies WSC — the deliverable is a single markdown doc (`docs/plans/caresync-ai/s18-clinician-engagement.md`). The slice is mergeable even with no clinician response.

### Cross-cutting

15. As a **release engineer**, the three commits are independently revertable: WSA revert removes the cost-capture modules (`pricing.ts`, `usage.ts`, the eval-pipeline cost section); WSB revert restores the v3 rubric body; WSC revert removes the engagement doc.
16. As a **release engineer**, if OpenAI quota remains exhausted when WSA is attempted, **WSA does not block merge** — WSC + the conditional plan for WSB ship as the slice; the eval regen becomes a `Recovery steps deferred to post-merge` item (same pattern as the S16 quota incident).

---

## Implementation Decisions

### D1. Slice structure
S18 is three commits in one PR:
1. `docs(S18): grill-notes + PRD` (optional — S18's PRD can ship with WSA in commit 1 if grill-notes are not generated separately)
2. `feat(S18/WSA): token/cost capture + post-v3 eval regen` — token capture in `apps/api/src/agents/{risk,careGap,sdoh,actionPlanner}Agent.ts`, new `apps/api/src/agents/usage.ts`, new `apps/api/src/agents/pricing.ts`, eval-pipeline cost aggregation, regenerated `docs/eval-report.{md,json,cost.json}`
3. `feat(S18/WSC): clinician engagement artifact` — `docs/plans/caresync-ai/s18-clinician-engagement.md`
4. (Conditional) `feat(S18/WSB): risk rubric v4 — Anchor D: missing-data-state` — `apps/api/src/agents/riskAgent.ts`'s `buildPrompt` body, `riskAgent.test.ts` TDD pins, regenerated `docs/eval-report.{md,json,cost.json}`

Rationale:
- WSA first so its data drives WSB's design (per `never-override-real-with-fake.md`).
- WSC third because it has no code dependencies and parallel-develops naturally.
- WSB conditional because the v3 eval result tells us whether it's needed.

### D2. Token capture surface (WSA commit 2)
- The OpenAI Responses API returns `response.usage` on the `response.completed` event with `{ input_tokens, output_tokens, total_tokens }` (verified by code reading at `apps/api/src/agents/riskAgent.ts:259` — the streaming consumer already pulls `event.response.output` off the completed event; same event carries `.usage`).
- New module `apps/api/src/agents/usage.ts`:
  - `extractUsage(completedEvent: unknown): { inputTokens: number; outputTokens: number; totalTokens: number } | null` — pure function; returns `null` if event has no `.usage` (e.g., streaming interruption).
  - `accumulateUsage(usages: UsageRecord[]): UsageAggregate` — sums per-patient, per-agent into a single record.
- Streaming consumer change in each `*Agent.ts`'s `for await` loop:
  ```ts
  } else if (event.type === 'response.completed') {
    toolCall = event.response.output.find((item: any) => item.type === 'function_call' && item.name === REPORT_TOOL_NAME);
    yield { type: 'usage', agentId: AGENT_ID, usage: extractUsage(event) ?? zeroUsage() };
  }
  ```
  The `extractUsage` call is **inside** the `response.completed` branch — same event already consumed for tool-call extraction.
- A new `AgentEvent` variant: `{ type: 'usage'; agentId: AgentId; usage: UsageRecord }`. The type union in `apps/api/src/agents/agent.ts:86-91` gains a 5th variant.
- The eval pipeline (`apps/api/src/scripts/eval.ts`) consumes `usage` events via `streamAnalysis()`'s existing handler set; aggregates them into `docs/eval-report-cost.json`.
- The S15 `getAnalysisStream` consumer (`apps/api/src/routes/analysis.ts`'s SSE relay) does **not** need to forward `usage` events to the frontend in this slice — cost is a backend artifact. A future slice can add the SSE event if the product wants a cost display.

### D3. Pricing module (WSA commit 2)
- New module `apps/api/src/agents/pricing.ts`:
  - `RATE_TABLE` — `{ 'gpt-5.5': { inputPer1k: 0.025, outputPer1k: 0.10 }, 'gpt-5.5-mini': { inputPer1k: 0.005, outputPer1k: 0.02 } }` (placeholder rates; updated to published rates at merge time, sourced from OpenAI pricing page snapshot)
  - `computeCostUsd(usage: UsageRecord, model: string): number` — `(inputTokens/1000 * rate.input + outputTokens/1000 * rate.output)` rounded to 4 decimal places
- TDD pins:
  - 1 test that `computeCostUsd` for `gpt-5.5` with 1000 input + 200 output tokens returns `$0.04...` (fixture-traceable)
  - 1 test that an unknown model throws or returns `null` (decide in impl)
- Pricing sourced from `https://openai.com/pricing` snapshot at 2026-07-09; commented in `pricing.ts` with the source URL + date.

### D4. Eval pipeline cost aggregation (WSA commit 2)
- `apps/api/src/scripts/eval.ts` gains:
  - Aggregation map: `Map<patientId, { agents: Map<agentId, UsageRecord> }>`
  - On every `usage` event, accumulate by `(patientId, agentId)`.
  - On eval finish, emit `docs/eval-report-cost.json`:
    ```json
    {
      "model": "gpt-5.5",
      "generatedAt": "2026-07-09T...",
      "patients": [
        { "patientId": "james-okafor", "agents": [...], "totalInputTokens": 1240, "totalOutputTokens": 320, "totalCostUsd": 0.0631 }
      ],
      "aggregate": { "totalInputTokens": ..., "totalOutputTokens": ..., "totalCostUsd": 18.42, "costPerPatient": 0.71 }
    }
    ```
  - Render a `## Cost per analysis` section in `docs/eval-report.md` below the existing per-agent metrics:
    ```markdown
    ## Cost per analysis (gpt-5.5)
    
    - Risk: $X.XX / patient (avg input Y, output Z)
    - Care Gap: ...
    - SDOH: ...
    - Action Planner: ...
    - **Total: $X.XX / patient, $Y.YY / 26-patient cohort**
    - Projected at scale: $Z.ZZ / 1000-patient monthly cohort
    ```
- TDD pins in `eval.test.ts`:
  - 1 test that cost aggregation handles 4 agents × 26 patients correctly (fixture-based, not LLM-based)
  - 1 test that an eval without usage events (e.g., cached hits) reports `null`/omitted rather than fabricated zeros (per `never-override-real-with-fake`)

### D5. Risk rubric v4 design (WSB commit 4, conditional)
- **Gating:** WSB lands only if WSA's eval shows the v3 rubric did NOT reduce the FP pattern to ≤2 dev / ≤3 held-out. The PRD's "conditional" framing is binding.
- **Design premise:** the 4 v2 FPs (james-okafor, linda-torres, pop-0004, pop-0005) and 5 v2 held-out FPs all share the same bundle shape: 2 anchors met (Anchor A comorbidity + Anchor B recent discharge), 0 Anchor-C observations. The model escalates to 'high' despite Rule 2. The likely cause: the model interprets "no Observations" as "labs are normal → Anchor C is definitively negative" rather than "data is incomplete → Anchor C unknown."
- **v4 fix:** add **Anchor D: missing-data state** with two operational consequences:
  - **Rule 3:** "A patient with 0 Anchor-C observations in the retrieved bundle is in a *missing-data state* for Anchor C. Treat as 'Anchor C not met' AND explicitly note in the flags: 'Data-limited for labs — labs absent from retrieved bundle.' Do NOT assume normal labs when labs are absent."
  - **Examples 6 & 7:** the 2 of 4 dev-labeled FPs that are most illustrative (pop-0004 and linda-torres by canonical shape) — same as Example 5 but explicitly call out "Anchor D: data-limited → moderate, not high" in the reasoning chain.
- **2x2 gate (v4):** dev-labeled specificity ≥85% AND dev-labeled sensitivity ≥100%; held-out specificity ≥70% AND held-out sensitivity (whatever the v3 numerator/denominator yields — still likely `null`, but the PRD commits to reporting it honestly).
- **Revert path:** the v4 `buildPrompt` body is one block in `riskAgent.ts:100-200`; revert replaces it with the v3 body (last-good state); `riskAgent.test.ts`'s v4 examples tests are removed; v3 examples tests stay.
- **Out of v4 scope (deferred to S19):** asymmetric-penalty mechanism (#2 from prior planning turn), 3-anchor reasoning checkpoint (#3 from prior planning turn). If Anchor D doesn't lift specificity enough, the next iteration picks one of these — not both.

### D6. Clinician engagement artifact (WSC commit 3)
- New file: `docs/plans/caresync-ai/s18-clinician-engagement.md`
- Contents:
  - **§1 Outreach email template** — 3 paragraphs: (a) project context (CareSync AI, HL7 AI Challenge 2026 submission), (b) what we'd like reviewed (Risk / Care Gap / SDOH rubric structure on a 26-patient cohort), (c) ask (90 minutes, virtual, week-of-[DATE], honorarium [optional — to be added at send time])
  - **§2 Pre-meeting checklist** — confirm `npm run review:render` works against `data/eval/labels.json`; share `docs/eval-report.md` + rubric structure docs (`design-risk-calibration.md`, `design-risk-calibration-v2.md`) 24h in advance
  - **§3 90-minute meeting agenda** — 5 phases, time-boxed:
    - 0:00-0:10 — Walkthrough: live demo of the orchestrator analyzing one patient, narrated token stream
    - 0:10-0:30 — Risk rubric review: walk through the v3 anchors + Rule 1 + Rule 2 + 5 examples; ask for clinical judgment on the 4 v2 FPs (`james-okafor`, `linda-torres`, `pop-0004`, `pop-0005`)
    - 0:30-0:50 — Care Gap rubric review: walk through the current `careGapAgent.buildPrompt`; ask for input on what counts as a "monitoring gap" given HAPI observation coverage
    - 0:50-1:10 — SDOH rubric review: walk through the 5 dev-labeled AHC-HRSN screenings; ask for SDOH-domain scope judgment
    - 1:10-1:30 — Labeled-set review: open `data/eval/labels.json`, ask the clinician to override 5-15 labels via the existing `npm run review:apply` pipeline
  - **§4 Outreach-log update protocol** — when a clinician responds (positive, negative, no-response), update `data/eval/clinician-outreach.json`'s `invitations[]` with the S15 schema: `{ clinicianId, sentTs, respondedTs, validatedCount, declineReason? }`. The first-write adds an empty entry; subsequent writes append `respondedTs` and `validatedCount`.
  - **§5 Honesty section** — "If the clinician declines, no labels get validated. The score stays at 4/5 on P6. This is documented; the audit-trail improvement (engagement attempted) raises P6 to 4.25 per the predicted score-card."
- No code, no test. The deliverable is the doc. The merge gate is "doc exists and contains all 5 sections."

### D7. `docs/eval-report.md` line 8 update
- Current text: `Status (S16): v2 risk rubric shipped at riskAgent.buildPrompt — 3 calibration anchors + "0 anchors → low" hard rule + 3 worked examples ... Pillar P2 lifts 4→5, total HL7 evaluation moves 89.2 → 92.8.`
- WSA's regenerated file replaces this with `Status (S18 WSA): v3 rubric (S17) + clampRiskLevel re-evaluated. Dev-labeled specificity XX.X% (target post-v3: ≤2 FPs). Held-out specificity XX.X% (target post-v3: ≤3 FPs). [If pattern reduced: "v3 rubric confirmed effective; WSB deferred."] [If pattern persists: "v4 workstream triggered; see S18 WSB PR."] ... New: ## Cost per analysis section — $X.XX / patient, $Y.YY / 26-patient cohort.`
- The post-S16 line stays as a historic record at line 9; the WSA line replaces line 8.

### D8. File-level change set

**New files (3):**
- `apps/api/src/agents/usage.ts` (WSA commit 2) — pure `extractUsage` + `accumulateUsage` functions
- `apps/api/src/agents/pricing.ts` (WSA commit 2) — `RATE_TABLE` + `computeCostUsd` function
- `docs/plans/caresync-ai/s18-clinician-engagement.md` (WSC commit 3) — outreach email + agenda + protocol

**New artifacts (1):**
- `docs/eval-report-cost.json` (WSA commit 2) — emitted by eval, not committed to git (`.gitignore`'d as a regenerated artifact, same convention as `docs/eval-report.json`)

**Modified files (WSA commit 2):**
- `apps/api/src/agents/agent.ts` — add `UsageRecord` type; add `{ type: 'usage'; agentId: AgentId; usage: UsageRecord }` event variant
- `apps/api/src/agents/{risk,careGap,sdoh,actionPlanner}Agent.ts` — yield `usage` event in `response.completed` branch (4 files, 4-6 lines each)
- `apps/api/src/scripts/eval.ts` — accumulate usage; emit `docs/eval-report-cost.json`; render Cost section in markdown
- `apps/api/src/scripts/eval.test.ts` — TDD pins for cost aggregation
- `docs/eval-report.{md,json}` — regenerated by WSA's eval run

**Modified files (WSC commit 3):**
- `docs/eval-report.md` line 8 — Status line update (only if WSC ships WSA's eval first; otherwise deferred)

**Modified files (WSB commit 4, conditional):**
- `apps/api/src/agents/riskAgent.ts` — append Rule 3 + Examples 6 & 7 to `buildPrompt` body
- `apps/api/src/agents/riskAgent.test.ts` — 3 new TDD pins for Rule 3 + Example 6 + Example 7
- `docs/eval-report.{md,json,cost.json}` — regenerated by WSB's eval run

**Not modified:**
- `apps/api/src/agents/confidenceScorer.ts` — `clampRiskLevel` from S17 stands; WSB's Rule 3 is a prompt-level addition, not a code-level clamp change
- `apps/api/src/fhir-data/seed-patients.ts`, `apps/api/src/fhir-data/population.ts` — no seed edits; v4 uses existing FP bundle shapes
- `apps/api/src/eval/{labelFromBundle,varianceProbe,computeMetrics,errorAnalysis}.ts` — labeling rules unchanged; variance probe unchanged
- `data/eval/labels.json` — held-out cohort unchanged; no extension in S18 (deferred to S19)
- Per-agent model tier routing — explicitly out of scope (D9)
- The 5 S18 workstream agents' prompts (careGap, sdoh, actionPlanner) — S18 WSB is Risk-only
- `apps/web/**` — no frontend changes; cost is a backend artifact only

### D9. What model tier routing is NOT in S18
- A "cheaper model fallback" (Risk on `gpt-5.5-mini`, ActionPlanner on `gpt-5.5`) requires:
  1. The WSA cost data (informs whether the savings justify the work)
  2. A separate eval proving `gpt-5.5-mini` preserves the rubric's specificity gate
  3. Per-agent `MODEL` constants (currently one shared const in `riskAgent.ts:11`)
- This is **S19 work**, not S18. The PRD names S19 explicitly so the boundary is documented.
- If WSA's cost-profiling reveals the savings are large (>50% reduction), S19's PRD begins with "S19: per-agent model tier routing with v4 rubric preservation eval."

### D10. Pillar-aligned Acceptance Gate (S18's overall acceptance)
S18 ships when **all** of the following are true:
1. WSA commit 2 merges: `pricing.ts` + `usage.ts` modules exist; cost aggregation TDD pins pass; `docs/eval-report.md` has the `## Cost per analysis` section populated from real usage data.
2. WSC commit 3 merges: `s18-clinician-engagement.md` exists with 5 sections.
3. (Conditional) WSB commit 4 merges OR is explicitly skipped via a S18 PR description note ("WSB not required — v3 rubric confirmed effective by WSA eval").
4. The full test suite + tsc clean (no regressions in the 309+ tests).
5. The slice's `verification-s18.md` enumerates the post-WSA + post-WSB (if applicable) numbers with concrete commands run + exit codes + output captured (same pattern as `verification-s16.md`).

### D11. Verification matrix (S18's 5 signals)
| # | Signal | Verification command | Pass condition |
|---|---|---|---|
| 1 | Token capture in all 4 agents | `grep -n "type: 'usage'" apps/api/src/agents/*Agent.ts` | All 4 files yield a `usage` event in the `response.completed` branch |
| 2 | Cost aggregation correctness | `eval.test.ts` TDD pins | `computeCostUsd` math correct; aggregation across 4 agents × 26 patients matches expected total |
| 3 | Post-v3 eval numbers | `cd apps/api && npx tsx src/scripts/eval.ts` (post-quota-refresh) | `docs/eval-report.md` line 8 shows the actual post-v3 Risk specificity |
| 4 | (Conditional) v4 rubric structure | `riskAgent.test.ts` TDD pins | 3 new structure pins (Rule 3 + Example 6 + Example 7) present in `buildPrompt` output |
| 5 | (Conditional) v4 2x2 gate | Same eval as #3 | Dev-labeled specificity ≥85% AND sensitivity ≥100%; held-out specificity ≥70% |

Signals #1, #2, #3 are WSA's gate. Signal #3 is the binding measurement that decides WSB. Signal #4 + #5 are WSB's gate.

---

## Testing Decisions

### T1. What makes a good test for S18
- **External behavior only** — test the `extractUsage` output shape (not internal helpers), the `computeCostUsd` math (not the rate table hardcoding), the eval-pipeline cost aggregation (not its iteration order), and the `buildPrompt` v4 structure pins (not full-string snapshots).
- **No mock-LLM behavior tests** for the cost capture — the cost-capture is a pure function on the event payload; the fixtures are stub `response.completed` events.
- **Real-LLM tests** for the eval regen in WSA and the 2x2 gate in WSB — same as S16's live-eval pattern. The eval harness runs the real LLM, not mock outputs.

### T2. Prior art
- **`apps/api/src/agents/riskAgent.test.ts:fakeStream`** — the existing fake-client pattern. `extractUsage` gets tested against a stub event with a known `.usage` field; the LLM itself is not invoked.
- **`apps/api/src/agents/confidenceScorer.test.ts`** — pure-function TDD pattern from S14 commit 3. `extractUsage` + `accumulateUsage` follow the same fixture + assertion style.
- **`apps/api/src/agents/citationValidator.test.ts`** — pure-function TDD pattern from S11. `pricing.ts`'s `computeCostUsd` follows the same shape.
- **`apps/api/src/scripts/eval.test.ts`** — existing eval-harness test pattern. The new cost-aggregation tests extend the same describe blocks.

### T3. What gets tested in each new / modified file

**`apps/api/src/agents/usage.ts` (new, WSA commit 2):**
- 1 test: `extractUsage` returns `{ inputTokens, outputTokens, totalTokens }` from a stub `response.completed` event with `.usage`
- 1 test: `extractUsage` returns `null` when the event has no `.usage` (e.g., streaming interrupted)
- 1 test: `extractUsage` is null-safe (doesn't throw on undefined event)
- 1 test: `accumulateUsage` sums 4 records correctly across agents

**`apps/api/src/agents/pricing.ts` (new, WSA commit 2):**
- 1 test: `computeCostUsd` for `gpt-5.5` with a known fixture returns the expected dollar amount (e.g., 1000 input + 200 output → $0.04** based on the rate constant)
- 1 test: `computeCostUsd` for `gpt-5.5-mini` returns a smaller number (sanity check, not exact value)
- 1 test: `computeCostUsd` for an unknown model returns `null` or throws (decide in impl)

**`apps/api/src/agents/agent.ts` (modified, WSA commit 2):**
- Existing type tests pass (no regression in the discriminated union)
- The new `usage` variant typechecks against the existing consumer code in `streamAnalysis` (manual verification — there are no TDD pins for the event union itself; covered by the eval-pipeline compile)

**`apps/api/src/agents/{risk,careGap,sdoh,actionPlanner}Agent.ts` (modified, WSA commit 2):**
- Existing fakeStream-based tests pass (no behavioral change to the existing event yield order)
- 0 new tests — the change is structural (yielding one extra event in the same branch), and the eval regen is the integration test

**`apps/api/src/scripts/eval.test.ts` (modified, WSA commit 2):**
- 1 test: cost aggregation across 4 agents × 1 patient (fixture-based, no LLM)
- 1 test: cost aggregation sums correctly across 26 patients
- 1 test: eval without usage events reports `null`/omitted rather than fabricated zeros

**`apps/api/src/agents/riskAgent.test.ts` (modified, WSB commit 4, conditional):**
- 1 test: the new Rule 3 ("A patient with 0 Anchor-C observations in the retrieved bundle is in a missing-data state...") appears verbatim in `buildPrompt` output
- 1 test: Example 6's anchor mapping (pop-0004 shape → moderate, with the data-limited note) appears in `buildPrompt` output
- 1 test: Example 7's anchor mapping (linda-torres shape → moderate, with the data-limited note) appears in `buildPrompt` output
- All 5 existing v3 structure pins remain (regression guard)

### T4. Integration tests in `verification-s18.md`
- 1 `cd apps/api && npx tsx src/scripts/eval.ts` (WSA commit 2) — emits post-v3 eval-report.{md,json,cost.json}; Cost section populated.
- 1 `grep -n "type: 'usage'" apps/api/src/agents/*Agent.ts` — 4 files show the yield.
- 1 `cd apps/api && npx tsx src/scripts/eval.ts` (WSB commit 4, conditional) — v4 2x2 gate result documented in §5.
- 1 `cat docs/eval-report-cost.json | head -30` — schema sanity check.
- 1 `cat docs/plans/caresync-ai/s18-clinician-engagement.md | grep -c "^## "` — 5 sections present.

### T5. What does NOT get tested
- The internal iteration order of `eval.ts`'s cost aggregation.
- The exact dollar amounts from the regen eval (LLM variance — captured honestly with the actual numbers, not asserted against a target).
- The clinician engagement email's response rate — process, not code.
- The held-out sensitivity number in WSB's eval (will likely be `null` per `review-s16.md`'s documented sensitivity-undefined note; preserved honestly, not asserted against a target).

---

## Out of Scope

- **Per-agent model tier routing** (`gpt-5.5-mini` for Risk, `gpt-5.5` for ActionPlanner) — S19, requires WSA's cost data first
- **Held-out label expansion to 15+ negative Care Gap examples** — blocked on clinician engagement; S19 or later
- **Held-out procedural-generator extension to include 3-condition patients** — out of scope (labeling-rule changes, not rubric changes)
- **SDOH bias audit by age/sex/race/ethnicity** — needs HAPI cohort stratification; S20+
- **SMART enforcement empirical verification (curl test)** — single curl, S19 as part of eval-expansion
- **MODEL_CARD.md authoring** — depends on stable rubric + cost story; S20+
- **6th agent node (Safety Officer / Flight Surgeon)** — explicitly deferred per the prior planning turn's "What to skip" recommendation
- **Black Box replay on the audit trail** — same; rubric work precedes UI surface work
- **Sterile Cockpit Mode (encounter-context gating)** — same; P4 already at 5/5
- **Tiered confidence routing UI** — same; P4 already at 5/5
- **Patient Override (Patient-side Consent + Communication)** — different problem space, post-challenge work
- **AAR Loop / After-Action Review** — needs outcome capture at scale, post-challenge work
- **Multilingual support** — different problem space, not S18
- **Patient-facing portal** — different problem space, not S18
- **S18-lite Safety Review panel on `TaskDetail.tsx`** — explicitly deferred; the demo moment is not the rubric-mover
- **Updating the `Status (S16)` banner in `apps/api/src/scripts/eval.ts:461-466`** to `Status (S18)` — optional, low value, deferred unless the eval regen encounters the `Status` line again

---

## Further Notes

### Sequencing within S18
1. **Day 0 (today)** — Draft this PRD. Land the PR with WSA + WSC + the conditional WSB plan. Optionally draft the outreach email (in `s18-clinician-engagement.md`) the same day.
2. **Day 1-2** — WSA commit 2 lands. Eval regen runs (when quota refreshes). `docs/eval-report-cost.json` and the Cost section are populated. The post-v3 Risk numbers are known.
3. **Day 1 (parallel)** — Send the outreach email to one clinician. Engagement is on its own clock; S18 is mergeable regardless.
4. **Day 3** — Decision point: did v3 fix the FP pattern? If yes, WSB is deferred; S18 closes. If no, WSB commit 4 lands with Rule 3 + Examples 6 & 7.
5. **Day 4-5** — WSB eval regen. v4 2x2 gate result documented in `verification-s18.md §5`. Slice merges.

### Upstream dependencies
- `reports/HL7-Challenge-Evaluation.2026-07-09-post-s17-full.md` — the eval report this PRD reverses out of (open questions Q1, Q2, Q4)
- `docs/eval-report.md` line 8 — currently shows post-S16 v2 numbers; WSA's regen replaces this with post-S17 v3 numbers
- `docs/plans/caresync-ai/prd-s16.md` — the prior Risk-rubric PRD (defines the 2x2 gate pattern S18's WSB reuses)
- `docs/plans/caresync-ai/prd-production-smart-scope.md` — the S17 PRD (shipped v3 rubric + `clampRiskLevel`; S18 WSA's measurement validates whether v3 worked)
- `docs/plans/caresync-ai/rubric-eval-result.md` §"Quota-exhaustion incident" + §"Specificity lift on the four FP patients" — the S16 follow-up notes that name WSA + WSB's exact deliverables
- `docs/plans/caresync-ai/review-s16.md` — the review surface (the "v3 could lift specificity further" note at the 2x2-summary section)
- `apps/api/src/agents/riskAgent.ts:11` — `MODEL = 'gpt-5.5'` const (WSA's target for the streaming-consumer change; WSB's Anchor D + Examples 6 & 7 land in `buildPrompt` 100-200)
- `apps/api/src/agents/{risk,careGap,sdoh,actionPlanner}Agent.ts:259-ish` — the `response.completed` event consumer in each agent (WSA's target)
- `apps/api/src/agents/confidenceScorer.ts` — the S17 `clampRiskLevel` (unchanged in S18; WSB's Rule 3 is a prompt-level addition; the deterministic clamp provides a second-line safety net)
- `apps/api/src/scripts/eval.ts:461-466` — the `Status` line (no change unless WSA's regen touches it)
- `apps/api/src/eval/varianceProbe.ts` — S16 commit 2's observability tool (unchanged; per-patient agreement at API defaults is the variance baseline WSA documents)
- `apps/api/src/eval/labelFromBundle.ts` — `riskScoreFor ≥ 75` threshold (unchanged in S18; the v4 2x2 gate uses the same labels)
- `data/eval/clinician-outreach.json` — S15's outreach log (WSC's protocol updates this; no schema change)
- `data/eval/labels.json` — 26 labeled patients (unchanged in S18; the post-v3 eval re-scores the same 26)

### Downstream artifacts (S18 commits, in order)

1. `docs(S18): PRD + grill-notes (optional)` — only if a separate grill-notes file is created; otherwise the PRD ships with WSA's commit
2. `feat(S18/WSA): token/cost capture + post-v3 eval regen` — `usage.ts`, `pricing.ts`, eval-pipeline cost aggregation, modified `AgentEvent` type with `usage` variant, regenerated `docs/eval-report.{md,json,cost.json}`
3. `feat(S18/WSC): clinician engagement artifact` — `docs/plans/caresync-ai/s18-clinician-engagement.md`
4. (Conditional) `feat(S18/WSB): risk rubric v4 — Anchor D: missing-data-state` — `buildPrompt` body extension, `riskAgent.test.ts` 3 new TDD pins, regenerated eval-report

### Post-merge follow-up (S19+)
- **S19: Per-agent model tier routing** — begin with WSA's cost data; eval whether `gpt-5.5-mini` preserves the rubric; if yes, route Risk/CareGap/SDOH to the cheaper tier and ActionPlanner to the premium tier; new eval-report section "Cost after tier routing."
- **S19: Held-out label expansion + clinician engagement track** — extend `data/eval/labels.json` to 50+ patients with 15+ negative Care Gap examples; if a clinician responded to WSC's email, schedule their review session; if not, draft a second outreach wave.
- **S19: SMART enforcement verification** — single `curl` test against `http://localhost:8080/fhir/Patient/...` with no Authorization header → expect 401. Document the result.
- **S20: MODEL_CARD.md** — depends on stable rubric (post-WSB or post-v3-if-skipped), cost story (WSA), clinician validation (WSC). Not before then.

### Engagement playbook (S18 WSC expands on S15)
- S15 created the outreach log mechanism (`data/eval/clinician-outreach.json`). S18 WSC drafts the actual email + agenda.
- The clinician runs `npm run review:render` against the v3 agents. The v3 rubric's anchors + Rule 1 + Rule 2 + 5 examples are visible in the narrated token stream and the eval-report's per-agent metrics section.
- If the clinician responds positively, the engagement is 90 minutes; the `clinicianOverride` slots get filled; `npm run review:apply` upgrades the label `source` field from `"dev"` to `"clinician"` (S14's `c6587f1` made this data-driven).
- If the clinician declines or no-response after 2 weeks, the engagement is documented as attempted; P6's contribution-from-engagement delta is +0.25 (attempted, not validated) — not zero.

### Risk surface for S18
- **Risk #1: OpenAI quota remains exhausted through WSA's window.** Mitigation: WSC ships independent of WSA; the cost-capture modules ship even if the live eval regen is deferred; recovery is the same `git checkout HEAD` + retry pattern as the S16 quota incident.
- **Risk #2: v3 eval regen shows dev FPs > 4 or held-out FPs > 5.** This is WSB-triggering, not a risk. WSB lands with Rule 3 + Examples 6 & 7 in commit 4.
- **Risk #3: v3 eval regen shows the sensitivity held-out denominator stays 0.** This is the same undefined metric as S16 (`review-s16.md §"Documented design tradeoff — not a defect"`). WSA documents it honestly; no v4 work fixes a label-set issue. S19's held-out expansion is the path.
- **Risk #4: Clinician does not respond within 2 weeks.** S18 merges regardless. The engagement is documented as attempted. P6 movement is +0.25 (attempted) not +0.5 (validated).
- **Risk #5: Cost capture breaks an existing test.** Mitigation: `extractUsage` returns `null` for missing `.usage`, not a crash — the existing streaming-consumer code is unchanged except for yielding one extra event. Existing tests pass without modification.
- **Risk #6: WSB's Rule 3 introduces a NEW over-call pattern at the moderate vs low boundary.** Mitigation: the 2x2 gate's v4 acceptance is dev-labeled specificity ≥85%; if it lands at 85% but introduces new FPs elsewhere, the v4 2x2 still passes but the next iteration needs a v5 with care for the low boundary. Documented as a `verification-s18.md §6` known-issue if it surfaces.

### Compliance with `never-override-real-with-fake.md`
- WSA's cost capture uses **real** token counts from `response.usage`. If `response.usage` is absent (e.g., on a streaming interruption), `extractUsage` returns `null` and the eval-report renders "—" for that cell — never a fabricated `$0.00`.
- WSA's pricing uses **published** `gpt-5.5` and `gpt-5.5-mini` rates from `openai.com/pricing` as of 2026-07-09, sourced and dated in `pricing.ts` comments. No fabricated rates.
- WSB's v4 2x2 gate uses **real** LLM runs against the existing 26-patient corpus. No synthetic labels. No synthetic eval patients. If the 2x2 fails, the slice ships WSA + WSC only and WSB is deferred — the v4 design does not land in working code without an honest failed-gate fallback.
- WSC's outreach artifact documents the **actual** engagement status. If the clinician doesn't respond, the artifact's status updates accordingly; no fabrication of a response.

### Compliance with `openai-responses-api-no-seed.md`
- WSA does NOT attempt `temperature: 0` or `seed: 42` pins (per memory: the API rejects both). Variance remains at API defaults (81.25% per-patient agreement per S16 varianceProbe). WSA documents this in the eval-report's Status line: "Variance probe unchanged from S16 commit 2 (API does not support temp/seed pinning on gpt-5.5)."
- WSA's cost capture uses **per-call** token counts, not aggregated estimates; per-call variance is preserved in the data.
