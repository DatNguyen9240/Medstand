const path = require('path');
const fs = require('fs');

const rootEnvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(rootEnvPath)) {
  for (const line of fs.readFileSync(rootEnvPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

// Force local portable environment variables
process.env.N8N_USER_FOLDER = path.join(__dirname, 'n8n_data');
process.env.PM2_HOME = path.join(process.env.N8N_USER_FOLDER, '.pm2');
process.env.NODE_PATH = path.join(__dirname, 'n8n_data', 'npm_global', 'node_modules');
const setDefault = (key, value) => {
  if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value;
};

setDefault('N8N_PORT', '5678');
setDefault('N8N_HOST', '127.0.0.1');
setDefault('N8N_LISTEN_ADDRESS', '127.0.0.1');
setDefault('N8N_PROTOCOL', 'http');
setDefault('N8N_DEFAULT_CORS', 'true');
setDefault('N8N_CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000,https://medtest.bms7.net');
setDefault('N8N_CORS_ALLOWED_METHODS', 'POST,OPTIONS');
setDefault('N8N_CORS_ALLOWED_HEADERS', 'Content-Type,Authorization,x-api-key');
setDefault('EXECUTIONS_DATA_MAX_AGE', '72');
setDefault('EXECUTIONS_DATA_PRUNE', 'true');
setDefault('GENERIC_TIMEZONE', 'Asia/Ho_Chi_Minh');
setDefault('N8N_LOG_LEVEL', 'debug');
setDefault('N8N_LOG_OUTPUT', 'console');
setDefault('N8N_VERSION_NOTIFICATIONS_ENABLED', 'false');
setDefault('N8N_DIAGNOSTICS_ENABLED', 'false');
setDefault('N8N_HIRING_BANNER_ENABLED', 'false');
setDefault('N8N_BASIC_AUTH_ACTIVE', 'false');
setDefault('N8N_BLOCK_ENV_ACCESS_IN_NODE', 'false');
setDefault('N8N_DISABLE_TASK_RUNNERS', 'true');
setDefault('NODES_EXCLUDE', '[]');
setDefault('RAG_MALWARE_SCANNER_READY', 'true');
setDefault('RAG_SCAN_SCRIPT', path.join(__dirname, '..', 'scripts', 'rag001_scan_file.ps1'));
setDefault('RAG_QUARANTINE_DIR', path.join(__dirname, 'n8n_data', 'rag-quarantine'));
fs.mkdirSync(process.env.RAG_QUARANTINE_DIR, { recursive: true });

const { spawn } = require('child_process');

// Duong dan tuyet doi den Node.js Portable
const NODE_DIR = path.join(__dirname, '.bin', 'node-v22.14.0-win-x64');
const nodeExe = path.join(NODE_DIR, 'node.exe');
const npxCmd  = path.join(NODE_DIR, 'npx.cmd');

// Kiem tra n8n global co hop le khong (package.json phai ton tai)
const n8nBin     = path.join(__dirname, 'n8n_data', 'npm_global', 'node_modules', 'n8n', 'bin', 'n8n');
const n8nPkgJson = path.join(__dirname, 'n8n_data', 'npm_global', 'node_modules', 'n8n', 'package.json');
const n8nOk = fs.existsSync(n8nBin) && fs.existsSync(n8nPkgJson);

let cmd, args;
if (n8nOk) {
  // Chay truc tiep — nhanh nhat, khong can shell
  cmd  = nodeExe;
  args = [n8nBin, 'start'];
  console.log('[run_n8n] Using local n8n binary.');
} else {
  // Fallback: dung npx de chay (tu dong tai neu chua co)
  cmd  = npxCmd;
  args = ['n8n', 'start'];
  console.log('[run_n8n] Local n8n missing/broken — falling back to npx.');
}

const child = spawn(cmd, args, {
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
  cwd: path.join(__dirname, '..')
});

child.on('exit', (code) => {
  console.log(`[run_n8n] n8n exited with code ${code}`);
  process.exit(code || 0);
});
