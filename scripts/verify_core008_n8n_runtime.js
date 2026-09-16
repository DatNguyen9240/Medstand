'use strict';

/* Compare the exported CORE-008 API_Execute runtime with the workspace source. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const runtimePath = process.argv[2];
if (!runtimePath) throw new Error('Usage: node scripts/verify_core008_n8n_runtime.js <runtime-export.json>');

const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n/API_Services/API_Execute.json'), 'utf8'));
const rawRuntime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
const runtimeList = Array.isArray(rawRuntime) ? rawRuntime : [rawRuntime];
const runtime = runtimeList.find((workflow) => workflow.id === 'fCJwiyAT9r6eh1ys');

function shape(workflow) {
  return {
    nodes: (workflow?.nodes || []).map((node) => ({
      name: node.name,
      type: node.type,
      parameters: node.parameters || {},
      onError: node.onError || '',
      retryOnFail: Boolean(node.retryOnFail),
    })),
    connections: workflow?.connections || {},
  };
}

const serialized = JSON.stringify(runtime || {});
const checks = {
  Exists: Boolean(runtime),
  Active: Boolean(runtime?.active),
  SourceMatch: Boolean(runtime) && JSON.stringify(shape(runtime)) === JSON.stringify(shape(source)),
  NoProductDraftFallback: !serialized.includes("'@goi_ydon_hang': 'BR-SALES-V1-DRAFT'"),
  NoRouteDraftFallback: !serialized.includes("'@tuyen_ban_hang': 'BR-ROUTE-V1-DRAFT'"),
  UsesRuleSourceCodes: serialized.includes("['RuleSourceCodes', 'DataSource'"),
  UsesRuleSourceLabel: serialized.includes("['RuleSourceLabel', 'sourceLabel']"),
  UsesCalculatedAt: serialized.includes("['CalculatedAt', 'calculatedAt']"),
};
const pass = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  Task: 'CORE-008-N8N',
  Status: pass ? 'PASS' : 'FAIL',
  WorkflowID: runtime?.id || null,
  WorkflowName: runtime?.name || null,
  Checks: checks,
}, null, 2));
if (!pass) process.exitCode = 1;
