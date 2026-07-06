import { Router } from 'express';

/**
 * Load-bearing beyond this task: S10 A2's service endpoint is mounted at
 * `POST /cds-services/{id}`, i.e. `POST /cds-services/caresync-patient-view`,
 * so this discovery descriptor's `id` must match that route exactly for a
 * CDS Hooks client to find it. Exported (mirrors `riskAgent.ts`'s exported
 * `MODEL`) so A2 can `import { CDS_PATIENT_VIEW_SERVICE_ID } from
 * './cdsHooks'` and reuse this exact value for its route path/match, instead
 * of a second literal that could drift from this one.
 */
export const CDS_PATIENT_VIEW_SERVICE_ID = 'caresync-patient-view';

/**
 * S10 A1 — CDS Hooks discovery endpoint (`GET /cds-services`), per the CDS
 * Hooks spec (https://cds-hooks.org/specification/current/#discovery). NOT
 * behind `requireAuth` — the public CDS Hooks sandbox that calls this has no
 * CareSync session token, unlike every other router in this repo.
 */
export function createCdsHooksRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      services: [
        {
          hook: 'patient-view',
          title: 'CareSync AI Patient-View Findings',
          description:
            "Returns CareSync AI's validated risk/care-gap/SDOH findings for the patient in context, with FHIR citations.",
          id: CDS_PATIENT_VIEW_SERVICE_ID,
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
          },
        },
      ],
    });
  });

  return router;
}
