import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../smart/tokenServer';

/**
 * S14 Commit 4 — SMART-on-FHIR enforcement at the app tier (developer guard
 * that gives a structured 401/403 in front of HAPI's binary accept/reject).
 *
 * IMPORTANT: this middleware verifies the SMART **access token**, which the
 * in-process token server in `apps/api/src/smart/tokenServer.ts` issues as
 * an HS256 JWT signed with `serverSecret` (NOT the client's RSA keypair).
 * Verification therefore uses `verifyAccessToken(token, serverSecret)` —
 * passing the client's RSA public key here would fail every legitimate
 * token the app's own token server mints. The RSA public key file at
 * `apps/api/src/smart/keys/smart-public.pem` is for HAPI's separate
 * OAuthAuthorizationServletFilter config; it does not apply to this
 * middleware. See verification-s14.md §A and the commit body for the
 * full rationale + the production handoff (point HAPI at a real SMART AS).
 */
export type SmartAuthReason =
  | 'missing_token'
  | 'malformed_token'
  | 'invalid_signature'
  | 'token_expired'
  | 'wrong_audience'
  | 'insufficient_scope';

export class SmartAuthError extends Error {
  constructor(public statusCode: number, public reason: SmartAuthReason) {
    super(`SMART auth failed: ${reason}`);
    this.name = 'SmartAuthError';
  }
}

export interface SmartAuthClaims {
  sub?: string;
  scope?: string;
  exp?: number;
  client_id?: string;
}

export interface SmartAuthMiddlewareOptions {
  /**
   * HS256 secret the in-process token server signs access tokens with. The
   * existing `tokenServer.ts` default ('caresync-dev-authz-server-secret-do-not-use-in-production')
   * is the production value for this POC; tests should pass the same literal
   * so the verify-side matches the sign-side exactly.
   */
  serverSecret: string;
  /**
   * If set, the `aud` claim on the access token must match. The token server
   * does not currently set `aud` on its issued access tokens (only on the
   * client_assertion it verifies), so audience enforcement is opt-in — wire
   * it up only when the token server starts emitting `aud`.
   */
  audience?: string;
  /**
   * Required scopes keyed by HTTP method. A method absent from the map
   * (or a method present with an empty array) is not scope-gated. Token
   * scope is space-delimited (RFC 6749 §3.3); every required scope must
   * appear in the granted set as a whole-token match. Wildcards like
   * `patient/*.read` are NOT expanded by this middleware — callers must
   * enumerate the exact scopes the route needs.
   */
  requiredScopesByMethod?: Record<string, string[]>;
  /**
   * Clock tolerance (seconds) for the `exp` check (default 30). Mirrors
   * jsonwebtoken's own option so a slightly skewed client clock doesn't
   * trip a fresh token. The token server's own ACCESS_TOKEN_TTL is 300s,
   * so 30s is a conservative margin.
   */
  clockToleranceSeconds?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      smartAuth?: SmartAuthClaims;
    }
  }
}

function scopeGrantsRequired(granted: string | undefined, required: string[]): boolean {
  if (required.length === 0) return true;
  if (!granted) return false;
  const grantedSet = new Set(granted.split(/\s+/).filter(Boolean));
  return required.every((s) => grantedSet.has(s));
}

/**
 * Express middleware factory. Reads the `Authorization: Bearer <jwt>` header,
 * verifies the JWT against `serverSecret` (HS256), and gates `exp`/`aud`/
 * scope. On success attaches `req.smartAuth = { sub, scope, exp, client_id }`
 * and calls `next()` with no argument. On any failure calls `next(new
 * SmartAuthError(...))` with a stable `reason` code; the matching
 * `smartAuthErrorHandler` translates that to a JSON `{ error, reason }`
 * response. The `reason` enum is the only thing a client should branch on
 * — the human-readable `error` string is for logs.
 */
export function createSmartAuthMiddleware(options: SmartAuthMiddlewareOptions) {
  const { serverSecret, audience, requiredScopesByMethod, clockToleranceSeconds = 30 } = options;

  return function smartAuth(req: Request, _res: Response, next: NextFunction): void {
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      next(new SmartAuthError(401, 'missing_token'));
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      next(new SmartAuthError(401, 'missing_token'));
      return;
    }

    // Structure check FIRST so a nonsense-but-Bearer-prefixed header is
    // reported as `malformed_token` (a client error about shape) rather than
    // `invalid_signature` (a server-side signature mismatch). The HS256
    // verify below will catch any other tampering.
    const decodedUnverified = jwt.decode(token);
    if (!decodedUnverified || typeof decodedUnverified !== 'object') {
      next(new SmartAuthError(401, 'malformed_token'));
      return;
    }

    let claims: jwt.JwtPayload;
    try {
      claims = verifyAccessToken(token, serverSecret) as jwt.JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        next(new SmartAuthError(401, 'token_expired'));
        return;
      }
      // Covers JsonWebTokenError + everything else (bad signature, bad
      // algorithm, malformed payload, audience mismatch if it were set on
      // verify, ...). For this POC every non-expiry verify failure surfaces
      // as `invalid_signature` — keeps the reason space small and matches
      // what most clients need to do (re-mint + retry).
      next(new SmartAuthError(401, 'invalid_signature'));
      return;
    }

    if (audience !== undefined) {
      // jwt.verify in `verifyAccessToken` doesn't enforce audience today;
      // do the check here so a misconfigured audience surfaces as
      // `wrong_audience` (a 401, distinct from the 403 scope gate).
      const aud = claims.aud;
      const audMatches = Array.isArray(aud) ? aud.includes(audience) : aud === audience;
      if (!audMatches) {
        next(new SmartAuthError(401, 'wrong_audience'));
        return;
      }
    }

    // `exp` second-line check: the verify-side enforces it with the
    // configured clock tolerance. If a token's exp is in the past at
    // verify time, TokenExpiredError already fired above; this guard
    // exists as a belt-and-suspenders defense in case clockTolerance is
    // set generously and a request arrives between the boundary and the
    // tolerance window.
    if (typeof claims.exp === 'number' && Date.now() / 1000 - clockToleranceSeconds >= claims.exp) {
      next(new SmartAuthError(401, 'token_expired'));
      return;
    }

    const required = requiredScopesByMethod?.[req.method] ?? [];
    if (!scopeGrantsRequired(claims.scope as string | undefined, required)) {
      next(new SmartAuthError(403, 'insufficient_scope'));
      return;
    }

    req.smartAuth = {
      sub: claims.sub as string | undefined,
      scope: claims.scope as string | undefined,
      exp: claims.exp as number | undefined,
      client_id: claims.client_id as string | undefined,
    };
    next();
  };
}

/**
 * Express error handler for the smartAuth middleware. Translates
 * `SmartAuthError` instances into the documented JSON response shape
 * (`{ error: 'smart_auth_failed', reason }`); passes every other error
 * through to the next error handler so it can be logged / handled by the
 * project's general 500 fallback (see index.ts). MUST be mounted after
 * the smartAuth middleware (Express runs error handlers in mount order,
 * so putting this before any route that uses smartAuth is correct).
 */
export function smartAuthErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof SmartAuthError) {
    res.status(err.statusCode).json({ error: 'smart_auth_failed', reason: err.reason });
    return;
  }
  next(err);
}
