const path = require('path');
const fs = require('fs');

// Force local portable environment variables
process.env.N8N_USER_FOLDER = path.join(__dirname, 'n8n_data');
process.env.PM2_HOME = path.join(process.env.N8N_USER_FOLDER, '.pm2');
process.env.NODE_PATH = path.join(__dirname, 'n8n_data', 'npm_global', 'node_modules');
process.env.N8N_PORT = "5678";
process.env.N8N_HOST = "0.0.0.0";
process.env.N8N_LISTEN_ADDRESS = "0.0.0.0";
process.env.N8N_PROTOCOL = "http";
process.env.N8N_DEFAULT_CORS = "true";
process.env.N8N_CORS_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,https://medtest.bms79.com";
process.env.N8N_CORS_ALLOWED_METHODS = "POST,OPTIONS";
process.env.N8N_CORS_ALLOWED_HEADERS = "Content-Type,Authorization,x-api-key";
process.env.EXECUTIONS_DATA_MAX_AGE = "72";
process.env.EXECUTIONS_DATA_PRUNE = "true";
process.env.GENERIC_TIMEZONE = "Asia/Ho_Chi_Minh";
process.env.N8N_LOG_LEVEL = "debug";
process.env.N8N_LOG_OUTPUT = "console";
process.env.N8N_VERSION_NOTIFICATIONS_ENABLED = "false";
process.env.N8N_DIAGNOSTICS_ENABLED = "false";
process.env.N8N_HIRING_BANNER_ENABLED = "false";
process.env.N8N_BASIC_AUTH_ACTIVE = "false";
process.env.N8N_BLOCK_ENV_ACCESS_IN_NODE = "false";
process.env.N8N_DISABLE_TASK_RUNNERS = "true";

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
  shell: true,
  windowsHide: true,
  cwd: path.join(__dirname, '..')
});

child.on('exit', (code) => {
  console.log(`[run_n8n] n8n exited with code ${code}`);
  process.exit(code || 0);
});
