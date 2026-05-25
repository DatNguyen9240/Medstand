const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('c:\\Git cua tui\\Medstand\\n8n-system\\n8n_data\\.n8n\\database.sqlite');

const query = db.prepare(`
  SELECT id, name, active 
  FROM workflow_entity 
  WHERE name LIKE '%Intent Parser%' OR name LIKE '%Execute API%' OR name LIKE '%MAIN_ChatBot%';
`);

const results = query.all();
console.log(JSON.stringify(results, null, 2));
db.close();
