import { bucketFor, extractConfidences, ageFromBirthDate, stratify, parityMitigationFlags, PARITY_DELTA_THRESHOLD, PARITY_SMALL_SAMPLE_THRESHOLD } from './service';
import type { ParityResult } from './service';

// Direct unit tests for governance/service.ts's pure helpers — boundary
// cases that are awkward to pin precisely through the HTTP-level fixtures in
// routes/governance.test.ts (which already cover the happy-path shape).
// Same convention population/service.ts uses for projectedCostAvoidance.

describe('bucketFor', () => {
  it('places a value exactly on the 0.5 boundary in the 0.5-0.7 bucket, not 0-0.5', () => {
    expect(bucketFor(0.5)).toBe('0.5-0.7');
  });

  it('places a value exactly on the 0.7 boundary in the 0.7-0.85 bucket, not 0.5-0.7', () => {
    expect(bucketFor(0.7)).toBe('0.7-0.85');
  });

  it('places a value exactly on the 0.85 boundary in the 0.85-1.0 bucket, not 0.7-0.85', () => {
    expect(bucketFor(0.85)).toBe('0.85-1.0');
  });

  it('includes the top bucket upper bound (1.0), unlike the other buckets\' exclusive upper bound', () => {
    expect(bucketFor(1.0)).toBe('0.85-1.0');
  });

  it('places 0 in the lowest bucket', () => {
    expect(bucketFor(0)).toBe('0-0.5');
  });
});

describe('extractConfidences', () => {
  it('collects confidence values across risk/careGap/sdoh finding arrays', () => {
    const resultJson = {
      risk: { findings: [{ confidence: 0.9 }, { confidence: 0.4 }] },
      careGap: { findings: [{ confidence: 0.6 }] },
      sdoh: { findings: [{ confidence: 0.8 }] },
    };
    expect(extractConfidences(resultJson)).toEqual([0.9, 0.4, 0.6, 0.8]);
  });

  it('skips findings with no confidence field, rather than treating it as 0', () => {
    const resultJson = { risk: { findings: [{ text: 'no confidence field' }, { confidence: 0.5 }] } };
    expect(extractConfidences(resultJson)).toEqual([0.5]);
  });

  it('returns an empty array for null/undefined/malformed input', () => {
    expect(extractConfidences(null)).toEqual([]);
    expect(extractConfidences(undefined)).toEqual([]);
    expect(extractConfidences({})).toEqual([]);
    expect(extractConfidences({ risk: { findings: 'not-an-array' } })).toEqual([]);
  });
});

describe('ageFromBirthDate', () => {
  it("returns age unchanged when today is exactly this year's birthday", () => {
    expect(ageFromBirthDate('2000-06-15', new Date('2026-06-15'))).toBe(26);
  });

  it("has not yet incremented the day before this year's birthday", () => {
    expect(ageFromBirthDate('2000-06-15', new Date('2026-06-14'))).toBe(25);
  });

  it("has incremented the day after this year's birthday", () => {
    expect(ageFromBirthDate('2000-06-15', new Date('2026-06-16'))).toBe(26);
  });

  it('returns undefined for a missing or unparseable birthDate', () => {
    expect(ageFromBirthDate(undefined, new Date('2026-06-15'))).toBeUndefined();
    expect(ageFromBirthDate('not-a-date', new Date('2026-06-15'))).toBeUndefined();
  });
});

describe('stratify', () => {
  it('averages riskScore per group and rounds to one decimal place', () => {
    const result = stratify([
      { group: 'A', riskScore: 90 },
      { group: 'A', riskScore: 81 },
      { group: 'B', riskScore: 50 },
    ]);
    expect(result).toEqual(
      expect.arrayContaining([
        { group: 'A', patientCount: 2, avgRiskScore: 85.5 },
        { group: 'B', patientCount: 1, avgRiskScore: 50 },
      ])
    );
  });

  it('skips rows with an undefined group rather than joining an "undefined" bucket', () => {
    const result = stratify([
      { group: 'A', riskScore: 90 },
      { group: undefined, riskScore: 10 },
    ]);
    expect(result).toEqual([{ group: 'A', patientCount: 1, avgRiskScore: 90 }]);
  });

  it('returns an empty array for no rows', () => {
    expect(stratify([])).toEqual([]);
  });
});

