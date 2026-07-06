import { Router } from 'express';

/**
 * S10 A1 — CDS Hooks discovery endpoint (`GET /cds-services`), per the CDS
 * Hooks spec (https://cds-hooks.org/specification/current/#discovery). NOT
 * behind `requireAuth` — the public CDS Hooks sandbox that calls this has no
 * CareSync session token, unlike every other router in this repo.
 *
 * `id: 'caresync-patient-view'` is load-bearing beyond this task: S10 A2's
 * service endpoint is mounted at `POST /cds-services/{id}`, i.e.
 * `POST /cds-services/caresync-patient-view`, so this discovery descriptor's
 * `id` must match that route exactly for a CDS Hooks client to find it.
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
          id: 'caresync-patient-view',
          prefetch: {
            patient: 'Patient/{{context.patientId}}',
          },
        },
      ],
    });
  });

  return router;
}
