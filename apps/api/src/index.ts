import './env'; // load .env before riskAgent.ts constructs `new OpenAI()`
import express from 'express';
import cors from 'cors';
import { getDb } from './db';
import { createAuthRouter } from './routes/auth';
import { createPatientsRouter } from './routes/patients';
import { createAnalysisRouter } from './routes/analysis';
import { createPopulationRouter } from './routes/population';
import { createGovernanceRouter } from './routes/governance';
import { createQualityRouter } from './routes/quality';
import { createTeamRouter } from './routes/team';
import { createTasksRouter } from './routes/tasks';
import { createSdohRouter } from './routes/sdoh';
import { createCarePlansRouter } from './routes/carePlans';
import { createAlertsRouter } from './routes/alerts';
import { createEventsRouter, createSubscriptionWebhookRouter } from './routes/events';
import { createEventHub } from './routes/eventHub';
import { createCdsHooksRouter } from './routes/cdsHooks';
import { ensureTaskSubscription } from './fhir/subscription';
import { orchestrate } from './agents/orchestrator';
import { FhirReadService } from './fhir/client';
import { generateKeyPair } from './smart/keys';
import { createTokenServer } from './smart/tokenServer';
import { SmartTokenClient } from './smart/tokenClient';
import { createSmartAuthMiddleware, smartAuthErrorHandler } from './middleware/smartAuth';

const FHIR_BASE_URL = process.env.FHIR_BASE_URL ?? 'http://localhost:8080/fhir';
const PORT = process.env.PORT ?? 4000;
const SMART_CLIENT_ID = 'caresync-api';
const SMART_TOKEN_ENDPOINT = process.env.SMART_TOKEN_ENDPOINT ?? `http://localhost:${PORT}/smart/token`;
// S6 A2 — must be reachable from *inside* the HAPI container, not the host;
// `host.docker.internal` is Docker Desktop's route back to the host.
const SUBSCRIPTION_CALLBACK_URL =
  process.env.SUBSCRIPTION_CALLBACK_URL ?? `http://host.docker.internal:${PORT}/api/fhir/subscription-hook`;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// S12 A.1 — global error handler. Must be LAST in the middleware chain (after
