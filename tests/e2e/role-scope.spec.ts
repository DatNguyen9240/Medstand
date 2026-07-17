import { test, expect } from '@playwright/test';
import { attachJson, postWebhook, roleToken, writeReport } from './helpers';

test('@chatbot tampered identity fields never expand authority', async ({ request }, testInfo) => {
  const token = roleToken(testInfo.project.name);
  const attempts = [
    { '@EmployeeID': 'P2-TAMPER-EMPLOYEE' },
    { '@BranchID': 'P2-TAMPER-BRANCH' },
    { '@Username': 'P2-TAMPER-USERNAME' },
  ];
  const baselineResponse = await postWebhook(request, 'api-execute', token, { ApiCode: '@tuyen_ban_hang', params: {} });
  expect(baselineResponse.status()).toBe(200);
  const baseline = await baselineResponse.json();
  expect(baseline.requestId).toMatch(/^req-/);
  const baselineRows = Array.isArray(baseline.data) ? baseline.data : [];
  const evidence: any[] = [];
  for (const params of attempts) {
    const response = await postWebhook(request, 'api-execute', token, { ApiCode: '@tuyen_ban_hang', params });
    expect([200, 403, 422]).toContain(response.status());
    const body = await response.json();
    expect(body.requestId).toMatch(/^req-/);
    expect(response.headers()['x-request-id']).toBe(body.requestId);
    if (response.status() === 200) {
      expect(body.data, `${Object.keys(params)[0]} must not change scoped rows`).toEqual(baselineRows);
      expect(Number(body.count || 0)).toBe(Number(baseline.count || 0));
    }
    evidence.push({ field: Object.keys(params)[0], status: response.status(), code: body.code, requestId: body.requestId, rowCount: Number(body.count || 0), sameAsScopedBaseline: response.status() === 200 });
  }
  const report = { baselineRequestId: baseline.requestId, baselineCount: Number(baseline.count || 0), attempts: evidence };
  writeReport(`p2-02-${testInfo.project.name}-scope.json`, report);
  await attachJson(testInfo, `p2-02-${testInfo.project.name}-scope`, report);
});
