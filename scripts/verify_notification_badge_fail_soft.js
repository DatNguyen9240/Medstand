'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const httpSource = fs.readFileSync(path.join(root, 'src/js/services/http.js'), 'utf8');
const routerSource = fs.readFileSync(path.join(root, 'src/js/core/router.js'), 'utf8');

const checks = [
  ['HTTP_RESPONSE_SUPPORTS_SILENT_OPTION', /async function _handleResponse\(res, options = \{\}\)/.test(httpSource)],
  ['APPLICATION_ERROR_ALERT_RESPECTS_SILENT', /if \(!silent\) _alert\('error', msg\);/.test(httpSource)],
  ['NETWORK_ERROR_ALERT_RESPECTS_SILENT', /if \(options\.silent !== true\) _alert\('error', msg\);/.test(httpSource)],
  ['GET_PROPAGATES_SILENT_TO_FETCH', /silent: options\.silent === true/.test(httpSource)],
  ['GET_PROPAGATES_SILENT_TO_RESPONSE_HANDLER', /_handleResponse\(res, \{[\s\S]*?silent: options\.silent === true,[\s\S]*?acceptApplicationError: options\.acceptApplicationError === true/.test(httpSource)],
  ['BADGE_REQUEST_IS_SILENT', /NOTIFICATION\.UNREAD_COUNT, \{\}, \{ cache: false, silent: true \}/.test(routerSource)],
  ['AUTH_FAILURE_REMAINS_VISIBLE', /res\.status === 401[\s\S]*?_alert\('warning'/.test(httpSource)],
  ['SESSION_EXPIRY_REMAINS_VISIBLE', /data\.code === 2[\s\S]*?_alert\('warning'/.test(httpSource)]
];

for (const [name, passed] of checks) assert.ok(passed, name);

console.log(JSON.stringify({
  Task: 'VERIFY-NOTIFICATION-BADGE-FAIL-SOFT',
  Status: 'PASS',
  Passed: checks.length,
  Failed: 0,
  Results: checks.map(([name]) => ({ Case: name, Status: 'PASS' }))
}, null, 2));
