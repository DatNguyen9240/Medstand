const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const root = path.resolve(__dirname, '..');
const databasePath = path.join(root, 'n8n-system', 'n8n_data', '.n8n', 'database.sqlite');
const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
const targets = [
  { id: 'mQ2X8ubexBpqD3Ru', file: path.join(root, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json') },
  { id: 'Gn7nDjDgGUFOWni5', file: path.join(root, 'n8n', 'AI_Core', 'AI_Intent_Parser.json') },
  { id: '5wgkVq7UJ2GQJ9BR', file: path.join(root, 'n8n', 'AI_Core', 'AI_ChatCasual.json') },
];

const stableJson = (value) => JSON.stringify(value);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const webhookContract = (nodes) => nodes
  .filter((entry) => entry.type === 'n8n-nodes-base.webhook')
  .map((entry) => ({ name: entry.name, path: entry.parameters?.path, webhookId: entry.webhookId }))
  .sort((a, b) => a.name.localeCompare(b.name));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) { error ? reject(error) : resolve({ changes: this.changes }); }));
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

async function main() {
  if (!backupDir || !fs.existsSync(backupDir)) throw new Error('A pre-created backup directory is required.');
  const db = new sqlite3.Database(databasePath);
  let transactionStarted = false;
  try {
    const prepared = [];
    for (const target of targets) {
      const source = JSON.parse(fs.readFileSync(target.file, 'utf8'));
      const credentialRefs = source.nodes.flatMap((entry) => Object.entries(entry.credentials || {}).map(([type, credential]) => ({ node: entry.name, type, id: credential.id })));
      for (const credential of credentialRefs) {
        const runtimeCredential = await get(db, 'SELECT id, type FROM credentials_entity WHERE id = ?', [credential.id]);
        if (!runtimeCredential || runtimeCredential.type !== credential.type) {
          throw new Error(`Credential reference ${credential.id}/${credential.type} on ${target.id}:${credential.node} is not available in this runtime.`);
        }
      }
      const entity = await get(db, 'SELECT * FROM workflow_entity WHERE id = ?', [target.id]);
      if (!entity?.active || !entity.activeVersionId) throw new Error(`Workflow ${target.id} is not active.`);
      const history = await get(db, 'SELECT * FROM workflow_history WHERE workflowId = ? AND versionId = ?', [target.id, entity.activeVersionId]);
      if (!history) throw new Error(`Active history is missing for ${target.id}.`);
      const beforeNodes = stableJson(JSON.parse(entity.nodes));
      const beforeConnections = stableJson(JSON.parse(entity.connections));
      const afterNodes = stableJson(source.nodes);
      const afterConnections = stableJson(source.connections || {});
      if (stableJson(webhookContract(JSON.parse(entity.nodes))) !== stableJson(webhookContract(source.nodes))) {
        throw new Error(`Webhook contract changed for ${target.id}; refusing publish.`);
      }
      prepared.push({
        target, entity, history,
        webhooks: await all(db, 'SELECT * FROM webhook_entity WHERE workflowId = ? ORDER BY webhookPath, method', [target.id]),
        beforeNodes, beforeConnections, afterNodes, afterConnections,
      });
    }

    fs.writeFileSync(path.join(backupDir, 'workflow-runtime-snapshot.json'), JSON.stringify({
      createdAt: new Date().toISOString(), databasePath,
      workflows: prepared.map((item) => ({
        id: item.target.id,
        sourceFile: path.relative(root, item.target.file),
        entity: item.entity,
        activeHistory: item.history,
        webhooks: item.webhooks,
      })),
    }, null, 2));

    await run(db, 'BEGIN IMMEDIATE');
    transactionStarted = true;
    for (const item of prepared) {
      const entityUpdate = await run(db, "UPDATE workflow_entity SET nodes = ?, connections = ?, updatedAt = datetime('now') WHERE id = ? AND activeVersionId = ? AND active = 1", [item.afterNodes, item.afterConnections, item.target.id, item.entity.activeVersionId]);
      const historyUpdate = await run(db, "UPDATE workflow_history SET nodes = ?, connections = ?, updatedAt = datetime('now') WHERE workflowId = ? AND versionId = ?", [item.afterNodes, item.afterConnections, item.target.id, item.entity.activeVersionId]);
      if (entityUpdate.changes !== 1 || historyUpdate.changes !== 1) throw new Error(`Unexpected update count for ${item.target.id}.`);
      const verified = await get(db, 'SELECT nodes, connections FROM workflow_entity WHERE id = ?', [item.target.id]);
      if (stableJson(JSON.parse(verified.nodes)) !== item.afterNodes || stableJson(JSON.parse(verified.connections)) !== item.afterConnections) {
        throw new Error(`Post-update verification failed for ${item.target.id}.`);
      }
    }
    await run(db, 'COMMIT');
    transactionStarted = false;

    const result = {
      status: 'NATURAL_LANGUAGE_SHADOW_PUBLISH_PASS',
      publishedAt: new Date().toISOString(),
      naturalLanguageMode: 'SHADOW',
      backupDir,
      workflows: prepared.map((item) => ({
        id: item.target.id,
        name: item.entity.name,
        activeVersionId: item.entity.activeVersionId,
        beforeNodesSha256: sha256(item.beforeNodes),
        afterNodesSha256: sha256(item.afterNodes),
        beforeConnectionsSha256: sha256(item.beforeConnections),
        afterConnectionsSha256: sha256(item.afterConnections),
      })),
    };
    fs.writeFileSync(path.join(backupDir, 'publish-result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (transactionStarted) await run(db, 'ROLLBACK');
    throw error;
  } finally {
    await close(db);
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
