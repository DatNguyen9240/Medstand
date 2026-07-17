const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const root = path.resolve(__dirname, '..');
const databasePath = path.join(root, 'n8n-system', 'n8n_data', '.n8n', 'database.sqlite');
const files = [
  'n8n/Shared/Shared_Auth_Guard.json',
  'n8n/API_Services/API_Execute.json',
  'n8n/API_Services/API_ListActive.json',
  'n8n/API_Services/API_GetConfig.json',
  'n8n/AI_Core/MAIN_ChatBot_V5.json',
];

const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
const all = (query, params = []) => new Promise((resolve, reject) => {
  db.all(query, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const normalize = (value) => JSON.stringify(value || {});
const differingNodeNames = (localNodes, activeNodes) => {
  const localByName = new Map((localNodes || []).map((node) => [node.name, node]));
  const activeByName = new Map((activeNodes || []).map((node) => [node.name, node]));
  return [...new Set([...localByName.keys(), ...activeByName.keys()])]
    .filter((name) => normalize(localByName.get(name)) !== normalize(activeByName.get(name)));
};

async function main() {
  const results = [];
  for (const relativePath of files) {
    const local = JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    const rows = local.id
      ? await all('SELECT * FROM workflow_entity WHERE id = ?', [local.id])
      : await all('SELECT * FROM workflow_entity WHERE name = ? ORDER BY updatedAt DESC', [local.name]);
    const entity = rows[0];
    if (!entity) {
      results.push({ file: relativePath, id: local.id || null, name: local.name, found: false });
      continue;
    }

    const historyRows = entity.activeVersionId
      ? await all('SELECT * FROM workflow_history WHERE versionId = ? AND workflowId = ?', [entity.activeVersionId, entity.id])
      : [];
    const history = historyRows[0];
    const entityNodes = JSON.parse(entity.nodes || '[]');
    const entityConnections = JSON.parse(entity.connections || '{}');
    const historyNodes = history ? JSON.parse(history.nodes || '[]') : null;
    const historyConnections = history ? JSON.parse(history.connections || '{}') : null;

    results.push({
      file: relativePath,
      id: entity.id,
      name: entity.name,
      found: true,
      active: Boolean(entity.active),
      versionId: entity.versionId,
      activeVersionId: entity.activeVersionId,
      entityMatchesLocal: normalize(entityNodes) === normalize(local.nodes)
        && normalize(entityConnections) === normalize(local.connections),
      activeVersionMatchesLocal: Boolean(history)
        && normalize(historyNodes) === normalize(local.nodes)
        && normalize(historyConnections) === normalize(local.connections),
      localNodeCount: (local.nodes || []).length,
      activeNodeCount: (historyNodes || entityNodes).length,
      differingNodes: differingNodeNames(local.nodes, historyNodes || entityNodes),
      connectionsMatch: normalize(historyConnections || entityConnections) === normalize(local.connections),
      hasIdempotencyGate: normalize(historyNodes || entityNodes).includes('AI_ReserveAPIMutation'),
      updatedAt: entity.updatedAt,
    });
  }
  console.log(JSON.stringify({ databasePath, results }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(() => db.close());
