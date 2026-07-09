# Implementation Plan — S18 WSA: Token/Cost Capture + Post-v3 Eval Regen

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PLAN_ID:** `caresync-ai` · **Slice:** S18 WSA (Workstream A only — WSB and WSC are explicit non-goals here)
> **Date:** 2026-07-09
> **Status:** Draft, ready for user review + merge of staging artifacts (`prd-s18.md` + `s18-clinician-engagement.md` already committed in the working tree).
> **Specs (in dependency order):**
> - `docs/plans/caresync-ai/prd-s18.md` (PRD — WSA D1–D4, T1–T4, Out of Scope, Further Notes)
> - `docs/plans/caresync-ai/s18-clinician-engagement.md` (WSC artifact — already shipped, this plan does NOT modify it)
> - `docs/plans/caresync-ai/prd-production-smart-scope.md` (S17 PRD — v3 rubric + `clampRiskLevel`; the post-v3 eval this plan triggers)
> - `docs/plans/caresync-ai/prd-s16.md` (S16 PRD — the prior eval-regen pattern this plan mirrors)
> - `docs/plans/caresync-ai/rubric-eval-result.md` §"Quota-exhaustion incident" (audit trail — the eval regen was deferred after S17 quota-exhaustion; WSA is the recovery)
> - `docs/eval-report.md` line 8 (currently shows **post-S16 v2** numbers; WSA replaces with post-S17 v3 numbers)
> - `reports/HL7-Challenge-Evaluation.2026-07-09-post-s17-full.md` §F Q1 + Q4 (the open questions this plan closes)
> - `apps/api/src/agents/riskAgent.ts:259`, `apps/api/src/agents/careGapAgent.ts:131`, `apps/api/src/agents/sdohAgent.ts`, `apps/api/src/agents/actionPlannerAgent.ts` (the `response.completed` event consumers — WSA's yield-injection target)
> - `apps/api/src/agents/agent.ts:86-91` (the `AgentEvent` discriminated union — gains a `usage` variant)
> - `apps/api/src/routes/analysis.ts:305-320` (downstream SSE consumer — only handles `token` and `result` events; `usage` events fall through silently — **no change required here**)
> - `apps/api/src/scripts/eval.ts:123` (downstream eval consumer — `if (event.type !== 'result') continue;` — `usage` events are silently skipped — **no change required here**)
> - `apps/api/src/scripts/eval.test.ts` (existing eval-harness TDD surface — gains 3 new cost-aggregation tests)
> - `apps/api/src/agents/citationValidator.test.ts` + `apps/api/src/agents/confidenceScorer.test.ts` (existing pure-function TDD patterns — `usage.ts` and `pricing.ts` follow these)

**Goal:** Close HL7 evaluation Open Questions Q1 (post-v3 eval gate measurement) + Q4 (per-patient cost profile) in a single 1-commit PR. After this slice: the regenerated `docs/eval-report.md` shows the actual post-S17 v3 Risk specificity numbers (replacing the currently-committed post-S16 v2 numbers per the `quota-exhaustion incident` audit trail), and a new `## Cost per analysis` section gives the per-agent + per-patient + cohort cost story that lifts Pillar P7 from 3 → 4.

**Architecture:** 2 new pure-function modules (`apps/api/src/agents/usage.ts` + `apps/api/src/agents/pricing.ts`); 1 modified `AgentEvent` discriminated union (gains the `usage` variant); 4 modified `*Agent.ts` files (yield one extra `usage` event in the existing `response.completed` branch — 4-6 lines each); 1 modified `scripts/eval.ts` (cost aggregation + `docs/eval-report-cost.json` emission + Cost-section markdown rendering); 1 modified `scripts/eval.test.ts` (3 new TDD pins); 1 regenerated `docs/eval-report.{md,json,cost.json}`. TDD where applicable. The downstream consumers (`routes/analysis.ts`, `scripts/eval.ts:123`) are NOT modified — both already skip unknown event types (`if (event.type !== 'result') continue;` in eval.ts; the analysis.ts SSE handler uses an `if (event.type === 'token')` + `event.type === 'result'` switch with a fall-through).

**Tech Stack delta:** no new external dependencies. Same Jest + tsx stack. Pricing rates are constants in `pricing.ts` — sourced from `openai.com/pricing` snapshot at 2026-07-09 (documented in `pricing.ts` header comment).

**Ponytail pass applied:** minimum new seams (2 new modules, 1 union variant, 4 small agent edits, 1 eval-pipeline edit); `usage.ts` follows the `eval/labelFromBundle.ts` + `eval/outreachSchema.ts` pure-function pattern; `pricing.ts` follows the `agents/citationValidator.ts` pure-function pattern; no flag in `eval.ts` (the cost capture is always-on, not behind a `--cost` flag); no agent hot-path change beyond yielding one extra event in the existing branch (the streaming consumer's token/result behavior is untouched); no model-tier routing in this slice (explicitly S19 — see PRD §"Further Notes").

**Domain source:** `apps/api/src/agents/riskAgent.ts:11` (`MODEL = 'gpt-5.5'`, shared across 4 agents — pricing rates use this as the canonical model name); `apps/api/src/agents/agent.ts:86-91` (`AgentEvent` union — the seam this plan adds to); `apps/api/src/agents/confidenceScorer.ts` (the S17 `clampRiskLevel` — unchanged; WSA does not modify the clamp); `apps/api/src/eval/varianceProbe.ts` (peer I/O-script pattern that `varianceProbe.ts` followed, not relevant here — `usage.ts` is pure, not an I/O script); `apps/api/src/scripts/eval.ts:461-466` (the `Status` lines — `Status (S16)` will be re-titled to `Status (S18 WSA)` after the eval regen succeeds).

**Project memory reference:** `never-override-real-with-fake.md` — `extractUsage` returns `null` (not `$0.00`) when `response.usage` is absent; the eval cost sidecar emits `null`-omitted cells instead of fabricated zeros; pricing rates are **published**, not invented. `openai-responses-api-no-seed.md` — WSA does NOT attempt temperature/seed pinning; the cost capture is per-call, preserving whatever variance exists at API defaults (81.25% per-patient agreement per `docs/plans/caresync-ai/variance-probe.md`); the cost section's Status line discloses this honestly.

**Branch state (per skill warning):** implementation is on `feature/s17-production-smart-scope-risk-v3` (the current branch S17 shipped on). The working tree currently has untracked staging artifacts — `prd-s18.md`, `prd-production-smart-scope.md` (S17's PRD), `s18-clinician-engagement.md` (WSC), and the 2 post-S17 HL7 evaluation reports. Implementation below assumes these have been committed first (Commit 0 — see below).

---

## Commit 0 — `docs(S18): PRD + clinician-engagement artifact + S17 PRD + post-S17 eval reports`

**Goal:** Land the planning artifacts in the working tree before any code lands. After this commit, the S18 audit trail is established and the WSA implementation has its design contract committed.

**Architecture:** 5 new docs under `docs/plans/caresync-ai/` + `reports/`:
- `docs/plans/caresync-ai/prd-s18.md` (the PRD — D1–D11, written this session)
- `docs/plans/caresync-ai/s18-clinician-engagement.md` (the WSC artifact — copy-paste-ready email + agenda + protocol, written this session)
- `docs/plans/caresync-ai/prd-production-smart-scope.md` (S17's PRD — was untracked, now committed; not authored this session but was a stray workspace file)
- `reports/HL7-Challenge-Evaluation.2026-07-09-post-s17-full.md` (the eval report this PRD reverses out of — was untracked, now committed; same status)
- `reports/HL7-Challenge-Evaluation.2026-07-09-post-s17.md` (the short-form post-S17 eval — was untracked, now committed; same status)

**Spec:** `prd-s18.md` §"Solution" + §"Implementation Decisions D6" (WSC artifact's spec); the other 3 docs are pre-existing untracked workspace artifacts the S17 commit produced.

**Status:** All 5 files exist in the working tree (verified via `git status --short`). This commit lands them with one commit per file family OR one combined commit — implementation chooses the granularity.

### Phase A — Commit the staging artifacts

- [ ] **A1. Verify working tree:** `git status --short` shows `??` for the 5 files above + `?? docs/SOLUTION_OVERVIEW.md docs/SUBMISSION.md docs/TECHNICAL_ARCHITECTURE.md` (3 submission-docs files that belong to a different commit — separate them out, do not commit them here).
- [ ] **A2. Stage the S18 docs:** `git add docs/plans/caresync-ai/prd-s18.md docs/plans/caresync-ai/s18-clinician-engagement.md docs/plans/caresync-ai/prd-production-smart-scope.md reports/HL7-Challenge-Evaluation.2026-07-09-post-s17-full.md reports/HL7-Challenge-Evaluation.2026-07-09-post-s17.md`.
- [ ] **A3.** `npx tsc --noEmit` is a no-op for docs (no TS files touched). Skip the suite run.
- [ ] **A4. Commit (1 or 2 commits — choice documented in commit message):**
  ```
  docs(S18): PRD + clinician-engagement artifact + S17 PRD + post-S17 eval reports

  - prd-s18.md — D1–D11, three-workstream decomposition (WSA: cost capture
    + post-v3 eval; WSB: conditional v4 rubric; WSC: clinician outreach draft)

  - s18-clinician-engagement.md — WSC's draft outreach email +
    90-minute meeting agenda + outreach-log update protocol (copy-paste-
    ready email block at top of file)

  - prd-production-smart-scope.md (S17) — committed retroactively from
    workspace (was an untracked file after the S17 merge landed)

  - reports/HL7-Challenge-Evaluation.2026-07-09-post-s17-{,full}.md —
    the post-S17 evaluation reports that motivated S18

  No code/test changes. Implementation begins in Commit 1 (WSA only).
  ```

---

## Commit 1 — `feat(S18/WSA): token/cost capture + post-v3 eval regen`

**Goal:** Ship the cost capture modules + modify the 4 agents to yield `usage` events + add cost aggregation to the eval pipeline + regenerate the post-v3 eval-report with the `## Cost per analysis` section. After this commit, Pillar P7 lifts from 3 → 4 (cost story present), the post-v3 Risk specificity is finally measured (replacing the post-S16 v2 numbers currently in `docs/eval-report.md:8`), and `docs/eval-report-cost.json` is a regenerable sidecar artifact for the next eval run.

**Architecture:**
1. **2 new modules** (`usage.ts` + `pricing.ts`) — pure functions with TDD pins. Lifecycle peer to `citationValidator.ts` + `confidenceScorer.ts` in `agents/`.
2. **`AgentEvent` union modified** — adds `{ type: 'usage'; agentId: AgentId; usage: UsageRecord }` variant in `agents/agent.ts:86-91`. Discriminated union shape preserved (no breaking change to existing consumers that don't switch on `usage`).
3. **4 modified `*Agent.ts` files** — yield one extra `usage` event inside the existing `response.completed` branch (~4-6 lines per file). No new SDK calls; no behavior change to the existing `token` or `result` events.
4. **1 modified `scripts/eval.ts`** — accumulates `usage` events into `Map<patientId, Map<agentId, UsageRecord>>`; emits `docs/eval-report-cost.json`; renders `## Cost per analysis` markdown section; updates `docs/eval-report.md` line 8 from `Status (S16)` to `Status (S18 WSA)` with the post-v3 numbers.
5. **1 modified `scripts/eval.test.ts`** — 3 new TDD pins (cost aggregation math, missing-data null-handling, full 4-agent × multi-patient aggregation).
6. **Regenerated `docs/eval-report.{md,json,cost.json}`** — output of Commit 1's Phase G live eval regen.

**Spec:** `prd-s18.md` §"Solution" + §"Implementation Decisions D1, D2, D3, D4, D7, D8" + §"Testing Decisions T1, T2, T3".

### Phase A — TDD red for `usage.ts`

- [ ] **A1. Read `apps/api/src/agents/citationValidator.test.ts`** for the existing pure-function TDD pattern in `agents/`. `usage.test.ts` follows the same fixture + assertion style.

- [ ] **A2. Create `apps/api/src/agents/usage.test.ts`** with 4 test cases FIRST (RED — module doesn't exist yet):
  - **Test 1 (happy path):** Given a stub `response.completed` event with `.usage = { input_tokens: 1234, output_tokens: 567, total_tokens: 1801 }`, `extractUsage(event)` returns `{ inputTokens: 1234, outputTokens: 567, totalTokens: 1801 }`.
  - **Test 2 (missing `.usage`):** Given a stub event without `.usage` (e.g., streaming interrupted), `extractUsage(event)` returns `null`.
  - **Test 3 (null-safe):** Given `undefined` or `null` as the event, `extractUsage(undefined)` returns `null` without throwing.
  - **Test 4 (aggregation):** Given 4 `UsageRecord` entries for one patient (one per agent), `accumulateUsage(records)` returns the sum `{ inputTokens: sum, outputTokens: sum, totalTokens: sum }`.
  - *Verify:* `cd apps/api && npx jest src/agents/usage.test.ts` → all 4 tests FAIL (module doesn't exist; `Module not found`).

- [ ] **A3. Exported types contract for downstream TDD pins:** in the test file (test-only declaration), declare the expected shapes so Phase C's `AgentEvent` union extension has a known target:
  ```ts
  interface UsageRecord { inputTokens: number; outputTokens: number; totalTokens: number; }
  ```
  Match this against the existing `AgentEvent` union's discriminated-union style (the `risk` agent's `flags[].confidence: number` pattern is the closest existing precedent for a typed sub-record).

### Phase B — TDD red for `pricing.ts`

- [ ] **B1. Create `apps/api/src/agents/pricing.test.ts`** with 3 test cases FIRST (RED — module doesn't exist yet):
  - **Test 1 (gpt-5.5 math):** Given `{ inputTokens: 1000, outputTokens: 200 }` and model `'gpt-5.5'` with rate `inputPer1k: 0.025, outputPer1k: 0.10`, `computeCostUsd(usage, 'gpt-5.5')` returns `$0.045` (i.e., 1000/1000 × 0.025 + 200/1000 × 0.10 = 0.025 + 0.020 = $0.045). Round to 4 decimal places.
  - **Test 2 (gpt-5.5-mini sanity):** Given the same usage but model `'gpt-5.5-mini'` with cheaper rates, `computeCostUsd(usage, 'gpt-5.5-mini')` returns a smaller number than `computeCostUsd(usage, 'gpt-5.5')`. Asserts the relative ordering, not the exact value (rates may shift; assertion pinned at fixture-traceable numbers).
  - **Test 3 (unknown model):** Given model `'unknown-model'`, `computeCostUsd` returns `null` (or throws a typed `UnknownModelError` — choose in Phase C; test accepts either via `expect(...).toEqual(expect.anything())` or explicit null-return assertion).
  - *Verify:* `cd apps/api && npx jest src/agents/pricing.test.ts` → all 3 tests FAIL (module doesn't exist).

- [ ] **B2. Document the rate source.** Test file's leading comment names `openai.com/pricing` snapshot URL + date `2026-07-09`. Same source citation lives in `pricing.ts`'s header comment in Phase C — keeps the audit trail tight.

### Phase C — GREEN: implement `usage.ts` + `pricing.ts` + `AgentEvent` union variant

- [ ] **C1. Create `apps/api/src/agents/usage.ts`**:
  ```ts
  export interface UsageRecord { inputTokens: number; outputTokens: number; totalTokens: number; }
  export function extractUsage(event: unknown): UsageRecord | null { /* null-safe; pulls .usage off response.completed */ }
  export function accumulateUsage(records: UsageRecord[]): UsageRecord { /* sums 4 fields */ }
  ```
  *Ponytail:* keep `extractUsage` + `accumulateUsage` in this one file (peer to `citationValidator.ts`'s two top-level exports). If a third helper lands later (e.g., `formatUsageMarkdown`), extract it then.
  - *Verify:* `cd apps/api && npx jest src/agents/usage.test.ts` → all 4 tests pass.

- [ ] **C2. Create `apps/api/src/agents/pricing.ts`**:
  ```ts
  // Source: https://openai.com/pricing — snapshot 2026-07-09
  // Update this comment + RATE_TABLE together when the rates change.
  export const RATE_TABLE: Record<string, { inputPer1k: number; outputPer1k: number }> = {
    'gpt-5.5':       { inputPer1k: 0.025, outputPer1k: 0.10 },
    'gpt-5.5-mini':  { inputPer1k: 0.005, outputPer1k: 0.02 },
  };
  export function computeCostUsd(usage: UsageRecord, model: string): number | null {
    const rate = RATE_TABLE[model];
    if (!rate) return null;
    const cost = (usage.inputTokens / 1000) * rate.inputPer1k + (usage.outputTokens / 1000) * rate.outputPer1k;
    return Math.round(cost * 10000) / 10000;
  }
  ```
  *Ponytail:* flat const + 1 function, no class, no model registry. If a 3rd model lands, add it to `RATE_TABLE` (one-line change).
  - *Verify:* `cd apps/api && npx jest src/agents/pricing.test.ts` → all 3 tests pass.

- [ ] **C3. Modify `apps/api/src/agents/agent.ts:86-91`** — add the `usage` variant to the `AgentEvent` discriminated union:
  ```ts
  export type AgentEvent =
    | { type: 'token'; agentId: AgentId; text: string }
    | { type: 'result'; agentId: 'risk'; output: RiskOutput }
    | { type: 'result'; agentId: 'careGap'; output: CareGapOutput }
    | { type: 'result'; agentId: 'sdoh'; output: SdohOutput }
    | { type: 'result'; agentId: 'actionPlanner'; output: ActionPlannerOutput }
    | { type: 'usage'; agentId: AgentId; usage: { inputTokens: number; outputTokens: number; totalTokens: number } };
  ```
  Import `UsageRecord` from `./usage` (preferred — single source of truth) OR inline the shape (acceptable for a 5-line sub-record; document the choice).
  - *Verify:* `cd apps/api && npx tsc --noEmit` clean. The discriminated union still typechecks; existing consumers compile unchanged (their switches on `type === 'token'` and `type === 'result'` don't reach the new variant; `if (event.type !== 'result') continue;` in `scripts/eval.ts:123` still skips `usage` events — exactly the desired behavior).

### Phase D — TDD red for `scripts/eval.ts` cost aggregation

- [ ] **D1. Read `apps/api/src/scripts/eval.test.ts`** for the existing TDD pattern. Locate the patient-iteration loop in `scripts/eval.ts` (Phase E modifies the loop + adds a per-patient accumulator map; Phase D pins the math).

- [ ] **D2. Add 3 new tests to `apps/api/src/scripts/eval.test.ts`** (RED — the methods don't exist yet):
  - **Test 1 (per-patient aggregation):** Given a fixture of `Map<patientId, Map<agentId, UsageRecord>>` with 4 agent entries for 1 patient, `computePatientCost(patientId, agentMap, 'gpt-5.5')` returns `{ patientId, totalInputTokens, totalOutputTokens, totalCostUsd, agents: [{ agentId, inputTokens, outputTokens, costUsd }, ...] }`.
  - **Test 2 (multi-patient aggregation):** Given the same fixture spread across 3 patients, an aggregation pass returns `[{ patient: { ...}, total }, ..., { aggregate: { totalCostUsd: sum, costPerPatient: avg } }]`.
  - **Test 3 (null-handling):** Given a patient map where one agent's usage is `null` (i.e., `extractUsage` returned null), `computePatientCost` renders that agent's cost as `null`, not `$0.00`. The aggregate skips nulls (does not include them in the cost sum; reports `null` cells as `—` in the markdown render).
  - *Verify:* `cd apps/api && npx jest src/scripts/eval.test.ts` → 3 new tests FAIL (the methods don't exist).

### Phase E — GREEN: `scripts/eval.ts` cost aggregation

- [ ] **E1. Modify `apps/api/src/scripts/eval.ts`** — add the cost-aggregation helpers + sidecar emission:
  ```ts
  import { computeCostUsd } from '../agents/pricing';
  import type { UsageRecord } from '../agents/usage';
  // ... existing imports ...
  
  type PatientUsage = Map<string /* patientId */, Map<AgentId, UsageRecord>>;
  
  function computePatientCost(patientId: string, agentMap: Map<AgentId, UsageRecord>, model: string) {
    const agents: Array<{ agentId: AgentId; usage: UsageRecord; costUsd: number | null }> = [];
    let totalInput = 0, totalOutput = 0;
    for (const [agentId, usage] of agentMap) {
      const costUsd = computeCostUsd(usage, model);
      agents.push({ agentId, usage, costUsd });
      if (costUsd !== null) { totalInput += usage.inputTokens; totalOutput += usage.outputTokens; }
    }
    return { patientId, agents, totalInputTokens: totalInput, totalOutputTokens: totalOutput };
  }
  
  function emitCostSidecar(usages: PatientUsage, model: string, outPath: string) {
    const patients = Array.from(usages.entries()).map(([pid, agentMap]) => computePatientCost(pid, agentMap, model));
    const totalCostUsd = patients.reduce((s, p) => s + (p.agents.reduce((ss, a) => ss + (a.costUsd ?? 0), 0)), 0);
    const costPerPatient = patients.length > 0 ? totalCostUsd / patients.length : 0;
    fs.writeFileSync(outPath, JSON.stringify({ model, generatedAt: new Date().toISOString(), patients, aggregate: { totalCostUsd: Math.round(totalCostUsd * 10000) / 10000, costPerPatient: Math.round(costPerPatient * 10000) / 10000 } }, null, 2));
    return { totalCostUsd, costPerPatient, patients };
  }
  ```
  *Ponytail:* add the 2 helpers inline (peer to existing `renderMarkdown` / `buildJsonSummary`); do NOT extract a `costAggregator.ts` separate file until a 2nd consumer appears.
  - *Verify:* `cd apps/api && npx jest src/scripts/eval.test.ts` → 3 new tests pass.

- [ ] **E2. Modify the patient-iteration loop in `scripts/eval.ts:main()`**:
  ```ts
  const usages: PatientUsage = new Map();
  // ... existing per-patient loop ...
  for await (const event of streamAnalysis(patientId, { onResult, onUsage: (u) => {
    if (!usages.has(patientId)) usages.set(patientId, new Map());
    usages.get(patientId)!.set(event.agentId, event.usage);
  }})) { /* existing handling */ }
  ```
  *Ponytail:* the `onUsage` handler is added to the existing handler-set argument (not a new orchestrator parameter); it does NOT modify the existing event switch — `extractUsage` is invoked inside the agent's `response.completed` branch (Phase F), not in the loop body. This keeps the eval loop unchanged.

- [ ] **E3. Add the `## Cost per analysis` markdown rendering** to `scripts/eval.ts:renderMarkdown`:
  ```ts
  // After the existing "## Error analysis" sections, before "## Data-availability gaps"
  function renderCostSection(cost: { totalCostUsd: number; costPerPatient: number; patients: any[] }, model: string): string {
    const perAgent = new Map<AgentId, { input: number; output: number; cost: number }>();
    for (const p of cost.patients) {
      for (const a of p.agents) {
        if (a.costUsd === null) continue;
        const cur = perAgent.get(a.agentId) ?? { input: 0, output: 0, cost: 0 };
        cur.input += a.usage.inputTokens;
        cur.output += a.usage.outputTokens;
        cur.cost += a.costUsd;
        perAgent.set(a.agentId, cur);
      }
    }
    const rows = Array.from(perAgent.entries()).map(([agentId, r]) =>
      `- **${agentId}**: $${r.cost.toFixed(4)} / patient avg (input ${r.input}, output ${r.output})`
    ).join('\n');
    return `## Cost per analysis (${model})\n\n${rows}\n\n- **Total: $${cost.costPerPatient.toFixed(4)} / patient avg, $${cost.totalCostUsd.toFixed(2)} / 26-patient cohort**\n- *Projected at scale: $${(cost.costPerPatient * 1000).toFixed(2)} / 1000-patient monthly cohort*`;
  }
  ```
  *Ponytail:* single function, single section, single line of `renderMarkdown` integration. No new top-level export.
  - *Verify:* `cd apps/api && npx jest src/scripts/eval.test.ts` → existing 3-section tests still pass; new test for the render output exists (1 additional test, added in this phase).

### Phase F — Modify 4 agents to yield `usage` events

- [ ] **F1. Read each agent's streaming consumer** — `riskAgent.ts:259`, `careGapAgent.ts:131`, `sdohAgent.ts` (find the matching line), `actionPlannerAgent.ts` (find the matching line). Each is `} else if (event.type === 'response.completed') { toolCall = ... }`. Add the `usage` yield inside the same branch.

- [ ] **F2. Modify `apps/api/src/agents/riskAgent.ts`** in the `response.completed` branch:
  ```ts
  } else if (event.type === 'response.completed') {
    toolCall = event.response.output.find((item: any) => item.type === 'function_call' && item.name === 'report_risk');
    const usage = extractUsage(event);
    if (usage) yield { type: 'usage', agentId: 'risk', usage };
  }
  ```
  Add `import { extractUsage } from './usage';` at the top of the file.
  - *Verify:* `cd apps/api && npx jest src/agents/riskAgent.test.ts` → existing 10/10 tests still pass (no behavioral change to token/result events).

- [ ] **F3.** Repeat the same edit in `apps/api/src/agents/careGapAgent.ts`, `apps/api/src/agents/sdohAgent.ts`, `apps/api/src/agents/actionPlannerAgent.ts`. Per file: 4-6 lines added (one import, one yield block, one `if (usage)` guard). The `agentId` literal matches the agent's `AgentId` value.
  - *Verify:* `cd apps/api && npx jest src/agents/{risk,careGap,sdoh,actionPlanner}Agent.test.ts` → all existing tests still pass.

### Phase G — Run the post-v3 eval regen

- [ ] **G1. Quorum check:** OpenAI quota. Per `docs/plans/caresync-ai/rubric-eval-result.md §"Quota-exhaustion incident"`: 96 successful LLM calls exhausted the quota on 2026-07-09 01:19 IST. The current quota state is unknown. **If quota is exhausted:** document the gate as `deferred — quota exhausted; eval regen deferred to post-quota-refresh` in `verification-s18.md`. The slice still merges (WSA's modules, tests, and `docs/eval-report.md` line 8 formatting change ship); only the live eval numbers are deferred. **If quota is available:** proceed with G2-G4.
  - *Ponytail:* the eval pipeline is forward-compatible with both states — `extractUsage` returns `null` for cached patients (no live LLM call), the eval regen renders "—" for those cells, and `## Cost per analysis` only renders real numbers for the cache-miss patients. No fabricated zeros (per `never-override-real-with-fake.md`).

- [ ] **G2. Run the eval:** `cd apps/api && npx tsx src/scripts/eval.ts`.
  - *Verify:* `docs/eval-report.md` line 8 now says `Status (S18 WSA)` (replacing `Status (S16)`); a new `## Cost per analysis (gpt-5.5)` section appears below the existing Error analysis sections; `docs/eval-report-cost.json` is emitted at `docs/eval-report-cost.json`.
  - *Ponytail:* if the eval hits a quota error mid-run, follow the S16 incident pattern (`rubric-eval-result.md §"Recovery steps"`) — kill the eval, `git checkout HEAD -- docs/eval-report.{md,json,cost.json}`, defer the regen.

- [ ] **G3. Extract the 4 WSA numbers:**
  - Dev-labeled Risk specificity (post-v3) — replaces the current post-S16 v2 69.2%.
  - Dev-labeled Risk sensitivity (post-v3) — replaces the current post-S16 v2 100.0%.
  - Held-out Risk specificity (post-v3) — replaces the current post-S16 v2 50.0%.
  - Held-out Risk sensitivity (post-v3) — likely `null` per `review-s16.md §"Documented design tradeoff — not a defect"` (denominator 0).
  - Per-patient cost (post-v3) — new; from `docs/eval-report-cost.json`'s aggregate.

- [ ] **G4. Decision point:** does v3's eval-regen show dev FPs ≤2 AND held-out FPs ≤3?
  - **YES (v3 worked):** WSB is **deferred**. Update `prd-s18.md`'s Status note to reflect "WSB deferred — v3 confirmed effective"; the slice closes with WSA + WSC (already shipped at `s18-clinician-engagement.md`). Do NOT modify `riskAgent.ts`'s `buildPrompt` body.
  - **NO (v3 didn't fix the FP pattern):** WSB commit (separate PR or follow-up commit per the user's plan-vs-PR preference) lands with the v4 rubric per `prd-s18.md D5`. The WSA merge can proceed ahead of WSB (the cost capture is orthogonal to the rubric change).

### Phase H — Update `docs/eval-report.md` line 8

- [ ] **H1. Replace `docs/eval-report.md:8`'s `**Status (S16):**` paragraph** with the WSA equivalent. Structure:
  ```
  **Status (S18 WSA):** Cost capture + post-v3 eval regen shipped.
  - Risk specificity dev-labeled: **XX.X%** (target post-v3: ≤4 FPs of 13 negatives → ≥69.2% baseline; measured YY.X% post-S17 v3 rubric).
  - Risk specificity held-out: **XX.X%** (target post-v3: ≤5 FPs of 10 negatives → ≥50% baseline; measured YY.X% post-S17 v3 rubric).
  - Cost per patient (gpt-5.5): **$X.XXXX** avg (input Y tokens, output Z tokens).
  - Projected at scale: $A / 1000-patient monthly cohort.
  - Substrate stability: 81.25% per-patient agreement at API defaults (variance probe unchanged from S16 — OpenAI Responses API does not support temperature/seed pinning).
  - [If v3 worked: "**v3 rubric confirmed effective.** WSB (rubric v4 Anchor D: missing-data-state) deferred."] [If v3 didn't fix it: "v3 rubric did not address the 4 dev + 5 held-out FP pattern. **WSB triggered** (see prd-s18.md D5)."]
  - **Pillar P7 lifts 3→4** (cost story now present). P2 stays at 5 (v3 specifics unchanged at the pillar level).
  ```
  *Ponytail:* keep the line 9 historic `**Status (S16):**` paragraph intact (audit trail); the new `**Status (S18 WSA):**` paragraph sits at line 8.

- [ ] **H2. Insert the `## Cost per analysis (gpt-5.5)` markdown section** below the existing "## Error analysis — combined" section and above the (existing or future) Data-availability section. The section is auto-rendered by `scripts/eval.ts:renderCostSection` (Phase E3) — the markdown is regenerated by the eval run; no manual insert required if G2 ran successfully.

- [ ] **H3. Sanity-check the eval-report reads honestly:** read `docs/eval-report.md` line 8 + the Cost section. Per `never-override-real-with-fake.md` — if `docs/eval-report-cost.json` shows `null` cells (e.g., 2 patients cached, 24 cache-miss), the markdown render shows `—` for those cells, not `$0.00` or `—`. If the live eval hit quota mid-run, the markdown shows the partial run with `failed` markers (no fabricated continuity).

### Phase I — Commit 1

- [ ] **I1.** `npx tsc --noEmit` clean; `npx jest --runInBand` all green (expecting 12 new tests: 4 usage + 3 pricing + 3 eval cost + 2 render-from-existing).

- [ ] **I2. Commit:**
  ```
  feat(S18/WSA): token/cost capture + post-v3 eval regen

  Closes HL7 Open Questions Q1 (post-v3 eval gate measurement) + Q4
  (per-patient cost profile); lifts Pillar P7 3→4.

  - New apps/api/src/agents/usage.ts — pure extractUsage(event) +
    accumulateUsage(records). Returns null (not $0.00) when the
    OpenAI response.usage field is absent (per never-override-real-
    with-fake.md).

  - New apps/api/src/agents/pricing.ts — RATE_TABLE for gpt-5.5 +
    gpt-5.5-mini sourced from openai.com/pricing snapshot 2026-07-09;
    computeCostUsd returns null for unknown models. 4-decimal rounding.

  - New apps/api/src/agents/usage.test.ts — 4 TDD pins (happy path,
    missing-usage null-return, null-event null-return, aggregation
    sum math).

  - New apps/api/src/agents/pricing.test.ts — 3 TDD pins (gpt-5.5 math,
    gpt-5.5-mini smaller-than-gpt-5.5, unknown-model null-return).

  - Modified apps/api/src/agents/agent.ts — AgentEvent discriminated
    union gains a 'usage' variant: { type: 'usage', agentId, usage }.
    Existing consumers (routes/analysis.ts, scripts/eval.ts:123) skip
    the new variant unchanged (they only switch on 'token' / 'result').
    No breaking change.

  - Modified 4 *Agent.ts files — yield one extra 'usage' event in the
    existing response.completed branch (4-6 lines per file). No new
    SDK calls; no behavior change to existing token/result events.

  - Modified apps/api/src/scripts/eval.ts — accumulates usages into
    Map<patientId, Map<agentId, UsageRecord>>; emits
    docs/eval-report-cost.json; renders ## Cost per analysis (gpt-5.5)
    section; updates docs/eval-report.md line 8 from Status (S16) to
    Status (S18 WSA).

  - Modified apps/api/src/scripts/eval.test.ts — 3 new TDD pins
    (per-patient aggregation, multi-patient aggregation, null-handling
    — null cells render as "—", not $0.00).

  - Regenerated docs/eval-report.{md,json,cost.json} from the WSA
    eval run. Post-v3 Risk specificity numbers now replace the
    committed post-S16 v2 numbers per rubeval-result.md §"Quota-
    exhaustion incident" recovery. [If WSB triggered: "v3 rubric
    did not fix the 4-dev + 5-held-out FP pattern; WSB commit
    follows in a separate PR."] [If WSB deferred: "v3 rubric
    confirmed effective at ≥30% specificity floor; WSB Anchor D
    deferred — see prd-s18.md §Further Notes."]

  S18 WSA scope only. S18 WSB (rubric v4 conditional) + S18 WSC
  (clinician engagement draft) handled separately.
  ```

  **Verify:** 12 new tests pass (4 usage + 3 pricing + 3 eval cost + 2 render-integration); tsc + jest clean; `docs/eval-report-cost.json` exists and is valid JSON; Cost section in `docs/eval-report.md` reads with real numbers (not "—" everywhere).

---

## Phase J — Post-merge verification

- [ ] **J1.** Write `docs/plans/caresync-ai/verification-s18.md` per `verification-s16.md` template (7 sections: outcome, command evidence, TDD evidence, live eval evidence with the 4 WSA numbers, DoD check, open follow-ups, recovery steps if quota-exhausted mid-run).
- [ ] **J2.** Write `docs/plans/caresync-ai/review-s18.md` per `review-s16.md` two-axis pattern (Standards + Spec). Standards axis: S18 WSA honors `never-override-real-with-fake.md` (null handling, no fabricated zeros), `openai-responses-api-no-seed.md` (no temp/seed pin attempt), and the ADLC process rules (branch off main, plan before code, TDD on the code-changing commit, ponytail pass applied). Spec axis: the 5-row verification matrix from `prd-s18.md D11`, with concrete commands run + exit codes + output captured.
- [ ] **J3.** Re-run the post-S18 HL7 evaluation (`reports/HL7-Challenge-Evaluation.2026-07-09-post-s18.md`) to capture P7's 3→4 lift + (conditional) WSB's P2 impact + (conditional) clinician engagement's P6 contribution. Mirror the S15/S16/S17 post-eval pattern from prior handoffs.

---

## Rollback / safety

| Commit | Revert | Reverts |
|---|---|---|
| 0 (docs) | `git revert <sha>` | Drops the 5 staging artifacts. No code impact. |
| 1 (WSA) | `git revert <sha>` | Drops `usage.ts`, `pricing.ts`, the 4 agent modifications, the eval-pipeline cost aggregation; restores `docs/eval-report.md` line 8 to `Status (S16)`; restores pre-WSA eval-report contents. The post-WSA state (cost capture present, post-v3 numbers in eval-report) reverts. **Cleanest: revert the commit atomically — the agent yield-injection is safe to remove (no other code depends on the `usage` event).** |

**Whole-PR revert:** `git revert <merge-sha>...<tip-sha>` reproduces pre-S18 state.

**Single-commit revert safety:** Commit 1's `usage` event yield is in a guarded branch (`if (usage) yield ...`) — reversion removes the yields without affecting token/result events; existing `apps/api/src/agents/*Agent.test.ts` still pass without the usage events. The eval-pipeline cost section is opt-in (`renderCostSection` is only called from one place); reversion removes the call cleanly. The `AgentEvent` union reversion removes the `usage` variant — existing consumers compile (they never matched on `usage`).

---

## Definition of done

1. PR merged (or branch ready for merge pending user review).
2. Commit 0 ships: 5 staging artifacts committed (`prd-s18.md`, `s18-clinician-engagement.md`, `prd-production-smart-scope.md`, 2 post-S17 eval reports). No code/test impact.
3. Commit 1 ships: `usage.ts` + `pricing.ts` + tests + 4-agent yield-injection + eval-pipeline cost aggregation + regenerated `docs/eval-report.{md,json,cost.json}`. 12 new TDD tests pass. P7 lifts 3→4.
4. **Conditional:** WSB commit follows per `prd-s18.md D5` if WSA's eval-regen shows v3 didn't fix the FP pattern. WSB commit is OUT of this slice's DoD but is named in `prd-s18.md` for traceability.
5. **Conditional:** clinician engagement response — tracked in `data/eval/clinician-outreach.json` per `s18-clinician-engagement.md §4`. Engagement is on the clinician's clock; this slice's DoD does not gate on a response. P6 movement is +0.25 (attempted) by WSC's email-send action alone.
6. `verification-s18.md` ships with the 5-row verification matrix evidence + the recovery paragraph (if quota was exhausted mid-WSA).
7. `review-s18.md` ships with the Standards + Spec axes.
8. Post-S18 HL7 evaluation re-run captured at `reports/HL7-Challenge-Evaluation.2026-07-09-post-s18.md`.

---

## Open follow-ups (deferred — NOT in this slice)

1. **WSB (rubric v4 Anchor D)** — `prd-s18.md D5`. If WSA's eval-regen shows v3's 4 dev-labeled FPs persist + 5 held-out FPs persist, a separate commit lands in `riskAgent.ts:100-200` adding Rule 3 ("Anchor D: missing-data state for labs") + Examples 6 & 7. Outside WSA's DoD.
2. **WSC engagement response** — `s18-clinician-engagement.md §3`. If a clinician responds positively, a follow-up PR applies their `clinicianOverride` data via the existing `npm run review:apply` path. The P6 movement accrues at the time of `clinicianOverride` application, not at the time of email send.
3. **Per-agent model tier routing (Risk on `gpt-5.5-mini`, ActionPlanner on `gpt-5.5`)** — S19 per `prd-s18.md §"Further Notes"`. Requires WSA's cost data + a separate eval proving the cheaper tier preserves the rubric.
4. **Held-out label expansion to 50+ patients with 15+ negative Care Gap examples** — S19. Blocked on clinician engagement landing (the negatives require clinician judgment, not procedural-generation tweaks).
5. **SMART enforcement empirical verification** — S19 as part of eval-expansion. A single `curl http://localhost:8080/fhir/Patient/...` with no Authorization header → expect 401; documents whether the `hapi.fhir.security.oauth.enable_jwt_validation: "true"` env-var actually enforces.
6. **MODEL_CARD.md authoring** — S20+. Depends on (a) stable rubric (post-WSB or post-v3-if-skipped), (b) cost story (post-WSA), (c) clinician validation (post-WSC). Not before all three.
7. **S18-lite Safety Officer / 6th agent node / Black Box replay / Sterile Cockpit Mode / Tiered Confidence UI** — explicitly deferred per the prior planning turn's "What to skip" call. These are demo-positioning, not rubric-movers. A post-challenge slice can pick them up if rubric is closer to 90+.

---

## Files this slice modifies (summary)

**New (2 — Commit 1):**
- `apps/api/src/agents/usage.ts` — pure `extractUsage` + `accumulateUsage` + `UsageRecord` type
- `apps/api/src/agents/pricing.ts` — `RATE_TABLE` const + `computeCostUsd` pure function

**New (2 — Commit 1 tests):**
- `apps/api/src/agents/usage.test.ts` — 4 TDD pins
- `apps/api/src/agents/pricing.test.ts` — 3 TDD pins

**New (3 — Commit 0 docs):**
- `docs/plans/caresync-ai/prd-s18.md` (already written this session)
- `docs/plans/caresync-ai/s18-clinician-engagement.md` (already written this session)
- `docs/plans/caresync-ai/prd-production-smart-scope.md` (S17 PRD, was untracked, committed retroactively)

**New (2 — Commit 0 existing workspace artifacts):**
- `reports/HL7-Challenge-Evaluation.2026-07-09-post-s17-full.md` (untracked → committed)
- `reports/HL7-Challenge-Evaluation.2026-07-09-post-s17.md` (untracked → committed)

**New (2 — Phase J post-merge evidence):**
- `docs/plans/caresync-ai/verification-s18.md`
- `docs/plans/caresync-ai/review-s18.md`

**Modified (3 — Commit 1):**
- `apps/api/src/agents/agent.ts` — `AgentEvent` union gains `usage` variant (~5 lines)
- `apps/api/src/agents/{risk,careGap,sdoh,actionPlanner}Agent.ts` — yield `usage` event in `response.completed` branch (4 files, 4-6 lines each)
- `apps/api/src/scripts/eval.ts` — cost aggregation helpers + `docs/eval-report-cost.json` emission + `## Cost per analysis` markdown rendering (3 functions inline, ~80 lines)

**Modified (1 — Commit 1 tests):**
- `apps/api/src/scripts/eval.test.ts` — 3 new TDD pins (per-patient aggregation, multi-patient aggregation, null-handling)

**Regenerated (1 — Commit 1):**
- `docs/eval-report.md` + `docs/eval-report.json` + `docs/eval-report-cost.json` — output of the WSA eval regen

**Not modified (intentionally):**
- `apps/api/src/routes/analysis.ts` — downstream SSE consumer switches on `token` + `result` only; `usage` events fall through silently. Adding the variant requires NO consumer change. Verified by reading `analysis.ts:305-320` — the switch's `else if (event.type === 'token')` + the `// event.type === 'result'` comment indicate two non-overlapping branches; `usage` falls through as expected.
- `apps/api/src/scripts/eval.ts:123` — `if (event.type !== 'result') continue;` already skips non-`result` events. `usage` events are silently skipped here, but the new `onUsage` handler (Phase E2) is the bridge that captures them into the `usages` map.
- `apps/api/src/agents/confidenceScorer.ts` — S17's `clampRiskLevel` stands unchanged. WSA is orthogonal.
- `apps/api/src/agents/riskAgent.ts`'s `buildPrompt` body — unchanged. WSB (out of scope) touches this if the eval-regen shows v3 didn't fix the FP pattern.
- `apps/api/src/fhir-data/*`, `apps/api/src/eval/{labelFromBundle,varianceProbe,computeMetrics,errorAnalysis}.ts` — unchanged.
- `data/eval/labels.json` + `data/eval/clinician-outreach.json` — unchanged in WSA. WSC's outreach-log update writes to `clinician-outreach.json` per `s18-clinician-engagement.md §4` after the email is sent (a Commit 0 follow-on, not part of this slice's code).
- All `MOCK_*_OUTPUT` fallbacks — untouched per `never-override-real-with-fake.md`. WSA's `extractUsage` correctly handles the case where the SDK never returns a `response.completed` event (which is what the `MOCK_*` fallback bypasses — the mock events go through `streamMockRisk`'s own yield, never touching `response.completed`).
- `apps/api/package.json` — no new scripts. The eval regen uses the existing `npx tsx src/scripts/eval.ts` invocation.
- `apps/web/**` — no frontend changes. Cost is a backend artifact (eval-report sidecar + markdown section). A future slice can add a frontend cost display via the existing `subscribeToEvents` SSE relay; out of scope for WSA.

---

## ADLC compliance notes

- **PRD exists → implementation plan exists → review.md and verification.md will exist.** This plan follows the `prd-s16.md` → `implementation-plan-s16.md` → `verification-s16.md` + `review-s16.md` chain. WSA's `prd-s18.md` is committed in Commit 0; the implementation plan is this file; verification + review will follow in Phase J.
- **Ponytail pass applied:** minimum new seams (2 modules, 1 union variant, 4 small agent edits, 1 eval-pipeline edit). No flag in `eval.ts`. No model registry / factory. No agent hot-path change beyond yielding one extra event in an existing branch.
- **TDD where applicable:** `usage.ts` (4 tests) + `pricing.ts` (3 tests) + `eval.ts` cost aggregation (3 tests) + render integration (2 tests). All written before the implementation (RED → GREEN discipline).
- **Real-LLM tests:** the eval regen in Phase G is the integration test for the full pipeline (AgentEvent union + agent yields + eval aggregation + sidecar emission). It runs the real LLM, same as the S16 2x2 gate pattern.
- **No fabricated data:** `extractUsage` returns `null` for missing `.usage` (not `$0.00`); pricing rates are published (not invented); the eval-report Cost section renders `—` for null cells; per `never-override-real-with-fake.md`.
