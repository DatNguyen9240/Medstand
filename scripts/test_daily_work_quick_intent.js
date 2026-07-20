'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json'), 'utf8'));
const nodeCode = (name) => {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  assert(node, `Missing workflow node: ${name}`);
  return node.parameters.jsCode;
};

const staticData = {};
const runNormalize = new Function('$input', '$getWorkflowStaticData', nodeCode('LIB NormalizeInput'));
const normalized = runNormalize({
  first: () => ({
    json: {
      body: {
        message: 'Hôm nay em nên làm gì?',
        sessionId: 'uat-daily-work-test',
      },
    },
  }),
}, () => staticData)[0].json;

assert.equal(normalized.skipLLM, true);
assert.equal(normalized.quickIntent.intent, '@tuyen_ban_hang');
assert.deepEqual(normalized.quickIntent.params, { '@NgayTarget': '[TODAY]', '@TopN': 8 });

const runPassThrough = new Function('$input', nodeCode('Quick Intent Pass-through'));
const resolved = runPassThrough({ first: () => ({ json: normalized }) })[0].json;
const today = new Date();
const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

assert.equal(resolved.intent, '@tuyen_ban_hang');
assert.equal(resolved.params['@NgayTarget'], expectedDate);
assert.equal(resolved.params['@TopN'], 8);
console.log(`Daily-work quick intent: PASS -> @tuyen_ban_hang ${expectedDate} Top 8`);
