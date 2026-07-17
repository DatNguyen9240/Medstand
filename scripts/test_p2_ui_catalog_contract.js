const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'chatbot-widget/js/chatbot-api-engine.js'), 'utf8');

const checks = [
  ['catalog reads P1-04 records envelope', /res\.records\s*\|\|\s*res\.data/],
  ['catalog still accepts legacy array', /Array\.isArray\(res\)/],
  ['menu stores only public API code', /data-code="'\s*\+\s*_esc\(a\.ApiCode\)/],
];

let failed = 0;
for (const [name, pattern] of checks) {
  const ok = pattern.test(source);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
