import { test, expect } from '@playwright/test';
import { postWebhook } from './helpers';

test('@chatbot guest is rejected by UI guard and API', async ({ page, request }) => {
  await page.goto('/#/chatbot');
  await expect(page).toHaveURL(/\/pages\/login\.html/);

  const response = await postWebhook(request, 'api-execute', '', { ApiCode: '@tuyen_ban_hang', params: {} });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.code).toBe('AUTH_TOKEN_MISSING');
  expect(body.requestId).toMatch(/^req-/);
  expect(response.headers()['x-request-id']).toBe(body.requestId);
});
