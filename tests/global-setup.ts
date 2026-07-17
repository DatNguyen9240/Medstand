import fs from 'node:fs';
import path from 'node:path';

function decodeClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

function identity(token: string, role: string) {
  const c = decodeClaims(token);
  return {
    UserName: c.UserName || c.Username || c.unique_name || c.sub || role,
    Username: c.UserName || c.Username || c.unique_name || c.sub || role,
    EmployeeID: c.EmployeeID || '',
    BranchID: c.BranchID || '',
    ManagerID: c.ManagerID || '',
    Role: role,
  };
}

export default async function globalSetup() {
  const baseURL = new URL(process.env.E2E_BASE_URL || 'http://localhost:3000');
  const authDir = path.resolve('tests/.auth');
  fs.mkdirSync(authDir, { recursive: true });

  for (const [role, envName] of [['manager', 'UAT_MANAGER_TOKEN'], ['tdv', 'UAT_TDV_TOKEN']] as const) {
    const token = process.env[envName] || '';
    if (!token) throw new Error(`Missing ${envName} in .env.uat.local`);
    const state = {
      cookies: [{
        name: 'auth_token', value: token, domain: baseURL.hostname, path: '/',
        expires: -1, httpOnly: false, secure: baseURL.protocol === 'https:', sameSite: 'Lax' as const,
      }],
      origins: [{
        origin: baseURL.origin,
        localStorage: [{ name: 'auth_user', value: JSON.stringify(identity(token, role)) }],
      }],
    };
    fs.writeFileSync(path.join(authDir, `${role}.json`), JSON.stringify(state, null, 2));
  }
}
