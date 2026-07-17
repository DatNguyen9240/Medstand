import { expect, APIRequestContext, Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const n8nBase = process.env.E2E_N8N_URL || 'http://127.0.0.1:5678';

export function roleToken(projectName: string): string {
  if (projectName === 'manager') return process.env.UAT_MANAGER_TOKEN || '';
  if (projectName === 'tdv') return process.env.UAT_TDV_TOKEN || '';
  return '';
}

export async function postWebhook(request: APIRequestContext, path: string, token: string, data: unknown) {
  return request.post(`${n8nBase}/webhook/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}`, Origin: 'https://medtest.bms79.com' } : { Origin: 'https://medtest.bms79.com' },
    data,
  });
}

export function responseList(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.records)) return body.records;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

export async function openChatbot(page: Page) {
  await page.goto('/#/chatbot');
  await expect(page.locator('#chat-input')).toBeVisible();
  await expect(page.locator('#btn-api')).toBeVisible();
}

export async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, { body: Buffer.from(JSON.stringify(value, null, 2)), contentType: 'application/json' });
}

export function writeReport(name: string, value: unknown) {
  const dir = path.resolve('reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
}
