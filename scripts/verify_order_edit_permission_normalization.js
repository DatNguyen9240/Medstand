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
const orderDetailSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'js', 'pages', 'order-detail.js'), 'utf8');
const orderServiceSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'js', 'services', 'order.service.js'), 'utf8');
const httpSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'js', 'services', 'http.js'), 'utf8');
assert.match(editOrderSource, /MedstandOrderPermission\.isGranted\(editCtx\.CanEdit\)/,
  'edit-order page must use the shared fail-closed normalizer');
results.push({ Case: 'EDIT_ORDER_USES_SHARED_NORMALIZER', Status: 'PASS' });

for (const flag of ['CanSubmit', 'CanCancel', 'CanApprove', 'CanReject', 'HasApprovalRole']) {
  assert.match(orderDetailSource, new RegExp(`MedstandOrderPermission\\.isGranted\\(ctx\\.${flag}\\)`),
    `order-detail must normalize ${flag}`);
  results.push({ Case: `ORDER_DETAIL_NORMALIZES_${flag.toUpperCase()}`, Status: 'PASS' });
}

assert.match(orderServiceSource, /getEditContext[\s\S]*?acceptApplicationError:\s*true/,
  'edit context service must preserve the denied business envelope');
assert.match(httpSource, /options\.acceptApplicationError\s*!==\s*true/,
  'HTTP must reject application errors unless a caller explicitly accepts the envelope');
results.push({ Case: 'EDIT_CONTEXT_PRESERVES_DENIED_ENVELOPE', Status: 'PASS' });
results.push({ Case: 'OTHER_APPLICATION_ERRORS_REMAIN_FAIL_CLOSED', Status: 'PASS' });

assert.match(editOrderSource, /ObjectID:\s+customer\.ObjectID\s+\|\|\s+p0\.ObjectID/,
  'edit-order must preserve the order customer for an authorized manager outside the customer suggestion scope');
assert.match(editOrderSource, /ObjectName:\s+customer\.ObjectName\s+\|\|\s+p0\.ObjectName/,
  'edit-order must preserve the customer label from the order detail response');
results.push({ Case: 'MANAGER_EDIT_PRESERVES_ORDER_CUSTOMER_ID', Status: 'PASS' });
results.push({ Case: 'MANAGER_EDIT_PRESERVES_ORDER_CUSTOMER_LABEL', Status: 'PASS' });

assert.match(editOrderSource, /orderForm\.setListValue\('customer', summary\.ObjectID, summary\.ObjectName \|\| summary\.ObjectID\)/,
  'edit-order must synchronously prefill the current customer before scoped option loading settles');
assert.match(editOrderSource, /orderForm\.setListValue\('route', summary\.ThuTrongTuan, summary\.ThuTrongTuan\)/,
  'edit-order must synchronously preserve the current route');
results.push({ Case: 'MANAGER_EDIT_PREFILLS_CURRENT_CUSTOMER', Status: 'PASS' });
results.push({ Case: 'MANAGER_EDIT_PREFILLS_CURRENT_ROUTE', Status: 'PASS' });

console.log(JSON.stringify({
  Task: 'VERIFY-ORDER-EDIT-PERMISSION-NORMALIZATION',
  Status: 'PASS',
  Passed: results.length,
  Failed: 0,
  Results: results
}, null, 2));
