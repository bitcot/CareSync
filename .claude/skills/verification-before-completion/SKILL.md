---
name: backend-verification-before-completion
description: Use before claiming backend/domain/spec-sensitive work is complete with Bitcot domain verification, then hand off to `superpowers:verification-before-completion`
---

# Backend Verification Before Completion

Backend wrapper for `superpowers:verification-before-completion`.

## Original Bitcot Delta

This preserves the Bitcot behavior that was originally added directly to `superpowers:verification-before-completion`:

- verify backend/API/DB/domain claims against domain docs, specs, ADRs, tests, and implementation;
- require spec-drift checks when design/spec artifacts exist;
- require backend/spec-sensitive review before completion;
- ensure new domain terms, lifecycle states, API conventions, DB conventions, and audit requirements are documented.
- read command/test output before claiming success; do not treat domain checks as a substitute for proof from `superpowers:verification-before-completion`.

Use this wrapper **with** `superpowers:verification-before-completion`: Bitcot defines backend evidence requirements; `superpowers:verification-before-completion` still requires proof before any completion claim.

## Backend Verification

Before claiming backend/API/DB/auth/permissions/tenancy/audit/product-behavior work is complete:

1. Verify implementation, tests, specs, and docs agree with domain docs and ADRs.
2. Confirm new domain terms, business rules, lifecycle states, API conventions, DB conventions, and audit requirements were documented.
3. Run `spec-drift-check` when a spec/design exists.
4. Run `backend-code-review` for backend/spec-sensitive review.
5. Then run `superpowers:verification-before-completion` and cite the exact command output proving success.

## Handoff

Invoke or continue with `superpowers:verification-before-completion` and prove claims with command output.

## Next step

Once `verification.md` is committed under `docs/plans/{PLAN_ID}/` with command output proving the change works, review the diff along the Standards and Spec axes.

To proceed, run the `code-review` skill.
