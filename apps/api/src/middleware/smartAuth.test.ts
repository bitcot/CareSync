import express from 'express';
import { AddressInfo } from 'net';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { generateKeyPair, KeyPair } from '../smart/keys';
import { createTokenServer, verifyAccessToken } from '../smart/tokenServer';
import { SmartTokenClient } from '../smart/tokenClient';
import { createSmartAuthMiddleware, smartAuthErrorHandler } from './smartAuth';

// Default server secret exported by tokenServer — keep in sync with the
// token server used in setupTestEnv so signed tokens verify against the
// same HS256 key the middleware checks.
const DEFAULT_SERVER_SECRET = 'caresync-dev-authz-server-secret-do-not-use-in-production';

interface TestEnv {
  server: Server;
  tokenEndpoint: string;
  keys: KeyPair;
  /** Express app with the smartAuth middleware mounted + error handler. */
  buildApp(mwOptions?: Parameters<typeof createSmartAuthMiddleware>[0]): express.Express;
  /** Mint an access token via the in-process token server. */
  mintToken(scope?: string): Promise<string>;
  /** Mint an HS256 JWT directly with the middleware's server secret. */
  signDirect(payload: jwt.JwtPayload): string;
}

async function setupTestEnv(): Promise<TestEnv> {
  const keys = generateKeyPair();
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  const tokenEndpoint = `http://localhost:${port}/smart/token`;
  app.use('/smart', createTokenServer({ clientId: 'caresync-api', tokenEndpoint, clientPublicKey: keys.publicKey }));

  return {
    server,
    tokenEndpoint,
    keys,
    buildApp(mwOptions = { serverSecret: DEFAULT_SERVER_SECRET }) {
      const a = express();
      a.get('/test', createSmartAuthMiddleware(mwOptions), (_req, res) => res.json({ ok: true }));
      a.post('/test', createSmartAuthMiddleware(mwOptions), (_req, res) => res.json({ ok: true }));
      // 404 fallthrough so we don't accidentally serve the default Express HTML
      // error page on a non-SMART middleware error.
      a.use(smartAuthErrorHandler);
      return a;
    },
    async mintToken(scope?: string): Promise<string> {
      const client = new SmartTokenClient({
        clientId: 'caresync-api',
        tokenEndpoint,
        privateKey: keys.privateKey,
        ...(scope ? { scope } : {}),
      });
      return client.getAccessToken();
    },
    signDirect(payload: jwt.JwtPayload): string {
      return jwt.sign(payload, DEFAULT_SERVER_SECRET, { algorithm: 'HS256', noTimestamp: true });
    },
  };
}

describe('createSmartAuthMiddleware', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await setupTestEnv();
  });

  afterEach(async () => {
    await new Promise((resolve) => env.server.close(resolve));
  });

  it('a real access token verifies and the route handler runs (200)', async () => {
    const token = await env.mintToken('system/*.read');
    // Sanity: the token is signed with the same HS256 secret the middleware
    // verifies against (verifies via the same `verifyAccessToken` helper the
    // token server exposes — single source of truth for the sign/verify key).
    expect(verifyAccessToken(token)).toMatchObject({ scope: 'system/*.read' });

    const res = await request(env.buildApp()).get('/test').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('a missing Authorization header is rejected with 401 missing_token', async () => {
    const res = await request(env.buildApp()).get('/test');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'smart_auth_failed', reason: 'missing_token' });
  });

  it('a tampered token (flipped byte) is rejected with 401 invalid_signature', async () => {
    // Build a real token, then flip a byte in the signature segment (last of
    // the three dot-separated base64url parts). Signature now no longer
    // matches what was signed by the token server — middleware must report
    // `invalid_signature` (not `malformed_token`, since the structure is fine).
    const token = await env.mintToken('system/*.read');
    const parts = token.split('.');
    // Flip a single character in the signature; signatures use base64url
    // alphabet — 'A' is always a valid alternative to any letter in it.
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    const tampered = parts.join('.');

    const res = await request(env.buildApp()).get('/test').set('Authorization', `Bearer ${tampered}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'smart_auth_failed', reason: 'invalid_signature' });
  });

  it('an expired token is rejected with 401 token_expired', async () => {
    // Mint directly with `exp` already in the past (token server only mints
    // fresh tokens with its 5-minute TTL). Signed with the same secret the
    // middleware verifies against so signature passes and only the expiry
    // gate fails — that's the exact reason code we want to assert.
    const expired = env.signDirect({
      sub: 'caresync-api',
      client_id: 'caresync-api',
      scope: 'system/*.read',
      exp: Math.floor(Date.now() / 1000) - 60,
      iat: Math.floor(Date.now() / 1000) - 120,
    });

    const res = await request(env.buildApp()).get('/test').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'smart_auth_failed', reason: 'token_expired' });
  });

  it('a token without the required scope for the route method is rejected with 403 insufficient_scope', async () => {
    // Token carries only read scope; the configured rule for POST requires
    // `patient/*.write`. Signature and exp pass — only the scope gate fails,
    // so the response is 403 (not 401) per the spec'd reason codes.
    const token = await env.mintToken('patient/*.read');
    const app = env.buildApp({
      serverSecret: DEFAULT_SERVER_SECRET,
      requiredScopesByMethod: { POST: ['patient/*.write'] },
    });

    const res = await request(app).post('/test').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'smart_auth_failed', reason: 'insufficient_scope' });
  });
});
