'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const nodeExe = path.join(root, 'n8n-system', '.bin', 'node-v22.14.0-win-x64', 'node.exe');
const n8n = path.join(root, 'n8n-system', 'n8n_data', 'npm_global', 'node_modules', 'n8n', 'bin', 'n8n');
const sourcePath = path.join(root, 'n8n', 'AI_Core', 'AI_Upload_Reader.json');
const id = 'HQa6xx7flcNcC1oU';
const backupPath = path.join(root, '.tmp', `rag002-n8n-backup-${Date.now()}.json`);

function run(args) {
  const env = { ...process.env, N8N_USER_FOLDER: path.join(root, 'n8n-system', 'n8n_data'), NODE_PATH: path.join(root, 'n8n-system', 'n8n_data', 'npm_global', 'node_modules'), N8N_VERSION_NOTIFICATIONS_ENABLED: 'false', N8N_DIAGNOSTICS_ENABLED: 'false', N8N_SKIP_AUTH_ON_OAUTH_CALLBACK: 'true' };
  const result = spawnSync(nodeExe, [n8n, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (result.status !== 0) throw new Error((result.error && result.error.message) || (result.stderr || result.stdout || '').trim() || `n8n exited ${result.status}`);
  return result.stdout;
}

function main() {
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  run(['export:workflow', '--id', id, '--output', backupPath]);
  const before = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const backupSha256 = crypto.createHash('sha256').update(JSON.stringify(before)).digest('hex');
  const sourceSha256 = crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
  fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2) + '\n');
  run(['import:workflow', '--input', sourcePath]);
  run(['publish:workflow', '--id', id]);
  run(['update:workflow', '--id', id, '--active', 'true']);
  if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  console.log(JSON.stringify({ task: 'RAG-002-N8N-LOCAL-DEPLOY', status: 'DEPLOYED', workflowID: id, backupPath: path.relative(root, backupPath), backupSha256, sourceSha256 }, null, 2));
}

try { main(); } catch (error) {
  console.error(JSON.stringify({ task: 'RAG-002-N8N-LOCAL-DEPLOY', status: 'ERROR', backupPath: path.relative(root, backupPath), error: error.message }, null, 2));
  process.exitCode = 1;
}
