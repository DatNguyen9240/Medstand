const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join('c:', 'MedApp', 'n8n-system', 'n8n_data', '.n8n', 'database.sqlite');

try {
  const db = new DatabaseSync(dbPath);
  const info = db.prepare('PRAGMA table_info(execution_data)').all();
  console.log('--- TABLE INFO: execution_data ---');
  info.forEach(col => console.log(`Column: ${col.name} (${col.type})`));

  console.log('\n--- EXECUTION 14806 DATA ---');
  const row = db.prepare('SELECT * FROM execution_data WHERE executionId = 14806').get();
  if (row) {
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Buffer) {
        console.log(`${k}: [Buffer of size ${v.length}]`);
        // Let's try to stringify if it's text/json
        try {
          const txt = v.toString('utf8');
          console.log(`Value: ${txt.substring(0, 1000)}`);
        } catch (e) {}
      } else {
        console.log(`${k}: ${v}`);
      }
    }
  } else {
    console.log('No data found for execution 14806.');
  }
} catch (err) {
  console.error('Error querying execution data:', err);
}
