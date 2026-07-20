'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const root = path.resolve(__dirname, '..');
const databasePath = path.join(root, 'n8n-system', 'n8n_data', '.n8n', 'database.sqlite');
const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
const snapshotPath = path.join(backupDir, 'workflow-runtime-snapshot.json');
const allowedIds = new Set(['mQ2X8ubexBpqD3Ru', 'Gn7nDjDgGUFOWni5', '5wgkVq7UJ2GQJ9BR']);

const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) { error ? reject(error) : resolve({ changes: this.changes }); }));
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

async function main() {
  if (!backupDir || !fs.existsSync(snapshotPath)) throw new Error('Valid Shadow backup directory is required.');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (!Array.isArray(snapshot.workflows) || snapshot.workflows.length !== 3) throw new Error('Snapshot must contain exactly three workflows.');
  if (snapshot.workflows.some((entry) => !allowedIds.has(entry.id))) throw new Error('Snapshot contains an unexpected workflow id.');

  const db = new sqlite3.Database(databasePath);
  let transactionStarted = false;
  try {
    await run(db, 'BEGIN IMMEDIATE');
    transactionStarted = true;
    for (const entry of snapshot.workflows) {
      const current = await get(db, 'SELECT active, activeVersionId FROM workflow_entity WHERE id = ?', [entry.id]);
      if (!current?.active || current.activeVersionId !== entry.activeHistory.versionId) {
        throw new Error(`Active version changed for ${entry.id}; refusing automatic rollback.`);
      }
      const entityUpdate = await run(db, "UPDATE workflow_entity SET nodes = ?, connections = ?, updatedAt = datetime('now') WHERE id = ? AND activeVersionId = ? AND active = 1", [entry.entity.nodes, entry.entity.connections, entry.id, current.activeVersionId]);
      const historyUpdate = await run(db, "UPDATE workflow_history SET nodes = ?, connections = ?, updatedAt = datetime('now') WHERE workflowId = ? AND versionId = ?", [entry.activeHistory.nodes, entry.activeHistory.connections, entry.id, current.activeVersionId]);
      if (entityUpdate.changes !== 1 || historyUpdate.changes !== 1) throw new Error(`Unexpected rollback update count for ${entry.id}.`);
    }
    await run(db, 'COMMIT');
    transactionStarted = false;
    const result = { status: 'NATURAL_LANGUAGE_SHADOW_ROLLBACK_PASS', rolledBackAt: new Date().toISOString(), backupDir };
    fs.writeFileSync(path.join(backupDir, 'rollback-result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (transactionStarted) await run(db, 'ROLLBACK');
    throw error;
  } finally {
    await close(db);
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
