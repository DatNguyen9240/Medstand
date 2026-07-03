// n8n-system/run_n8n.js
const { spawn } = require('child_process');
const path = require('path');

const npxCmd = process.env.npx_cmd || 'npx';

console.log(`[run_n8n] Spawning n8n via: ${npxCmd} n8n start`);

const child = spawn(npxCmd, ['n8n', 'start'], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..')
});

child.on('exit', (code) => {
  console.log(`[run_n8n] n8n process exited with code ${code}`);
  process.exit(code || 0);
});
