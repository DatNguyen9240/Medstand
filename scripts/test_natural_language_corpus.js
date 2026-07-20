'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { intentMap } = require('./lib/natural_language_contract');

const ROOT = path.resolve(__dirname, '..');
const dir = path.join(ROOT, 'tests', 'fixtures', 'natural-language-v1');
const corpusPath = path.join(dir, 'corpus.jsonl');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const raw = fs.readFileSync(corpusPath, 'utf8');
const corpus = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

assert.equal(corpus.length, 648);
assert.equal(new Set(corpus.map((entry) => entry.id)).size, 648);
assert.deepEqual(manifest.splitCounts, { development: 388, validation: 130, holdout: 130 });
assert.deepEqual(manifest.categoryCounts, {
  INTENT_VARIANTS: 240,
  NO_DIACRITIC_TYPO_ABBREVIATION: 72,
  MISSING_OR_AMBIGUOUS: 72,
  MULTI_TURN: 60,
  CONTEXT_SWITCH: 36,
  MULTI_INTENT: 36,
  OUT_OF_SCOPE_OR_MUTATION: 48,
  CASUAL_OR_ADVERSARIAL: 24,
  HIGH_RISK_MEDICAL: 60
});
assert.equal(manifest.corpusSha256, crypto.createHash('sha256').update(raw).digest('hex'));
assert(corpus.every((entry) => entry.syntheticDataOnly === true));
assert(corpus.every((entry) => ['development', 'validation', 'holdout'].includes(entry.split)));
assert(!raw.includes('HPA011') && !raw.includes('QLBH013.MED') && !raw.includes('NAMDINHB.MED'), 'corpus must not include UAT or production identities');

for (const entry of corpus) {
  const internalIntent = entry.expected.internalIntent;
  if (internalIntent && internalIntent !== 'CASUAL_CHAT') {
    assert(intentMap.intents[internalIntent], `unknown internal intent in ${entry.id}`);
    if (entry.expected.apiCode) {
      assert.equal(entry.expected.apiCode, intentMap.intents[internalIntent].apiCode, `wrong API mapping in ${entry.id}`);
    }
  }
}

console.log('NL_P0B_CORPUS_PASS total=648 development=388 validation=130 holdout=130');
