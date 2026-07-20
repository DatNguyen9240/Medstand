'use strict';

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const root = path.resolve(__dirname, '..');
const databasePath = path.join(root, 'n8n-system', 'n8n_data', '.n8n', 'database.sqlite');
const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});
const close = () => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

function references(nodesJson) {
  let nodes;
  try { nodes = JSON.parse(nodesJson); } catch (_) { return []; }
  return nodes.flatMap((node) => Object.entries(node.credentials || {}).map(([type, value]) => ({
    node: node.name,
    type,
    id: String(value?.id || ''),
  })));
}

async function main() {
  try {
    const [workflows, credentials] = await Promise.all([
      all('SELECT id, name, nodes FROM workflow_entity WHERE active = 1 ORDER BY name'),
      all('SELECT id, type FROM credentials_entity'),
    ]);
    const available = new Map(credentials.map((item) => [String(item.id), String(item.type)]));
    const invalid = [];
    const invalidSource = [];
    let referenceCount = 0;
    for (const workflow of workflows) {
      for (const reference of references(workflow.nodes)) {
        referenceCount += 1;
        const actualType = available.get(reference.id) || null;
        if (!actualType || actualType !== reference.type) {
          invalid.push({
            workflowId: workflow.id,
            workflowName: workflow.name,
            node: reference.node,
            credentialId: reference.id,
            expectedType: reference.type,
            actualType,
          });
        }
      }
    }
    const sourceDir = path.join(root, 'n8n', 'AI_Core');
    for (const fileName of fs.readdirSync(sourceDir).filter((item) => item.endsWith('.json'))) {
      const sourcePath = path.join(sourceDir, fileName);
      const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
      for (const reference of references(JSON.stringify(source.nodes || []))) {
        const actualType = available.get(reference.id) || null;
        if (!actualType || actualType !== reference.type) {
          invalidSource.push({
            sourceFile: path.relative(root, sourcePath),
            workflowName: source.name || null,
            node: reference.node,
            credentialId: reference.id,
            expectedType: reference.type,
            actualType,
          });
        }
      }
    }
    const failed = invalid.length > 0 || invalidSource.length > 0;
    const result = {
      status: failed ? 'N8N_CREDENTIAL_AUDIT_FAIL' : 'N8N_CREDENTIAL_AUDIT_PASS',
      activeWorkflowCount: workflows.length,
      credentialReferenceCount: referenceCount,
      invalidReferenceCount: invalid.length,
      invalid,
      aiCoreInvalidSourceReferenceCount: invalidSource.length,
      invalidSource,
    };
    console.log(JSON.stringify(result, null, 2));
    if (failed) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
