// n8n-system/run_n8n.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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
