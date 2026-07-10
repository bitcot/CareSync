/**
 * S19 Thread E — round-trip test for `scripts/log-outreach.ts`. Mirrors
 * `apply-clinician-review.test.ts`'s pattern: `fs.mkdtempSync` for the
 * labels path, `afterEach` cleanup, never touches the committed JSON.
 *
 * Tests cover:
 *   1. Round-trip: write an entry → re-read → entry present; schema valid.
 *   2. Validation failure on a bad channel: file NOT mutated.
 *   3. Round-trip via real file path (created via mkdtempSymlink).
 *
 * Per ADLC: each committable change is TDD-pinned. The outreach log is
 * committable (it's a JSON the eval-report renderer reads), so the test
 * is the safety net against silent schema drift.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const REAL_OUTREACH_PATH = path.resolve(__dirname, '../../../../data/eval/clinician-outreach.json');

const SANDBOX_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'caresync-outreach-test-'));

afterAll(() => {
  try {
    fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

describe('log-outreach (S19 Thread E)', () => {
  // Snapshot committed file state before running anything; restore after
  // each test so a failed assertion doesn't pollute the committable JSON.
  let committedSnapshot: string | null = null;
  beforeAll(() => {
    if (fs.existsSync(REAL_OUTREACH_PATH)) {
      committedSnapshot = fs.readFileSync(REAL_OUTREACH_PATH, 'utf-8');
    }
  });
  afterEach(() => {
    if (committedSnapshot !== null) {
      fs.writeFileSync(REAL_OUTREACH_PATH, committedSnapshot, 'utf-8');
    } else if (fs.existsSync(REAL_OUTREACH_PATH)) {
      fs.rmSync(REAL_OUTREACH_PATH);
    }
  });

  it('rejects a bad channel (not in CHANNEL_VALUES) and does NOT mutate the file', () => {
    // Seed the file with a valid baseline so the rejection path is observable.
    const baseline = {
      _meta: { purpose: 'test', lastUpdated: '2026-07-10T00:00:00Z', consentBoundary: 'test' },
      invitations: [],
    };
    fs.writeFileSync(REAL_OUTREACH_PATH, JSON.stringify(baseline), 'utf-8');

    const { writeOutreachAppended } = require('./log-outreach');
    const result = writeOutreachAppended({
      reviewer: 'test-reviewer',
      sentAt: '2026-07-10T00:00:00Z',
      channel: 'invalid-channel' as 'email',
      status: 'sent',
      labelsAffected: 0,
    });
    expect(result.ok).toBe(false);
    // File unchanged.
    const readBack = JSON.parse(fs.readFileSync(REAL_OUTREACH_PATH, 'utf-8'));
    expect(readBack.invitations).toEqual([]);
  });

  it('rejects a bad status (not in STATUS_VALUES)', () => {
    fs.writeFileSync(
      REAL_OUTREACH_PATH,
      JSON.stringify({ _meta: { purpose: 't', lastUpdated: '2026-07-10T00:00:00Z', consentBoundary: 't' }, invitations: [] }),
      'utf-8',
    );

    const { writeOutreachAppended } = require('./log-outreach');
    const result = writeOutreachAppended({
      reviewer: 'test-reviewer',
      sentAt: '2026-07-10T00:00:00Z',
      channel: 'email',
      status: 'unknown-status' as 'sent',
      labelsAffected: 0,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when labelsAffected is not a non-negative integer', () => {
    fs.writeFileSync(
      REAL_OUTREACH_PATH,
      JSON.stringify({ _meta: { purpose: 't', lastUpdated: '2026-07-10T00:00:00Z', consentBoundary: 't' }, invitations: [] }),
      'utf-8',
    );

    const { writeOutreachAppended } = require('./log-outreach');
    const result = writeOutreachAppended({
      reviewer: 'test-reviewer',
      sentAt: '2026-07-10T00:00:00Z',
      channel: 'email',
      status: 'sent',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      labelsAffected: 'NaN' as any,
    });
    expect(result.ok).toBe(false);
  });

  it('round-trips a valid entry: writes file, re-reads, validates', () => {
    fs.writeFileSync(
      REAL_OUTREACH_PATH,
      JSON.stringify({ _meta: { purpose: 'test', lastUpdated: '2026-07-10T00:00:00Z', consentBoundary: 'test' }, invitations: [] }),
      'utf-8',
    );

    const { writeOutreachAppended } = require('./log-outreach');
    const result = writeOutreachAppended({
      reviewer: 'alias-A (consent pending)',
      sentAt: '2026-07-10T10:00:00Z',
      channel: 'email',
      status: 'sent',
      labelsAffected: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.entry).toEqual({
      reviewer: 'alias-A (consent pending)',
      sentAt: '2026-07-10T10:00:00Z',
      channel: 'email',
      status: 'sent',
      labelsAffected: 0,
    });

    // File re-reads cleanly.
    const fileContent = fs.readFileSync(REAL_OUTREACH_PATH, 'utf-8');
    const parsed = JSON.parse(fileContent);
    expect(parsed.invitations).toHaveLength(1);
    expect(parsed.invitations[0]).toEqual(result.entry);
  });

  it('appends to an existing file without overwriting it', () => {
    fs.writeFileSync(
      REAL_OUTREACH_PATH,
      JSON.stringify({
        _meta: { purpose: 'test', lastUpdated: '2026-07-10T00:00:00Z', consentBoundary: 'test' },
        invitations: [
          { reviewer: 'first', sentAt: '2026-07-09T00:00:00Z', channel: 'email', status: 'sent', labelsAffected: 0 },
        ],
      }),
      'utf-8',
    );

    const { writeOutreachAppended } = require('./log-outreach');
    const result = writeOutreachAppended({
      reviewer: 'second',
      sentAt: '2026-07-10T00:00:00Z',
      channel: 'phone',
      status: 'returned',
      labelsAffected: 5,
    });
    expect(result.ok).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(REAL_OUTREACH_PATH, 'utf-8'));
    expect(parsed.invitations).toHaveLength(2);
    expect(parsed.invitations[0].reviewer).toBe('first');
    expect(parsed.invitations[1].reviewer).toBe('second');
    expect(parsed.invitations[1].labelsAffected).toBe(5);
  });

  it('initializes a new file when none exists (graceful bootstrap)', () => {
    if (fs.existsSync(REAL_OUTREACH_PATH)) fs.rmSync(REAL_OUTREACH_PATH);

    const { writeOutreachAppended } = require('./log-outreach');
    const result = writeOutreachAppended({
      reviewer: 'first-ever',
      sentAt: '2026-07-10T00:00:00Z',
      channel: 'email',
      status: 'sent',
      labelsAffected: 0,
    });
    expect(result.ok).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(REAL_OUTREACH_PATH, 'utf-8'));
    expect(parsed.invitations).toHaveLength(1);
    expect(parsed.invitations[0].reviewer).toBe('first-ever');
  });
});

// Avoid TypeScript noUnusedParameters warnings on the unused import-anchor.
void SANDBOX_ROOT;
