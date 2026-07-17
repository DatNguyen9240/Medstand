const fs = require('fs');
const path = require('path');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const root = path.join(__dirname, '..');
const runnerPath = path.join(root, 'scripts', 'regression', 'test_runner.js');
const configPath = path.join(root, 'scripts', 'regression', 'config.js');
const weeklyDbTestPath = path.join(root, 'scripts', 'test_weekly_sales_chart.js');
const runner = fs.readFileSync(runnerPath, 'utf8');
const config = fs.readFileSync(configPath, 'utf8');
const weeklyDbTest = fs.readFileSync(weeklyDbTestPath, 'utf8');

assert(!/\/api\/login/i.test(runner), 'Regression runner must not call the UAT login endpoint.');
assert(!/password\s*:\s*['"`]/i.test(runner), 'Regression runner must not contain a password literal.');
assert(!/SIMULATED_SALES_TOKEN_LOCAL/.test(config), 'Regression config must not fall back to a simulated token.');
assert(!/CHAT_API_KEY:\s*process\.env\.CHAT_API_KEY\s*\|\|\s*['"`]/.test(config), 'Chat API key must not have a literal fallback.');
assert(/process\.env\.UAT_ADMIN_TOKEN/.test(config), 'Admin token must come from the environment.');
assert(/process\.env\.UAT_NORTH_TOKEN/.test(config), 'North token must come from the environment.');
assert(/process\.env\.UAT_CENTRAL_TOKEN/.test(config), 'Central token must come from the environment.');
assert(/process\.env\.UAT_SOUTH_TOKEN/.test(config), 'South token must come from the environment.');
assert(/getMissingTokenReason/.test(runner), 'Runner must skip token-dependent cases when credentials are absent.');
assert(/require\.main === module/.test(runner), 'Runner must execute only when invoked directly.');
assert(!/password\s*:\s*['"`][^'"`]+['"`]/i.test(weeklyDbTest), 'Weekly chart DB test must not contain a password literal.');
assert(/process\.env\.TEST_DB_PASSWORD/.test(weeklyDbTest), 'Weekly chart DB password must come from the environment.');

console.log('Regression credential safety contract: PASS');
