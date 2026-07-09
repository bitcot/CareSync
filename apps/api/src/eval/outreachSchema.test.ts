/**
 * S15 Commit 4 — TDD scaffolding for `outreachSchema.ts`.
 *
 * Pin the schema for `data/eval/clinician-outreach.json` so the I/O
 * script (`scripts/outreach-validate.ts`) and the eval-report renderer
 * (`scripts/eval.ts:renderMarkdown`'s Outreach section) both trust the
 * same validator's verdict. Pure function — no I/O, no LLM.
 *
 * Schema summary (mirror of `prd-s15.md` D7 + D8):
 *   {
 *     _meta: { purpose, lastUpdated, consentBoundary },    // required, all strings
 *     invitations: [                                       // required, may be empty
 *       { reviewer, sentAt, channel, status, labelsAffected }
 *     ]
 *   }
 *   channel ∈ { email, in-person, slack, phone }
 *   status  ∈ { sent, returned, declined, no-response }
 *   labelsAffected: integer >= 0
 */

import { validateOutreach } from './outreachSchema';

// --- Fixture builders ------------------------------------------------------
// Inline objects — the validator is pure, so it doesn't need real files.
// These shapes mirror the documented JSON shape verbatim.

function validFixture() {
  return {
    _meta: {
      purpose: 'Tracks clinician review invitations.',
      lastUpdated: '2026-07-08',
      consentBoundary: 'By adding a `reviewer` entry, the committer affirms consent.',
    },
    invitations: [
      {
        reviewer: 'Dr. M. Smith',
        sentAt: '2026-07-08',
        channel: 'email',
        status: 'sent',
        labelsAffected: 0,
      },
    ],
  };
}

// --- Tests -----------------------------------------------------------------

describe('validateOutreach', () => {
  it('returns { ok: true } for a well-formed outreach JSON (meta + 1 valid invitation)', () => {
    const result = validateOutreach(validFixture());
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false, errors } when an invitation is missing a required field (sentAt)', () => {
    const fixture = validFixture();
    // drop sentAt from invitations[0]
    const { sentAt: _drop, ...withoutSentAt } = fixture.invitations[0];
    fixture.invitations[0] = withoutSentAt as typeof fixture.invitations[0];

    const result = validateOutreach(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) return; // narrow for type-narrowing
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    // path-qualified: the error must name invitations[0].sentAt
    expect(result.errors.some((e) => /invitations\[0\]\.sentAt/.test(e))).toBe(true);
  });

  it('returns { ok: false, errors } when channel is not in the enum', () => {
    const fixture = validFixture();
    fixture.invitations[0] = { ...fixture.invitations[0], channel: 'carrier-pigeon' };

    const result = validateOutreach(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    // path-qualified: must name invitations[0].channel AND enumerate the valid options
    expect(result.errors.some((e) => /invitations\[0\]\.channel/.test(e))).toBe(true);
    expect(
      result.errors.some((e) => /email.*in-person.*slack.*phone/.test(e))
    ).toBe(true);
  });

  it('returns { ok: true } when invitations is an empty array (but _meta is present)', () => {
    const fixture = {
      _meta: {
        purpose: 'Tracks clinician review invitations.',
        lastUpdated: '2026-07-08',
        consentBoundary: 'By adding a `reviewer` entry, the committer affirms consent.',
      },
      invitations: [] as unknown[],
    };

    const result = validateOutreach(fixture);
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false, errors } when the top-level _meta is absent', () => {
    const fixture = {
      invitations: [
        {
          reviewer: 'Dr. M. Smith',
          sentAt: '2026-07-08',
          channel: 'email',
          status: 'sent',
          labelsAffected: 0,
        },
      ],
    };

    const result = validateOutreach(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    // the error must mention _meta
    expect(result.errors.some((e) => /_meta/.test(e))).toBe(true);
  });
});