describe('parityMitigationFlags (S19 Thread B)', () => {
  // Helper to build a minimal ParityResult fixture. `mitigation` is always
  // populated by `parityMitigationFlags` itself, so the fixture starts
  // with an empty array and the test asserts the output.
  function parityFixture(overrides: Partial<ParityResult>): ParityResult {
    return {
      byAgeBand: [],
      bySex: [],
      byRace: [],
      byEthnicity: [],
      mitigation: [],
      ...overrides,
    };
  }

  it('returns no flags for a fully-populated parity result with low deltas', () => {
    const parity = parityFixture({
      byAgeBand: [
        { group: '18-34', patientCount: 5, avgRiskScore: 50 },
        { group: '35-49', patientCount: 6, avgRiskScore: 55 },
        { group: '50-64', patientCount: 7, avgRiskScore: 52 },
      ],
      bySex: [
        { group: 'male', patientCount: 10, avgRiskScore: 51 },
        { group: 'female', patientCount: 8, avgRiskScore: 53 },
      ],
    });
    expect(parityMitigationFlags(parity)).toEqual([]);
  });

  it('flags a single dimension when |max - min| > PARITY_DELTA_THRESHOLD (red severity)', () => {
    const parity = parityFixture({
      byRace: [
        { group: 'White', patientCount: 10, avgRiskScore: 50 },
        { group: 'Black or African American', patientCount: 10, avgRiskScore: 80 },
      ],
    });
    const flags = parityMitigationFlags(parity);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      dimension: 'byRace',
      severity: 'red',
      recommendedAction: 'audit rubric for that group',
    });
    // Evidence string names both endpoints and the delta so a reviewer
    // can audit the trigger without re-running the function. The exact
    // order of "max" vs "min" in the evidence string is implementation-
    // defined (it follows max→min), so the test pins the substrings
    // independently rather than asserting positional order.
    expect(flags[0].evidence).toMatch(/White/);
    expect(flags[0].evidence).toMatch(/Black or African American/);
    expect(flags[0].evidence).toMatch(/\b80\b/);
    expect(flags[0].evidence).toMatch(/\b50\b/);
    expect(flags[0].evidence).toMatch(/delta.*30/);
  });

  it('does NOT flag a delta exactly equal to PARITY_DELTA_THRESHOLD (strict inequality)', () => {
    // Boundary case: 70 - 55 = 15, exactly at threshold. The implementation
    // uses strict `>`, so this is NOT a flag.
    const parity = parityFixture({
      byRace: [
        { group: 'A', patientCount: 5, avgRiskScore: 70 },
        { group: 'B', patientCount: 5, avgRiskScore: 55 },
      ],
    });
    expect(parityMitigationFlags(parity)).toEqual([]);
  });

  it('flags a delta just over PARITY_DELTA_THRESHOLD (15.1 boundary)', () => {
    const parity = parityFixture({
      byRace: [
        { group: 'A', patientCount: 5, avgRiskScore: 70.05 },
        { group: 'B', patientCount: 5, avgRiskScore: 55 },
      ],
    });
    expect(parityMitigationFlags(parity).length).toBeGreaterThan(0);
  });

  it('flags a small-sample group (n < PARITY_SMALL_SAMPLE_THRESHOLD) with amber severity', () => {
    const parity = parityFixture({
      byEthnicity: [
        { group: 'Hispanic or Latino', patientCount: 12, avgRiskScore: 50 },
        { group: 'Not Hispanic or Latino', patientCount: 2, avgRiskScore: 50 }, // n<3
      ],
    });
    const flags = parityMitigationFlags(parity);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      dimension: 'byEthnicity',
      severity: 'amber',
      recommendedAction: 'insufficient sample',
    });
    expect(flags[0].evidence).toMatch(/Not Hispanic.*n=2/);
  });

  it('does NOT flag a group with exactly n = PARITY_SMALL_SAMPLE_THRESHOLD (strict inequality)', () => {
    const parity = parityFixture({
      byEthnicity: [
        { group: 'A', patientCount: 5, avgRiskScore: 50 },
        { group: 'B', patientCount: 3, avgRiskScore: 50 }, // exactly 3
      ],
    });
    expect(parityMitigationFlags(parity)).toEqual([]);
  });

  it('emits both a small-sample AND a disparity flag when both apply on the same dimension', () => {
    const parity = parityFixture({
      bySex: [
        { group: 'male', patientCount: 10, avgRiskScore: 50 },
        { group: 'female', patientCount: 2, avgRiskScore: 80 }, // n<3 AND delta > 15
      ],
    });
    const flags = parityMitigationFlags(parity);
    expect(flags).toHaveLength(2);
    expect(flags.find((f) => f.severity === 'amber' && f.recommendedAction === 'insufficient sample')).toBeDefined();
    expect(flags.find((f) => f.severity === 'red' && f.recommendedAction === 'audit rubric for that group')).toBeDefined();
  });

  it('flags multiple dimensions independently', () => {
    const parity = parityFixture({
      byRace: [
        { group: 'White', patientCount: 10, avgRiskScore: 50 },
        { group: 'Black or African American', patientCount: 10, avgRiskScore: 80 },
      ],
      byAgeBand: [
        { group: '18-34', patientCount: 10, avgRiskScore: 50 },
        { group: '65+', patientCount: 10, avgRiskScore: 75 },
      ],
    });
    const flags = parityMitigationFlags(parity);
    expect(flags).toHaveLength(2);
    expect(flags.map((f) => f.dimension).sort()).toEqual(['byAgeBand', 'byRace']);
  });

  it('returns no flags when every dimension is empty', () => {
    const parity = parityFixture({});
    expect(parityMitigationFlags(parity)).toEqual([]);
  });

  it('does not flag a single-group dimension (no delta to compute)', () => {
    const parity = parityFixture({
      byRace: [{ group: 'White', patientCount: 20, avgRiskScore: 50 }],
    });
    expect(parityMitigationFlags(parity)).toEqual([]);
  });

  it('exports the threshold constants for direct pinning', () => {
    // The thresholds are surfaced as exported constants; pinning their values
    // guards against silent drift if a future slice changes them.
    expect(PARITY_DELTA_THRESHOLD).toBe(15);
    expect(PARITY_SMALL_SAMPLE_THRESHOLD).toBe(3);
  });
});