// all routes), so any uncaught throw that escapes a route handler hits this.
// Mirrors the lead project's index.ts:75-78 shape; guarantees a consistent
// JSON `{error}` envelope on otherwise-unhandled failures so clients never see
// Express's default HTML error page.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  const db = getDb();

  // SMART Backend Services (B6): the client's keypair is generated at boot
  // and registered in-process with the token server below — see
  // src/smart/keys.ts for why there's no separate registration step in
  // this POC. See plan.md §3 for the honest-staging note: HAPI itself does
  // not yet require/validate this token (the stock hapiproject/hapi image
  // ships no shell to configure a bearer-token interceptor into); the
  // token is minted, exchanged, cached, and attached to every HAPI call.
  const { publicKey, privateKey } = generateKeyPair();
  app.use('/smart', createTokenServer({ clientId: SMART_CLIENT_ID, tokenEndpoint: SMART_TOKEN_ENDPOINT, clientPublicKey: publicKey }));
  const tokenClient = new SmartTokenClient({ clientId: SMART_CLIENT_ID, tokenEndpoint: SMART_TOKEN_ENDPOINT, privateKey });

  // S14 Commit 4 (A) — SMART-on-FHIR enforcement at the app tier. Mounts on
  // every HAPI-touching route so a missing/tampered/expired/out-of-scope
  // bearer token surfaces a structured 401/403 here in addition to whatever
  // HAPI does (B — docker-compose.yml + smart-public.pem bind-mount).
  // KEEPS `requireAuth` (the login tier) on each route: the developer guard
  // validates the SMART access-token claim shape, the login guard validates
  // the CareSync session. Either one failing = 401/403. The error handler
  // is mounted after the routes so it catches any `SmartAuthError` thrown
  // out of the middleware above. NOT mounted on /api/auth, /api/health,
  // /api/events (login shouldn't need a SMART token, health checks
  // shouldn't auth, CDS Hooks is auth-less by spec, the events relay is
  // the client SSE stream gated on requireAuth, and the HAPI webhook
  // target is HAPI's own server-to-server callback).
  const smartAuth = createSmartAuthMiddleware({
    serverSecret: process.env.SMART_SERVER_SECRET ?? 'caresync-dev-authz-server-secret-do-not-use-in-production',
    audience: process.env.SMART_AUDIENCE,
    requiredScopesByMethod: {
      GET: ['system/*.read', 'patient/*.read', 'user/*.read'],
      POST: ['system/*.write', 'patient/*.write', 'user/*.write'],
      PUT: ['system/*.write', 'patient/*.write', 'user/*.write'],
      DELETE: ['system/*.write', 'patient/*.write', 'user/*.write'],
    },
  });

  const fhirService = new FhirReadService(db, FHIR_BASE_URL, tokenClient);
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/patients', smartAuth, createPatientsRouter(fhirService));
  // S2 — a second router on the same base path; the real runRiskAgent is the
  // default so no extra wiring is needed beyond mounting this route.
  // S4 A2 — `db` threads through so the route can read/write `analysis_cache`;
  // `orchestrate` is passed explicitly (not defaulted) since it now sits
  // before `db` in the parameter list.
  app.use('/api/patients', smartAuth, createAnalysisRouter(fhirService, orchestrate, db));
  // S5 A2 — Director-only population dashboard aggregates (W02).
  app.use('/api/population', smartAuth, createPopulationRouter(fhirService, db));
  // S8 A1-A3 — Director-only governance/audit dashboard aggregates (W06).
  app.use('/api/governance', smartAuth, createGovernanceRouter(fhirService, db));
  // S6 A1 — Director-scoped Task assignment.
  app.use('/api/tasks', smartAuth, createTasksRouter(fhirService));
  // S11 A1 — SDOH community resource directory + audited referral (M05).
  app.use('/api/sdoh', smartAuth, createSdohRouter(fhirService));
  // S12 C.2 — `POST /api/care-plans/:patientId` for the Care Plan Builder.
  app.use('/api/care-plans', smartAuth, createCarePlansRouter(fhirService));
  // S12 B.2 — clinical alerts derived from real FHIR risk profiles.
  app.use('/api/alerts', smartAuth, createAlertsRouter(fhirService, db));
  // S11 A2 — Director-only Quality/HEDIS measure aggregate (W05/W07).
  app.use('/api/quality', smartAuth, createQualityRouter(fhirService, db));
  // S11 A3 — Director-only team performance aggregate (W04).
  app.use('/api/team', smartAuth, createTeamRouter(fhirService, db));
  // S6 A3 — the client relay (`/api/events`) and HAPI's webhook target
  // (`/api/fhir/subscription-hook`) share one in-process hub instance.
  // Not SMART-gated: /api/events is the client SSE relay (gated on
  // requireAuth); /api/fhir is HAPI's own server-to-server webhook callback
  // (see events.ts note about the stock image having no bearer-token slot).
  const eventHub = createEventHub();
  app.use('/api/events', createEventsRouter(eventHub));
  app.use('/api/fhir', createSubscriptionWebhookRouter(eventHub));
  // S10 A1/A2 — CDS Hooks discovery + patient-view service. Different URL
  // namespace by spec (NOT under /api) and deliberately not auth'd — see
  // routes/cdsHooks.ts. S10 A2 reads the same `analysis_cache` table S4's
  // analysis.ts writes, via the already-available `db` instance.
  app.use('/cds-services', createCdsHooksRouter(db));

  // S14 Commit 4 (A) — SMART auth error handler. Mounted AFTER the routers
  // so any `SmartAuthError` thrown out of the middleware above is caught
  // here and translated to the documented JSON response shape. Non-SMART
  // errors fall through to the global 500 handler above (Express error
  // handlers in mount order, only SMART ones short-circuit).
  app.use(smartAuthErrorHandler);

  app.listen(PORT, () => {
    console.log(`API listening on :${PORT}`);
  });

  // S6 A2 — idempotent at every boot; non-fatal on failure (e.g. HAPI not
  // yet reachable, or rest-hook delivery unsupported in this environment) —
  // logged and the server still starts, per the plan's honest-staging note.
  ensureTaskSubscription(FHIR_BASE_URL, SUBSCRIPTION_CALLBACK_URL)
    .then((result) => {
      console.log(`FHIR Task Subscription ${result.created ? 'created' : 'already exists'}: ${result.id}`);
    })
    .catch((err) => {
      console.error('Could not ensure FHIR Task Subscription (continuing without live delivery):', err);
    });
}

export default app;
