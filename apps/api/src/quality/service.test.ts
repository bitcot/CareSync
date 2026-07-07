import { AuthTokenPayload } from '../auth/jwt';
import { FhirReadService } from '../fhir/client';
import { getDiabetesHba1cMeasure, ILLUSTRATIVE_DOLLARS_PER_CLOSED_GAP } from './service';

const coordinator: AuthTokenPayload = { id: 'coord-1', name: 'Cara Coordinator', role: 'coordinator' };

// S11 A2 — pure arithmetic over `getResourceCountByCode`'s two counts,
// stubbed here so the math is unit-tested in isolation from any real HAPI
// call (the real-network case is already covered by
// fhir/client.test.ts's getResourceCountByCode suite).
describe('getDiabetesHba1cMeasure (S11 A2 — real HEDIS diabetes/HbA1c care-gap measure)', () => {
  function stubFhirService(denominator: number, numerator: number): FhirReadService {
    const getResourceCountByCode = jest
      .fn()
      .mockImplementationOnce(async () => denominator) // Condition E11.9 called first
      .mockImplementationOnce(async () => numerator); // Observation 4548-4 called second
    return { getResourceCountByCode } as unknown as FhirReadService;
  }

  it('computes rate, gapPatients, and illustrativeIncentiveDollars from the two real counts', async () => {
    const fhirService = stubFhirService(286, 1);
    const result = await getDiabetesHba1cMeasure(coordinator, fhirService);

    expect(result).toEqual({
      measureId: 'diabetes-hba1c-testing',
      measureName: 'Comprehensive Diabetes Care: HbA1c Testing',
      denominator: 286,
      numerator: 1,
      rate: 1 / 286,
      gapPatients: 285,
      illustrativeIncentiveDollars: 285 * ILLUSTRATIVE_DOLLARS_PER_CLOSED_GAP,
    });
  });

  it('guards against divide-by-zero: rate is 0 (not NaN) when the denominator is 0', async () => {
    const fhirService = stubFhirService(0, 0);
    const result = await getDiabetesHba1cMeasure(coordinator, fhirService);

    expect(result.rate).toBe(0);
    expect(result.gapPatients).toBe(0);
    expect(result.illustrativeIncentiveDollars).toBe(0);
  });

  it('calls getResourceCountByCode with the exact diabetes Condition (ICD-10-CM E11.9) and HbA1c Observation (LOINC 4548-4) codes', async () => {
    const getResourceCountByCode = jest.fn().mockResolvedValueOnce(286).mockResolvedValueOnce(1);
    const fhirService = { getResourceCountByCode } as unknown as FhirReadService;

    await getDiabetesHba1cMeasure(coordinator, fhirService);

    expect(getResourceCountByCode).toHaveBeenCalledWith(coordinator, 'Condition', 'http://hl7.org/fhir/sid/icd-10-cm', 'E11.9');
    expect(getResourceCountByCode).toHaveBeenCalledWith(coordinator, 'Observation', 'http://loinc.org', '4548-4');
  });
});
