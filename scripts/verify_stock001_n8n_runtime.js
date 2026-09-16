'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const runtimeFile = process.argv[2];
if (!runtimeFile) throw new Error('Usage: node scripts/verify_stock001_n8n_runtime.js <runtime-export.json>');

const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
const targets = [
  { id: 'mQ2X8ubexBpqD3Ru', webhook: 'hook-ai-dainao', source: 'n8n/AI_Core/MAIN_ChatBot_V5.json' },
  { id: 'fCJwiyAT9r6eh1ys', webhook: 'api-execute', source: 'n8n/API_Services/API_Execute.json' },
];

function workflowShape(workflow) {
  return {
    nodes: (workflow.nodes || []).map((node) => ({
      name: node.name,
      type: node.type,
      parameters: node.parameters || {},
      onError: node.onError || '',
      retryOnFail: Boolean(node.retryOnFail),
    })),
    connections: workflow.connections || {},
  };
}

const checks = [];
for (const target of targets) {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, target.source), 'utf8'));
  const deployed = runtime.find((workflow) => workflow.id === target.id);
  const activeForWebhook = runtime.filter((workflow) => workflow.active && (workflow.nodes || []).some(
    (node) => node.type === 'n8n-nodes-base.webhook' && node.parameters?.path === target.webhook,
  ));
  checks.push({
    WorkflowID: target.id,
    Webhook: target.webhook,
    Exists: Boolean(deployed),
    Active: Boolean(deployed?.active),
    UniqueActiveWebhook: activeForWebhook.length === 1 && activeForWebhook[0].id === target.id,
    SourceMatch: Boolean(deployed) && JSON.stringify(workflowShape(deployed)) === JSON.stringify(workflowShape(source)),
  });
}

const serializedTargets = JSON.stringify(runtime.filter((workflow) => targets.some((target) => target.id === workflow.id)));
const markerChecks = {
  NoPhysicalStockNotQueried: !serializedTargets.includes('PHYSICAL_STOCK_NOT_QUERIED'),
  NoPhysicalStockNullOverride: !serializedTargets.includes('PhysicalStock: null'),
  NoAvailableStockNullOverride: !serializedTargets.includes('AvailableStock: null'),
  SharedStockFunctionCalled: serializedTargets.includes('AI_StockAvailableByUserFnc'),
};

const pass = checks.every((check) => check.Exists && check.Active && check.UniqueActiveWebhook && check.SourceMatch)
  && Object.values(markerChecks).every(Boolean);
console.log(JSON.stringify({
  task: 'STOCK-001-N8N',
  status: pass ? 'PASS' : 'FAIL',
  workflows: checks,
  markerChecks,
}, null, 2));
if (!pass) process.exitCode = 1;
