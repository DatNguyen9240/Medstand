const fs = require('fs');
const path = require('path');
const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();

const readJson = (file) => {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
};
function decode(text) {
  const table = JSON.parse(text); const memo = new Map();
  function resolve(value) {
    if (typeof value === 'string' && /^\d+$/.test(value) && Number(value) < table.length) {
      const index = Number(value); if (memo.has(index)) return memo.get(index);
      const source = table[index]; if (source === null || typeof source !== 'object') return source;
      const output = Array.isArray(source) ? [] : {}; memo.set(index, output);
      for (const [key, child] of Object.entries(source)) output[key] = resolve(child);
      return output;
    }
    return value;
  }
  return resolve('0');
}
const expected = readJson(path.resolve(__dirname, '..', 'reports', 'p1-03-uat-result.json'));
const dbPath = path.resolve(__dirname, '..', 'n8n-system', 'n8n_data', '.n8n', 'database.sqlite');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
db.all("SELECT e.id,d.data FROM execution_entity e JOIN execution_data d ON d.executionId=e.id WHERE e.workflowId=? ORDER BY e.id DESC LIMIT 20", ['69SnDy4QxGvfTGPc'], (error, rows) => {
  if (error) throw error;
  const traces = rows.map((row) => ({ id: row.id, runData: decode(row.data).resultData?.runData || {} }));
  const results = expected.map((item) => {
    assert(item.requestId, `Missing requestId for ${item.name}; live UAT did not produce traceable evidence`);
    const trace = traces.find(({ runData }) => Object.values(runData).some((runs) => JSON.stringify(runs).includes(item.requestId)));
    assert(trace, `Execution not found for ${item.name}`);
    const sqlExecuted = Boolean(trace.runData['MS SQL Execute']);
    assert.strictEqual(sqlExecuted, item.sqlExpected, `SQL execution mismatch for ${item.name}`);
    return { name: item.name, executionId: trace.id, sqlExecuted, result: 'PASS' };
  });
  console.table(results);
  console.log(`summary=${results.length}/${results.length} pass`);
  db.close();
});
