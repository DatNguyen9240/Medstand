import { test, expect } from '@playwright/test';
import { attachJson, n8nBase, openChatbot, postWebhook, roleToken, writeReport } from './helpers';

test('@chatbot CART navigation does not execute mutation before submit', async ({ page }, testInfo) => {
  await openChatbot(page);
  let mutationCalls = 0;
  page.on('request', req => {
    if (req.url().includes('/webhook/api-execute') && req.postData()?.includes('@lap_don_hang')) mutationCalls++;
  });
  await page.evaluate(() => (window as any).ApiEngine.selectApi('@lap_don_hang'));
  await expect(page.locator('#ae-panel')).toBeVisible();
  await page.waitForTimeout(750);
  expect(mutationCalls).toBe(0);
  await attachJson(testInfo, `p2-04-${testInfo.project.name}-cart-navigation`, { mutationCallsBeforeSubmit: mutationCalls, result: 'PASS' });
});

test('@mutation sandbox submit is guarded by explicit opt-in and sandbox URL', async ({ request }, testInfo) => {
  test.skip(process.env.RUN_MUTATION_TESTS !== 'true', 'RUN_MUTATION_TESTS is not true');
  test.skip(!/sandbox|uat/i.test(n8nBase), `Mutation target is not identified as sandbox: ${n8nBase}`);
  const token = roleToken(testInfo.project.name);
  const key = `p2-${testInfo.project.name}-${Date.now()}`;
  const response = await request.post(`${n8nBase}/webhook/api-execute`, {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://medtest.bms79.com', 'Idempotency-Key': key },
    data: { ApiCode: '@lap_don_hang', params: { '@P2DryRun': true } },
  });
  expect([200, 403, 422]).toContain(response.status());
  const body = await response.json();
  expect(body.requestId).toMatch(/^req-/);
  await attachJson(testInfo, `p2-04-${testInfo.project.name}-mutation`, { status: response.status(), code: body.code, requestId: body.requestId, cleanup: 'required-by-sandbox-fixture' });
});

test('@mutation authorization fails closed before SQL for read-only roles', async ({ request }, testInfo) => {
  const token = roleToken(testInfo.project.name);
  const cases = [
    { apiCode: '@cap_nhat_ket_qua_khao_sat', code: 'API_NOT_ALLOWLISTED' },
    { apiCode: '@khach_hang_insert', code: 'CAPABILITY_REQUIRED' },
    { apiCode: '@san_pham_trong_tam_import', code: 'CAPABILITY_REQUIRED' },
    { apiCode: '@lap_don_hang', code: 'CAPABILITY_REQUIRED' },
  ];
  const results = [];

  for (const item of cases) {
    const idempotencyKey = `p204-${testInfo.project.name}-${item.apiCode.slice(1)}-${Date.now()}`;
    const response = await request.post(`${n8nBase}/webhook/api-execute`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://medtest.bms79.com',
        'Idempotency-Key': idempotencyKey,
      },
      data: { ApiCode: item.apiCode, params: {} },
    });
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(403);
    expect(body.code).toBe(item.code);
    expect(body.requestId).toMatch(/^req-/);
    results.push({ apiCode: item.apiCode, status: response.status(), code: body.code, requestId: body.requestId });
  }

  writeReport(`p2-04-${testInfo.project.name}-mutation-denied.json`, { role: testInfo.project.name, results });
  await attachJson(testInfo, `p2-04-${testInfo.project.name}-mutation-denied`, results);
});
