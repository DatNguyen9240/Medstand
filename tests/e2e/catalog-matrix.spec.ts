import { test, expect } from '@playwright/test';
import { attachJson, openChatbot, postWebhook, responseList, roleToken, writeReport } from './helpers';

test('@chatbot role catalog metadata and UI menu match', async ({ page, request }, testInfo) => {
  const token = roleToken(testInfo.project.name);
  const response = await postWebhook(request, 'api-list-active', token, {});
  expect(response.status()).toBe(200);
  const body = await response.json();
  const list = responseList(body);
  expect(list.length).toBeGreaterThan(0);

  const codes = list.map(item => String(item.ApiCode || ''));
  expect(new Set(codes).size).toBe(codes.length);
  for (const item of list) {
    expect(item.ApiCode).toMatch(/^@/);
    expect(String(item.DisplayName || '').trim()).not.toBe('');
    expect(String(item.ExecutionType || '').trim()).not.toBe('');
    expect(item.DataSourceValue).toBeUndefined();
    expect(item.StoredProcedure).toBeUndefined();
  }

  await openChatbot(page);
  await page.locator('#btn-api').click();
  const menu = page.locator('#ae-menu .ae-menu-item');
  await expect(menu).toHaveCount(list.length);
  const uiCodes = await menu.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-code')));
  expect(uiCodes.sort()).toEqual([...codes].sort());

  const matrix = [];
  for (const item of list) {
    const configResponse = await postWebhook(request, 'api-get-config', token, { ApiCode: item.ApiCode });
    expect(configResponse.status(), item.ApiCode).toBe(200);
    const config = await configResponse.json();
    expect(config.requestId, item.ApiCode).toMatch(/^req-/);
    expect(config.StoredProcedure, item.ApiCode).toBeUndefined();
    expect(Array.isArray(config.filters), item.ApiCode).toBe(true);
    for (const field of config.filters) {
      expect(String(field.FieldCode || ''), `${item.ApiCode} FieldCode`).toMatch(/^@/);
      expect(String(field.FieldName || field.Placeholder || ''), `${item.ApiCode} field label`).not.toBe('');
      expect(String(field.ControlType || ''), `${item.ApiCode} ControlType`).not.toBe('');
      expect(field.IsSystemParam, `${item.ApiCode} system field`).not.toBe(1);
    }
    matrix.push({
      ApiCode: item.ApiCode,
      DisplayName: item.DisplayName,
      ExecutionType: item.ExecutionType,
      ContractVersion: config.contract?.version || null,
      FieldCount: config.filters.length,
      RequiredFieldCount: config.filters.filter((field: any) => field.Required || Number(field.IsRequired) === 1).length,
      ConfigRequestId: config.requestId,
      result: 'PASS',
    });
  }
  const report = {
    expectedRoleVisibleReadCommands: 24,
    legacyInventoryCount: 28,
    excludedByPolicy: [
      '@cap_nhat_ket_qua_khao_sat',
      '@khach_hang_insert',
      '@lap_don_hang',
      '@san_pham_trong_tam_import',
    ],
    liveCount: list.length,
    countDrift: list.length - 24,
    requestId: body.requestId || response.headers()['x-request-id'] || null,
    matrix,
  };
  writeReport(`p2-01-${testInfo.project.name}-matrix.json`, report);
  await attachJson(testInfo, `p2-01-${testInfo.project.name}-matrix`, report);
});

test('@chatbot responsive composer does not cover content', async ({ page }, testInfo) => {
  await openChatbot(page);
  const cases = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ];
  for (const viewport of cases) {
    for (const zoom of [0.8, 1, 1.25]) {
      // Browser zoom changes the effective CSS viewport; CSS `zoom` on body is
      // not equivalent and creates an artificial document overflow.
      const effectiveViewport = {
        width: Math.floor(viewport.width / zoom),
        height: Math.floor(viewport.height / zoom),
      };
      await page.setViewportSize(effectiveViewport);
      const input = await page.locator('#chat-input-bar').boundingBox();
      const container = await page.locator('#chat-container').boundingBox();
      expect(input, `${viewport.width}x${viewport.height} zoom ${zoom}`).not.toBeNull();
      expect(container, `${viewport.width}x${viewport.height} zoom ${zoom}`).not.toBeNull();
      expect(input!.y).toBeGreaterThanOrEqual(container!.y);
      expect(input!.y + input!.height).toBeLessThanOrEqual(effectiveViewport.height + 2);
    }
  }
  const report = { viewports: cases, zoom: [80, 100, 125], result: 'PASS' };
  writeReport(`p2-02-${testInfo.project.name}-viewports.json`, report);
  await attachJson(testInfo, `p2-02-${testInfo.project.name}-viewports`, report);
});
