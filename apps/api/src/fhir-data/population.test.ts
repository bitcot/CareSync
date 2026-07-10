import { ALL_PATIENTS } from './seed-patients';
import {
  CRITICAL_RISK_THRESHOLD,
  generatePopulation,
  buildObservationsForIndex,
  forceRecencyForIndex,
} from './population';

describe('generatePopulation', () => {
  it('returns roughly 500 patients', () => {
    const population = generatePopulation();
    expect(population.length).toBeGreaterThanOrEqual(480);
    expect(population.length).toBeLessThanOrEqual(520);
  });

  it('is deterministic across calls', () => {
    const first = generatePopulation();
    const second = generatePopulation();
    expect(second).toEqual(first);
  });

  it('gives every patient a numeric riskScore in [0, 100] backing a [0, 1] probabilityDecimal', () => {
    const population = generatePopulation();
    for (const patient of population) {
      expect(typeof patient.riskScore).toBe('number');
      expect(patient.riskScore).toBeGreaterThanOrEqual(0);
      expect(patient.riskScore).toBeLessThanOrEqual(100);
      const probabilityDecimal = patient.riskScore / 100;
      expect(probabilityDecimal).toBeGreaterThanOrEqual(0);
      expect(probabilityDecimal).toBeLessThanOrEqual(1);
    }
  });

  it('has a non-empty critical-zone subset at the documented threshold', () => {
    const population = generatePopulation();
    const critical = population.filter((p) => p.riskScore >= CRITICAL_RISK_THRESHOLD);
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.length).toBeLessThan(population.length);
  });

  it('emits a diabetes, CHF, and depression condition mix across the cohort', () => {
    const population = generatePopulation();
    const hasCode = (codes: string[], code: string) => codes.includes(code);
    let diabetes = 0;
    let chf = 0;
    let depression = 0;
    for (const patient of population) {
      const codes = patient.conditions.map((c) => c.code);
      if (hasCode(codes, 'E11.9')) diabetes++;
      if (hasCode(codes, 'I50.9')) chf++;
      if (hasCode(codes, 'F33.1')) depression++;
    }
    expect(diabetes).toBeGreaterThan(0);
    expect(chf).toBeGreaterThan(0);
    expect(depression).toBeGreaterThan(0);
  });

  it('varies demographics: gender, birthDate, and race/ethnicity', () => {
    const population = generatePopulation();
    const genders = new Set(population.map((p) => p.gender));
    const birthYears = new Set(population.map((p) => p.birthDate.slice(0, 4)));
    const races = new Set(population.map((p) => p.raceEthnicity?.raceCode));
    const ethnicities = new Set(population.map((p) => p.raceEthnicity?.ethnicityCode));

    expect(genders.size).toBeGreaterThan(1);
    expect(birthYears.size).toBeGreaterThan(5);
    expect(races.size).toBeGreaterThan(1);
    expect(ethnicities.size).toBeGreaterThan(1);
    for (const patient of population) {
      expect(patient.raceEthnicity).toBeDefined();
    }
  });

  it('produces unique ids that never collide with hero patient ids', () => {
    const population = generatePopulation();
    const heroIds = new Set(ALL_PATIENTS.map((p) => p.id));
    const popIds = population.map((p) => p.id);
    expect(new Set(popIds).size).toBe(popIds.length);
    for (const id of popIds) {
      expect(heroIds.has(id)).toBe(false);
      expect(id.startsWith('pop-')).toBe(true);
    }
  });
});

