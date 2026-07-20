'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const corpusFile = path.join(ROOT, 'tests', 'fixtures', 'natural-language-v1', 'corpus.jsonl');
const args = process.argv.slice(2);
const predictionIndex = args.indexOf('--predictions');
const splitIndex = args.indexOf('--split');
const predictionsFile = predictionIndex >= 0 ? path.resolve(args[predictionIndex + 1] || '') : '';
const requestedSplit = splitIndex >= 0 ? args[splitIndex + 1] : 'validation';

if (!predictionsFile || !fs.existsSync(predictionsFile)) {
  console.error('RUNTIME_PENDING: provide --predictions <shadow-mode-jsonl> and optional --split development|validation|holdout');
  process.exitCode = 2;
  return;
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

const corpus = readJsonl(corpusFile).filter((entry) => entry.split === requestedSplit);
const predictions = new Map(readJsonl(predictionsFile).map((entry) => [entry.caseId, entry]));
const confusion = {};
let intentCorrect = 0;
let entityCorrect = 0;
let decisionCorrect = 0;
let wrongApi = 0;
let missingPrediction = 0;
let clarificationCount = 0;
let noCallCount = 0;
const latencies = [];

for (const testCase of corpus) {
  const prediction = predictions.get(testCase.id);
  if (!prediction) { missingPrediction += 1; continue; }
  const expectedIntent = testCase.expected.internalIntent || 'NONE';
  const actualIntent = prediction.internalIntent || 'NONE';
  confusion[expectedIntent] ||= {};
  confusion[expectedIntent][actualIntent] = (confusion[expectedIntent][actualIntent] || 0) + 1;
  if (expectedIntent === actualIntent) intentCorrect += 1;
  if (JSON.stringify(testCase.expected.entities || {}) === JSON.stringify(prediction.entities || {})) entityCorrect += 1;
  if (testCase.expected.decision === prediction.decision) decisionCorrect += 1;
  if ((prediction.apiCode || null) !== (testCase.expected.apiCode || null)) wrongApi += 1;
  if (prediction.decision === 'CLARIFY' || prediction.decision === 'MULTI_INTENT_CLARIFY') clarificationCount += 1;
  if (!prediction.apiCode) noCallCount += 1;
  if (Number.isFinite(Number(prediction.latencyMs))) latencies.push(Number(prediction.latencyMs));
}

latencies.sort((a, b) => a - b);
const percentile = (value) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(value * latencies.length) - 1)] : null;
const measured = corpus.length - missingPrediction;
const ratio = (value) => measured ? Number((value / measured).toFixed(6)) : null;
const report = {
  status: missingPrediction ? 'INCOMPLETE_PREDICTIONS' : 'MEASURED',
  corpusVersion: 'NL-CORPUS-V1',
  split: requestedSplit,
  expectedCases: corpus.length,
  measuredCases: measured,
  missingPrediction,
  metrics: {
    intentAccuracy: ratio(intentCorrect),
    entityExactMatch: ratio(entityCorrect),
    decisionAccuracy: ratio(decisionCorrect),
    wrongApiRate: ratio(wrongApi),
    clarificationRate: ratio(clarificationCount),
    noCallRate: ratio(noCallCount),
    latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) }
  },
  confusionMatrix: confusion
};
console.log(JSON.stringify(report, null, 2));
if (missingPrediction) process.exitCode = 1;
