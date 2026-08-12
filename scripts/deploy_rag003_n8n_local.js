'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const nodeExe = path.join(root, 'n8n-system', '.bin', 'node-v22.14.0-win-x64', 'node.exe');
const n8n = path.join(root, 'n8n-system', 'n8n_data', 'npm_global', 'node_modules', 'n8n', 'bin', 'n8n');
const workflows = [
  { id: 'HQa6xx7flcNcC1oU', file: 'n8n/AI_Core/AI_Upload_Reader.json', activate: true },
  { id: 'actVwBhqMGLQ6cSH', file: 'n8n/AI_Core/AI_RAG_Query.json', activate: true },
];

function run(args) {
  const env = {
    ...process.env,
    N8N_USER_FOLDER: path.join(root, 'n8n-system', 'n8n_data'),
    NODE_PATH: path.join(root, 'n8n-system', 'n8n_data', 'npm_global', 'node_modules'),
    N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_SKIP_AUTH_ON_OAUTH_CALLBACK: 'true',
  };
  const result = spawnSync(nodeExe, [n8n, ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (result.status !== 0) throw new Error((result.error && result.error.message) || (result.stderr || result.stdout || '').trim() || `n8n exited ${result.status}`);
  return result.stdout;
}

function main() {
  const deployed = [];
  for (const workflow of workflows) {
    const sourcePath = path.join(root, workflow.file);
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    if (workflow.id && source.id !== workflow.id) throw new Error(`Workflow ID không khớp: ${workflow.file}`);
    run(['import:workflow', '--input', sourcePath]);
    const workflowID = workflow.id || source.id;
    if (workflow.activate && workflowID) {
      run(['publish:workflow', '--id', workflowID]);
      run(['update:workflow', '--id', workflowID, '--active', 'true']);
    }
    deployed.push({
      file: workflow.file,
      workflowID: workflowID || null,
      activeRequested: workflow.activate,
      sha256: crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex'),
    });
  }
  console.log(JSON.stringify({ task: 'RAG-003-N8N-LOCAL-DEPLOY', status: 'DEPLOYED', workflows: deployed }, null, 2));
}

try { main(); } catch (error) {
  console.error(JSON.stringify({ task: 'RAG-003-N8N-LOCAL-DEPLOY', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
}
