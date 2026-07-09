import { test, expect } from '@playwright/test';

// UI Evaluator Notes — chart-caption only. After the page-level "Why this
// matters" notes were pulled back (per user feedback — captions live ONLY
// under their chart, not in the page header), only the three pages that
// render charts get a check:
//   /population    → scatter chart caption (rendered inline under
//                    RiskScatterChart in Population.tsx)
//   /governance    → 2 captions (parity radar + confidence chart, each
//                    driven by the page passing a `caption=` prop)
//   /quality       → 1 caption (quality gauge)
// Pages without charts (PatientDetail, Sdoh, TaskManagement, CostROI) are
// out of scope for this e2e — they no longer render an InfoNote at all.
test.describe('UI Evaluator Notes — chart captions only', () => {
  // Long timeouts on every expect — the dev API is cold-started by the
  // first login and subsequent logins can take 8–12s for /api/login to
  // round-trip; matches the existing director-governance.spec.ts pattern
  // that uses { timeout: 15_000 } for the same reason.
  const HEADING_TIMEOUT = 15_000;

  test('director sees the scatter chart caption on /population', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('director@caresync.demo');
    await page.getByLabel('Password').fill('Demo1234!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/population$/, { timeout: 15_000 });

    await expect(
      page.getByText('Reading this chart').first()
    ).toBeVisible({ timeout: HEADING_TIMEOUT });
  });

  test('director sees the parity radar + confidence chart captions on /governance', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('director@caresync.demo');
    await page.getByLabel('Password').fill('Demo1234!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/population$/, { timeout: 15_000 });

    await page.goto('/governance');
    await expect(page.getByRole('heading', { name: 'AI Governance Center' })).toBeVisible({
      timeout: HEADING_TIMEOUT,
    });
    // Two charts → two captions.
    const chartCaptions = page.getByText('Reading this chart');
    await expect(chartCaptions.nth(0)).toBeVisible({ timeout: HEADING_TIMEOUT });
    await expect(chartCaptions.nth(1)).toBeVisible({ timeout: HEADING_TIMEOUT });
  });

  test('director sees the gauge caption on /quality', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('director@caresync.demo');
    await page.getByLabel('Password').fill('Demo1234!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/population$/, { timeout: 15_000 });

    await page.goto('/quality');
    await expect(page.getByRole('heading', { name: /Quality/i })).toBeVisible({
      timeout: HEADING_TIMEOUT,
    });
    await expect(page.getByText('Reading this chart')).toBeVisible({ timeout: HEADING_TIMEOUT });
  });
});