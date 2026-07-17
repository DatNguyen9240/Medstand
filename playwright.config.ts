import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv(path.resolve('.env.uat.local'));

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'reports/evidence/p2-playwright-results.json' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: false,
  },
  projects: [
    { name: 'guest', testMatch: /guest\.spec\.ts/ },
    { name: 'manager', testIgnore: /guest\.spec\.ts/, use: { storageState: 'tests/.auth/manager.json' } },
    { name: 'tdv', testIgnore: /guest\.spec\.ts/, use: { storageState: 'tests/.auth/tdv.json' } },
  ],
});
