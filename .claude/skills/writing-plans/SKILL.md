---
name: backend-writing-plans
description: Use when planning backend, API, DB, auth, permissions, domain, audit, integration, reporting, or product-behavior implementation before `superpowers:writing-plans`
---

# Backend Writing Plans

Backend wrapper for `superpowers:writing-plans`. Prepare backend/domain context first, then hand off to `superpowers:writing-plans` for generic task-by-task implementation planning.

Do not duplicate the full `superpowers:writing-plans` template here.

## Original Bitcot Delta

This preserves the Bitcot behavior that was originally added directly to `superpowers:writing-plans`:

- load backend domain docs, API/DB conventions, and ADRs before planning;
- block planning when domain docs or expected behavior are missing;
- use a feature folder containing paired `design.md` and `implementation.md` files under `docs/superpowers/specs/<feature-name>/`;
- keep `implementation.md` as a rolling document with dated iteration sections;
- mirror the current executable checklist to `tasks/todo.md` so lifecycle hooks can enforce approval and completion;
- use optional GitNexus, claude-mem, Context7, and context-mode findings to choose create-vs-modify tasks safely;
- make final tasks cite domain rules, lifecycle states, API conventions, DB conventions, and ADRs.
- save plan metadata to claude-mem after planning when available.

Use this wrapper **with** `superpowers:writing-plans`: Bitcot prepares the backend evidence and target path; `superpowers:writing-plans` still writes the detailed task-by-task implementation plan.

## Required Context

Load local domain knowledge before planning non-trivial backend work:

1. `CONTEXT.md`
2. `docs/domain/README.md`
3. `docs/domain/api-patterns.md` for API work
4. `docs/domain/db-patterns.md` for DB work
5. relevant `docs/adr/*.md`

If domain docs are missing, block planning and run `domain-knowledge-setup`. If docs exist but behavior is unclear, block planning and run `backend-domain-grill`.

Also confirm implementation planning is happening from an isolated feature branch/worktree. If on `main`, warn that implementation plans should be created from a feature branch.

## Feature-Aware Spec Folder

Prefer the Bitcot feature folder layout:

```text
docs/superpowers/specs/<feature-name>/
  design.md
  implementation.md
```

Plan storage has two required outputs:

```text
TargetFile: docs/superpowers/specs/<feature-name>/implementation.md
ActivePlan: tasks/todo.md
```

`TargetFile` is the durable Bitcot implementation plan stored beside `design.md`. `ActivePlan` is the current execution checklist used by hooks and approval gates. The same tasks must be represented in both places: full plan context in `implementation.md`, concise checkable execution list in `tasks/todo.md`.

Use the feature name from the active design/spec folder when present. If no feature name exists, derive a short kebab-case name from the requested backend capability and confirm it with the user before writing final files.

`design.md` is the approved product/technical design the plan implements. If it is missing, create or normalize it from the approved brainstorm/spec/design artifact before writing implementation tasks. If there is no approved design yet, stop and run `backend-brainstorming` followed by `superpowers:brainstorming`.

`implementation.md` is the implementation plan. If it exists, append a new dated iteration section. If it does not exist, create iteration 1.

`tasks/todo.md` is the active lifecycle plan. Write or replace the current task section with checkboxes, acceptance criteria, test commands, verification checkpoints, and rollback notes extracted from `implementation.md`. Do not add `## Approved: yes`; only the user may approve the plan.

When handing off to `superpowers:writing-plans`, explicitly override the default save path. `superpowers:writing-plans` should write the plan content into this feature folder's `implementation.md`, not `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`.

MUST NOT report the plan complete until:

1. `docs/superpowers/specs/<feature-name>/implementation.md` exists and contains the full plan.
2. `tasks/todo.md` exists and contains the active checkable task list.
3. No new generic dated plan remains the only saved copy.

If the generic handoff writes to `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`, immediately normalize the content into `TargetFile` and `ActivePlan` before presenting completion.

Use this first-iteration header shape:

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Spec:** `design.md`

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]
```

Use this append shape for later iterations:

```markdown
---

## Iteration N - YYYY-MM-DD

**Spec:** `design.md`
```

After the plan is complete, offer the execution choices from `superpowers:writing-plans`, but name the Bitcot path:

```text
Plan complete and saved to `docs/superpowers/specs/<feature-name>/implementation.md`; active checklist written to `tasks/todo.md`. Two execution options after user approval:
```

If claude-mem is available, save `PlanPatterns_{project_name}` with feature name, task count, tech stack, task decomposition pattern, and file-structure decisions.

## Optional Intelligence

Use `skills/shared-conventions.md` for optional dependency detection.

When available and enabled:

- **GitNexus:** find existing modules, symbols, callers, and execution flows before deciding create vs modify.
- **claude-mem:** search `PlanPatterns_{project_name}` for prior task structures, pitfalls, and stack decisions.
- **Context7:** verify current library APIs, imports, and configuration patterns for libraries named in the plan.
- **context-mode:** rely on sandboxed tool output when scanning large codebases.

Gracefully degrade to file reads, `rg`, and git diffs when optional dependencies are absent or declined.

## Planning Preparation Checklist

Before handing off to `superpowers:writing-plans`, produce this context:

- feature name;
- target feature folder;
- `design.md` status and source artifact;
- `implementation.md` status: new iteration or append iteration;
- `tasks/todo.md` status: created or updated, without self-approval;
- loaded domain docs and ADRs;
- API conventions that apply;
- DB conventions that apply;
- permission, tenancy, audit, lifecycle, reporting, and integration rules that affect implementation;
- existing files/modules/symbols likely to be modified;
- new files/modules likely to be created;
- GitNexus status and key findings, if used;
- claude-mem prior patterns, if used;
- Context7 library findings, if used;
- blockers, if any.

## Handoff

After preparation, invoke or continue with `superpowers:writing-plans` and provide the planning context above.

Each affected task in the final implementation plan should cite the relevant domain term, business rule, lifecycle state, API convention, DB convention, or ADR.

## Next step

Once `implementation-plan.md` exists, simplify it before implementing — strip speculative work, prefer the laziest solution that holds.

To proceed, run the `ponytail` skill against the plan, then move on to `subagent-driven-development` to implement it.
