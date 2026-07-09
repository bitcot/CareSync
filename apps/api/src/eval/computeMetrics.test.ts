import { computeMetrics, tallyConfusionMatrix, classificationMetricsFromMatrix, LabelRow, PatientFindings } from './computeMetrics';

// Hand-built, fixed fixture (S9 A2 — Seam 4, TDD) — deliberately NOT derived
// from data/eval/labels.json, so this test pins computeMetrics' arithmetic
// against a known, hand-computed expected output, independent of any future
// edit to the committed label file.
//
// p1: expected true/true/true, agent predicts true/true/true  -> agree everywhere
// p2: expected false/false/false, agent predicts false/false/false -> agree everywhere
// p3: expected true/false/true, agent predicts false/false/false -> careGap FN, risk TN, sdoh disagree
// p4: expected false/true/false, agent predicts true/true/false -> careGap FP, risk TP, sdoh agree
// p5: expected null/null/null (unlabeled — must be excluded from all three tallies)
const labels: LabelRow[] = [
  {
    patientId: 'p1',
    source: 'dev',
    clinicianOverride: null,
    careGap: { expectedHasGap: true, notes: 'fixture' },
    risk: { expectedHighRisk: true, notes: 'fixture' },
    sdoh: { expectedHasBarrier: true, notes: 'fixture' },
  },
  {
    patientId: 'p2',
    source: 'dev',
    clinicianOverride: null,
    careGap: { expectedHasGap: false, notes: 'fixture' },
    risk: { expectedHighRisk: false, notes: 'fixture' },
    sdoh: { expectedHasBarrier: false, notes: 'fixture' },
  },
  {
    patientId: 'p3',
    source: 'dev',
    clinicianOverride: null,
    careGap: { expectedHasGap: true, notes: 'fixture' },
    risk: { expectedHighRisk: false, notes: 'fixture' },
    sdoh: { expectedHasBarrier: true, notes: 'fixture' },
  },
  {
    patientId: 'p4',
    source: 'dev',
    clinicianOverride: null,
    careGap: { expectedHasGap: false, notes: 'fixture' },
    risk: { expectedHighRisk: true, notes: 'fixture' },
    sdoh: { expectedHasBarrier: false, notes: 'fixture' },
  },
  {
    patientId: 'p5',
    source: 'dev',
    clinicianOverride: null,
    careGap: { expectedHasGap: null, notes: 'fixture — unlabeled' },
    risk: { expectedHighRisk: null, notes: 'fixture — unlabeled' },
    sdoh: { expectedHasBarrier: null, notes: 'fixture — unlabeled' },
  },
];

const findings: PatientFindings[] = [
  {
    patientId: 'p1',
    careGap: { findings: [{ gapType: 'HbA1c monitoring', description: 'x', urgency: 'high', fhirResourceId: 'Condition/1' }] },
    risk: { findings: [], complete: { riskLevel: 'critical' } },
    sdoh: { findings: [{ domain: 'housing', finding: 'x', severity: 'high', fhirResourceId: 'Observation/1' }] },
    actionPlanner: { tasks: [{ id: 't1', title: 'Task A', description: 'x', priority: 'high', fhirResources: ['Condition/1'] }] },
  },
  {
    patientId: 'p2',
    careGap: { findings: [] },
    risk: { findings: [], complete: { riskLevel: 'low' } },
    sdoh: { findings: [] },
    actionPlanner: { tasks: [] },
  },
  {
    patientId: 'p3',
    careGap: { findings: [] },
    risk: { findings: [], complete: { riskLevel: 'moderate' } },
    sdoh: { findings: [] },
    // no actionPlanner entry — must be excluded from the notes pass-through
  },
  {
    patientId: 'p4',
    careGap: { findings: [{ gapType: 'BNP monitoring', description: 'x', urgency: 'medium', fhirResourceId: 'Condition/4' }] },
    risk: { findings: [], complete: { riskLevel: 'high' } },
    sdoh: { findings: [] },
    // no actionPlanner entry — must be excluded from the notes pass-through
  },
  {
    patientId: 'p5',
    careGap: { findings: [{ gapType: 'irrelevant', description: 'x', urgency: 'low', fhirResourceId: 'Condition/5' }] },
    risk: { findings: [], complete: { riskLevel: 'critical' } },
    sdoh: { findings: [] },
    actionPlanner: {
      tasks: [
        { id: 't2', title: 'Task B', description: 'x', priority: 'medium', fhirResources: ['Condition/5'] },
        { id: 't3', title: 'Task C', description: 'x', priority: 'low', fhirResources: ['Condition/5'] },
      ],
    },
  },
];

