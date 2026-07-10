/**
 * Deterministic procedural population cohort for S5 (~500 patients across
 * diabetes, CHF, and depression condition mixes). This replaces running real
 * Synthea/Java: same inputs, same outputs, every run, so tests and the S5
 * dashboard aggregate can rely on stable counts.
 *
 * IDs are namespaced `pop-0001`..`pop-0500` so they never collide with the
 * hand-authored hero/panel patients in `seed-patients.ts`.
 */

import { RaceEthnicity, SeedPatient } from './seed-patients';

const POPULATION_SIZE = 500;
const POPULATION_SEED = 0xc0ffee;

/**
 * "Critical zone" threshold used by the S5 dashboard to count high-risk
 * patients: a riskScore (0-100, i.e. probabilityDecimal * 100) at or above
 * this value is considered critical. See `riskScoreFor` below for how a
 * patient's score is derived.
 */
export const CRITICAL_RISK_THRESHOLD = 75;

// --- deterministic PRNG -----------------------------------------------
// mulberry32: small, fast, seeded PRNG. No Math.random()/Date.now() — the
// same seed always produces the same sequence, which is what makes
// generatePopulation() reproducible across runs and processes.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

const CONDITION_LIBRARY = {
  diabetes: { system: 'ICD-10' as const, code: 'E11.9', display: 'Type 2 diabetes mellitus without complications' },
  chf: { system: 'ICD-10' as const, code: 'I50.9', display: 'Heart failure, unspecified' },
  depression: { system: 'ICD-10' as const, code: 'F33.1', display: 'Major depressive disorder, recurrent, moderate' },
};

type ConditionKey = keyof typeof CONDITION_LIBRARY;

// Every non-empty subset of {diabetes, chf, depression}, cycled by patient
// index so the cohort covers every mix (single conditions, pairs, and full
// comorbidity) deterministically rather than leaving it to chance.
const CONDITION_MIXES: ConditionKey[][] = [
  ['diabetes'],
  ['chf'],
  ['depression'],
  ['diabetes', 'chf'],
  ['diabetes', 'depression'],
  ['chf', 'depression'],
  ['diabetes', 'chf', 'depression'],
];

const FIRST_NAMES_MALE = ['James', 'Robert', 'Michael', 'David', 'Carlos', 'Anthony', 'Kevin', 'Jamal', 'Wei', 'Dmitri'];
const FIRST_NAMES_FEMALE = ['Maria', 'Linda', 'Angela', 'Patricia', 'Fatima', 'Sofia', 'Aisha', 'Grace', 'Yuki', 'Elena'];
const LAST_NAMES = [
  'Nguyen', 'Garcia', 'Johnson', 'Patel', 'Smith', 'Kim', 'Rossi', 'Diallo', 'Okafor', 'Torres',
  'Martinez', 'Brown', 'Lee', 'Ivanov', 'Silva', 'Cohen', 'Ali', 'Novak', 'Kowalski', 'Santos',
];

// US Core race/ethnicity OMB categories (system urn:oid:2.16.840.1.113883.6.238).
const RACE_OPTIONS: Array<{ raceCode: string; raceDisplay: string }> = [
  { raceCode: '2106-3', raceDisplay: 'White' },
  { raceCode: '2054-5', raceDisplay: 'Black or African American' },
  { raceCode: '2028-9', raceDisplay: 'Asian' },
  { raceCode: '1002-5', raceDisplay: 'American Indian or Alaska Native' },
  { raceCode: '2076-8', raceDisplay: 'Native Hawaiian or Other Pacific Islander' },
  { raceCode: '2131-1', raceDisplay: 'Other Race' },
];
const ETHNICITY_OPTIONS: Array<{ ethnicityCode: string; ethnicityDisplay: string }> = [
  { ethnicityCode: '2135-2', ethnicityDisplay: 'Hispanic or Latino' },
  { ethnicityCode: '2186-5', ethnicityDisplay: 'Not Hispanic or Latino' },
];

// Hours-since-discharge options cycled per patient to vary encounter
// recency, which feeds the risk heuristic below.
const RECENCY_HOURS_OPTIONS = [24, 60, 100, 200, 400, 800, 1500, 3000];