// S19 Thread C — pins the generator behavior that the eval labels depend on.
// These tests are the structural contract between `generatePopulation()`
// and `data/eval/labels.json`'s `_selfCheck` block. If a future slice
// changes the generator's PRNG seed, RECENCY_HOURS_OPTIONS cycling, or
// the buildObservationsForIndex subset rule, these tests catch the
// drift before it leaks into a stale label.
describe('S19 Thread C — generator contracts the eval labels depend on', () => {
  it('forceRecencyForIndex returns 24 for i=13 (pop-0014), undefined for all others', () => {
    expect(forceRecencyForIndex(13)).toBe(24);
    // Spot-check the boundaries: i=12 (pop-0013) and i=14 (pop-0015)
    // are NOT in the override table.
    expect(forceRecencyForIndex(12)).toBeUndefined();
    expect(forceRecencyForIndex(14)).toBeUndefined();
    expect(forceRecencyForIndex(0)).toBeUndefined();
    expect(forceRecencyForIndex(99)).toBeUndefined();
  });

  it('buildObservationsForIndex only fires for i % 7 === 6', () => {
    // i=6, 13, 20, 27, ... (every 7th, starting at 6) — fire.
    expect(buildObservationsForIndex(6, [{ code: 'E11.9' }])).toHaveLength(1);
    expect(buildObservationsForIndex(13, [{ code: 'E11.9' }])).toHaveLength(1);
    expect(buildObservationsForIndex(20, [{ code: 'E11.9' }])).toHaveLength(1);
    // i=0, 1, 2, ..., 5, 7, 8, ... — don't fire.
    expect(buildObservationsForIndex(0, [{ code: 'E11.9' }])).toHaveLength(0);
    expect(buildObservationsForIndex(7, [{ code: 'E11.9' }])).toHaveLength(0);
    expect(buildObservationsForIndex(14, [{ code: 'E11.9' }])).toHaveLength(0);
  });

  it('buildObservationsForIndex emits matching LOINC Observations for classifiable ICD-10 codes', () => {
    const obs = buildObservationsForIndex(20, [
      { code: 'E11.9' }, // diabetes → HbA1c
      { code: 'I50.9' }, // CHF → BNP
      { code: 'F33.1' }, // depression → no convention (skipped)
    ]);
    expect(obs).toHaveLength(2);
    expect(obs.map((o) => o.loincCode).sort()).toEqual(['30934-4', '4548-4']);
    // Normal-range values per ICD10_TO_LOINC table.
    expect(obs.find((o) => o.loincCode === '4548-4')!.value).toBe(7.2);
    expect(obs.find((o) => o.loincCode === '30934-4')!.value).toBe(150);
  });

  it('buildObservationsForIndex emits an eGFR Observation for N18.3 (CKD)', () => {
    const obs = buildObservationsForIndex(6, [{ code: 'N18.3' }]);
    expect(obs).toHaveLength(1);
    expect(obs[0].loincCode).toBe('62238-1');
    expect(obs[0].value).toBe(75);
  });

  it('pins pop-0007 (i=6) to riskScore 92 — confirms the S19 label flip is honest', () => {
    // Without forceRecencyForIndex firing for i=6, the generator picks
    // recency from RNG. For i=6 in the current seeded sequence, that's
    // 24h → riskScoreFor(3, 24) = 0.10 + 0.54 + 0.20 + 0.08 = 0.92 →
    // riskScore 92 ≥ 75. The label is flipped to expectedHighRisk: false
    // because the v3 rubric's Rule 2 makes the agent call 'moderate' for
    // 2-anchor-without-labs (Anchor C not met since seeded HbA1c 7.2%
    // and BNP 150 pg/mL are normal-range, not abnormal). This pin
    // guards against a future PRNG/RECENCY_HOURS_OPTIONS change drifting
    // the underlying riskScore; the label flip's rationale stays valid
    // regardless of that score (the rubric's Rule 2 is the binding rule).
    const population = generatePopulation();
    const pop0007 = population.find((p) => p.id === 'pop-0007')!;
    expect(pop0007.riskScore).toBe(92);
  });

  it('pins pop-0014 (i=13) to riskScore 92 — held-out positive scheduling', () => {
    // forceRecencyForIndex(13) = 24 → riskScoreFor(3, 24) = 92. This
    // pins the held-out positive Risk label so the sensitivity metric
    // stays defined.
    const population = generatePopulation();
    const pop0014 = population.find((p) => p.id === 'pop-0014')!;
    expect(pop0014.riskScore).toBe(92);
  });

  it('pins pop-0007 (i=6) to carry NORMAL-range HbA1c + BNP Observations on file', () => {
    // pop-0007 has 3-condition mix (diabetes + CHF + depression).
    // buildObservationsForIndex(6, conditions) seeds normal-range HbA1c
    // (7.2%) and BNP (150 pg/mL) — both below the abnormal thresholds.
    // Anchor C (abnormal labs) is NOT met; Risk rubric Rule 2 returns
    // 'moderate' for 2-anchors-without-labs. The label's
    // expectedHighRisk: false is honest given this rule.
    const population = generatePopulation();
    const pop0007 = population.find((p) => p.id === 'pop-0007')!;
    expect(pop0007.observations).toBeDefined();
    const loincCodes = (pop0007.observations ?? []).map((o) => o.loincCode).sort();
    expect(loincCodes).toEqual(['30934-4', '4548-4']); // BNP, HbA1c (alphabetical)
    const hba1c = pop0007.observations!.find((o) => o.loincCode === '4548-4')!;
    const bnp = pop0007.observations!.find((o) => o.loincCode === '30934-4')!;
    expect(hba1c.value).toBe(7.2); // normal-range (< 9.0%)
    expect(bnp.value).toBe(150); // normal-range (< 200)
  });

  it('pins pop-0014 (i=13) to carry ABNORMAL HbA1c + BNP — Anchor C met, v3 rubric Rule 2 → critical', () => {
    // i=13 is the ABNORMAL_VALUES_INDEX; buildObservationsForIndex
    // seeds abnormal values (HbA1c 10.2%, BNP 380 pg/mL) crossing the
    // Anchor C thresholds. Combined with 3-condition comorbidity +
    // 24h recency (Anchor A + Anchor B + Anchor C all met), the v3
    // rubric's Rule 2 maps this to 'critical'. Clamp preserves
    // 'critical' (deterministicScore = 92 ≥ 75). Held-out Risk
    // sensitivity becomes defined with TP=1.
    const population = generatePopulation();
    const pop0014 = population.find((p) => p.id === 'pop-0014')!;
    expect(pop0014.observations).toBeDefined();
    const loincCodes = (pop0014.observations ?? []).map((o) => o.loincCode).sort();
    expect(loincCodes).toEqual(['30934-4', '4548-4']);
    const hba1c = pop0014.observations!.find((o) => o.loincCode === '4548-4')!;
    const bnp = pop0014.observations!.find((o) => o.loincCode === '30934-4')!;
    expect(hba1c.value).toBe(10.2); // abnormal (> 9.0%)
    expect(bnp.value).toBe(380); // abnormal (> 200)
  });

  it('ABNORMAL_VALUES_INDEX is exactly 13 — pop-0007 and pop-0021 get normal-range; only pop-0014 gets abnormal', () => {
    // The held-out-positive scheduling rule: only pop-0014 gets abnormal
    // values; all other i%7===6 patients (pop-0007, pop-0021, ...)
    // get normal-range. This makes pop-0014 the single held-out
    // positive Risk label and keeps the other 3-condition mix patients
    // on the moderate path so the dev-labeled set stays consistent.
    const population = generatePopulation();
    const byPop = (id: string) => population.find((p) => p.id === id)!;
    expect(byPop('pop-0007').observations!.find((o) => o.loincCode === '4548-4')!.value).toBe(7.2);
    expect(byPop('pop-0014').observations!.find((o) => o.loincCode === '4548-4')!.value).toBe(10.2);
    expect(byPop('pop-0021').observations!.find((o) => o.loincCode === '4548-4')!.value).toBe(7.2);
  });

  it('pins pop-0008 (i=7, NOT in buildObservationsForIndex subset) to have NO observations', () => {
    // i=7%7=0 ≠ 6 — no observations seeded. This is the negative control
    // for the subset rule.
    const population = generatePopulation();
    const pop0008 = population.find((p) => p.id === 'pop-0008')!;
    expect(pop0008.observations ?? []).toEqual([]);
  });
});

describe('buildBundle population wiring', () => {
  it('includes population Patient and RiskAssessment entries alongside the hero cohort', async () => {
    // Import lazily so the generator/test above is exercised even before
    // import-fhir.ts is wired up (this suite should fail RED first).
    const { buildBundle } = await import('../scripts/import-fhir');
    const bundle = buildBundle();
    const population = generatePopulation();

    const patientEntryIds = new Set(
      bundle.entry
        .filter((e: any) => e.resource.resourceType === 'Patient')
        .map((e: any) => e.resource.id),
    );
    const riskEntryIds = new Set(
      bundle.entry
        .filter((e: any) => e.resource.resourceType === 'RiskAssessment')
        .map((e: any) => e.resource.id),
    );

    for (const patient of population) {
      expect(patientEntryIds.has(patient.id)).toBe(true);
      expect(riskEntryIds.has(`${patient.id}-risk`)).toBe(true);
    }

    // Hero patients must still be present too.
    for (const hero of ALL_PATIENTS) {
      expect(patientEntryIds.has(hero.id)).toBe(true);
    }
  });
});
