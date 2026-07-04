# CareSync AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the thinnest end-to-end path that proves every layer connects — a Care Coordinator logs in, lands on their My Patient Panel, and reads a patient's data live from HAPI FHIR.

**Spec:** `prd.md` (S1 in `issues.md`); decisions in `plan.md` (GD1, GD3, GD5).

**Architecture:** npm-workspaces monorepo — `apps/web` (React + Vite + TS + Tailwind), `apps/api` (Express + TS). HAPI FHIR R4 in Docker is the data backbone; SQLite (better-sqlite3) holds users + audit. The API authenticates users with a role-carrying JWT and reads HAPI, enforcing role→FHIR-scope filtering. Real SMART Backend Services token exchange + HAPI interceptor is the last S1 task, so it hardens a working skeleton rather than blocking it.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind v3, React Router v6, TanStack Query · Node/Express, better-sqlite3, jsonwebtoken, bcrypt · HAPI FHIR R4 (Docker) · Synthea (S5) · Vitest, Jest + Supertest.

**Domain source note:** No `docs/domain/` or ADRs yet; vocabulary/rules from `prd.md`/`plan.md`/`HANDOFF.md`. Generate formal domain docs before spec-heavy later slices.

---

## Iteration 1 — S1 Walking Skeleton — 2026-07-04

**Spec:** `prd.md` · **Slice:** S1 · **User stories:** 17, 33, 34, 36
**Ponytail pass applied:** cut work that only later slices consume; keep the skeleton minimal and truthful.

### Phase A — Scaffold & infrastructure

- [ ] **A1. Monorepo scaffold.** npm workspaces `apps/web` (Vite+React+TS+Tailwind) and `apps/api` (Express+TS). ESLint/Prettier; Vitest (web), Jest+Supertest (api).
  - *skipped:* `packages/types` (inline types per app until something is genuinely shared — ~S2 agent contracts); Playwright config (S12).
  - *Verify:* `npm run build && npm run lint` green.

- [ ] **A2. Docker HAPI FHIR R4.** `docker-compose.yml` with a healthcheck on `/fhir/metadata`. The import script (A3) retries until healthy.
  - *skipped:* standalone wait-for-hapi helper (compose healthcheck + import retry cover it).

- [ ] **A3. Import the hero + panel patients (GD3).** Hand-author the Maria Chen R4 bundle (HbA1c 8.9%, BNP 340, eGFR 52, K+ 3.4; E11.9/I50.9/F33.1; AHC-HRSN positive; 48h post-CHF-discharge; risk 87) plus ~5 patients for the Coordinator's panel. Bulk-import via `POST /$batch`.
  - *skipped:* 500-patient Synthea generation → **S5** (the population dashboard is its only consumer; generating it now is slow and unused).
  - *Verify:* Maria is fetchable by a stable id with her exact Observations.

### Phase B — Backend core (test-first)

- [ ] **B1. SQLite schema.** `users` (id, email, bcrypt hash, name, role) + `audit_log` (id, ts, actor, action, fhir_resource, outcome). Idempotent migrate at boot.
  - *skipped:* `sessions` table — JWT is stateless; add only if token revocation is needed.

- [ ] **B2. Seed demo accounts.** Three roles (`director@`/`coordinator@`/`socialworker@caresync.demo`, `Demo1234!`), bcrypt, role set. Idempotent.
  - *Domain rule:* role provisioned at creation, never user-selectable (GD5 / PRD D4).

- [ ] **B3. Auth + role middleware (TDD).** `POST /api/auth/login` → bcrypt verify → JWT `{id,name,role}`. Middleware rejects missing/invalid tokens, exposes `req.role`.
  - *skipped:* `GET /auth/me` — the client decodes role from the JWT payload; add when server-verified identity is actually needed.
  - *Test (Supertest):* valid login → decodable JWT with role; bad password → 401; protected route without token → 401.

- [ ] **B4. Role→FHIR-scope enforcement (API-side).** Map each role to allowed FHIR resource domains; the read service (B5) denies out-of-scope reads. This is the *real denial behavior* (Social Worker cannot read non-SDOH resources).
  - *Domain rule:* every call scoped to the role's FHIR permissions (GD5).

- [ ] **B5. FHIR read service + routes (audit in one place).** A single HAPI-client wrapper performs every read and writes one `audit_log` row per call — all callers route through it, so audit is never retrofitted. Methods: `getPatient(id)`, `getConditions(id)`, `getAssignedPanel(coordinatorId)`. Routes: `GET /api/patients/:id`, `GET /api/patients/assigned` (role-scoped list with risk score + task count).
  - *Domain terms:* Patient, Condition (FHIR R4); "assigned panel" = Coordinator's patients (story 17).
  - *Test (Supertest vs test HAPI):* Coordinator reads Maria's conditions; Social Worker token denied non-SDOH reads; each read writes an audit row.

- [ ] **B6. SMART Backend Services + HAPI enforcement (GD5 — sequenced last).** Mint a signed JWT client assertion → exchange for an access token (cached to expiry) → `Authorization: Bearer` on all HAPI calls; configure HAPI's authorization interceptor to require + validate the token so the standard is load-bearing (G1).
  - *ponytail:* runs after the skeleton is green so it hardens a working path, not blocks it. **If it slips, record in `plan.md` §3 that SMART is API-side scoping only until this lands — do not claim SMART while HAPI is open.**
  - *Test:* assertion/token unit test; integration test shows a HAPI call carrying a validated Bearer token.

### Phase C — Frontend foundation

- [ ] **C1. Web foundation + design tokens.** Tailwind config with CareSync tokens (HANDOFF §4 — bg/surface/agent colors/text scale, mono for FHIR IDs). App shell: 48px header, dark clinical layout, SVG icons (no emoji).

- [ ] **C2. Routing + auth + API client + login (W01).** React Router v6 role-guarded routes; TanStack Query client injecting the auth header; login screen posting to `/auth/login`; role→home redirect (Coordinator → W12). Token in `localStorage` behind a small `useAuth` hook.
  - *skipped:* Zustand — `localStorage` + `useAuth` covers auth state; add a store when shared client state exceeds auth.
  - *Domain rule:* home screen derived from role, not user-chosen (GD5).
  - *Test (Vitest):* guard redirects unauthenticated users; role→home mapping correct.

- [ ] **C3. W12 My Patient Panel (Coordinator landing).** Fetch `/patients/assigned`; render assigned patients with risk score + task count; click → patient detail. *Story 17.*

- [ ] **C4. Patient detail (minimal).** `GET /api/patients/:id` → name + active conditions. The drill-in target and S2/S3 host screen (W03), minimal here.
  - *Verify:* opening Maria shows her name + conditions from a real HAPI read (Network tab).

### Phase D — Seam verification

- [ ] **D1. API-boundary suite green (Seam 1).** Consolidate B3/B5 tests into the reference Supertest suite vs a disposable test HAPI + seeded data. Template for all later slices.
  - *Verify:* `npm run test:api` green.

- [ ] **D2. End-to-end smoke.** Clean: `docker compose up` → migrate → seed → import → `npm run dev` → log in as Coordinator → My Patient Panel → open Maria → conditions live. Confirm Social Worker scope denial.
  - *Verify:* all S1 acceptance criteria in `issues.md` satisfied.

### Rollback / safety
- All state in the disposable HAPI container + local SQLite. `docker compose down -v` + delete SQLite = full reset. No external systems, no real PHI.

### Definition of done (S1)
A–D green, `npm run test:api` passing, D2 smoke passes end-to-end. If B6 trails, the SMART honest-staging note is recorded in `plan.md` §3.