function birthDateFor(rng: () => number): string {
  // Fixed reference year (not Date.now()) keeps birthDate stable across
  // runs/days. Ages span ~28-92 as of the reference year.
  const referenceYear = 2025;
  const age = 28 + Math.floor(rng() * 65);
  const birthYear = referenceYear - age;
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${birthYear}-${pad(month)}-${pad(day)}`;
}

function raceEthnicityFor(rng: () => number): RaceEthnicity {
  const race = pick(rng, RACE_OPTIONS);
  const ethnicity = pick(rng, ETHNICITY_OPTIONS);
  return { ...race, ...ethnicity };
}

/**
 * Deterministic risk heuristic (documented; not a real clinical model — a
 * stand-in until the S2 Risk Agent scores this cohort for real):
 *
 *   base                = 0.10
 *   + 0.18 * conditionCount        (conditionCount is 1, 2, or 3 of
 *                                    {diabetes, chf, depression})
 *   + recency bonus, from hours since the patient's last encounter ended:
 *       <= 72h   -> +0.20
 *       <= 168h  -> +0.10
 *       <= 720h  -> +0.04
 *       otherwise -> +0.00
 *   + 0.08 comorbidity bonus if all three tracked conditions are present
 *   clamped to [0.05, 0.96]
 *
 * "Critical zone": riskScore (= round(probabilityDecimal * 100)) >=
 * CRITICAL_RISK_THRESHOLD (75). In practice this is reached only by
 * patients with all three tracked conditions whose last encounter ended
 * within the last 30 days (<= 720h) — i.e. any non-zero recency bonus.
 */
export function riskScoreFor(conditionCount: number, recencyHours: number): number {
  const base = 0.1;
  const conditionBonus = 0.18 * conditionCount;
  const recencyBonus = recencyHours <= 72 ? 0.2 : recencyHours <= 168 ? 0.1 : recencyHours <= 720 ? 0.04 : 0;
  const comorbidityBonus = conditionCount === 3 ? 0.08 : 0;
  const probabilityDecimal = Math.min(0.96, Math.max(0.05, base + conditionBonus + recencyBonus + comorbidityBonus));
  return Math.round(probabilityDecimal * 100);
}

// --- S19 Thread C1 — monitoring Observations on a deterministic subset ---
// Same LOINC codes `confidenceScorer.ts:CONDITION_TO_REQUIRED_LOINC` uses
// for the Care Gap labeling rule. Defining inline here (not imported from
// confidenceScorer) keeps `fhir-data/population.ts` as a leaf module —
// `confidenceScorer.ts` already imports from this file, so a back-import
// would create a cycle.
const HBA1C_LOINC = '4548-4';
const BNP_LOINC = '30934-4';
const EGFR_LOINC = '62238-1';

interface MonitoringObservation {
  id: string;
  loincCode: string;
  display: string;
  value: number;
  unit: string;
}

// ICD-10 → required LOINC mapping, mirroring `confidenceScorer.ts`.
// E11.9 → HbA1c, I50.9 → BNP, N18.3 → eGFR. Other conditions (F33.1,
// depression; etc.) have no established monitoring convention and are
// skipped — the eval labels them `expectedHasGap: null` for that reason.
//
// S19 review-fix: `normalValue` lowered to clinically-controlled levels
// (HbA1c 6.5% — under the <7.0% diabetes-control target; BNP 50 pg/mL —
// under the <100 normal ceiling; eGFR 90 mL/min — well above the <30
// kidney-failure threshold). Previous values (7.2 / 150 / 75) crossed the
// clinical-control target on HbA1c and triggered the Care Gap agent's
// "value above target → flag for intervention" reading, producing false
// positives against the labeling rule (which says "Observation on file
// = no gap" — a simplification that doesn't account for value range).
// Lowering to truly-normal lets the rule and the agent agree.
//
// `abnormalValue` (where present) is what the S19 C2 schedule seeds for
// pop-0014 (i=13) so Anchor C (abnormal labs) is met and the v3 rubric
// returns 'high'/'critical' per Rule 2 — making pop-0014 a true held-out
// positive Risk label. The semantic upgrade in
// `apps/api/src/eval/labelFromBundle.ts:careGapLabel` reconciles the
// "Observation on file = no gap" rule with the Care Gap agent's value-
// range reading for this single patient: an abnormal-value Observation
// counts as a gap (rule updated to be clinical, not just present/absent).
const ICD10_TO_LOINC: Record<string, { loinc: string; display: string; normalValue: number; abnormalValue?: number; unit: string }> = {
  'E11.9': { loinc: HBA1C_LOINC, display: 'Hemoglobin A1c', normalValue: 6.5, abnormalValue: 10.2, unit: '%' },
  'I50.9': { loinc: BNP_LOINC, display: 'Natriuretic peptide B', normalValue: 50, abnormalValue: 380, unit: 'pg/mL' },
  'N18.3': { loinc: EGFR_LOINC, display: 'eGFR', normalValue: 90, abnormalValue: 22, unit: 'mL/min/1.73m2' },
};

// S19 Thread C2 — held-out-positive patient index. For this index, the
// buildObservationsForIndex function seeds ABNORMAL values (crossing the
// Anchor C threshold — HbA1c > 9.0%, BNP > 200, eGFR < 30) so the v3
// rubric's Rule 2 makes the agent call 'high' or 'critical'. Without
// this override, all i%7===6 patients (3-condition mix + 24h recency)
// would be downgraded to 'moderate' by Rule 2 (2 anchors without Anchor
// C), and the held-out Risk sensitivity metric would stay N/A.
const ABNORMAL_VALUES_INDEX = 13;

// S19 Thread C1 — seed monitoring Observations for a deterministic subset
// of procedural patients. Subset = `i % 7 === 6` (matches the
// 3-condition-mix patients from CONDITION_MIXES). Each patient's
// conditions are checked against ICD10_TO_LOINC; if any condition has a
// matching LOINC convention, the matching monitoring Observation is
// seeded with a normal-range value (HbA1c 7.2%, BNP 150 pg/mL, eGFR 75
// mL/min/1.73m²). The Care Gap agent sees a "monitored" record for
// these patients and (per the labeling rule) the eval labels them
// `expectedHasGap: false`.
//
// Exception: `i === ABNORMAL_VALUES_INDEX` (pop-0014) gets ABNORMAL
// values (HbA1c 10.2%, BNP 380 pg/mL, eGFR 22 mL/min/1.73m²) so Anchor C
// is met. This single patient is the held-out Risk positive (C2).
//
// Returns [] for indices outside the subset or with no classifiable
// conditions. Exported for direct unit testing.
export function buildObservationsForIndex(
  i: number,
  conditions: Array<{ code: string }>,
): MonitoringObservation[] {
  if (i % 7 !== 6) return [];
  const useAbnormal = i === ABNORMAL_VALUES_INDEX;
  const observations: MonitoringObservation[] = [];
  const seenLoinc = new Set<string>();
  for (const c of conditions) {
    const mapping = ICD10_TO_LOINC[c.code];
    if (!mapping) continue;
    if (seenLoinc.has(mapping.loinc)) continue;
    seenLoinc.add(mapping.loinc);
    observations.push({
      id: `pop-${String(i + 1).padStart(4, '0')}-obs-${mapping.loinc}`,
      loincCode: mapping.loinc,
      display: mapping.display,
      value: useAbnormal && mapping.abnormalValue !== undefined ? mapping.abnormalValue : mapping.normalValue,
      unit: mapping.unit,
    });
  }
  return observations;
}

// --- S19 Thread C2 — held-out positive scheduling ---
// Force specific held-out patient indices to a fresh-discharge recency
// so the held-out Risk sensitivity metric has at least one positive
// label (`riskScoreFor ≥ 75`). Without this, all 10 held-out patients
// (pop-0011..pop-0020) happen to land on a non-fresh recency bucket and
// the metric is structurally N/A — indistinguishable from "fails" to a
// reviewer.
//
// pop-0014 (i=13) is selected because its condition mix
// (`CONDITION_MIXES[13 % 7] = CONDITION_MIXES[6]`) is the 3-condition
// combo (diabetes + CHF + depression), and a fresh-discharge recency
// (24h) yields `riskScoreFor(3, 24) = 0.10 + 0.54 + 0.20 + 0.08 = 0.92`
// → riskScore 92 ≥ 75. With this override, the held-out sensitivity
// metric becomes defined.
//
// Exported for direct unit testing.
export function forceRecencyForIndex(i: number): number | undefined {
  // pop-0014 — i=13 — 3-condition mix + fresh discharge.
  // Holding back to exactly one patient per S19 scope; S20+ can extend
  // this list if more held-out positives are needed.
  if (i === 13) return 24;
  return undefined;
}

/**
 * S14 B3/B5 — return the AHC-HRSN screening Observation (if any) for the
 * procedural patient at the given 0-based index. Only `pop-0005` (explicit
 * negative, i=4) and `pop-0010` (positive, i=9) carry one in this slice;
 * the rest of the population stays at "no screening on file" so the SDOH
 * agreement rate is no longer trivially gameable by a constant "no barrier"
 * predictor. Mirrors SeedPatient's sdohPositive/sdohNegative shape so
 * `import-fhir.ts`'s existing importer pushes them unchanged.
 */
function buildSdohForIndex(
  i: number,
): { sdohPositive?: SeedPatient['sdohPositive']; sdohNegative?: SeedPatient['sdohNegative'] } | undefined {
  if (i === 9) {
    // pop-0010 — procedural depression + no Observations → social-isolation
    // + financial barriers (dev interpretation of procedural profile).
    return { sdohPositive: { id: 'pop-0010-sdoh', note: 'AHC-HRSN screening positive: social-isolation barriers, financial barriers' } };
  }
  if (i === 4) {
    // pop-0005 — HTN + depression but stable housing + insurance per the
    // procedural generator — same as robert-kim (screened, no barriers).
    return { sdohNegative: { id: 'pop-0005-sdoh', note: 'AHC-HRSN screening: no social barriers identified' } };
  }
  return undefined;
}

export function generatePopulation(): SeedPatient[] {
  const rng = mulberry32(POPULATION_SEED);
  const patients: SeedPatient[] = [];

  for (let i = 0; i < POPULATION_SIZE; i++) {
    const id = `pop-${String(i + 1).padStart(4, '0')}`;
    const gender: SeedPatient['gender'] = i % 2 === 0 ? 'female' : 'male';
    const firstName = pick(rng, gender === 'female' ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE);
    const lastName = pick(rng, LAST_NAMES);
    const birthDate = birthDateFor(rng);
    const raceEthnicity = raceEthnicityFor(rng);
    // S19 Thread C2 — held-out positive scheduling: for indices the
    // `forceRecencyForIndex` table names, override the RNG-derived
    // recency so the held-out Risk sensitivity metric has at least one
    // positive label. See the function's doc comment for why i=13 is
    // the chosen index.
    const recencyHours = forceRecencyForIndex(i) ?? pick(rng, RECENCY_HOURS_OPTIONS);

    const mix = CONDITION_MIXES[i % CONDITION_MIXES.length];
    const conditions = mix.map((key) => {
      const lib = CONDITION_LIBRARY[key];
      return { id: `${id}-${key}`, system: lib.system, code: lib.code, display: lib.display };
    });

    const riskScore = riskScoreFor(mix.length, recencyHours);
    const sdoh = buildSdohForIndex(i);
    // S19 Thread C1 — for `i % 7 === 6` (3-condition-mix patients),
    // seed matching monitoring Observations so the Care Gap agent sees
    // both gaps AND gap-closures; the eval labels them
    // `expectedHasGap: false`.
    const observations = buildObservationsForIndex(i, conditions);

    patients.push({
      id,
      name: { given: [firstName], family: lastName },
      gender,
      birthDate,
      raceEthnicity,
      conditions,
      ...(observations.length > 0 ? { observations } : {}),
      ...(sdoh ?? {}),
      encounter: { id: `${id}-encounter`, conditionId: conditions[0].id, dischargedHoursAgo: recencyHours },
      riskScore,
      tasks: [],
    });
  }

  return patients;
}
