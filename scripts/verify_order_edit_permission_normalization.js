'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const permission = require('../src/js/utils/order-permission');

const cases = [
  { name: 'STRING_ONE_GRANTED', value: '1', expected: true },
  { name: 'NUMBER_ONE_GRANTED', value: 1, expected: true },
  { name: 'BOOLEAN_TRUE_GRANTED', value: true, expected: true },
  { name: 'STRING_ZERO_DENIED', value: '0', expected: false },
  { name: 'NUMBER_ZERO_DENIED', value: 0, expected: false },
  { name: 'BOOLEAN_FALSE_DENIED', value: false, expected: false },
  { name: 'NULL_DENIED', value: null, expected: false },
  { name: 'UNKNOWN_VALUE_DENIED', value: 'yes', expected: false }
];

const results = cases.map(testCase => {
  const actual = permission.isGranted(testCase.value);
  assert.strictEqual(actual, testCase.expected, testCase.name);
  return { Case: testCase.name, Status: 'PASS' };
});

const editOrderSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'js', 'pages', 'edit-order.js'), 'utf8');
assert.match(editOrderSource, /MedstandOrderPermission\.isGranted\(editCtx\.CanEdit\)/,
  'edit-order page must use the shared fail-closed normalizer');
results.push({ Case: 'EDIT_ORDER_USES_SHARED_NORMALIZER', Status: 'PASS' });

console.log(JSON.stringify({
  Task: 'VERIFY-ORDER-EDIT-PERMISSION-NORMALIZATION',
  Status: 'PASS',
  Passed: results.length,
  Failed: 0,
  Results: results
}, null, 2));
