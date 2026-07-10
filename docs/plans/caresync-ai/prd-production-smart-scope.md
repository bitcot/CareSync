# PRD — Production SMART Scope Enforcement (Open Question 8)

> **PLAN_ID:** `caresync-ai` · **Slice:** S17 (production SMART) · **Status:** Draft
> **Author:** Manjula / Bitcot · 2026-07-09
> **Upstream artifacts:** `verification-s14.md §6 #2` (production SMART handoff), `reports/HL7-Challenge-Evaluation.2026-07-08.md` Open Question 8, `docker-compose.yml:25-26` (HAPI config), `apps/api/src/middleware/smartAuth.ts` (app-tier guard), `apps/api/src/smart/tokenServer.ts` (in-process AS), `apps/api/src/auth/scopes.ts` (role→domain mapping).

---

## Problem Statement

The HL7 AI Challenge evaluation (Open Question 8, P1) identifies that the HAPI SMART configuration trusts **any token signed by the configured public key** — it validates the signature but does not enforce per-actor scopes. The current architecture has three gaps that make it POC-correct but not production-shaped for multi-actor SMART:

### Gap 1 — Single-actor token issuance

The in-process token server (`apps/api/src/smart/tokenServer.ts`) mints all access tokens with the same HS256 `serverSecret` and a single `client_id` (`caresync-api`). There is no concept of "who is this token for" — the token carries `client_id` and `scope` but no `sub` (subject) for the human actor, no `launch` context, and no per-actor scope narrowing. A director and a social worker hitting the token endpoint get tokens with identical claims (modulo the `scope` string the caller passes, which is self-attested — the server doesn't validate that the requester is entitled to the scopes they ask for).

### Gap 2 — HAPI validates signatures, not scopes

`docker-compose.yml:25-26` configures the stock `hapiproject/hapi:v7.2.0` image with:

```yaml
hapi.fhir.security.oauth.enable_jwt_validation: "true"
hapi.fhir.security.oauth.public_key_location: file:/keys/smart-public.pem
```

This makes HAPI's `OAuthAuthorizationServletFilter` verify that an incoming bearer token was signed by the configured RSA key — but the stock image's filter does **not** introspect the `scope` claim or enforce per-resource-type scope restrictions. Any token with a valid signature passes, regardless of whether it carries `patient/*.read` or `system/*.*`. The app-tier `smartAuth.ts` middleware is the only thing enforcing scopes, and it can be bypassed by hitting HAPI directly on port 8080.

### Gap 3 — App-tier scope config is method-level, not route-level

`apps/api/src/index.ts:85-90` configures `requiredScopesByMethod` as a broad map (GET → any read scope, POST → any write scope). This means a social worker with `patient/*.read` can read clinical resources via the API even though `auth/scopes.ts` says their role only has `demographic` + `sdoh` domains. The `hasScope()` check in `fhir/client.ts:guard()` catches this at the service layer, but the SMART middleware itself doesn't distinguish — it's a coarse method-level gate, not a resource-domain-level gate.

---

## Solution

Three layers, each independently deployable. Layer 1 is infrastructure (no app code changes). Layer 2 is the HAPI rebuild. Layer 3 is app-tier code changes. The POC can continue to run with the current setup; each layer hardens the boundary progressively.

### Layer 1 — Replace in-process token server with Keycloak SMART AS

**Goal:** Issue per-actor tokens with server-validated scopes, not self-attested ones.

**What changes:**

- Stand up a Keycloak instance (Docker) with the [SMART on FHIR Keycloak plugin](https://github.com/konikoniatar/smart-on-fhir-keycloak) or the [Linux4Health SMART module](https://github.com/LinuxForHealth/smart-on-fhir).
- Register three OAuth2 clients, one per actor role:
  - `caresync-director` — scopes: `system/*.read system/*.write` (all domains)
  - `caresync-coordinator` — scopes: `system/*.read system/*.write` (all domains, same as director in this POC — the distinction is enforced at the app tier via `DirectorOnlyError`)
  - `caresync-social-worker` — scopes: `patient/*.read patient/*.write` restricted to SDOH + demographic resource types
- Each client gets its own RSA keypair registered with Keycloak out-of-band.
- The app's login flow (`routes/auth.ts`) exchanges the CareSync session JWT for a SMART access token by performing a token exchange (RFC 8693) or a new `client_credentials` grant using the actor's client, passing the actor's identity as `sub`.
- The in-process `tokenServer.ts` is removed. `tokenClient.ts` is updated to hit the Keycloak token endpoint instead of `http://localhost:PORT/smart/token`.

**What stays the same:**

- `smartAuth.ts` middleware — it already validates JWT signature + `exp` + `aud` + `scope`. The only change is the verification key: instead of `serverSecret` (HS256), it uses Keycloak's public key (RS256). The `SmartAuthMiddlewareOptions.serverSecret` field is replaced with `jwksUrl` or `publicKey` for RS256 verification.
- `assertion.ts` — still mints RFC 7523 JWT assertions, just against Keycloak's token endpoint URL.

**Keycloak docker-compose addition:**

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    ports:
      - "8443:8443"
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      KC_HOSTNAME: localhost
    command: ["start-dev", "--https-certificate-file=/certs/tls.crt", "--https-certificate-key-file=/certs/tls.key"]
    volumes:
      - keycloak-data:/opt/keycloak/data
      - ./keycloak/certs:/certs:ro
      - ./keycloak/smart-provider:/opt/keycloak/providers/smart:ro
```

**Token claims (production shape):**

```json
{
  "sub": "user-uuid-from-keycloak",
  "client_id": "caresync-social-worker",
  "scope": "patient/*.read",
  "aud": "http://localhost:8080/fhir",
  "iss": "https://localhost:8443/realms/caresync",
  "exp": 1719000000,
  "iat": 1718996400,
  "fhirUser": "Practitioner/practitioner-uuid",
  "smart_style_url": "https://localhost:8443/smart-style.json"
}
```

### Layer 2 — Rebuild HAPI from hapi-fhir-jpaserver-starter (Option A)

**Goal:** HAPI enforces per-scope access at the FHIR resource boundary, not just signature validation.

**Why Option A (rebuild) over Option B (reverse proxy):**

- The `hapi-fhir-jpaserver-starter` project ships with a properly wired `OAuthAuthorizationServletFilter` that reads the `scope` claim from the bearer token and enforces it against the requested FHIR resource type and interaction (read/write). A reverse proxy would need to replicate this logic externally — reinventing the scope-to-resource mapping that HAPI already knows about internally.
- The starter project also gives us a real database (PostgreSQL instead of H2 in-memory), solving follow-up #3 from `verification-s14.md` (data persistence across container restarts).
- The starter project is a Maven build, so we can customize the `OAuthAuthorizationServletFilter` config in `application.yaml` rather than relying on env-var discovery against the stock image.

**What changes:**

1. Clone `hapiproject/hapi-fhir-jpaserver-starter` and add a Dockerfile:

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:resolve
COPY src ./src
RUN mvn package -DskipTests

FROM eclipse-temurin:21-jre
COPY --from=build /app/target/hapi-fhir-jpaserver.war /app/hapi-fhir-jpaserver.war
EXPOSE 8080
CMD ["java", "-jar", "/app/hapi-fhir-jpaserver.war", "--server.port=8080"]
```

2. Configure `application.yaml` for SMART scope enforcement:

```yaml
hapi:
  fhir:
    fhir_version: R4
    default_encoding: json
    allow_external_references: true
    narrative_enabled: false
    subscription:
      resthook_enabled: true
    security:
      oauth:
        enabled: true
        # Keycloak JWKS endpoint — HAPI fetches signing keys at runtime
        jwks_url: https://keycloak:8443/realms/caresync/protocol/openid-connect/certs
        # Enforce scopes: token must carry scopes matching the FHIR interaction
        enforce_scopes: true
        # Map SMART scopes to FHIR resource types
        scope_mappings:
          "patient/*.read":
            - "Patient:read"
            - "Observation:read"
            - "Condition:read"
            - "Task:read"
          "patient/*.write":
            - "Task:write"
            - "CarePlan:write"
          "system/*.read":
            - "*:read"
          "system/*.write":
            - "*:write"
```

3. Update `docker-compose.yml`:

```yaml
services:
  hapi-fhir:
    build:
      context: ./hapi-fhir-jpaserver-starter
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://hapi-db:5432/hapi
      SPRING_DATASOURCE_USERNAME: hapi
      SPRING_DATASOURCE_PASSWORD: ${HAPI_DB_PASSWORD}
    depends_on:
      - hapi-db
      - keycloak
    volumes:
      - ./hapi-fhir-jpaserver-starter/src/main/resources/application.yaml:/app/application.yaml:ro

  hapi-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: hapi
      POSTGRES_USER: hapi
      POSTGRES_PASSWORD: ${HAPI_DB_PASSWORD}
    volumes:
      - hapi-db-data:/var/lib/postgresql/data

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    # ... (see Layer 1)

volumes:
  hapi-db-data:
  keycloak-data:
```

4. Remove the old `smart-public.pem` bind-mount and the `hapi.fhir.security.oauth.public_key_location` env var — HAPI now fetches signing keys from Keycloak's JWKS endpoint at runtime, supporting key rotation.

**What this closes:**

- A social worker's token carrying only `patient/*.read` is rejected by HAPI if they try to write a CarePlan.
- A token with a valid signature but no `scope` claim is rejected (no more "any signed token passes").
- Key rotation works — when Keycloak rotates its signing key, HAPI picks up the new key from JWKS without a container restart.
- HAPI data persists across restarts (PostgreSQL instead of H2 in-memory).

### Layer 3 — App-tier scope enforcement to resource-domain level

**Goal:** The `smartAuth.ts` middleware enforces per-route, per-domain scopes that map to the actor's role — not just coarse method-level read/write.

**What changes:**

#### 3a. Define SMART scope → role → domain mapping

New file `apps/api/src/auth/smartScopes.ts`:

```typescript
import { Role } from './jwt';
import { ResourceDomain } from './scopes';

export type SmartScope = string;

export const ROLE_SMART_SCOPES: Record<Role, SmartScope[]> = {
  director: [
    'system/Patient.read',
    'system/Observation.read',
    'system/Condition.read',
    'system/Task.read',
    'system/Task.write',
    'system/CarePlan.read',
    'system/CarePlan.write',
  ],
  coordinator: [
    'patient/Patient.read',
    'patient/Observation.read',
    'patient/Condition.read',
    'patient/Task.read',
    'patient/Task.write',
  ],
  social_worker: [
    'patient/Patient.read',
    'patient/Observation.read',
    'patient/Task.read',
    'patient/Task.write',
  ],
};

export const DOMAIN_SMART_SCOPES: Record<ResourceDomain, SmartScope[]> = {
  demographic: ['patient/Patient.read', 'system/Patient.read'],
  clinical: ['patient/Observation.read', 'patient/Condition.read', 'system/Observation.read', 'system/Condition.read'],
  sdoh: ['patient/Observation.read', 'system/Observation.read'],
};
```

This replaces the current `auth/scopes.ts` `ROLE_SCOPES` map (which uses abstract `ResourceDomain` enums) with concrete SMART scope strings that HAPI's filter can also enforce.

#### 3b. Update `smartAuth.ts` to verify RS256 tokens from Keycloak

The middleware changes from HS256 (`serverSecret`) to RS256 (JWKS):

```typescript
export interface SmartAuthMiddlewareOptions {
  jwksUrl: string;          // Keycloak JWKS endpoint
  issuer: string;            // Keycloak realm issuer
  audience: string;          // HAPI FHIR base URL
  requiredScopesByRoute?: Record<string, string[]>;  // route pattern → required scopes
  clockToleranceSeconds?: number;
}
```

The `verifyAccessToken` call is replaced with `jwt.verify(token, jwksClient.getKey, { algorithms: ['RS256'], issuer, audience })`.

#### 3c. Route-level scope requirements in `index.ts`

Replace the current method-level map with route-level requirements:

```typescript
const smartAuth = createSmartAuthMiddleware({
  jwksUrl: process.env.SMART_JWKS_URL!,
  issuer: process.env.SMART_ISSUER!,
  audience: process.env.FHIR_BASE_URL!,
  requiredScopesByRoute: {
    'GET /api/patients/:id': ['patient/Patient.read', 'system/Patient.read'],
    'POST /api/patients/:id/analysis': ['patient/Observation.read', 'patient/Condition.read'],
    'GET /api/population/scatter': ['system/*.read'],
    'POST /api/tasks/:id/transition': ['patient/Task.write', 'system/Task.write'],
    'POST /api/care-plans/:patientId': ['system/CarePlan.write'],
    // ... etc for every route
  },
});
```

#### 3d. Unify login JWT + SMART token

Per `verification-s14.md §6 #8`: `requireAuth` should learn to accept SMART-shape tokens. In production, the login flow mints a SMART token (via Keycloak token exchange), so there is only one token shape. The `if (req.auth) return next()` pass-through in `smartAuth.ts:115-118` is removed — both `requireAuth` and `smartAuth` validate the same RS256 token, with `requireAuth` extracting the actor identity (`sub`, `fhirUser`) and `smartAuth` enforcing scopes.

---

## User Stories

1. As a **security reviewer**, I want HAPI to reject any token whose `scope` claim doesn't cover the requested FHIR interaction, so that a social worker's read-only token cannot write resources even if they bypass the app tier and hit HAPI directly.
2. As a **security reviewer**, I want the SMART authorization server to validate that the requesting client is entitled to the scopes it asks for, so that a social worker client cannot self-attest `system/*.write` in the token request.
3. As a **director**, I want my SMART token to carry `system/*.read` and `system/*.write` scopes, so that I can access all FHIR resource types across all patients.
4. As a **social worker**, I want my SMART token to carry only `patient/*.read` for SDOH-related resources, so that I cannot accidentally read clinical observations outside my scope of practice.
5. As a **developer**, I want the `smartAuth` middleware to enforce route-level scope requirements (not just method-level), so that the API tier scope gate matches the domain-level gate already enforced in `fhir/client.ts:guard()`.
6. As a **DevOps engineer**, I want HAPI to fetch signing keys from Keycloak's JWKS endpoint at runtime, so that key rotation doesn't require a container restart or PEM file re-deploy.
7. As a **DevOps engineer**, I want HAPI to use PostgreSQL instead of H2 in-memory, so that FHIR resources persist across container restarts without re-importing.
8. As a **HL7 challenge evaluator**, I want the production SMART handoff to be documented with a curl test showing per-scope rejection (not just per-signature), so that Open Question 8 is closed with evidence.

---

## Architecture Diagram (text)

```
                    ┌─────────────┐
                    │  Keycloak   │
                    │  (SMART AS) │
                    │  :8443      │
                    └──────┬──────┘
                           │ JWKS
                    ┌──────▼──────┐
                    │    HAPI     │
                    │  (rebuilt   │
                    │   starter)  │     ┌──────────┐
                    │  :8080      │◄────│PostgreSQL│
                    │  scope      │     └──────────┘
                    │  enforcement│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  CareSync   │
                    │  API (Node) │
                    │  smartAuth  │
                    │  middleware │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Web Client │
                    │  (React)    │
                    └─────────────┘

Token flow:
  1. User logs in → CareSync auth route → Keycloak token exchange
  2. Client receives SMART access token (RS256, per-actor scopes)
  3. Client sends token to CareSync API → smartAuth validates RS256 + scopes
  4. CareSync API forwards token to HAPI → HAPI validates RS256 + enforces scopes
  5. Both layers reject if scopes insufficient — defense in depth
```

---

## Implementation Phases

### Phase 1 — Keycloak setup (infrastructure only, no app changes)

- [ ] Add Keycloak service to `docker-compose.yml`
- [ ] Configure realm `caresync` with 3 clients (`caresync-director`, `caresync-coordinator`, `caresync-social-worker`)
- [ ] Install SMART on FHIR provider plugin
- [ ] Generate and register RSA keypairs for each client
- [ ] Configure scope mappings per client
- [ ] Verify: `curl` token endpoint with each client → token has correct scopes

### Phase 2 — HAPI rebuild (infrastructure, replaces stock image)

- [ ] Clone `hapi-fhir-jpaserver-starter`, add Dockerfile
- [ ] Configure `application.yaml` with OAuth scope enforcement
- [ ] Add PostgreSQL service to `docker-compose.yml`
- [ ] Point HAPI's JWKS URL at Keycloak
- [ ] Remove old `smart-public.pem` bind-mount and env vars
- [ ] Verify: curl HAPI with (a) no token → 401, (b) valid token + insufficient scope → 403, (c) valid token + sufficient scope → 200
- [ ] Verify: `docker compose down && up` → FHIR resources persist

### Phase 3 — App-tier changes (code)

- [ ] Create `apps/api/src/auth/smartScopes.ts` (role → SMART scope mapping)
- [ ] Update `smartAuth.ts`: HS256 → RS256 via JWKS, method-level → route-level scopes
- [ ] Update `tokenClient.ts`: hit Keycloak token endpoint instead of in-process server
- [ ] Remove `tokenServer.ts` (in-process AS retired)
- [ ] Update `requireAuth` to accept SMART-shape RS256 tokens (unify token shape)
- [ ] Remove `if (req.auth) return next()` pass-through in `smartAuth.ts`
- [ ] Update `index.ts` with route-level `requiredScopesByRoute` map
- [ ] Update `.env.example` with `SMART_JWKS_URL`, `SMART_ISSUER`, `SMART_AUDIENCE`
- [ ] Update all tests in `smartAuth.test.ts` to use RS256 tokens from a test Keycloak mock
- [ ] Verify: all 281+ existing tests pass, new scope-rejection tests pass

### Phase 4 — Verification

- [ ] End-to-end curl test: social worker token → HAPI write → 403
- [ ] End-to-end curl test: director token → HAPI write → 200
- [ ] End-to-end curl test: expired token → 401
- [ ] End-to-end curl test: wrong-issuer token → 401
- [ ] `npm run eval` — no regression in agent metrics
- [ ] Document in `verification-s17.md` with the curl evidence

---

## Migration Path (POC → Production)

| Aspect | POC (current) | Production (target) |
|--------|---------------|---------------------|
| Token signing | HS256 shared secret | RS256 via Keycloak JWKS |
| Token issuance | In-process `tokenServer.ts` | Keycloak SMART AS |
| Client identity | Single `caresync-api` client | Per-role clients (3) |
| Scope validation | Self-attested in token request | Server-validated per client registration |
| HAPI enforcement | Signature only | Signature + scope (rebuilt starter) |
| HAPI database | H2 in-memory | PostgreSQL (persistent) |
| App-tier scope gate | Method-level (GET/POST) | Route-level (per endpoint) |
| Token shape | Two shapes (login JWT + SMART) | One shape (SMART RS256) |
| Key rotation | Manual PEM file re-deploy | Automatic via JWKS endpoint |

---

## Risks & Mitigations

1. **Keycloak SMART plugin maturity** — the konikoniatar fork is community-maintained. Mitigation: if it proves unstable, fall back to Auth0 or Okta with SMART scopes configured via their admin API. The app-tier and HAPI-tier changes are AS-agnostic — they only need a JWKS endpoint and standard OAuth2 token response.

2. **HAPI starter build complexity** — the Maven build adds ~2 min to `docker compose up`. Mitigation: pre-build the WAR in CI and use a multi-stage Dockerfile with a cached layer. The starter project is actively maintained by the HAPI team.

3. **Token shape unification breaks login flow** — merging login JWT + SMART token means the React client must handle the new token exchange. Mitigation: Phase 3 can be split — first deploy RS256 verification in `smartAuth.ts` while keeping the login JWT separate, then unify in a follow-up commit. The `if (req.auth) return next()` pass-through stays until the unification commit.

4. **Scope mapping drift between app and HAPI** — if `smartScopes.ts` and HAPI's `application.yaml` scope mappings diverge, one layer becomes stricter than the other. Mitigation: generate both from a single source-of-truth YAML or JSON config file that both the Node app and the HAPI starter read at boot.

5. **PostgreSQL migration for HAPI** — existing H2 data is lost on switch. Mitigation: re-import via `npm run import` (already the documented workaround). The seed data is deterministic and re-import takes ~47s per `verification-s14.md`.

---

## Out of Scope

- **SMART `launch`/`standalone-launch` flow** — the POC uses `client_credentials` (backend-to-backend). Adding the patient-facing `launch` flow (EHR launch context) is a separate concern for when CareSync is embedded in an EHR iframe.
- **SMART Backend Services for HAPI's own REST admin endpoints** — HAPI's admin API (server config, subscription management) is not exposed in the POC and doesn't need SMART gating.
- **Token introspection (RFC 7662)** — HAPI's `OAuthAuthorizationServletFilter` validates tokens locally via JWKS. Adding an introspection endpoint is only needed if tokens become opaque (reference tokens), which Keycloak's SMART plugin doesn't do by default.
- **Mutual TLS between services** — the Docker network is trusted in the POC. Production deployment behind a real network boundary should add mTLS between Keycloak, HAPI, and the Node API, but that's a deployment concern, not a code concern.
