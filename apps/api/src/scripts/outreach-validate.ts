/**
 * S15 Commit 4 — `npm run outreach:validate`. Validates the
 * `data/eval/clinician-outreach.json` artifact against
 * `eval/outreachSchema.ts`.
 *
 * Mirrors `scripts/apply-clinician-review.ts` conventions:
 *   - path resolved from `__dirname` (NOT `process.cwd()` — the same
 *     `__dirname`-anchored resolution `scripts/eval.ts` and
 *     `apply-clinician-review.ts` use, so the script works the same
 *     regardless of the invoking shell's working directory);
 *   - `main()` guarded by `if (require.main === module)`;
 *   - `fs.existsSync`-tolerant — a missing file is a non-error "log not
 *     yet started" state, not a crash (the file is added in this commit
 *     but engagement may never happen, and that's an acceptable end state
 *     for the slice — the report makes the gap visible, not the validator);
 *   - validation runs before any error print; the `OK` path and the
 *     error path are mutually exclusive.
 */
import fs from 'fs';
import path from 'path';
import { validateOutreach } from '../eval/outreachSchema';

const OUTREACH_PATH = path.resolve(__dirname, '../../../../data/eval/clinician-outreach.json');

/**
 * Read + validate the outreach log file. Returns a structured result so
 * callers (the CLI `main()` and the eval-report renderer) can branch on
 * the same surface:
 *   - `fileExists: false` → caller prints "Outreach log not yet started."
 *     and exits 0 (or renders the missing-file placeholder in markdown).
 *   - `fileExists: true, ok: true` → caller prints a summary (CLI) or
 *     renders the outreach table (markdown).
 *   - `fileExists: true, ok: false` → caller prints the error list (CLI,
 *     exit 1) or renders the error list inline (markdown — never crashes).
 */
export function readAndValidateOutreach(outreachPath: string = OUTREACH_PATH): {
  fileExists: boolean;
  ok: boolean;
  errors: string[];
  invitations: Array<{
    reviewer: string;
    sentAt: string;
    channel: string;
    status: string;
    labelsAffected: number;
  }>;
} {
  if (!fs.existsSync(outreachPath)) {
    return { fileExists: false, ok: false, errors: [], invitations: [] };
  }
  let parsed: unknown;
  try {
    const raw = fs.readFileSync(outreachPath, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      fileExists: true,
      ok: false,
      errors: [`failed to parse JSON: ${message}`],
      invitations: [],
    };
  }
  const verdict = validateOutreach(parsed);
  if (verdict.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = (parsed as any).invitations as Array<{
      reviewer: string;
      sentAt: string;
      channel: string;
      status: string;
      labelsAffected: number;
    }>;
    return { fileExists: true, ok: true, errors: [], invitations: inv };
  }
  return { fileExists: true, ok: false, errors: verdict.errors, invitations: [] };
}

/** Print a one-line status breakdown (N invitations, by status) for the
 * `OK` CLI path. Same shape conventions the rest of the eval-report uses
 * (counts only — no LLM-derived or invented data). */
function printSummary(invitations: ReadonlyArray<{ status: string }>): void {
  const byStatus = new Map<string, number>();
  for (const i of invitations) {
    byStatus.set(i.status, (byStatus.get(i.status) ?? 0) + 1);
  }
  console.log(`OK — ${invitations.length} invitation(s).`);
  if (invitations.length > 0) {
    const parts: string[] = [];
    for (const [status, count] of byStatus) {
      parts.push(`${status}: ${count}`);
    }
    console.log(`Breakdown by status: ${parts.join(', ')}.`);
  }
}

function main(): void {
  const result = readAndValidateOutreach();
  if (!result.fileExists) {
    console.log('Outreach log not yet started.');
    return;
  }
  if (result.ok) {
    printSummary(result.invitations);
    return;
  }
  console.error('outreach:validate failed:');
  for (const err of result.errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}
