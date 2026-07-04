---
name: backend-using-git-worktrees
description: Use when setting up isolated work for backend/domain tasks with Bitcot domain handoff notes before `superpowers:using-git-worktrees`
---

# Backend Using Git Worktrees

Backend wrapper for `superpowers:using-git-worktrees`.

## Original Bitcot Delta

This preserves the Bitcot behavior that was originally added directly to `superpowers:using-git-worktrees`:

- include Bitcot project/domain handoff notes when creating isolated work;
- apply Bitcot manual worktree fallback rules: smart directory selection, `.gitignore` safety, setup auto-detection, and clean baseline tests;
- keep branch/workspace setup aware of domain docs, API/DB conventions, ADRs, and unresolved backend blockers;
- record optional GitNexus/index status or other runtime notes that affect isolated work.

Use this wrapper **with** `superpowers:using-git-worktrees`: Bitcot adds backend workspace handoff context; `superpowers:using-git-worktrees` still owns isolated workspace mechanics.

## Backend Workspace Notes

For backend/API/DB/domain worktrees, include these notes in the handoff:

- whether `CONTEXT.md` and `docs/domain/*` exist;
- which API/DB pattern docs are relevant;
- which `docs/adr/*.md` decisions affect the branch;
- unresolved domain questions that should block implementation.

If this is a combined-install environment, use `superpowers:using-git-worktrees` for worktree mechanics and keep Bitcot workspace policy in commands/docs.

If manual git worktree fallback is needed, preserve the Bitcot selection order:

1. use `.worktrees/` when it exists;
2. otherwise use `worktrees/` when it exists;
3. otherwise check project instructions for a worktree directory preference;
4. otherwise ask before creating a new worktree location.

For project-local directories, verify they are ignored before creating worktrees. Auto-detect project setup commands from files such as `package.json`, `pyproject.toml`, and `go.mod`, then run baseline tests before reporting ready.

## Handoff

Invoke or continue with `superpowers:using-git-worktrees` for isolation setup and baseline verification.
