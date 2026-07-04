---
name: backend-finishing-a-development-branch
description: Use before finishing backend/domain/spec-sensitive branches with Bitcot spec drift, changelog, domain, and release checks, then hand off to `superpowers:finishing-a-development-branch`
---

# Backend Finishing A Development Branch

Backend wrapper for `superpowers:finishing-a-development-branch`.

## Original Bitcot Delta

This preserves the Bitcot behavior that was originally added directly to `superpowers:finishing-a-development-branch`:

- run backend/spec completion checks before branch finishing;
- require spec-drift checks for spec-driven work;
- verify implementation, tests, specs, docs, API/DB conventions, and ADRs agree;
- update domain docs when new terms, rules, lifecycle states, API conventions, or DB conventions were introduced;
- generate or update changelog material for user-visible or release-relevant changes.
- include domain context and open domain risks in the finish summary.

Use this wrapper **with** `superpowers:finishing-a-development-branch`: Bitcot proves backend/spec readiness first; `superpowers:finishing-a-development-branch` still owns merge/PR/cleanup decisions.

## Backend Completion Checks

Before handing off to `superpowers:finishing-a-development-branch`:

1. Run project tests and read the output.
2. For spec-driven work, run `spec-drift-check`.
3. For backend/API/DB/domain work, verify code, tests, specs, and docs agree with:
   - `CONTEXT.md`
   - `docs/domain/README.md`
   - `docs/domain/api-patterns.md`
   - `docs/domain/db-patterns.md`
   - relevant `docs/adr/*.md`
4. If the change introduced new domain terms, rules, lifecycle states, API conventions, or DB conventions, ensure docs were updated.
5. Generate or update changelog material with `writing-changelog` when the branch is user-visible or release-relevant.

Use the original Bitcot completion order before `superpowers:finishing-a-development-branch` mechanics:

1. tests pass;
2. `spec-drift-check` passes, is not applicable, or user explicitly overrides;
3. changelog is created under `docs/superpowers/specs/<branch-name>/YYYY-MM-DD-changelog.md` when relevant;
4. domain/API/DB docs are updated or intentionally unchanged;
5. then present `superpowers:finishing-a-development-branch` options.

Do not present a branch as ready if implementation behavior conflicts with documented domain rules.

## Handoff

After Bitcot checks pass or documented user override exists, invoke or continue with `superpowers:finishing-a-development-branch`.

## Next step

This is the terminal pipeline stage — the PR is open / the branch is merged. To pass context to the next agent or teammate, run the `handoff` skill. That completes the ADLC flow.
