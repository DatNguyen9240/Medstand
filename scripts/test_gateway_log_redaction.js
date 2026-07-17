'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

assert(!source.includes("Request headers:', JSON.stringify(headers)"), 'Gateway must not log header values.');
assert(!source.includes("Request body:', JSON.stringify(body)"), 'Gateway must not log request body values.');
assert(!source.includes('Response text snippet:'), 'Gateway must not log response payload snippets.');
assert(source.includes('Request metadata: headers='), 'Gateway should retain non-sensitive request metadata.');
assert(source.includes('Response bytes:'), 'Gateway should retain non-sensitive response size metadata.');

console.log('Gateway sensitive log redaction checks passed.');
