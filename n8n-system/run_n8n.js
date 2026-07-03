// n8n-system/run_n8n.js
const { spawn } = require('child_process');
const path = require('path');

// Dung duong dan tuyet doi den npx portable, khong phu thuoc bien moi truong
const NODE_DIR = path.join(__dirname, '.bin', 'node-v22.14.0-win-x64');
const npxCmd = path.join(NODE_DIR, 'npx.cmd');
const n8nBin = path.join(__dirname, 'n8n_data', 'npm_global', 'node_modules', 'n8n', 'bin', 'n8n');

console.log(`[run_n8n] Starting n8n...`);

// Thu chay truc tiep n8n binary neu co, fallback npx
const useDirectBin = require('fs').existsSync(n8nBin);
const args = useDirectBin ? [n8nBin, 'start'] : ['n8n', 'start'];
const cmd = useDirectBin ? path.join(NODE_DIR, 'node.exe') : npxCmd;

const child = spawn(cmd, args, {
  stdio: 'inherit',
  shell: false,          // Khong mo cua so CMD moi
  windowsHide: true,     // An cua so tren Windows
  cwd: path.join(__dirname, '..')
});

child.on('exit', (code) => {
  console.log(`[run_n8n] n8n exited with code ${code}`);
  process.exit(code || 0);
});
