---
name: backend-subagent-driven-development
description: Use when running subagent-driven development for backend/domain/spec-sensitive plans with Bitcot context enrichment before `superpowers:subagent-driven-development`
---

# Backend Subagent-Driven Development

Backend wrapper for `superpowers:subagent-driven-development`.

## Original Bitcot Delta

This preserves the Bitcot behavior that was originally added directly to `superpowers:subagent-driven-development` and its prompt templates:

- enrich implementer and reviewer prompts with domain docs, API/DB conventions, ADRs, specs, and implementation-plan references;
- include GitNexus affected callers, execution flows, and module context when available;
- use context-mode to make cheaper/smaller subagents viable when available;
- enforce backend TDD for code-changing implementer tasks;
- require backend review to include domain/spec correctness, not only task completion;
- route backend code-quality review through `backend-code-review`.
- preserve Bitcot prompt-template additions for implementer, spec reviewer, and code-quality reviewer agents.

Use this wrapper **with** `superpowers:subagent-driven-development`: Bitcot supplies backend-aware prompt context and review routing; `superpowers:subagent-driven-development` still owns subagent dispatch and the two-stage review loop.

## Backend Subagent Context

Before dispatching implementer or reviewer agents for backend/API/DB/domain work, prepare prompt context with:

- `CONTEXT.md`
- `docs/domain/README.md`
- `docs/domain/api-patterns.md` for API work
- `docs/domain/db-patterns.md` for DB work
- relevant `docs/adr/*.md`
- permission, tenancy, audit, lifecycle, reporting, and integration expectations
- spec and implementation-plan references

Use `skills/shared-conventions.md` for optional GitNexus/context-mode/claude-mem detection. When enabled, include affected callers, execution flows, and module context in implementer and reviewer prompts.

## Backend TDD Requirement

For every code-changing backend/API/DB/domain task, implementer subagents must use `backend-test-driven-development` and then `superpowers:test-driven-development`.

Implementer prompts must explicitly require the subagent to:

1. write the failing test first for the behavior being implemented;
2. run the test and report the expected failure;
3. write the minimum implementation needed to pass;
4. rerun the targeted test and any relevant regression suite;
5. include the red-green evidence in the final task report.

Do not mark a subagent task complete when it changes source code but lacks TDD evidence, unless the task is explicitly non-code, docs-only, config-only, or the user explicitly approved a TDD exception. If a subagent skipped TDD, send it back to add the failing test and prove the red-green cycle before spec review.

## Prompt Requirements

Implementer prompts must include a Domain Knowledge Context section, the Backend TDD Requirement above, and require `NEEDS_CONTEXT` instead of guessing when domain docs are missing or behavior is unclear.

Spec-reviewer prompts must verify domain language, lifecycle states, permissions, tenancy, audit behavior, API conventions, DB conventions, and TDD evidence by reading code and docs, not trusting the implementer report.

Code-quality reviewer prompts must use the backend review packet from `backend-code-review`, including `{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{DESCRIPTION}`, and the implementer's TDD evidence.

## Review Routing

- Spec review should check domain correctness, not only task text.
- Code quality review for backend work should use `backend-code-review` before `superpowers:requesting-code-review`.
- Review loops must reject code-changing tasks that skip the required TDD cycle.

## Handoff

Invoke or continue with `superpowers:subagent-driven-development` for the generic dispatch and two-stage review loop.

## Next step

This stage loads `tdd` (RED→GREEN) and uses `using-git-worktrees` as inline helpers that return here — they are not the pipeline successor. Once the code and tests are in place, prove the change end-to-end before claiming completion.

To proceed, run the `verification-before-completion` skill.
