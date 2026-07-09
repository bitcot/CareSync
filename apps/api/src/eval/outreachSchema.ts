/**
 * S15 Commit 4 — pure schema validator for
 * `data/eval/clinician-outreach.json`. The single source of truth for the
 * JSON shape; both `scripts/outreach-validate.ts` (the I/O script) and
 * `scripts/eval.ts:renderMarkdown` (the eval-report renderer) trust its
 * verdict and surface the error list inline.
 *
 * No external schema library — matches the project's "no schema library"
 * convention used in `scripts/apply-clinician-review.ts` and elsewhere.
 * Pure function: no I/O, no LLM, no global state, deterministic.
 *
 * Errors are path-qualified so the eval-report and the I/O script can point
 * a committer straight at the offending field, e.g.
 *   "invitations[0].channel: must be one of email, in-person, slack, phone"
 */

export const CHANNEL_VALUES = ['email', 'in-person', 'slack', 'phone'] as const;
export type OutreachChannel = (typeof CHANNEL_VALUES)[number];

export const STATUS_VALUES = ['sent', 'returned', 'declined', 'no-response'] as const;
export type OutreachStatus = (typeof STATUS_VALUES)[number];

export type OutreachValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

interface OutreachInvitation {
  reviewer: string;
  sentAt: string;
  channel: OutreachChannel;
  status: OutreachStatus;
  labelsAffected: number;
}

interface OutreachMeta {
  purpose: string;
  lastUpdated: string;
  consentBoundary: string;
}

interface OutreachFile {
  _meta: OutreachMeta;
  invitations: OutreachInvitation[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isChannel(value: unknown): value is OutreachChannel {
  return typeof value === 'string' && (CHANNEL_VALUES as readonly string[]).includes(value);
}

function isStatus(value: unknown): value is OutreachStatus {
  return typeof value === 'string' && (STATUS_VALUES as readonly string[]).includes(value);
}

function validateMeta(meta: unknown, errors: string[]): void {
  if (meta === undefined) {
    errors.push('_meta: required (must declare purpose, lastUpdated, consentBoundary)');
    return;
  }
  if (!isPlainObject(meta)) {
    errors.push('_meta: must be an object');
    return;
  }
  for (const field of ['purpose', 'lastUpdated', 'consentBoundary'] as const) {
    if (!isString(meta[field])) {
      errors.push(`_meta.${field}: must be a string`);
    }
  }
}

function validateInvitation(
  inv: unknown,
  index: number,
  errors: string[],
): void {
  const prefix = `invitations[${index}]`;
  if (!isPlainObject(inv)) {
    errors.push(`${prefix}: must be an object`);
    return;
  }
  if (!isString(inv.reviewer)) {
    errors.push(`${prefix}.reviewer: must be a string`);
  }
  if (!isString(inv.sentAt)) {
    errors.push(`${prefix}.sentAt: must be a string`);
  }
  if (!isChannel(inv.channel)) {
    errors.push(
      `${prefix}.channel: must be one of ${CHANNEL_VALUES.join(', ')}`,
    );
  }
  if (!isStatus(inv.status)) {
    errors.push(
      `${prefix}.status: must be one of ${STATUS_VALUES.join(', ')}`,
    );
  }
  if (!isNonNegativeInteger(inv.labelsAffected)) {
    errors.push(`${prefix}.labelsAffected: must be a non-negative integer`);
  }
}

function validateInvitations(
  invitations: unknown,
  errors: string[],
): void {
  if (!Array.isArray(invitations)) {
    errors.push('invitations: must be an array');
    return;
  }
  for (let i = 0; i < invitations.length; i++) {
    validateInvitation(invitations[i], i, errors);
  }
}

/**
 * Validate the parsed JSON contents of `data/eval/clinician-outreach.json`.
 * Returns `{ ok: true }` on success; `{ ok: false, errors: string[] }`
 * otherwise (errors are path-qualified so callers can render them as
 * actionable feedback to the committer).
 *
 * Pure: does not read or write the filesystem, does not call the LLM, does
 * not mutate any inputs. The caller is responsible for `JSON.parse` and
 * for handling the file-missing case (`fs.existsSync` → caller prints
 * "Outreach log not yet started" and exits 0).
 */
export function validateOutreach(json: unknown): OutreachValidationResult {
  if (!isPlainObject(json)) {
    return { ok: false, errors: ['root: must be a JSON object'] };
  }
  const errors: string[] = [];
  validateMeta(json._meta, errors);
  validateInvitations(json.invitations, errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

// Re-export the structurally-narrowed type so callers can `as OutreachFile`
// after a `{ ok: true }` verdict without re-defining the shape.
export type { OutreachFile, OutreachInvitation, OutreachMeta };
