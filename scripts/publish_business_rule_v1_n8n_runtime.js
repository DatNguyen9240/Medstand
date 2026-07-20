const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const root = path.resolve(__dirname, '..');
const databasePath = path.join(root, 'n8n-system', 'n8n_data', '.n8n', 'database.sqlite');
const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
const requestedTargetId = process.argv[3] ? String(process.argv[3]).trim() : '';

const targets = [
  {
    id: 'fCJwiyAT9r6eh1ys',
    file: path.join(root, 'n8n', 'API_Services', 'API_Execute.json'),
  },
  {
    id: 'sGPz8LMQQHVp0IiL',
    file: path.join(root, 'n8n', 'API_Services', 'API_GetConfig.json'),
  },
  {
    id: 'FRbuGdI9jz0ZZIvU',
    file: path.join(root, 'n8n', 'API_Services', 'API_ListActive.json'),
  },
  {
    id: 'mQ2X8ubexBpqD3Ru',
    file: path.join(root, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json'),
  },
];
const selectedTargets = requestedTargetId
  ? targets.filter((target) => target.id === requestedTargetId)
  : targets;

function stableJson(value) {
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function webhookContract(nodes) {
  return nodes
    .filter((node) => node.type === 'n8n-nodes-base.webhook')
    .map((node) => ({
      name: node.name,
      path: node.parameters && node.parameters.path,
      webhookId: node.webhookId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function openDatabase() {
  return new sqlite3.Database(databasePath);
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function close(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main() {
  if (!backupDir || !fs.existsSync(backupDir)) {
    throw new Error('A pre-created backup directory is required as the first argument.');
  }
  if (requestedTargetId && selectedTargets.length !== 1) {
    throw new Error(`Unknown workflow target id: ${requestedTargetId}`);
  }

  const db = openDatabase();
  let transactionStarted = false;

  try {
    const prepared = [];

    for (const target of selectedTargets) {
      const local = JSON.parse(fs.readFileSync(target.file, 'utf8'));
      const entity = await get(db, 'SELECT * FROM workflow_entity WHERE id = ?', [target.id]);
      if (!entity) throw new Error(`Workflow ${target.id} is missing from workflow_entity.`);
      if (!entity.active || !entity.activeVersionId) {
        throw new Error(`Workflow ${target.id} is not active or has no activeVersionId.`);
      }

      const history = await get(
        db,
        'SELECT * FROM workflow_history WHERE workflowId = ? AND versionId = ?',
        [target.id, entity.activeVersionId],
      );
      if (!history) throw new Error(`Active history is missing for workflow ${target.id}.`);

      const currentNodes = JSON.parse(entity.nodes);
      const currentWebhook = stableJson(webhookContract(currentNodes));
      const localWebhook = stableJson(webhookContract(local.nodes));
      if (currentWebhook !== localWebhook) {
        throw new Error(`Webhook contract changed for ${target.id}; refusing in-place publish.`);
      }

      const webhookRows = await all(
        db,
        'SELECT * FROM webhook_entity WHERE workflowId = ? ORDER BY webhookPath, method',
        [target.id],
      );

      prepared.push({
        target,
        local,
        entity,
        history,
        webhookRows,
        localNodes: stableJson(local.nodes),
        localConnections: stableJson(local.connections || {}),
        beforeNodes: stableJson(currentNodes),
        beforeConnections: stableJson(JSON.parse(entity.connections)),
      });
    }

    const snapshot = {
      createdAt: new Date().toISOString(),
      databasePath,
      workflows: prepared.map((item) => ({
        id: item.target.id,
        sourceFile: path.relative(root, item.target.file),
        entity: item.entity,
        activeHistory: item.history,
        webhooks: item.webhookRows,
      })),
    };
    fs.writeFileSync(
      path.join(backupDir, 'workflow-runtime-snapshot.json'),
      JSON.stringify(snapshot, null, 2),
      'utf8',
    );

    await run(db, 'BEGIN IMMEDIATE');
    transactionStarted = true;

    for (const item of prepared) {
      const entityUpdate = await run(
        db,
        "UPDATE workflow_entity SET nodes = ?, connections = ?, updatedAt = datetime('now') WHERE id = ? AND activeVersionId = ? AND active = 1",
        [item.localNodes, item.localConnections, item.target.id, item.entity.activeVersionId],
      );
      if (entityUpdate.changes !== 1) {
        throw new Error(`Expected one workflow_entity update for ${item.target.id}; got ${entityUpdate.changes}.`);
      }

      const historyUpdate = await run(
        db,
        "UPDATE workflow_history SET nodes = ?, connections = ?, updatedAt = datetime('now') WHERE workflowId = ? AND versionId = ?",
        [item.localNodes, item.localConnections, item.target.id, item.entity.activeVersionId],
      );
      if (historyUpdate.changes !== 1) {
        throw new Error(`Expected one workflow_history update for ${item.target.id}; got ${historyUpdate.changes}.`);
      }

      const verifiedEntity = await get(
        db,
        'SELECT nodes, connections FROM workflow_entity WHERE id = ?',
        [item.target.id],
      );
      const verifiedHistory = await get(
        db,
        'SELECT nodes, connections FROM workflow_history WHERE workflowId = ? AND versionId = ?',
        [item.target.id, item.entity.activeVersionId],
      );
      if (
        stableJson(JSON.parse(verifiedEntity.nodes)) !== item.localNodes ||
        stableJson(JSON.parse(verifiedEntity.connections)) !== item.localConnections ||
        stableJson(JSON.parse(verifiedHistory.nodes)) !== item.localNodes ||
        stableJson(JSON.parse(verifiedHistory.connections)) !== item.localConnections
      ) {
        throw new Error(`Post-update verification failed for ${item.target.id}.`);
      }
    }

    await run(db, 'COMMIT');
    transactionStarted = false;

    const result = {
      status: 'N8N_ACTIVE_VERSION_PUBLISH_PASS',
      publishedAt: new Date().toISOString(),
      backupDir,
      workflows: prepared.map((item) => ({
        id: item.target.id,
        name: item.entity.name,
        activeVersionId: item.entity.activeVersionId,
        beforeNodesSha256: sha256(item.beforeNodes),
        afterNodesSha256: sha256(item.localNodes),
        beforeConnectionsSha256: sha256(item.beforeConnections),
        afterConnectionsSha256: sha256(item.localConnections),
      })),
    };
    fs.writeFileSync(
      path.join(backupDir, 'publish-result.json'),
      JSON.stringify(result, null, 2),
      'utf8',
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (transactionStarted) {
      try {
        await run(db, 'ROLLBACK');
      } catch (rollbackError) {
        error.message += `; rollback also failed: ${rollbackError.message}`;
      }
    }
    throw error;
  } finally {
    await close(db);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