describe('tallyConfusionMatrix (Seam 4 helper)', () => {
  it('tallies TP/TN/FP/FN from expected/predicted pairs', () => {
    expect(
      tallyConfusionMatrix([
        { expected: true, predicted: true },
        { expected: false, predicted: false },
        { expected: true, predicted: false },
        { expected: false, predicted: true },
      ])
    ).toEqual({ truePositive: 1, trueNegative: 1, falsePositive: 1, falseNegative: 1 });
  });

  it('returns all zeros for an empty input', () => {
    expect(tallyConfusionMatrix([])).toEqual({ truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 });
  });
});

describe('classificationMetricsFromMatrix (Seam 4 helper)', () => {
  it('computes sensitivity/specificity/ppv from a balanced matrix', () => {
    expect(
      classificationMetricsFromMatrix({ truePositive: 1, trueNegative: 1, falsePositive: 1, falseNegative: 1 })
    ).toEqual({ sensitivity: 0.5, specificity: 0.5, ppv: 0.5 });
  });

  it('returns null (not NaN/0) for a metric whose denominator is zero', () => {
    expect(
      classificationMetricsFromMatrix({ truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 })
    ).toEqual({ sensitivity: null, specificity: null, ppv: null });
  });
});

describe('computeMetrics (Seam 4 — S9 A2, pure, fixed fixture)', () => {
  it('matches the hand-computed expected output exactly', () => {
    const result = computeMetrics(labels, findings);

    expect(result.careGap).toEqual({
      sensitivity: 0.5,
      specificity: 0.5,
      ppv: 0.5,
      matrix: { truePositive: 1, trueNegative: 1, falsePositive: 1, falseNegative: 1 },
      labeledCount: 4,
    });

    expect(result.risk).toEqual({
      sensitivity: 1,
      specificity: 1,
      ppv: 1,
      matrix: { truePositive: 2, trueNegative: 2, falsePositive: 0, falseNegative: 0 },
      labeledCount: 4,
    });

    expect(result.sdoh).toEqual({
      agreementRate: 0.75,
      agreements: 3,
      total: 4,
      // p1 expected=true/predicted=true → TP; p2 expected=false/predicted=false → TN;
      // p3 expected=true/predicted=false → FN; p4 expected=false/predicted=false → TN.
      matrix: { truePositive: 1, trueNegative: 2, falsePositive: 0, falseNegative: 1 },
    });

    expect(result.actionPlanner.notes).toEqual([
      { patientId: 'p1', taskCount: 1, taskTitles: ['Task A'] },
      { patientId: 'p2', taskCount: 0, taskTitles: [] },
      { patientId: 'p5', taskCount: 2, taskTitles: ['Task B', 'Task C'] },
    ]);
  });

  it('excludes a patient with no findings entry at all from every dimension', () => {
    const result = computeMetrics(
      [
        {
          patientId: 'not-run',
          source: 'dev',
          clinicianOverride: null,
          careGap: { expectedHasGap: true, notes: 'fixture' },
          risk: { expectedHighRisk: true, notes: 'fixture' },
          sdoh: { expectedHasBarrier: true, notes: 'fixture' },
        },
      ],
      []
    );

    expect(result.careGap.labeledCount).toBe(0);
    expect(result.risk.labeledCount).toBe(0);
    expect(result.sdoh.total).toBe(0);
    expect(result.actionPlanner.notes).toEqual([]);
  });
});
