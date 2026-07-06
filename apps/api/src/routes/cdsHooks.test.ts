import express from 'express';
import request from 'supertest';
import { createCdsHooksRouter } from './cdsHooks';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/cds-services', createCdsHooksRouter());
  return app;
}

describe('CDS Hooks discovery route (S10 A1)', () => {
  it('lists the patient-view service with a well-formed descriptor, no auth required', async () => {
    const app = buildApp();

    const res = await request(app).get('/cds-services');

    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(1);

    const service = res.body.services[0];
    expect(service.hook).toBe('patient-view');
    expect(service.id).toBe('caresync-patient-view');
    expect(typeof service.title).toBe('string');
    expect(service.title.length).toBeGreaterThan(0);
    expect(typeof service.description).toBe('string');
    expect(service.description.length).toBeGreaterThan(0);
    expect(typeof service.prefetch).toBe('object');
    expect(service.prefetch).not.toBeNull();
  });
});
